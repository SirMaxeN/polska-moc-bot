# Command reference

All commands use English names. Responses are Polish and visible only to the requesting user. Commands work inside a Discord server.

## Player resources

`/start` is the main private player menu. `/update` immediately opens a five-field resource modal: tickets, mount keys, hammers, pets or eggs awaiting merging (exclude three baseline pets), and owned mounts awaiting merging excluding one baseline mount. Buttons open the same form. Saved values are prefilled. Opening or cancelling does not write data. Save confirmations and reports include cost and report controls.

Equivalent resource values: 9550, 9.55, 9,55, 9.55k and 9,55k. A comma or dot implies thousands for resources; whole numbers stay literal. Cost and technology parsing do not imply thousands. Equivalent mount key values: 2840, 2.84k and 2,84k. Every field is optional. Supplied fields replace stored values; omitted fields preserve them. Explicit zero clears a resource. Cost must be positive, defaults to 200, and survives weekly resets. The shared pets/eggs field contains the combined count of mergeable pets and eggs, excluding three baseline pets. Each merge earns the same rate; never count the same item twice.

Change the desired fields and submit the form. Blank fields preserve saved values; enter 0 to clear a resource. All fields are validated before writing. After spending resources, enter the remaining amounts. No automatic resource deduction is performed.

`/help` explains /start as the main command, direct resource entry, separate costs and the four reports.

## Reports

| Command | Result |
|---|---|
| /report player | Own resources and potential for all six days, category subtotals and unit rates |
| /report clan | Daily sums for all players with resources entered this cycle |
| /report clan-details | Each player's daily potential and update time, with clan totals; all days without pagination |

Each member entry explicitly labels its last resource-save timestamp `Aktualizacja:` in Europe/Warsaw. Cost-only updates do not refresh that resource timestamp.

Each day is an independent scenario using the same stored stock. There is no weekly total. Every report identifies excluded actions by day. Day 6 has no forecast. Red and strikethrough indicate past days, green indicates the current day, white indicates future days. Current headers include hours/minutes until the next Warsaw boundary, rounded up to the next minute. The countdown is calculated when generating a report or regenerating it.

## Technology

| Command | Access and behavior |
|---|---|
| /tech show | Everyone: show all 16 stored bonuses |
| /tech update | Administrator: select a technology and enter a replacement percentage |
| /tech reset | Administrator: clear technology after confirming the button |

Percentages accept 0–40 in steps of 4, optionally ending in %. Values replace previous percentages. Administrator permission is checked again on buttons and modal submissions.

## Season reset

`/season reset confirmation:BYEBYESEASON`

Administrator only. Confirmation is case-insensitive and trimmed. A valid phrase immediately clears resources and all technology and restores default costs 200 (five skills) and 50 (one mount). It affects the current Discord server only. A local SQLite backup is taken first. Weekly resets preserve technology and individual costs; technology resets clear technology only.

## Starting technology and scoring

`config/initial-tech.json` contains the user's supplied server technology: skill summons/upgrades, dungeon keys, egg hatching, pet merges, mount summons/merges and days 1–5 at 40%; forging, research, forge spending and day 6 at 0%. Apply it once when the server first gets a database entry. Normal starts and weekly resets must never restore these values over later changes or a season reset.

With this technology, the forecast rates are skill summons 225, mount summons 1080, mount merges 1080, pet/egg merges 2250, each dungeon key 5400, and approximately 4 per hammer. Dungeon scoring assumes eight keys on days 1 and 4. Mount summons default to 50 keys, editable per player, and merge capacity equals new summons plus stored mounts awaiting merging, excluding one baseline mount. Skills use whole five-summon packs only.

The candidate base rates and additive formula are documented in POINTS.md. Forging remains approximate until game rounding and hammer consumption are confirmed. Unpredictable spending, research, skill upgrades, hatching and day 6 battles are excluded.

The full SirMaxeN example above produces approximately 145804, 120960, approximately 165604, 164160 and approximately 107104 points on days 1–5. Day 6 has no forecast.

## Registration

`npm run register` publishes the complete command set to Discord using DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID. Set DISCORD_GUILD_ID for server-scoped registration. The registration script replaces this application's commands in the selected scope. This is separate from implementing the handlers and requires the actual application credentials. Hosting and real Discord operation are verified during deployment.



