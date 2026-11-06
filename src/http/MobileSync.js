import { WarLists } from './WarLists.js';
import { ClanRankings } from './ClanRankings.js';
import { createHash, randomBytes } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const pairingAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const fields = ['skill_tickets', 'mount_keys', 'hammers', 'pets', 'mounts', 'skill_cost_x5', 'mount_cost'];

export class MobileError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Device credentials are scoped to one Discord member and guild; only hashes are persisted. */
export class MobileSync {
  constructor(database, scoring, { clock = () => Date.now() } = {}) {
    this.database = database;
    this.scoring = scoring;
    this.clock = clock;
    this.warLists = new WarLists(database,clock);
    this.clanRankings = new ClanRankings(database,clock);
    this.limits = new Map();
    database.db.exec(`
      CREATE TABLE IF NOT EXISTS mobile_pairings(hash TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS mobile_devices(hash TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS mobile_requests(device TEXT NOT NULL,id TEXT NOT NULL,response TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(device,id));
    `);
  }

  prune() {
    const now = this.clock();
    for (const table of ['mobile_pairings', 'mobile_devices', 'mobile_requests']) this.database.db.prepare(`DELETE FROM ${table} WHERE expires<=?`).run(now);
  }

  code(guildId, userId, name) {
    this.prune();
    let code;
    this.database.transaction(() => {
      // 32 symbols divide 256 exactly: six uniformly random characters, without modulo bias.
      for (let attempt = 0; attempt < 16; attempt++) {
        code = [...randomBytes(6)].map(value => pairingAlphabet[value & 31]).join('');
        if (!this.database.db.prepare('SELECT 1 FROM mobile_pairings WHERE hash=?').get(digest(code))) break;
        code = null;
      }
      if (!code) throw new MobileError(503, 'Spróbuj wygenerować kod ponownie.');
      this.database.db.prepare('DELETE FROM mobile_pairings WHERE guild_id=? AND user_id=?').run(guildId, userId);
      this.database.db.prepare('INSERT INTO mobile_pairings VALUES(?,?,?,?,?)').run(digest(code), guildId, userId, name, this.clock() + 600000);
    });
    return code;
  }

  revoke(guildId, userId) {
    this.database.transaction(() => {
      this.database.db.prepare('DELETE FROM mobile_requests WHERE device IN (SELECT hash FROM mobile_devices WHERE guild_id=? AND user_id=?)').run(guildId, userId);
      for (const table of ['mobile_devices', 'mobile_pairings']) this.database.db.prepare(`DELETE FROM ${table} WHERE guild_id=? AND user_id=?`).run(guildId, userId);
    });
  }

  rateLimit(address, route) {
    const now = this.clock();
    for (const [key, value] of this.limits) if (value.until <= now) this.limits.delete(key);
    const key = `${address}:${route}`;
    if (!this.limits.has(key)) {
      if (this.limits.size >= 4096) throw new MobileError(429, 'Spróbuj ponownie za chwilę.');
      this.limits.set(key, { count: 0, until: now + 60000 });
    }
    if (++this.limits.get(key).count > (route === 'pair' ? 10 : 60)) throw new MobileError(429, 'Za dużo prób. Poczekaj minutę.');
  }

  pair(body) {
    if (!body || Object.keys(body).length !== 1 || typeof body.code !== 'string' || !/^(?:[A-HJ-NP-Za-hj-np-z2-9]{6}|[A-Fa-f0-9]{32})$/.test(body.code)) throw new MobileError(400, 'Nieprawidłowy kod połączenia.');
    this.prune();
    const token = randomBytes(32).toString('base64url');
    const expires = this.clock() + 90 * 86400000;
    const account = this.database.transaction(() => {
      const row = this.database.db.prepare('SELECT * FROM mobile_pairings WHERE hash=? AND expires>?').get(digest(body.code.toUpperCase()), this.clock());
      if (!row) throw new MobileError(401, 'Kod wygasł albo został już użyty. Wygeneruj nowy przez /mobile pair.');
      this.database.db.prepare('DELETE FROM mobile_pairings WHERE hash=?').run(row.hash);
      // One active device per account. Pairing again revokes the old device.
      this.database.db.prepare('DELETE FROM mobile_devices WHERE guild_id=? AND user_id=?').run(row.guild_id, row.user_id);
      this.database.db.prepare('INSERT INTO mobile_devices VALUES(?,?,?,?,?)').run(digest(token), row.guild_id, row.user_id, row.name, expires);
      return row;
    });
    return { token, name: account.name, expires_at: new Date(expires).toISOString() };
  }

