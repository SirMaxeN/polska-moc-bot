# Android scanner synchronization

Android source is maintained in the separate sibling `botyslaw-skaner` repository. This repository owns the pairing and resource synchronization backend; Android release and store instructions belong to the scanner repository.

The Android companion can update the same seven values as the resource and cost forms. It never receives the Discord bot token, administrator access, or an API for another player's data.

## Pairing

1. A member runs `/mobile pair` in the intended Discord server. The bot replies privately with a random six-character, one-use code, valid for ten minutes.
2. In Botysław Skaner, open **Menu główne → Połącz z Discordem** and paste the code.
3. The app redeems it over HTTPS and stores the returned device credential encrypted by AndroidKeyStore. Pairing again replaces the prior device for that member/server. One app connection refers to one member/server.
4. After scanning and reviewing all seven values, **Wyślij dane do bota** sends the reviewed values once to the linked member/server. The results screen is the review step; there is no second duplicate confirmation popup.
5. `/mobile revoke` removes all active device credentials and unused pairing codes for that member/server. Removing a local app connection only clears the phone's copy; the Discord command is the authoritative server-side revocation.

## API

- `POST https://komars.eu/discord/botyslaw-smith/mobile/pair`, JSON `{ "code": "six characters from A–Z and 2–9, excluding I/O" }`.
- `POST https://komars.eu/discord/botyslaw-smith/mobile/resources`, authenticated with `Authorization: Bearer <device credential>`.
- The resource body contains `request_id` (UUID), `observed_at` (recent ISO timestamp), and `values`: `skill_tickets`, `mount_keys`, `hammers`, `pets`, `mounts`, `skill_cost_x5`, `mount_cost`.
- All seven fields are required, integral and nonnegative; costs must be positive. Unknown fields and client-supplied user/server identifiers are rejected. Scope comes entirely from the device credential.
- Bodies are limited to 4 KiB; only JSON POST requests are accepted. Mobile endpoints use bounded per-socket-address rate limits and no-store responses. Proxy-provided forwarded IP headers are not trusted for bypassable rate limiting.
- New codes use a 32-symbol alphabet (30 bits for six characters), omit ambiguous I/O/0/1, are case-insensitive, and are checked for active-code collisions before issue. The existing ten attempts/minute/IP limit and ten-minute expiry remain. Unexpired legacy 32-character hex codes are accepted during transition.
- Credential hashes and pairing-code hashes are stored in additive SQLite tables. Plain credentials are returned only at pairing and are never logged. Device credentials expire after 90 days. Expired entries are pruned.
- Updates use the existing scoring validation and database transaction. The idempotency record is committed in the same transaction; retrying an acknowledged request does not rewrite its timestamp or resources.

HTTP signature checks for Discord interactions remain unchanged. The new routes accept device credentials, never unsigned Discord interaction payloads. No image/video upload route exists.

## Operational verification

The mobile security tests cover one-use/expired codes, device replacement, guild/member isolation, revocation, malformed/oversized JSON, unauthorized HTTP calls, atomic value validation and idempotent retries. Deployment uses the existing code backup and release health verification. The private player database is neither uploaded nor downloaded by deployment.

The app's INTERNET permission is now required for explicit pairing and resource synchronization. OCR and scrolling-image analysis remain on-device; recording frames are temporary RAM data, not server uploads or saved movie files. Inventory recognition is a reviewed estimate and must not be represented as exact game data.


## War preparation — AUTO Test 17

This iteration is prepared locally. `deployment/release-rHTnrB/runtime` is the tested server package; it has **not** been deployed. The APK calls the existing production HTTPS origin, so its new war-report routes require deploying this server package before an end-to-end phone test. No Discord report was published during automated validation.

- `POST /mobile/war-status` with the existing device credential returns `war_day`, `locked` and a reason. The app checks this before roster scanning.
- `POST /mobile/war-list` accepts up to 64 KiB of JSON: `request_id`, `observed_at`, `war_day`, `ours`, `enemies`, `our_count`, `enemy_count`, `own_bonus`, `enemy_bonus`. Members contain `name` and positive `power`; bonuses contain percentage `damage` and `health`. Scope is always taken from the authenticated device, never the supplied JSON.
- Both rosters must contain 1–50 distinct names and match the member counts read from each clan header. Incomplete or invalid requests never consume the lock. Only recent scans (30 minutes) from the current window are accepted.
- The requested fixed window is Sunday 01:00 through Monday 01:00 in `Europe/Warsaw`, including summer. It is deliberately independent of the existing resource calendar. The phone additionally requires visible Day 6 before reading rival bonuses.
- An additive SQLite table `war_lists` has a unique `(guild_id, war_day)` key. Validation, plan computation and transactional insertion occur server-side. The same request UUID is idempotent; another member or UUID cannot overwrite the report. History is retained, and a new Sunday gets its own key.
- `/report war-list` or `/start` → **Lista wojenna** displays a paginated private result during the window. It suppresses pings and does not replace an earlier list or publish automatic channel messages.
- Matching uses power multiplied by the geometric mean of damage/health multipliers. It maximizes unique main pairs, then provides up to two globally balanced alternatives. Surplus eligible allies get a clearly shared main target. Unmatchable allies and enemies too strong for everyone are listed separately. This is an approximate ranking, not a measured combat win probability.

