export class ParticipationReminders {
  static rosterCaches = new WeakMap();
  constructor(database, token, request = fetch) {
    this.database = database;
    this.token = token;
    this.request = request;
  }

  async members(guildId) {
    let cache = ParticipationReminders.rosterCaches.get(this.request);
    if (!cache) ParticipationReminders.rosterCaches.set(this.request, cache = new Map());
    const previous = cache.get(guildId);
    if (previous?.token === this.token && previous.expires > Date.now()) return previous.work;
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    const entry = { token: this.token, expires: Date.now() + 30000 };
    entry.work = this.fetchMembers(guildId).catch(error => {
      if (cache.get(guildId) === entry) cache.delete(guildId);
      throw error;
    });
    cache.set(guildId, entry);
    return entry.work;
  }

  async fetchMembers(guildId) {
    const signal = AbortSignal.timeout(8000);
    const members = [];
    let after = '0';
    for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
      const response = await this.request(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`, {
        headers: { Authorization: `Bot ${this.token}` }, signal, redirect: 'error',
      });
      if (!response.ok) throw new Error(`Member list unavailable: HTTP ${response.status}`);
      const page = await response.json();
      if (!Array.isArray(page) || page.some(member => !/^\d{17,20}$/.test(member.user?.id ?? ''))) throw new Error('Invalid member list');
      members.push(...page);
      if (page.length < 1000) return members;
      const next = page.at(-1).user.id;
      if (BigInt(next) <= BigInt(after)) throw new Error('Invalid member cursor');
      after = next;
    }
    throw new Error('Member list exceeded safe pagination limit');
  }

  static displayName(member, fallback) {
    const name = member?.nick || member?.user?.global_name || member?.user?.username || fallback || `Użytkownik ${member?.user?.id ?? ''}`;
    return String(name).slice(0, 100).replace(/[\\`*_~|<>@]/g, '\\$&').replace(/[\r\n]/g, ' ');
  }

  async enrollment(guildId, players) {
    const roles = this.database.participationRoles(guildId);
    if (!roles.length) return null;
    const members = await this.members(guildId);
    const participants = [...new Map(members.map(member => [member.user.id, member])).values()]
      .filter(member => !member.user.bot && member.roles?.some(role => roles.includes(role)));
    const ids = new Set(participants.map(member => member.user.id));
    const enrolled = players.filter(player => ids.has(player.user_id)).length;
    return { participants, enrolled, total: participants.length, other: players.length - enrolled, outsiders: players.filter(player => !ids.has(player.user_id)).map(player => ParticipationReminders.displayName(members.find(member => member.user.id === player.user_id), player.name)) };
  }

  static enrollmentLabel(status, count) {
    if (!status) return `Wpisani: **${count}/? członków** (ustaw role uczestników w /setup).`;
    if (status.unavailable) return `Wpisani: **${count}/? członków** (lista uczestników chwilowo niedostępna).`;
    return `Wpisani: **${status.enrolled}/${status.total} członków**${status.other ? `\nDodatkowe wpisy spoza ról uczestników: **${status.other}** (ujęte w raportach klanu).${this.outsiderNames(status).length <= 800 ? `\n${this.outsiderNames(status)}` : '\nPełna lista w osobnej części poniżej.'}` : ''}`;
  }

  static outsiderNames(status) {
    return (status?.outsiders ?? []).join('\n');
  }

  static outsiderMessages(status) {
    const names = this.outsiderNames(status);
    if (names.length <= 800) return [];
    const messages = [];
    let content = '**Dodatkowe wpisy spoza ról uczestników**';
    for (const line of names.split('\n')) {
      if (content.length + line.length + 1 > 1700) {
        messages.push({ content, allowed_mentions: { parse: [] } });
        content = '**Dodatkowe wpisy spoza ról uczestników (ciąg dalszy)**';
      }
      content += `\n${line}`;
    }
    messages.push({ content, allowed_mentions: { parse: [] } });
    return messages;
  }

  async messages(guildId, now) {
    const roles = this.database.participationRoles(guildId);
    if (!roles.length) return [];
    const snapshot = this.database.snapshot(guildId, now);
    let status;
    try { status = await this.enrollment(guildId, snapshot.players); }
    catch {
      return [{ content: '⚠️ Nie udało się sprawdzić listy uczestników. Zarząd: sprawdź Server Members Intent i dostęp bota. Lista brakujących aktualizacji jest chwilowo niedostępna.', allowed_mentions: { parse: [] } }];
    }
    const calendar = this.database.calendar;
    let key = calendar.dateKey(now);
    if (calendar.local(now).hour < 2) key = calendar.shift(key, -1);
    const start = calendar.boundary(key);
    const players = new Map(snapshot.players.map(player => [player.user_id, player]));
    const missing = [], stale = [];
    for (const member of status.participants) {
      const player = players.get(member.user.id);
      if (!player) missing.push(`❗ ${ParticipationReminders.displayName(member)}`);
      else if (!player.updated_at || Date.parse(player.updated_at) < start.getTime()) stale.push(ParticipationReminders.displayName(member));
    }
    const messages = [];
    for (const [title, entries] of [['🔴 Bez wpisu w tym tygodniu', missing], ['🕒 Zapisani, ale bez dzisiejszej aktualizacji', stale]]) {
      const heading = `**${title}: ${entries.length}**`;
      let content = heading;
      for (const entry of entries.length ? entries : ['Brak ✅']) {
        if (content.length + entry.length + 1 > 1700) {
          messages.push({ content, allowed_mentions: { parse: [] } });
          content = `${heading} (ciąg dalszy)`;
        }
        content += `\n${entry}`;
      }
      messages.push({ content, allowed_mentions: { parse: [] } });
    }
    const summary = ParticipationReminders.enrollmentLabel(status, snapshot.players.length);
    if (summary.length + messages[0].content.length + 2 <= 1900) messages[0].content = `${summary}\n\n${messages[0].content}`;
    else messages.unshift({ content: summary, allowed_mentions: { parse: [] } });
    messages.push(...ParticipationReminders.outsiderMessages(status));
    return messages;
  }
}
