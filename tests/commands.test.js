import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { Database } from '../src/storage/Database.js';
import { ReportService } from '../src/discord/ReportService.js';
import { CommandService } from '../src/discord/CommandService.js';

const now = new Date('2026-10-13T13:00:00Z');
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'botyslaw-test-'));
  const calendar = new WarCalendar();
  const scoring = new ScoringService();
  const db = new Database(':memory:', calendar, directory);
  const reports = new ReportService(calendar, scoring);
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  return { db, reports, commands: new CommandService(db, reports, scoring), directory };
}
function command(name, options = [], permissions = '0', userId = '11', guildId = '22') {
  return { id: '123', type: 2, guild_id: guildId, member: { user: { id: userId, username: 'SirMaxeN' }, permissions }, data: { name, options } };
}
const field = (name, value) => ({ name, value });

test('resource form prefills values, preserves blank fields, validates atomically and rejects another owner', async t => {
  const { commands, db } = fixture(t);
  const panel = await commands.handle(command('update'), now);
  assert.equal(panel.type, 9);
  const open = { ...command(''), type: 3, data: { custom_id: 'resources:11:open' } };
  const fresh = await commands.handle(open, now);
  assert.equal(fresh.type, 9);
  assert.equal(fresh.data.components.length, 5);
  assert.ok(fresh.data.components.every(row => row.type === 18 && row.label.length <= 45));
  assert.match(fresh.data.components[0].description, /3\+5\*3=18/);
  assert.ok(fresh.data.components.slice(1).every(row => row.description === undefined));
  assert.equal(fresh.data.components[2].label, '🐎 Wierzchowce (bez 1 bazowego)');
  assert.equal(fresh.data.components[3].label, '🔨 Młotki');
  assert.equal(db.profile('22', '11'), undefined);
  db.update('22', '11', 'SirMaxeN', { skill_tickets: 9880, skill_cost_x5: 188, pets: 28 }, now);
  const filled = await commands.handle(open, now);
  assert.equal(filled.data.components[0].component.value, '9880');
  const submit = (owner, values) => ({ ...command(''), type: 5, data: { custom_id: `resources:${owner}:save`,
    components: [{ type: 10 }, ...Object.entries(values).map(([custom_id, value]) => ({ type: 18, component: { custom_id, value } }))],
  } });
  await commands.handle(submit('99', { pets: '0' }), now);
  assert.equal(db.profile('22', '11').pets, 28);
  await commands.handle(submit('11', { skill_tickets: '', mount_keys: '2,84', pets: '0', skill_cost_x5: '' }), now);
  assert.equal(db.profile('22', '11').skill_tickets, 9880);
  assert.equal(db.profile('22', '11').skill_cost_x5, 188);
  assert.equal(db.profile('22', '11').mount_keys, 2840);
  assert.equal(db.profile('22', '11').pets, 0);
  const costClick = { ...command(''), type: 3, data: { custom_id: 'resources:11:cost' } };
  const costForm = await commands.handle(costClick, now);
  assert.equal(costForm.type, 9);
  assert.equal(costForm.data.components[0].component.value, '188');
  const costSubmit = submit('11', { skill_cost_x5: '180' });
  await commands.handle(costSubmit, new Date(now.getTime() + 60000));
  assert.equal(db.profile('22', '11').skill_cost_x5, 180);
  assert.equal(db.profile('22', '11').updated_at, now.toISOString());
  await commands.handle({ ...costClick, data: { custom_id: 'resources:99:cost' } }, now);
  assert.equal(db.profile('22', '11').skill_cost_x5, 180);
  const invalid = await commands.handle(submit('11', { pets: '20', hammers: '-1' }), now);
  assert.equal(invalid.data.flags, 64);
  assert.equal(db.profile('22', '11').pets, 0);
  const help = await commands.handle(command('help'), now);
  assert.equal(help.data.flags, 64);
  assert.equal(help.data.components[0].components[0].custom_id, 'resources:11:open');
  assert.doesNotMatch(help.data.embeds[0].description, /Zmień koszt/);
  assert.match(help.data.embeds[0].description, /report clan-details/);
  assert.doesNotMatch(help.data.embeds[0].description, /\/tech|\/season/);
  const reportButton = { custom_id: 'report:11:player:0' };
  const report = await commands.handle({ ...open, data: { custom_id: reportButton.custom_id } }, now);
  assert.equal(report.type, 7);
  assert.equal(report.data.components[0].components[0].custom_id, 'resources:11:open');
  const denied = await commands.handle({ ...open, member: { ...open.member, user: { id: '99' } } }, now);
  assert.match(denied.data.content, /innego gracza/);
});

