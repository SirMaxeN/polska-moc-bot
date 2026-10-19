export class WarCalendar {
  constructor() {
    this.formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  }

  local(date) {
    return Object.fromEntries(this.formatter.formatToParts(date)
      .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  }

  dateKey(date) {
    const p = this.local(date);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }

  shift(key, days) {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  boundary(key) {
    // Warsaw uses UTC+1/+2. Earliest match resolves the repeated DST hour.
    const midnight = Date.parse(`${key}T00:00:00Z`);
    for (const hours of [0, 1, 2]) {
      const candidate = new Date(midnight + hours * 3600000);
      const p = this.local(candidate);
      if (this.dateKey(candidate) === key && p.hour >= 2) return candidate;
    }
    throw new Error('Cannot resolve Warsaw calendar boundary.');
  }

  cycle(now = new Date()) {
    const key = this.dateKey(now);
    const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
    let monday = this.shift(key, -((weekday + 6) % 7));
    if (now < this.boundary(monday)) monday = this.shift(monday, -7);
    const tuesday = this.shift(monday, 1);
    const starts = Array.from({ length: 7 }, (_, i) => this.boundary(this.shift(tuesday, i)));
    // Keep the existing weekly identifier so this calendar correction preserves live resources.
    return { id: this.shift(monday, -1), monday, tuesday, starts, end: starts[6] };
  }

  status(cycle, day, now) {
    if (now >= cycle.starts[day]) return 'past';
    if (now >= cycle.starts[day - 1]) return 'current';
    return 'future';
  }
}
