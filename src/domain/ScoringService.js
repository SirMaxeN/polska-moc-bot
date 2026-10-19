import { UserInputError } from './UserInputError.js';

export class ScoringService {
  static categories = {
    skillSummon: { base: 125, label: 'Przyzywanie umiejętności', days: [1, 3] },
    mountSummon: { base: 600, label: 'Przyzywanie wierzchowców', days: [2, 4] },
    mountMerge: { base: 600, label: 'Łączenie wierzchowców', days: [2, 4] },
    forge: { base: 3, label: 'Kucie wyposażenia', days: [1, 3, 5] },
    petMerge: { base: 1250, label: 'Łączenie zwierzaków lub jajek', days: [3, 5] },
    dungeon: { base: 3000, label: 'Lochy', days: [1, 4] },
  };

  rate(category, day, tech) {
    return Math.round(ScoringService.categories[category].base * (100 + tech[category] + tech[`day${day}`]) / 100);
  }

  player(player, tech) {
    const counts = {
      skillSummon: Math.floor(player.skill_tickets / (player.skill_cost_x5 ?? 200)) * 5,
      mountSummon: Math.floor(player.mount_keys / (player.mount_cost ?? 50)),
      mountMerge: Math.floor(player.mount_keys / (player.mount_cost ?? 50)) + (player.mounts ?? 0),
      forge: player.hammers, petMerge: player.pets, dungeon: 8,
    };
    return Array.from({ length: 6 }, (_, index) => {
      const day = index + 1;
      if (day === 6) return { day, total: null, categories: {}, approximate: false };
      const categories = Object.fromEntries(Object.entries(ScoringService.categories)
        .filter(([, category]) => category.days.includes(day))
        .map(([id]) => [id, counts[id] * this.rate(id, day, tech)]));
      const total = Object.values(categories).reduce((sum, value) => sum + value, 0);
      if (!Number.isSafeInteger(total)) throw new UserInputError('Zasoby są zbyt duże, aby bezpiecznie obliczyć wynik.');
      return { day, total, categories, approximate: 'forge' in categories && player.hammers > 0 };
    });
  }

  clan(players, tech) {
    const members = players.map(player => ({ player, days: this.player(player, tech) }));
    const days = Array.from({ length: 6 }, (_, i) => ({
      day: i + 1,
      total: i === 5 ? null : members.reduce((sum, member) => sum + member.days[i].total, 0),
      approximate: members.some(member => member.days[i].approximate),
    }));
    if (days.some(day => day.total !== null && !Number.isSafeInteger(day.total))) throw new UserInputError('Suma klanu jest zbyt duża.');
    return { members, days };
  }
}

