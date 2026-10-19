import test from 'node:test';
import assert from 'node:assert/strict';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { Database } from '../src/storage/Database.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { ReportService } from '../src/discord/ReportService.js';
import { CommandService } from '../src/discord/CommandService.js';
import { CommandRegistrar } from '../src/discord/CommandRegistrar.js';
import { DailyReminders } from '../src/discord/DailyReminders.js';
import { WeeklyReminders } from '../src/discord/WeeklyReminders.js';

const now = new Date('2026-10-14T21:03:00Z');
const monday = new Date('2026-10-19T00:00:00Z');
const guild = '1540254259348512848', channel = '1559722405155573780';
const base = { guild_id: guild, member: { user: { id: '11', username: 'Admin' }, permissions: '8' } };
function fixture(t) {
  const calendar = new WarCalendar(), db = new Database(':memory:', calendar), scoring = new ScoringService();
  t.after(() => db.close());
  return { db, commands: new CommandService(db, new ReportService(calendar, scoring), scoring) };
}

test('reminder preview is private, matches the automatic message and changes no delivery/resource data', async t => {
  const { db, commands } = fixture(t);
  db.update(guild, '11', 'Admin', { pets: 30, mounts: 7 }, now);
  const panel = await commands.handle({ ...base, type: 2, data: { name: 'setup' } }, now);
  const button = panel.data.components.flatMap(row => row.components).find(item => item.custom_id === 'setup:11:preview');
  assert.ok(button);
  const click = { ...base, type: 3, data: { custom_id: button.custom_id } };
  const before = db.snapshot(guild, now);
  const preview = await commands.handle(click, now);
  assert.equal(preview.type, 4);
  assert.equal(preview.data.flags, 64);
  assert.equal(preview.data.embeds.length, 9);
  assert.match(preview.data.embeds[8].description, /Dane przykładowe/);
  assert.match(preview.data.embeds[8].description, /Bez wpisu w tym tygodniu: 2/);
  assert.match(preview.data.embeds[8].description, /bez dzisiejszej aktualizacji: 2/);
  assert.equal(preview.data.embeds[7].description, WeeklyReminders.message().content);
  assert.ok(preview.data.embeds.reduce((sum, embed) => sum + embed.title.length + embed.description.length, 0) < 6000);
  for (let i = 0; i < 7; i++) assert.equal(preview.data.embeds[i].description, DailyReminders.message(`2026-10-${19 + i}`).content);
  assert.deepEqual(preview.data.components, WeeklyReminders.message().components);
  assert.deepEqual(preview.data.allowed_mentions, { parse: [] });
  assert.deepEqual(db.snapshot(guild, now), before);
  assert.equal(db.lastReminder(guild), undefined);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM reminder_jobs').get().count, 0);
  assert.match((await commands.handle({ ...click, member: { ...base.member, permissions: '0' } }, now)).data.content, /administrator/);
  assert.match((await commands.handle({ ...click, data: { custom_id: 'setup:99:preview' } }, now)).data.content, /innego gracza/);
});

test('consolidated setup is admin/owner restricted and persists one text-channel per guild', async t => {
  const { db, commands } = fixture(t);
  const definitions = CommandRegistrar.definitions();
  assert.equal(definitions.find(command => command.name === 'setup').default_member_permissions, null);
  assert.ok(!definitions.some(command => ['ping-setup', 'ping-role-setup'].includes(command.name)));
  const setup = await commands.handle({ ...base, type: 2, data: { name: 'setup' } }, now);
  assert.equal(setup.data.flags, 64);
  assert.equal(setup.data.components[0].components.length, 5);
  assert.match(setup.data.content, /Ostatnia udana wysyłka:\*\* jeszcze nie wysłano/);
  const click = (action, values, resolved) => ({ ...base, type: 3, data: { custom_id: `setup:11:${action}`, values, resolved } });
  const participants = click('save-participants', ['1540267344209907732']);
  await commands.handle({ ...participants, member: { ...base.member, permissions: '0' } }, now);
  assert.deepEqual(db.participationRoles(guild), []);
  await commands.handle({ ...participants, data: { ...participants.data, custom_id: 'setup:99:save-participants' } }, now);
  assert.deepEqual(db.participationRoles(guild), []);
  await commands.handle(participants, now);
  assert.deepEqual(db.participationRoles(guild), ['1540267344209907732']);
  db.setParticipationRoles(guild, []);
  const save = click('save-channel', [channel], { channels: { [channel]: { id: channel, type: 0, guild_id: guild } } });
  await commands.handle({ ...save, member: { ...base.member, permissions: '0' } }, now);
  assert.equal(db.reminderChannel(guild), undefined);
  await commands.handle({ ...save, data: { ...save.data, custom_id: 'setup:99:save-channel' } }, now);
  assert.equal(db.reminderChannel(guild), undefined);
  const saved = await commands.handle(save, now);
  assert.match(saved.data.content, /Zapisano kanał/);
  assert.equal(db.reminderChannel(guild), channel);
  const status = await commands.handle({ ...base, type: 2, data: { name: 'setup' } }, now);
  assert.match(status.data.content, /19\.10\.2026, 02:00 · za 4 dni 2 godz\. 57 min/);
  assert.equal(db.reminderChannel('33'), undefined);
  const invalid = click('save-channel', [channel], { channels: { [channel]: { id: channel, type: 2, guild_id: guild } } });
  assert.match((await commands.handle(invalid, now)).data.content, /tekstowy/);
  assert.equal(db.reminderChannel(guild), channel);
  for (const action of ['roles', 'target', 'channel']) {
    const panel = await commands.handle(click(action), now);
    assert.ok(panel.data.components.flatMap(row => row.components).some(button => button.custom_id === 'setup:11:home'));
  }
  await commands.handle(click('save-channel', [], {}), now);
  assert.equal(db.reminderChannel(guild), undefined);
});

