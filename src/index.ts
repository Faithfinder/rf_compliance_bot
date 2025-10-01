import * as Sentry from '@sentry/bun';
import { Bot } from 'grammy';

// Initialize Sentry
const SENTRY_DSN = process.env.SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0, // Adjust for production (e.g., 0.1 for 10% sampling)
  });
  console.warn('Sentry initialized');
} else {
  console.warn('Sentry DSN not provided, error tracking disabled');
}

// Load environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

// Create bot instance
const bot = new Bot(BOT_TOKEN);

// Command handlers
bot.command('start', (ctx) => {
  const welcomeMessage = `
Welcome to the RF Compliance Bot! 👋

I can help you with RF compliance information and regulations.

Use /help to see available commands.
  `.trim();

  return ctx.reply(welcomeMessage);
});

bot.command('help', (ctx) => {
  const helpMessage = `
Available commands:

/start - Start the bot and see welcome message
/help - Show this help message

More features coming soon!
  `.trim();

  return ctx.reply(helpMessage);
});

// Handle all other messages
bot.on('message', (ctx) => {
  return ctx.reply('I received your message! Use /help to see available commands.');
});

// Error handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error('Error:', err.error);

  // Send error to Sentry with context
  if (SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setContext('telegram_update', {
        update_id: ctx.update.update_id,
        user_id: ctx.from?.id,
        username: ctx.from?.username,
        chat_id: ctx.chat?.id,
        message_text: ctx.message?.text,
      });
      scope.setTag('bot', 'telegram');
      Sentry.captureException(err.error);
    });
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.warn(`\nReceived ${signal}, shutting down gracefully...`);
  await bot.stop();
  console.warn('Bot stopped.');

  // Flush Sentry events before exit
  if (SENTRY_DSN) {
    console.warn('Flushing Sentry events...');
    await Sentry.close(2000); // 2 second timeout
  }

  process.exit(0);
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the bot
console.warn('Starting bot...');
bot.start({
  onStart: (botInfo) => {
    console.warn(`Bot @${botInfo.username} is running!`);
  },
});