  authenticate(authorization) {
    if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) throw new MobileError(401, 'Połącz telefon z Discordem ponownie.');
    const device = this.database.db.prepare('SELECT * FROM mobile_devices WHERE hash=? AND expires>?').get(digest(authorization.slice(7)), this.clock());
    if (!device) throw new MobileError(401, 'Połączenie wygasło lub zostało cofnięte.');
    return device;
  }

  update(authorization, body) {
    const device = this.authenticate(authorization);
    if (!body || Object.keys(body).sort().join(',') !== 'observed_at,request_id,values' ||
        typeof body.request_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.request_id) ||
        typeof body.observed_at !== 'string' || !Number.isFinite(Date.parse(body.observed_at)) ||
        Math.abs(this.clock() - Date.parse(body.observed_at)) > 30 * 60000) throw new MobileError(400, 'Skan jest nieprawidłowy lub ma ponad 30 minut.');
    const values = body.values;
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).sort().join(',') !== [...fields].sort().join(',')) throw new MobileError(400, 'Wymagane jest siedem wartości zasobów i kosztów.');
    for (const key of fields) if (!Number.isSafeInteger(values[key]) || values[key] < 0 || values[key] > 9_000_000_000_000 ||
      (['skill_cost_x5', 'mount_cost'].includes(key) && values[key] === 0)) throw new MobileError(400, 'Nieprawidłowa wartość zasobu lub kosztu.');
    const previous = this.database.db.prepare('SELECT response FROM mobile_requests WHERE device=? AND id=? AND expires>?').get(device.hash, body.request_id, this.clock());
    if (previous) return JSON.parse(previous.response);
    const now = new Date(this.clock());
    const snapshot = this.database.snapshot(device.guild_id, now);
    try { this.scoring.player(values, snapshot.tech); }
    catch { throw new MobileError(400, 'Wartości przekraczają obsługiwany zakres punktów.'); }
    const result = { status: 'saved', name: device.name, updated_at: now.toISOString() };
    try {
      this.database.update(device.guild_id, device.user_id, device.name, values, now, () => {
        this.authenticate(authorization);
        this.database.db.prepare('INSERT INTO mobile_requests VALUES(?,?,?,?)').run(device.hash, body.request_id, JSON.stringify(result), this.clock() + 86400000);
      });
    } catch (error) {
      const concurrent = this.database.db.prepare('SELECT response FROM mobile_requests WHERE device=? AND id=? AND expires>?').get(device.hash, body.request_id, this.clock());
      if (concurrent) return JSON.parse(concurrent.response);
      throw error;
    }
    this.prune();
    return result;
  }

  async receive(request, response, path, send) {
    const match = path.match(/^(?:\/discord\/botyslaw-smith)?\/mobile\/(pair|resources|war-status|war-list|war-test|clan-ranking)$/);
    if (!match) return false;
    try {
      if (request.method !== 'POST') throw new MobileError(405, 'Method not allowed');
      this.rateLimit(request.socket.remoteAddress, match[1]);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new MobileError(415, 'JSON required');
      if (match[1] !== 'pair') this.authenticate(request.headers.authorization);
      const chunks = []; let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > (['war-list','war-test','clan-ranking'].includes(match[1]) ? 2*1024*1024 : 4096)) throw new MobileError(413, 'Request too large');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new MobileError(400, 'Invalid JSON'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MobileError(400, 'Invalid JSON object');
      let result;
      if(match[1].startsWith('war-')) {const device=this.authenticate(request.headers.authorization);try {result=match[1]==='war-status'?this.warLists.status(device):this.warLists.save(device,body,match[1]==='war-test');}catch(e){throw new MobileError(409,e.message);}}
      if(match[1]==='clan-ranking') {const device=this.authenticate(request.headers.authorization);try {result=this.clanRankings.save(device,body);}catch(e){throw new MobileError(409,e.message);}}
      else result = match[1] === 'pair' ? this.pair(body) : this.update(request.headers.authorization, body);
      send(response, 200, result);
    } catch (error) {
      send(response, error instanceof MobileError ? error.status : 500, { error: error instanceof MobileError ? error.message : 'Nie udało się zapisać danych.' });
    }
    return true;
  }
}
