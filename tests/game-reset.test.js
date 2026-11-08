import test from 'node:test';
import assert from 'node:assert/strict';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { Database } from '../src/storage/Database.js';
import { DailyReminders } from '../src/discord/DailyReminders.js';

test('game midnight remains UTC through both Polish clock changes', () => {
  const calendar = new WarCalendar();
  for (const [key, hour] of [['2026-03-29', '01:00'], ['2026-03-30', '02:00'], ['2026-10-25', '02:00'], ['2026-10-26', '01:00']]) {
    assert.equal(calendar.boundary(key).toISOString(), `${key}T00:00:00.000Z`);
    assert.equal(calendar.boundaryTime(key), hour);
    const end = calendar.boundary(calendar.shift(key, 1));
    assert.equal(end - calendar.boundary(key), 86400000);
  }
  const before = new Date('2026-10-25T23:59:59.999Z');
  const after = new Date('2026-10-26T00:00:00.000Z');
  assert.equal(calendar.cycle(before).id, '2026-10-18');
  assert.equal(calendar.status(calendar.cycle(before), 6, before), 'current');
  assert.equal(calendar.cycle(after).id, '2026-10-25');
  assert.equal(calendar.status(calendar.cycle(after), 1, after), 'future');
  const tuesday = new Date('2026-10-27T00:00:00.000Z');
  assert.equal(calendar.status(calendar.cycle(tuesday), 1, tuesday), 'current');
});

test('calendar correction resets stale resources once and retains fresh post-reset saves, costs and tech', t => {
  const calendar = new WarCalendar();
  const db = new Database(':memory:', calendar);
  t.after(() => db.close());
  db.update('guild', 'old', 'Old', { hammers: 100, skill_cost_x5: 188, mount_cost: 40 }, new Date('2026-10-25T22:00:00Z'));
  db.updateTech('guild', 'forge', 12);
  // Model a save accepted by the old wall-clock schedule after the true UTC reset.
  db.db.prepare("INSERT INTO players(guild_id,user_id,name) VALUES('guild','fresh','Fresh')").run();
  db.db.prepare("INSERT INTO resources(guild_id,user_id,hammers,updated_at) VALUES('guild','fresh',77,'2026-10-26T00:05:00.000Z')").run();
  db.ensure('guild', new Date('2026-10-26T00:10:00Z'));
  assert.deepEqual(db.snapshot('guild', new Date('2026-10-26T00:10:00Z')).players.map(p => p.user_id), ['fresh']);
  assert.equal(db.profile('guild', 'old').skill_cost_x5, 188);
  assert.equal(db.profile('guild', 'old').mount_cost, 40);
  assert.equal(db.snapshot('guild', new Date('2026-10-26T00:10:00Z')).tech.forge, 12);
  db.ensure('guild', new Date('2026-10-26T01:00:00Z'));
  assert.equal(db.profile('guild', 'fresh').hammers, 77);
  assert.equal(db.db.prepare("SELECT COUNT(*) AS count FROM reset_events WHERE kind='weekly'").get().count, 1);
});

test('daily reminder clock stays local at 20 while game-end text changes with DST', () => {
  // Both dates are Sundays (DST changes): no /update request, resources are due after Monday's reset.
  assert.match(DailyReminders.message('2026-10-25').content, /w poniedziałek po resecie\*\* \(01:00, czasu polskiego\)/);
  assert.match(DailyReminders.message('2026-03-29').content, /w poniedziałek po resecie\*\* \(02:00, czasu polskiego\)/);
  assert.doesNotMatch(DailyReminders.message('2026-10-25').content, /\/update/);
  assert.match(DailyReminders.message('2026-10-25').content, /\/report war-list/);
  assert.match(DailyReminders.message('2026-10-24').content, /jutro o \*\*02:00\*\*/);
  assert.match(DailyReminders.message('2026-10-24').content, /\/update/);
  assert.equal(DailyReminders.next(new Date('2026-10-26T12:00:00Z')).toISOString(), '2026-10-26T19:00:00.000Z');
  assert.equal(DailyReminders.next(new Date('2026-07-06T12:00:00Z')).toISOString(), '2026-07-06T18:00:00.000Z');
});
