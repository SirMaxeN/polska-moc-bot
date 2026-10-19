import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { WorkerRestart } from '../scripts/WorkerRestart.js';

test('worker inspection selects only LiteSpeed workers in the exact bot directory', () => {
  const root = resolve('bot-root');
  const processes = {
    101: { cwd: root, args: 'lsnode:app\0' },
    102: { cwd: root + '-another-bot', args: 'lsnode:app\0' },
    103: { cwd: root, args: 'node\0scripts/maintenance.js\0' },
    104: { cwd: root, args: '/usr/bin/lsnode\0' },
    105: { cwd: root, args: 'unrelated\0' },
  };
  const io = {
    readdirSync: () => [...Object.keys(processes), 'not-a-pid', String(process.pid)],
    readlinkSync: path => processes[path.split('/')[2]].cwd,
    readFileSync: path => processes[path.split('/')[2]].args,
  };
  assert.deepEqual(WorkerRestart.inspect(root, io), [{ pid: 101, cwd: root }, { pid: 104, cwd: root }]);
});
