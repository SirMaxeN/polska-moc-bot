/** Ideal attack score, assuming every ticket wins and targets are in in-game list order. */
export function warDaySixCeiling(allyCount, enemyCount) {
  const tickets = 5 * allyCount;
  const resetAt = Math.min(45, enemyCount);
  if (!resetAt) return { tickets, resetAt, resets: 0, attackPoints: 0 };
  const points = count => count * (101 - count) / 2;
  const resets = Math.floor(tickets / resetAt);
  return { tickets, resetAt, resets, attackPoints: resets * points(resetAt) + points(tickets % resetAt) };
}
