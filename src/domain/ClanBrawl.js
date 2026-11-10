/** Approximate group combat. Compare two targeting policies because the game's policy is unknown. */
export function simulateClanBrawl(ours, enemies, ownTech, enemyTech) {
  if (!ours.length || !enemies.length || [...ours, ...enemies].some(p => !p || p.bonuses.REFLECT > 0)) return null;
  const prepare = (profiles, tech) => profiles.map((profile, position) => {
    const bonus = key => (profile.bonuses[key] ?? 0) / 100;
    return {
      position, ranged: profile.ranged,
      maxHp: profile.health * (1 + tech.health / 100) * (profile.ranged ? 1 : 2.6),
      hit: profile.damage * (1 + tech.damage / 100) * (1 + bonus('SPEED')),
      crit: Math.min(.8, bonus('CRIT')), critDamage: bonus('CRIT_DAMAGE'),
      block: Math.min(.3, bonus('BLOCK')), lifesteal: bonus('STEAL'),
    };
  });
  const left = prepare(ours, ownTech), right = prepare(enemies, enemyTech);
  const trials = 64;
  const run = (focus, seed) => {
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const team = roster => roster.map(fighter => ({ ...fighter, hp: fighter.maxHp, delta: 0 }));
    const a = team(left), b = team(right);
    const attack = (attackers, targets, second) => {
      const front = targets.filter(target => !target.ranged);
      const candidates = front.length ? front : targets;
      for (const actor of attackers) {
        if (!actor.ranged && second < 4) continue;
        let target = candidates[0];
        if (!focus) for (const candidate of candidates) {
          if (Math.abs(candidate.position - actor.position) < Math.abs(target.position - actor.position)) target = candidate;
        }
        if (random() < target.block) continue;
        const damage = actor.hit * (.85 + .3 * random()) * (random() < actor.crit ? 1.2 + actor.critDamage : 1);
        target.delta -= damage;
        actor.delta += Math.min(target.hp, damage) * actor.lifesteal;
      }
    };
    for (let second = 0; second < 120; second++) {
      const aliveA = a.filter(actor => actor.hp > 0), aliveB = b.filter(actor => actor.hp > 0);
      if (!aliveA.length || !aliveB.length) return aliveA.length > 0;
      attack(aliveA, aliveB, second);
      attack(aliveB, aliveA, second);
      for (const actor of [...aliveA, ...aliveB]) {
        actor.hp = Math.min(actor.maxHp, Math.max(0, actor.hp + actor.delta));
        actor.delta = 0;
      }
    }
    const remaining = roster => roster.reduce((sum, actor) => sum + actor.hp, 0) / roster.reduce((sum, actor) => sum + actor.maxHp, 0);
    return remaining(a) > remaining(b);
  };
  const chance = focus => Array.from({ length: trials }, (_, index) => run(focus, 67409 + index * 7919)).filter(Boolean).length / trials;
  return { model: 'brawl-v1', nearest: chance(false), focus: chance(true), trials };
}
