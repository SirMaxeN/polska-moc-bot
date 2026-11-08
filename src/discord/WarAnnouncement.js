import { createHash } from 'node:crypto';
import { Navigation } from './Navigation.js';

/** One @everyone post on the reminder channel when the locked Sunday war list (with enemy tech) is saved. */
export class WarAnnouncement {
  constructor(database, token, { request = fetch, logger = console } = {}) {
    this.database = database; this.token = token; this.request = request; this.logger = logger;
  }

  static message(updated = false) {
    return { content: updated
      ? '@everyone\n**🔄 Lista wojenna została zaktualizowana!**\nZarząd odświeżył listę na tę wojnę — przydziały mogły się zmienić. Sprawdź swojego przeciwnika ponownie: **/start → Lista wojenna** albo **/report war-list**.'
      : '@everyone\n**⚔️ Lista wojenna na tę wojnę jest gotowa!**\n'
      + 'Lista jest aktualna: policzona z bonusami technologii obu klanów i **każdy ma przypisanego przeciwnika**. Zmienić ją może tylko zarząd.\n'
      + 'Sprawdź swojego przeciwnika: **/start → Lista wojenna** albo **/report war-list**.',
    allowed_mentions: { parse: ['everyone'] }, components: Navigation.welcome() };
  }

  /** Returns true when posted. No channel or token: nothing to do. Never throws. */
  async send(guildId, warDay, update = null, list = []) {
    const channel = this.database.reminderChannel(guildId);
    if (!channel || !this.token) return false;
    try {
      // The ping, then the list itself (every page, no buttons) so it can be read without /report.
      for (const [part, payload] of [WarAnnouncement.message(!!update), ...list].entries()) {
        // Same guild, war day and part → same nonce, so a retried upload cannot post twice.
        const nonce = createHash('sha256').update(`${guildId}:war-list:${warDay}${update ? `:update:${update}` : ''}:${part}`).digest('hex').slice(0, 24);
        const response = await this.request(`https://discord.com/api/v10/channels/${channel}/messages`, {
          method: 'POST', headers: { Authorization: `Bot ${this.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, nonce, enforce_nonce: true }),
          signal: AbortSignal.timeout(15000), redirect: 'error',
        });
        if (!response.ok) { this.logger.error('War list announcement failed: HTTP', response.status); return false; }
      }
      return true;
    } catch (error) {
      this.logger.error('War list announcement failed:', error.code ?? error.name);
      return false;
    }
  }
}
