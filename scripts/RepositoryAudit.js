import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export class RepositoryAudit {
  static inspect(root = process.cwd()) {
    const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
    const secrets = [];
    const environment = resolve(root, '.env');
    if (existsSync(environment)) {
      for (const line of readFileSync(environment, 'utf8').split(/\r?\n/)) {
        const match = /^(\w*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY))=(.*)$/.exec(line);
        const value = match?.[2].trim().replace(/^(['"])(.*)\1$/, '$2');
        if (value?.length >= 8) secrets.push(value);
      }
    }
    const findings = [];
    let bytes = 0;
    for (const path of paths) {
      const absolute = resolve(root, path);
      if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
      bytes += statSync(absolute).size;
      if (/(^|\/)(?:deployment|local-artifacts|data|backups|node_modules)\//.test(path)
        || /(^|\/)\.env(?:\..*)?$/.test(path) && !path.endsWith('.env.example')
        || /(?:\.sqlite(?:-.*)?|\.log|\.pem|\.key|\.p12|\.pfx|\.mp4|\.mp3|\.wav|\.zip)$/i.test(path)
        || path === 'config/release.json' || path.startsWith('docs/setup/') || /(^|\/)discord-bot-token$/.test(path)) {
        findings.push({ path, reason: 'Private or generated artifact would enter Git' });
      }
      if (/\.(png|jpe?g|webp|gif|ico|pdf|woff2?)$/i.test(path)) continue;
      const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        let reason;
        if (secrets.some(secret => line.includes(secret))) reason = 'Matches a local environment secret';
        else if (/(?:mfa\.[\w-]{60,}|[\w-]{23,30}\.[\w-]{6}\.[\w-]{27,})/.test(line)) reason = 'Possible Discord token';
        else if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) reason = 'Private key material';
        else if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(line)) reason = 'Possible cloud access key';
        if (reason) findings.push({ path, line: index + 1, reason });
      });
    }
    // Findings contain locations and categories only, never matched secret values.
    return { files: paths.length, bytes, findings };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = RepositoryAudit.inspect();
  console.log(`Git candidates: ${result.files} files, ${(result.bytes / 1048576).toFixed(2)} MiB.`);
  for (const item of result.findings) console.error(`${item.path}${item.line ? `:${item.line}` : ''}: ${item.reason}`);
  console.log(result.findings.length ? 'Repository audit FAILED. Do not commit these files.' : 'Repository audit passed: no detected secrets or forbidden generated files.');
  process.exitCode = result.findings.length ? 1 : 0;
}
