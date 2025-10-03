# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram bot for RF compliance information built with TypeScript, Bun runtime, and the grammY framework. The bot supports channel posting and user-specific channel configuration with persistent storage.

**Language**: This is a Russian-language bot. All user-facing messages, commands, and responses must be in Russian.

## Runtime & Package Management

- **Runtime**: Bun (not Node.js) - use `bun` commands for all operations
- **Package Manager**: Bun (`bun install`, `bun add`, `bun remove`)
- **Development**: Hot reload is available via `bun --watch`

## Common Commands

```bash
# Development & Running
bun run dev                  # Development mode with hot reload
bun run start                # Production mode

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

- **Entry point**: [src/index.ts](src/index.ts) - initializes Sentry and database, installs session middleware, registers all commands/handlers, and starts the bot with graceful shutdown handling
- **Configuration**: [src/config/](src/config/) - bot instance (`bot.ts`), session configuration (`session.ts`), and Sentry initialization (`sentry.ts`)
- **Database**: [src/db/](src/db/) - SQLite database for shared channel settings
  - `database.ts` - Database initialization and CRUD operations
- **Commands**: [src/commands/](src/commands/) - command handlers registered via functions
  - `start.ts` - Welcome message
  - `help.ts` - Help command
  - `info.ts` - Show bot configuration and channel settings
  - `channel.ts` - Channel management (`/setchannel`, `/channelstatus`, `/removechannel`)
  - `settings.ts` - Channel settings management (`/settings`)
- **Handlers**: [src/handlers/](src/handlers/) - generic message handling and error handling
- **Utilities**: [src/utils.ts](src/utils.ts) - channel resolution and formatting utilities

### Key Patterns

- **Singleton bot instance**: [src/config/bot.ts](src/config/bot.ts) exports a single `bot` instance with session context type used throughout the app
  - **IMPORTANT**: The bot instance should NEVER be passed as a parameter to functions. Always import it directly from `src/config/bot.ts` where needed.
  - Access the bot API via `bot.api` when needed (e.g., `bot.api.getChat()`, `bot.api.sendMessage()`)
- **Session middleware**: Uses grammY's session plugin with FileAdapter for per-user state in `data/sessions.json`
- **SQLite database**: Uses Bun's built-in SQLite for shared channel settings in `data/channels.db`
- **Registration functions**: All commands and handlers are registered via `register*()` functions called from [src/index.ts](src/index.ts)
- **Error handling**: Global error handler in [src/handlers/error.ts](src/handlers/error.ts) captures all bot errors and reports to Sentry with context
- **Graceful shutdown**: SIGINT/SIGTERM handlers ensure the bot stops cleanly, closes database connection, and flushes Sentry events

### Environment Configuration

- `TELEGRAM_BOT_TOKEN` (required) - Bot token from @BotFather
- `SENTRY_DSN` (optional) - Sentry DSN for error tracking
- `NODE_ENV` (optional) - Environment name (development/production)
- Use `.env` file for local development (copy from `.env.example`)

### Docker Deployment

When deploying with Docker, ensure the `/app/data` directory is mounted as a volume to persist the SQLite database across container restarts:

```bash
# Using docker run
docker run -v ./data:/app/data -e TELEGRAM_BOT_TOKEN=your_token your_image

# Using docker-compose
services:
  bot:
    image: your_image
    volumes:
      - ./data:/app/data
    environment:
      - TELEGRAM_BOT_TOKEN=your_token
```

The database file `channels.db` will be stored in the mounted volume.

### Storage System

The bot uses a unified SQLite database for all storage:

**1. Session Storage (Per-User State)**
- Uses grammY's session plugin with custom `SqliteSessionStorage` adapter ([src/db/session-storage.ts](src/db/session-storage.ts))
- Stores user-specific data in `sessions` table in `data/channels.db`
- Session structure:
  - `channelConfig?: { channelId: string; channelTitle?: string }` - User's configured channel
  - `awaitingChannelSelection?: boolean` - UI state flag
- Accessed via `ctx.session` in all handlers
- Automatically persisted after each update via the custom storage adapter

**2. SQLite Database (Shared Channel Settings)**
- Uses Bun's built-in SQLite ([src/db/database.ts](src/db/database.ts))
- Single database at `data/channels.db` contains two tables:
  - `channel_settings` table:
    - `channel_id` (TEXT PRIMARY KEY) - Telegram channel ID
    - `settings` (TEXT) - JSON blob containing all settings (flexible schema)
    - `created_at` (INTEGER) - Timestamp
    - `updated_at` (INTEGER) - Timestamp
  - `sessions` table:
    - `user_id` (TEXT PRIMARY KEY) - Telegram user ID
    - `data` (TEXT) - JSON blob containing session data
    - `updated_at` (INTEGER) - Timestamp
- Settings structure defined via TypeScript interface `ChannelSettingsData`:
  - `foreignAgentBlurb?: string` - Custom foreign agent disclaimer text
  - Additional settings can be easily added to the interface
- Uses JSON storage for maximum flexibility - new settings can be added without schema migrations
- Shared settings accessible to all users of the same channel
- Only channel administrators can modify settings via `/settings` command
- Database functions:
  - `getChannelSettings(channelId)` - Retrieve settings for a channel
  - `updateChannelSettings(channelId, settings)` - Update/merge settings (partial updates supported)
  - `deleteChannelSettings(channelId)` - Remove all settings for a channel

### Testing

- Uses Bun's built-in test runner (`bun:test`)
- Test files: `**/*.test.ts` or `**/*.spec.ts` patterns
- Coverage configured in [bunfig.toml](bunfig.toml) to output text and lcov formats
- Current tests:
  - [tests/bot.test.ts](tests/bot.test.ts) - Utility functions
  - [tests/db.test.ts](tests/db.test.ts) - Database CRUD operations for channel settings
  - [tests/session-storage.test.ts](tests/session-storage.test.ts) - Session storage adapter operations

## Code Style

- **TypeScript**: Strict mode enabled, ESNext target
- **Module system**: ESM (module: "Preserve", verbatimModuleSyntax: true)
- **Linting**: ESLint with TypeScript plugin
  - Unused vars with `_` prefix are allowed
  - `any` types trigger warnings
  - console.warn and console.error are allowed
- **Formatting**: Prettier for consistent code style
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

## Development Notes

- When adding new commands, create a `register*Command()` function in [src/commands/](src/commands/) and call it from [src/index.ts](src/index.ts)
- Session data is accessed via `ctx.session` in all command and message handlers (per-user state)
- Channel settings are accessed via database functions from [src/db/database.ts](src/db/database.ts) (shared state)
- Key utility functions in [src/utils.ts](src/utils.ts):
  - `resolveChannel(identifier)` - Validates channel access and type (channel/supergroup only)
  - `checkUserChannelPermissions(channelId, userId)` - Verifies user's admin status and permissions
  - `checkChannelRequirements(channelId)` - Checks if channel meets all bot requirements (exists, bot added, bot can post, settings configured)
  - `formatChannelInfo()`, `formatChannelRequirements()`, `allRequirementsPassed()` - Display formatting utilities
- All bot errors are automatically captured by Sentry with Telegram context (update_id, user_id, chat_id, message_text)
- Database is initialized on startup and closed during graceful shutdown
- Both session and channel settings storage use the same SQLite database instance
