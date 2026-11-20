import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Server-side data behind the clan ranking, mirrored as files next to the scan reports (<directory>/server/):
 * the kept ranking scans with every player's points and how many pairs were simulated or decided by power,
 * and the shared war/ranking profiles the simulation used. No tokens, devices or Discord accounts.
 */
export class ServerExport {
  constructor(database, directory) {
    this.db = database.db;
    this.directory = directory;
  }

  write() {
    if (!this.directory) return;
    const directory = join(this.directory, 'server');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const has = table => !!this.db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table', table);
    const rankings = has('clan_ranking_history'), shared = has('shared_profiles');
    const guilds = new Set();
    if (rankings) for (const row of this.db.prepare('SELECT DISTINCT guild_id FROM clan_ranking_history').all()) guilds.add(row.guild_id);
    if (shared) for (const row of this.db.prepare('SELECT DISTINCT guild_id FROM shared_profiles').all()) guilds.add(row.guild_id);
    for (const guild of guilds) {
      const safe = String(guild).replace(/\D/g, '');
      if (rankings) {
        const scans = this.db.prepare('SELECT observed_at,request_id,payload FROM clan_ranking_history WHERE guild_id=? ORDER BY observed_at DESC').all(guild)
          .map(scan => ({ observed_at: new Date(scan.observed_at).toISOString(), request_id: scan.request_id, ...JSON.parse(scan.payload) }));
        writeFileSync(join(directory, `clan-ranking-${safe}.json`), JSON.stringify(scans, null, 2), { mode: 0o600 });
      }
      if (shared) {
        const profiles = this.db.prepare('SELECT enemy,clan,name,power,saved_at,profile FROM shared_profiles WHERE guild_id=? ORDER BY enemy,clan,name').all(guild)
          .map(row => ({ enemy: !!row.enemy, clan: row.clan, name: row.name, power: row.power, saved_at: new Date(row.saved_at).toISOString(), profile: JSON.parse(row.profile) }));
        writeFileSync(join(directory, `profiles-${safe}.json`), JSON.stringify(profiles, null, 2), { mode: 0o600 });
      }
    }
  }

  safeWrite() {
    try { this.write(); } catch (error) { console.error(`Server export failed: ${error.message}`); }
  }
}
