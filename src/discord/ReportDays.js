import { Navigation } from './Navigation.js';
import { ReportService } from './ReportService.js';
import { UserInputError } from '../domain/UserInputError.js';

export class ReportDays {
  static kinds = ['clan-details', 'clan-ultra'];

  static validate(values) {
    if (!Array.isArray(values) || !values.length || values.length > 7 || new Set(values).size !== values.length
      || values.some(value => !/^(all|[1-6])$/.test(value))) throw new UserInputError('Wybierz dni od 1 do 6 albo wszystkie dni.');
    return values.includes('all') ? [1, 2, 3, 4, 5, 6] : values.map(Number).sort((a, b) => a - b);
  }

  static panel(kind, userId, calendar, now, selected) {
    const cycle = calendar.cycle(now);
    const current = [1, 2, 3, 4, 5, 6].find(day => calendar.status(cycle, day, now) === 'current');
    const days = selected ?? (current ? [current] : [1, 2, 3, 4, 5, 6]);
    const all = days.length === 6;
    return { content: `**${kind === 'clan-ultra' ? '🔎 Ultra szczegóły klanu' : '📋 Szczegóły klanu'} — wybierz dni**\nZaznaczone: **${all ? 'wszystkie dni' : days.join(', ')}**. Wybierz jeden lub kilka dni, albo opcję **Wszystkie dni**, i kliknij **Pokaż raport**.\nRaport obejmie wszystkich wpisanych graczy i ich ostatnio zapisane zasoby.`, embeds: [],
      components: [{ type: 1, components: [{ type: 3, custom_id: `report-days:${userId}:${kind}:${cycle.id}`,
        placeholder: 'Wybierz dni raportu', min_values: 1, max_values: 7,
        options: [{ label: 'Wszystkie dni', value: 'all', default: all },
          ...ReportService.weekdays.map((label, index) => ({ label: `Dzień ${index + 1}: ${label} (${cycle.starts[index].toISOString().slice(0, 10)})`,
            value: String(index + 1), default: !all && days.includes(index + 1) }))] }] },
      { type: 1, components: [{ type: 2, style: 1, label: 'Pokaż raport', custom_id: `report-show:${userId}:${kind}:${cycle.id}:${days.join(',')}` }] },
      ...Navigation.all(userId)] };
  }
}
