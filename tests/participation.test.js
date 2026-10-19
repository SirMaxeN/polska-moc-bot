import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ParticipationReminders } from '../src/discord/ParticipationReminders.js';
import { WeeklyReminders } from '../src/discord/WeeklyReminders.js';
import { CommandService } from '../src/discord/CommandService.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { ReportService } from '../src/discord/ReportService.js';
import { ServerSetup } from '../src/discord/ServerSetup.js';

const guild = '1540254259348512848', role = '1540267344209907732';
const id = n => String(200000000000000000n + BigInt(n));
test('participant lists use current roles, exclude bots and separate weekly absence from stale daily updates', async t => {
  const db = new Database(':memory:', new WarCalendar()); t.after(() => db.close());
  const now = new Date('2026-10-20T18:00:00Z');
  db.ensure(guild, now); db.setParticipationRoles(guild, [role, role]);
  assert.deepEqual(db.participationRoles(guild), [role]);
  assert.throws(() => db.setParticipationRoles(guild, [guild]));
  assert.throws(() => db.setParticipationRoles(guild, ['bad']));
  assert.deepEqual(db.participationRoles('other'), []);
  db.update(guild, id(2), 'Stale', { pets: 2 }, new Date('2026-10-19T18:00:00Z'));
  db.update(guild, id(3), 'Current', { pets: 3 }, new Date('2026-10-20T00:00:00Z'));
  const members = [1,2,3,4,5].map(n => ({ user: { id: id(n), bot: n === 4 }, roles: n === 5 ? [] : [role] }));
  const service = new ParticipationReminders(db, 'test', async () => ({ ok: true, json: async () => [...members, members[0]] }));
  const lists = await service.messages(guild, now);
  assert.match(lists[0].content, new RegExp(`❗ Użytkownik ${id(1)}`));
  assert.match(lists[0].content, /Wpisani: \*\*2\/3 członków\*\*/);
  assert.doesNotMatch(lists[0].content, new RegExp(id(2)));
  assert.match(lists[1].content, new RegExp(`\\nUżytkownik ${id(2)}`));
  assert.equal(lists[1].content.split('🕒').length - 1, 1);
  for (const list of lists) {
    assert.doesNotMatch(list.content, new RegExp(`${id(3)}|${id(4)}|${id(5)}`));
    assert.deepEqual(list.allowed_mentions, { parse: [] });
  }
  const panel = ServerSetup.participationPanel('11', guild, db);
  assert.equal(panel.components[0].components[0].default_values[0].id, role);
  const denied = await new ParticipationReminders(db, 'test', async () => ({ ok: false, status: 403 })).messages(guild, now);
  assert.match(denied[0].content, /nie udało|Nie udało/);
  db.setParticipationRoles(guild, []);
  assert.deepEqual(await service.messages(guild, now), []);
});

test('large member rosters paginate completely and automatic reminders deliver bounded non-pinging lists', async t => {
  const db = new Database(':memory:', new WarCalendar()); t.after(() => db.close());
  const now = new Date('2026-10-20T18:00:00Z');
  db.ensure(guild, now); db.setParticipationRoles(guild, [role]); db.setReminderChannel(guild, id(9999));
  const members = Array.from({ length: 1001 }, (_, i) => ({ user: { id: id(i+1) }, roles: [role] }));
  const sent = [], urls = [];
  const request = async (url, options) => {
    if (!options.method) { urls.push(url); return { ok: true, json: async () => url.endsWith('after=0') ? members.slice(0,1000) : members.slice(1000) }; }
    sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ id: id(sent.length) }) };
  };
  await new WeeklyReminders(db, { token: 'test', request }).run(now);
  assert.equal(urls.length, 2);
  assert.ok(db.lastDailyReminder(guild));
  assert.ok(sent.length > 2);
  const text = sent.map(message => message.content).join('\n');
  for (const member of members) assert.equal(text.split(`Użytkownik ${member.user.id}`).length - 1, 1);
  for (const message of sent) { assert.ok(message.content.length <= 2000); assert.deepEqual(message.allowed_mentions, { parse: [] }); }
  assert.equal(new Set(sent.map(message => message.nonce)).size, sent.length);
  await new WeeklyReminders(db, { token: 'test', request }).run(now);
  assert.equal(urls.length, 2);
});


