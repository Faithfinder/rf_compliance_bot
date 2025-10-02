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
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        const channelConfig = ctx.session.channelConfig;

        let infoMessage = "🤖 *Конфигурация бота*\n\n";
        infoMessage += `👤 *Пользователь:* ${ctx.from.first_name}`;
        if (ctx.from.username) {
            infoMessage += ` (@${ctx.from.username})`;
        }
        infoMessage += `\n📱 *ID пользователя:* \`${userId}\`\n\n`;

        if (channelConfig) {
            infoMessage += `📢 *Настроенный канал:*\n`;
            infoMessage += `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;

            const requirements = await checkChannelRequirements(channelConfig.channelId);

            infoMessage += `📋 *Требования:*\n`;
            infoMessage += `${formatChannelRequirements(requirements)}\n\n`;

            const channelSettings = getChannelSettings(channelConfig.channelId);

            if (channelSettings?.foreignAgentBlurb) {
                infoMessage += `⚙️ *Настройки канала:*\n`;
                infoMessage += `🌍 Текст иностранного агента: ${channelSettings.foreignAgentBlurb}\n\n`;
            }

            const userPermissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

            if (userPermissions) {
                infoMessage += `👤 *Ваши разрешения:*\n`;

                if (userPermissions.isMember) {
                    infoMessage += `✅ Участник канала\n`;
                } else {
                    infoMessage += `❌ Не является участником канала\n`;
                }

                if (userPermissions.isAdmin) {
                    infoMessage += `✅ Администратор\n`;
                    if (userPermissions.canPostMessages) infoMessage += `✅ Может публиковать сообщения\n`;
                    if (userPermissions.canEditMessages) infoMessage += `✅ Может редактировать сообщения\n`;
                    if (userPermissions.canDeleteMessages) infoMessage += `✅ Может удалять сообщения\n`;
                    if (userPermissions.canManageChat) infoMessage += `✅ Может управлять чатом\n`;
                    if (userPermissions.canInviteUsers) infoMessage += `✅ Может приглашать пользователей\n`;
                    if (userPermissions.canPinMessages) infoMessage += `✅ Может закреплять сообщения\n`;
                    if (userPermissions.canManageTopics) infoMessage += `✅ Может управлять темами\n`;
                } else {
                    infoMessage += `❌ Не является администратором\n`;
                }
                infoMessage += `\n`;
            }

            infoMessage += `Используйте /removechannel для удаления этой конфигурации`;
        } else {
            infoMessage += `📢 *Настроенный канал:* Нет\n\n`;
            infoMessage += `❌ Канал не настроен\n`;
            infoMessage += `Используйте /setchannel для настройки`;
        }

        return ctx.reply(infoMessage, { parse_mode: "Markdown" });
    });
}
