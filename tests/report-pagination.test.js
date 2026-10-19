import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportPaginator } from '../src/discord/ReportPaginator.js';
import { ReportService } from '../src/discord/ReportService.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { Technology } from '../src/domain/Technology.js';

test('whole reports fit exactly; overflow separates days and marks only message-level continuations', () => {
  const template = { title: 'Report', description: 'Context' };
  const group = (day, count) => ({ day, header: `⚪ Dzień ${day}: test`, fields: Array.from({ length: count }, (_, index) => ({ name: index ? '\u200b' : `⚪ Dzień ${day}: test`, value: String(day).repeat(900) })) });
  assert.equal(ReportPaginator.pack(template, [group(1, 3), group(2, 3)]).length, 1);
  const packed = ReportPaginator.pack(template, [group(1, 8), group(2, 2), group(3, 1)]);
  assert.equal(packed.length, 4);
  assert.match(packed[1].title, /dzień 1 \(ciąg dalszy\)/);
  assert.match(packed[2].title, /dzień 2$/);
  for (const page of packed) {
    assert.ok(ReportPaginator.fits(page, 'Część 100/100 · Europe/Warsaw'));
    assert.ok(page.fields.slice(1).every(field => !field.name.includes('ciąg dalszy')));
    assert.equal(new Set(page.fields.map(field => field.value[0])).size, 1);
  }
  const boundary = { title: '', description: 'x'.repeat(4096), fields: [{ name: 'a', value: 'b'.repeat(1000) }, { name: 'c', value: 'd'.repeat(889) }] };
  // 4096+1001+890+13-character footer = 6000: use one message, not an arbitrary lower threshold.
  assert.equal(ReportPaginator.size(boundary), 6000);
  assert.equal(ReportPaginator.pack({ title: '', description: boundary.description }, [{ day: 1, header: 'a', fields: boundary.fields }]).length, 1);
});

test('all clan reports show enrolment counts; small reports stay whole and large days preserve every player', () => {
  const reports = new ReportService(new WarCalendar(), new ScoringService());
  const now = new Date('2026-10-17T12:00:00Z');
  const player = { user_id: '11', name: 'Player', skill_tickets: 9880, mount_keys: 2840, mounts: 12, hammers: 11026, pets: 28, updated_at: now.toISOString() };
  const tech = Technology.defaults();
  for (const kind of ['clan', 'clan-details', 'clan-ultra']) {
    const small = reports.render(kind, { tech, players: [player] }, '11', now);
    assert.equal(small.additionalMessages, undefined);
    assert.match(small.embeds[0].description, /Wpisani: \*\*1\/\? członków\*\*/);
    assert.match(reports.render(kind, { tech, players: [] }, '11', now).embeds[0].description, /Wpisani: \*\*0\/\? członków\*\*/);
  }
  assert.doesNotMatch(reports.render('player', { tech, players: [player] }, '11', now).embeds[0].description, /Wpisani:/);
  const players = Array.from({ length: 100 }, (_, i) => ({ ...player, user_id: String(i), name: `Player${i}` }));
  for (const kind of ['clan-details', 'clan-ultra']) {
    const payload = reports.render(kind, { tech, players }, '11', now);
    const messages = [payload, ...(payload.additionalMessages ?? [])];
    assert.ok(messages.length > 6);
    const seen = new Map();
    for (const message of messages) {
      const embed = message.embeds[0];
      assert.match(embed.description, /Wpisani: \*\*100\/\? członków\*\*/);
      assert.ok(ReportPaginator.fits(embed, embed.footer.text));
      const day = Number(/: dzień (\d)/.exec(embed.title)[1]);
      const continued = seen.has(day);
      assert.equal(embed.fields[0].name.includes('ciąg dalszy'), continued);
      assert.ok(embed.fields.slice(1).every(field => !/Dzień \d:|ciąg dalszy/.test(field.name)));
      const names = [...embed.fields.map(field => field.value).join('\n').matchAll(/\*\*(Player\d+)\*\*/g)].map(match => match[1]);
      seen.set(day, [...(seen.get(day) ?? []), ...names]);
    }
    for (let day = 1; day <= 5; day++) {
      assert.equal(seen.get(day).length, 100);
      assert.equal(new Set(seen.get(day)).size, 100);
    }
    assert.equal(seen.get(6).length, 0);
  }
});


test('resource roster preserves every member across message boundaries and totals stocks', () => {
  const service = new ReportService(new WarCalendar(), new ScoringService());
  const players = Array.from({ length: 80 }, (_, i) => ({ user_id: String(i), name: `Member${i}`, skill_tickets: 200, mount_keys: 50, mounts: 3, hammers: 100, pets: 5, skill_cost_x5: 188, mount_cost: 45, updated_at: '2026-10-19T10:00:00Z' }));
  const payload = service.render('resources', { players, tech: Technology.defaults() }, '0');
  const messages = [payload, ...payload.additionalMessages];
  assert.ok(messages.length > 1);
  assert.equal(messages[0].embeds[0].title, '🎒 Zasoby klanu');
  for (const message of messages.slice(1)) assert.equal(message.embeds[0].title, '🎒 Zasoby klanu (ciąg dalszy)');
  assert.ok(messages.every(message => !message.embeds[0].title.includes('undefined')));
  const fields = messages.flatMap(message => message.embeds[0].fields);
  assert.deepEqual(fields.slice(0, -1).map(field => field.name), players.map(player => player.name));
  assert.match(fields.at(-1).value, /16\s000/);
  assert.match(fields[0].value, /max \*\*1\s?125 pkt/);
  assert.match(fields[0].value, /max \*\*2\s?160 pkt/);
  assert.match(fields[0].value, /max \*\*3\s?240 pkt/);
  assert.match(fields[0].value, /188/);
  assert.match(fields[0].value, /45/);
  assert.match(fields[0].value, /Aktualizacja zasobów/);
  for (const message of messages) assert.ok(ReportPaginator.fits(message.embeds[0], message.embeds[0].footer.text));
  const empty = service.render('resources', { players: [], tech: Technology.defaults() }, '0');
  assert.match(empty.embeds[0].description, /Wpisani: \*\*0\/\? członków\*\*/);
});
