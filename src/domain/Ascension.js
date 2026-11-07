/**
 * Game ascensions (Forge, Pets, Mounts, Skills). A member with an "Wzniesienie: …" role may spend
 * the matching resources on the ascension, so those points are shown separately as possibly unavailable.
 */
export class Ascension {
  static emoji = '⛰️';
  static types = {
    forge: { label: 'Kuźnia', role: 'Wzniesienie: Kuźnia', categories: ['forge'], resources: ['hammers'], match: /ku[zź]ni|wyposa[zż]|ekwipun/ },
    pets: { label: 'Zwierzaki', role: 'Wzniesienie: Zwierzaki', categories: ['petMerge'], resources: ['pets'], match: /zwierz/ },
    mounts: { label: 'Wierzchowce', role: 'Wzniesienie: Wierzchowce', categories: ['mountSummon', 'mountMerge'], resources: ['mount_keys', 'mounts'], match: /wierzchow/ },
    skills: { label: 'Umiejętności', role: 'Wzniesienie: Umiejętności', categories: ['skillSummon'], resources: ['skill_tickets'], match: /umiej/ },
  };
  static legend = `${Ascension.emoji} = gracz ma rangę wzniesienia. Punkty z tych zasobów mogą być niedostępne (zasoby idą na wzniesienie), dlatego liczymy je osobno.`;

  /** Ascension type for a Discord role name such as "Wzniesienie: Kuźnia", otherwise null. */
  static fromRoleName(name) {
    const value = String(name ?? '').toLocaleLowerCase('pl');
    if (!value.includes('wznies')) return null;
    return Object.entries(Ascension.types).find(([, type]) => type.match.test(value))?.[0] ?? null;
  }

  /**
   * userId → ascension types, from guild roles and members (Discord REST shapes).
   * Roles chosen in /setup win; a type without configured roles falls back to the role name.
   */
  static members(roles, members, configured = {}) {
    const byRole = new Map();
    for (const [type, ids] of Object.entries(configured)) if (Ascension.types[type]) for (const id of ids) byRole.set(id, type);
    for (const role of roles) {
      const type = Ascension.fromRoleName(role.name);
      if (type && !configured[type]?.length && !byRole.has(role.id)) byRole.set(role.id, type);
    }
    const result = new Map();
    for (const member of members) {
      const types = [...new Set((member.roles ?? []).map(id => byRole.get(id)).filter(Boolean))];
      if (types.length) result.set(member.user.id, Ascension.ordered(types));
    }
    return result;
  }

  static ordered(types) { return Object.keys(Ascension.types).filter(key => types.includes(key)); }
  static categories(types = []) { return new Set(types.flatMap(type => Ascension.types[type]?.categories ?? [])); }
  static resources(types = []) { return new Set(types.flatMap(type => Ascension.types[type]?.resources ?? [])); }
  static tag(types = [], plain = false) {
    return types.length ? (plain ? ` ${Ascension.emoji} wzniesienie: ${types.map(type => Ascension.types[type].label.toLocaleLowerCase('pl')).join(', ')}` : ` ${Ascension.emoji} *wzniesienie: ${types.map(type => Ascension.types[type].label.toLocaleLowerCase('pl')).join(', ')}*`) : '';
  }
}
