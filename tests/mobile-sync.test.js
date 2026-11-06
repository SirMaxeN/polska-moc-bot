import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { MobileSync } from '../src/http/MobileSync.js';
import { ResourceForm } from '../src/discord/ResourceForm.js';
import { InteractionServer } from '../src/http/InteractionServer.js';

function fixture(t) {
  let time = Date.parse('2026-10-22T12:00:00Z');
  const db = new Database(':memory:', new WarCalendar());
  const mobile = new MobileSync(db, new ScoringService(), { clock: () => time });
  t.after(() => db.close());
  const payload = () => ({ request_id: randomUUID(), observed_at: new Date(time).toISOString(), values: {
    skill_tickets: 9880, mount_keys: 2840, hammers: 11026, pets: 28, mounts: 95, skill_cost_x5: 188, mount_cost: 50,
  } });
  return { db, mobile, payload, advance: delta => { time += delta; } };
}

test('pairing is private, one-use, expires and replaces/revokes only its account', t => {
  const { db, mobile, advance } = fixture(t);
  const code = mobile.code('22', '11', 'Alice');
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.throws(() => mobile.pair({ code: '000000' }), /Nieprawidłowy/);
  assert.equal(db.db.prepare('SELECT hash FROM mobile_pairings').get().hash.includes(code), false);
  const paired = mobile.pair({ code: code.toLowerCase() });
  assert.equal(mobile.authenticate(`Bearer ${paired.token}`).user_id, '11');
  assert.throws(() => mobile.pair({ code }), /wygasł/);
  const another = mobile.pair({ code: mobile.code('22', '12', 'Bob') });
  const replacement = mobile.pair({ code: mobile.code('22', '11', 'Alice') });
  assert.throws(() => mobile.authenticate(`Bearer ${paired.token}`));
  mobile.revoke('22', '11');
  assert.throws(() => mobile.authenticate(`Bearer ${replacement.token}`));
  assert.equal(mobile.authenticate(`Bearer ${another.token}`).user_id, '12');
  const expired = mobile.code('22', '11', 'Alice'); advance(600001);
  assert.throws(() => mobile.pair({ code: expired }));
});

test('resource updates bind identity to credential, validate atomically and replay once', t => {
  const { db, mobile, payload, advance } = fixture(t);
  const auth = `Bearer ${mobile.pair({ code: mobile.code('22', '11', 'Alice') }).token}`;
  const body = payload(); const result = mobile.update(auth, body);
  assert.equal(db.profile('22', '11').mounts, 95);
  assert.equal(db.profile('22', '11').skill_cost_x5, 188);
  advance(1000);
  assert.deepEqual(mobile.update(auth, body), result);
  assert.equal(db.profile('22', '11').updated_at, result.updated_at);
  for (const wrong of [ { ...payload(), user_id: '12' }, { ...payload(), values: { ...body.values, pets: -1 } },
    { ...payload(), values: { ...body.values, mount_cost: 0 } }, { ...payload(), values: { ...body.values, hammers: '2' } },
    { ...payload(), values: { ...body.values, pets: 2.3 } }, { ...payload(), observed_at: '2001-01-01' } ]) {
    assert.throws(() => mobile.update(auth, wrong));
    assert.equal(db.profile('22', '11').updated_at, result.updated_at);
  }
  assert.equal(db.profile('22', '12'), undefined);
  mobile.revoke('22', '11'); assert.throws(() => mobile.update(auth, payload()));
});

test('mobile HTTP requires JSON/auth, rejects oversized bodies and preserves Discord verification', async t => {
  const { mobile, payload, db } = fixture(t);
  const { publicKey } = generateKeyPairSync('ed25519');
  const key = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const server = new InteractionServer(key, { handle: () => { throw Error('Must not run'); } }, '123', mobile);
  await server.listen(0, '127.0.0.1'); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.server.address().port}/discord/botyslaw-smith/mobile/`;
  assert.equal((await fetch(url + 'resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(url + 'pair', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(url + 'pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(4097) })).status, 413);
  assert.equal((await fetch(url + 'pair')).status, 405);
  const response = await fetch(url + 'pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: mobile.code('22', '11', 'Alice') }) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const paired = await response.json();
  const saved = await fetch(url + 'resources', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${paired.token}` }, body: JSON.stringify(payload()) });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).status, 'saved');
  assert.equal(db.profile('22', '11').pets, 28);
  assert.equal((await fetch(url.replace('/mobile/', '/interactions'), { method: 'POST', body: '{}' })).status, 401);
});

 test('fresh resource and cost modals reflect mobile updates and use distinct draft identities', t => {
  const { db, mobile, payload } = fixture(t);
  const auth = `Bearer ${mobile.pair({ code: mobile.code('22', '11', 'Alice') }).token}`;
  mobile.update(auth, payload());
  const first = ResourceForm.open('11', db.profile('22', '11'));
  const body = payload(); body.values.pets = 333; body.values.mount_keys = 4500; body.values.mount_cost = 47;
  mobile.update(auth, body);
  const second = ResourceForm.open('11', db.profile('22', '11'));
  assert.notEqual(first.data.custom_id, second.data.custom_id);
  assert.equal(second.data.components.find(row => row.component.custom_id === 'pets').component.value, '333');
  assert.equal(second.data.components.find(row => row.component.custom_id === 'mount_keys').component.value, '4500');
  const costs = ResourceForm.costs('11', db.profile('22', '11'));
  assert.equal(costs.data.components[1].component.value, '47');
  assert.notEqual(costs.data.custom_id, ResourceForm.costs('11', db.profile('22', '11')).data.custom_id);
});
