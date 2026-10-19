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
  ].map(([key, label]) => [key, label, initialTech[key]]);

  static defaults() { return Object.fromEntries(this.entries.map(([id, , value]) => [id, value])); }
  static label(id) { return this.entries.find(([key]) => key === id)?.[1]; }
}
