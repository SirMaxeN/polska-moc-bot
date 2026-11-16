import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { MobileSync } from '../src/http/MobileSync.js';
import { Supporters } from '../src/http/Supporters.js';

test('the shipped supporters list is valid', () => {
  const list = new Supporters(new URL('../config/supporters.json', import.meta.url)).read();
  assert.ok(list.title.length > 0);
  assert.ok(list.supporters.includes('XlawoK'));
});

test('supporters are public, read fresh from the file and cleaned', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'supporters-'));
  const file = join(directory, 'supporters.json');
  writeFileSync(file, JSON.stringify({ supporters: ['Ala', ' Ala ', 'Bob\u0007', '', 'x'.repeat(80)] }));
  const db = new Database(':memory:', new WarCalendar());
  const mobile = new MobileSync(db, new ScoringService(), { supportersPath: file });
  const server = createServer((req, res) => mobile.receive(req, res, req.url, (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/discord/botyslaw-smith/mobile/supporters`;
  const first = await fetch(url);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { title: 'Dziękuję za wsparcie ❤', supporters: ['Ala', 'Bob', 'x'.repeat(40)] });
  writeFileSync(file, JSON.stringify({ title: 'Dzięki!', supporters: ['Cezary'] }));
  assert.deepEqual(await (await fetch(url)).json(), { title: 'Dzięki!', supporters: ['Cezary'] });
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
});
