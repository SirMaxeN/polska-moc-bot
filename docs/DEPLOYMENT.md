# Deployment

The application runs as a Node.js service on a hosting provider with HTTP interactions and persistent private SQLite storage. See [hosting layout](HOSTING-LAYOUT.md) and [Windows updater](UPDATING.md).

## Configuration

1. Create a dedicated Node.js application outside the public website root. Use Node 24 (minimum 22.16), Production mode and bootstrap.cjs as startup file; startup.cjs is an equivalent compatibility entry.
2. Set DISCORD_APPLICATION_ID and DISCORD_PUBLIC_KEY. Keep the bot token in a private owner-readable file beside DATABASE_PATH, or set DISCORD_BOT_TOKEN_FILE. Never upload .env through the code deployer.
3. Use separate private app/, data/ and backups/ directories for each bot. Set DATABASE_PATH and BACKUP_DIRECTORY to absolute server paths. The application must not serve either private directory over HTTP.
4. Assign a unique public URL prefix and configure that bot's Developer Portal Interactions Endpoint URL. Discord validates the signed PING response when saving.
5. Install one minute cron task running scripts/maintenance.js with the correct Node executable and absolute database/backup paths. This handles resets, reminders and bot-scoped deployment restarts.
6. Configure participant roles, management roles and reminder channel through /setup.

## Updates and verification

Use update-bot.cmd or npm run deploy. The updater runs tests, stages only runtime files, backs up deployed code locally and uploads using WinSCP with explicit FTPS and certificate validation. The database, token, environment files, backup files and documentation are excluded from runtime transfers.

The upload finishes with restart.txt and a short-lived bot-scoped reload request. Minute maintenance rechecks LiteSpeed worker identity before gracefully restarting workers belonging to this exact app directory. Never use account-wide pkill: other bots may share the hosting account.

A deployment succeeds only when HTTPS health reports the exact new worker-loaded release ID. HTTP 200 alone does not prove new code is running. It stops on a stale worker or failed transfer. Confirm unsigned interactions return 401 and private paths return 404. Verify resource/cost persistence and reminder scheduling after path migrations.

Deployment receipts and previous-code backups are local, ignored files under deployment/. Production-specific history and diagnostic details remain in ignored local-artifacts/operations/DEPLOYMENT-history.md; setup screenshots and rendered tutorial media are also ignored. Do not publish those local artifacts with the repository.
