import { WarReport } from './WarReport.js';

/**
 * Clan Tech Race donation points: green potions and gems become tech points
 * (2 potions or 1 gem per point), increased by the saved donation research bonus.
 */
export class DonationReport {
  static points(count, perPoint, bonus) {
    return Math.floor(Math.floor((count ?? 0) / perPoint) * (100 + bonus) / 100);
  }

  static render(players, raceBonus = 0) {
    const clean = WarReport.clean.bind(WarReport), number = WarReport.number.bind(WarReport);
    const rows = players.filter(player => player.green_vials != null || player.gems != null).map(player => {
      const vials = player.green_vials ?? 0, gems = player.gems ?? 0;
      const vialPoints = this.points(vials, 2, raceBonus), gemPoints = this.points(gems, 1, raceBonus);
      return { name: player.name, vials, gems, vialPoints, gemPoints, total: vialPoints + gemPoints };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const sum = key => rows.reduce((total, row) => total + row[key], 0);
    const header = [
      'Punkty bazowe: **2** 🧪 zielone fiolki = 1 pkt · **1** 💎 diament = 1 pkt.',
      `Premia „Darowizny w wyścigu klanu” z /tech show: **+${number(raceBonus, 0)}%**.`,
      `Wpisali zielone fiolki lub diamenty: **${rows.length}** z **${players.length}** graczy, którzy w tym cyklu wpisali zasoby (Dodatkowe informacje albo skan zasobów).`,
    ].join('\n');
    const lines = rows.map(row => `**${clean(row.name)}**: 🧪 ${number(row.vials, 0)} → ${number(row.vialPoints, 0)} pkt · 💎 ${number(row.gems, 0)} → ${number(row.gemPoints, 0)} pkt · 🧮 Suma: **${number(row.total, 0)} pkt**`);
    const total = `**Suma klanu:** 🧪 ${number(sum('vials'), 0)} → **${number(sum('vialPoints'), 0)} pkt** · 💎 ${number(sum('gems'), 0)} → **${number(sum('gemPoints'), 0)} pkt** · razem **${number(sum('total'), 0)} pkt**`;
    const embeds = [];
    let current = { title: '🏁 Wyścig klanu — punkty za darowizny', color: 0x61d6ac, description: `${header}\n\n` };
    for (const line of [...(lines.length ? lines : ['Nikt nie wpisał jeszcze zielonych fiolek ani diamentów.']), '', total]) {
      if (current.description.length + line.length + 1 > 3900) { embeds.push(current); current = { color: 0x61d6ac, description: '' }; }
      current.description += `${line}\n`;
    }
    embeds.push(current);
    return { embeds: embeds.slice(0, 2), totals: { vials: sum('vialPoints'), gems: sum('gemPoints'), total: sum('total') } };
  }

  static techReport(clanTech) {
    const clean = WarReport.clean.bind(WarReport), number = WarReport.number.bind(WarReport);
    if (!clanTech) return { embeds: [{ title: '🔬 Badania klanu', description: 'Brak odczytu. Użyj w aplikacji **Badania klanu**, aby zeskanować drzewo badań klanu.' }] };
    const level = node => node.level != null ? ` ${node.level}${node.max ? `/${node.max}` : ''}${node.maxed ? ' (maks.)' : ''}` : node.maxed ? ' Maks.' : '';
    const lines = clanTech.nodes.map(node => `• **${clean(node.name || node.text.slice(0, 40))}**${level(node)}${node.percent != null ? ` · +${number(node.percent, 1)}%` : ''}`);
    let description = `Odczyt: <t:${Math.floor(Date.parse(clanTech.observed_at) / 1000)}:f>${clanTech.clan ? ` · ${clean(clanTech.clan)}` : ''}\n\n`;
    const embeds = [];
    for (const line of lines) {
      if (description.length + line.length > 3900) { embeds.push({ title: embeds.length ? undefined : '🔬 Badania klanu', color: 0x61d6ac, description }); description = ''; }
      description += `${line}\n`;
    }
    embeds.push({ title: embeds.length ? undefined : '🔬 Badania klanu', color: 0x61d6ac, description });
    return { embeds: embeds.slice(0, 2) };
  }
}
