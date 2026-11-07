import { createHash } from 'node:crypto';
import { Navigation } from './Navigation.js';

/** One @everyone post on the reminder channel when the locked Sunday war list (with enemy tech) is saved. */
export class WarAnnouncement {
  constructor(database, token, { request = fetch, logger = console } = {}) {
    this.database = database; this.token = token; this.request = request; this.logger = logger;
  }

  static message() {
    return { content: '@everyone\n**⚔️ Lista wojenna na tę wojnę jest gotowa!**\n'
      + 'Lista jest aktualna: policzona z bonusami technologii obu klanów i **każdy ma przypisanego przeciwnika**. Listy nie da się już nadpisać do końca wojny.\n'
      + 'Sprawdź swojego przeciwnika: **/start → Lista wojenna** albo **/report war-list**.',
    allowed_mentions: { parse: ['everyone'] }, components: Navigation.welcome() };
  }

  /** Returns true when posted. No channel or token: nothing to do. Never throws. */
  async send(guildId, warDay) {
    const channel = this.database.reminderChannel(guildId);
    if (!channel || !this.token) return false;
    try {
      // Same guild and war day → same nonce, so a retried upload cannot post twice.
      const nonce = createHash('sha256').update(`${guildId}:war-list:${warDay}`).digest('hex').slice(0, 24);
      const response = await this.request(`https://discord.com/api/v10/channels/${channel}/messages`, {
        method: 'POST', headers: { Authorization: `Bot ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...WarAnnouncement.message(), nonce, enforce_nonce: true }),
        signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      if (!response.ok) { this.logger.error('War list announcement failed: HTTP', response.status); return false; }
      return true;
    } catch (error) {
      this.logger.error('War list announcement failed:', error.code ?? error.name);
      return false;
    }
  }
}
