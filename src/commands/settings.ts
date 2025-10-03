import { bot } from "../config/bot";
import { getChannelSettings, updateChannelSettings } from "../db/database";
import { checkUserChannelPermissions, formatChannelInfo, escapeMarkdown, escapeLiteral } from "../utils";

export function registerSettingsCommand(): void {
    bot.command("set_fa_blurb", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply(escapeLiteral("Не удается идентифицировать пользователя."));
        }

        const channelConfig = ctx.session.channelConfig;

        if (!channelConfig) {
            return ctx.reply(
                escapeLiteral("Вы еще не настроили канал.\n\n") +
                    escapeLiteral("Используйте /setchannel <@channel или ID> для настройки.\n") +
                    escapeLiteral("Пример: /setchannel @mychannel"),
            );
        }

        const args = ctx.match;
        const isViewMode = !args || typeof args !== "string" || args.trim() === "";

        if (isViewMode) {
            const channelSettings = getChannelSettings(channelConfig.channelId);

            let message = `⚙️ *Настройки канала*\n\n`;
            message += `📢 *Канал:* ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            message += `🌍 *Текст иностранного агента:*\n`;

            if (channelSettings?.foreignAgentBlurb) {
                message += `${escapeMarkdown(channelSettings.foreignAgentBlurb)}\n\n`;
            } else {
                message += `_Не настроено_\n\n`;
            }

            message += escapeLiteral(`Чтобы обновить текст иностранного агента, используйте:\n`);
            message += `${escapeMarkdown("/set_fa_blurb")} <ваш текст>`;

            return ctx.reply(message, { parse_mode: "MarkdownV2" });
        }

        const permissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

        if (!permissions?.canManageChat) {
            return ctx.reply(
                escapeLiteral("❌ Вы должны быть администратором настроенного канала для изменения настроек.\n\n") +
                    escapeLiteral("Только администраторы канала могут обновлять общие настройки канала."),
            );
        }

        const newBlurb = (args as string).trim();

        if (newBlurb.length === 0) {
            return ctx.reply(escapeLiteral("❌ Текст иностранного агента не может быть пустым. Пожалуйста, укажите текст."));
        }

        updateChannelSettings(channelConfig.channelId, { foreignAgentBlurb: newBlurb });

        let confirmMessage = escapeLiteral(`✅ Текст иностранного агента успешно обновлен!\n\n`);
        confirmMessage += `📢 *Канал:* ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
        confirmMessage += escapeLiteral(`🌍 *Новый текст иностранного агента:*\n`) + escapeMarkdown(newBlurb);

        return ctx.reply(confirmMessage, { parse_mode: "MarkdownV2" });
    });
}
