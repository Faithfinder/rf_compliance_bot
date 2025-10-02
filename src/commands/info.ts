import { bot } from "../config/bot";
import {
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    checkUserChannelPermissions,
} from "../utils";
import { getChannelSettings } from "../db/database";

export function registerInfoCommand(): void {
    bot.command("info", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId || !ctx.from) {
            return ctx.reply("Unable to identify user.");
        }

        const channelConfig = ctx.session.channelConfig;

        let infoMessage = "🤖 *Bot Configuration*\n\n";
        infoMessage += `👤 *User:* ${ctx.from.first_name}`;
        if (ctx.from.username) {
            infoMessage += ` (@${ctx.from.username})`;
        }
        infoMessage += `\n📱 *User ID:* \`${userId}\`\n\n`;

        if (channelConfig) {
            infoMessage += `📢 *Configured Channel:*\n`;
            infoMessage += `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;

            const requirements = await checkChannelRequirements(channelConfig.channelId);

            infoMessage += `📋 *Requirements:*\n`;
            infoMessage += `${formatChannelRequirements(requirements)}\n\n`;

            const channelSettings = getChannelSettings(channelConfig.channelId);

            if (channelSettings?.foreignAgentBlurb) {
                infoMessage += `⚙️ *Channel Settings:*\n`;
                infoMessage += `🌍 Foreign Agent Blurb: ${channelSettings.foreignAgentBlurb}\n\n`;
            }

            const userPermissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

            if (userPermissions) {
                infoMessage += `👤 *Your Permissions:*\n`;

                if (userPermissions.isMember) {
                    infoMessage += `✅ Member of the channel\n`;
                } else {
                    infoMessage += `❌ Not a member of the channel\n`;
                }

                if (userPermissions.isAdmin) {
                    infoMessage += `✅ Administrator\n`;
                    if (userPermissions.canPostMessages) infoMessage += `✅ Can post messages\n`;
                    if (userPermissions.canEditMessages) infoMessage += `✅ Can edit messages\n`;
                    if (userPermissions.canDeleteMessages) infoMessage += `✅ Can delete messages\n`;
                    if (userPermissions.canManageChat) infoMessage += `✅ Can manage chat\n`;
                    if (userPermissions.canInviteUsers) infoMessage += `✅ Can invite users\n`;
                    if (userPermissions.canPinMessages) infoMessage += `✅ Can pin messages\n`;
                    if (userPermissions.canManageTopics) infoMessage += `✅ Can manage topics\n`;
                } else {
                    infoMessage += `❌ Not an administrator\n`;
                }
                infoMessage += `\n`;
            }

            infoMessage += `Use /removechannel to remove this configuration`;
        } else {
            infoMessage += `📢 *Configured Channel:* None\n\n`;
            infoMessage += `❌ No channel configured\n`;
            infoMessage += `Use /setchannel to configure one`;
        }

        return ctx.reply(infoMessage, { parse_mode: "Markdown" });
    });
}
