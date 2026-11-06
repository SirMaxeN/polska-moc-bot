import { randomBytes } from 'node:crypto';
import { sortPlayers } from './PlayerOrder.js';
import { ReportService } from './ReportService.js';
import { UserInputError } from '../domain/UserInputError.js';

export class SelectedReport {
  sessions = new Map();

  open(userId, guildId, snapshot, calendar, now) {
    for (const [id, session] of this.sessions) if (session.expires <= now.getTime()) this.sessions.delete(id);
    if (this.sessions.size >= 500) this.sessions.delete(this.sessions.keys().next().value);
    const cycle = calendar.cycle(now);
    const current = cycle.starts.findIndex((_, index) => index < 6 && calendar.status(cycle, index + 1, now) === 'current');
    const token = randomBytes(8).toString('hex');
    const session = { userId, guildId, cycle: cycle.id, day: current < 0 ? 1 : current + 1,
      page: 0, selected: new Set(), expires: now.getTime() + 30 * 60000 };
    this.sessions.set(token, session);
    return this.panel(token, session, snapshot, calendar, now);
  }

  handle(token, action, values, userId, guildId, snapshot, calendar, now) {
    const session = this.sessions.get(token);
    if (!session || session.userId !== userId || session.guildId !== guildId || session.expires <= now.getTime()
      || session.cycle !== calendar.cycle(now).id) throw new UserInputError('Panel wygasł. Otwórz raport wybranych graczy ponownie.');
    const players = sortPlayers(snapshot.players);
    const ids = new Set(players.map(player => player.user_id));
    session.selected = new Set([...session.selected].filter(id => ids.has(id)));
    session.page = Math.min(session.page, Math.max(0, Math.ceil(players.length / 25) - 1));
    if (action === 'players') {
      const visible = players.slice(session.page * 25, (session.page + 1) * 25);
      if (!Array.isArray(values) || values.length > visible.length || new Set(values).size !== values.length
        || values.some(id => !visible.some(player => player.user_id === id))) throw new UserInputError('Lista graczy zmieniła się. Otwórz raport ponownie.');
      for (const player of visible) session.selected.delete(player.user_id);
      for (const id of values) session.selected.add(id);
    } else if (action === 'day') {
      if (!Array.isArray(values) || values.length !== 1 || !/^[1-6]$/.test(values[0])) throw new UserInputError('Wybierz dzień od 1 do 6.');
      session.day = Number(values[0]);
    } else if (action === 'next') session.page = Math.min(session.page + 1, Math.max(0, Math.ceil(players.length / 25) - 1));
    else if (action === 'prev') session.page = Math.max(0, session.page - 1);
    else if (action === 'clear') session.selected.clear();
    else if (action === 'show') {
      if (!session.selected.size) throw new UserInputError('Zaznacz przynajmniej jednego gracza.');
      return { report: { ...snapshot, players: players.filter(player => session.selected.has(player.user_id)), selectedDay: session.day } };
    } else throw new UserInputError('Nieznana opcja raportu.');
    return { panel: this.panel(token, session, snapshot, calendar, now) };
  }

  panel(token, session, snapshot, calendar, now) {
    const players = sortPlayers(snapshot.players);
    const pages = Math.max(1, Math.ceil(players.length / 25));
    const visible = players.slice(session.page * 25, (session.page + 1) * 25);
    const custom = action => `selected:${session.userId}:${action}:${token}`;
    const cycle = calendar.cycle(now);
    const components = [{ type: 1, components: [{ type: 3, custom_id: custom('day'), placeholder: 'Wybierz dzień wojny',
      options: ReportService.weekdays.map((label, index) => ({ label: `Dzień ${index + 1}: ${label} (${cycle.starts[index].toISOString().slice(0, 10)})`,
        value: String(index + 1), default: session.day === index + 1 })) }] }];
    if (visible.length) components.push({ type: 1, components: [{ type: 3, custom_id: custom('players'),
      placeholder: `Zaznacz graczy — lista ${session.page + 1}/${pages}`, min_values: 0, max_values: visible.length,
      options: visible.map(player => ({ label: String(player.name).slice(0, 100) || player.user_id, value: player.user_id,
        description: `Discord ID: ${player.user_id}`, default: session.selected.has(player.user_id) })) }] });
    if (pages > 1) components.push({ type: 1, components: [
      { type: 2, style: 2, label: 'Poprzedni gracze', custom_id: custom('prev'), disabled: session.page === 0 },
      { type: 2, style: 2, label: 'Kolejni gracze', custom_id: custom('next'), disabled: session.page === pages - 1 },
    ] });
    components.push({ type: 1, components: [
      { type: 2, style: 1, label: 'Pokaż punkty i sumę', custom_id: custom('show'), disabled: !session.selected.size },
      { type: 2, style: 2, label: 'Wyczyść wybór', custom_id: custom('clear'), disabled: !session.selected.size },
      { type: 2, style: 2, label: 'Menu', custom_id: `menu:${session.userId}:start` },
    ] });
    return { content: `**📌 Raport wybranych graczy**\nWybierz dzień i graczy, a potem kliknij **Pokaż punkty i sumę**.\nZapisanych: **${players.length}** · zaznaczonych: **${session.selected.size}** · lista **${session.page + 1}/${pages}**.\nWybór zachowuje się między stronami. Potencjał bazuje na ostatnio zapisanych zasobach; to nie historia wyników. Panel ważny 30 minut.${players.length ? '' : '\nBrak wpisanych graczy w tym tygodniu.'}`, embeds: [], components };
  }
}
