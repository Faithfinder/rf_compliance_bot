# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram bot for RF compliance information built with TypeScript, Bun runtime, and the grammY framework. The bot supports channel posting and user-specific channel configuration with persistent storage.

## Runtime & Package Management

- **Runtime**: Bun (not Node.js) - use `bun` commands for all operations
- **Package Manager**: Bun (`bun install`, `bun add`, `bun remove`)
- **Development**: Hot reload is available via `bun --watch`

## Common Commands

```bash
# Development & Running
bun run dev                  # Development mode with hot reload
bun run start                # Production mode
bun run build                # Build for production (outputs to dist/)

# Testing
bun test                     # Run all tests
bun test path/to/file.test.ts  # Run specific test file
bun run test:coverage        # Run tests with coverage report

# Code Quality
bun run lint                 # Check for linting issues
bun run lint:fix             # Auto-fix linting issues
bun run format               # Format code with Prettier
bun run format:check         # Check formatting without modifying
```

## Architecture

### Bot Structure

The bot uses a modular architecture with separate concerns:

- **Entry point**: [src/index.ts](src/index.ts) - initializes Sentry, registers all commands/handlers, and starts the bot with graceful shutdown handling
- **Configuration**: [src/config/](src/config/) - bot instance (`bot.ts`) and Sentry initialization (`sentry.ts`)
- **Commands**: [src/commands/](src/commands/) - command handlers registered via functions
  - `start.ts` - Welcome message
  - `help.ts` - Help command
  - `channel.ts` - Channel management (`/setchannel`, `/channelstatus`, `/removechannel`)
- **Handlers**: [src/handlers/](src/handlers/) - generic message handling and error handling
- **Storage**: [src/storage.ts](src/storage.ts) - JSON-based persistent storage for user-channel mappings in `data/user-channels.json`
- **Utilities**: [src/utils.ts](src/utils.ts) - channel resolution and formatting utilities

### Key Patterns

- **Singleton bot instance**: [src/config/bot.ts](src/config/bot.ts) exports a single `bot` instance used throughout the app
- **Registration functions**: All commands and handlers are registered via `register*()` functions called from [src/index.ts](src/index.ts)
- **Error handling**: Global error handler in [src/handlers/error.ts](src/handlers/error.ts) captures all bot errors and reports to Sentry with context
- **Graceful shutdown**: SIGINT/SIGTERM handlers ensure the bot stops cleanly and flushes Sentry events

### Environment Configuration

- `TELEGRAM_BOT_TOKEN` (required) - Bot token from @BotFather
- `SENTRY_DSN` (optional) - Sentry DSN for error tracking
- `NODE_ENV` (optional) - Environment name (development/production)
- Use `.env` file for local development (copy from `.env.example`)

### Storage System

The bot uses a simple JSON-based storage system ([src/storage.ts](src/storage.ts)) that:
- Stores user-channel mappings in `data/user-channels.json`
- Creates the `data/` directory automatically if it doesn't exist
- Provides async functions: `getUserChannel()`, `setUserChannel()`, `removeUserChannel()`
- Stores channel ID and optional channel title per user

### Testing

- Uses Bun's built-in test runner (`bun:test`)
- Test files: `**/*.test.ts` or `**/*.spec.ts` patterns
- Coverage configured in [bunfig.toml](bunfig.toml) to output text and lcov formats
- Current tests in [tests/bot.test.ts](tests/bot.test.ts) cover storage operations and utility functions
- Tests clean up `data/user-channels.json` before/after each run

## Code Style

- **TypeScript**: Strict mode enabled, ESNext target
- **Module system**: ESM (module: "Preserve", verbatimModuleSyntax: true)
- **Linting**: ESLint with TypeScript plugin
  - Unused vars with `_` prefix are allowed
  - `any` types trigger warnings
  - console.warn and console.error are allowed
- **Formatting**: Prettier for consistent code style

## Development Notes

- When adding new commands, create a `register*Command()` function in [src/commands/](src/commands/) and call it from [src/index.ts](src/index.ts)
- The channel resolution logic ([src/utils.ts](src/utils.ts) `resolveChannel()`) validates channel access and type (channel/supergroup only)
- Permission checking for channels happens in [src/commands/channel.ts](src/commands/channel.ts) via `getChatMember()` to verify bot has posting permissions
- All bot errors are automatically captured by Sentry with Telegram context (update_id, user_id, chat_id, message_text)
