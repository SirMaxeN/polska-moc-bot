// Run locally: `npm run diagnostics:pull`. Downloads only the scan report files the bot mirrors on the server
// (<bot>/data/diagnostics/*.json, no database, no tokens) through the saved WinSCP session used by the deployer,
// into local-artifacts/diagnostics/ (ignored by Git; reports name players, keep them private).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Deployment } from './Deployment.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const remote = `${dirname(Deployment.remoteRoot)}/data/diagnostics`;
const local = resolve(root, 'local-artifacts', 'diagnostics');
const winScp = ['C:/Program Files (x86)/WinSCP/WinSCP.com', 'C:/Program Files/WinSCP/WinSCP.com'].find(path => existsSync(path));
try {
  if (!winScp) throw new Error('WinSCP.com not found.');
  const deployment = new Deployment(root);
  const q = value => deployment.quote(value);
  mkdirSync(local, { recursive: true });
  const script = join(local, 'winscp-pull.txt');
  writeFileSync(script, '\ufeff' + ['option batch abort', 'option confirm off', 'option reconnecttime 30',
    `open ${q(Deployment.session)} -explicit -timeout=30`,
    `get -transfer=binary ${q(`${remote}/*.json`)} ${q(local + sep)}`, 'exit'].join('\r\n') + '\r\n');
  const result = spawnSync(winScp, ['/nointeractiveinput', `/script=${script}`], { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('WinSCP failed (no reports on the server yet, or the bot was not deployed with report files).');
  const rows = readdirSync(local).filter(file => file.endsWith('.json'))
    .map(file => ({ file, row: JSON.parse(readFileSync(join(local, file), 'utf8')) }))
    .sort((a, b) => String(a.row.saved_at).localeCompare(String(b.row.saved_at)));
  for (const { file, row } of rows) {
    console.log(`${row.saved_at}  ${row.name}  v${row.report?.app_version ?? '?'}  ${row.report?.status ?? ''}  -> ${join(local, file)}`);
  }
} catch (error) {
  console.error(`Diagnostics pull stopped: ${error.message}`);
  process.exitCode = 1;
}
