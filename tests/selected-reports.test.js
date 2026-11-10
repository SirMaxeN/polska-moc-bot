import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { ReportService } from '../src/discord/ReportService.js';
import { ReportPaginator } from '../src/discord/ReportPaginator.js';
import { CommandService } from '../src/discord/CommandService.js';
import { CommandRegistrar } from '../src/discord/CommandRegistrar.js';
import { ParticipationReminders } from '../src/discord/ParticipationReminders.js';
import { sortPlayers } from '../src/discord/PlayerOrder.js';

const now = new Date('2026-10-28T12:00:00Z');
const interaction = (data, type = 2, user = '11', guild = '22') => ({ type, guild_id: guild,
  member: { user: { id: user, username: 'Tester' }, permissions: '0' }, data });
const messages = result => [result, ...(result.additionalMessages ?? [])];
const fields = result => messages(result).flatMap(message => message.embeds?.flatMap(embed => embed.fields) ?? []);
const controls = response => response.data.components.flatMap(row => row.components);
function fixture(t) {
  const calendar = new WarCalendar(), scoring = new ScoringService();
  const db = new Database(':memory:', calendar);
  t.after(() => db.close());
  const reports = new ReportService(calendar, scoring);
  return { calendar, scoring, db, reports, commands: new CommandService(db, reports, scoring) };
}

test('all resource and daily report rosters use Polish nickname order without mutating snapshots', t => {
  const { db, reports } = fixture(t);
  for (const [id, name] of [['3', 'Zofia'], ['2', 'Łukasz'], ['1', 'adam']]) db.update('22', id, name, { pets: 1 }, now);
  const snapshot = db.snapshot('22', now);
  snapshot.players.reverse();
  const before = snapshot.players.map(player => player.user_id);
  const resource = reports.render('resources', snapshot, '11', now);
  assert.deepEqual(fields(resource).slice(0, 3).map(field => field.name), ['adam', 'Łukasz', 'Zofia']);
  for (const kind of ['clan-details', 'clan-ultra']) {
    const text = fields(reports.render(kind, snapshot, '11', now)).map(field => field.value).join('\n');
    const names = [...text.matchAll(/\*\*(adam|Łukasz|Zofia)\*\*/g)].map(match => match[1]);
    assert.deepEqual(names, Array.from({ length: 5 }, () => ['adam', 'Łukasz', 'Zofia']).flat());
  }
  assert.deepEqual(snapshot.players.map(player => player.user_id), before);
});

test('resource picker shows the chosen resources for every saved player', async t => {
  const { db, commands } = fixture(t);
  db.update('22', '11', 'Ala', { hammers: 8, gems: 0 }, now);
  db.update('22', '12', 'Bartek', { hammers: 4 }, now);
  const picker = await commands.handle(interaction({ name: 'report', options: [{ name: 'selected-resources', type: 1 }] }), now);
  const select = controls(picker).find(component => component.type === 3);
  const response = await commands.handle(interaction({ custom_id: select.custom_id, values: ['gems', 'hammers'] }, 3), now);
  assert.deepEqual(fields(response.data).map(field => field.name), ['Ala', 'Bartek']);
  assert.match(fields(response.data)[0].value, /^\u00a0{5}\S+ Młotki: \*\*8\*\*\n\u00a0{5}💎 Diamenty: \*\*0\*\*$/);
  assert.match(fields(response.data)[1].value, /Diamenty: \*\*brak odczytu\*\*/);
});

