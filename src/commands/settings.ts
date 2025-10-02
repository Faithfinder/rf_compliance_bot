import { bot } from "../config/bot";
import { getChannelSettings, updateChannelSettings } from "../db/database";
import { checkUserChannelPermissions, formatChannelInfo } from "../utils";

export function registerSettingsCommand(): void {
    bot.command("settings", async (ctx) => {
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

        const args = ctx.match;
        const isViewMode = !args || typeof args !== "string" || args.trim() === "";

        if (isViewMode) {
            const channelSettings = getChannelSettings(channelConfig.channelId);

            let message = `⚙️ *Channel Settings*\n\n`;
            message += `📢 *Channel:* ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            message += `🌍 *Foreign Agent Blurb:*\n`;

            if (channelSettings?.foreignAgentBlurb) {
                message += `${channelSettings.foreignAgentBlurb}\n\n`;
            } else {
                message += `_Not configured_\n\n`;
            }

            message += `To update the foreign agent blurb, use:\n`;
            message += `/settings <your text here>`;

            return ctx.reply(message, { parse_mode: "Markdown" });
        }

        const permissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

        if (!permissions?.canManageChat) {
            return ctx.reply(
                "❌ You must be an administrator of the configured channel to modify settings.\n\n" +
                    "Only channel administrators can update shared channel settings.",
            );
        }

        const newBlurb = (args as string).trim();

        if (newBlurb.length === 0) {
            return ctx.reply("❌ Foreign agent blurb cannot be empty. Please provide some text.");
        }

        updateChannelSettings(channelConfig.channelId, { foreignAgentBlurb: newBlurb });

        let confirmMessage = `✅ Foreign agent blurb updated successfully!\n\n`;
        confirmMessage += `📢 *Channel:* ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
        confirmMessage += `🌍 *New Foreign Agent Blurb:*\n${newBlurb}`;

        return ctx.reply(confirmMessage, { parse_mode: "Markdown" });
    });
}
