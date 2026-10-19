# Multi-bot hosting layout

Each bot has its own private directory, Node.js application, database, token file, backup directory and cron task.

```text
/home/srv80270/discord_bots/
  botyslaw_smith/
    app/       # deployed code; Node application root
    data/      # bot.sqlite, SQLite sidecars, discord-bot-token, maintenance.log
    backups/   # consistent SQLite backup files
```

Use ASCII directory names and a unique route per bot. BotyslawSmith uses application root `discord_bots/botyslaw_smith/app`, public app URL `komars.eu/discord/botyslaw-smith`, interaction endpoint `https://komars.eu/discord/botyslaw-smith/interactions`, health URL `https://komars.eu/discord/botyslaw-smith/health` and banner URL at the same prefix. Public URLs never map the data/backups directories. Other bots must have separate sibling roots and their own URL, application ID, signature public key and token.

Set DATABASE_PATH=/home/srv80270/discord_bots/botyslaw_smith/data/bot.sqlite and BACKUP_DIRECTORY=/home/srv80270/discord_bots/botyslaw_smith/backups. The reminder token is read beside the database. Parent bot/data/backup directories are private (0700); the token and SQLite files remain 0600. Do not place credentials in a public directory.

Minute maintenance must use the Node executable shown by the relocated Node.js application and the new absolute app/data paths. The CloudLinux-managed nodevenv directory is controlled by the hosting panel, not deployed or moved manually. Other hosting-managed directories also remain outside discord_bots.

Migration order: pause cron, stop application, create a consistent server-side backup, relocate private data and backups, update application root/environment/URL, verify public health and Discord signature validation, update Developer Portal endpoint, then resume minute maintenance. Keep the original route until its configuration is safely switched; do not create another bot on it. Update Deployment.remoteRoot and healthUrl before future deployments. Never copy a running SQLite database without its journal or a consistent backup.

On this LiteSpeed host, detached workers may survive selector restarts and restart.txt. After the runtime upload, the updater writes a short-lived private tmp/reload-request.json. Existing minute maintenance consumes it once, revalidates each lsnode process against the exact bot working directory and gracefully signals only those workers. No account-wide pkill or public restart endpoint is used. Both startup.cjs and equivalent bootstrap.cjs remain supported. Deployment success requires the worker-loaded release ID to match the staged release.
