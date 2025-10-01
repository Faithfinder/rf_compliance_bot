import { bot } from "./config/bot";
import { initializeSentry, closeSentry } from "./config/sentry";
import { createSessionMiddleware } from "./config/session";
import { registerStartCommand } from "./commands/start";
import { registerHelpCommand } from "./commands/help";
import { registerInfoCommand } from "./commands/info";
import { registerChannelCommands } from "./commands/channel";
import { registerMessageHandler } from "./handlers/message";
import { registerErrorHandler } from "./handlers/error";

initializeSentry();
bot.use(createSessionMiddleware());

registerStartCommand();
registerHelpCommand();
registerInfoCommand();
registerChannelCommands();
registerMessageHandler();
registerErrorHandler();

const gracefulShutdown = async (signal: string) => {
    console.warn(`\nReceived ${signal}, shutting down gracefully...`);
    await bot.stop();
    console.warn("Bot stopped.");
    await closeSentry();

    process.exit(0);
};

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

console.warn("Starting bot...");
bot.start({
    onStart: (botInfo) => {
        console.warn(`Bot @${botInfo.username} is running!`);
    },
});