## Player navigation and separate costs

/start opens a private menu with resource entry, costs, all four reports, help and read-only technology. /costs opens a separate two-field modal: skill_cost_x5 (default 200) and mount_cost per single summon (default 50). Both fields are positive integers; blanks preserve saved values. Costs survive weekly resets and reset to defaults for a new season. Cost-only updates do not refresh resource timestamps. /update directly opens five resource fields; its save confirmation includes Edit costs. Every report, including empty and multipart reports, includes all four report buttons and resource entry. Report navigation replaces the current private panel and clears previous text.

## Full detailed report

The detailed clan report displays all six days immediately and each active player on forecast days 1–5. Day 6 contains one shared no-forecast/exclusion explanation. There are no Previous/Next controls. Each player retains the resource update timestamp, and each day includes one clan total and exclusions. Content is packed into messages under Discord embed limits; overflow is delivered automatically as ordered ephemeral follow-up messages. Each part retains report and edit buttons. Legacy pagination buttons are accepted but now display the full report.

## Public greetings and restricted war orders

/hello is administrator-only and publishes a short greeting with the banner and shared Help/Start buttons. Those buttons open private responses for the clicking member.

/ping opens a private five-row panel with thirteen orders, including an update-data reminder. Runtime access requires a configured role; Administrator alone does not bypass the allowed-role check. Public order delivery uses the configured recipient and strict allowed_mentions. Ownership and current roles are rechecked on every click. There is no application cooldown; interaction retries are deduplicated.

## Configurable ping recipients and shared welcome buttons

/setup → Ping recipients (administrator only) opens a private recipient panel: a mode selector (one role, @everyone or @here) and a single-role selector (exactly one role). Selecting a role immediately sets role mode. Choosing role mode alone prompts for a role and leaves the previous recipient unchanged until selected. Settings persist independently per guild in ping_targets; the original guild defaults to Moderator until explicitly changed. Other guilds require configuration. Already-open order buttons read the current saved recipient at send time.

Mass mentions require the bot's MENTION_EVERYONE permission in the current channel; missing permissions produce a private error instead of a misleading public announcement. A role must be mentionable or the bot needs that same permission. allowed_mentions includes exactly one selected role or the everyone category used by @everyone/@here; message content contains only the selected mention. Setup panels suppress mentions. @everyone addresses all members with channel access; @here addresses online members with channel access, subject to individual notification preferences. No bot permission changes are performed automatically.

/hello remains administrator-only and public. Its Help/Start buttons are usable by any guild member, each opening a new private response bound to the clicking user. Existing private panels still enforce ownership. Administrator-only root commands are explicitly labelled in command descriptions; administrative tech subcommands also identify their restriction.


## Consolidated administrator setup

/setup is the single entry point for the automatic reminder channel, roles allowed to use /ping, and the recipient role/everyone/here. The old /ping-setup and /ping-role-setup commands are no longer registered; their existing private controls remain compatible. Settings are private, owner-bound and administrator-checked again on changes. Clear the reminder channel to disable automatic delivery.

## Weekly calendar and removal

War days are Tuesday, Wednesday, Thursday, Friday, Saturday and Sunday. Each begins at 02:00 Europe/Warsaw. Day 6 ends Monday 02:00, when weekly resources reset. Monday after 02:00 is preparation for the next war. Personal costs and technology survive.

/delete (administrator only) lists current-week players. Select one or more to remove their current-week resources and report membership. Costs and profiles remain, and a player can rejoin using /update. Lists over 25 members have separate selection pages. Old-week selectors cannot remove current-week entries.

After a weekly reset the bot posts one reminder to the channel chosen through /setup, with Help/Start buttons and no mass mentions. Scheduled maintenance must run every minute on the host, with the bot token stored privately outside the public/application roots. Delivery state is persisted and failed requests retry with backoff.

The /setup overview also displays the next weekly reminder date and remaining days/hours/minutes in Warsaw time, the persisted last successful send time (or no-send-yet text), and a Refresh button. Countdown values are calculated when opening or refreshing the panel.

