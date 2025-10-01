import { bot } from "../config/bot";
import { resolveChannel, formatChannelInfo } from "../utils";

/**
 * Registers all channel-related command handlers
 */
export function registerChannelCommands(): void {
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
            // Get bot's status in the channel to verify permissions
            const botMember = await ctx.api.getChatMember(channelInfo.id, ctx.me.id);

            // Check if bot is an administrator with post_messages permission
            if (botMember.status !== "administrator" && botMember.status !== "creator") {
                return ctx.api.editMessageText(
                    ctx.chat.id,
                    workingMsg.message_id,
                    "❌ Bot does not have permission to post to this channel.\n\n" +
                        "Please make sure the bot:\n" +
                        "1. Has been added to the channel\n" +
                        "2. Is an administrator with permission to post messages\n" +
                        "3. Is not restricted by the channel's settings",
                );
            }

            // For administrators, check if they have post_messages permission (if it's set)
            if (botMember.status === "administrator" && botMember.can_post_messages !== true) {
                return ctx.api.editMessageText(
                    ctx.chat.id,
                    workingMsg.message_id,
                    "❌ Bot is an administrator but doesn't have permission to post messages.\n\n" +
                        "Please grant the bot 'Post Messages' permission in the channel settings.",
                );
            }
        } catch (error) {
            console.error("Permission check failed:", error);
            return ctx.api.editMessageText(
                ctx.chat.id,
                workingMsg.message_id,
                "❌ Unable to check bot permissions for this channel.\n\n" +
                    "Please make sure the bot:\n" +
                    "1. Has been added to the channel\n" +
                    "2. Is an administrator with permission to post messages\n" +
                    "3. The channel exists and is accessible",
            );
        }

        // Save the channel configuration
        ctx.session.channelConfig = {
            channelId: channelInfo.id,
            channelTitle: channelInfo.title,
        };

        return ctx.api.editMessageText(
            ctx.chat.id,
            workingMsg.message_id,
            `✅ Channel configured successfully!\n\n` +
                `Your messages will now be posted to: ${formatChannelInfo(channelInfo.id, channelInfo.title)}\n\n` +
                `Send me any message to test it out.`,
        );
    });

    // /removechannel command - Remove channel configuration
    bot.command("removechannel", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Unable to identify user.");
        }

        if (!ctx.session.channelConfig) {
            return ctx.reply("You do not have a channel configured.");
        }

        delete ctx.session.channelConfig;

        return ctx.reply(
            "✅ Channel configuration removed successfully.\n\nYour messages will no longer be posted to any channel.",
        );
    });
}
