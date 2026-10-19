import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { RepositoryAudit } from '../scripts/RepositoryAudit.js';

test('repository audit excludes local artifacts and catches copied secrets or force-staged databases without printing secrets', t => {
  const root = mkdtempSync(join(tmpdir(), 'repository-audit-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.includes('repository-audit-'));
    rmSync(root, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  const secret = 'fixture-private-value-123456789';
  writeFileSync(join(root, '.gitignore'), '.env\ndata/\n');
  writeFileSync(join(root, '.env'), `DISCORD_BOT_TOKEN=${secret}\n`);
  writeFileSync(join(root, 'safe.js'), 'export const safe = true;\n');
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data/bot.sqlite'), 'fixture');
  assert.deepEqual(RepositoryAudit.inspect(root).findings, []);
  writeFileSync(join(root, 'leaked.js'), `const token = '${secret}';\n`);
  git('add', '-f', 'data/bot.sqlite');
  const result = RepositoryAudit.inspect(root);
  assert.ok(result.findings.some(item => item.path === 'leaked.js' && item.line === 1));
  assert.ok(result.findings.some(item => item.path === 'data/bot.sqlite'));
  assert.ok(!JSON.stringify(result).includes(secret));
});
