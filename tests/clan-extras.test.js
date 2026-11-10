import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { NumberParser } from '../src/domain/NumberParser.js';
import { ClanTech } from '../src/domain/ClanTech.js';
import { Database } from '../src/storage/Database.js';
import { ReportService } from '../src/discord/ReportService.js';
import { CommandService } from '../src/discord/CommandService.js';
import { DonationReport } from '../src/discord/DonationReport.js';
import { WarReport } from '../src/discord/WarReport.js';
import { MobileSync } from '../src/http/MobileSync.js';

const now = new Date('2026-11-10T13:00:00Z');
const text = view => JSON.stringify(view);
function fixture(t, isManager = async () => true) {
  const calendar = new WarCalendar(), scoring = new ScoringService(), db = new Database(':memory:', calendar);
  t.after(() => db.close());
  const mobile = new MobileSync(db, scoring, { clock: () => now.getTime(), isManager });
  return { db, mobile, commands: new CommandService(db, new ReportService(calendar, scoring), scoring, mobile) };
}
const member = (custom_id, type, components, permissions = '0') => ({ id: randomUUID(), type, guild_id: '22', member: { user: { id: '11', username: 'SirMaxeN' }, permissions, roles: [] },
  data: { custom_id, ...(components ? { components: Object.entries(components).map(([id, value]) => ({ type: 18, component: { custom_id: id, value } })) } : {}) } });

test('game abbreviations k, m and b are accepted (coins 2.12m)', () => {
  assert.equal(NumberParser.integer('2.12m', { implicitThousands: true }), 2_120_000);
  assert.equal(NumberParser.integer('46.6k', { implicitThousands: true }), 46_600);
  assert.equal(NumberParser.integer('1,5b'), 1_500_000_000);
  assert.equal(NumberParser.integer('9,55', { implicitThousands: true }), 9_550);
});

test('additional resources open from their own button and do not change war points', async t => {
  const { commands, db } = fixture(t);
  const first = await commands.handle(member('resources:11:save:x', 5, { hammers: '100' }), now);
  assert.match(first.data.content, /Zapisano dane/);
  assert.equal(first.data.components[0].components.find(c=>c.custom_id==='resources:11:open-extra').label,'Dodatkowe informacje');
  assert.ok(first.data.components.length <= 5);
  const modal = await commands.handle(member('resources:11:open-extra', 3), now);
  assert.equal(modal.type, 9);
  assert.deepEqual(modal.data.components.map(row => row.component.custom_id), ['green_vials', 'gems', 'red_vials', 'shells', 'coins']);
  const before = db.snapshot('22', now).players[0];
  await commands.handle(member('resources:11:save-extra:z', 5, { green_vials: '1,68k', gems: '7', red_vials: '46.6k', shells: '78', coins: '2.12m' }), now);
  const player = db.profile('22', '11');
  assert.deepEqual([player.green_vials, player.gems, player.red_vials, player.shells, player.coins], [1680, 7, 46600, 78, 2120000]);
  assert.equal(player.hammers, before.hammers);
  const report = await commands.handle(member('report:11:resources:0', 3), now);
  assert.match(text(report), /Zielone fiolki: \*\*1/);
  assert.match(text(report), /bez punktów/);
});

test('/update, costs and additional information have independent forms', async t => {
  const { commands,db }=fixture(t);
  db.update('22','11','Ala',{pets:7,red_vials:123},now);
  const slash={...member('',2),data:{name:'update'}};
  const modal=await commands.handle(slash,now);
  assert.equal(modal.type,9);
  assert.equal(modal.data.components.length,5);
  assert.match(modal.data.custom_id,/:save:/);
  assert.deepEqual(modal.data.components.map(r=>r.component.custom_id),['skill_tickets','mount_keys','mounts','hammers','pets']);
  assert.equal(modal.data.components[4].component.value,'7');
  const reply=await commands.handle(member(modal.data.custom_id,5,{hammers:'5+3*2',mounts:'3',pets:''}),now);
  assert.equal(reply.type,4);
  const costs=await commands.handle(member('resources:11:costs',3),now);
  assert.deepEqual(costs.data.components.map(r=>r.component.custom_id),['skill_cost_x5','mount_cost']);
  const extras=await commands.handle(member('resources:11:open-extra',3),now);
  await commands.handle(member(extras.data.custom_id,5,{green_vials:'2k',red_vials:'',coins:'2.12m'}),now);
  const p=db.profile('22','11');
  assert.deepEqual([p.hammers,p.mounts,p.pets,p.green_vials,p.red_vials,p.coins],[11,3,7,2000,123,2120000]);
});

