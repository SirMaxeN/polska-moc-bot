/**
 * Reading knowledge shared by every paired phone: skill icons learned from confirmed detail windows
 * and game-font digit samples. Kept on the server so updates and new installs start trained.
 */
export class SharedLearning {
  // Each skill has four artworks (no star, Mega, Ultra, Apex): keep several samples of each.
  static ICONS_PER_SKILL = 12;
  static SAMPLES_PER_DIGIT = 40;
  constructor(database, clock = () => Date.now()) {
    this.db = database.db; this.clock = clock;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learned_icons(type TEXT NOT NULL,hash TEXT NOT NULL,icon TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(type,hash));
      CREATE TABLE IF NOT EXISTS learned_digits(digit INTEGER NOT NULL,aspect REAL NOT NULL,bits TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(digit,bits));
    `);
  }

  /** Stores the phone's new items, then returns everything newer than `since` (ms). */
  sync(body) {
    const icons = Array.isArray(body?.icons) ? body.icons.slice(0, 30) : [];
    const digits = Array.isArray(body?.digits) ? body.digits.slice(0, 60) : [];
    const now = this.clock();
    const saveIcon = this.db.prepare('INSERT OR IGNORE INTO learned_icons VALUES(?,?,?,?)');
    const saveDigit = this.db.prepare('INSERT OR IGNORE INTO learned_digits VALUES(?,?,?,?)');
    this.db.exec('BEGIN');
    try {
      for (const item of icons) {
        if (!/^[A-Z][A-Z_]{1,24}$/.test(item?.type ?? '') || !/^-?\d{1,20}$/.test(String(item?.hash ?? '')) || !/^[0-9a-f]{9600}$/.test(item?.icon ?? '')) continue;
        if (saveIcon.run(item.type, String(item.hash), item.icon, now).changes) {
          // Keep the newest few per skill so the shared base stays small and current.
          this.db.prepare(`DELETE FROM learned_icons WHERE type=? AND hash NOT IN (SELECT hash FROM learned_icons WHERE type=? ORDER BY created_at DESC LIMIT ?)`)
            .run(item.type, item.type, SharedLearning.ICONS_PER_SKILL);
        }
      }
      for (const item of digits) {
        const aspect = Number(item?.aspect);
        if (!Number.isInteger(item?.digit) || item.digit < 0 || item.digit > 9 || !Number.isFinite(aspect) || aspect <= 0 || aspect > 5 || !/^[01]{140}$/.test(item?.bits ?? '')) continue;
        if (saveDigit.run(item.digit, aspect, item.bits, now).changes) {
          this.db.prepare(`DELETE FROM learned_digits WHERE digit=? AND bits NOT IN (SELECT bits FROM learned_digits WHERE digit=? ORDER BY created_at DESC LIMIT ?)`)
            .run(item.digit, item.digit, SharedLearning.SAMPLES_PER_DIGIT);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    const since = Number.isFinite(Number(body?.since)) ? Number(body.since) : 0;
    return {
      now,
      icons: this.db.prepare('SELECT type,hash,icon FROM learned_icons WHERE created_at>? ORDER BY created_at').all(since),
      digits: this.db.prepare('SELECT digit,aspect,bits FROM learned_digits WHERE created_at>? ORDER BY created_at').all(since),
    };
  }
}
