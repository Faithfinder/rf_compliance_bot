import { bot } from "../config/bot";
import { getChannelSettings, updateChannelSettings } from "../db/database";
import { checkUserChannelPermissions, formatChannelInfo, escapeHtml } from "../utils";

export function registerSettingsCommand(): void {
    bot.command("set_fa_blurb", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        const channelConfig = ctx.session.channelConfig;

        if (!channelConfig) {
            return ctx.reply(
                "Вы еще не настроили канал.\n\n" +
                    "Используйте /setchannel <@channel или ID> для настройки.\n" +
                    "Пример: /setchannel @mychannel",
            );
        }

        const args = ctx.match;
        const isViewMode = !args || typeof args !== "string" || args.trim() === "";

        if (isViewMode) {
            const channelSettings = getChannelSettings(channelConfig.channelId);

            let message = `⚙️ <b>Настройки канала</b>\n\n`;
            message += `📢 <b>Канал:</b> ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            message += `🌍 <b>Текст иностранного агента:</b>\n`;

            if (channelSettings?.foreignAgentBlurb) {
                message += `${escapeHtml(channelSettings.foreignAgentBlurb)}\n\n`;
            } else {
                message += `<i>Не настроено</i>\n\n`;
            }

            message += `Чтобы обновить текст иностранного агента, используйте:\n`;
            message += `<code>${escapeHtml("/set_fa_blurb <ваш текст>")}</code>`;

            return ctx.reply(message, { parse_mode: "HTML" });
        }

        const permissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

        if (!permissions?.canManageChat) {
            return ctx.reply(
                "❌ Вы должны быть администратором настроенного канала для изменения настроек.\n\n" +
                    "Только администраторы канала могут обновлять общие настройки канала.",
            );
        }

        const newBlurb = (args as string).trim();

        if (newBlurb.length === 0) {
            return ctx.reply("❌ Текст иностранного агента не может быть пустым. Пожалуйста, укажите текст.");
        }

        updateChannelSettings(channelConfig.channelId, { foreignAgentBlurb: newBlurb });

        let confirmMessage = `✅ Текст иностранного агента успешно обновлен!\n\n`;
        confirmMessage += `📢 <b>Канал:</b> ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
        confirmMessage += `🌍 <b>Новый текст иностранного агента:</b>\n` + escapeHtml(newBlurb);

        return ctx.reply(confirmMessage, { parse_mode: "HTML" });
    });
}
