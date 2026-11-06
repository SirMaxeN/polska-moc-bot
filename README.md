# BotysławSmith

Discord clan-war potential calculator for PolskaMoc in Forge Master. English commands and code; Polish private responses.

Requires Node.js 22.16+ (24 recommended). No runtime dependencies. Run `npm test`, copy `.env.example` to `.env`, set configuration, then `npm start`. Run `npm run register` explicitly to register commands.

See [requirements](PLAN.md), [commands and examples](docs/COMMANDS.md), [scoring](POINTS.md), [architecture](ARCHITECTURE.md), [Discord settings](DISCORD.md), and [deployment](docs/DEPLOYMENT.md).

For future updates, double-click `update-bot.cmd` or run `npm run deploy`. See [the updater guide](docs/UPDATING.md).

Production uses SEOHOST at komars.eu/discord/botyslaw-smith. Start with /start; administrators manage server settings through /setup. War runs Tuesday 00:00 UTC to Monday 00:00 UTC (01:00 winter / 02:00 summer in Poland). Scheduled maintenance handles weekly reset reminders.



Hosting layout and multi-bot separation: [docs/HOSTING-LAYOUT.md](docs/HOSTING-LAYOUT.md).

The Android companion **Botysław Skaner** has a separate sibling repository, `../botyslaw-skaner`. Android source, signing configuration and Google Play releases belong there; this repository owns the Discord bot and mobile API. See [mobile integration](docs/MOBILE.md).

## Before committing

Run `npm run check:repo` and `npm test`. The repository audit checks the exact tracked/unignored Git candidate set, including accidentally force-staged files. It flags private/generated artifacts, local environment-secret matches and common token/private-key formats without printing matched values. It is a useful guard, not a guarantee against every possible secret format.

Commit source, tests, public documentation, configuration templates and intentional game artwork. Keep `.env`, bot tokens, databases, backups, deployment receipts, private operations history, setup screenshots and rendered tutorial media local. `.gitignore` excludes them. Production-specific history is archived in ignored `local-artifacts/operations/DEPLOYMENT-history.md`. The public deployment guide contains the reusable workflow. Android experiments, duplicate workspaces and obsolete recordings are not part of this repository; curated private scanner fixtures live in the Android project's ignored `.local/` folder.
