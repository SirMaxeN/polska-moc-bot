# Functional requirements

English slash commands, code and documentation; Polish ephemeral responses. All commands are server-only. Each player updates their own data; anyone may request all four reports.

## Resources

/start is the main private player menu. /update immediately opens a five-field modal: skill tickets, mount keys, hammers, pets or eggs awaiting merging (exclude three baseline pets), and owned mounts awaiting merging excluding one baseline mount. Buttons open the same form. Saved values are prefilled; opening or cancelling does not write. All fields are optional, blank preserves a value, and explicit zero clears it. Resource decimals imply thousands without K. Cost and percentage parsing remain strict. Validate the entire submission before writing. /help explains /start, resources, costs and reports, with entry and Start buttons.

Default skill cost x5 is 200. Last personal cost survives weekly resets. Cost-only updates do not enroll a player in the current cycle or change resource freshness. Resource updates, including explicit zero, enroll the player. Profiles are created automatically; users are not hardcoded.

## Calculation
- Skills: floor(tickets/cost_x5)*5 summons; no upgrades.
- Mounts: floor(keys/personal_mount_cost) summons; maximum merges equal new summons plus stored owned mounts awaiting merging, excluding one baseline mount.
- Hammers: provisionally one hammer per forge at Multiwersum or above. Use the rounded displayed unit rate and mark totals as approximate.
- Dungeons: two keys for each of four dungeons, eight actions on each scoring day (1 and 4), without user input.
- Pets: combined count of pets and eggs awaiting merging, excluding three baseline pets; one merge per entered item, with the same rate regardless of rarity or whether it is still an egg. Do not double-count the same item. No hatching forecast.

Each day independently uses the same stock. Do not allocate, deduct automatically or sum days into a weekly forecast. Players update remaining stock after spending.

## Reports
/report player: own resources, personal/default cost, resource timestamp, all six days with category subtotals and unit rates. Group identical rates across days and rarities. No package arithmetic, multiplication explanations or remainders. Without a current resource entry, prompt /update rather than forecasting dungeons alone.
/report clan: sum enrolled players separately for each day, with participant count.
/report clan-details: each player's daily potential and resource timestamp plus clan total; all days without pagination. Day 6 has one shared no-forecast/exclusion entry, without repetitive per-player entries.
All reports share calculations, include excluded actions by day, explain independent stock scenarios, approximate forging and owned-mount merging. Day 6 says “Brak prognozy”, never actual zero. No weekly total. Escape names and disable mentions.

| Day | Excluded |
|---|---|
| 1 | Skill upgrades |
| 2 | Forge coins/gems; technology research |
| 3 | Skill upgrades; egg hatching |
| 4 | Forge coins/gems |
| 5 | Research; egg hatching |
| 6 | Rival member fights; all-out brawl |

## Calendar and resets
Europe/Warsaw: Tuesday 02:00 begins six war days ending Monday 02:00. Monday after reset is the preparation day; all six days show as upcoming. Boundaries follow local wall time, including DST. Display dates and generation time.
Past headers: 🔴 ~~Dzień 1: wtorek~~; current: 🟢 **Dzień 2: środa** · koniec za 3 godz. 12 min; future: ⚪ Dzień 3: czwartek. Calculate remaining time to the next local boundary, rounded up to a minute, at report generation/page change. No status words or long dash separators. Past figures are current potential, not actual history.

Weekly Monday 02:00 reset clears active resource entries, preserving costs and tech. Check cycles at startup and before operations. Repeated DST 02:00 uses its first occurrence; missing 02:00 uses the first valid time after the gap. Never erase fresh entries after a delayed reset.

/tech show is open to all. /tech update opens a private select menu with current values then a modal. Replacement values are 0–40%, steps of 4, matching screenshots. Another technology can be selected afterward. /tech reset requires a confirmation button and clears tech only. Administrator is the initial management permission; check it again on buttons and modals.

/season reset confirmation:BYEBYESEASON: administrator only, phrase case-insensitive and trimmed, no extra button. Atomically clear resources and all 16 tech bonuses, clear personal costs (defaults 200 and 50), increment season and record reset. Server scoped.

## Current technology and example
40%: skill summons/upgrades, dungeon keys, egg hatching, pet merges, mount summons/merges, days 1–5. 0%: equipment forging, research, forge spending, day 6. Green (+4%) at level zero means next level. Initialize new server configuration from supplied screenshots; season reset zeros it.
SirMaxeN: 9880 tickets, cost 188, 2840 mount keys, 11026 hammers, 28 pets. Daily potentials: approximately 145804, 120960, approximately 165604, 164160, approximately 107104, no forecast. Do not seed fictional players.

