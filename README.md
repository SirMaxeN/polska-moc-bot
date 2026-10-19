# BotysławSmith

Discord clan-war potential calculator for PolskaMoc in Forge Master. English commands and code; Polish private responses.

Requires Node.js 22.16+ (24 recommended). No runtime dependencies. Run `npm test`, copy `.env.example` to `.env`, set configuration, then `npm start`. Run `npm run register` explicitly to register commands.

See [requirements](PLAN.md), [commands and examples](docs/COMMANDS.md), [scoring](POINTS.md), [architecture](ARCHITECTURE.md), [Discord settings](DISCORD.md), and [deployment](docs/DEPLOYMENT.md).

For future updates, double-click `update-bot.cmd` or run `npm run deploy`. See [the updater guide](docs/UPDATING.md).

Production uses SEOHOST at komars.eu/discord/botyslaw-smith. Start with /start; administrators manage server settings through /setup. War runs Tuesday 02:00 to Monday 02:00 Europe/Warsaw. Scheduled maintenance handles weekly reset reminders.



Hosting layout and multi-bot separation: [docs/HOSTING-LAYOUT.md](docs/HOSTING-LAYOUT.md).

## Before committing

Run `npm run check:repo` and `npm test`. The repository audit checks the exact tracked/unignored Git candidate set, including accidentally force-staged files. It flags private/generated artifacts, local environment-secret matches and common token/private-key formats without printing matched values. It is a useful guard, not a guarantee against every possible secret format.

Commit source, tests, public documentation, configuration templates and intentional game artwork. Keep `.env`, bot tokens, databases, backups, deployment receipts, private operations history, setup screenshots and rendered tutorial media local. `.gitignore` excludes them. Existing videos and screenshots remain at their original local paths; they have not been deleted. Production-specific history is archived in ignored `local-artifacts/operations/DEPLOYMENT-history.md`. The public deployment guide contains the reusable workflow.
