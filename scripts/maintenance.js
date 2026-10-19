import { WorkerRestart } from './WorkerRestart.js';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { WeeklyReminders } from '../src/discord/WeeklyReminders.js';

process.umask(0o077);
WorkerRestart.runRequested();
const database = new Database(process.env.DATABASE_PATH || './data/bot.sqlite', new WarCalendar(), process.env.BACKUP_DIRECTORY || './backups');
try {
  await new WeeklyReminders(database, { token: WeeklyReminders.tokenFromEnvironment() }).run();
  if (process.argv.includes('--backup')) console.log(`Backup saved: ${await database.createBackup('daily')}`);
  else console.log('Weekly resource cycles checked.');
} finally {
  database.close();
}
