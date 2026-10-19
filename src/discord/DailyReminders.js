import { Navigation } from './Navigation.js';
import { WarCalendar } from '../domain/WarCalendar.js';

export class DailyReminders {
  static weekdays = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  static actions = [
    '⚔️ Dzień 6: walki z rywalami i otwarta bijatyka. Raport nie prognozuje punktów za walki. Wojna kończy się w poniedziałek o 02:00.',
    '🗓️ Dziś przerwa od wojny. Wpisz zasoby startowe na nowy tydzień. Dzień 1 zaczyna się we wtorek o 02:00.',
    '🎟️ Dzień 1: przyzywanie i ulepszanie umiejętności, kucie oraz klucze do lochów. Raport nie uwzględnia ulepszania umiejętności.',
    '🐎 Dzień 2: przyzywanie i łączenie wierzchowców, monety i klejnoty w kuźni oraz badania technologii. Raport nie uwzględnia wydatków w kuźni ani badań.',
    '🥚 Dzień 3: przyzywanie i ulepszanie umiejętności, kucie, wykluwanie jaj oraz łączenie zwierzaków lub jajek. Raport nie uwzględnia ulepszania umiejętności ani wykluwania.',
    '🔑 Dzień 4: przyzywanie i łączenie wierzchowców, klucze do lochów oraz monety i klejnoty w kuźni. Raport nie uwzględnia wydatków w kuźni.',
    '🔨 Dzień 5: kucie, badania technologii, wykluwanie jaj oraz łączenie zwierzaków lub jajek. Raport nie uwzględnia badań ani wykluwania.',
  ];

  static weekday(key) { return new Date(`${key}T12:00:00Z`).getUTCDay(); }

  static message(key) {
    const weekday = this.weekday(key);
    return { content: `**🔔 Przypomnienie o 20:00: ${this.weekdays[weekday]}**\n${this.actions[weekday]}\n\n`
      + '✏️ Po wydaniu zasobów zaktualizuj **/update**, aby raporty klanu były aktualne. Koszty przywołań zmienisz przez **/costs**. Menu i raporty znajdziesz w **/start**.\n'
      + (weekday === 1 ? '' : '⏰ Ten dzień wojny kończy się jutro o **02:00**.\n')
      + 'Rozkazy dowództwa klanu określają, kiedy wydajemy zasoby.',
    allowed_mentions: { parse: [] }, components: Navigation.welcome() };
  }

  static next(now, calendar = new WarCalendar()) {
    let key = calendar.dateKey(now);
    if (calendar.local(now).hour >= 20) key = calendar.shift(key, 1);
    // Resolve 20:00 in Warsaw independently of the host timezone and DST.
    for (const hour of [18, 19]) {
      const candidate = new Date(`${key}T${hour}:00:00Z`);
      if (calendar.local(candidate).hour === 20) return candidate;
    }
    throw new Error('Cannot resolve daily reminder time.');
  }
}