Outstanding: additive formula and forging rounding/hammer consumption need more game evidence. User will notify changes; do not experiment by changing server bonuses. Verify production HTTPS, cold starts, persistent storage and backups.




## Player navigation and separate costs

/start opens a private menu with resource entry, costs, all four reports, help and read-only technology. /costs opens a separate two-field modal: skill_cost_x5 (default 200) and mount_cost per single summon (default 50). Both fields are positive integers; blanks preserve saved values. Costs survive weekly resets and reset to defaults for a new season. Cost-only updates do not refresh resource timestamps. /update directly opens five resource fields; save confirmation includes Edit costs. Every report, including empty and multipart reports, includes all four report buttons and resource entry. Report navigation replaces the current private panel and clears previous text.

## Full detailed report

The detailed clan report displays all six days immediately and every active player on forecast days 1–5. There are no Previous/Next controls. Each player retains the resource update timestamp, and each day includes one clan total and exclusions. Content is packed into messages under Discord embed limits; overflow is delivered automatically as ordered ephemeral follow-up messages. Each part retains report and edit buttons. Legacy pagination buttons are accepted but now display the full report.

War-order navigation uses /ping directly. Administrator-only /setup consolidates reminder channel, allowed ping roles and ping recipients. Legacy setup handlers remain compatible with older panels but are no longer registered as slash commands. There is no application cooldown between distinct war orders. Signature verification, ownership and current role checks remain enforced; HTTP interaction retries are still deduplicated.


## Weekly removal and reminders

/delete is administrator-only at registration and execution, including selectors. It shows current-week members in lists of up to 25, supports multiple selection, and removes only selected weekly resources. Profiles and costs remain. Selections are owner-, guild- and cycle-bound, so old-week panels cannot remove new-week entries.

/setup selects one text or announcement channel for the automatic Monday reset reminder, or clears it to disable delivery. The reset transaction creates one durable job per configured guild/week. A minute maintenance task checks resets and delivers queued reminders, including recovery after sleeping workers. Database leases avoid concurrent deliveries, sent state prevents repeated sends, and Discord nonce enforcement reduces retry duplicates. Transient failures and rate limits are retried with backoff. No automatic mass mentions. /ping has an authorized manual update reminder that uses the configured ping recipient.

The /setup overview includes next reminder date/countdown and last successful delivery timestamp, with a refresh control. Never label failed attempts as successful delivery.

/report clan-ultra provides each player’s daily points broken down by action, with clan totals. Both detailed reports use bold player names, separated blocks and indented italic update timestamps with a clock icon. Player color markers are removed; colors indicate day status only. All report types stay in one private message when the complete report fits Discord embed limits. Otherwise each day starts a new message; an oversized day continues in additional messages, with continuation headers only at the beginning of those messages. Exclusions appear once per day; day 6 remains a shared no-forecast entry. All parts are sent privately without pagination.

Daily reminders: every day at 20:00 Europe/Warsaw, on the same configured channel as the Monday 02:00 reset reminder. Day-specific action lists distinguish forecasted and excluded points; Monday requests starting resources. No automatic role/everyone mentions. /setup shows the next daily time, separate last successful daily and weekly deliveries, and an admin-only private preview of all seven daily messages plus the reset message. Existing minute maintenance handles delivery, durable date-keyed claims, retries and deduplication. Missed daily messages may catch up that evening only; previous dates expire. No new scheduler or slash command registration is required.

## Management role access
/setup → Role zarządu selects up to ten roles for all formerly administrator-only bot actions: hello, setup (including access configuration), delete, tech update/reset and season reset. Discord Administrator always passes this management guard. An empty selection permits administrators only. The guild-scoped management_settings table persists separately from ping settings and resource/season resets. The selected roles grant bot capabilities only, not Discord permissions. Every command, component and modal checks the current signed interaction member roles against current saved configuration; panel ownership checks remain in place. Season reset still requires BYEBYESEASON, case-insensitively.
Ping authorization is unchanged and independent: its configured role list remains required, without an administrator bypass. Existing descriptions may still say admin only by user preference; season reset now includes that suffix explicitly. Formerly restricted root commands are registered with default_member_permissions=null so Discord does not block selected non-admin roles before the handler runs. Ordinary members may see a command suggestion but the server-side management guard refuses execution. No production roles are selected automatically.

