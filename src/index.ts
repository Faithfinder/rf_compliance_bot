import * as Sentry from "@sentry/bun";
import { bot, setBotCommands } from "./config/bot";
import { initializeSentry, closeSentry } from "./config/sentry";
import { initializePostHog, closePostHog } from "./config/posthog";
import { createSessionMiddleware } from "./config/session";
import { getBotOwnerId, isFixedChannelMode } from "./config/environment";
import { initializeDatabase, closeDatabase } from "./db/database";
import { commandDefinitions } from "./commands/definitions";
import { registerNotificationUserSelectionHandler } from "./commands/notifications";
import { registerDumpDbCommand } from "./commands/dump_db";
import { registerMessageHandler } from "./handlers/message";
import { registerErrorHandler } from "./handlers/error";
import { registerCommandTelemetry } from "./telemetry/commands";
import { captureEvent } from "./telemetry/events";

initializeSentry();
initializePostHog();
initializeDatabase();
// grammY keys sessions by chat id and always writes back, because `initial()` returns a
// value. Registering this globally persisted a row for every moderated channel on every
// post, even though only the command and publishing flows below ever read a session.
bot.chatType(["private", "group", "supergroup"]).use(createSessionMiddleware());
// Runs after the session middleware because it reports whether a channel is configured, and
// before the command handlers because grammY runs middleware in registration order.
registerCommandTelemetry();
await setBotCommands();

const availableCommands = commandDefinitions.filter((cmd) => !cmd.available || cmd.available());

const registeredFunctions = new Set<() => void>();
for (const cmd of availableCommands) {
    if (!registeredFunctions.has(cmd.register)) {
        cmd.register();
        registeredFunctions.add(cmd.register);
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
    await closePostHog();

    process.exit(0);
};

process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));

console.warn("Starting bot...");
bot.start({
    onStart: (botInfo) => {
        console.warn(`Bot @${botInfo.username} is running!`);

        // Reported from onStart rather than at module scope so it records that polling actually
        // established, not merely that the process booted.
        captureEvent("bot_started", null, {
            environment: process.env.NODE_ENV || "development",
            fixedChannelMode: isFixedChannelMode(),
            ownerCommandsEnabled: getBotOwnerId() !== null,
            commandCount: availableCommands.length,
        });
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
    await closePostHog();
    closeDatabase();
    process.exit(1);
});
