import * as Sentry from "@sentry/bun";
import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import {
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
} from "../utils";

export function registerMessageHandler(): void {
    bot.on("message", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Unable to identify user.");
        }

        const channelConfig = ctx.session.channelConfig;

        if (!channelConfig) {
            return ctx.reply(
                "You have not configured a channel yet.\n\n" +
                    "Use /setchannel <@channel or ID> to configure one.\n" +
                    "Example: /setchannel @mychannel",
            );
        }

        try {
            await ctx.api.copyMessage(channelConfig.channelId, ctx.chat.id, ctx.message.message_id);

            return ctx.reply(
                `✅ Message posted to ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}`,
            );
        } catch (error) {
            console.error("Error posting to channel:", error);

            Sentry.withScope((scope) => {
                scope.setContext("channel_post", {
                    user_id: userId,
                    channel_id: channelConfig.channelId,
                    channel_title: channelConfig.channelTitle,
                });
                scope.setTag("error_type", "channel_post_failed");
                Sentry.captureException(error);
            });

            const requirements = await checkChannelRequirements(channelConfig.channelId);

            let errorMessage = `❌ Failed to post message to ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            errorMessage += `📋 Requirements:\n${formatChannelRequirements(requirements)}\n\n`;

            if (!requirements.channelExists) {
                errorMessage +=
                    "**Next step:** The channel no longer exists or the bot cannot access it. Please select a different channel.";

                const keyboard = new Keyboard()
                    .requestChat("Select Another Channel", 1, {
                        chat_is_channel: true,
                        bot_is_member: true,
                    })
                    .text("/removechannel")
                    .resized()
                    .oneTime();

                ctx.session.awaitingChannelSelection = true;
                return ctx.reply(errorMessage, { reply_markup: keyboard });
            } else if (!requirements.botIsAdded) {
                errorMessage +=
                    "**Next step:** Ask your channel administrator to add this bot as an administrator to the channel.";
            } else if (!requirements.botCanPost) {
                errorMessage +=
                    '**Next step:** Ask your channel administrator to grant the bot "Post Messages" permission.';
            }

            errorMessage += "\n\nAlternatively, use /setchannel to configure a different channel";

            return ctx.reply(errorMessage);
        }
    });
}
