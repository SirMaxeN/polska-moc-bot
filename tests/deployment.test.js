import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Deployment } from '../scripts/Deployment.js';

test('deployment stages only runtime files, excludes credentials/data and restarts only after upload', t => {
  const root = mkdtempSync(join(tmpdir(), 'deployment-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, value = 'test') => { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
  for (const path of Deployment.runtimeFiles) put(path);
  put('src/domain/Example.js'); put('src/.env', 'not-for-deployment');
  put('.env', 'private'); put('data/bot.sqlite'); put('backups/snapshot.sqlite'); put('docs/example.md');
  const deployment = new Deployment(root, { prepareOnly: true });
  const manifest = deployment.prepare();
  assert.equal(manifest.length, Deployment.runtimeFiles.length + 2);
  assert.match(JSON.parse(readFileSync(join(deployment.stage, 'config/release.json'), 'utf8')).release, /^release-/);
  assert.ok(manifest.every(file => !/\.env|sqlite|backups|docs/.test(file.path)));
  const commands = readFileSync(deployment.script, 'utf8');
  assert.ok(commands.includes('/discord_bots/botyslaw_smith/app'));
  assert.equal(Deployment.healthUrl, 'https://komars.eu/discord/botyslaw-smith/health');
  assert.match(commands, /open "srv80270@h51\.seohost\.pl" -explicit/);
  assert.ok(commands.indexOf('get -transfer=binary') < commands.indexOf('put -transfer=binary'));
  assert.ok(commands.indexOf('put -transfer=binary') < commands.indexOf('/tmp/restart.txt'));
  assert.ok(commands.indexOf('/tmp/restart.txt') < commands.indexOf('/tmp/reload-request.json'));
  assert.equal(JSON.parse(readFileSync(deployment.reloadRequest, 'utf8')).action, 'restart');
  assert.doesNotMatch(commands, / -delete| -mirror|certificate=\*|botyslaw-data|discord-bot-token|\brm\b/);
  const preview = new Deployment(root, { preview: true }); preview.prepare();
  const plan = readFileSync(preview.script, 'utf8');
  assert.match(plan, /synchronize remote -preview/);
  assert.doesNotMatch(plan, /get -transfer|\bput\b|restart\.txt/);
  assert.throws(() => new Deployment(root, { session: 'bad"\nexit' }));
  assert.throws(() => new Deployment(root, { session: 'ftp://user:password@host' }));
});


test('deployment rejects a healthy stale process until the expected release is running', async t => {
  const root = mkdtempSync(join(tmpdir(), 'deployment-health-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const deployment = new Deployment(root);
  deployment.release = join(root, 'release-expected');
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ status: 'ok', release: ++requests === 1 ? 'release-stale' : 'release-expected' }) }));
  await deployment.verifyHealth();
  assert.equal(requests, 2);
});