## Arithmetic input
All five /update resource fields and both /costs fields accept +, -, *, /, unary signs and parentheses with standard precedence and optional whitespace. Examples: 3+5*3 → 18; (3+5)*5-2 → 38; (20-5)/3 → 5; cost 200-3*4 → 188. Enter only the expression, without = or its result. Calculation happens on form submission; stored values and subsequent prefills are the calculated integers. Blank fields preserve values. Resources allow zero; costs require a positive final integer.
Existing per-number formats are preserved, including implicit thousands for resource decimals: 9,55+5 → 9555; k also works inside expressions. Costs use ordinary decimal fractions, so 200*0.94 → 188. Exact rational BigInt arithmetic avoids floating-point rounding and permits fractional intermediate values if the final result is integral. The dedicated parser does not use eval, Function or execute code. Inputs are bounded to 128 characters, numeric literals to 32 characters, nesting/unary depth to 16, and intermediate numerator/denominator lengths to 128 digits. Reject invalid syntax, division by zero, negative/fractional final values, unsafe integer results and invalid costs before any database update. Shared instructions appear once in each form and in /help; the resource form remains five fields.


## Report message boundaries
All reports use the same limit-aware paginator (6000 aggregate embed characters, 25 fields, 1024 characters per field). Keep the complete report together when it fits. On overflow, start every day in a new message and keep subsequent days separate from continuation parts. Only the first field of a continuation message repeats the day header; internal fields have no repeated day heading. Every clan report, including empty reports, displays the enrolled player count; personal reports omit it.


## Clan resource roster
/report resources displays every enrolled player’s current-week tickets, mount keys, owned mounts, hammers, pets or eggs, personal summon costs and resource update time. Includes enrollment count and totals for the five stocks, with private automatic continuation messages when required. Available through Start and report navigation, with the same owner-bound report controls.

Resource roster adds maximum points beside each stock and aggregate stock totals, using saved personal costs and current technology. Take the best eligible day for each resource, never sum war days. Mount keys include summon plus merging new mounts; owned mounts include only their own merges, avoiding double counting. Hammer points remain approximate; automatic dungeon points are excluded from this stock-only report.


## Participation reminder roles
/setup → Uczestnicy wojny selects up to ten guild roles (union, excluding bots; empty disables attendance lists). Daily and weekly reminders include separate red-icon weekly non-enrollment and clock-icon enrolled-but-not-updated lists. Daily cutoff is 02:00 Europe/Warsaw, not midnight. Member roster is fetched live through paginated Discord REST with Server Members Intent enabled in Developer Portal. Costs-only changes do not refresh resource timestamps. Mentions never ping; lists split into bounded messages with per-part nonces. API failures produce an explicit unavailable notice, never a false empty list. Settings persist independently of resource resets.

The private all-reminders preview includes a ninth embed with explicitly fictional example names for both participant lists. It illustrates the attendance layout without querying members, changing resources, sending public messages or affecting delivery state.

Attendance list styling: each weekly non-enrolled member uses ❗; daily-stale member lines have no emoji (clock remains only in the heading). Private preview uses the same styling.

/report missing (management only) and the setup Missing updates button open a private live attendance report using configured participant roles. Discord administrators or saved management roles are required; ordinary members and ping-only roles are denied. Acknowledge before roster fetching, recheck authorization before completion, and deliver every list continuation privately without mentions. No selected roles produces a setup hint.

Enrollment is displayed as X/Y members in missing-update reports, automatic attendance lists and all clan reports. Y is the live union of configured participant roles without bots/duplicates; X is current-week enrolled members within that union. Additional enrolled outsiders remain in clan calculations and are counted separately. Unknown totals use ? and an explicit setup/API-unavailable explanation. Clan reports defer before live roster retrieval to avoid interaction timeouts; personal reports remain unchanged.

The private missing-update report combines both attendance sections into a single message whenever the full content including its title fits 2000 characters; only genuine overflow uses private follow-ups.

Enrollment summaries identify additional enrolled users outside participant roles using non-pinging mentions below their count. Long outsider rosters move to bounded private continuation parts (or automatic reminder list parts), keeping Discord message and embed limits intact.

/report missing is now available to every guild member and remains private. Start and all report panels include its button; help describes it. Attendance and outsider lists render escaped current server display names (server nickname, global name, username, then saved name/ID fallback) instead of unresolved user mentions, avoiding unknown-user labels and notifications. Setup configuration still requires management permission.

Guild participation data always comes from the guild-wide member endpoint, never the invoking channel. Roster requests share an in-flight/30-second cache scoped to guild, token and request client, with no failed-result caching, an eight-second overall fetch budget and bounded pagination. Read-only reports ready within one second return directly through the initial private interaction callback; slower reports acknowledge privately and complete afterward. This avoids unnecessary webhook edits while preserving timely acknowledgments and retry deduplication.


## Multi-bot hosting organization
Production now lives in discord_bots/botyslaw_smith with separate app, data and backups directories. Its public prefix is /discord/botyslaw-smith; Developer Portal, minute cron, deployment target and health/banner URLs are updated. Keep each future bot in a separate sibling namespace with distinct public route, credentials and data. CloudLinux-managed environments remain managed by hosting. See docs/HOSTING-LAYOUT.md.