The /setup overview includes a Preview reminder button. It sends a new ephemeral sample to the clicking administrator using the same message builder as automatic delivery, with an explicit preview notice. It does not reset resources, enqueue/send a public reminder or change last successful delivery. Panel ownership and Administrator permission are checked on click; no reminder channel is required.


/report clan-ultra provides each player’s daily points broken down by action, with clan totals. Both detailed reports use bold player names, separated blocks and indented italic update timestamps with a clock icon. Player color markers are removed; colors indicate day status only. All report types stay in one private message when the complete report fits Discord embed limits. Otherwise each day starts a new message; an oversized day continues in additional messages, with continuation headers only at the beginning of those messages. Exclusions appear once per day; day 6 remains a shared no-forecast entry. All parts are sent privately without pagination.

Daily reminders: every day at 20:00 Europe/Warsaw, on the same configured channel as the Monday 02:00 reset reminder. Day-specific action lists distinguish forecasted and excluded points; Monday requests starting resources. No automatic role/everyone mentions. /setup shows the next daily time, separate last successful daily and weekly deliveries, and an admin-only private preview of all seven daily messages plus the reset message. Existing minute maintenance handles delivery, durable date-keyed claims, retries and deduplication. Missed daily messages may catch up that evening only; previous dates expire. No new scheduler or slash command registration is required.

/hello explicitly invites players to click Start below the welcome for their private menu, or Help for instructions. Prefer this shared button entry point on the bot channel; players do not need to type commands.

All four reports flag the currently active final scoring day with a last-chance warning when saved stock is positive: skill tickets on day 3, mount keys and owned mounts on day 4, hammers and pets/eggs on day 5. The warning is limited to this war; it does not mean resources expire. Detailed reports flag only the affected players, while clan totals use the union of members' stocks. Small positive balances also warn, even if below a full summon cost. Future/past days and zero stocks do not warn.

Last-chance warnings use only the short exclamation line, directly below the day's total (or the member total in detailed reports), before timestamps and action breakdowns. No explanatory sentence follows the warning.

## Management role access
/setup → Role zarządu selects up to ten roles for all formerly administrator-only bot actions: hello, setup (including access configuration), delete, tech update/reset and season reset. Discord Administrator always passes this management guard. An empty selection permits administrators only. The guild-scoped management_settings table persists separately from ping settings and resource/season resets. The selected roles grant bot capabilities only, not Discord permissions. Every command, component and modal checks the current signed interaction member roles against current saved configuration; panel ownership checks remain in place. Season reset still requires BYEBYESEASON, case-insensitively.
Ping authorization is unchanged and independent: its configured role list remains required, without an administrator bypass. Existing descriptions may still say admin only by user preference; season reset now includes that suffix explicitly. Formerly restricted root commands are registered with default_member_permissions=null so Discord does not block selected non-admin roles before the handler runs. Ordinary members may see a command suggestion but the server-side management guard refuses execution. No production roles are selected automatically.

## Arithmetic input
All five /update resource fields and both /costs fields accept +, -, *, /, unary signs and parentheses with standard precedence and optional whitespace. Examples: 3+5*3 → 18; (3+5)*5-2 → 38; (20-5)/3 → 5; cost 200-3*4 → 188. Enter only the expression, without = or its result. Calculation happens on form submission; stored values and subsequent prefills are the calculated integers. Blank fields preserve values. Resources allow zero; costs require a positive final integer.
Existing per-number formats are preserved, including implicit thousands for resource decimals: 9,55+5 → 9555; k also works inside expressions. Costs use ordinary decimal fractions, so 200*0.94 → 188. Exact rational BigInt arithmetic avoids floating-point rounding and permits fractional intermediate values if the final result is integral. The dedicated parser does not use eval, Function or execute code. Inputs are bounded to 128 characters, numeric literals to 32 characters, nesting/unary depth to 16, and intermediate numerator/denominator lengths to 128 digits. Reject invalid syntax, division by zero, negative/fractional final values, unsafe integer results and invalid costs before any database update. Shared instructions appear once in each form and in /help; the resource form remains five fields.

Resource form order: skill tickets, mount keys, owned mounts (excluding one base), hammers, pets or eggs (excluding three base). Owned mounts sit immediately below their summon keys.


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

Resource report continuation titles are “Zasoby klanu (ciąg dalszy)”; day numbers apply only to actual daily scoring groups.
