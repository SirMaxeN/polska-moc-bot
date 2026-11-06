import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

// Android via USB debugging. Run: node scripts/record-phone.js [output-folder]
const sdkAdb = join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const adb = process.env.ADB_PATH || (existsSync(sdkAdb) ? sdkAdb : 'adb');
let serial;
let statusLine = '';
function showStatus(message) {
  statusLine = message;
  if (process.stdout.isTTY) process.stdout.write(`\r\x1b[2K${message}`);
  else if (message) console.log(message);
}
function notify(message) {
  if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
  console.log(message);
  if (process.stdout.isTTY && statusLine) process.stdout.write(statusLine);
}
function clock(seconds) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
function run(args) {
  const result = spawnSync(adb, [...(serial ? ['-s', serial] : []), ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr.trim() || 'Blad ADB.');
  }
  return result.stdout.trim();
}

async function main() {
  const devices = run(['devices']).split(/\r?\n/).slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(parts => parts[1] === 'device' && !parts[0].startsWith('emulator-'));
  if (!devices.length) throw new Error('Brak telefonu. Podlacz Androida przez USB, wlacz debugowanie USB i zaakceptuj zgode na telefonie.');
  if (devices.length > 1) throw new Error('Podlacz tylko jeden telefon. Emulatory sa automatycznie pomijane.');
  serial = devices[0][0];
  const outputDir = resolve(process.argv[2] || 'local-artifacts/phone-recordings');
  mkdirSync(outputDir, { recursive: true });
  let stopping = false;
  let stopCurrent = () => {};
  const saves = [];
  let saveError;
  const stop = () => {
    stopping = true;
    stopCurrent();
  };
  const input = createInterface({ input: process.stdin });
  input.on('line', stop);
  input.on('SIGINT', stop);
  process.on('SIGINT', stop);
  let part = 0;
  try {
    while (!stopping) {
      const name = `telefon-${new Date().toISOString().replace(/[:.]/g, '-')}-${++part}.mp4`;
      const remote = `/sdcard/${name}`;
      const local = join(outputDir, name);
      // The shell reports the PID of this recording only, then waits for MP4 finalization.
      const child = spawn(adb, ['-s', serial, 'shell',
        `screenrecord --time-limit 180 '${remote}' & rec=$!; echo RECORD_PID=$rec; wait $rec`],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let recordingPid;
      let errors = '';
      let output = '';
      let countdown;
      stopCurrent = () => {
        if (!recordingPid || child.exitCode !== null) return;
        clearInterval(countdown);
        showStatus('');
        notify('Zatrzymywanie i zapisywanie...');
        try { run(['shell', 'kill', '-2', recordingPid]); }
        catch (error) { console.error(error.message); }
      };
      child.stdout.on('data', data => {
        output += data.toString();
        const match = output.match(/RECORD_PID=(\d+)/);
        if (match && !recordingPid) {
          recordingPid = match[1];
          if (stopping) stopCurrent();
          else {
            notify(`>>> START CZESCI ${part} | ${new Date().toLocaleTimeString('pl-PL')}`);
            const started = performance.now();
            let lastRemaining;
            const tick = () => {
              const elapsed = Math.min(180, Math.floor((performance.now() - started) / 1000));
              const remaining = 180 - elapsed;
              if (remaining === lastRemaining) return;
              lastRemaining = remaining;
              showStatus(`Czesc ${part} | ${clock(elapsed)} / 03:00 | Do nastepnej: ${clock(remaining)} | ENTER = stop`);
              if (remaining === 10) notify('>>> Zostalo 10 sekund do zmiany pliku.');
              if (remaining === 0) notify('>>> 03:00 - oczekiwanie na zakonczenie pliku i start kolejnej czesci.');
            };
            tick();
            countdown = setInterval(tick, 200);
          }
        }
      });
      child.stderr.on('data', data => { errors += data.toString(); });
      let exitCode;
      try {
        exitCode = await new Promise((resolveExit, reject) => {
          child.once('error', reject);
          child.once('close', resolveExit);
        });
      } finally {
        clearInterval(countdown);
        showStatus('');
      }
      stopCurrent = () => {};
      if (exitCode !== 0 && !stopping) throw new Error(errors.trim() || output.trim() || 'Nie udalo sie nagrac ekranu.');
      notify(`>>> KONIEC CZESCI ${part} | ${new Date().toLocaleTimeString('pl-PL')}${stopping ? '' : ' | Uruchamiam nastepna...'}`);
      // Copy in the background so the next recording can start immediately.
      saves.push(saveRecording(remote, local).catch(error => {
        saveError ||= error;
        stop();
      }));
    }
  } finally {
    input.close();
    process.off('SIGINT', stop);
    await Promise.all(saves);
  }
  if (saveError) throw saveError;
}

async function saveRecording(remote, local) {
  try {
    await new Promise((resolveCopy, reject) => {
      const copy = spawn(adb, ['-s', serial, 'pull', remote, local], {
        windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      });
      let errors = '';
      copy.stderr.on('data', data => { errors += data.toString(); });
      copy.once('error', reject);
      copy.once('close', code => code === 0 ? resolveCopy() : reject(new Error(errors.trim() || 'Blad kopiowania.')));
    });
    if (statSync(local).size === 0) throw new Error('Plik jest pusty.');
  } catch (error) {
    throw new Error(`${error.message}\nNagranie pozostaje na telefonie: ${remote}\nOdzyskaj je poleceniem: "${adb}" -s ${serial} pull ${remote} "${local}"`);
  }
  notify(`Zapisano: ${local}`);
  try { run(['shell', 'rm', remote]); }
  catch { notify(`Kopia pozostala na telefonie: ${remote}`); }
}

main().catch(error => {
  console.error(`Blad: ${error.message}`);
  process.exitCode = 1;
});
