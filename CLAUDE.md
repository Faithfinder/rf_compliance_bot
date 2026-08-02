# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram bot that helps users avoid publishing messages without the required compliance ("foreign agent") text.

**Language**: This is a Russian-language bot. All user-facing messages, commands, and responses must be in Russian. `README.md` and `CONTRIBUTING.md` are in Russian too, deliberately — the audience is Russian channel admins. This file, the skills under `.claude/`, and code comments stay in English.

## Runtime & Package Management

- **Runtime**: Bun, not Node.js - use `bun` for all operations (`bun install`, `bun add`, `bun remove`)

## Key Patterns

- **Singleton bot instance**: [src/config/bot.ts](src/config/bot.ts) exports a single `bot` instance.
  - **IMPORTANT**: The bot instance must NEVER be passed as a parameter to functions. Always import it directly from `src/config/bot.ts` where needed.
- **Command definitions are the single source of truth**: [src/commands/definitions.ts](src/commands/definitions.ts) drives the Telegram bot menu, `/help`, and command registration. Adding a command anywhere else will silently leave it out of all three. See the `add-bot-command` skill.
- **Registration functions**: All commands and handlers are registered via `register*()` functions.
- **Channel settings use a JSON blob** (`settings` column) rather than typed columns, deliberately - new settings can be added to the `ChannelSettingsData` interface without a schema migration.

## Compliance Checking

Centralized in [src/handlers/message-helpers.ts](src/handlers/message-helpers.ts). The non-obvious parts:

- Rich messages (Bot API rich text: headings, lists, tables, quotations, collapsible blocks, media blocks, formulas) carry **no `text` field**, so their blocks must be flattened by `extractRichMessageText()` before matching the blurb.
- For rich messages the blurb is matched a second time with whitespace collapsed, because block structure does not preserve the line breaks of the configured blurb.
- Compliant rich messages are published with `copyMessage`, which keeps their formatting intact.
- `resolveUserIdentifier()` only accepts numeric user IDs - username lookups are not supported by the Telegram Bot API.

## Telemetry

PostHog product analytics, alongside Sentry. [src/config/posthog.ts](src/config/posthog.ts) mirrors
`config/sentry.ts`: a missing `POSTHOG_API_KEY` disables it and every capture becomes a no-op, which
is what lets call sites stay unguarded and CI run without any PostHog env vars.

- **Events are declared only in `TelemetryEventProperties`** in [src/telemetry/events.ts](src/telemetry/events.ts).
  Adding one anywhere else will not typecheck. `captureEvent(event, actor, properties)` is the only
  call path. See the `add-telemetry-event` skill.
- **`captureEvent` never throws and is never awaited.** This is load-bearing: several call sites sit
  inside `try` blocks whose `catch` tells the user that publishing failed, so a throw would report a
  failure for a post that was actually delivered. Others run inside the media-group debounce timer,
  outside grammY's error handling, where a throw kills the process.
- **Privacy is asymmetric, deliberately.** Channel ids and titles are sent in plaintext — a moderated
  channel is public information. Anything identifying a *person* is not: user ids go through
  [src/telemetry/identity.ts](src/telemetry/identity.ts) as a salted HMAC and nothing else, and
  usernames, display names, author signatures, message text and the blurb text are never sent. Call
  sites pass **raw** ids; identity.ts is the only place that hashes, so redaction has one audit point.
- The only sanctioned fragment of user input is the command token in
  [src/telemetry/commands.ts](src/telemetry/commands.ts), bounded and with arguments stripped —
  command arguments carry raw Telegram user ids (`/notify_add <id>`).
- **`POSTHOG_ID_SALT` has no default and no fallback.** With `POSTHOG_API_KEY` set but no salt,
  `initializePostHog()` throws and the process does not start, the same way `config/bot.ts` throws
  for a missing `TELEGRAM_BOT_TOKEN`. Do not reintroduce a default: a predictably-salted digest over
  the small Telegram id space is reversible by brute force. `identity.ts` throws rather than hash
  without one.
- `captureEvent` returns early unless `isTelemetryActive()`, because hashing needs a salt that only
  exists when telemetry is configured. Keep that check first — without it, every capture in a
  deployment with no PostHog key would try to hash and log a failure.
- Compliant posts are captured too (`channel_post_allowed`), not just violations — that event is the
  denominator of the compliance rate, so removing it would make the rate uncomputable rather than
  merely less detailed.
- `channel_post_ignored` is deduplicated by a module-level `Set` in
  [src/handlers/message.ts](src/handlers/message.ts) and fires once per channel per process, so its
  event count is **not** a channel count — it resets on restart. It is also deployment-scoped rather
  than attributed to an author, since the author would be whoever happened to post first.
- Both teardown paths in [src/index.ts](src/index.ts) must call `closePostHog()`: `gracefulShutdown`
  and the `bot.start().catch()` handler.

## Code Style

- **Comments**:
  - DO NOT add self-explanatory comments that merely restate what the code does
  - Only add comments for complex logic, non-obvious behavior, or important context
  - Examples of comments to avoid:
    - `// Initialize Sentry` above `initializeSentry();`
    - `// Get user ID` above `const userId = ctx.from?.id;`
    - `// Return the result` above a return statement
  - Examples of useful comments:
    - Implementation quirks or workarounds
    - Business logic that's not obvious from code
    - Complex algorithms or non-trivial operations
    - Important security or performance considerations

## Deployment

See the `deploy-docker` skill for the Docker volume requirement that persists the SQLite database.
