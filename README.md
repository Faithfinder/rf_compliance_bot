# RF Compliance Bot

A Telegram bot built with TypeScript and Bun for RF compliance information and regulations.

## Prerequisites

- [Bun](https://bun.sh) v1.2.23 or higher
- A Telegram Bot Token (obtain from [@BotFather](https://t.me/botfather))

## Setup

1. **Clone the repository** (if applicable)

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Configure environment variables:**
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` and add your Telegram bot token:
     ```
     TELEGRAM_BOT_TOKEN=your_actual_bot_token_here
     ```

## Development

### Available Commands

- `bun run dev` - Start the bot in development mode with hot reload
- `bun run start` - Start the bot in production mode
- `bun run build` - Build the bot for production
- `bun run test` - Run tests
- `bun run test:coverage` - Run tests with coverage report
- `bun run lint` - Lint the code
- `bun run lint:fix` - Lint and auto-fix issues
- `bun run format` - Format code with Prettier
- `bun run format:check` - Check code formatting

### Project Structure

```
rf-compliance-bot/
├── src/              # Source code
│   └── index.ts      # Main bot file
├── tests/            # Test files
│   └── bot.test.ts   # Bot tests
├── .env.example      # Environment variables template
├── bunfig.toml       # Bun test configuration
├── tsconfig.json     # TypeScript configuration
├── eslint.config.js  # ESLint configuration
└── .prettierrc       # Prettier configuration
```

## Bot Commands

- `/start` - Start the bot and see welcome message
- `/help` - Show available commands
- `/set_fa_blurb` - Configure the foreign-agent disclosure for the current channel
- `/notify_add`, `/notify_remove`, `/notify_list` - Maintain the admins that receive moderation notifications

## Channel Moderation

- The bot listens to posts that appear directly in a configured channel. If the text or caption does not contain the configured foreign-agent blurb, the bot copies the offending message to the notification list, attempts to DM the author, and removes the post from the channel.
- Make sure the blurb is configured with `/set_fa_blurb` for every moderated channel; otherwise the compliance check is skipped.
- Grant the bot administrator rights with **Post Messages** and **Delete Messages** so it can remove non-compliant posts and deliver notifications.
- Use `/notify_add` to enlist channel administrators who should be notified when a message is rejected. The bot will exclude the posting user from the fan-out to avoid duplicate notifications.
- Telegram only includes the author ID for certain channel posts. When that identifier is unavailable, the bot still removes the message and notifies the subscribed administrators.

## Testing

Run tests with:
```bash
bun test
```

Run tests with coverage:
```bash
bun run test:coverage
```

## Deployment

1. Build the bot:
   ```bash
   bun run build
   ```

2. Set your production environment variables

3. Run the bot:
   ```bash
   bun run start
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from BotFather | Yes |
| `NODE_ENV` | Environment (development/production) | No |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project was created using `bun init` in Bun v1.2.23.
