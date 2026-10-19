import { ScoringService } from '../domain/ScoringService.js';
import { Navigation } from './Navigation.js';
import { ParticipationReminders } from './ParticipationReminders.js';
import { ReportPaginator } from './ReportPaginator.js';

export class ReportService {
  static weekdays = ['wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
  static excluded = [
    'Ulepszanie umiejętności', 'Monety i klejnoty w kuźni; badania technologii',
    'Ulepszanie umiejętności; wykluwanie jaj', 'Monety i klejnoty w kuźni',
    'Badania technologii; wykluwanie jaj', 'Walki z rywalami; otwarta bijatyka',
  ];
  static note = 'Maksymalny potencjał z zapisanych zasobów. Każdy dzień liczony niezależnie; wyników dni nie sumujemy. Po wydaniu zasobów użyj /update. Kucie jest szacunkowe (Multiwersum lub wyżej). Łączenie wierzchowców obejmuje nowe przyzwania i zapisane posiadane sztuki bez 1 bazowego.';
  static emojis = {
    skill_tickets: '<:skillticket:1559351708080021526>', mount_keys: '<:mountkey:1559351707010334813>',
    hammers: '<:hammer:1559351705118834689>', pets: '<:egg:1559351702149144637>',
  };

  constructor(calendar, scoring) {
    this.calendar = calendar;
    this.scoring = scoring;
    this.numberFormatter = new Intl.NumberFormat('pl-PL');
    this.timeFormatter = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });
  }
  number(value) { return this.numberFormatter.format(value); }
  escape(value) { return String(value).replace(/[\\`*_~|<>@]/g, '\\$&').replace(/[\r\n]/g, ' '); }
  time(value) { return this.timeFormatter.format(new Date(value)); }
  score(day) { return day.total === null ? 'Brak prognozy' : `${day.approximate ? '≈ ' : ''}${this.number(day.total)} pkt`; }
  categoryLines(day) {
    return Object.entries(day.categories).map(([key, value]) => `${ScoringService.categories[key].label}: ${key === 'forge' && day.approximate ? '≈ ' : ''}${this.number(value)} pkt`).join('\n');
  }
  lastChance(cycle, day, players, now) {
    if (this.calendar.status(cycle, day, now) !== 'current') return '';
    const resources = [
      ['skill_tickets', 'skillSummon', 'wydanie biletów umiejętności'],
      ['mount_keys', 'mountSummon', 'wydanie kluczy wierzchowców'],
      ['mounts', 'mountMerge', 'połączenie posiadanych wierzchowców'],
      ['hammers', 'forge', 'wydanie młotków'],
      ['pets', 'petMerge', 'połączenie zwierzaków lub jajek'],
    ];
    const labels = resources.filter(([resource, category]) =>
      Math.max(...ScoringService.categories[category].days) === day && players.some(player => player[resource] > 0))
      .map(([, , label]) => label);
    return labels.length ? `\n❗ **Ostatni dzień na: ${labels.join('; ')}.**` : '';
  }
  header(cycle, day, now) {
    const label = `Dzień ${day}: ${ReportService.weekdays[day - 1]}`;
    const status = this.calendar.status(cycle, day, now);
    const minutes = Math.max(1, Math.ceil((cycle.starts[day] - now) / 60000));
    const remaining = minutes >= 60 ? `${Math.floor(minutes / 60)} godz.${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
    return status === 'past' ? `🔴 ~~${label}~~` : status === 'current' ? `🟢 **${label}** · koniec za ${remaining}` : `⚪ ${label}`;
  }

  resourcePoints(player, tech) {
    const maximum = (categories, count) => Math.max(...ScoringService.categories[categories[0]].days.map(day =>
      count * categories.reduce((sum, category) => sum + this.scoring.rate(category, day, tech), 0)));
    return {
      skill_tickets: maximum(['skillSummon'], Math.floor(player.skill_tickets / (player.skill_cost_x5 ?? 200)) * 5),
      mount_keys: maximum(['mountSummon', 'mountMerge'], Math.floor(player.mount_keys / (player.mount_cost ?? 50))),
      mounts: maximum(['mountMerge'], player.mounts ?? 0),
      hammers: maximum(['forge'], player.hammers), pets: maximum(['petMerge'], player.pets),
    };
  }

  resources(player, tech) {
    const labels = { skill_tickets: 'Bilety', mount_keys: 'Klucze wierzchowców', hammers: 'Młotki', pets: 'Zwierzaki lub jajka (bez 3 bazowych)', mounts: 'Wierzchowce (bez 1 bazowego)' };
    const points = tech ? this.resourcePoints(player, tech) : null;
    return Object.entries(labels).map(([key, label]) => `${ReportService.emojis[key] ?? '🐎'} ${label}: **${this.number(player[key] ?? 0)}**${points ? ` : max **${key === 'hammers' ? '≈ ' : ''}${this.number(points[key])} pkt**` : ''}`).join('\n')
      + `\nKoszt x5: **${this.number(player.skill_cost_x5 ?? 200)}** (${player.skill_cost_x5 == null ? 'domyślny' : 'własny'})`
      + `\nKoszt 1 wierzchowca: **${this.number(player.mount_cost ?? 50)}** (${player.mount_cost == null ? 'domyślny' : 'własny'})`
      + `\nAktualizacja zasobów: ${player.updated_at ? this.time(player.updated_at) : 'brak wpisu'}`;
  }

  rates(tech) {
    return Object.entries(ScoringService.categories).map(([key, category]) => {
      const groups = new Map();
      for (const day of category.days) {
        const rate = this.scoring.rate(key, day, tech);
        groups.set(rate, [...(groups.get(rate) ?? []), day]);
      }
      return `${category.label}: ${[...groups].map(([rate, days]) => `${key === 'forge' ? '≈ ' : ''}${this.number(rate)} pkt/${key === 'dungeon' ? 'klucz' : 'szt.'} (dni ${days.join(', ')})`).join('; ')}`;
    }).join('\n') + '\nLochy: po 2 klucze do każdego z 4 lochów w dniach 1 i 4.';
  }

  render(kind, snapshot, userId, now = new Date(), requestedPage = 0) {
    const cycle = this.calendar.cycle(now);
    const model = this.scoring.clan(snapshot.players, snapshot.tech);
    const date = `${this.time(cycle.starts[0])} : ${this.time(cycle.end)}`;
    const base = `Cykl: ${date}\nWygenerowano: ${this.time(now)}\n\n${ReportService.note}`;
    const enrollment = ParticipationReminders.enrollmentLabel(snapshot.enrollment, snapshot.players.length);
    let template;
    let groups;
    if (kind === 'resources') {
      const keys = ['skill_tickets', 'mount_keys', 'mounts', 'hammers', 'pets'];
      const labels = { skill_tickets: 'Bilety', mount_keys: 'Klucze wierzchowców', mounts: 'Wierzchowce', hammers: 'Młotki', pets: 'Zwierzaki lub jajka' };
      template = { title: '🎒 Zasoby klanu', description: `Cykl: ${date}\nWygenerowano: ${this.time(now)}\n\n${enrollment}\nMaksymalne punkty za każdy zasób w najlepszym dniu, bez sumowania dni i bez lochów. Klucze: przyzwanie + połączenie nowych sztuk. Posiadane wierzchowce: tylko połączenie. Wierzchowce bez 1 bazowego; zwierzaki lub jajka bez 3 bazowych.` };
      const fields = snapshot.players.map(player => ({ name: this.escape(player.name), value: this.resources(player, snapshot.tech) }));
      const potentials = snapshot.players.map(player => this.resourcePoints(player, snapshot.tech));
      fields.push({ name: 'Suma zasobów klanu', value: keys.map(key => `${ReportService.emojis[key] ?? '🐎'} ${labels[key]}: **${this.number(snapshot.players.reduce((sum, player) => sum + (player[key] ?? 0), 0))}** : max **${key === 'hammers' ? '≈ ' : ''}${this.number(potentials.reduce((sum, points) => sum + points[key], 0))} pkt**`).join('\n') });
      groups = [{ label: 'lista graczy', header: fields[0].name, fields }];
    } else if (kind === 'player') {
      const member = model.members.find(item => item.player.user_id === userId);
      if (!member) return { content: '', embeds: [{ title: '📊 Raport gracza', description: 'Nie masz wpisanych zasobów w tym cyklu. Użyj /update.' }], components: Navigation.all(userId) };
      groups = member.days.map(day => ({ day: day.day, header: this.header(cycle, day.day, now), fields: [{
        name: this.header(cycle, day.day, now), value: `**${this.score(day)}**`
          + this.lastChance(cycle, day.day, [member.player], now)
          + `\n${this.categoryLines(day)}`
          + `\nNie uwzględniamy: ${ReportService.excluded[day.day - 1]}.`,
      }] }));
      groups.at(-1).fields.push({ name: 'Punkty za akcje', value: this.rates(snapshot.tech) });
      template = { title: `📊 Raport gracza: ${this.escape(member.player.name)}`, description: `${base}\n\n${this.resources(member.player)}` };
    } else if (!model.members.length) {
      return { content: '', embeds: [{ title: '👥 Raport klanu', description: `${enrollment}\nBrak wpisanych zasobów w tym cyklu. Gracze mogą użyć /update.` }], components: Navigation.all(userId) };
    } else if (kind === 'clan') {
      template = { title: '👥 Raport klanu', description: `${base}\n\n${enrollment}` };
      groups = model.days.map(day => ({ day: day.day, header: this.header(cycle, day.day, now), fields: [{
        name: this.header(cycle, day.day, now), value: `**${this.score(day)}**${this.lastChance(cycle, day.day, snapshot.players, now)}\nNie uwzględniamy: ${ReportService.excluded[day.day - 1]}.`,
      }] }));
    } else {
      groups = model.days.map(day => {
        const header = this.header(cycle, day.day, now);
        const fields = [];
        if (day.total === null) return { day: day.day, header, fields: [{ name: header,
          value: `**Brak prognozy**\nNie uwzględniamy: ${ReportService.excluded[day.day - 1]}.` }] };
        let lines = [];
        const flush = () => {
          fields.push({ name: fields.length ? '\u200b' : header, value: lines.join('\n\n') });
          lines = [];
        };
        for (const member of model.members) {
          const result = member.days[day.day - 1];
          const line = `**${this.escape(member.player.name)}**: **${this.score(result)}**`
            + this.lastChance(cycle, day.day, [member.player], now)
            + `\n> 🕒 *Aktualizacja: ${member.player.updated_at ? this.time(member.player.updated_at) : 'brak wpisu'}*`
            + (kind === 'clan-ultra' ? `\n${this.categoryLines(result)}` : '');
          if (lines.length && lines.join('\n\n').length + line.length + 2 > 950) flush();
          lines.push(line);
        }
        flush();
        fields.push({ name: `Suma klanu: dzień ${day.day}`, value: `**${this.score(day)}**\nNie uwzględniamy: ${ReportService.excluded[day.day - 1]}.` });
        return { day: day.day, header, fields };
      });
      template = { title: kind === 'clan-ultra' ? '🔎 Ultra szczegółowy raport klanu' : '📋 Szczegółowy raport klanu',
        description: `${base}\n\n${enrollment}` };
    }
    const pages = ReportPaginator.pack(template, groups);
    const messages = pages.map((embed, index) => ({
      content: '', embeds: [{ ...embed, footer: { text: pages.length > 1 ? `Część ${index + 1}/${pages.length} · Europe/Warsaw` : 'Europe/Warsaw' }, color: 0xc72c3b }],
      components: Navigation.all(userId),
    }));
    if (kind !== 'player') messages.push(...ParticipationReminders.outsiderMessages(snapshot.enrollment).map(message => ({ ...message, components: Navigation.all(userId) })));
    return { ...messages[0], ...(messages.length > 1 ? { additionalMessages: messages.slice(1) } : {}) };
  }
}