test('current day countdown uses the next Warsaw boundary, including DST and minute rounding', t => {
  const { reports } = fixture(t);
  const check = (date, day, expected) => {
    const time = new Date(date);
    assert.match(reports.header(reports.calendar.cycle(time), day, time), expected);
  };
  check('2026-10-13T13:00:00Z', 1, /koniec za 11 godz\./);
  check('2026-10-13T23:58:30Z', 1, /koniec za 2 min/);
  check('2026-10-25T00:00:00Z', 6, /koniec za 25 godz\./);
  const time = new Date('2026-10-13T13:00:00Z');
  assert.doesNotMatch(reports.header(reports.calendar.cycle(time), 2, time), /koniec za/);
  assert.doesNotMatch(reports.header(reports.calendar.cycle(time), 3, time), /koniec za/);
});

test('unexpected failures never expose internal paths or secrets to users', async t => {
  const { commands, db } = fixture(t);
  db.ensure = () => { throw new Error('/home/private/database.sqlite: secret-token-value'); };
  const result = await commands.handle(command('report', [{ name: 'player' }]), now);
  assert.equal(result.data.flags, 64);
  assert.doesNotMatch(result.data.content, /private|sqlite|secret-token/);
  assert.match(result.data.content, /Spróbuj ponownie/);
});

test('first server entry uses supplied technology and later cycles preserve administrator changes', t => {
  const { db } = fixture(t);
  const initial = db.snapshot('22', now).tech;
  assert.deepEqual(initial, {
    forge: 0, skillSummon: 40, skillUpgrade: 40, research: 0, forgeSpending: 0,
    dungeon: 40, egg: 40, petMerge: 40, mountSummon: 40, mountMerge: 40,
    day1: 40, day2: 40, day3: 40, day4: 40, day5: 40, day6: 0,
  });
  db.updateTech('22', 'day1', 12);
  assert.equal(db.snapshot('22', new Date('2026-10-19T00:00:00Z')).tech.day1, 12);
  db.resetTech('22');
  assert.equal(Object.values(db.snapshot('22', new Date('2026-10-25T01:00:00Z')).tech).every(value => value === 0), true);
});

test('partial updates replace, invalid updates are atomic, costs survive weekly rollover', async t => {
  const { db, commands } = fixture(t);
  await commands.handle(command('update', [field('skill_tickets', '9.88k'), field('skill_cost_x5', '188'), field('pets', '28')]), now);
  const original = db.profile('22', '11');
  await commands.handle(command('update', [field('pets', '0')]), now);
  assert.equal(db.profile('22', '11').skill_tickets, 9880);
  assert.equal(db.profile('22', '11').pets, 0);
  await commands.handle(command('update', [field('pets', '20'), field('hammers', '-1')]), now);
  assert.equal(db.profile('22', '11').pets, 0);
  assert.equal(db.profile('22', '11').hammers, 0);
  const sunday = new Date('2026-10-19T00:00:00Z');
  assert.equal(db.snapshot('22', sunday).players.length, 0);
  assert.equal(db.profile('22', '11').skill_cost_x5, 188);
  await commands.handle(command('update', [field('skill_cost_x5', '180')]), sunday);
  assert.equal(db.snapshot('22', sunday).players.length, 0);
  assert.equal(db.profile('22', '11').updated_at, null);
  await commands.handle(command('update', [field('pets', '0')]), sunday);
  assert.equal(db.snapshot('22', sunday).players.length, 1);
  assert.equal(db.snapshot('22', new Date('2026-10-19T00:05:00Z')).players.length, 1);
  assert.equal(original.skill_cost_x5, 188);
});

test('cost-only updates do not refresh resource timestamps and servers are isolated', async t => {
  const { db, commands } = fixture(t);
  await commands.handle(command('update', [field('pets', '28')]), now);
  await commands.handle(command('update', [field('skill_cost_x5', '188')]), new Date(now.getTime() + 60000));
  assert.equal(db.profile('22', '11').updated_at, now.toISOString());
  assert.equal(db.snapshot('33', now).players.length, 0);
  assert.equal(db.profile('22', '11').pets, 28);
});

