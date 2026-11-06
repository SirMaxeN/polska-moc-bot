const collator = new Intl.Collator('pl', { sensitivity: 'base', numeric: true });

export const compareNames = (left, right) => collator.compare(String(left), String(right));
export const sortPlayers = players => [...players].sort((a, b) =>
  compareNames(a.name, b.name) || compareNames(a.user_id, b.user_id));
