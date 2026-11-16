// Run on the server: `npm run diagnostics` (all players) or `npm run diagnostics -- Kolega` (name filter).
// Lists the kept scan reports (last three per player) and writes them as JSON files next to the database
// (data/diagnostics/), the same folder the bot mirrors on every save. Fetch them locally: `npm run diagnostics:pull`.
import { dirname, resolve } from 'node:path';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScanDiagnostics } from '../src/http/ScanDiagnostics.js';

process.umask(0o077);
const databasePath = process.env.DATABASE_PATH || './data/bot.sqlite';
const database = new Database(databasePath, new WarCalendar(), process.env.BACKUP_DIRECTORY || './backups');
try {
  const directory = process.env.DIAGNOSTICS_DIRECTORY || resolve(dirname(databasePath), 'diagnostics');
  const needle = String(process.argv[2] ?? '').toLocaleLowerCase('pl');
  const rows = new ScanDiagnostics(database).export(directory).filter(row => !needle || row.name.toLocaleLowerCase('pl').includes(needle));
  for (const row of rows) console.log(`${row.saved_at}  ${row.name}  v${row.report.app_version ?? '?'}  ${row.report.status ?? ''}  -> ${ScanDiagnostics.fileName(row)}`);
  if (!rows.length) console.log('Brak raportów diagnostycznych.');
} finally {
  database.close();
}
