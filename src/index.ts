import { createBot } from "./config/bot";
import { initializeSentry, closeSentry } from "./config/sentry";
import { registerStartCommand } from "./commands/start";
import { registerHelpCommand } from "./commands/help";
import { registerChannelCommands } from "./commands/channel";
import { registerMessageHandler } from "./handlers/message";
import { registerErrorHandler } from "./handlers/error";

// Initialize Sentry
const sentryEnabled = initializeSentry();

// Create bot instance
let bot;
try {
    bot = createBot();
} catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : "Failed to create bot"}`);
    process.exit(1);
}

// Register all commands and handlers
registerStartCommand(bot);
registerHelpCommand(bot);
registerChannelCommands(bot);
registerMessageHandler(bot, sentryEnabled);
registerErrorHandler(bot, sentryEnabled);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
    console.warn(`\nReceived ${signal}, shutting down gracefully...`);
    await bot.stop();
    console.warn("Bot stopped.");

    // Flush Sentry events before exit
    if (sentryEnabled) {
        await closeSentry();
    }

    process.exit(0);
};

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Start the bot
console.warn("Starting bot...");
bot.start({
    onStart: (botInfo) => {
        console.warn(`Bot @${botInfo.username} is running!`);
    },
});
