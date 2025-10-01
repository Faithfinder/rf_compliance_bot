import { Bot, Context } from "grammy";
import { getUserChannel, setUserChannel, removeUserChannel } from "../storage";
import { resolveChannel, formatChannelInfo } from "../utils";

/**
 * Registers all channel-related command handlers
 */
export function registerChannelCommands(bot: Bot<Context>): void {
    // /setchannel command - Configure channel for user
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

    // /channelstatus command - Show current channel configuration
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

    // /removechannel command - Remove channel configuration
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
}
