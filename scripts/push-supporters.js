// Run locally: `npm run supporters`. Uploads only config/supporters.json (the thank-you list shown when the app
// starts) through the deployer's saved WinSCP session. The bot reads the file on every request: no restart needed.
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Deployment } from './Deployment.js';
import { Supporters } from '../src/http/Supporters.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'config', 'supporters.json');
const winScp = ['C:/Program Files (x86)/WinSCP/WinSCP.com', 'C:/Program Files/WinSCP/WinSCP.com'].find(path => existsSync(path));
const work = mkdtempSync(join(tmpdir(), 'supporters-'));
try {
  if (!winScp) throw new Error('WinSCP.com not found.');
  const list = new Supporters(source).read(); // refuses invalid JSON before anything is uploaded
  const q = value => new Deployment(root).quote(value);
  const script = join(work, 'winscp.txt');
  writeFileSync(script, '\ufeff' + ['option batch abort', 'option confirm off', 'option reconnecttime 30',
    `open ${q(Deployment.session)} -explicit -timeout=30`,
    `put -transfer=binary -nopreservetime -nopermissions -resumesupport=off ${q(source)} ${q(`${Deployment.remoteRoot}/config/supporters.json`)}`,
    'exit'].join('\r\n') + '\r\n');
  const result = spawnSync(winScp, ['/nointeractiveinput', `/script=${script}`], { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('WinSCP failed.');
  const live = await (await fetch('https://komars.eu/discord/botyslaw-smith/mobile/supporters')).json();
  if (JSON.stringify(live) !== JSON.stringify(list)) throw new Error('The server answers with a different list (old code without the endpoint? run npm run deploy).');
  console.log(`Supporters list updated: ${list.supporters.length} names.`);
} catch (error) {
  console.error(`Supporters upload stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
