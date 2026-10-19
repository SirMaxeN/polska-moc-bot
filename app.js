import { WarCalendar } from './src/domain/WarCalendar.js';
import { ScoringService } from './src/domain/ScoringService.js';
import { Database } from './src/storage/Database.js';
import { ReportService } from './src/discord/ReportService.js';
import { CommandService } from './src/discord/CommandService.js';
import { InteractionServer } from './src/http/InteractionServer.js';
import { WeeklyReminders } from './src/discord/WeeklyReminders.js';

// Restrict newly created database, journal and backup files to the hosting user.
process.umask(0o077);
const calendar = new WarCalendar();
const scoring = new ScoringService();
const database = new Database(process.env.DATABASE_PATH || './data/bot.sqlite', calendar, process.env.BACKUP_DIRECTORY || './backups');
database.checkAll();
const reminders = new WeeklyReminders(database, { token: WeeklyReminders.tokenFromEnvironment() });
const reports = new ReportService(calendar, scoring);
const commands = new CommandService(database, reports, scoring);
const server = new InteractionServer(process.env.DISCORD_PUBLIC_KEY, commands, process.env.DISCORD_APPLICATION_ID || '1559328501553954925');
const port = Number(process.env.PORT || 3000);
await server.listen(port);
console.log(`BotyslawSmith HTTP server listening on port ${port}.`);
void reminders.run().catch(error => console.error('Weekly maintenance failed:', error.code ?? error.name));
const timer = setInterval(() => {
  void reminders.run().catch(error => console.error('Weekly maintenance failed:', error.code ?? error.name));
}, 60000);
timer.unref();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  clearInterval(timer);
  await server.close();
  database.close();
});
