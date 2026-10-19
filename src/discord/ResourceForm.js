import { NumberParser } from '../domain/NumberParser.js';
import { UserInputError } from '../domain/UserInputError.js';
import { ReportService } from './ReportService.js';
import { Navigation } from './Navigation.js';

export class ResourceForm {
  static fields = [
    ['skill_tickets', '🎟️ Bilety umiejętności'],
    ['mount_keys', '🔑 Klucze wierzchowców'],
    ['mounts', '🐎 Wierzchowce (bez 1 bazowego)'],
    ['hammers', '🔨 Młotki'],
    ['pets', '🥚 Zwierzaki lub jajka (bez 3 bazowych)'],
  ];

  static open(userId, player) {
    return { type: 9, data: { custom_id: `resources:${userId}:save`, title: '✏️ Aktualizuj swoje zasoby',
      components: this.fields.map(([key, label], index) => ({ type: 18, label,
        ...(index === 0 ? { description: 'W każdym polu: + - * / i nawiasy, np. 3+5*3=18 lub (3+5)*5-2=38. Wpisz samo działanie.' } : {}),
        component: { type: 4, custom_id: key, style: 1, required: false, max_length: 128,
          ...(key === 'skill_cost_x5' ? { value: String(player?.skill_cost_x5 ?? 200) }
            : player?.[key] != null ? { value: String(player[key]) } : {}),
        },
      })),
    } };
  }

  static costs(userId, player) {
    return { type: 9, data: { custom_id: `resources:${userId}:save-costs`, title: '⚙️ Koszty przywołań',
      components: [
        ['skill_cost_x5', '🎟️ Koszt 5 umiejętności', 200],
        ['mount_cost', '🔑 Koszt 1 wierzchowca', 50],
      ].map(([key, label, fallback], index) => ({ type: 18, label,
        ...(index === 0 ? { description: 'Możesz obliczać: + - * / i nawiasy, np. 200-3*4=188. Wpisz samo działanie.' } : {}), component: {
        type: 4, custom_id: key, style: 1, required: false, max_length: 128,
        value: String(player?.[key] ?? fallback),
      } })),
    } };
  }

  static buttons(userId) {
    return [...Navigation.update(userId), ...Navigation.reports(userId)];
  }

  static panel(userId, player, reports) {
    return { content: '**✏️ Aktualizuj swoje zasoby**\n'
      + `${ReportService.emojis.skill_tickets} Bilety · ${ReportService.emojis.mount_keys} Klucze · ${ReportService.emojis.hammers} Młotki · ${ReportService.emojis.pets} Zwierzaki lub jajka\n`
      + '-# *Format zasobów: 9550 = 9,55 = 9.55 = 9,55k = 9.55k. Koszty wpisuj jako pełne liczby.*\n'
      + '-# *Puste pole zachowuje dane; 0 zeruje zasób.*\n\n'
      + '-# W każdym polu możesz liczyć: `3+5*3` = 18, `(3+5)*5-2` = 38. Wpisz samo działanie, bez znaku =.\n\n'
      + (player ? reports.resources(player) : 'Nie masz jeszcze zapisanych danych. Domyślne koszty: 200 biletów za 5 umiejętności i 50 kluczy za 1 wierzchowca.'),
      components: this.buttons(userId) };
  }

  static parse(components) {
    const values = {};
    for (const field of components.flatMap(row => row.component ? [row.component] : row.components ?? [])) {
      if (!this.fields.some(([key]) => key === field.custom_id) && !['skill_cost_x5', 'mount_cost'].includes(field.custom_id)) throw new UserInputError('Nieznane pole aktualizacji.');
      if (String(field.value ?? '').trim() === '') continue;
      const isCost = ['skill_cost_x5', 'mount_cost'].includes(field.custom_id);
      values[field.custom_id] = NumberParser.integer(field.value, {
        positive: isCost, implicitThousands: !isCost,
      });
    }
    return values;
  }
}
