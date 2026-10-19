import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { InteractionServer } from '../src/http/InteractionServer.js';

test('HTTP verifies exact raw bodies, signatures, timestamps and application identity', async t => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const hex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  let calls = 0;
  const commands = { handle: async () => { calls++; return { type: 4, data: { content: 'ok', flags: 64 } }; } };
  const server = new InteractionServer(hex, commands, '123');
  await server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.server.address().port}/discord/interactions`;
  const health = await fetch(url.replace('/interactions', '/health'));
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const banner = await fetch(url.replace('/interactions', '/banner.png'));
  assert.equal(banner.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await banner.arrayBuffer()).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  for (const path of ['.env', 'src/http/InteractionServer.js', 'data/bot.sqlite', 'backups', 'package.json']) {
    const privateFile = await fetch(url.replace('/interactions', `/${path}`));
    assert.equal(privateFile.status, 404);
    assert.deepEqual(await privateFile.json(), { error: 'Not found' });
  }
  const post = (body, { timestamp = String(Math.floor(Date.now() / 1000)), tamper = false, unsigned = false } = {}) => {
    const text = JSON.stringify(body);
    const signature = sign(null, Buffer.from(timestamp + text), privateKey).toString('hex');
    return fetch(url, { method: 'POST', headers: unsigned ? {} : { 'x-signature-timestamp': timestamp, 'x-signature-ed25519': signature }, body: tamper ? text + ' ' : text });
  };
  const ping = await post({ type: 1 });
  assert.equal(ping.status, 200); assert.deepEqual(await ping.json(), { type: 1 });
  assert.equal((await post({ type: 1 }, { unsigned: true })).status, 401);
  assert.equal((await post({ type: 1 }, { tamper: true })).status, 401);
  assert.equal((await post({ type: 1 }, { timestamp: '1' })).status, 401);
  assert.equal((await post(null)).status, 400);
  assert.equal((await post({ type: 1, padding: 'x'.repeat(65536) })).status, 413);
  const interaction = { type: 2, id: '456', application_id: '123', token: 'test-token' };
  assert.equal((await post({ ...interaction, application_id: '999' })).status, 400);
  assert.equal((await post(interaction)).status, 200);
  assert.equal((await post(interaction)).status, 200);
  assert.equal(calls, 1);
});

test('deferred reset acknowledges privately before work and sends its completion once', async t => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const hex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  let release;
  const completion = new Promise(resolve => { release = resolve; });
  let count = 0;
  const commands = { handle: async () => ({ response: { type: 5, data: { flags: 64 } }, complete: async () => {
    count++;
    await completion;
    return { content: 'Reset completed', allowed_mentions: { parse: [] } };
  } }) };
  const server = new InteractionServer(hex, commands, '123');
  let delivered;
  const finished = new Promise(resolve => {
    server.followUp = async (_interaction, data) => { delivered = data; resolve(); };
  });
  await server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  const body = JSON.stringify({ type: 2, id: '456', application_id: '123', token: 'test-token' });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = { 'x-signature-timestamp': timestamp, 'x-signature-ed25519': sign(null, Buffer.from(timestamp + body), privateKey).toString('hex') };
  const url = `http://127.0.0.1:${server.server.address().port}/discord/interactions`;
  const response = await fetch(url, { method: 'POST', headers, body });
  assert.deepEqual(await response.json(), { type: 5, data: { flags: 64 } });
  await fetch(url, { method: 'POST', headers, body });
  assert.equal(count, 1);
  release();
  await finished;
  assert.equal(delivered.content, 'Reset completed');
});

test('multi-part reports acknowledge first, send every private part once and respect rate limits', async t => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const hex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const commands = { handle: async () => ({
    response: { type: 4, data: { content: 'Part 1', flags: 64 } },
    followUps: [{ content: 'Part 2' }, { content: 'Part 3' }],
  }) };
  const server = new InteractionServer(hex, commands, '123');
  const originalFetch = globalThis.fetch;
  const deliveries = [];
  let attempts = 0, finish;
  const finished = new Promise(resolve => { finish = resolve; });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).startsWith('https://discord.com/api/')) return originalFetch(url, options);
    attempts++;
    if (attempts === 1) return new Response(JSON.stringify({ retry_after: 0 }), { status: 429 });
    assert.equal(options.method, 'POST');
    assert.match(String(url), /\?wait=true$/);
    const data = JSON.parse(options.body);
    assert.equal(data.flags, 64);
    assert.deepEqual(data.allowed_mentions, { parse: [] });
    deliveries.push(data.content);
    if (deliveries.length === 2) finish();
    return new Response('{}', { status: 200 });
  });
  await server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  const body = JSON.stringify({ type: 2, id: 'multi', application_id: '123', token: 'test-token' });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = { 'x-signature-timestamp': timestamp, 'x-signature-ed25519': sign(null, Buffer.from(timestamp + body), privateKey).toString('hex') };
  const url = `http://127.0.0.1:${server.server.address().port}/discord/interactions`;
  const response = await fetch(url, { method: 'POST', headers, body });
  assert.deepEqual(await response.json(), { type: 4, data: { content: 'Part 1', flags: 64 } });
  await fetch(url, { method: 'POST', headers, body });
  await finished;
  assert.deepEqual(deliveries, ['Part 2', 'Part 3']);
  assert.equal(attempts, 3);
});


test('fast private reports finish in the initial callback regardless of channel and are deduplicated', async t => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const hex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  let completed = 0, patched = 0;
  const commands = { handle: async () => ({ eagerReport: true, response: { type: 5, data: { flags: 64 } }, complete: async () => {
    completed++; return { content: 'Global guild roster', allowed_mentions: { parse: [] } };
  } }) };
  const server = new InteractionServer(hex, commands, '123');
  server.followUp = async () => { patched++; };
  await server.listen(0, '127.0.0.1'); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.server.address().port}/discord/botyslaw-smith/interactions`;
  for (const channel of ['public-channel', 'restricted-channel']) {
    const body = JSON.stringify({ type: 2, id: channel, channel_id: channel, application_id: '123', token: 'test-token' });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = { 'x-signature-timestamp': timestamp, 'x-signature-ed25519': sign(null, Buffer.from(timestamp + body), privateKey).toString('hex') };
    for (let repeat = 0; repeat < 2; repeat++) {
      const response = await fetch(url, { method: 'POST', headers, body });
      assert.deepEqual(await response.json(), { type: 4, data: { content: 'Global guild roster', flags: 64, allowed_mentions: { parse: [] } } });
    }
  }
  assert.equal(completed, 2); assert.equal(patched, 0);
});


test('slow read-only reports acknowledge before completion and preserve a single work request', async () => {
  const { publicKey } = generateKeyPairSync('ed25519');
  const hex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const server = new InteractionServer(hex, {}, '123');
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const prepared = await server.prepareResult({ eagerReport: true, response: { type: 5, data: { flags: 64 } }, complete: async () => {
    calls++; await gate; return { content: 'Finished' };
  } });
  assert.equal(prepared.response.type, 5); assert.equal(prepared.response.data.flags, 64);
  release(); assert.equal((await prepared.complete()).content, 'Finished'); assert.equal(calls, 1);
});