test('donation report: 2 green potions or 1 gem per point, times the scanned race bonus, per player and clan totals', async t => {
  const { commands, db } = fixture(t);
  db.update('22', '11', 'Ala', { hammers: 1, green_vials: 1680, gems: 7 }, now);
  db.update('22', '12', 'Bob', { hammers: 1, green_vials: 101, gems: 0 }, now);
  db.update('22', '13', 'Cyd', { hammers: 1 }, now);
  let view = await commands.handle(member('report:11:donations:0', 3), now);
  assert.match(text(view), /Ala\*\*: 🧪 1[^0-9]?680 → 840 pkt · 💎 7 → 7 pkt · 🧮 Suma: \*\*847 pkt\*\*/);
  assert.match(text(view), /Bob\*\*: 🧪 101 → 50 pkt/);
  assert.match(text(view), /\*\*2\*\* z \*\*3\*\* graczy/);
  assert.ok(view.data.components.length <= 5, 'Discord allows at most five rows');
  assert.ok(text(view.data.components).includes('report:11:donations:0'), 'Wyścig klanu stays reachable after a report');
  db.saveClanTech('22', '11', { observed_at: now.toISOString(), nodes: [{ name: 'Wyścig badań klanu', text: 'Darowizny liczą się o +50% więcej w wyścigu', level: 10, max: 20, percent: 50 }] }, now);
  view = await commands.handle(member('report:11:donations:0', 3), now);
  assert.match(text(view), /\+50%/);
  assert.match(text(view), /Ala\*\*: 🧪 1[^0-9]?680 → 1[^0-9]?260 pkt/);
  db.db.exec("CREATE TABLE donation_settings(guild_id TEXT,potions_per_point INTEGER,gems_per_point INTEGER,race_bonus INTEGER); INSERT INTO donation_settings VALUES('22',1,10,99)");
  const updated = await commands.handle(member('report:11:donations:0',3),now);
  assert.match(text(updated),/\+50%/);
  assert.match(text(updated),/1[^0-9]?260 pkt · 💎 7 → 10 pkt/);
  const snapshot=db.snapshot('22',now);
  assert.deepEqual(DonationReport.render(snapshot.players,snapshot.tech.raceDonations).totals,{vials:1335,gems:10,total:1345});
  const denied = await commands.handle(member('setup:11:donations', 3), now);
  assert.match(text(denied), /administratora/);
});

