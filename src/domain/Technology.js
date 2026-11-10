import initialTech from '../../config/initial-tech.json' with { type: 'json' };

export class Technology {
  static entries = [
    ['forge', 'Kucie wyposażenia'],
    ['skillSummon', 'Przyzywanie umiejętności'],
    ['skillUpgrade', 'Ulepszanie umiejętności'],
    ['research', 'Drzewo technologii'],
    ['forgeSpending', 'Wydawanie w kuźni'],
    ['dungeon', 'Klucze do lochów'],
    ['egg', 'Wykluwanie jaj'],
    ['petMerge', 'Łączenie zwierzaków lub jajek'],
    ['mountSummon', 'Przyzywanie wierzchowców'],
    ['mountMerge', 'Łączenie wierzchowców'],
    ...Array.from({ length: 6 }, (_, i) => [`day${i + 1}`, `Wojna klanów: dzień ${i + 1}`]),
    ['raceRewards', 'Mikstury z wyścigu klanu', 5, 20],
    ['raceDonations', 'Darowizny w wyścigu klanu', 5, 20],
    ['warDamage', 'Obrażenia w wojnie klanów', 100, 100],
    ['warHealth', 'Zdrowie w wojnie klanów', 100, 100],
  ].map(([key, label, step = 4, max = 10]) => [key, label, initialTech[key] ?? 0, step, max]);

  static defaults() { return Object.fromEntries(this.entries.map(([id, , value]) => [id, value])); }
  static label(id) { return this.entries.find(([key]) => key === id)?.[1]; }
  static rule(id) {
    const entry = this.entries.find(([key]) => key === id);
    return entry && { step: entry[3], max: entry[3] * entry[4], level: entry[4] };
  }
}
