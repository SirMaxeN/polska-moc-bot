import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { ReportService } from '../src/discord/ReportService.js';
import { CommandService } from '../src/discord/CommandService.js';
import { CommandRegistrar } from '../src/discord/CommandRegistrar.js';

const now = new Date('2026-10-14T21:03:00Z');
function fixture(t) {
  const calendar = new WarCalendar(), scoring = new ScoringService();
  const db = new Database(':memory:', calendar);
  const reports = new ReportService(calendar, scoring);
  t.after(() => db.close());
  return { db, scoring, reports, commands: new CommandService(db, reports, scoring) };
}
const command = (permissions = '8', guild_id = '22') => ({ type: 2, guild_id, member: { user: { id: '11', username: 'Admin' }, permissions }, data: { name: 'delete' } });
const click = (custom_id, values, permissions = '8', userId = '11') => ({ ...command(permissions), type: 3, member: { ...command(permissions).member, user: { id: userId } }, data: { custom_id, values } });

test('existing mounts add merges on days 2 and 4, with and without summon keys', t => {
  const { db, scoring, commands } = fixture(t);
  db.update('22', '11', 'Test', { mount_keys: 4040, mounts: 7, hammers: 14983, pets: 30 }, now);
  const snapshot = db.snapshot('22', now);
  const days = scoring.player(snapshot.players[0], snapshot.tech);
  assert.equal(days[1].categories.mountSummon, 80 * 1080);
  assert.equal(days[1].categories.mountMerge, 87 * 1080);
  assert.equal(days[1].total, 180360);
  assert.equal(days[3].total, 223560);
  db.update('22', '11', 'Test', { mount_keys: 0 }, now);
  assert.equal(scoring.player(db.profile('22', '11'), snapshot.tech)[1].total, 7 * 1080);
  return commands.handle({ ...command('0'), data: { name: 'update' } }, now).then(form => {
    assert.equal(form.type, 9);
    assert.equal(form.data.components.length, 5);
    assert.equal(form.data.components.find(row => row.component.custom_id === 'mounts').component.value, '7');
  });
});

test('weekly delete requires owner and admin, preserves costs, isolates guilds and blocks stale weeks', async t => {
  const { db, commands } = fixture(t);
  for (const user of ['11', '12']) db.update('22', user, user, { pets: 30, mounts: 7, skill_cost_x5: 188, mount_cost: 40 }, now);
  db.update('33', '12', 'Other guild', { pets: 9 }, now);
  assert.equal(CommandRegistrar.definitions().find(cmd => cmd.name === 'delete').default_member_permissions, null);
  assert.match((await commands.handle(command('0'), now)).data.content, /administrator/);
  const panel = await commands.handle(command(), now);
  assert.equal(panel.data.flags, 64);
  const select = panel.data.components[0].components[0];
  assert.deepEqual(select.options.map(option => option.value), ['11', '12']);
  assert.match((await commands.handle(click(select.custom_id, ['12'], '8', '99'), now)).data.content, /innego gracza/);
  assert.match((await commands.handle(click(select.custom_id, ['12'], '0'), now)).data.content, /administrator/);
  assert.match((await commands.handle(click(select.custom_id, ['not-on-list']), now)).data.content, /Lista graczy/);
  const removed = await commands.handle(click(select.custom_id, ['12']), now);
  assert.equal(removed.type, 7);
  assert.match(removed.data.content, /\*\*1\*\*/);
  assert.equal(db.snapshot('22', now).players.length, 1);
  assert.equal(db.profile('22', '12').updated_at, null);
  assert.equal(db.profile('22', '12').skill_cost_x5, 188);
  assert.equal(db.profile('22', '12').mount_cost, 40);
  assert.equal(db.profile('33', '12').pets, 9);
  db.update('22', '12', 'Returned', { mounts: 2 }, now);
  assert.equal(db.snapshot('22', now).players.length, 2);
  const nextMonday = new Date('2026-10-19T00:00:00Z');
  db.update('22', '12', 'New week', { pets: 8 }, nextMonday);
  assert.match((await commands.handle(click(select.custom_id, ['12']), nextMonday)).data.content, /poprzedniego tygodnia/);
  assert.equal(db.profile('22', '12').pets, 8);
});

test('weekly selection supports more than 25 players and day six has one shared explanation', async t => {
  const { db, reports, commands } = fixture(t);
  for (let i = 0; i < 30; i++) db.update('22', String(i + 100), `Player ${i}`, { mounts: i }, now);
  const panel = await commands.handle(command(), now);
  assert.equal(panel.data.components[0].components[0].options.length, 25);
  const next = panel.data.components[1].components[1].custom_id;
  const second = await commands.handle(click(next), now);
  assert.equal(second.data.components[0].components[0].options.length, 5);
  const selection = second.data.components[0].components[0];
  await commands.handle(click(selection.custom_id, selection.options.map(option => option.value)), now);
  assert.equal(db.snapshot('22', now).players.length, 25);
  const details = reports.render('clan-details', db.snapshot('22', now), '11', now);
  const fields = [details, ...(details.additionalMessages ?? [])].flatMap(message => message.embeds.flatMap(embed => embed.fields));
  const daySix = fields.filter(field => field.name.includes('Dzień 6:'));
  assert.equal(daySix.length, 1);
  assert.match(daySix[0].name, /niedziela/);
  assert.equal((daySix[0].value.match(/Nie uwzględniamy/g) ?? []).length, 1);
  assert.doesNotMatch(daySix[0].value, /Player|Aktualizacja/);
  assert.equal(fields.filter(field => field.name === 'Suma klanu: dzień 6').length, 0);
});

test('owned-mount migration preserves current-week records and backs up the old schema once', t => {
  const dir = mkdtempSync(join(tmpdir(), 'owned-mounts-')), path = join(dir, 'bot.sqlite'), backups = join(dir, 'backups');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let db = new Database(path, new WarCalendar(), backups);
  db.update('22', '11', 'Test', { pets: 30, mount_keys: 4040, skill_cost_x5: 188 }, now);
  db.db.exec('ALTER TABLE resources DROP COLUMN mounts');
  db.close();
  db = new Database(path, new WarCalendar(), backups);
  assert.equal(db.snapshot('22', now).players.length, 1);
  assert.equal(db.profile('22', '11').pets, 30);
  assert.equal(db.profile('22', '11').mount_keys, 4040);
  assert.equal(db.profile('22', '11').mounts, 0);
  assert.equal(db.profile('22', '11').skill_cost_x5, 188);
  db.close();
  const files = readdirSync(backups);
  assert.equal(files.length, 1);
  const original = new DatabaseSync(join(backups, files[0]));
  assert.equal(original.prepare('SELECT pets FROM resources').get().pets, 30);
  assert.ok(!original.prepare('PRAGMA table_info(resources)').all().some(row => row.name === 'mounts'));
  original.close();
  db = new Database(path, new WarCalendar(), backups); db.close();
  assert.equal(readdirSync(backups).length, 1);
});
