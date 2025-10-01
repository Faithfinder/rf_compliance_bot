# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram bot for RF compliance information built with TypeScript, Bun runtime, and the grammY framework. The bot is currently in early development with basic command handling.

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

- **Single-file bot**: [src/index.ts](src/index.ts) contains the entire bot implementation (initialization, commands, error handling, graceful shutdown)
- **grammY framework**: Uses `grammy` package for Telegram Bot API integration
- **Command handlers**: Defined inline using `bot.command()` pattern
- **Error handling**: Global error handler via `bot.catch()` and graceful shutdown on SIGINT/SIGTERM

### Environment Configuration

- Bot token loaded from `TELEGRAM_BOT_TOKEN` environment variable (required)
- Use `.env` file for local development (copy from `.env.example`)
- Bot exits with error if token is not provided

### Testing

- Uses Bun's built-in test runner (`bun:test`)
- Test files: `**/*.test.ts` or `**/*.spec.ts` patterns
- Coverage configured in [bunfig.toml](bunfig.toml) to output text and lcov formats
- Current tests are placeholder examples in [tests/bot.test.ts](tests/bot.test.ts)

## Code Style

- **TypeScript**: Strict mode enabled, ESNext target
- **Module system**: ESM (module: "Preserve", verbatimModuleSyntax: true)
- **Linting**: ESLint with TypeScript plugin
  - Unused vars with `_` prefix are allowed
  - `any` types trigger warnings
  - console.warn and console.error are allowed
- **Formatting**: Prettier for consistent code style

## Development Notes

- The bot currently only handles `/start` and `/help` commands
- All other messages receive a generic response via the catch-all `bot.on('message')` handler
- Future expansion should maintain the modular command handler pattern
- When adding new features, ensure proper TypeScript types are maintained (strict mode is enabled)
