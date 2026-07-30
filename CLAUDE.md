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
