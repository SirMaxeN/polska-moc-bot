import { createServer } from 'node:http';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';

export class InteractionServer {
  constructor(publicKey, commands, applicationId) {
    if (!/^[a-f\d]{64}$/i.test(publicKey ?? '')) throw new Error('DISCORD_PUBLIC_KEY must contain 64 hexadecimal characters.');
    this.key = createPublicKey({ key: Buffer.from(`302a300506032b6570032100${publicKey}`, 'hex'), format: 'der', type: 'spki' });
    this.commands = commands;
    this.applicationId = applicationId;
    this.pending = new Map();
    try {
      const release = JSON.parse(readFileSync(new URL('../../config/release.json', import.meta.url), 'utf8')).release;
      this.release = /^release-[a-zA-Z0-9]+$/.test(release) ? release : null;
    } catch { this.release = null; }
    this.banner = readFileSync(new URL('../../assets/bot-banner.png', import.meta.url));
    this.server = createServer({ maxHeaderSize: 8192 }, (request, response) => this.receive(request, response));
    this.server.requestTimeout = 10000;
    this.server.headersTimeout = 10000;
    this.server.setTimeout(10000, socket => socket.destroy());
    this.server.maxRequestsPerSocket = 100;
  }

  send(response, status, body) {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    response.end(JSON.stringify(body));
  }

  async receive(request, response) {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && ['/banner.png', '/discord/banner.png', '/discord/botyslaw-smith/banner.png'].includes(path)) {
        response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': this.banner.length, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        return response.end(this.banner);
      }
      if (request.method === 'GET' && ['/health', '/discord/health', '/discord/botyslaw-smith/health'].includes(path)) return this.send(response, 200, { status: 'ok', ...(this.release ? { release: this.release } : {}) });
      // Some shared-hosting proxies strip the application URL prefix.
      if (request.method !== 'POST' || !['/discord/botyslaw-smith/interactions', '/discord/interactions', '/interactions', '/'].includes(path)) return this.send(response, 404, { error: 'Not found' });
      const signature = request.headers['x-signature-ed25519'];
      const timestamp = request.headers['x-signature-timestamp'];
      if (typeof signature !== 'string' || !/^[a-f\d]{128}$/i.test(signature) || typeof timestamp !== 'string' || !/^\d+$/.test(timestamp)) return this.send(response, 401, { error: 'Invalid signature' });
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return this.send(response, 401, { error: 'Expired request' });
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) return this.send(response, 413, { error: 'Request too large' });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!verify(null, Buffer.concat([Buffer.from(timestamp), body]), this.key, Buffer.from(signature, 'hex'))) return this.send(response, 401, { error: 'Invalid signature' });
      let interaction;
      try { interaction = JSON.parse(body.toString('utf8')); } catch { return this.send(response, 400, { error: 'Invalid JSON' }); }
      if (!interaction || typeof interaction !== 'object' || Array.isArray(interaction)) return this.send(response, 400, { error: 'Invalid interaction' });
      if (interaction.type === 1) return this.send(response, 200, { type: 1 });
      if (String(interaction.application_id) !== this.applicationId || !interaction.id || !interaction.token) return this.send(response, 400, { error: 'Invalid interaction' });
      for (const [id, entry] of this.pending) if (entry.expires < Date.now()) this.pending.delete(id);
      if (this.pending.has(interaction.id)) return this.send(response, 200, await this.pending.get(interaction.id).response);
      if (this.pending.size >= 10000) return this.send(response, 503, { error: 'Temporarily busy' });
      const resultPromise = this.commands.handle(interaction).then(result => this.prepareResult(result));
      const responsePromise = resultPromise.then(result => result.response ?? result);
      // The response cache must never retain an unhandled rejected promise.
      responsePromise.catch(() => this.pending.delete(interaction.id));
      this.pending.set(interaction.id, { response: responsePromise, expires: Date.now() + 900000 });
      const result = await resultPromise;
      this.send(response, 200, result.response ?? result);
      if (result.followUps) {
        try {
          for (const message of result.followUps) await this.sendAdditional(interaction, message);
        } catch (error) {
          console.error('Additional report delivery failed:', error.code ?? error.name);
          await this.followUp(interaction, { content: 'Nie udało się wysłać wszystkich części raportu. Wywołaj raport ponownie.', allowed_mentions: { parse: [] } }).catch(() => {});
        }
      }
      if (result.complete) {
        try {
          const { additionalMessages = [], ...first } = await result.complete();
          await this.followUp(interaction, first);
          for (const message of additionalMessages) await this.sendAdditional(interaction, message);
        }
        catch (error) {
          console.error('Deferred interaction failed:', error.code ?? error.name);
          await this.followUp(interaction, { content: 'Nie udało się zakończyć operacji. Spróbuj ponownie.', allowed_mentions: { parse: [] } }).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Interaction processing failed:', error.code ?? error.name);
      if (!response.headersSent) this.send(response, 500, { error: 'Internal error' });
    }
  }

  async prepareResult(result) {
    if (!result.eagerReport || !result.complete) return result;
    // Finish fast read-only reports in the callback; slow reports still acknowledge promptly.
    const work = Promise.resolve().then(() => result.complete()).then(data => ({ data }), () => ({ error: true }));
    let timer;
    const ready = await Promise.race([work, new Promise(resolve => { timer = setTimeout(() => resolve(null), 1000); })]);
    clearTimeout(timer);
    const failure = { content: 'Nie udało się pobrać raportu. Spróbuj ponownie.', allowed_mentions: { parse: [] } };
    if (!ready) return { ...result, complete: async () => {
      const completed = await work;
      return completed.error ? failure : completed.data;
    } };
    const { additionalMessages = [], ...first } = ready.error ? failure : ready.data;
    return { response: { type: 4, data: { ...first, flags: 64, allowed_mentions: { parse: [] } } }, followUps: additionalMessages };
  }

  async sendAdditional(interaction, data) {
    const url = `https://discord.com/api/v10/webhooks/${this.applicationId}/${interaction.token}?wait=true`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, flags: 64, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(10000),
      });
      if (result.ok) return;
      if (result.status !== 429 || attempt === 2) throw new Error('Additional report delivery failed.');
      const retry = Number((await result.json()).retry_after);
      if (!Number.isFinite(retry) || retry < 0 || retry > 30) throw new Error('Invalid retry delay.');
      await new Promise(resolve => setTimeout(resolve, Math.ceil(retry * 1000) + 100));
    }
  }

  async followUp(interaction, data) {
    const result = await fetch(`https://discord.com/api/v10/webhooks/${this.applicationId}/${interaction.token}/messages/@original`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) throw new Error('Deferred response failed.');
  }

  listen(port, host = '0.0.0.0') {
    return new Promise(resolve => this.server.listen(port, host, resolve));
  }
  close() { return new Promise((resolve, reject) => this.server.close(error => error ? reject(error) : resolve())); }
}