test('selection spans roster pages, preserves choices on day changes and calculates only selected players', async t => {
  const { db, commands, scoring } = fixture(t);
  for (let i = 30; i >= 1; i--) db.update('22', String(i), `Gracz ${i}`, { mount_keys: i * 50, mounts: i }, now);
  let panel = await commands.handle(interaction({ name: 'report', options: [{ name: 'selected' }] }), now);
  assert.equal(panel.data.flags, 64);
  const select = controls(panel).find(control => control.custom_id.includes(':players:'));
  assert.equal(select.options.length, 25);
  assert.deepEqual(select.options.slice(0, 2).map(option => option.label), ['Gracz 1', 'Gracz 2']);
  const token = select.custom_id.split(':')[3];
  const click = async (action, values, time = now, user = '11', guild = '22') => commands.handle(interaction({
    custom_id: `selected:${user}:${action}:${token}`, ...(values !== undefined ? { values } : {}),
  }, 3, user, guild), time);
  panel = await click('players', ['2', '1']);
  assert.equal(panel.type, 7);
  panel = await click('next');
  assert.equal(controls(panel).find(control => control.type === 3 && control.custom_id.includes(':players:')).options.length, 5);
  await click('players', ['30']);
  await click('day', ['2']);
  panel = await click('prev');
  assert.deepEqual(controls(panel).find(control => control.custom_id.includes(':players:')).options.filter(option => option.default).map(option => option.value), ['1', '2']);
  const result = await click('show');
  assert.equal(result.data.flags, 64);
  assert.deepEqual(fields(result.data).slice(0, 3).map(field => field.name), ['Gracz 1', 'Gracz 2', 'Gracz 30']);
  const snapshot = db.snapshot('22', now);
  const expected = scoring.clan(snapshot.players.filter(player => ['1', '2', '30'].includes(player.user_id)), snapshot.tech).days[1].total;
  assert.ok(fields(result.data).at(-1).value.includes(new Intl.NumberFormat('pl-PL').format(expected)));
  assert.match(result.data.embeds[0].description, /2026|26/);
  await click('day', ['6']);
  assert.match(fields((await click('show')).data).at(-1).value, /Brak prognozy/);
  assert.match((await click('players', ['30'])).data.content, /zmieniła się/);
  assert.match((await click('day', ['7'])).data.content, /od 1 do 6/);
  assert.match((await click('show', undefined, now, '99')).data.content, /wygasł/);
  assert.match((await click('show', undefined, now, '11', 'other')).data.content, /wygasł/);
  assert.match((await click('show', undefined, new Date(now.getTime() + 31 * 60000))).data.content, /wygasł/);
  await click('clear');
  assert.match((await click('show')).data.content, /przynajmniej jednego/);
});

test('today report includes first entries at the UTC reset, excludes stale and cost-only edits in winter', async t => {
  const { db, commands } = fixture(t);
  const time = new Date('2026-10-28T00:30:00Z'); // 01:30 in Poland, after winter game reset.
  db.update('22', '1', 'Zofia', { pets: 1 }, new Date('2026-10-28T00:00:00Z'));
  db.update('22', '2', 'adam', { pets: 1 }, new Date('2026-10-28T00:15:00Z'));
  db.update('22', '3', 'Stary', { pets: 1 }, new Date('2026-10-27T23:59:59Z'));
  db.update('22', '3', 'Stary', { mount_cost: 40 }, time);
  db.setParticipationRoles('22', ['123456789012345678']); // This report does not require a Discord roster fetch.
  const result = await commands.handle(interaction({ name: 'report', options: [{ name: 'updated' }] }), time);
  assert.equal(result.type, 4);
  assert.deepEqual(fields(result.data).map(field => field.name), ['adam', 'Zofia']);
  assert.match(result.data.embeds[0].description, /\*\*2\*\*/);
  const button = await commands.handle(interaction({ custom_id: 'report:11:updated:0' }, 3), time);
  assert.equal(button.type, 7);
  assert.deepEqual(fields(button.data), fields(result.data));
});

