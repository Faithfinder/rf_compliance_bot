import { bot } from "../config/bot";
import {
    checkChannelRequirements,
    formatChannelRequirements,
    checkUserChannelPermissions,
    formatChannelInfo,
    escapeHtml,
} from "../utils";
import { getChannelSettings } from "../db/database";
import { isFixedChannelMode } from "../config/environment";

export function registerInfoCommand(): void {
    bot.command("info", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId || !ctx.from) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        const channelConfig = ctx.session.channelConfig;

        let infoMessage = "🤖 <b>Конфигурация бота</b>\n\n";
        infoMessage += `👤 <b>Пользователь:</b> ${escapeHtml(ctx.from.first_name)}`;
        if (ctx.from.username) {
            infoMessage += ` (@${escapeHtml(ctx.from.username)})`;
        }
        infoMessage += `\n📱 <b>ID пользователя:</b> <code>${escapeHtml(String(userId))}</code>\n\n`;

        if (channelConfig) {
            infoMessage += `📢 <b>Настроенный канал:</b>\n`;
            infoMessage += `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n`;
            if (isFixedChannelMode()) {
                infoMessage += `🔒 Фиксированный канал (установлен администратором)\n`;
            }
            infoMessage += `\n`;

            const requirements = await checkChannelRequirements(channelConfig.channelId);

            infoMessage += `📋 <b>Требования:</b>\n`;
            infoMessage += `${formatChannelRequirements(requirements)}\n\n`;

            const channelSettings = getChannelSettings(channelConfig.channelId);

            if (channelSettings?.foreignAgentBlurb) {
                infoMessage += `⚙️ <b>Настройки канала:</b>\n`;
                infoMessage += `🌍 <b>Текст иностранного агента:</b>\n${escapeHtml(channelSettings.foreignAgentBlurb)}\n\n`;
            }

            const userPermissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

            if (userPermissions) {
                infoMessage += `👤 <b>Ваши разрешения:</b>\n`;

                if (userPermissions.isMember) {
                    infoMessage += `✅ Участник канала\n`;
                } else {
                    infoMessage += `❌ Не является участником канала\n`;
                }

                if (userPermissions.isAdmin) {
                    infoMessage += `✅ Администратор\n`;
                    if (userPermissions.canPostMessages)
                        infoMessage += `⚠️ Может публиковать сообщения (Это право следует убрать, чтобы предотвратить обход бота)\n`;
                    if (userPermissions.canEditMessages) infoMessage += `✅ Может редактировать сообщения\n`;
                    if (userPermissions.canManageChat) infoMessage += `✅ Может управлять чатом\n`;
                } else {
                    infoMessage += `❌ Не является администратором\n`;
                }
                infoMessage += `\n`;
            }

            if (!isFixedChannelMode()) {
                infoMessage += `Используйте <code>/removechannel</code> для удаления этой конфигурации`;
            }
        } else {
            infoMessage += `📢 <b>Настроенный канал:</b> Нет\n\n`;
            infoMessage += `❌ Канал не настроен\n`;
            if (!isFixedChannelMode()) {
                infoMessage += `Используйте <code>/setchannel</code> для настройки`;
            }
        }

        return ctx.reply(infoMessage, { parse_mode: "HTML" });
    });
}
