# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram bot that helps users avoid publishing messages without the required compliance ("foreign agent") text.

**Language**: This is a Russian-language bot. All user-facing messages, commands, and responses must be in Russian. `README.md` and `CONTRIBUTING.md` are in Russian too, deliberately — the audience is Russian channel admins. This file, the skills under `.claude/`, and code comments stay in English.

**Runtime**: Bun, not Node.js — use `bun` for all operations (`bun install`, `bun add`, `bun remove`).

## Key Patterns

- **Singleton bot instance**: [src/config/bot.ts](src/config/bot.ts) exports a single `bot`. It must NEVER be passed as a parameter — import it directly where needed.
- **Command definitions are the single source of truth**: [src/commands/definitions.ts](src/commands/definitions.ts) drives the Telegram bot menu, `/help`, and command registration. Adding a command anywhere else will silently leave it out of all three. See the `add-bot-command` skill.
- **Registration functions**: All commands and handlers are registered via `register*()` functions.
- **Channel settings use a JSON blob** (`settings` column) rather than typed columns, deliberately — new settings can be added to the `ChannelSettingsData` interface without a schema migration.

## Compliance Checking

Centralized in [src/handlers/message-helpers.ts](src/handlers/message-helpers.ts). The non-obvious parts:

- Rich messages (Bot API rich text: headings, lists, tables, quotations, collapsible blocks, media blocks, formulas) carry **no `text` field**, so their blocks must be flattened by `extractRichMessageText()` before matching the blurb.
- For rich messages the blurb is matched a second time with whitespace collapsed, because block structure does not preserve the line breaks of the configured blurb.
- Compliant rich messages are published with `copyMessage`, which keeps their formatting intact.
- `resolveUserIdentifier()` only accepts numeric user IDs — username lookups are not supported by the Telegram Bot API.

## Telemetry

PostHog product analytics, alongside Sentry. [src/config/posthog.ts](src/config/posthog.ts) mirrors
`config/sentry.ts`: a missing `POSTHOG_API_KEY` disables it and every capture becomes a no-op, which
is what lets call sites stay unguarded and CI run without any PostHog env vars.

- **Events are declared only in `TelemetryEventProperties`** in [src/telemetry/events.ts](src/telemetry/events.ts);
  `captureEvent(event, actor, properties)` is the only call path. See the `add-telemetry-event` skill.
- **`captureEvent` never throws and is never awaited.** Load-bearing: some call sites sit inside `try`
  blocks whose `catch` tells the user that publishing failed, others inside the media-group debounce
  timer, outside grammY's error handling, where a throw kills the process.
- **Privacy is asymmetric, deliberately.** Channel ids and titles go in plaintext — a moderated channel
  is public information. Anything identifying a *person* does not: user ids go through
  [src/telemetry/identity.ts](src/telemetry/identity.ts) as a salted HMAC, and usernames, display names,
  author signatures, message text and the blurb text are never sent. Call sites pass **raw** ids;
  identity.ts is the only place that hashes, so redaction has one audit point.
- The only sanctioned fragment of user input is the command token in
  [src/telemetry/commands.ts](src/telemetry/commands.ts), bounded and with arguments stripped —
  command arguments carry raw Telegram user ids (`/notify_add <id>`).
- **`POSTHOG_ID_SALT` has no default and no fallback.** With `POSTHOG_API_KEY` set but no salt,
  `initializePostHog()` throws and the process does not start. Do not reintroduce a default: a
  predictably-salted digest over the small Telegram id space is reversible by brute force.
- `captureEvent` returns early unless `isTelemetryActive()` — keep that check first, since hashing needs
  a salt that only exists when telemetry is configured.
- Compliant posts are captured too (`channel_post_allowed`): that event is the denominator of the
  compliance rate, so removing it makes the rate uncomputable.
- `channel_post_ignored` is deduplicated by a module-level `Set` in
  [src/handlers/message.ts](src/handlers/message.ts) and fires once per channel per process, so its
  event count is **not** a channel count — it resets on restart.
- **`TelemetryActor` has three kinds.** A user id hashes to `u_…`; `"deployment"` is reserved for events
  about the process itself (only `bot_started`) and yields `d_…`; `"anonymous"` sends **no** distinct id,
  so PostHog creates no Person. Never invent a stand-in identity — attributing anonymous channel posts to
  the deployment collapsed nearly all channel traffic onto one pseudo-person, and a channel is not a
  substitute either, since its identity already travels in `channel_id` / `channel_title` /
  `$groups.channel`. Unique-user counts do not apply to anonymous events; use event counts and the
  channel group.
- Both teardown paths in [src/index.ts](src/index.ts) must call `closePostHog()`: `gracefulShutdown`
  and the `bot.start().catch()` handler.

## Code Style

Comment only what the code cannot say itself: workarounds, non-obvious business logic, tricky
algorithms, security or performance considerations. Do not add comments that restate the next line
(`// Initialize Sentry` above `initializeSentry();`).

## Deployment

See the `deploy-docker` skill for the Docker volume requirement that persists the SQLite database.