### Test report and clan validation

`POST /mobile/war-test` and `/report war-test` are implemented locally. They use an isolated `TEST` record, work every day, force the rival bonuses to equal ours, and allow replacing the test record without consuming the Sunday report lock. The phone must still scan both actual member rosters; test mode does not invent enemy players.

New clients include `own_clan` and `enemy_clan` read from the bounded roster headers. If either is supplied, the server requires both and rejects identical normalized clan names. It also rejects identical name/power rosters regardless of order. Reports with clan headers show both names and scanned member counts. Older clients may omit the headers.

Before deployment on 4 November 2026, read-only verification found `release-MyH27i`, HTTP 404 for `/mobile/war-test`, and no globally registered `war-test` subcommand. This explains the phone screenshot's “Not found” upload failure.

After explicit user approval, release `release-81lUL1` was deployed with a local backup of the previous server code. The release health check passed (HTTP 200, matching release identifier) and 13 global Discord commands were registered, including `/report war-test`. All 79 server tests passed before deployment. No player database or token was uploaded; no sample roster or Discord report message was submitted. The feature is now available, but it needs a successful scan of both clans to populate a test report.

The detailed report now shows clan member counts, total powers, both sets of war bonuses, raw player powers, primary and alternative targets, shared targets, and unmatchable players. A percentage labelled “wskaźnika” compares power adjusted by the existing geometric-mean bonus heuristic; it is not a combat win probability. All players and alternatives are included in a UTF-8 text attachment on the same private message. Rich embeds fit all rows when possible; otherwise buttons update that same original message within Discord's 6,000-character total embed budget. File replies acknowledge first, then PATCH the original via multipart upload; they do not create additional report posts. Missing attachment permission falls back to the embedded pages. Stored scans and Sunday creation locks are unchanged.

Detailed-report release status: **deployed as release-X2pnsZ after explicit user approval for this exact update**. All 86 tests and repository audit passed. Deployment backed up the previous server code and verified HTTP 200 with the matching release ID. Slash commands were unchanged and were not re-registered. No player database or token was uploaded and no sample Discord message was sent. Production attachment delivery still needs checking through a real report invocation; automated tests verified multipart upload, the original-message edit path, all 50 long-name rows and alternatives, embed limits, permission fallback, and unchanged ordinary JSON replies.

The full-profile TEST implementation is documented in FULL-WAR-SIMULATION.md. Existing war routes optionally accept `profiles` (two arrays matching the roster order, with null for pending profiles) and `simulation` (`model: pvp-full-v1`, `experimental: true`, and one indexed result/error per pair). War request size is bounded at 2 MiB after authentication; resource/pair requests keep their 4 KiB limit. Profiles require matching names, current timestamps, complete skills/equipment/fairy fields and valid numbers. Unsupported reflect/Tira or missing profiles cannot carry numeric results. The server computes weighted unique assignment and Wilson intervals itself; a client-supplied assignment is not used. Ordinary power-only reports and weekly production locks keep their previous behavior.

Full-profile backend deployed on 4 November 2026 as `release-ieosQt` after the user's explicit request to implement and try the full scan. All 97 tests passed; the previous server code was backed up and fresh public health verification returned HTTP 200 with the matching release ID. Commands were unchanged, so no registration or sample Discord message was sent. This verifies deployment, not the success of a real 100-member phone scan.

Local verification: 77 Node tests pass, including real local HTTP pairing/status/upload, cross-member lock, invalid/incomplete scans, Discord message lengths, timing boundaries and all 729 combinations of three-player small-roster matching against exhaustive optimal pairing. No live Discord messages are sent by tests.


### Phone installation and live deployment, 2026-11-01

Test 17 installed successfully through the calibration-only installer on the reconnected phone; reset was verified and unrelated preferences/Discord pairing preserved. Backend release `release-MyH27i` was deployed with the existing previous-code backup workflow. Health returned HTTP 200 with the new release identifier; global Discord commands were registered successfully (13 commands, including `/report war-list`). Both new mobile war routes respond with the expected 401 for unauthenticated requests. No sample war list or Discord report was submitted, so the weekly creation lock remains available for the user's actual scan.


### Globally balanced alternatives — approved deployment

release-oQxJSn is deployed after explicit approval of this exact change, with a previous-code backup and HTTP 200 confirming the release. At most two alternatives per ally are balanced over total target usage across the clan; main pairs stay unchanged and each alternative must remain eligible. Both power and full-simulation reports apply this policy, including saved plans at rendering. Repetition remains possible when few eligible opponents exist. All 99 Node tests passed; no database/token upload, command re-registration or sample Discord message was needed.
