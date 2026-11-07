import test from 'node:test';
import assert from 'node:assert/strict';
import { Ascension } from '../src/domain/Ascension.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { Technology } from '../src/domain/Technology.js';
import { ReportService } from '../src/discord/ReportService.js';
import { ServerSetup } from '../src/discord/ServerSetup.js';
import { ParticipationReminders } from '../src/discord/ParticipationReminders.js';
import { Database } from '../src/storage/Database.js';

const tech = Object.fromEntries(Technology.entries.map(([key, , value]) => [key, value]));
const player = (id, ascension = []) => ({ user_id: id, name: `Gracz${id}`, skill_tickets: 400, mount_keys: 100, mounts: 2, hammers: 1000, pets: 4, updated_at: '2026-11-03T10:00:00Z', ascension });
const all = payload => [payload, ...(payload.additionalMessages ?? [])].map(message => JSON.stringify(message.embeds)).join('\n');

test('role names map to the four game ascensions; configured roles win over names', () => {
  assert.equal(Ascension.fromRoleName('Wzniesienie: Kuźnia'), 'forge');
  assert.equal(Ascension.fromRoleName('wzniesienie ekwipunku'), 'forge');
  assert.equal(Ascension.fromRoleName('Wzniesienie – Zwierzaki'), 'pets');
  assert.equal(Ascension.fromRoleName('Wzniesienie: Wierzchowce'), 'mounts');
  assert.equal(Ascension.fromRoleName('Wzniesienie: Umiejętności'), 'skills');
  assert.equal(Ascension.fromRoleName('Kuźnia'), null);
  const roles = [{ id: '100000000000000001', name: 'Wzniesienie: Kuźnia' }, { id: '100000000000000002', name: 'Wzniesienie: Zwierzaki' }, { id: '100000000000000003', name: 'Kowale' }];
  const members = [{ user: { id: '1' }, roles: ['100000000000000001', '100000000000000002'] }, { user: { id: '2' }, roles: ['100000000000000003'] }];
  assert.deepEqual(Ascension.members(roles, members).get('1'), ['forge', 'pets']);
  assert.equal(Ascension.members(roles, members).has('2'), false);
  // "Kowale" chosen for Forge in /setup: the name-based Forge role no longer counts.
  const configured = Ascension.members(roles, members, { forge: ['100000000000000003'] });
  assert.deepEqual(configured.get('1'), ['pets']);
  assert.deepEqual(configured.get('2'), ['forge']);
});

test('ascension points are split from the available total for the player and the clan', () => {
  const scoring = new ScoringService();
  const free = scoring.player(player('1'), tech);
  const forge = scoring.player(player('2', ['forge']), tech);
  for (const day of [1, 3, 5]) {
    const a = free[day - 1], b = forge[day - 1];
    assert.equal(b.total + b.ascension, a.total);
    assert.equal(b.ascension, a.categories.forge);
    assert.deepEqual(b.ascensionCategories, ['forge']);
  }
  assert.equal(forge[1].ascension, 0, 'day 2 has no forging');
  const clan = scoring.clan([player('1'), player('2', ['forge'])], tech);
  assert.equal(clan.days[0].total, free[0].total + forge[0].total);
  assert.equal(clan.days[0].ascension, forge[0].ascension);
});

test('reports mark ascension players and show "+ ⛰️ … pkt ze wzniesienia"', () => {
  const reports = new ReportService(new WarCalendar(), new ScoringService());
  const now = new Date('2026-11-04T12:00:00Z');
  const snapshot = { tech, players: [player('1'), player('2', ['forge', 'mounts'])] };
  for (const kind of ['clan', 'clan-details', 'clan-ultra', 'resources']) {
    const text = all(reports.render(kind, snapshot, '1', now));
    assert.match(text, /⛰️ = gracz ma rangę wzniesienia/, kind);
    assert.match(text, kind === 'resources' ? /ze wzniesienia \(1000 szt\.\)/ : /\+ ⛰️ [\d\s ]+ pkt ze wzniesienia/, kind);
  }
  assert.match(all(reports.render('clan-details', snapshot, '1', now)), /Gracz2\*\* ⛰️ \*wzniesienie: kuźnia, wierzchowce\*/);
  const player2 = all(reports.render('player', snapshot, '2', now));
  assert.match(player2, /Wzniesienie: Kuźnia, Wierzchowce/);
  assert.match(player2, /⛰️ Kucie wyposażenia: .* \(wzniesienie\)/);
  const plain = all(reports.render('clan', { tech, players: [player('1')] }, '1', now));
  assert.doesNotMatch(plain, /⛰️/);
});

test('/setup stores one role list per ascension and the report reads it from Discord', async t => {
  const db = new Database(':memory:', new WarCalendar()); t.after(() => db.close());
  const guild = '900000000000000000';
  db.setAscensionRoles(guild, 'pets', ['100000000000000009']);
  assert.deepEqual(db.ascensionRoles(guild), { pets: ['100000000000000009'] });
  assert.throws(() => db.setAscensionRoles(guild, 'pets', [guild]), /everyone/);
  assert.throws(() => db.setAscensionRoles(guild, 'gold', []), /Nieznany/);
  const panel = ServerSetup.ascensionPanel('1', guild, db);
  assert.equal(panel.components.length, 5);
  assert.match(panel.content, /Zwierzaki.*<@&100000000000000009>/);
  assert.match(panel.content, /Wzniesienie: Kuźnia/);
  db.setAscensionRoles(guild, 'pets', []);
  assert.deepEqual(db.ascensionRoles(guild), {});
  const request = async url => ({ ok: true, json: async () => url.endsWith('/roles')
    ? [{ id: '100000000000000001', name: 'Wzniesienie: Kuźnia' }]
    : [{ user: { id: '200000000000000001' }, roles: ['100000000000000001'] }] });
  const map = await new ParticipationReminders(db, 'token', request).ascensions(guild);
  const view = ParticipationReminders.withAscensions({ players: [{ user_id: '200000000000000001' }, { user_id: '3' }] }, map);
  assert.deepEqual(view.players.map(p => p.ascension), [['forge'], []]);
});
