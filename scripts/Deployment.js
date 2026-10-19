import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, copyFileSync, lstatSync } from 'node:fs';
import { resolve, join, dirname, relative, sep, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export class Deployment {
  static session = 'srv80270@h51.seohost.pl';
  static remoteRoot = '/discord_bots/botyslaw_smith/app'; // FTP home is already /home/srv80270.
  static healthUrl = 'https://komars.eu/discord/botyslaw-smith/health';
  static runtimeFiles = ['app.js', 'startup.cjs', 'bootstrap.cjs', 'package.json', 'config/initial-tech.json',
    'scripts/maintenance.js', 'scripts/WorkerRestart.js', 'scripts/register.js', 'assets/bot-banner.png'];

  constructor(projectRoot, options = {}) {
    this.root = resolve(projectRoot);
    this.session = options.session ?? Deployment.session;
    this.winScp = options.winScp ?? [
      'C:/Program Files (x86)/WinSCP/WinSCP.com', 'C:/Program Files/WinSCP/WinSCP.com',
    ].find(path => existsSync(path));
    this.preview = options.preview ?? false;
    this.prepareOnly = options.prepareOnly ?? false;
    this.skipRegister = options.skipRegister ?? false;
    this.quote(this.root);
    this.quote(this.session);
    if (this.session.includes('://')) throw new Error('Use a saved WinSCP session name, never a URL containing credentials.');
  }

  quote(value) {
    // WinSCP expands percent variables in script files. Do not allow script injection.
    if (!value || /[\r\n"%]/.test(value)) throw new Error('Unsupported characters in deployment path or session name.');
    return `"${value}"`;
  }

  runNode(args, label) {
    console.log(label);
    const result = spawnSync(process.execPath, args, { cwd: this.root, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(`${label} failed. No later deployment step was run.`);
  }

  sourceFiles(directory = 'src') {
    const result = [];
    for (const item of readdirSync(join(this.root, directory), { withFileTypes: true })) {
      const path = `${directory}/${item.name}`;
      if (item.isSymbolicLink()) throw new Error(`Refusing a symbolic link in runtime source: ${path}`);
      if (item.isDirectory()) result.push(...this.sourceFiles(path));
      else if (item.isFile() && item.name.endsWith('.js')) result.push(path);
    }
    return result;
  }

  prepare() {
    const deploymentDirectory = join(this.root, 'deployment');
    mkdirSync(deploymentDirectory, { recursive: true });
    this.release = mkdtempSync(join(deploymentDirectory, 'release-'));
    this.stage = join(this.release, 'runtime');
    this.backup = join(this.release, 'previous-server-code');
    mkdirSync(this.stage);
    mkdirSync(this.backup);
    const files = [...Deployment.runtimeFiles, ...this.sourceFiles()].sort();
    const manifest = [];
    for (const path of files) {
      const source = join(this.root, path), destination = join(this.stage, path);
      if (!lstatSync(source).isFile()) throw new Error(`Runtime file must be a regular file: ${path}`);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
      manifest.push({ path, sha256: createHash('sha256').update(readFileSync(source)).digest('hex') });
    }
    const releaseData = JSON.stringify({ release: basename(this.release) });
    writeFileSync(join(this.stage, 'config/release.json'), releaseData);
    manifest.push({ path: 'config/release.json', sha256: createHash('sha256').update(releaseData).digest('hex') });
    writeFileSync(join(this.release, 'manifest.json'), JSON.stringify(manifest, null, 2));
    this.marker = join(this.release, 'restart.txt');
    writeFileSync(this.marker, new Date().toISOString());
    this.reloadRequest = join(this.release, 'reload-request.json');
    writeFileSync(this.reloadRequest, JSON.stringify({ id: basename(this.release), action: 'restart', expires: Date.now() + 600000 }));
    this.script = join(this.release, 'winscp.txt');
    writeFileSync(this.script, '\ufeff' + this.commands().join('\r\n') + '\r\n');
    console.log(`Prepared ${manifest.length} runtime files: ${relative(this.root, this.release)}`);
    return manifest;
  }

  commands() {
    const q = value => this.quote(value);
    const commands = ['option batch abort', 'option confirm off', 'option failonnomatch on', 'option reconnecttime 30',
      `open ${q(this.session)} -explicit -timeout=30`, `cd ${q(Deployment.remoteRoot)}`,
      'stat startup.cjs', 'stat package.json'];
    if (!this.preview) {
      for (const file of ['app.js', 'startup.cjs', 'package.json']) {
        commands.push(`get -transfer=binary ${q(`${Deployment.remoteRoot}/${file}`)} ${q(join(this.backup, file))}`);
      }
      for (const directory of ['src', 'scripts', 'config', 'assets']) {
        commands.push(`get -transfer=binary ${q(`${Deployment.remoteRoot}/${directory}`)} ${q(this.backup + sep)}`);
      }
    }
    // Never mirror/delete the application root: Passenger's public/tmp/logs must survive.
    if (this.preview) {
      commands.push(`synchronize remote -preview -mirror -criteria=time,size ${q(this.stage)} ${q(Deployment.remoteRoot)}`);
    } else {
      // Upload every approved file, including same-size edits; put recurses into staged directories.
      commands.push(`put -transfer=binary -nopreservetime -nopermissions -resumesupport=off ${q(join(this.stage, '*'))} ${q(Deployment.remoteRoot + '/')}`);
    }
    if (!this.preview) commands.push(`put -transfer=binary -nopreservetime -resumesupport=off ${q(this.marker)} ${q(`${Deployment.remoteRoot}/tmp/restart.txt`)}`);
    if (!this.preview) commands.push(`put -transfer=binary -nopreservetime -resumesupport=off ${q(this.reloadRequest)} ${q(`${Deployment.remoteRoot}/tmp/reload-request.json`)}`);
    return [...commands, 'exit'];
  }

  transfer() {
    if (!this.winScp || !existsSync(this.winScp)) throw new Error('WinSCP.com not found. Install WinSCP or pass --winscp=PATH.');
    console.log(this.preview ? 'Checking transfer plan (read-only)...' : 'Backing up server code locally, uploading runtime files and requesting restart...');
    // A BOM script avoids Windows command-line quoting problems. No passwords/logs are exported.
    const result = spawnSync(this.winScp, ['/nointeractiveinput', `/script=${this.script}`], {
      cwd: this.root, stdio: 'inherit', windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error('WinSCP failed. Check its message. Health verification and command registration were not run; uploaded files may be partial.');
  }

  async verifyHealth() {
    console.log('Checking the public health endpoint after the Passenger restart...');
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(Deployment.healthUrl, { signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'error' });
        const data = response.ok ? await response.json() : null;
        if (data?.status === 'ok' && (!this.release || data.release === basename(this.release))) {
          console.log(`Health check passed: HTTP 200${data.release ? `, running ${data.release}` : ''}.`);
          return;
        }
      } catch { /* Allow the hosting worker to finish its restart. */ }
      await new Promise(done => setTimeout(done, 3000));
    }
    throw new Error(`Health/release verification failed: the new worker may need a restart in the hosting panel. Previous code is in ${this.backup}. Database files were never transferred. No automatic database rollback was attempted.`);
  }

  async run() {
    this.runNode(['--test'], 'Running tests');
    this.prepare();
    if (this.prepareOnly) { console.log('Preparation complete. No server connection or remote changes.'); return; }
    this.transfer();
    if (this.preview) { console.log('Preview complete. No remote files changed.'); return; }
    // Passenger checks restart.txt on requests; this is an application-only restart.
    await new Promise(done => setTimeout(done, 11000));
    await this.verifyHealth();
    if (!this.skipRegister) {
      this.runNode(['--env-file-if-exists=.env', 'scripts/register.js'], 'Updating Discord slash commands (code is already deployed)');
    }
    writeFileSync(join(this.release, 'result.json'), JSON.stringify({ status: 'ok', deployedAt: new Date().toISOString(),
      endpoint: Deployment.healthUrl, commandRegistration: !this.skipRegister }, null, 2));
    console.log('Deployment complete. No release ZIP, database or token was uploaded.');
  }
}