test('empty and large new reports respect Discord message limits and commands are registered', async t => {
  const { db, reports, commands } = fixture(t);
  const empty = await commands.handle(interaction({ name: 'report', options: [{ name: 'selected' }] }), now);
  assert.match(empty.data.content, /Brak wpisanych/);
  assert.ok(controls(empty).find(control => control.custom_id.includes(':show:')).disabled);
  assert.match(fields(reports.render('updated', db.snapshot('22', now), '11', now))[0].value, /Nikt/);
  for (let i = 0; i < 90; i++) db.update('22', String(i), `Gracz ${i} ${'x'.repeat(70)}`, { pets: 1 }, now);
  const snapshot = db.snapshot('22', now);
  for (const kind of ['selected', 'updated']) {
    const result = reports.render(kind, { ...snapshot, selectedDay: 3 }, '11', now);
    assert.ok(messages(result).length > 1);
    for (const message of messages(result)) {
      assert.ok(ReportPaginator.fits(message.embeds[0]));
      assert.ok(message.components.length <= 5);
    }
    assert.equal(fields(result).length, kind === 'selected' ? 91 : 90);
  }
  const names = CommandRegistrar.definitions().find(command => command.name === 'report').options.map(option => option.name);
  assert.ok(names.includes('updated') && names.includes('selected'));
});

test('missing lists sort server nicknames and use the same winter UTC reset as updated', async t => {
  const { db } = fixture(t);
  const time = new Date('2026-10-28T00:30:00Z');
  const ids = ['100000000000000001', '100000000000000002', '100000000000000003'];
  db.ensure('22', time);
  db.setParticipationRoles('22', ['123456789012345678']);
  db.update('22', ids[2], 'Current', { pets: 1 }, new Date('2026-10-28T00:01:00Z'));
  const members = ['Zofia', 'adam', 'Current'].map((nick, i) => ({ nick, user: { id: ids[i] }, roles: ['123456789012345678'] }));
  const reminders = new ParticipationReminders(db, 'test', async () => ({ ok: true, json: async () => members }));
  const result = await reminders.messages('22', time);
  assert.ok(result[0].content.indexOf('❗ adam') < result[0].content.indexOf('❗ Zofia'));
  assert.doesNotMatch(result[1].content, /Current/);
});

test('selected resources reconcile with daily scoring, respect each players costs and sum before display', t => {
  const { db, reports, scoring } = fixture(t);
  db.update('22', '1', 'adam', { skill_tickets: 399, skill_cost_x5: 200, mount_keys: 49, mount_cost: 50, mounts: 3, hammers: 7, pets: 2 }, now);
  db.update('22', '2', 'Zofia', { skill_tickets: 399, skill_cost_x5: 180, mount_keys: 49, mount_cost: 40, mounts: 1, hammers: 11, pets: 4 }, now);
  const snapshot = db.snapshot('22', now);
  snapshot.players = sortPlayers(snapshot.players);
  for (let day = 1; day <= 6; day++) {
    const result = reports.render('selected', { ...snapshot, selectedDay: day }, '11', now);
    const entries = fields(result);
    assert.equal(entries.length, 3);
    let totalResources = 0;
    for (let index = 0; index < snapshot.players.length; index++) {
      const player = snapshot.players[index];
      const rows = reports.dayResources(player, day, snapshot.tech);
      const score = scoring.player(player, snapshot.tech)[day - 1];
      assert.ok(entries[index].value.includes('Bilety: **399** →'));
      assert.ok(entries[index].value.includes('Młotki: **'));
      if (day === 6) { assert.match(entries[index].value, /Brak prognozy/); continue; }
      const resourcePoints = rows.reduce((sum, row) => sum + row.points, 0);
      assert.equal(resourcePoints + (score.categories.dungeon ?? 0), score.total);
      totalResources += resourcePoints;
      if (day === 2) {
        const keyPoints = rows.find(row => row.key === 'mount_keys').points;
        assert.equal(keyPoints, index === 0 ? 0 : scoring.rate('mountSummon', day, snapshot.tech) + scoring.rate('mountMerge', day, snapshot.tech));
      }
      if (day === 1 || day === 4) assert.match(entries[index].value, /Lochy \(założenie: 8 kluczy na gracza\)/);
      else assert.doesNotMatch(entries[index].value, /Lochy/);
    }
    assert.ok(entries.at(-1).value.includes('Bilety: **798** →'));
    if (day < 6) assert.equal(totalResources + snapshot.players.reduce((sum, player) => sum + (scoring.player(player, snapshot.tech)[day - 1].categories.dungeon ?? 0), 0), scoring.clan(snapshot.players, snapshot.tech).days[day - 1].total);
    for (const message of messages(result)) assert.ok(ReportPaginator.fits(message.embeds[0]));
  }
});

