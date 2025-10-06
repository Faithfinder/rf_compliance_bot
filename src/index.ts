import { bot, setBotCommands } from "./config/bot";
import { initializeSentry, closeSentry } from "./config/sentry";
import { createSessionMiddleware } from "./config/session";
import { initializeDatabase, closeDatabase } from "./db/database";
import { commandDefinitions } from "./commands/definitions";
import { registerNotificationUserSelectionHandler } from "./commands/notifications";
import { registerMessageHandler } from "./handlers/message";
import { registerErrorHandler } from "./handlers/error";

initializeSentry();
initializeDatabase();
bot.use(createSessionMiddleware());
await setBotCommands();

const registeredFunctions = new Set<() => void>();
for (const cmd of commandDefinitions) {
    if (!cmd.available || cmd.available()) {
        if (!registeredFunctions.has(cmd.register)) {
            cmd.register();
            registeredFunctions.add(cmd.register);
        }
    }
}

registerMessageHandler();
registerNotificationUserSelectionHandler();
registerErrorHandler();

const gracefulShutdown = async (signal: string) => {
    console.warn(`\nReceived ${signal}, shutting down gracefully...`);
    await bot.stop();
    console.warn("Bot stopped.");
    closeDatabase();
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
