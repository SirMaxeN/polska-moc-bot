import { randomUUID } from 'node:crypto';
import { Technology } from './Technology.js';

const scanKeys = new Map([
  ['war_forging', 'forge'], ['war_skill_summon', 'skillSummon'], ['war_skill_upgrade', 'skillUpgrade'],
  ['war_tech_tree', 'research'], ['war_forge_upgrades', 'forgeSpending'], ['war_dungeon_keys', 'dungeon'],
  ['war_eggs', 'egg'], ['war_pet_merge', 'petMerge'], ['war_mount_summon', 'mountSummon'], ['war_mount_merge', 'mountMerge'],
  ...Array.from({ length: 6 }, (_, i) => [`war_day_${i + 1}`, `day${i + 1}`]),
  ['race_rewards', 'raceRewards'], ['race_donations', 'raceDonations'], ['war_damage', 'warDamage'], ['war_health', 'warHealth'],
]);

/**
 * Clan research (clan tech tree) scanned by the app: one entry per node read from its info window.
 * Rates come from forgemaster.pro (game 2.11): Clan War Damage/Health +100%/level (max 100),
 * Clan Tech Race "donations count +5%/level more" (max 20), war-day and war-action nodes +4%/level (max 10).
 */
export class ClanTech {
  static validate(body, now = Date.now()) {
    if (!body || typeof body !== 'object' || !/^[a-f0-9-]{36}$/i.test(body.request_id ?? '')) throw new Error('Nieprawidłowy odczyt badań.');
    const observed = Date.parse(body.observed_at);
    if (!Number.isFinite(observed) || Math.abs(now - observed) > 60 * 60000) throw new Error('Nieaktualny odczyt badań.');
    if (!Array.isArray(body.nodes) || !body.nodes.length || body.nodes.length > 120) throw new Error('Brak odczytanych badań.');
    const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
    const number = (value, lo, hi) => Number.isFinite(value) && value >= lo && value <= hi ? value : null;
    const nodes = body.nodes.map(node => ({
      key: text(node?.key, 40),
      name: text(node?.name, 80), text: text(node?.text, 300),
      level: number(node?.level, 0, 1000), max: number(node?.max, 1, 1000), percent: number(node?.percent, 0, 1_000_000),
      maxed: node?.maxed === true,
    })).filter(node => node.name || node.text);
    if (!nodes.length) throw new Error('Brak odczytanych badań.');
    return { request_id: body.request_id ?? randomUUID(), observed_at: new Date(observed).toISOString(), clan: text(body.clan, 100), nodes };
  }

  static values(payload) {
    const candidates = new Map();
    for (const node of payload.nodes) {
      // Legacy APKs used names. Only the combat nodes and donation bonus have distinct legacy descriptions.
      const key = node.key ? scanKeys.get(node.key)
        : /^Obrażenia w wojnie klanów$/i.test(node.name) ? 'warDamage'
          : /^Zdrowie w wojnie klanów$/i.test(node.name) ? 'warHealth'
            : this.raceBonus({ nodes: [node] }) != null ? 'raceDonations' : null;
      const rule = Technology.rule(key);
      if (!rule) continue;
      const value = node.percent;
      if (!Number.isInteger(value) || value < 0 || value > rule.max || value % rule.step
        || (node.max != null && node.max !== rule.level)
        || (node.level != null && node.level * rule.step !== value)
        || (node.maxed && value !== rule.max)) continue;
      const seen = candidates.get(key) ?? new Set();
      seen.add(value);
      candidates.set(key, seen);
    }
    return Object.fromEntries([...candidates].filter(([, set]) => set.size === 1).map(([key, set]) => [key, [...set][0]]));
  }

  /** "Clan Tech Donations count +X% more in the Race" — Polish or English wording. */
  static raceBonus(payload) {
    // The race *reward* node also mentions the race; only the donation-score node counts.
    const node = payload?.nodes?.find(n => /(wyścig|race)/i.test(`${n.name} ${n.text}`) && /(darowizn|donat)/i.test(`${n.name} ${n.text}`));
    return node?.percent ?? null;
  }

  static warLevels(payload) {
    const level = pattern => {
      const node = payload?.nodes?.find(n => /(wojn|war)/i.test(`${n.name} ${n.text}`) && pattern.test(n.name));
      return node ? node.level ?? (node.percent != null ? Math.round(node.percent / 100) : null) : null;
    };
    return { damage: level(/(obrażen|damage)/i), health: level(/(zdrow|health)/i) };
  }
}
