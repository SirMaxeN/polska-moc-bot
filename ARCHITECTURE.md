# Architecture

SEOHOST DirectAdmin supports Node.js and lists komars.eu. Inspection offered Node 22.23.2 and 24.20.0. Existing application was left untouched. Selected approach: HTTP interactions at https://komars.eu/discord/botyslaw-smith/interactions after deployment verification. No Gateway or home computer required.

Use Node.js ES modules with focused classes: NumberParser, WarCalendar, Database, ScoringService, ReportService, CommandService, InteractionServer and CommandRegistrar. Built-in HTTP, Ed25519 and SQLite avoid dependencies.

Verify Discord signatures over timestamp plus exact raw body before parsing. Handle PING. Bound body size and reply within three seconds. Synchronous local database work supports direct replies; hosting cold starts must be tested.

SQLite defaults to data/bot.sqlite, on persistent local storage outside public document roots. Store Discord IDs as text. WAL, busy timeout and transactions protect writes. Tables: guild settings/season, player profiles/persistent cost, weekly resources, clan technology, reset events. Reports derive totals from a consistent snapshot.

Before operations compare current Warsaw cycle with saved cycle; atomically clear stale resource entries once. Preserve costs and tech. Cost-only updates never create resource entries. Season reset clears resources/tech/cost atomically. Back up before season reset using SQLite online backup. Production daily retention/off-host recovery remains to configure. Database, backups, logs and environment files are ignored by Git.

If hosting uses multiple instances or unreliable SQLite locking, migrate storage to MySQL/MariaDB before launch; never maintain two sources of truth. Roster-based reports fetch guild-wide members with Server Members Intent and a short in-memory cache. No message-content intent or channel history is required. Runtime admin checks apply to commands, buttons and modals. Responses disable mentions.

Tests: parsing, accepted scoring example, clan aggregation, atomic updates, isolation, permissions, reset/cost persistence, Warsaw/DST boundaries and signed HTTP. Deployment: real Discord validation, restarts and cold-start response time.

References:
- https://docs.discord.com/developers/interactions/overview
- https://docs.discord.com/developers/interactions/receiving-and-responding
- https://docs.discord.com/developers/topics/permissions
- https://docs.discord.com/developers/resources/emoji
- https://seohost.pl/pomoc/co-to-jest-node-js
- https://sqlite.org/whentouse.html
- https://sqlite.org/backup.html


Player profiles store nullable skill_cost_x5 and mount_cost independently. Startup detects legacy schemas, takes a consistent VACUUM INTO backup, then adds mount_cost transactionally. Existing profiles, resources and technology are preserved.


Weekly resources also store owned mounts awaiting merges. An additive migration backs up existing databases before adding the mounts column. The calendar keeps legacy weekly identifier strings while shifting active war days to Tuesday–Sunday and reset to Monday 02:00, preserving current-week resources during deployment.

ServerSetup consolidates administrator configuration. WeeklyPlayerRemoval removes weekly resources without deleting persistent player costs. Reminder settings and durable reminder jobs are guild-scoped. Reset and job enqueue share a transaction. WeeklyReminders uses leases, retries and Discord nonce enforcement. Both the HTTP minute timer and the separately scheduled maintenance script can safely process the queue. Automatic delivery uses the existing bot identity via DISCORD_BOT_TOKEN or an owner-readable token file alongside the private database (override with DISCORD_BOT_TOKEN_FILE). The token is never included in releases, logs or HTTP responses.
