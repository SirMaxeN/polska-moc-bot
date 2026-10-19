# Security status

Reviewed and deployed on 2026-10-14. This is a focused application review, not a penetration test or a guarantee against compromise.

## Implemented controls

- Discord Ed25519 signatures are verified against the raw request body. Missing, invalid and stale signatures are rejected before command execution.
- Application identity is checked. User and server identity come from the signed interaction, not user-entered command options.
- Administrative actions check Discord administrator permissions. Season reset also requires the confirmation phrase and records an idempotency event in a transaction.
- SQL values are parameterized; dynamic column names use a fixed allowlist. Resource values are validated before writes.
- Reports are ephemeral and suppress mentions; authorized public war orders allow only the configured role or everyone/here mention, and unexpected errors return a generic message rather than filesystem paths or database diagnostics.
- HTTP request bodies, headers, socket lifetime and cached interaction responses have limits. These are resource bounds, not comprehensive DDoS protection.
- The application does not serve static files or expose a remote console. Database and backup paths are outside public_html and the application release directory.
- Production uses a restrictive process umask. On POSIX, database and backup files are set to 0600; newly created private directories and the backup directory use 0700. Existing parent directory modes and hosting account isolation still depend on host configuration.
- Signed interactions need only the public verification key. Automatic reminder delivery additionally uses the bot token from an environment variable or private owner-readable file outside public_html and the release directory. Command registration also needs the token. Never print it, commit it, or expose it through HTTP.
- No third-party runtime npm dependencies are installed.

## Verification

All 13 local tests passed, including signature validation, request limits, hidden internal errors, permissions and reset behavior. After deployment and restart, HTTPS checks confirmed:

The subsequent resource-form release passed all 15 tests, including modal owner checks, atomic validation, blank-field preservation and countdown boundaries. It was deployed and five global commands were confirmed through the Discord API; the production health check remains 200.

| Request | Result |
| --- | --- |
| GET /discord/health | 200, status ok, nosniff header |
| Unsigned POST /discord/interactions | 401, invalid signature |
| GET /discord/.env | 403 from hosting |
| GET /discord/app.js | 404 |
| GET /discord/bot.sqlite | 404 |
| GET /discord/botyslaw-security.zip | 404 |

## Remaining work and operational boundaries

- Discord accepted and saved the interactions endpoint on 2026-10-14. Four top-level commands were registered globally using the local token. Live permission checks remain pending.
- Configure scheduled backups and retention, off-host storage and a tested restoration procedure. Local pre-season-reset backups alone do not cover hosting account loss.
- Keep Node.js and the hosting environment patched. TLS, network filtering and volumetric attack mitigation are managed by SEOHOST.
- Enable MFA on the hosting and Discord accounts and protect their recovery codes. Account MFA state was not inspected or changed.
- No audit of other applications on the same hosting account was performed. Applications running under the same Unix account may access each other's files; 0600 does not isolate them from that account. Strong isolation requires a separate hosting account or runtime identity.


Weekly removal is administrator-, owner-, guild- and cycle-bound and deletes only weekly resource entries, preserving costs. Reminder configuration accepts one resolved guild text/announcement channel. Automatic reminders suppress all mentions and use only the fixed Discord HTTPS API origin with redirects disabled. Database leases coordinate concurrent workers. Discord nonce checks mitigate short retry duplicates but cannot guarantee exactly-once delivery across arbitrary extended failures. Delivery errors log only status or error type, not tokens or response bodies.

## Management role access
/setup → Role zarządu selects up to ten roles for all formerly administrator-only bot actions: hello, setup (including access configuration), delete, tech update/reset and season reset. Discord Administrator always passes this management guard. An empty selection permits administrators only. The guild-scoped management_settings table persists separately from ping settings and resource/season resets. The selected roles grant bot capabilities only, not Discord permissions. Every command, component and modal checks the current signed interaction member roles against current saved configuration; panel ownership checks remain in place. Season reset still requires BYEBYESEASON, case-insensitively.
Ping authorization is unchanged and independent: its configured role list remains required, without an administrator bypass. Existing descriptions may still say admin only by user preference; season reset now includes that suffix explicitly. Formerly restricted root commands are registered with default_member_permissions=null so Discord does not block selected non-admin roles before the handler runs. Ordinary members may see a command suggestion but the server-side management guard refuses execution. No production roles are selected automatically.

## Arithmetic input
All five /update resource fields and both /costs fields accept +, -, *, /, unary signs and parentheses with standard precedence and optional whitespace. Examples: 3+5*3 → 18; (3+5)*5-2 → 38; (20-5)/3 → 5; cost 200-3*4 → 188. Enter only the expression, without = or its result. Calculation happens on form submission; stored values and subsequent prefills are the calculated integers. Blank fields preserve values. Resources allow zero; costs require a positive final integer.
Existing per-number formats are preserved, including implicit thousands for resource decimals: 9,55+5 → 9555; k also works inside expressions. Costs use ordinary decimal fractions, so 200*0.94 → 188. Exact rational BigInt arithmetic avoids floating-point rounding and permits fractional intermediate values if the final result is integral. The dedicated parser does not use eval, Function or execute code. Inputs are bounded to 128 characters, numeric literals to 32 characters, nesting/unary depth to 16, and intermediate numerator/denominator lengths to 128 digits. Reject invalid syntax, division by zero, negative/fractional final values, unsafe integer results and invalid costs before any database update. Shared instructions appear once in each form and in /help; the resource form remains five fields.


## Repository boundary
Run npm run check:repo before committing. Private environment files, tokens, SQLite databases/journals, backups, logs, deployment output, setup screenshots, dated tutorial captures/media and local operations history are excluded by .gitignore. The audit checks tracked and unignored candidate files and catches known local secrets without echoing their values. Configuration templates have empty application ID/public key/token fields. Public application IDs, emoji IDs and signature verification keys are not credentials. A clean scan does not prove there are no undiscovered secrets; review intended public assets and changes before publishing.
