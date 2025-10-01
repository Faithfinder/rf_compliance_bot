import { bot } from "./config/bot";
import { initializeSentry, closeSentry } from "./config/sentry";
import { registerStartCommand } from "./commands/start";
import { registerHelpCommand } from "./commands/help";
import { registerChannelCommands } from "./commands/channel";
import { registerMessageHandler } from "./handlers/message";
import { registerErrorHandler } from "./handlers/error";

// Initialize Sentry
initializeSentry();

// Register all commands and handlers
registerStartCommand();
registerHelpCommand();
registerChannelCommands();
registerMessageHandler();
registerErrorHandler();

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
    console.warn(`\nReceived ${signal}, shutting down gracefully...`);
    await bot.stop();
    console.warn("Bot stopped.");

    // Flush Sentry events before exit
    await closeSentry();

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