test('detailed and ultra day selectors default to current day, filter chosen days and retain stale players', async t => {
  const { db, commands } = fixture(t);
  db.update('22', '1', 'Adam', { pets: 2 }, new Date('2026-10-27T12:00:00Z'));
  db.update('22', '2', 'Zofia', { pets: 4 }, now);
  const click = (custom_id, values, time = now, user = '11') => commands.handle(interaction({ custom_id, ...(values ? { values } : {}) }, 3, user), time);
  for (const kind of ['clan-details', 'clan-ultra']) {
    const menu = await commands.handle(interaction({ name: 'report', options: [{ name: kind }] }), now);
    const select = controls(menu).find(control => control.type === 3);
    assert.equal(select.options.find(option => option.default).value, '2');
    const defaultReport = await click(controls(menu).find(control => control.label === 'Pokaż raport').custom_id);
    assert.equal(defaultReport.data.flags, 64);
    assert.equal(fields(defaultReport.data).filter(field => field.name.startsWith('Suma klanu:')).length, 1);
    assert.equal(fields(defaultReport.data).at(-1).name, 'Suma klanu: dzień 2');
    assert.match(fields(defaultReport.data)[0].value, /Adam/);
    assert.match(fields(defaultReport.data).map(field => field.value).join(' '), /Zofia/);
    const changed = await click(select.custom_id, ['5', '3']);
    assert.equal(changed.type, 7);
    const result = await click(controls(changed).find(control => control.label === 'Pokaż raport').custom_id);
    assert.deepEqual(fields(result.data).filter(field => field.name.startsWith('Suma klanu:')).map(field => field.name), ['Suma klanu: dzień 3', 'Suma klanu: dzień 5']);
    assert.doesNotMatch(fields(result.data).map(field => field.name).join('\n'), /Dzień [1246]:/);
    const all = await click(select.custom_id, ['all']);
    const full = await click(controls(all).find(control => control.label === 'Pokaż raport').custom_id);
    const fullFields = [full.data ?? full.response.data, ...(full.followUps ?? [])].flatMap(fields);
    assert.equal(fullFields.filter(field => field.name.startsWith('Suma klanu:')).length, 5);
    assert.equal(fullFields.filter(field => field.name.includes('Dzień 6:')).length, 1);
    assert.match((await click(select.custom_id, ['7'])).data.content, /Wybierz dni/);
    assert.match((await click(select.custom_id, ['1'], now, '99')).data.content, /innego gracza/);
    assert.match((await click(select.custom_id.replace('2026-10-25', '2026-10-18'), ['1'])).data.content, /poprzedniego tygodnia/);
    const button = await click(`report:11:${kind}:0`);
    assert.equal(button.type, 7);
    assert.equal(controls(button).find(control => control.type === 3).options.find(option => option.default).value, '2');
    assert.ok(button.data.components.length <= 5);
  }
  const selected = await commands.handle(interaction({ name: 'report', options: [{ name: 'selected' }] }), now);
  assert.deepEqual(controls(selected).find(control => control.custom_id.includes(':players:')).options.map(option => option.value), ['1', '2']);
  const monday = await commands.handle(interaction({ name: 'report', options: [{ name: 'clan-details' }] }), new Date('2026-11-02T12:00:00Z'));
  assert.equal(controls(monday).find(control => control.type === 3).options.find(option => option.default).value, 'all');
});
