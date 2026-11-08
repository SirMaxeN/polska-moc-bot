import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { SharedLearning } from '../src/http/SharedLearning.js';
import { SharedProfiles } from '../src/http/SharedProfiles.js';

const icon = c => c.repeat(9600 / c.length);
const bits = d => (d % 2 ? '10' : '01').repeat(70);

test('shared learning keeps a few icons per skill, samples per digit and returns only newer items', t => {
  const db = new Database(':memory:', new WarCalendar()); t.after(() => db.close());
  let now = 1000; const learning = new SharedLearning(db, () => now);
  const first = learning.sync({ icons: [{ type: 'BOMB', hash: '1', icon: icon('ab') }, { type: 'bad', hash: '2', icon: icon('ab') }, { type: 'BOMB', hash: '3', icon: 'short' }],
    digits: [{ digit: 4, aspect: 0.6, bits: bits(4) }, { digit: 12, aspect: 0.6, bits: bits(1) }] });
  assert.equal(first.icons.length, 1); assert.equal(first.digits.length, 1);
  for (let i = 0; i < 15; i++) { now += 10; learning.sync({ icons: [{ type: 'BOMB', hash: String(10 + i), icon: icon('c' + i) }] }); }
  const all = learning.sync({ since: 0 });
  assert.equal(all.icons.filter(x => x.type === 'BOMB').length, SharedLearning.ICONS_PER_SKILL);
  assert.equal(learning.sync({ since: all.now }).icons.length, 0, 'nothing newer since the last sync');
});

test('profiles are shared per Discord server and returned only for the same member and power', t => {
  const db = new Database(':memory:', new WarCalendar()); t.after(() => db.close());
  const now = Date.parse('2026-11-08T12:00:00Z'); const store = new SharedProfiles(db, () => now);
  const profile = { name: 'Pilloch', damage: 1e7, health: 4e7, skills: [] };
  const saved = store.exchange({ guild_id: 'g' }, { save: [{ enemy: true, clan: 'LeChauvin[HEXA]', name: 'Pilloch', power: 206e6, savedAt: now - 3600000, profile }] });
  assert.equal(saved.saved, 1);
  const hit = store.exchange({ guild_id: 'g' }, { want: [{ enemy: true, clan: 'LeChauvin(HEXAJ', name: 'pilloch', power: 207e6 }] });
  assert.equal(hit.profiles.length, 1); assert.equal(hit.profiles[0].profile.damage, 1e7);
  assert.equal(store.exchange({ guild_id: 'g' }, { want: [{ enemy: true, clan: 'LeChauvin[HEXA]', name: 'Pilloch', power: 230e6 }] }).profiles.length, 0, 'power changed: rescan');
  assert.equal(store.exchange({ guild_id: 'other' }, { want: [{ enemy: true, clan: 'LeChauvin[HEXA]', name: 'Pilloch', power: 206e6 }] }).profiles.length, 0, 'other server');
  assert.equal(store.exchange({ guild_id: 'g' }, { want: [{ enemy: false, clan: 'LeChauvin[HEXA]', name: 'Pilloch', power: 206e6 }] }).profiles.length, 0, 'other side');
  assert.equal(store.exchange({ guild_id: 'g' }, { save: [{ enemy: true, clan: 'X', name: 'Y', power: 1, savedAt: now - 31 * 86400000, profile }] }).saved, 0, 'too old');
});
