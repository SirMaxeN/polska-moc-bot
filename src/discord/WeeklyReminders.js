import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Navigation } from './Navigation.js';
import { ParticipationReminders } from './ParticipationReminders.js';
import { DailyReminders } from './DailyReminders.js';

export class WeeklyReminders {
  constructor(database, { token, request = fetch, logger = console } = {}) {
    this.database = database;
    this.token = token;
    this.request = request;
    this.logger = logger;
    this.running = false;
  }

  static tokenFromEnvironment() {
    if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
    const path = process.env.DISCORD_BOT_TOKEN_FILE || resolve(dirname(process.env.DATABASE_PATH || './data/bot.sqlite'), 'discord-bot-token');
    try { return readFileSync(path, 'utf8').trim(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return ''; }
  }

  static message() {
    return { content: '**🔔 Nowy tydzień: zaktualizuj dane w Botysławie!**\n'
      + 'Zakończyliśmy wojnę i wyzerowaliśmy tygodniowe zasoby. Wpisz **/update**, aby podać aktualne bilety, klucze, młotki, zwierzaki lub jajka do połączenia i wierzchowce. Twoje koszty przywołań pozostają zapisane.\n'
      + 'Dzień 1 nowej wojny zaczyna się we wtorek o **02:00**. Główne menu otworzysz przez **/start**.',
    allowed_mentions: { parse: [] }, components: Navigation.welcome() };
  }

  async run(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      this.database.checkAll(now);
      this.database.queueDailyReminders(now);
      if (!this.token) return;
      // Bound each run so maintenance and sleeping-host recovery remain short.
      for (let index = 0; index < 20; index++) {
        const job = this.database.claimReminder(now);
        if (!job) break;
        const retryAt = now.getTime() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts - 1, 6));
        try {
          const base = job.cycle.startsWith('daily:') ? DailyReminders.message(job.cycle.slice(6)) : WeeklyReminders.message();
          const lists = await new ParticipationReminders(this.database, this.token, this.request).messages(job.guild_id, now);
          let deliveredId;
          let failed = false;
          for (const [part, payload] of [base, ...lists].entries()) {
            const nonce = createHash('sha256').update(`${job.guild_id}:${job.cycle}:weekly${part ? `:participants:${part}` : ''}`).digest('hex').slice(0, 24);
            const response = await this.request(`https://discord.com/api/v10/channels/${job.channel_id}/messages`, {
              method: 'POST', headers: { Authorization: `Bot ${this.token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payload, nonce, enforce_nonce: true }),
              signal: AbortSignal.timeout(15000), redirect: 'error',
            });
            if (!response.ok) {
              let next = retryAt;
              if (response.status === 429) {
                const data = await response.json();
                const seconds = Number(data.retry_after);
                if (Number.isFinite(seconds) && seconds > 0) next = now.getTime() + Math.max(1000, Math.min(3600000, Math.ceil(seconds * 1000)));
              }
              this.database.retryReminder(job, next);
              this.logger.error('Weekly reminder delivery failed: HTTP', response.status);
              failed = true;
              break;
            }
            const message = await response.json();
            if (!/^\d{17,20}$/.test(message.id ?? '')) throw new Error('Invalid message response');
            deliveredId = message.id;
          }
          if (failed) break;
          this.database.finishReminder(job, deliveredId, now);
        } catch (error) {
          this.database.retryReminder(job, retryAt);
          this.logger.error('Weekly reminder delivery failed:', error.code ?? error.name);
          break;
        }
      }
    } finally { this.running = false; }
  }
}
