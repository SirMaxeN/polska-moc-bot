import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { ReportService } from '../src/discord/ReportService.js';
import { CommandService } from '../src/discord/CommandService.js';
import { Navigation } from '../src/discord/Navigation.js';
import { MobileSync } from '../src/http/MobileSync.js';

const text = view => JSON.stringify(view);
const preview = (now, extra = {}) => ({ request_id: randomUUID(), observed_at: new Date(now).toISOString(), ours: [{ name: 'ally', power: 100 }], enemies: [{ name: 'enemy', power: 90 }],
  our_count: 1, enemy_count: 1, own_bonus: { damage: 10, health: 10 }, enemy_bonus: { damage: 50, health: 50 }, ...extra });

test('management promotes the preview to this week\'s official list on any day; others cannot', async t => {
  const now = new Date('2026-11-11T12:00:00Z'); // Wednesday
  const calendar = new WarCalendar(), db = new Database(':memory:', calendar), scoring = new ScoringService(); t.after(() => db.close());
  const announced = [];
  const mobile = new MobileSync(db, scoring, { clock: () => now.getTime(), announcer: { send: async (...args) => announced.push(args) } });
  const commands = new CommandService(db, new ReportService(calendar, scoring), scoring, mobile);
  mobile.warLists.save({ guild_id: 'g', user_id: 'u' }, preview(now), true);
  assert.match(mobile.warLists.report('g', 'u', now).content, /Czekaj na niedzielny update/);
  const view = mobile.warLists.report('g', 'u', now, 0, true);
  assert.deepEqual(view.components.flatMap(r => r.components).map(b => b.custom_id), ['warpromote:u:ping', 'warpromote:u:silent']);
  const click = (permissions, action) => commands.handle({ id: randomUUID(), type: 3, guild_id: 'g', member: { user: { id: 'u', username: 'P' }, permissions, roles: [] }, data: { custom_id: `warpromote:u:${action}` } }, now);
  const denied = await click('0', 'silent');
  assert.match(text(denied), /administratora lub wskazanej roli zarządu/);
  assert.match(mobile.warLists.report('g', 'u', now).content, /Czekaj na niedzielny update/, 'nothing changed');
  const done = await click('8', 'ping');
  assert.match(done.data.content, /oficjalną listą wojenną \(wojna 2026-11-15\)/);
  assert.equal(announced.length, 1, '@everyone with the list');
  const official = mobile.warLists.report('g', 'u', now);
  assert.match(text(official), /Lista wojenna · 2026-11-15/);
  assert.equal(Navigation.officialWarList, true);
  assert.equal(Navigation.reports('u', now).flatMap(r => r.components).find(b => b.custom_id === 'report:u:war-list:0').disabled, undefined, 'button active mid-week');
  assert.equal(mobile.warLists.status({ guild_id: 'g' }).locked, false, 'outside the window the Sunday lock is not active yet');
  const sunday = new Date('2026-11-15T12:00:00Z'); now.setTime(sunday.getTime());
  assert.equal(mobile.warLists.status({ guild_id: 'g' }).locked, true, 'on Sunday the promoted list is the locked official one');
  now.setTime(Date.parse('2026-11-16T12:00:00Z'));
  assert.match(mobile.warLists.report('g', 'u', now).content, /Czekaj na niedzielny update/, 'reset on Monday');
});

test('a Sunday preview keeps the real enemy tech and says the official list is unchanged', t => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const db = new Database(':memory:', new WarCalendar()); t.after(() => db.close());
  const mobile = new MobileSync(db, new ScoringService(), { clock: () => now });
  mobile.warLists.save({ guild_id: 'g', user_id: 'u' }, preview(now, { real_tech: true }), true);
  const view = mobile.warLists.report('g', 'u', new Date(now), 0, true);
  assert.match(view.content, /Oficjalna lista bez zmian/);
  assert.match(text(view), /rywal\*\* \+50% obrażeń/);
  const weekday = new Database(':memory:', new WarCalendar()); t.after(() => weekday.close());
  const plain = new MobileSync(weekday, new ScoringService(), { clock: () => now });
  plain.warLists.save({ guild_id: 'g', user_id: 'u' }, preview(now), true);
  assert.match(text(plain.warLists.report('g', 'u', new Date(now), 0, true)), /= nasz \(założenie\)/);
});
