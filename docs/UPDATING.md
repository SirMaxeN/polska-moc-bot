# One-click deployment from Windows

Double-click `update-bot.cmd` in the project root, or run `npm run deploy`.

The CMD launcher shows an explicit SUCCESS/FAILED result and keeps the output window open. Type `exit` (case-insensitive) and press Enter to close it; other input leaves the result visible.

The updater uses the existing WinSCP site `srv80270@h51.seohost.pl`, forces explicit FTPS with certificate validation, and uses its saved credentials. No password is copied into the repository or deployment script. WinSCP must be installed and Node.js 22.16+ available on PATH. The saved site belongs to the Windows account running the updater. If WinSCP requests a password or certificate decision, open the saved site in WinSCP and resolve it there; automation aborts instead of accepting unknown certificates.

The updater:

1. Runs all local tests and stops on failure.
2. Builds a small allowlisted runtime directory, excluding `.env`, databases, backups, documentation, tests and old release packages.
3. Downloads the currently deployed code into the local release's `previous-server-code` directory before overwriting anything.
4. Uploads every approved runtime file, including same-size changes. Remote files are not automatically deleted.
5. Uploads `tmp/restart.txt` last so Passenger restarts only after successful transfers.
6. Checks that `https://komars.eu/discord/botyslaw-smith/health` reports the exact uploaded release ID (not merely HTTP 200) and registers the current slash commands using the local `.env` bot token.
7. Saves a successful deployment receipt under the local ignored `deployment/release-*` directory.

No ZIP remains on the server. The private database, token, reminder configuration, technology and player costs are outside `/discord_bots/botyslaw_smith/app` and are not transferred. Existing weekly maintenance stays configured in DirectAdmin.

## Optional modes

```text
node scripts/deploy.js --prepare-only
node scripts/deploy.js --preview
node scripts/deploy.js --skip-register
node scripts/deploy.js --session="another saved site"
node scripts/deploy.js --winscp="C:/Program Files/WinSCP/WinSCP.com"
```

`--prepare-only` runs tests and prepares local files without connecting. `--preview` additionally connects and previews changes without remote writes. `--skip-register` deploys code without changing Discord command definitions. The CMD launcher accepts the same arguments.

Uploads overwrite files in place and are not an atomic release switch. A failed transfer may leave a partial code update; the restart marker and command registration are not attempted after a transfer failure. The prior server code is retained locally for recovery. A failed health check does not automatically restore code or databases. Database migrations may be forward-only, so review recovery before rolling back a release containing schema changes. Remove obsolete server code only after a separate scoped review; the updater never mirrors/deletes the whole application root.

## References

- [WinSCP scripting](https://winscp.net/eng/docs/scripting)
- [WinSCP put command](https://winscp.net/eng/docs/scriptcommand_put)
- [Passenger restart.txt](https://www.phusionpassenger.com/docs/advanced_guides/troubleshooting/nginx/restart_app.html#restart-txt)

Runtime uploads target `/discord_bots/botyslaw_smith/app`. Each bot has a separate sibling directory; see HOSTING-LAYOUT.md.

A deployment creates config/release.json in the upload stage. The worker reads it once at startup. A stale running release cannot pass deployment verification; if Passenger does not reload after restart.txt, restart the application in SEOHOST and recheck the running release.

On this LiteSpeed host, detached workers may survive selector restarts and restart.txt. After the runtime upload, the updater writes a short-lived private tmp/reload-request.json. Existing minute maintenance consumes it once, revalidates each lsnode process against the exact bot working directory and gracefully signals only those workers. No account-wide pkill or public restart endpoint is used. Both startup.cjs and equivalent bootstrap.cjs remain supported. Deployment success requires the worker-loaded release ID to match the staged release.
