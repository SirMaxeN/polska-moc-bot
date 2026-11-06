import { UserInputError } from '../domain/UserInputError.js';

/** Accept only a complete, numeric scanner payload, never account or server identifiers. */
export class ResourceImport {
  static keys = ['skill_tickets', 'mount_keys', 'mounts', 'hammers', 'pets', 'skill_cost_x5', 'mount_cost'];
  static parse(input) {
    if (typeof input !== 'string' || input.length > 1024) throw new UserInputError('Nieprawidłowy rozmiar importu.');
    let data;
    try { data = JSON.parse(input); } catch { throw new UserInputError('Wklej pełne dane z komendy skopiowanej w skanerze.'); }
    if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).length !== this.keys.length ||
        Object.keys(data).some(key => !this.keys.includes(key))) throw new UserInputError('Import musi zawierać dokładnie 7 pól zasobów i kosztów.');
    const values = {};
    for (const key of this.keys) {
      const value = data[key];
      const cost = ['skill_cost_x5', 'mount_cost'].includes(key);
      if (!Number.isSafeInteger(value) || value < (cost ? 1 : 0) || value > 9_000_000_000_000) throw new UserInputError('Zasoby muszą być nieujemnymi liczbami całkowitymi, a koszty dodatnimi (maks. 9 bilionów).');
      values[key] = value;
    }
    return values;
  }
}