test('live missing report is private and available to every member while buttons remain owner-bound', async t => {
  const calendar = new WarCalendar(), db = new Database(':memory:', calendar); t.after(() => db.close());
  const scoring = new ScoringService(), commands = new CommandService(db, new ReportService(calendar, scoring), scoring);
  const now = new Date('2026-10-20T18:00:00Z');
  const interaction = { type: 2, guild_id: guild, member: { user: { id: id(1) }, permissions: '0', roles: [role] }, data: { name: 'report', options: [{ name: 'missing' }] } };
  assert.equal((await commands.handle(interaction, now)).response.type, 5);
  db.setManagementRoles(guild, [role]);
  let result = await commands.handle(interaction, now);
  assert.equal(result.response.type, 5); assert.equal(result.response.data.flags, 64);
  assert.match((await result.complete()).content, /Nie wybrano ról/);
  db.setParticipationRoles(guild, [role]);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [{ user: { id: id(2) }, roles: [role] }] }));
  result = await commands.handle(interaction, now);
  const message = await result.complete();
  assert.match(message.content, new RegExp(`❗ Użytkownik ${id(2)}`));
  assert.equal(message.additionalMessages.length, 0);
  assert.match(message.content, /bez dzisiejszej aktualizacji/);
  assert.deepEqual(message.allowed_mentions, { parse: [] });
  db.setManagementRoles(guild, []);
  assert.match((await result.complete()).content, /Brakujące aktualizacje/);
  const admin = { ...interaction, member: { ...interaction.member, permissions: '8', roles: [] } };
  const click = { ...admin, type: 3, data: { custom_id: `setup:${id(1)}:missing` } };
  assert.equal((await commands.handle(click, now)).response.type, 5);
  assert.match((await commands.handle({ ...click, data: { custom_id: 'setup:someone:missing' } }, now)).data.content, /innego gracza/);
});


test('clan report enrollment ratio counts only participants and reports additional outsiders explicitly', async t => {
  const calendar = new WarCalendar(), db = new Database(':memory:', calendar); t.after(() => db.close());
  const now = new Date('2026-10-20T18:00:00Z');
  db.update(guild, id(1), 'Participant', { pets: 1 }, now);
  db.update(guild, id(9), 'Other', { pets: 1 }, now);
  db.setParticipationRoles(guild, [role]);
  const scoring = new ScoringService(), commands = new CommandService(db, new ReportService(calendar, scoring), scoring);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [1,2,3].map(n => ({ user: { id: id(n) }, roles: [role] })) }));
  for (const kind of ['clan', 'clan-details', 'clan-ultra', 'resources']) {
    const result = commands.reportReply(kind, db.snapshot(guild, now), id(1), now, 4, guild);
    assert.equal(result.response.type, 5);
    const message = await result.complete();
    assert.match(message.embeds[0].description, /Wpisani: \*\*1\/3 członków\*\*/);
    assert.match(message.embeds[0].description, /Other/);
    assert.match(message.embeds[0].description, /spoza ról uczestników: \*\*1\*\*/);
  }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403 }));
  const failed = await commands.reportReply('clan', db.snapshot(guild, now), id(1), now, 4, guild).complete();
  assert.match(failed.embeds[0].description, /2\/\? członków/);
  assert.match(failed.embeds[0].description, /chwilowo niedostępna/);
});


test('attendance uses escaped server names without client-dependent mentions', async t => {
  const db = new Database(':memory:', new WarCalendar()); t.after(() => db.close());
  const now = new Date('2026-10-20T18:00:00Z'); db.ensure(guild, now); db.setParticipationRoles(guild, [role]);
  const members = [{ user: { id: id(1), username: 'Account', global_name: 'Global' }, nick: 'Server Name', roles: [role] },
    { user: { id: id(2), username: 'Other' }, nick: '@everyone **Test**', roles: [role] }];
  const service = new ParticipationReminders(db, 'test', async () => ({ ok: true, json: async () => members }));
  const messages = await service.messages(guild, now);
  assert.match(messages[0].content, /❗ Server Name/);
  assert.ok(messages[0].content.includes('\\@everyone \\*\\*Test\\*\\*'));
  assert.doesNotMatch(messages[0].content, /<@/);
});


test('guild roster requests coalesce across channels and failed loads are not cached', async t => {
  const db = new Database(':memory:', new WarCalendar()); t.after(() => db.close());
  let requests = 0;
  const request = async (url, options) => {
    requests++; assert.match(url, /guilds\/1540254259348512848\/members/); assert.ok(options.signal);
    return { ok: requests !== 1, status: 403, json: async () => [{ user: { id: id(1), username: 'Global member' }, roles: [role] }] };
  };
  await assert.rejects(new ParticipationReminders(db, 'token', request).members(guild));
  const [a, b] = await Promise.all([new ParticipationReminders(db, 'token', request).members(guild), new ParticipationReminders(db, 'token', request).members(guild)]);
  assert.deepEqual(a, b); assert.equal(requests, 2);
});