test('resource profiles and technology survive closing and reopening the database', t => {
  const directory = mkdtempSync(join(tmpdir(), 'botyslaw-persistence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'bot.sqlite');
  let db = new Database(path, new WarCalendar(), directory);
  db.update('22', '11', 'SirMaxeN', { skill_cost_x5: 188, skill_tickets: 9880, pets: 28 }, now);
  db.updateTech('22', 'forge', 12);
  db.close();
  db = new Database(path, new WarCalendar(), directory);
  try {
    const snapshot = db.snapshot('22', now);
    assert.equal(snapshot.players[0].skill_cost_x5, 188);
    assert.equal(snapshot.players[0].skill_tickets, 9880);
    assert.equal(snapshot.players[0].pets, 28);
    assert.equal(snapshot.tech.forge, 12);
  } finally { db.close(); }
});

test('technology panels enforce owner/admin, modal replaces bonus, reset requires button', async t => {
  const { db, commands } = fixture(t);
  const denied = await commands.handle(command('tech', [{ name: 'update' }]), now);
  assert.match(denied.data.content, /administrator/);
  const panel = await commands.handle(command('tech', [{ name: 'update' }], '8'), now);
  assert.equal(panel.data.components[0].components[0].options.length, 16);
  const component = { ...command('', [], '8'), type: 3, data: { custom_id: 'tech:11:select', values: ['forge'] } };
  assert.equal((await commands.handle(component, now)).type, 9);
  const modal = { ...component, type: 5, data: { custom_id: 'tech:11:save:forge', components: [{ components: [{ custom_id: 'percentage', value: '12%' }] }] } };
  await commands.handle(modal, now);
  assert.equal(db.snapshot('22', now).tech.forge, 12);
  await commands.handle(command('tech', [{ name: 'reset' }], '8'), now);
  assert.equal(db.snapshot('22', now).tech.forge, 12);
  const reset = { ...component, data: { custom_id: 'tech:11:reset' } };
  await commands.handle({ ...reset, member: { ...reset.member, permissions: '0' } }, now);
  assert.equal(db.snapshot('22', now).tech.forge, 12);
  await commands.handle({ ...reset, data: { custom_id: 'tech:99:reset' } }, now);
  assert.equal(db.snapshot('22', now).tech.forge, 12);
  await commands.handle(reset, now);
  assert.equal(Object.values(db.snapshot('22', now).tech).every(value => value === 0), true);
});

test('season confirmation and permissions, backup, atomic reset, durable retry protection', async t => {
  const { db, commands, directory } = fixture(t);
  await commands.handle(command('update', [field('pets', '28'), field('skill_cost_x5', '188')]), now);
  const reset = confirmation => command('season', [{ name: 'reset', options: [field('confirmation', confirmation)] }], '8');
  await commands.handle(reset('wrong'), now);
  await commands.handle({ ...reset('BYEBYESEASON'), member: { ...reset('BYEBYESEASON').member, permissions: '0' } }, now);
  assert.equal(db.profile('22', '11').pets, 28);
  const response = await commands.handle(reset(' byebyeseason '), now);
  assert.equal(response.response.type, 5);
  await response.complete();
  assert.equal(db.profile('22', '11').skill_cost_x5, null);
  assert.equal(db.snapshot('22', now).players.length, 0);
  assert.equal(Object.values(db.snapshot('22', now).tech).every(value => value === 0), true);
  assert.equal(readdirSync(directory).length, 1);
  await commands.handle(command('update', [field('pets', '5')]), now);
  await response.complete();
  assert.equal(db.profile('22', '11').pets, 5);
});

test('reports use private pages, match totals and respect Discord embed limits', async t => {
  const { db, reports, commands } = fixture(t);
  const empty = await commands.handle(command('report', [{ name: 'player' }]), now);
  assert.match(empty.data.embeds[0].description, /update/);
  assert.equal(empty.data.flags, 64);
  db.update('22', '11', 'SirMaxeN', { skill_tickets: 9880, skill_cost_x5: 188, mount_keys: 2840, hammers: 11026, pets: 28 }, now);
  const snapshot = db.snapshot('22', now);
  const player = reports.render('player', snapshot, '11', now);
  assert.match(player.embeds[0].fields[0].name, /^🟢 \*\*/);
  assert.match(player.embeds[0].fields[1].name, /^⚪/);
  const clan = reports.render('clan', snapshot, '11', now);
  assert.match(reports.render('clan-details', snapshot, '11', now).embeds[0].fields[0].value, /SirMaxeN.*\n> 🕒 \*Aktualizacja: /);
  assert.equal(clan.embeds[0].fields[0].value.split('\n')[0], player.embeds[0].fields[0].value.split('\n')[0]);
  assert.match(clan.embeds[0].fields[5].value, /Brak prognozy/);
  for (let i = 0; i < 100; i++) db.update('22', String(i + 100), '*'.repeat(32), { pets: 28 }, now);
  const large = db.snapshot('22', now);
  const check = payload => {
    const buttons = payload.components.flatMap(row => row.components);
    const ids = buttons.map(button => button.custom_id);
    assert.equal(new Set(ids).size, ids.length, 'Discord requires unique button identifiers, including disabled buttons');
    assert.ok(ids.every(id => id.length <= 100));
    const embed = payload.embeds[0];
    let count = (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0);
    for (const field of embed.fields ?? []) { assert.ok(field.value.length <= 1024); count += field.name.length + field.value.length; }
    assert.ok(count <= 6000);
  };
  check(player); check(clan);
  const detailed = reports.render('clan-details', large, '11', now);
  const messages = [detailed, ...(detailed.additionalMessages ?? [])];
  assert.ok(messages.length > 1);
  for (const message of messages) {
    check(message);
    assert.ok(message.components.flatMap(row => row.components).every(button => !['Poprzednia', 'Następna'].includes(button.label)));
  }
  const allFields = messages.flatMap(message => message.embeds.flatMap(embed => embed.fields));
  for (let day = 1; day <= 5; day++) {
    assert.equal(allFields.filter(field => field.name === `Suma klanu: dzień ${day}`).length, 1);
    let currentDay;
    const memberFields = allFields.filter(field => {
      const match = /Dzień (\d):/.exec(field.name);
      if (match) currentDay = Number(match[1]);
      return currentDay === day && !field.name.startsWith('Suma klanu:');
    });
    assert.equal(memberFields.reduce((count, field) => count + (field.value.match(/Aktualizacja:/g) ?? []).length, 0), 101);
  }
  const ultra = reports.render('clan-ultra', large, '11', now);
  const ultraMessages = [ultra, ...(ultra.additionalMessages ?? [])];
  for (const message of ultraMessages) {
    check(message);
    const days = message.embeds[0].fields.map(field => /(?:Dzień|dzień) (\d)/.exec(field.name)?.[1]).filter(Boolean);
    assert.equal(new Set(days).size, 1, 'Each ultra message must contain only one day, including clan totals');
  }
  const ultraFields = ultraMessages.flatMap(message => message.embeds[0].fields);
  for (let day = 1; day <= 5; day++) {
    const fields = ultraMessages.filter(message => message.embeds[0].title.includes(`: dzień ${day}`)).flatMap(message => message.embeds[0].fields);
    assert.equal(fields.reduce((count, field) => count + (field.value.match(/Aktualizacja:/g) ?? []).length, 0), 101);
    assert.equal(ultraFields.filter(field => field.name === `Suma klanu: dzień ${day}`).length, 1);
  }
  const singleUltra = reports.render('clan-ultra', snapshot, '11', now);
  const singleMessages = [singleUltra, ...(singleUltra.additionalMessages ?? [])];
  assert.equal(singleMessages.length, 1, 'Small ultra reports must stay in one message');
  const singleFields = singleMessages.flatMap(message => message.embeds[0].fields);
  for (let day = 1; day <= 5; day++) {
    const field = singleFields.find(item => item.name.includes(`Dzień ${day}:`));
    const ownLines = player.embeds[0].fields[day - 1].value.split('\n').slice(1, -1).join('\n');
    assert.ok(field.value.endsWith(ownLines), 'Ultra action points must exactly match the personal report');
    assert.ok(field.value.startsWith('**SirMaxeN**: **'));
    assert.doesNotMatch(field.value, /[🟦🟪🟧🟨🟫🟩]/u);
  }
  assert.equal(singleFields.filter(field => field.name.includes('Dzień 6:')).length, 1);
  const ultraReply = await commands.handle(command('report', [{ name: 'clan-ultra' }]), now);
  assert.equal(ultraReply.response.data.flags, 64);
  const small = reports.render('clan-details', snapshot, '11', now);
  assert.equal(small.additionalMessages, undefined);
  assert.equal(small.embeds[0].fields.filter(field => field.name.startsWith('Suma klanu:')).length, 5);
  const click = custom_id => ({ ...command(''), type: 3, data: { custom_id } });
  const clicked = await commands.handle(click('report:11:clan-details:0'), now);
  assert.equal(clicked.response.type, 7);
  assert.ok(clicked.followUps.every(message => message.flags === 64));
  const rejected = await commands.handle({ ...click('report:11:clan-details:0'), member: { user: { id: '99' } } }, now);
  assert.match(rejected.data.content, /innego gracza/);
});

