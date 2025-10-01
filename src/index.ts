import * as Sentry from "@sentry/bun";
import { Bot } from "grammy";
import { getUserChannel, setUserChannel, removeUserChannel } from "./storage";
import { resolveChannel, formatChannelInfo } from "./utils";

// Initialize Sentry
const SENTRY_DSN = process.env.SENTRY_DSN;
if (SENTRY_DSN) {
    Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || "development",
        tracesSampleRate: 1.0, // Adjust for production (e.g., 0.1 for 10% sampling)
    });
    console.warn("Sentry initialized");
} else {
    console.warn("Sentry DSN not provided, error tracking disabled");
}

// Load environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("Error: TELEGRAM_BOT_TOKEN is not set in environment variables");
    process.exit(1);
}

// Create bot instance
const bot = new Bot(BOT_TOKEN);

// Command handlers
bot.command("start", (ctx) => {
    const welcomeMessage = `
Welcome to the RF Compliance Bot! 👋

I can help you with RF compliance information and regulations.

Use /help to see available commands.
  `.trim();

    return ctx.reply(welcomeMessage);
});

bot.command("help", (ctx) => {
    const helpMessage = `
Available commands:

/start - Start the bot and see welcome message
/help - Show this help message
/setchannel <@channel or ID> - Configure channel to post your messages to
/channelstatus - Show your current channel configuration
/removechannel - Remove your channel configuration

Example: /setchannel @mychannel
  `.trim();

    return ctx.reply(helpMessage);
});

bot.command("setchannel", async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId) {
        return ctx.reply("Unable to identify user.");
    }

    // Get the channel identifier from the command
    const args = ctx.match;
    if (!args || typeof args !== "string" || args.trim() === "") {
        return ctx.reply(
            "Please provide a channel identifier.\n\nUsage: /setchannel <@channel or ID>\nExample: /setchannel @mychannel",
        );
    }

    const channelIdentifier = args.trim();

    // Show a "working" message
    const workingMsg = await ctx.reply("Resolving channel...");

    // Try to resolve the channel
    const channelInfo = await resolveChannel(ctx.api, channelIdentifier);

    if (!channelInfo) {
        return ctx.api.editMessageText(
            ctx.chat.id,
            workingMsg.message_id,
            "Unable to find or access that channel. Please make sure:\n" +
                "1. The channel identifier is correct (@channel or numeric ID)\n" +
                "2. The bot has been added to the channel as an administrator (or at least has posting permissions)\n" +
                "3. The channel exists and is accessible",
        );
    }

    // Test if bot has permission to write to the channel
    await ctx.api.editMessageText(ctx.chat.id, workingMsg.message_id, "Checking bot permissions...");

    try {
        // Try to send a test message to verify write permissions
        const testMsg = await ctx.api.sendMessage(channelInfo.id, "🤖 Testing bot permissions...");
        // If successful, delete the test message
        await ctx.api.deleteMessage(channelInfo.id, testMsg.message_id);
    } catch (error) {
        console.error("Permission check failed:", error);
        return ctx.api.editMessageText(
            ctx.chat.id,
            workingMsg.message_id,
            "❌ Bot does not have permission to post to this channel.\n\n" +
                "Please make sure the bot:\n" +
                "1. Has been added to the channel\n" +
                "2. Has permission to post messages\n" +
                "3. Is not restricted by the channel's settings",
        );
    }

    // Save the channel configuration
    await setUserChannel(userId, channelInfo.id, channelInfo.title);

    return ctx.api.editMessageText(
        ctx.chat.id,
        workingMsg.message_id,
        `✅ Channel configured successfully!\n\n` +
            `Your messages will now be posted to: ${formatChannelInfo(channelInfo.id, channelInfo.title)}\n\n` +
            `Send me any message to test it out.`,
    );
});

bot.command("channelstatus", async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId) {
        return ctx.reply("Unable to identify user.");
    }

    const channelConfig = await getUserChannel(userId);

    if (!channelConfig) {
        return ctx.reply(
            "You have not configured a channel yet.\n\n" +
                "Use /setchannel <@channel or ID> to configure one.\n" +
                "Example: /setchannel @mychannel",
        );
    }

    return ctx.reply(
        `Your current channel configuration:\n\n` +
            `📢 ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n` +
            `All your messages will be posted to this channel.\n` +
            `Use /removechannel to remove this configuration.`,
    );
});

bot.command("removechannel", async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId) {
        return ctx.reply("Unable to identify user.");
    }

    const removed = await removeUserChannel(userId);

    if (!removed) {
        return ctx.reply("You do not have a channel configured.");
    }

    return ctx.reply(
        "✅ Channel configuration removed successfully.\n\nYour messages will no longer be posted to any channel.",
    );
});

// Handle all other messages
bot.on("message", async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId) {
        return ctx.reply("Unable to identify user.");
    }

    // Get the user's channel configuration
    const channelConfig = await getUserChannel(userId);

    if (!channelConfig) {
        return ctx.reply(
            "You have not configured a channel yet.\n\n" +
                "Use /setchannel <@channel or ID> to configure one.\n" +
                "Example: /setchannel @mychannel",
        );
    }

    // Try to copy the message to the configured channel
    try {
        await ctx.api.copyMessage(channelConfig.channelId, ctx.chat.id, ctx.message.message_id);

        // Confirm to the user
        return ctx.reply(
            `✅ Message posted to ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}`,
        );
    } catch (error) {
        console.error("Error posting to channel:", error);

        // Send error to Sentry
        if (SENTRY_DSN) {
            Sentry.withScope((scope) => {
                scope.setContext("channel_post", {
                    user_id: userId,
                    channel_id: channelConfig.channelId,
                    channel_title: channelConfig.channelTitle,
                });
                scope.setTag("error_type", "channel_post_failed");
                Sentry.captureException(error);
            });
        }

        return ctx.reply(
            "❌ Failed to post message to channel. Please make sure:\n" +
                "1. The bot is still in the channel\n" +
                "2. The bot has posting permissions\n" +
                "3. The channel still exists\n\n" +
                "You can try reconfiguring with /setchannel or remove the configuration with /removechannel",
        );
    }
});

// Error handling
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    console.error("Error:", err.error);

    // Send error to Sentry with context
    if (SENTRY_DSN) {
        Sentry.withScope((scope) => {
            scope.setContext("telegram_update", {
                update_id: ctx.update.update_id,
                user_id: ctx.from?.id,
                username: ctx.from?.username,
                chat_id: ctx.chat?.id,
                message_text: ctx.message?.text,
            });
            scope.setTag("bot", "telegram");
            Sentry.captureException(err.error);
        });
    }
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
    console.warn(`\nReceived ${signal}, shutting down gracefully...`);
    await bot.stop();
    console.warn("Bot stopped.");

    // Flush Sentry events before exit
    if (SENTRY_DSN) {
        console.warn("Flushing Sentry events...");
        await Sentry.close(2000); // 2 second timeout
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
