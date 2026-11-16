import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Technical scan reports from the app (POST /mobile/diagnostics): timings, frame counts, counter readings and
 * list-scroll measurements, never images. Only the last three per player are kept; read them on the server with
 * `npm run diagnostics` (see scripts/diagnostics.js). With a [directory] every save also mirrors the kept reports
 * there as JSON files (nothing else from the database), so `npm run diagnostics:pull` can fetch them over FTP.
 */
export class ScanDiagnostics {
  static KEEP = 3;
  static MAX_BYTES = 512 * 1024;

  constructor(database, clock = () => Date.now(), directory = null) {
    this.database = database;
    this.clock = clock;
    this.directory = directory;
    database.db.exec(`CREATE TABLE IF NOT EXISTS scan_diagnostics(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,name TEXT NOT NULL,saved_at INTEGER NOT NULL,report TEXT NOT NULL)`);
    // Reports saved before the bot mirrored them become files at startup, not only at the next save.
    try { this.export(); } catch (error) { console.error(`Scan diagnostics export failed: ${error.message}`); }
  }

  save(device, body) {
    if (!Array.isArray(body?.events)) throw new Error('Brak zdarzeń skanu.');
    const report = JSON.stringify({ ...body, events: body.events.slice(0, 2000) });
    if (Buffer.byteLength(report) > ScanDiagnostics.MAX_BYTES) throw new Error('Raport diagnostyczny jest za duży.');
    this.database.transaction(() => {
      this.database.db.prepare('INSERT INTO scan_diagnostics(guild_id,user_id,name,saved_at,report) VALUES(?,?,?,?,?)')
        .run(device.guild_id, device.user_id, String(device.name ?? '').slice(0, 100), this.clock(), report);
      this.database.db.prepare(`DELETE FROM scan_diagnostics WHERE guild_id=? AND user_id=? AND id NOT IN
        (SELECT id FROM scan_diagnostics WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT ?)`)
        .run(device.guild_id, device.user_id, device.guild_id, device.user_id, ScanDiagnostics.KEEP);
    });
    try { this.export(); } catch (error) { console.error(`Scan diagnostics export failed: ${error.message}`); }
    return { status: 'saved' };
  }

  static fileName(row) {
    return `${row.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}-${row.id}.json`;
  }

  /** Writes the kept reports to [directory] and removes files of reports no longer kept. */
  export(directory = this.directory) {
    if (!directory) return [];
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const rows = this.list();
    const names = new Set(rows.map(ScanDiagnostics.fileName));
    for (const file of readdirSync(directory)) if (file.endsWith('.json') && !names.has(file)) rmSync(join(directory, file), { force: true });
    for (const row of rows) writeFileSync(join(directory, ScanDiagnostics.fileName(row)), JSON.stringify(row, null, 2), { mode: 0o600 });
    return rows;
  }

  /** Newest first; optional filter by part of the player's name. */
  list(nameFilter = '') {
    const needle = String(nameFilter).toLocaleLowerCase('pl');
    return this.database.db.prepare('SELECT * FROM scan_diagnostics ORDER BY id DESC').all()
      .filter(row => !needle || row.name.toLocaleLowerCase('pl').includes(needle))
      .map(row => ({ id: row.id, name: row.name, user_id: row.user_id, saved_at: new Date(row.saved_at).toISOString(), report: JSON.parse(row.report) }));
  }
}
