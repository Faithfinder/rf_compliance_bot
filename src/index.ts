import * as Sentry from "@sentry/bun";
import { bot, setBotCommands } from "./config/bot";
import { initializeSentry, closeSentry } from "./config/sentry";
import { createSessionMiddleware } from "./config/session";
import { initializeDatabase, closeDatabase } from "./db/database";
import { commandDefinitions } from "./commands/definitions";
import { registerNotificationUserSelectionHandler } from "./commands/notifications";
import { registerDumpDbCommand } from "./commands/dump_db";
import { registerMessageHandler } from "./handlers/message";
import { registerErrorHandler } from "./handlers/error";

initializeSentry();
initializeDatabase();
// grammY keys sessions by chat id and always writes back, because `initial()` returns a
// value. Registering this globally persisted a row for every moderated channel on every
// post, even though only the command and publishing flows below ever read a session.
bot.chatType(["private", "group", "supergroup"]).use(createSessionMiddleware());
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

registerDumpDbCommand();
registerNotificationUserSelectionHandler();
registerMessageHandler();
registerErrorHandler();

let shuttingDown = false;

const gracefulShutdown = async (signal: string) => {
    shuttingDown = true;
    console.warn(`\nReceived ${signal}, shutting down gracefully...`);

    // An in-flight getUpdates that fails while stopping rejects here. Teardown still has to
    // run, otherwise the database is left unclosed and pending Sentry events are dropped.
    try {
        await bot.stop();
        console.warn("Bot stopped.");
    } catch (error) {
        console.error("Error while stopping the bot:", error);
    }

    closeDatabase();
    await closeSentry();

    process.exit(0);
};

process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));

console.warn("Starting bot...");
bot.start({
    onStart: (botInfo) => {
        console.warn(`Bot @${botInfo.username} is running!`);
    },
}).catch(async (error) => {
    // bot.stop() aborts the retry delay, so a deliberate shutdown rejects here too. Let
    // gracefulShutdown finish its own teardown instead of reporting a crash and racing it.
    if (shuttingDown) {
        return;
    }

    console.error("Bot polling stopped with an error:", error);
    Sentry.captureException(error);
    await closeSentry();
    closeDatabase();
    process.exit(1);
});
