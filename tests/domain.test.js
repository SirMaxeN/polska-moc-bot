import test from 'node:test';
import assert from 'node:assert/strict';
import { NumberParser } from '../src/domain/NumberParser.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { Technology } from '../src/domain/Technology.js';
import { ScoringService } from '../src/domain/ScoringService.js';

test('resource formats are equivalent and invalid/unsafe values rejected', () => {
  for (const input of ['9880', '9.88k', '9,88k', ' 9.880K ']) assert.equal(NumberParser.integer(input), 9880);
  for (const input of ['2840', '2.84k', '2,84k']) assert.equal(NumberParser.integer(input), 2840);
  for (const input of ['-1', '1.5', '1,000.00', 'Infinity', '1e3', '', '9007199254740992', '0.0001k']) assert.throws(() => NumberParser.integer(input));
  assert.equal(NumberParser.integer('0'), 0);
  for (const input of ['9550', '9,55', '9.55', '9,55k', '9.55k', ' 9.550K ']) {
    assert.equal(NumberParser.integer(input, { implicitThousands: true }), 9550);
  }
  assert.equal(NumberParser.integer('9', { implicitThousands: true }), 9);
  assert.equal(NumberParser.integer('0,028', { implicitThousands: true }), 28);
  assert.equal(NumberParser.integer('188', { positive: true }), 188);
  assert.throws(() => NumberParser.integer('1.2345', { implicitThousands: true }));
  assert.throws(() => NumberParser.integer('188,5', { positive: true }));
  assert.throws(() => NumberParser.integer('0', { positive: true }));
  assert.equal(NumberParser.percentage(' 40% '), 40);
  for (const value of ['41', '6%', '-4', '0.4']) assert.throws(() => NumberParser.percentage(value));
});

test('SirMaxeN potential and four-member totals match accepted examples', () => {
  const service = new ScoringService();
  const tech = Technology.defaults();
  const players = [
    { skill_tickets: 9880, skill_cost_x5: 188, mount_keys: 2840, hammers: 11026, pets: 28 },
    { skill_tickets: 7420, skill_cost_x5: 200, mount_keys: 1650, hammers: 8200, pets: 17 },
    { skill_tickets: 12345, skill_cost_x5: 190, mount_keys: 3975, hammers: 15370, pets: 42 },
    { skill_tickets: 9000, skill_cost_x5: 200, mount_keys: 2250, hammers: 6340, pets: 11 },
  ];
  assert.deepEqual(service.player(players[0], tech).map(day => day.total), [145804, 120960, 165604, 164160, 107104, null]);
  assert.deepEqual(service.clan(players, tech).days.map(day => day.total), [559294, 460080, 606994, 632880, 384244, null]);
  const days = service.player(players[0], tech);
  assert.equal(days[0].categories.skillSummon, 58500);
  assert.equal(days[1].categories.mountSummon, 60480);
  assert.equal(days[1].categories.mountMerge, 60480);
  assert.equal(days[2].categories.petMerge, 63000);
  assert.equal(days[0].approximate, true);
  assert.equal(days[1].approximate, false);
  const changed = { ...tech, day3: 0 };
  assert.equal(service.rate('skillSummon', 3, changed), 175);
  assert.equal(service.rate('skillSummon', 1, changed), 225);
});

test('calendar follows Tuesday war, Monday reset, Sunday day six and Warsaw DST', () => {
  const calendar = new WarCalendar();
  const monday = new Date('2026-10-12T13:00:00Z');
  const upcoming = calendar.cycle(monday);
  assert.equal(upcoming.monday, '2026-10-12');
  assert.equal(upcoming.tuesday, '2026-10-13');
  assert.equal(upcoming.id, '2026-10-11');
  assert.equal(upcoming.starts[0].toISOString(), '2026-10-13T00:00:00.000Z');
  assert.equal(calendar.status(upcoming, 1, monday), 'future');
  const beforeStart = new Date('2026-10-12T23:59:59Z');
  assert.equal(calendar.status(calendar.cycle(beforeStart), 1, beforeStart), 'future');
  const tuesday = new Date('2026-10-13T13:00:00Z');
  const cycle = calendar.cycle(tuesday);
  assert.equal(calendar.status(cycle, 1, tuesday), 'current');
  assert.equal(calendar.status(cycle, 2, tuesday), 'future');
  const wednesday = new Date('2026-10-14T00:00:00Z');
  assert.equal(calendar.status(cycle, 1, wednesday), 'past');
  assert.equal(calendar.status(cycle, 2, wednesday), 'current');
  const sunday = new Date('2026-10-18T13:00:00Z');
  assert.equal(calendar.status(calendar.cycle(sunday), 6, sunday), 'current');
  assert.equal(calendar.cycle(new Date('2026-10-18T23:59:59Z')).id, '2026-10-11');
  assert.equal(calendar.cycle(new Date('2026-10-19T00:00:00Z')).id, '2026-10-18');
  assert.equal(calendar.boundary('2026-03-29').toISOString(), '2026-03-29T01:00:00.000Z');
  assert.equal(calendar.boundary('2026-10-25').toISOString(), '2026-10-25T00:00:00.000Z');
  const dst = new Date('2026-10-25T00:01:00Z');
  assert.equal(calendar.status(calendar.cycle(dst), 6, dst), 'current');
  assert.equal(calendar.cycle(dst).end.toISOString(), '2026-10-26T01:00:00.000Z');
});
