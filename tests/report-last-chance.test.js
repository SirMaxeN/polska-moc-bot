import test from 'node:test';
import assert from 'node:assert/strict';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { ReportService } from '../src/discord/ReportService.js';
import { Technology } from '../src/domain/Technology.js';

test('last chance warnings follow current Warsaw war day and each saved resource across all reports', () => {
  const calendar = new WarCalendar();
  const reports = new ReportService(calendar, new ScoringService());
  const tech = Object.fromEntries(Technology.entries.map(([key, , value]) => [key, value]));
  const player = { user_id: '11', name: 'Player', skill_tickets: 1, mount_keys: 1, mounts: 3, hammers: 20, pets: 4, updated_at: '2026-10-15T10:00:00Z' };
  const snapshot = { tech, players: [player] };
  const fields = payload => [payload, ...(payload.additionalMessages ?? [])].flatMap(message => message.embeds[0].fields ?? []);
  const cases = [
    ['2026-10-15T18:00:00Z', 3, /wydanie biletów umiejętności/],
    ['2026-10-16T18:00:00Z', 4, /wydanie kluczy wierzchowców; połączenie posiadanych wierzchowców/],
    ['2026-10-17T18:00:00Z', 5, /wydanie młotków; połączenie zwierzaków lub jajek/],
  ];
  for (const [date, day, expected] of cases) {
    const now = new Date(date);
    for (const kind of ['player', 'clan', 'clan-details', 'clan-ultra']) {
      const all = fields(reports.render(kind, snapshot, '11', now));
      const warned = all.filter(field => field.value.includes('❗'));
      assert.equal(warned.length, 1, `${kind}: warn only on the current final scoring day`);
      assert.ok(warned[0].name.includes(`Dzień ${day}:`));
      assert.match(warned[0].value, expected);
      assert.match(warned[0].value.split('\n')[1], /^❗ \*\*Ostatni dzień na: .+\.\*\*$/);
      assert.doesNotMatch(warned[0].value, /Po tym dniu|w tej wojnie/);
    }
  }
  for (const date of ['2026-10-13T18:00:00Z', '2026-10-14T18:00:00Z', '2026-10-18T18:00:00Z', '2026-10-19T12:00:00Z']) {
    assert.ok(fields(reports.render('player', snapshot, '11', new Date(date))).every(field => !field.value.includes('❗')));
  }
  const boundary = new Date('2026-10-16T00:00:00Z'); // Thursday ends at Friday 02:00 Warsaw.
  const current = fields(reports.render('player', snapshot, '11', boundary)).find(field => field.value.includes('❗'));
  assert.doesNotMatch(current.value, /wydanie biletów/);
  assert.match(current.value, /kluczy wierzchowców/);
  const empty = { ...player, skill_tickets: 0, mount_keys: 0, mounts: 0, hammers: 0, pets: 0 };
  assert.ok(fields(reports.render('player', { tech, players: [empty] }, '11', new Date(cases[2][0]))).every(field => !field.value.includes('❗')));
  // Summoned merges still matter when no keys remain; one player's empty stock must not inherit another's warning.
  const mixed = { tech, players: [empty, { ...player, user_id: '12', name: 'Active', mount_keys: 0 }] };
  const day4 = fields(reports.render('clan-ultra', mixed, '11', new Date(cases[1][0]))).filter(field => field.name.includes('Dzień 4:')).map(field => field.value).join('\n');
  assert.doesNotMatch(day4.split('**Active**')[0], /❗/);
  assert.match(day4, /połączenie posiadanych wierzchowców/);
  assert.doesNotMatch(day4, /wydanie kluczy/);
  const large = { tech, players: Array.from({ length: 120 }, (_, index) => ({ ...player, user_id: String(index), name: '*'.repeat(32) })) };
  for (const kind of ['clan-details', 'clan-ultra']) {
    const report = reports.render(kind, large, '11', new Date(cases[2][0]));
    const messages = [report, ...(report.additionalMessages ?? [])];
    let warnings = 0;
    for (const message of messages) {
      const embed = message.embeds[0];
      assert.ok(embed.fields.length <= 25);
      assert.ok(embed.title.length + embed.description.length + embed.footer.text.length + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0) <= 6000);
      for (const field of embed.fields) {
        assert.ok(field.value.length <= 1024);
        warnings += (field.value.match(/❗/g) ?? []).length;
      }
    }
    assert.equal(warnings, 120);
  }
});
