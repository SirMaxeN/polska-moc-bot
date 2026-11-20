import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Text logs uploaded by the app (POST /mobile/logs): new lines of its local scan/war/ranking logs and changed
 * snapshot files (profiles, last rosters), never images. Stored as plain files per player under
 * <directory>/devices/<name>-<user>/, so `npm run diagnostics:pull` fetches them without the database.
 */
export class DeviceLogs {
  static MAX_FILE = 3 * 1024 * 1024;
  static KEEP_FILE = 2 * 1024 * 1024;
  static MAX_DEVICE = 40 * 1024 * 1024;
  static MAX_FILES = 40;

  constructor(directory) {
    this.directory = directory;
  }

  static safePath(path) {
    const text = String(path ?? '');
    const parts = text.split('/');
    if (!text || text.length > 160 || parts.length > 4) throw new Error('Nieprawidłowa ścieżka logu.');
    for (const part of parts) if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(part) || part.includes('..')) throw new Error('Nieprawidłowa ścieżka logu.');
    if (!/\.(jsonl|json|txt)$/i.test(text)) throw new Error('Dozwolone są tylko logi tekstowe.');
    return parts;
  }

  static folder(device) {
    const name = String(device.name ?? '').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'gracz';
    return `${name}-${String(device.user_id).replace(/\D/g, '')}`;
  }

  save(device, body) {
    if (!this.directory) return { status: 'skipped' };
    const files = body?.files;
    if (!Array.isArray(files) || !files.length || files.length > DeviceLogs.MAX_FILES) throw new Error('Brak plików logów.');
    const checked = files.map(file => {
      if (typeof file?.content !== 'string' || typeof file.append !== 'boolean') throw new Error('Nieprawidłowy plik logu.');
      return { parts: DeviceLogs.safePath(file.path), append: file.append, content: file.content };
    });
    const root = join(this.directory, 'devices', DeviceLogs.folder(device));
    for (const file of checked) {
      const target = join(root, ...file.parts);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      if (file.append && existsSync(target)) appendFileSync(target, file.content, { mode: 0o600 });
      else writeFileSync(target, file.content, { mode: 0o600 });
      if (statSync(target).size > DeviceLogs.MAX_FILE) {
        const tail = readFileSync(target, 'utf8').slice(-DeviceLogs.KEEP_FILE);
        writeFileSync(target, tail.slice(tail.indexOf('\n') + 1), { mode: 0o600 });
      }
    }
    this.trim(root);
    return { status: 'saved', files: checked.length };
  }

  /** Keeps one player's folder under MAX_DEVICE by removing the oldest files. */
  trim(root) {
    const all = [];
    const walk = path => {
      for (const item of readdirSync(path, { withFileTypes: true })) {
        const full = join(path, item.name);
        if (item.isDirectory()) walk(full);
        else { const stat = statSync(full); all.push({ full, size: stat.size, time: stat.mtimeMs }); }
      }
    };
    walk(root);
    let total = all.reduce((sum, file) => sum + file.size, 0);
    for (const file of all.sort((a, b) => a.time - b.time)) {
      if (total <= DeviceLogs.MAX_DEVICE) break;
      rmSync(file.full, { force: true });
      total -= file.size;
    }
  }
}
