/**
 * Backup of complete war/ranking profiles per Discord server. Phones save what they read and ask
 * only for members they have nothing for; a profile is returned only for the same clan and
 * nickname with power within display rounding (±0.6%) and at most 30 days old.
 */
export class SharedProfiles {
  static MAX_AGE = 30 * 86400000;
  constructor(database, clock = () => Date.now()) {
    this.db = database.db; this.clock = clock;
    this.db.exec(`CREATE TABLE IF NOT EXISTS shared_profiles(guild_id TEXT NOT NULL,enemy INTEGER NOT NULL,clan_key TEXT NOT NULL,name_key TEXT NOT NULL,
      clan TEXT NOT NULL,name TEXT NOT NULL,power REAL NOT NULL,saved_at INTEGER NOT NULL,profile TEXT NOT NULL,PRIMARY KEY(guild_id,enemy,clan_key,name_key))`);
  }
  static key(value) {
    return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('pl').replace(/ł/g, 'l')
      // Clan tags vary in OCR ("PolskaMoc(PLJ", "[_PL_]"): compare the name before the tag.
      .replace(/[\[(].*$/, '').replace(/[^\p{L}\p{N}]/gu, '');
  }
  static samePower(a, b) { return a > 0 && b > 0 && Math.abs(a - b) <= Math.max(a, b) * 0.006; }

  exchange(device, body) {
    const now = this.clock();
    this.db.prepare('DELETE FROM shared_profiles WHERE saved_at<?').run(now - SharedProfiles.MAX_AGE - 86400000);
    const save = Array.isArray(body?.save) ? body.save.slice(0, 120) : [];
    const want = Array.isArray(body?.want) ? body.want.slice(0, 120) : [];
    const upsert = this.db.prepare(`INSERT INTO shared_profiles VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,enemy,clan_key,name_key)
      DO UPDATE SET clan=excluded.clan,name=excluded.name,power=excluded.power,saved_at=excluded.saved_at,profile=excluded.profile WHERE excluded.saved_at>=shared_profiles.saved_at`);
    let saved = 0;
    for (const item of save) {
      const profile = item?.profile;
      const text = profile && typeof profile === 'object' ? JSON.stringify(profile) : '';
      const power = Number(item?.power), savedAt = Number(item?.savedAt);
      const clanKey = SharedProfiles.key(item?.clan), nameKey = SharedProfiles.key(item?.name);
      if (!clanKey || !nameKey || !(power > 0) || !Number.isFinite(savedAt) || savedAt > now + 600000 || now - savedAt > SharedProfiles.MAX_AGE) continue;
      if (text.length < 20 || text.length > 65536 || typeof profile.damage !== 'number' || typeof profile.health !== 'number') continue;
      saved += upsert.run(device.guild_id, item.enemy ? 1 : 0, clanKey, nameKey, String(item.clan).slice(0, 100), String(item.name).slice(0, 100), power, savedAt, text).changes;
    }
    const find = this.db.prepare('SELECT power,saved_at,profile FROM shared_profiles WHERE guild_id=? AND enemy=? AND clan_key=? AND name_key=?');
    const profiles = [];
    for (const item of want) {
      const row = find.get(device.guild_id, item?.enemy ? 1 : 0, SharedProfiles.key(item?.clan), SharedProfiles.key(item?.name));
      if (!row || now - row.saved_at > SharedProfiles.MAX_AGE || !SharedProfiles.samePower(row.power, Number(item?.power))) continue;
      profiles.push({ enemy: !!item.enemy, clan: item.clan, name: item.name, power: row.power, savedAt: row.saved_at, profile: JSON.parse(row.profile) });
    }
    return { saved, profiles };
  }
}