test('Monday reset queues one reminder, preserves costs, and concurrent workers do not duplicate sends', async t => {
  const { db } = fixture(t);
  db.update(guild, '11', 'Test', { pets: 30, mounts: 7, skill_cost_x5: 188, mount_cost: 40 }, now);
  db.setReminderChannel(guild, channel);
  let calls = 0;
  let release;
  const request = async (url, options) => {
    calls++;
    assert.equal(url, `https://discord.com/api/v10/channels/${channel}/messages`);
    assert.equal(options.headers.Authorization, 'Bot test-only-token');
    const data = JSON.parse(options.body);
    assert.equal(data.enforce_nonce, true);
    assert.equal(data.nonce.length, 24);
    assert.deepEqual(data.allowed_mentions, { parse: [] });
    assert.match(data.content, /\/update/);
    assert.ok(data.components[0].components.some(button => button.custom_id === 'welcome:start'));
    await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => ({ id: '1559999999999999999' }) };
  };
  const worker = new WeeklyReminders(db, { token: 'test-only-token', request });
  await worker.run(new Date('2026-10-18T17:59:59Z'));
  assert.equal(calls, 0);
  assert.equal(db.snapshot(guild, new Date('2026-10-18T17:59:59Z')).players.length, 1);
  const sending = worker.run(monday);
  await new WeeklyReminders(db, { token: 'test-only-token', request }).run(monday);
  await worker.run(monday);
  assert.equal(calls, 1);
  release(); await sending;
  await worker.run(new Date(monday.getTime() + 60000));
  assert.equal(calls, 1);
  assert.equal(db.snapshot(guild, monday).players.length, 0);
  assert.equal(db.profile(guild, '11').mount_cost, 40);
  assert.equal(db.profile(guild, '11').skill_cost_x5, 188);
  assert.equal(db.db.prepare('SELECT state FROM reminder_jobs').get().state, 'sent');
  assert.equal(db.lastReminder(guild), monday.toISOString());
});

test('sleeping-host catchup and retry honor rate limits, current channel, and stop after success', async t => {
  const { db } = fixture(t);
  db.update(guild, '11', 'Test', { pets: 30 }, now);
  db.setReminderChannel(guild, channel);
  let calls = 0;
  const request = async () => {
    calls++;
    return calls === 1 ? { ok: false, status: 429, json: async () => ({ retry_after: 120 }) }
      : { ok: true, json: async () => ({ id: '1559999999999999999' }) };
  };
  const quiet = { error() {} };
  const worker = new WeeklyReminders(db, { token: 'test', request, logger: quiet });
  const wake = new Date('2026-10-19T00:05:00Z');
  await worker.run(wake);
  await worker.run(new Date(wake.getTime() + 60000));
  assert.equal(calls, 1);
  await worker.run(new Date(wake.getTime() + 120000));
  assert.equal(calls, 2);
  await worker.run(new Date(wake.getTime() + 180000));
  assert.equal(calls, 2);
  // Unconfigured servers and merely selecting a channel do not send retroactive notifications.
  db.ensure('33', now);
  await worker.run(new Date('2026-10-26T01:00:00Z'));
  assert.equal(calls, 3);
});


test('daily reminders follow Warsaw 20:00, persist deduplication and retry only today', async t => {
  const { db } = fixture(t);
  db.ensure(guild, now); db.setReminderChannel(guild, channel);
  const payloads = [];
  let fail = false;
  const request = async (url, options) => {
    payloads.push(JSON.parse(options.body));
    if (fail) return { ok: false, status: 429, json: async () => ({ retry_after: 120 }) };
    return { ok: true, json: async () => ({ id: '1559999999999999999' }) };
  };
  const worker = new WeeklyReminders(db, { token: 'test', request, logger: { error() {} } });
  await worker.run(new Date('2026-10-15T17:59:59Z'));
  assert.equal(payloads.length, 0);
  const evening = new Date('2026-10-15T18:00:00Z');
  await worker.run(evening);
  assert.equal(payloads.length, 1);
  assert.match(payloads[0].content, /Dzień 3/);
  assert.match(payloads[0].content, /czwartek/);
  assert.deepEqual(payloads[0].allowed_mentions, { parse: [] });
  await new WeeklyReminders(db, { token: 'test', request }).run(evening);
  assert.equal(payloads.length, 1);
  assert.equal(db.lastReminder(guild), undefined);
  assert.equal(db.lastDailyReminder(guild), evening.toISOString());
  fail = true;
  await worker.run(new Date('2026-10-16T18:00:00Z'));
  await worker.run(new Date('2026-10-16T18:01:00Z'));
  assert.equal(payloads.length, 2);
  fail = false;
  await worker.run(new Date('2026-10-16T18:02:00Z'));
  assert.equal(payloads.length, 3);
  assert.equal(payloads[1].nonce, payloads[2].nonce);
  assert.notEqual(payloads[0].nonce, payloads[1].nonce);
  fail = true;
  await worker.run(new Date('2026-10-17T18:00:00Z'));
  fail = false;
  await worker.run(new Date('2026-10-18T08:00:00Z'));
  assert.equal(payloads.length, 4, 'Do not send stale daily reminders on the next day');
  db.setReminderChannel(guild, null);
  await worker.run(new Date('2026-10-18T18:00:00Z'));
  assert.equal(payloads.length, 4);
  assert.equal(DailyReminders.next(new Date('2026-10-24T18:00:00Z')).toISOString(), '2026-10-25T19:00:00.000Z');
  assert.equal(DailyReminders.next(new Date('2026-10-25T18:59:00Z')).toISOString(), '2026-10-25T19:00:00.000Z');
});
