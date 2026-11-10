import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Technology } from '../domain/Technology.js';
import { ClanTech } from '../domain/ClanTech.js';
import { UserInputError } from '../domain/UserInputError.js';

export class Database {
  constructor(path, calendar, backupDirectory = './backups') {
    this.calendar = calendar;
    this.backupDirectory = resolve(backupDirectory);
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:' && process.platform !== 'win32') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, cycle TEXT NOT NULL, season INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS players (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL,
        skill_cost_x5 INTEGER, mount_cost INTEGER, PRIMARY KEY(guild_id,user_id));
      CREATE TABLE IF NOT EXISTS resources (guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        skill_tickets INTEGER NOT NULL DEFAULT 0, mount_keys INTEGER NOT NULL DEFAULT 0,
        hammers INTEGER NOT NULL DEFAULT 0, pets INTEGER NOT NULL DEFAULT 0, mounts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
        PRIMARY KEY(guild_id,user_id));
      CREATE TABLE IF NOT EXISTS tech (guild_id TEXT NOT NULL, key TEXT NOT NULL, value INTEGER NOT NULL,
        PRIMARY KEY(guild_id,key));
      CREATE TABLE IF NOT EXISTS reset_events (guild_id TEXT NOT NULL, kind TEXT NOT NULL,
        event_id TEXT NOT NULL, actor TEXT, created_at TEXT NOT NULL,
        PRIMARY KEY(guild_id,kind,event_id));
      CREATE TABLE IF NOT EXISTS ping_settings (guild_id TEXT PRIMARY KEY, roles TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS participation_settings (guild_id TEXT PRIMARY KEY, roles TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ascension_settings (guild_id TEXT NOT NULL, type TEXT NOT NULL, roles TEXT NOT NULL, PRIMARY KEY(guild_id, type));
      CREATE TABLE IF NOT EXISTS management_settings (guild_id TEXT PRIMARY KEY, roles TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ping_events (guild_id TEXT PRIMARY KEY, sent_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ping_targets (guild_id TEXT PRIMARY KEY, kind TEXT NOT NULL, role_id TEXT);
      CREATE TABLE IF NOT EXISTS reminder_settings (guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reminder_jobs (guild_id TEXT NOT NULL, cycle TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
        claim TEXT, message_id TEXT, sent_at TEXT, PRIMARY KEY(guild_id,cycle));`);
    if (!this.db.prepare('PRAGMA table_info(reminder_jobs)').all().some(column => column.name === 'sent_at')) {
      this.db.exec('ALTER TABLE reminder_jobs ADD COLUMN sent_at TEXT');
    }
    if (!this.db.prepare('PRAGMA table_info(players)').all().some(column => column.name === 'mount_cost')) {
      // Snapshot the old schema and data before the first additive migration.
      mkdirSync(this.backupDirectory, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32') chmodSync(this.backupDirectory, 0o700);
      const snapshot = resolve(this.backupDirectory, `before-mount-cost-${Date.now()}-${randomUUID()}.sqlite`);
      this.db.prepare('VACUUM INTO ?').run(snapshot);
      if (process.platform !== 'win32') chmodSync(snapshot, 0o600);
      this.transaction(() => {
        if (!this.db.prepare('PRAGMA table_info(players)').all().some(column => column.name === 'mount_cost')) {
          this.db.exec('ALTER TABLE players ADD COLUMN mount_cost INTEGER');
        }
      });
    }
    if (!this.db.prepare('PRAGMA table_info(resources)').all().some(column => column.name === 'mounts')) {
      mkdirSync(this.backupDirectory, { recursive: true, mode: 0o700 });
      const snapshot = resolve(this.backupDirectory, `before-owned-mounts-${Date.now()}-${randomUUID()}.sqlite`);
      this.db.prepare('VACUUM INTO ?').run(snapshot);
      if (process.platform !== 'win32') { chmodSync(this.backupDirectory, 0o700); chmodSync(snapshot, 0o600); }
      this.transaction(() => {
        if (!this.db.prepare('PRAGMA table_info(resources)').all().some(column => column.name === 'mounts')) {
          this.db.exec('ALTER TABLE resources ADD COLUMN mounts INTEGER NOT NULL DEFAULT 0');
        }
      });
    }
    // Extra resources (no effect on points): NULL = never entered. Additive, so no backup is needed.
    const columns = new Set(this.db.prepare('PRAGMA table_info(resources)').all().map(column => column.name));
    for (const field of Database.extraFields) if (!columns.has(field)) this.db.exec(`ALTER TABLE resources ADD COLUMN ${field} INTEGER`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS clan_tech (guild_id TEXT PRIMARY KEY, payload TEXT NOT NULL, author TEXT NOT NULL, updated_at TEXT NOT NULL);`);
  }

  /** Scanned or typed extras shown with the clan resources; they never change the points. */
  static extraFields = ['green_vials', 'gems', 'red_vials', 'shells', 'coins'];

  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  ensure(guildId, now = new Date()) {
    const current = this.calendar.cycle(now);
    const cycle = current.id;
    this.transaction(() => {
      const guild = this.db.prepare('SELECT * FROM guilds WHERE id=?').get(guildId);
      if (!guild) {
        this.db.prepare('INSERT INTO guilds(id,cycle) VALUES(?,?)').run(guildId, cycle);
        const insert = this.db.prepare('INSERT INTO tech VALUES(?,?,?)');
        for (const [key, , value] of Technology.entries) insert.run(guildId, key, value);
      } else if (guild.cycle < cycle) {
        // A delayed reset or calendar correction must retain resources updated after
        // the actual game boundary, including saves during the old schedule's extra hour.
        this.db.prepare('DELETE FROM resources WHERE guild_id=? AND updated_at<?')
          .run(guildId, this.calendar.boundary(current.monday).toISOString());
        this.db.prepare('UPDATE guilds SET cycle=? WHERE id=?').run(cycle, guildId);
        this.db.prepare('INSERT OR IGNORE INTO reset_events VALUES(?,?,?,?,?)')
          .run(guildId, 'weekly', cycle, null, now.toISOString());
        if (this.reminderChannel(guildId)) this.db.prepare('INSERT OR IGNORE INTO reminder_jobs(guild_id,cycle) VALUES(?,?)').run(guildId, cycle);
      }
    });
  }

  checkAll(now = new Date()) {
    for (const { id } of this.db.prepare('SELECT id FROM guilds').all()) this.ensure(id, now);
  }

  snapshot(guildId, now = new Date()) {
    this.ensure(guildId, now);
    return this.transaction(() => ({
      tech: { ...Technology.defaults(), ...Object.fromEntries(this.db.prepare('SELECT key,value FROM tech WHERE guild_id=?').all(guildId).map(row => [row.key, row.value])) },
      players: this.db.prepare(`SELECT p.*,r.skill_tickets,r.mount_keys,r.hammers,r.pets,r.mounts,r.green_vials,r.gems,r.red_vials,r.shells,r.coins,r.updated_at
        FROM players p JOIN resources r ON p.guild_id=r.guild_id AND p.user_id=r.user_id
        WHERE p.guild_id=? ORDER BY p.name,p.user_id`).all(guildId),
    }));
  }

  profile(guildId, userId) {
    return this.db.prepare(`SELECT p.*,r.skill_tickets,r.mount_keys,r.hammers,r.pets,r.mounts,r.green_vials,r.gems,r.red_vials,r.shells,r.coins,r.updated_at
      FROM players p LEFT JOIN resources r ON p.guild_id=r.guild_id AND p.user_id=r.user_id
      WHERE p.guild_id=? AND p.user_id=?`).get(guildId, userId);
  }

  update(guildId, userId, name, values, now = new Date(), afterWrite = () => {}) {
    this.ensure(guildId, now);
    return this.transaction(() => {
      this.db.prepare(`INSERT INTO players(guild_id,user_id,name) VALUES(?,?,?)
        ON CONFLICT(guild_id,user_id) DO UPDATE SET name=excluded.name`).run(guildId, userId, name);
      if ('skill_cost_x5' in values) this.db.prepare('UPDATE players SET skill_cost_x5=? WHERE guild_id=? AND user_id=?')
        .run(values.skill_cost_x5, guildId, userId);
      if ('mount_cost' in values) this.db.prepare('UPDATE players SET mount_cost=? WHERE guild_id=? AND user_id=?')
        .run(values.mount_cost, guildId, userId);
      const fields = ['skill_tickets', 'mount_keys', 'hammers', 'pets', 'mounts', ...Database.extraFields].filter(field => field in values);
      if (fields.length) {
        this.db.prepare(`INSERT INTO resources(guild_id,user_id,updated_at) VALUES(?,?,?)
          ON CONFLICT(guild_id,user_id) DO NOTHING`).run(guildId, userId, now.toISOString());
        // Column names come exclusively from the fixed allowlist above.
        this.db.prepare(`UPDATE resources SET ${fields.map(field => `${field}=?`).join(',')},updated_at=?
          WHERE guild_id=? AND user_id=?`).run(...fields.map(field => values[field]), now.toISOString(), guildId, userId);
      }
      const player = this.profile(guildId, userId);
      afterWrite(player);
      return player;
    });
  }

  /** Publish verified readings to the same technology values used for scoring. */
  saveClanTech(guildId, userId, payload, now = new Date()) {
    this.ensure(guildId, now);
    return this.transaction(() => {
      const previous = this.clanTech(guildId);
      if (previous && Date.parse(payload.observed_at) <= Date.parse(previous.observed_at)) return 0;
      const values = Object.entries(ClanTech.values(payload));
      for (const [key, value] of values) this.updateTech(guildId, key, value);
      if (values.length) this.db.prepare(`INSERT INTO clan_tech VALUES(?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET payload=excluded.payload,author=excluded.author,updated_at=excluded.updated_at`)
        .run(guildId, JSON.stringify(payload), userId, now.toISOString());
      return values.length;
    });
  }

  clanTech(guildId) {
    const row = this.db.prepare('SELECT payload,author,updated_at FROM clan_tech WHERE guild_id=?').get(guildId);
    return row ? { ...JSON.parse(row.payload), author: row.author, updated_at: row.updated_at } : null;
  }

  updateTech(guildId, key, value) {
    if (!Technology.label(key)) throw new UserInputError('Nieznana technologia.');
    this.db.prepare('INSERT INTO tech VALUES(?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value').run(guildId, key, value);
  }

  deleteWeeklyPlayers(guildId, userIds, cycle, now = new Date()) {
    this.ensure(guildId, now);
    return this.transaction(() => {
      if (cycle !== this.calendar.cycle(now).id) throw new UserInputError('Lista pochodzi z poprzedniego tygodnia. Otwórz /delete ponownie.');
      const remove = this.db.prepare('DELETE FROM resources WHERE guild_id=? AND user_id=?');
      return userIds.reduce((count, userId) => count + Number(remove.run(guildId, userId).changes), 0);
    });
  }

  reminderChannel(guildId) {
    return this.db.prepare('SELECT channel_id FROM reminder_settings WHERE guild_id=?').get(guildId)?.channel_id;
  }

  setReminderChannel(guildId, channelId) {
    if (channelId === null) return this.db.prepare('DELETE FROM reminder_settings WHERE guild_id=?').run(guildId);
    if (!/^\d{17,20}$/.test(channelId ?? '')) throw new UserInputError('Wybierz prawidłowy kanał tekstowy.');
    this.db.prepare('INSERT INTO reminder_settings VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id').run(guildId, channelId);
  }

  claimReminder(now = new Date()) {
    return this.transaction(() => {
      const job = this.db.prepare(`SELECT j.*,s.channel_id FROM reminder_jobs j
        JOIN guilds g ON g.id=j.guild_id AND (g.cycle=j.cycle OR j.cycle=?)
        JOIN reminder_settings s ON s.guild_id=j.guild_id
        WHERE j.state!='sent' AND j.next_attempt<=? AND j.lease_until<=?
        ORDER BY j.next_attempt,j.guild_id LIMIT 1`).get(`daily:${this.calendar.dateKey(now)}`, now.getTime(), now.getTime());
      if (!job) return null;
      const claim = randomUUID();
      this.db.prepare("UPDATE reminder_jobs SET state='sending',claim=?,lease_until=?,attempts=attempts+1 WHERE guild_id=? AND cycle=?")
        .run(claim, now.getTime() + 120000, job.guild_id, job.cycle);
      return { ...job, claim, attempts: job.attempts + 1 };
    });
  }

  finishReminder(job, messageId, now = new Date()) {
    this.db.prepare("UPDATE reminder_jobs SET state='sent',message_id=?,sent_at=?,claim=NULL,lease_until=0 WHERE guild_id=? AND cycle=? AND claim=?")
      .run(messageId, now.toISOString(), job.guild_id, job.cycle, job.claim);
  }

  lastReminder(guildId) {
    return this.db.prepare("SELECT sent_at FROM reminder_jobs WHERE guild_id=? AND cycle NOT LIKE 'daily:%' AND state='sent' AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 1").get(guildId)?.sent_at;
  }

  queueDailyReminders(now = new Date()) {
    if (this.calendar.local(now).hour < 20) return;
    const cycle = `daily:${this.calendar.dateKey(now)}`;
    this.db.prepare(`INSERT OR IGNORE INTO reminder_jobs(guild_id,cycle)
      SELECT s.guild_id,? FROM reminder_settings s JOIN guilds g ON g.id=s.guild_id`).run(cycle);
  }

  lastDailyReminder(guildId) {
    return this.db.prepare("SELECT sent_at FROM reminder_jobs WHERE guild_id=? AND cycle LIKE 'daily:%' AND state='sent' ORDER BY sent_at DESC LIMIT 1").get(guildId)?.sent_at;
  }

  retryReminder(job, nextAttempt) {
    this.db.prepare("UPDATE reminder_jobs SET state='pending',claim=NULL,lease_until=0,next_attempt=? WHERE guild_id=? AND cycle=? AND claim=?")
      .run(nextAttempt, job.guild_id, job.cycle, job.claim);
  }

  resetTech(guildId) { this.db.prepare('UPDATE tech SET value=0 WHERE guild_id=?').run(guildId); }

  async createBackup(prefix = 'daily') {
    mkdirSync(this.backupDirectory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') chmodSync(this.backupDirectory, 0o700);
    const path = resolve(this.backupDirectory, `${prefix}-${Date.now()}-${randomUUID()}.sqlite`);
    await backup(this.db, path);
    if (process.platform !== 'win32') chmodSync(path, 0o600);
    return path;
  }

  async seasonReset(guildId, userId, now = new Date(), interactionId = randomUUID()) {
    this.ensure(guildId, now);
    const previous = this.db.prepare('SELECT actor FROM reset_events WHERE guild_id=? AND kind=? AND event_id=?').get(guildId, 'season', interactionId);
    if (previous) return this.db.prepare('SELECT COUNT(*) AS count FROM players WHERE guild_id=?').get(guildId).count;
    await this.createBackup('before-season');
    return this.transaction(() => {
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM players WHERE guild_id=?').get(guildId).count;
      if (this.db.prepare('SELECT 1 FROM reset_events WHERE guild_id=? AND kind=? AND event_id=?').get(guildId, 'season', interactionId)) return count;
      this.db.prepare('DELETE FROM resources WHERE guild_id=?').run(guildId);
      this.db.prepare('UPDATE players SET skill_cost_x5=NULL,mount_cost=NULL WHERE guild_id=?').run(guildId);
      this.resetTech(guildId);
      this.db.prepare('UPDATE guilds SET season=season+1 WHERE id=?').run(guildId);
      this.db.prepare('INSERT INTO reset_events VALUES(?,?,?,?,?)').run(guildId, 'season', interactionId, userId, now.toISOString());
      return count;
    });
  }

  pingRoles(guildId) {
    const row = this.db.prepare('SELECT roles FROM ping_settings WHERE guild_id=?').get(guildId);
    return row ? JSON.parse(row.roles) : [];
  }

  participationRoles(guildId) {
    const row = this.db.prepare('SELECT roles FROM participation_settings WHERE guild_id=?').get(guildId);
    return row ? JSON.parse(row.roles) : [];
  }

  setParticipationRoles(guildId, roles) {
    if (!Array.isArray(roles) || roles.length > 10 || roles.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id) || id === guildId)) throw new UserInputError('Wybierz role uczestników, bez @everyone.');
    this.db.prepare('INSERT INTO participation_settings VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET roles=excluded.roles').run(guildId, JSON.stringify([...new Set(roles)]));
  }

  /** { forge: [roleId], pets: [...], ... } chosen in /setup → Wzniesienia. */
  ascensionRoles(guildId) {
    return Object.fromEntries(this.db.prepare('SELECT type, roles FROM ascension_settings WHERE guild_id=?').all(guildId).map(row => [row.type, JSON.parse(row.roles)]));
  }

  setAscensionRoles(guildId, type, roles) {
    if (!['forge', 'pets', 'mounts', 'skills'].includes(type)) throw new UserInputError('Nieznany rodzaj wzniesienia.');
    if (!Array.isArray(roles) || roles.length > 5 || roles.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id) || id === guildId)) throw new UserInputError('Wybierz role wzniesienia, bez @everyone.');
    if (!roles.length) this.db.prepare('DELETE FROM ascension_settings WHERE guild_id=? AND type=?').run(guildId, type);
    else this.db.prepare('INSERT INTO ascension_settings VALUES(?,?,?) ON CONFLICT(guild_id, type) DO UPDATE SET roles=excluded.roles').run(guildId, type, JSON.stringify([...new Set(roles)]));
  }

