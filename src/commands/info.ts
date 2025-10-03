import { bot } from "../config/bot";
import {
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    checkUserChannelPermissions,
    escapeMarkdown,
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

        let infoMessage = "🤖 *Конфигурация бота*\n\n";
        infoMessage += `👤 *Пользователь:* ${escapeMarkdown(ctx.from.first_name)}`;
        if (ctx.from.username) {
            infoMessage += ` (@${escapeMarkdown(ctx.from.username)})`;
        }
        infoMessage += `\n📱 *ID пользователя:* \`${userId}\`\n\n`;

        if (channelConfig) {
            infoMessage += `📢 *Настроенный канал:*\n`;
            const channelTitle = channelConfig.channelTitle ? escapeMarkdown(channelConfig.channelTitle) : undefined;
            infoMessage += `${channelTitle ? `${channelTitle} (\`${channelConfig.channelId}\`)` : channelConfig.channelId}\n`;
            if (isFixedChannelMode()) {
                infoMessage += `🔒 Фиксированный канал (установлен администратором)\n`;
            }
            infoMessage += `\n`;

            const requirements = await checkChannelRequirements(channelConfig.channelId);

            infoMessage += `📋 *Требования:*\n`;
            infoMessage += `${formatChannelRequirements(requirements)}\n\n`;

            const channelSettings = getChannelSettings(channelConfig.channelId);

            if (channelSettings?.foreignAgentBlurb) {
                infoMessage += `⚙️ *Настройки канала:*\n`;
                infoMessage += `🌍 *Текст иностранного агента:*\n>${channelSettings.foreignAgentBlurb}\n\n`;
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
                    if (userPermissions.canPostMessages) infoMessage += `⚠️ Может публиковать сообщения (Это право следует убрать чтобы предотвратить обход бота)\n`;
                    if (userPermissions.canEditMessages) infoMessage += `✅ Может редактировать сообщения\n`;
                    if (userPermissions.canManageChat) infoMessage += `✅ Может управлять чатом\n`;
                } else {
                    infoMessage += `❌ Не является администратором\n`;
                }
                infoMessage += `\n`;
            }

            if (!isFixedChannelMode()) {
                infoMessage += `Используйте /removechannel для удаления этой конфигурации`;
            }
        } else {
            infoMessage += `📢 *Настроенный канал:* Нет\n\n`;
            infoMessage += `❌ Канал не настроен\n`;
            if (!isFixedChannelMode()) {
                infoMessage += `Используйте /setchannel для настройки`;
            }
        }

        return ctx.reply(infoMessage, { parse_mode: "MarkdownV2" });
    });
}
