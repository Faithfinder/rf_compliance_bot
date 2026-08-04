import { b, fmt, i } from "@grammyjs/parse-mode";
import { bot } from "../config/bot";
import { getChannelSettings, updateChannelSettings } from "../db/database";
import { checkUserChannelPermissions, formatChannelInfo, formatNoChannelMessage } from "../utils";
import { captureEvent } from "../telemetry/events";

export function registerSettingsCommand(): void {
    bot.command("set_fa_blurb", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        const channelConfig = ctx.session.channelConfig;

        if (!channelConfig) {
            return ctx.reply(formatNoChannelMessage());
        }

        const args = ctx.match;
        const isViewMode = !args || typeof args !== "string" || args.trim() === "";

        if (isViewMode) {
            const channelSettings = getChannelSettings(channelConfig.channelId);

            let message = fmt`⚙️ ${fmt`${b}Настройки канала${b}`}\n\n📢 ${fmt`${b}Канал:${b}`} ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n🌍 ${fmt`${b}Текст маркировки:${b}`}\n`;

            if (channelSettings?.foreignAgentBlurb) {
                message = fmt`${message}${channelSettings.foreignAgentBlurb}\n\n`;
            } else {
                message = fmt`${message}${fmt`${i}Не настроено${i}`}\n\n`;
            }

            message = fmt`${message}Этот текст проверяется в обоих режимах — и при модерации канала, и при публикации через бота.\n\nЧтобы обновить его:\n/set_fa_blurb <ваш текст>`;

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
            return ctx.reply("❌ Текст маркировки не может быть пустым. Укажите текст после команды.");
        }

        const previousBlurb = getChannelSettings(channelConfig.channelId)?.foreignAgentBlurb;

        updateChannelSettings(channelConfig.channelId, { foreignAgentBlurb: newBlurb });

        // The length only - the blurb itself names the agent and never leaves the process.
        captureEvent("blurb_configured", userId, {
            channelId: channelConfig.channelId,
            channelTitle: channelConfig.channelTitle,
            blurbLength: newBlurb.length,
            isUpdate: previousBlurb !== undefined,
        });

        let confirmMessage = fmt`✅ Текст маркировки обновлён!\n\n📢 ${fmt`${b}Канал:${b}`} ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n🌍 ${fmt`${b}Новый текст маркировки:${b}`}\n`;
        confirmMessage = fmt`${confirmMessage}${newBlurb}\n\nТеперь я проверяю посты в канале на эту строку. Что настроено — /info.`;

        const entities = confirmMessage.entities;
        return ctx.reply(confirmMessage.text, entities.length ? { entities } : undefined);
    });
}
