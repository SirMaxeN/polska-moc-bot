import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScanDiagnostics } from '../src/http/ScanDiagnostics.js';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('scan diagnostics keep only the last three reports per player', t => {
  let time = Date.parse('2026-11-16T12:00:00Z');
  const db = new Database(':memory:', new WarCalendar());
  t.after(() => db.close());
  const diagnostics = new ScanDiagnostics(db, () => time);
  const alice = { guild_id: '22', user_id: '11', name: 'Alice' }, bob = { guild_id: '22', user_id: '12', name: 'Bob' };
  for (let i = 1; i <= 5; i++) { time += 1000; diagnostics.save(alice, { app_version: '1.6.2', status: `scan ${i}`, events: [{ event: 'inventory', count: i }] }); }
  diagnostics.save(bob, { events: [] });
  const rows = diagnostics.list();
  assert.deepEqual(rows.filter(row => row.name === 'Alice').map(row => row.report.status), ['scan 5', 'scan 4', 'scan 3']);
  assert.equal(diagnostics.list('bo').length, 1);
  assert.throws(() => diagnostics.save(alice, { events: 'x' }), /Brak zdarzeń/);
  assert.throws(() => diagnostics.save(alice, { events: [{ big: 'x'.repeat(600 * 1024) }] }), /za duży/);
});

test('scan diagnostics mirror only the kept reports as files', t => {
  const db = new Database(':memory:', new WarCalendar());
  const directory = mkdtempSync(join(tmpdir(), 'diagnostics-'));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  writeFileSync(join(directory, 'stale-1.json'), '{}');
  writeFileSync(join(directory, 'note.txt'), 'keep');
  const diagnostics = new ScanDiagnostics(db, () => 1, directory);
  const kolega = { guild_id: '22', user_id: '11', name: 'Kolega Ż' };
  for (let i = 1; i <= 4; i++) diagnostics.save(kolega, { status: `scan ${i}`, events: [] });
  assert.deepEqual(readdirSync(directory).sort(), ['Kolega_Ż-2.json', 'Kolega_Ż-3.json', 'Kolega_Ż-4.json', 'note.txt']);
  const row = JSON.parse(readFileSync(join(directory, 'Kolega_Ż-4.json'), 'utf8'));
  assert.equal(row.report.status, 'scan 4');
  assert.deepEqual(Object.keys(row).sort(), ['id', 'name', 'report', 'saved_at', 'user_id']);
});

test('scan diagnostics already in the database become files at startup', t => {
  const db = new Database(':memory:', new WarCalendar());
  const directory = mkdtempSync(join(tmpdir(), 'diagnostics-'));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  new ScanDiagnostics(db, () => 1).save({ guild_id: '22', user_id: '11', name: 'Kolega' }, { events: [] });
  new ScanDiagnostics(db, () => 1, directory);
  assert.deepEqual(readdirSync(directory), ['Kolega-1.json']);
});
