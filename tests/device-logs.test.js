import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { DeviceLogs } from '../src/http/DeviceLogs.js';
import { ServerExport } from '../src/http/ServerExport.js';
import { SharedProfiles } from '../src/http/SharedProfiles.js';

const temp = t => { const dir = mkdtempSync(join(tmpdir(), 'device-logs-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const device = { guild_id: '22', user_id: '11', name: '[_PL_]Skubi 1990' };

test('device logs append new lines, replace snapshots and stay inside the player folder', t => {
  const dir = temp(t);
  const logs = new DeviceLogs(dir);
  logs.save(device, { files: [{ path: 'ext/logs/full_war-events.jsonl', append: false, content: '{"a":1}\n' }] });
  logs.save(device, { files: [{ path: 'ext/logs/full_war-events.jsonl', append: true, content: '{"a":2}\n' },
    { path: 'ext/profiles/nasi-x.json', append: false, content: '{"p":1}' }] });
  logs.save(device, { files: [{ path: 'ext/profiles/nasi-x.json', append: false, content: '{"p":2}' }] });
  const root = join(dir, 'devices', '__PL__Skubi_1990-11');
  assert.equal(readFileSync(join(root, 'ext/logs/full_war-events.jsonl'), 'utf8'), '{"a":1}\n{"a":2}\n');
  assert.equal(readFileSync(join(root, 'ext/profiles/nasi-x.json'), 'utf8'), '{"p":2}');
  for (const path of ['../x.txt', 'ext/../../x.txt', '/etc/x.txt', 'ext/a.png', 'a/b/c/d/e.txt', '.hidden.txt'])
    assert.throws(() => logs.save(device, { files: [{ path, append: false, content: 'x' }] }), /ścieżka|tekstowe/, path);
  assert.throws(() => logs.save(device, { files: [] }), /Brak plików/);
  assert.equal(existsSync(join(dir, 'x.txt')), false);
});

test('an oversized log keeps its newest lines', t => {
  const dir = temp(t);
  const logs = new DeviceLogs(dir);
  const line = 'x'.repeat(1023) + '\n';
  for (let i = 0; i < 4; i++) logs.save(device, { files: [{ path: 'cache/big.txt', append: true, content: line.repeat(1024) }] });
  const text = readFileSync(join(dir, 'devices', '__PL__Skubi_1990-11', 'cache/big.txt'), 'utf8');
  assert.ok(text.length <= DeviceLogs.KEEP_FILE && text.length > DeviceLogs.KEEP_FILE - 2048);
  assert.ok(text.startsWith('x') && text.endsWith('\n'));
});

test('server export mirrors ranking scans and shared profiles without accounts', t => {
  const dir = temp(t);
  const db = new Database(':memory:', new WarCalendar());
  t.after(() => db.close());
  const now = Date.parse('2026-11-20T10:00:00Z');
  const shared = new SharedProfiles(db, () => now);
  shared.exchange(device, { save: [{ clan: 'PolskaMoc', name: 'Ala', power: 1000, savedAt: now, profile: { damage: 5, health: 9 } }] });
  db.db.exec('CREATE TABLE IF NOT EXISTS clan_ranking_history(guild_id TEXT NOT NULL, observed_at INTEGER NOT NULL, request_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(guild_id,request_id))');
  db.db.prepare('INSERT INTO clan_ranking_history VALUES(?,?,?,?)').run('22', now, 'r1', JSON.stringify({ clan: 'PolskaMoc', rows: [{ name: 'Ala', points: 3, simulated: 4, byPower: 1 }] }));
  new ServerExport(db, dir).write();
  const ranking = JSON.parse(readFileSync(join(dir, 'server', 'clan-ranking-22.json'), 'utf8'));
  assert.deepEqual(ranking[0].rows[0], { name: 'Ala', points: 3, simulated: 4, byPower: 1 });
  const profiles = JSON.parse(readFileSync(join(dir, 'server', 'profiles-22.json'), 'utf8'));
  assert.deepEqual(profiles.map(p => [p.name, p.profile.damage]), [['Ala', 5]]);
  assert.deepEqual(Object.keys(profiles[0]).sort(), ['clan', 'enemy', 'name', 'power', 'profile', 'saved_at']); // no Discord ids
});

test('shared profiles refuse and drop damage or health read as the power', t => {
  const db = new Database(':memory:', new WarCalendar());
  t.after(() => db.close());
  const now = Date.parse('2026-11-20T10:00:00Z');
  const shared = new SharedProfiles(db, () => now);
  const item = (name, damage) => ({ clan: 'PolskaMoc', name, power: 927e6, savedAt: now, profile: { damage, health: 134e6 } });
  assert.equal(shared.exchange(device, { save: [item('Oliwiusz', 23.4e6), item('Zly', 927e6)] }).saved, 1);
  db.db.prepare('INSERT INTO shared_profiles VALUES(?,?,?,?,?,?,?,?,?)').run('22', 0, 'polskamoc', 'stary', 'PolskaMoc', 'Stary', 927e6, now, JSON.stringify({ damage: 927e6, health: 1 }));
  const want = name => ({ clan: 'PolskaMoc', name, power: 927e6 });
  assert.equal(shared.exchange(device, { want: [want('Stary')] }).profiles.length, 0);
  new SharedProfiles(db, () => now);
  assert.deepEqual(db.db.prepare('SELECT name FROM shared_profiles').all().map(r => r.name), ['Oliwiusz']);
});