test('app uploads clan research and optional extra resources; old seven-field uploads still work', async t => {
  let allowed=true;
  const { db, mobile, commands } = fixture(t,async()=>allowed);
  const token = mobile.pair({ code: mobile.code('22', '11', 'Ala') }).token;
  const server = createServer((req, res) => mobile.receive(req, res, req.url, (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (route, body) => fetch(`http://127.0.0.1:${server.address().port}/mobile/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const values = { skill_tickets: 1, mount_keys: 2, hammers: 3, pets: 4, mounts: 5, skill_cost_x5: 200, mount_cost: 50 };
  assert.equal((await post('resources', { request_id: randomUUID(), observed_at: now.toISOString(), values })).status, 200);
  assert.equal((await post('resources', { request_id: randomUUID(), observed_at: now.toISOString(), values: { ...values, gems: 7, green_vials: 1680, coins: 2120000 } })).status, 200);
  assert.equal(db.profile('22', '11').coins, 2120000);
  assert.equal((await post('resources', { request_id: randomUUID(), observed_at: now.toISOString(), values: { ...values, diamonds: 1 } })).status, 400);
  const nodes = [{ name: 'Obrażenia w wojnie klanów', text: '+8700% obrażeń w atakach', level: 87, max: 100, percent: 8700 }, { name: 'Zdrowie w wojnie klanów', level: 77, max: 100, percent: 7700 },
    {key:'war_forging',name:'Kucie',level:7,max:10,percent:28},{key:'war_day_1',name:'Dzień 1',level:9,max:10,percent:4}];
  const scan={request_id:randomUUID(),observed_at:now.toISOString(),clan:'PolskaMOC',nodes};
  allowed=false;
  assert.equal((await post('clan-tech',scan)).status,403);
  allowed=true;
  const sent=await post('tech',scan);
  assert.equal(sent.status,200);
  assert.equal((await sent.json()).nodes,3);
  const tech=db.snapshot('22',now).tech;
  assert.equal(tech.forge,28);
  assert.equal(tech.warDamage,8700);
  assert.equal(tech.day1,40,'conflicting evidence does not overwrite current tech');
  const show=await commands.handle({...member('',2),data:{name:'tech',options:[{name:'show'}]}},now);
  assert.match(show.data.content,/Kucie wyposażenia: \*\*28%/);
  assert.match(show.data.content,/Obrażenia w wojnie klanów: \*\*8700%/);
  assert.deepEqual(ClanTech.warLevels(db.clanTech('22')), { damage: 87, health: 77 });
  assert.equal((await post('clan-tech', { request_id: randomUUID(), observed_at: now.toISOString(), nodes: [] })).status, 400);
  assert.match(text(DonationReport.techReport(db.clanTech('22'))), /Obrażenia w wojnie klanów\*\* 87\/100 · \+8[^0-9]?700%/);
});

test('war list shows how many clan-tech levels would beat rivals nobody beats, with potion and gem costs', () => {
  const lines = WarReport.techHint({ damage_level: 87, health_level: 77, max_level: 100, beaten: 40, reset_needed: 45,
    enemies: [{ name: 'Boss', best: .2, damage: 5, health: null, both: 3 }, { name: 'Tank', best: .1, damage: null, health: null, both: null }] });
  assert.match(lines[0], /⚔️ 87\/100 · ❤️ 77\/100/);
  assert.match(lines[0], /brakuje \*\*5\*\*/);
  assert.match(lines[1], /Boss\*\*: ⚔️ \+5 poz\. \(do 92\/100, \+500%\) · 2[^0-9]?460 fiolek lub 1[^0-9]?230 💎/);
  assert.match(lines[1], /⚔️\+❤️ po \+3 poz\./);
  assert.match(lines[2], /nawet maksymalny tech nie wystarcza/);
  assert.deepEqual(WarReport.techHint(null), []);
  assert.deepEqual(WarReport.techHint({ enemies: [] }), []);
});

test('a full 50x50 war list with a ten-rival tech hint still fits Discord embed limits', async () => {
  const { validateSimulation } = await import('../src/domain/WarSimulation.js');
  const at = Date.parse('2026-11-04T12:00:00Z');
  const ours = Array.from({ length: 50 }, (_, i) => ({ name: `NaszDlugiNick${i}`, power: 1e9 + i })), enemies = Array.from({ length: 50 }, (_, i) => ({ name: `RywalDlugiNick${i}`, power: 9e8 + i }));
  const profile = p => ({ ...p, damage: 1e6, health: 1e9, ranged: false, mounted: true, pets: 3, bonuses: { CRIT: 65 }, skillsReviewed: true, skills: [{ type: 'STAMPEDE', level: 14 }], fairy: { present: false }, scannedAt: at });
  const body = { request_id: randomUUID(), war_day: 'TEST', observed_at: new Date(at).toISOString(), ours, enemies, our_count: 50, enemy_count: 50, own_clan: 'A', enemy_clan: 'B',
    own_bonus: { damage: 8700, health: 7700 }, enemy_bonus: { damage: 9900, health: 9900 }, profiles: { ours: ours.map(profile), enemies: enemies.map(profile) },
    simulation: { model: 'pvp-full-v1', experimental: true, matrix: ours.flatMap((_, ally) => enemies.map((_, enemy) => ({ ally, enemy, wins: enemy >= 40 ? 100 : 700, losses: enemy >= 40 ? 924 : 324, draws: 0, trials: 1024 }))),
      tech_hint: { damage_level: 87, health_level: 77, max_level: 100, beaten: 40, reset_needed: 45, enemies: enemies.slice(40).map(e => ({ name: e.name, best: .1, damage: 9, health: 20, both: 6 })) } } };
  body.plan = validateSimulation(body, body.ours, body.enemies, at);
  const view = WarReport.render({ war_day: 'TEST', payload: JSON.stringify(body) }, 'u', 0, true);
  assert.ok(view.embeds.reduce((n, e) => n + WarReport.length(e), 0) <= 6000);
  assert.ok(view.embeds.every(e => (e.description?.length ?? 0) <= 4096));
  assert.match(view.embeds[0].description, /Tech wojenny/);
});

test('every reply with navigation stays within five component rows', async t => {
  const { commands } = fixture(t);
  const { Navigation } = await import('../src/discord/Navigation.js');
  const { ReportDays } = await import('../src/discord/ReportDays.js');
  assert.ok(Navigation.start('11').components.length <= 5);
  assert.ok(Navigation.all('11').length <= 5);
  const days = await commands.handle(member('report:11:clan-details:0', 3), now);
  assert.ok(days.data.components.length <= 5, `${days.data.components.length}`);
  const step1 = await commands.handle(member('resources:11:save:q', 5, { hammers: '5' }), now);
  assert.ok(step1.data.components.length <= 5);
  void ReportDays;
});

test('a maxed research node ("Maks." instead of x/y) is kept and shown as maxed', () => {
  const payload = ClanTech.validate({ request_id: randomUUID(), observed_at: now.toISOString(), nodes: [{ name: 'Wyścig badań', text: '+100% darowizn w wyścigu', level: null, max: null, percent: 100, maxed: true }] }, now.getTime());
  assert.equal(payload.nodes[0].maxed, true);
  assert.match(text(DonationReport.techReport({ ...payload, observed_at: now.toISOString() })), /Wyścig badań\*\* Maks\. · \+100%/);
  assert.equal(ClanTech.raceBonus(payload), 100);
});
