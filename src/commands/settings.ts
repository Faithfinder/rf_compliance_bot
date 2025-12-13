import { b, fmt, i } from "@grammyjs/parse-mode";
import { bot } from "../config/bot";
import { trackEvent } from "../config/posthog";
import { getChannelSettings, updateChannelSettings } from "../db/database";
import { checkUserChannelPermissions, formatChannelInfo } from "../utils";

export function registerSettingsCommand(): void {
    bot.command("set_fa_blurb", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        trackEvent(userId, "command_executed", {
            command: "set_fa_blurb",
        });

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

            let message = fmt`⚙️ ${fmt`${b}Настройки канала${b}`}\n\n📢 ${fmt`${b}Канал:${b}`} ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n🌍 ${fmt`${b}Текст иностранного агента:${b}`}\n`;

            if (channelSettings?.foreignAgentBlurb) {
                message = fmt`${message}${channelSettings.foreignAgentBlurb}\n\n`;
            } else {
                message = fmt`${message}${fmt`${i}Не настроено${i}`}\n\n`;
            }

            message = fmt`${message}Чтобы обновить текст иностранного агента, используйте:\n/set_fa_blurb <ваш текст>`;

            const entities = message.entities;
            return ctx.reply(message.text, entities.length ? { entities } : undefined);
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

        trackEvent(userId, "foreign_agent_blurb_updated", {
            channel_id: channelConfig.channelId,
            blurb_length: newBlurb.length,
        });

        let confirmMessage = fmt`✅ Текст иностранного агента успешно обновлен!\n\n📢 ${fmt`${b}Канал:${b}`} ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n🌍 ${fmt`${b}Новый текст иностранного агента:${b}`}\n`;
        confirmMessage = fmt`${confirmMessage}${newBlurb}`;

        const entities = confirmMessage.entities;
        return ctx.reply(confirmMessage.text, entities.length ? { entities } : undefined);
    });
}