  managementRoles(guildId) {
    const row = this.db.prepare('SELECT roles FROM management_settings WHERE guild_id=?').get(guildId);
    return row ? JSON.parse(row.roles) : [];
  }

  setManagementRoles(guildId, roles) {
    if (!Array.isArray(roles) || roles.length > 10 || roles.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id) || id === guildId)) throw new UserInputError('Wybierz prawidłowe role zarządu, bez @everyone.');
    this.db.prepare('INSERT INTO management_settings VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET roles=excluded.roles').run(guildId, JSON.stringify([...new Set(roles)]));
  }

  setPingRoles(guildId, roles) {
    if (!Array.isArray(roles) || roles.length > 10 || roles.some(id => !/^\d{17,20}$/.test(id) || id === guildId)) throw new UserInputError('Wybierz prawidłowe role, bez @everyone.');
    this.db.prepare('INSERT INTO ping_settings VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET roles=excluded.roles').run(guildId, JSON.stringify([...new Set(roles)]));
  }

  pingTarget(guildId) {
    return this.db.prepare('SELECT kind,role_id FROM ping_targets WHERE guild_id=?').get(guildId);
  }

  setPingTarget(guildId, kind, roleId = null) {
    if (!['role', 'everyone', 'here'].includes(kind) || (kind === 'role' && (!/^\d{17,20}$/.test(roleId ?? '') || roleId === guildId)) || (kind !== 'role' && roleId !== null)) throw new UserInputError('Wybierz jedną rolę, @everyone albo @here.');
    this.db.prepare('INSERT INTO ping_targets VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET kind=excluded.kind,role_id=excluded.role_id').run(guildId, kind, roleId);
  }

  close() { this.db.close(); }
}

