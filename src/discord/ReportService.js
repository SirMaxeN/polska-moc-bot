import { ScoringService } from '../domain/ScoringService.js';
import { Ascension } from '../domain/Ascension.js';
import { Navigation } from './Navigation.js';
import { ParticipationReminders } from './ParticipationReminders.js';
import { ReportPaginator } from './ReportPaginator.js';
import { sortPlayers } from './PlayerOrder.js';

const indent = text => text.split('\n').map(line => `\u00a0\u00a0\u00a0\u00a0\u00a0${line}`).join('\n');

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
  score(day) {
    if (day.total === null) return 'Brak prognozy';
    return `${day.approximate ? '≈ ' : ''}${this.number(day.total)} pkt`
      + (day.ascension ? ` + ${Ascension.emoji} ${this.number(day.ascension)} pkt ze wzniesienia` : '');
  }
  categoryLines(day) {
    const icons = { skillSummon: '🎟️', mountSummon: '🔑', mountMerge: '🐎', forge: '🔨', petMerge: '🥚', dungeon: '🗝️' };
    return Object.entries(day.categories).map(([key, value]) => {
      const reserved = day.ascensionCategories?.includes(key);
      return `${icons[key]} ${reserved ? `${Ascension.emoji} ` : ''}${ScoringService.categories[key].label}: ${key === 'forge' && day.approximate ? '≈ ' : ''}${this.number(value)} pkt${reserved ? ' (wzniesienie)' : ''}`;
    }).join('\n');
  }
  name(player) { return `${this.escape(player.name)}${Ascension.tag(player.ascension, true)}`; }
  legend(players) { return players.some(player => player.ascension?.length) ? `\n\n${Ascension.legend}` : ''; }
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

  static resourceLabels = { skill_tickets: 'Bilety', mount_keys: 'Klucze wierzchowców', hammers: 'Młotki', pets: 'Zwierzaki lub jajka (bez 3 bazowych)', mounts: 'Wierzchowce (bez 1 bazowego)' };

  static resourceOptions() {
    return [...Object.entries(this.resourceLabels), ...Object.entries(this.extraLabels).map(([key, [, label]]) => [key, label])];
  }

  resources(player, tech, separateExtras = false) {
    const labels = ReportService.resourceLabels;
    const points = tech ? this.resourcePoints(player, tech) : null;
    const reserved = Ascension.resources(player.ascension);
    const notice = reserved.size ? `${Ascension.emoji} **Wzniesienie: ${player.ascension.map(type => Ascension.types[type].label).join(', ')}** · punkty z oznaczonych zasobów mogą być niedostępne\n` : '';
    return notice + Object.entries(labels).map(([key, label]) => `${reserved.has(key) ? `${Ascension.emoji} ` : ''}${ReportService.emojis[key] ?? '🐎'} ${label}: **${this.number(player[key] ?? 0)}**${points ? ` : max **${key === 'hammers' ? '≈ ' : ''}${this.number(points[key])} pkt**` : ''}${reserved.has(key) ? ' · wzniesienie' : ''}`).join('\n')
      + `\nKoszt x5: **${this.number(player.skill_cost_x5 ?? 200)}** (${player.skill_cost_x5 == null ? 'domyślny' : 'własny'})`
      + `\nKoszt 1 wierzchowca: **${this.number(player.mount_cost ?? 50)}** (${player.mount_cost == null ? 'domyślny' : 'własny'})`
      + this.extras(player, separateExtras ? '\n' : ' · ')
      + `\nAktualizacja zasobów: ${player.updated_at ? this.time(player.updated_at) : 'brak wpisu'}`;
  }

  /** Vials, gems, shells, coins: shown only, never counted in points. */
  static extraLabels = { green_vials: ['🧪', 'Zielone fiolki'], gems: ['💎', 'Diamenty'], red_vials: ['⚗️', 'Czerwone fiolki'], shells: ['🥚', 'Skorupki'], coins: ['🪙', 'Monety'] };

  extras(player, separator = ' · ') {
    const known = Object.entries(ReportService.extraLabels).filter(([key]) => player[key] != null);
    return known.length ? `\n${known.map(([key, [emoji, label]]) => `${emoji} ${label}: **${this.number(player[key])}**`).join(separator)} *(bez punktów)*` : '';
  }

  dayResources(player, day, tech) {
    const rate = category => ScoringService.categories[category].days.includes(day) && day !== 6
      ? this.scoring.rate(category, day, tech) : 0;
    const summons = Math.floor(player.mount_keys / (player.mount_cost ?? 50));
    const reserved = Ascension.resources(player.ascension);
    return [
      { key: 'skill_tickets', label: 'Bilety', count: player.skill_tickets, points: Math.floor(player.skill_tickets / (player.skill_cost_x5 ?? 200)) * 5 * rate('skillSummon') },
      { key: 'mount_keys', label: 'Klucze wierzchowców (przyzwanie + łączenie nowych)', count: player.mount_keys, points: summons * (rate('mountSummon') + rate('mountMerge')) },
      { key: 'mounts', label: 'Posiadane wierzchowce (łączenie, bez 1 bazowego)', count: player.mounts ?? 0, points: (player.mounts ?? 0) * rate('mountMerge') },
      { key: 'hammers', label: 'Młotki', count: player.hammers, points: player.hammers * rate('forge') },
      { key: 'pets', label: 'Zwierzaki lub jajka (bez 3 bazowych)', count: player.pets, points: player.pets * rate('petMerge') },
    ].map(row => reserved.has(row.key) ? { ...row, points: 0, ascensionPoints: row.points } : { ...row, ascensionPoints: 0 });
  }

  dayResourceLines(rows, day) {
    return rows.map(row => {
      const only = row.ascensionPoints > 0 && row.points === 0;
      const value = points => `${row.key === 'hammers' && points > 0 ? '≈ ' : ''}${this.number(points)} pkt`;
      const result = day === 6 ? 'Brak prognozy' : only ? `${value(row.ascensionPoints)} (wzniesienie)`
        : `${value(row.points)}${row.ascensionPoints ? ` + ${Ascension.emoji} ${value(row.ascensionPoints)} ze wzniesienia` : ''}`;
      return `${only ? `${Ascension.emoji} ` : ''}${ReportService.emojis[row.key] ?? '🐎'} ${row.label}: **${this.number(row.count)}** → **${result}**`;
    }).join('\n');
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

  render(kind, snapshot, userId, now = new Date()) {
    snapshot = { ...snapshot, players: sortPlayers(snapshot.players) };
    const cycle = this.calendar.cycle(now);
    const model = this.scoring.clan(snapshot.players, snapshot.tech);
    const date = `${this.time(cycle.starts[0])} : ${this.time(cycle.end)}`;
    const base = `Cykl: ${date}\nWygenerowano: ${this.time(now)}\n\n${ReportService.note}`;
    const enrollment = ParticipationReminders.enrollmentLabel(snapshot.enrollment, snapshot.players.length);
    const individualCards = ['resources', 'selected-resources', 'clan-ultra'].includes(kind);
    let template;
    let groups;
    if (kind === 'selected') {
      const day = snapshot.selectedDay;
      const total = model.days[day - 1];
      template = { title: `📌 Wybrani gracze: dzień ${day} (${ReportService.weekdays[day - 1]})`,
        description: `${base}\n\nData dnia: ${this.time(cycle.starts[day - 1])}.\nPotencjał z aktualnie zapisanych zasobów, nie historyczny wynik. Wybranych graczy: **${model.members.length}**.` };
      const resourceRows = model.members.map(member => this.dayResources(member.player, day, snapshot.tech));
      const dungeonLine = points => day === 1 || day === 4 ? `\nLochy (założenie: 8 kluczy na gracza): **${this.number(points)} pkt**` : '';
      template.description += this.legend(snapshot.players);
      const fields = model.members.map((member, index) => ({ name: this.name(member.player),
        value: indent(`${this.dayResourceLines(resourceRows[index], day)}${dungeonLine(member.days[day - 1].categories.dungeon)}\n**Razem: ${this.score(member.days[day - 1])}**\nAktualizacja: ${this.time(member.player.updated_at)}`) }));
      const sums = (resourceRows[0] ?? []).map((row, index) => ({ ...row,
        count: resourceRows.reduce((sum, rows) => sum + rows[index].count, 0),
        points: resourceRows.reduce((sum, rows) => sum + rows[index].points, 0),
        ascensionPoints: resourceRows.reduce((sum, rows) => sum + rows[index].ascensionPoints, 0) }));
      fields.push({ name: `Suma wybranych: dzień ${day}`, value: `${this.dayResourceLines(sums, day)}${dungeonLine(model.members.reduce((sum, member) => sum + (member.days[day - 1].categories.dungeon ?? 0), 0))}\n**Razem: ${this.score(total)}**\nNie uwzględniamy: ${ReportService.excluded[day - 1]}.` });
      groups = [{ label: 'wybrani gracze', fields }];
    } else if (kind === 'selected-resources') {
      const options = new Map(ReportService.resourceOptions());
      const keys = snapshot.resourceKeys;
      template = { title: '🎒 Wybrane zasoby', description: `Cykl: ${date}\nGracze z zapisanymi danymi: **${snapshot.players.length}**.\n„Brak odczytu” oznacza, że gracz nie podał tego zasobu.` };
      const fields = snapshot.players.map(player => ({ name: this.name(player), value: indent(keys.map(key => {
        const icon = ReportService.extraLabels[key]?.[0] ?? ReportService.emojis[key] ?? '🐎';
        return `${icon} ${options.get(key)}: **${player[key] == null ? 'brak odczytu' : this.number(player[key])}**`;
      }).join('\n')) }));
      groups = [{ label: 'wybrane zasoby', fields }];
    } else if (kind === 'updated') {
      const start = this.calendar.boundary(now.toISOString().slice(0, 10));
      const players = snapshot.players.filter(player => Date.parse(player.updated_at) >= start.getTime() && Date.parse(player.updated_at) <= now.getTime());
      template = { title: '✅ Dzisiejsze aktualizacje',
        description: `Od resetu gry: ${this.time(start)}\nWygenerowano: ${this.time(now)}\nWpisali lub zaktualizowali zasoby: **${players.length}**. Zmiana samych kosztów nie liczy się jako aktualizacja.` };
      const fields = players.length ? players.map(player => ({ name: this.escape(player.name), value: indent(`🕒 Aktualizacja: ${this.time(player.updated_at)}`) }))
        : [{ name: 'Brak aktualizacji', value: 'Nikt jeszcze nie wpisał ani nie zaktualizował dziś zasobów.' }];
      groups = [{ label: 'dzisiejsze aktualizacje', fields }];
    } else if (kind === 'resources') {
      const keys = ['skill_tickets', 'mount_keys', 'mounts', 'hammers', 'pets'];
      const labels = { skill_tickets: 'Bilety', mount_keys: 'Klucze wierzchowców', mounts: 'Wierzchowce', hammers: 'Młotki', pets: 'Zwierzaki lub jajka' };
      template = { title: '🎒 Zasoby klanu', description: `Cykl: ${date}\nWygenerowano: ${this.time(now)}\n\n${enrollment}\nMaksymalne punkty za każdy zasób w najlepszym dniu, bez sumowania dni i bez lochów. Klucze: przyzwanie + połączenie nowych sztuk. Posiadane wierzchowce: tylko połączenie. Wierzchowce bez 1 bazowego; zwierzaki lub jajka bez 3 bazowych.${this.legend(snapshot.players)}` };
      const fields = snapshot.players.map(player => ({ name: this.name(player), value: indent(this.resources(player, snapshot.tech, true)) }));
      const potentials = snapshot.players.map(player => this.resourcePoints(player, snapshot.tech));
      const reserved = snapshot.players.map(player => Ascension.resources(player.ascension));
      const sum = (key, ascension) => snapshot.players.reduce((total, player, index) => total + (reserved[index].has(key) === ascension ? potentials[index][key] : 0), 0);
      const count = (key, ascension) => snapshot.players.reduce((total, player, index) => total + (reserved[index].has(key) === ascension ? player[key] ?? 0 : 0), 0);
      const approx = key => key === 'hammers' ? '≈ ' : '';
      fields.push({ name: 'Suma zasobów klanu', value: keys.map(key => `${ReportService.emojis[key] ?? '🐎'} ${labels[key]}: **${this.number(count(key, false) + count(key, true))}** : max **${approx(key)}${this.number(sum(key, false))} pkt**`
        + (count(key, true) ? ` + ${Ascension.emoji} **${approx(key)}${this.number(sum(key, true))} pkt** ze wzniesienia (${this.number(count(key, true))} szt.)` : '')).join('\n') });
      const extras = Object.entries(ReportService.extraLabels).filter(([key]) => snapshot.players.some(player => player[key] != null));
      if (extras.length) fields.push({ name: 'Pozostałe zasoby klanu (bez punktów)', value: extras.map(([key, [emoji, label]]) =>
        `${emoji} ${label}: **${this.number(snapshot.players.reduce((total, player) => total + (player[key] ?? 0), 0))}** (${snapshot.players.filter(player => player[key] != null).length} graczy)`).join('\n') });
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
      template = { title: `📊 Raport gracza: ${this.escape(member.player.name)}${member.player.ascension?.length ? ` ${Ascension.emoji}` : ''}`, description: `${base}\n\n${this.resources(member.player)}${this.legend([member.player])}` };
    } else if (!model.members.length) {
      return { content: '', embeds: [{ title: '👥 Raport klanu', description: `${enrollment}\nBrak wpisanych zasobów w tym cyklu. Gracze mogą użyć /update.` }], components: Navigation.all(userId) };
    } else if (kind === 'clan') {
      template = { title: '👥 Raport klanu', description: `${base}\n\n${enrollment}${this.legend(snapshot.players)}` };
      groups = model.days.map(day => ({ day: day.day, header: this.header(cycle, day.day, now), fields: [{
        name: this.header(cycle, day.day, now), value: `**${this.score(day)}**${this.lastChance(cycle, day.day, snapshot.players, now)}\nNie uwzględniamy: ${ReportService.excluded[day.day - 1]}.`,
      }] }));
    } else {
      groups = model.days.filter(day => !snapshot.reportDays || snapshot.reportDays.includes(day.day)).map(day => {
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
          const details = `**${this.score(result)}**`
            + this.lastChance(cycle, day.day, [member.player], now)
            + `\n🕒 *Aktualizacja: ${member.player.updated_at ? this.time(member.player.updated_at) : 'brak wpisu'}*`
            + (kind === 'clan-ultra' ? `\n${this.categoryLines(result)}` : '');
          const line = `**${this.escape(member.player.name)}**${Ascension.tag(member.player.ascension)}\n${indent(details)}`;
          if (lines.length && (individualCards || lines.join('\n\n').length + line.length + 2 > 950)) flush();
          lines.push(line);
        }
        flush();
        fields.push({ name: `Suma klanu: dzień ${day.day}`, value: `**${this.score(day)}**\nNie uwzględniamy: ${ReportService.excluded[day.day - 1]}.` });
        return { day: day.day, header, fields };
      });
      template = { title: kind === 'clan-ultra' ? '🔎 Ultra szczegółowy raport klanu' : '📋 Szczegółowy raport klanu',
        description: `${base}\n\n${enrollment}${snapshot.reportDays ? `\nWybrane dni: **${snapshot.reportDays.join(', ')}**.` : ''}${this.legend(snapshot.players)}` };
    }
    const intro = { ...template, fields: [], color: 0x3498db };
    const pages = individualCards ? ReportPaginator.cards(intro, groups) : ReportPaginator.pack({ title: template.title }, groups, intro)
      .map((embed, index) => [...(index === 0 ? [intro] : []), { ...embed, color: 0xc72c3b }]);
    const messages = pages.map((embeds, index) => ({
      content: '', embeds: embeds.map((embed, i) => i === embeds.length - 1
        ? { ...embed, footer: { text: pages.length > 1 ? `Część ${index + 1}/${pages.length} · Europe/Warsaw` : 'Europe/Warsaw' } } : embed),
      components: Navigation.all(userId),
    }));
    if (!['player', 'selected', 'selected-resources', 'updated'].includes(kind)) messages.push(...ParticipationReminders.outsiderMessages(snapshot.enrollment).map(message => ({ ...message, components: Navigation.all(userId) })));
    return { ...messages[0], ...(messages.length > 1 ? { additionalMessages: messages.slice(1) } : {}) };
  }
}
