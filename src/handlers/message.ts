import * as Sentry from "@sentry/bun";
import { bot } from "../config/bot";
import { formatChannelInfo } from "../utils";

/**
 * Registers the message handler for forwarding messages to configured channels
 */
export function registerMessageHandler(): void {
    bot.on("message", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Unable to identify user.");
        }

        // Get the user's channel configuration
        const channelConfig = ctx.session.channelConfig;

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
            Sentry.withScope((scope) => {
                scope.setContext("channel_post", {
                    user_id: userId,
                    channel_id: channelConfig.channelId,
                    channel_title: channelConfig.channelTitle,
                });
                scope.setTag("error_type", "channel_post_failed");
                Sentry.captureException(error);
            });

            return ctx.reply(
                "❌ Failed to post message to channel. Please make sure:\n" +
                    "1. The bot is still in the channel\n" +
                    "2. The bot has posting permissions\n" +
                    "3. The channel still exists\n\n" +
                    "You can try reconfiguring with /setchannel or remove the configuration with /removechannel",
            );
        }
    });
}
