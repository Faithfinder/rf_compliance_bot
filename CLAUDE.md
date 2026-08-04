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

## Notification Delivery

A bot cannot open a private chat with a user, so a notification recipient who never pressed Start —
which includes most channel post authors, since posting requires no contact with the bot — simply
cannot be written to. Telegram answers `400: chat not found` (or a 403 for blocks and dead accounts).

- [src/notifications/reachability.ts](src/notifications/reachability.ts) is the single place that
  recognizes those wordings. `dispatchRejectionNotifications` counts them as `unreachableTargets` and
  **does not report them to Sentry** — they are a permanent property of the recipient, not a fault,
  and reporting them buries real delivery faults. `failedTargets` stays reserved for actual errors.
- Because that signal is now silent, `/notify_add` probes reachability with `sendChatAction` (the
  cheapest call that fails the same way and shows the recipient nothing but a typing indicator) and
  warns the admin at configuration time, which is the only moment anyone can act on it.
- `/notify_list` probes every recipient for the same reason: an add-time warning does nothing for
  entries that predate it. Its `⚠️` marker means "the bot cannot write to this person" and is
  distinct from the older `(недоступен)`, which only means `getChatMember` failed for them.

## Telemetry

PostHog product analytics, alongside Sentry. The `add-telemetry-event` skill has the procedure and the
privacy rules (people are hashed, channels are not; never send user-authored text). Beyond it:

- **A missing `POSTHOG_API_KEY` makes every capture a no-op**, which is what lets call sites stay
  unguarded and CI run without any PostHog env vars.
- **`POSTHOG_ID_SALT` has no default and no fallback.** With a key but no salt, `initializePostHog()`
  throws and the process does not start. Do not reintroduce a default: a predictably-salted digest over
  the small Telegram id space is reversible by brute force.
- **`TelemetryActor` has three kinds** — a user id (hashed to `u_…`), `"deployment"` for events about the
  process itself, and `"anonymous"`, which sends no distinct id so PostHog creates no Person. Never
  invent a stand-in identity for anonymous channel posts: their channel already travels in
  `channel_id` / `channel_title` / `$groups.channel`.
- Both teardown paths in [src/index.ts](src/index.ts) must call `closePostHog()`: `gracefulShutdown`
  and the `bot.start().catch()` handler.

## Code Style

Comment only what the code cannot say itself: workarounds, non-obvious business logic, tricky
algorithms, security or performance considerations. Do not add comments that restate the next line
(`// Initialize Sentry` above `initializeSentry();`).

## Deployment

See the `deploy-docker` skill for the Docker volume requirement that persists the SQLite database.
