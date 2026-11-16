import { readFileSync } from 'node:fs';

/**
 * Public thank-you list shown when the app starts (GET /mobile/supporters). Read from config/supporters.json on
 * every request, so uploading only that file (`npm run supporters`) updates the app without a code deployment.
 */
export class Supporters {
  static MAX = 2000;

  constructor(path) {
    this.path = path;
  }

  read() {
    const data = JSON.parse(readFileSync(this.path, 'utf8'));
    const names = [...new Set((Array.isArray(data.supporters) ? data.supporters : [])
      .map(name => String(name).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40)).filter(Boolean))].slice(0, Supporters.MAX);
    const title = String(data.title ?? '').trim().slice(0, 60) || 'Dziękuję za wsparcie ❤';
    return { title, supporters: names };
  }
}
