import * as Sentry from "@sentry/bun";
import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import { formatChannelInfo, checkChannelRequirements, formatChannelRequirements, checkUserChannelPermissions, escapeMarkdown } from "../utils";
import { getChannelSettings } from "../db/database";

export function registerMessageHandler(): void {
    bot.on("message", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя\\.");
        }

        const channelConfig = ctx.session.channelConfig;

        if (!channelConfig) {
            return ctx.reply(
                "Вы еще не настроили канал\\.\n\n" +
                    "Используйте /setchannel <@channel или ID> для настройки\\.\n" +
                    "Пример: /setchannel @mychannel",
            );
        }

        const permissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

        if (!permissions?.canEditMessages) {
            return ctx.reply(
                "❌ У вас нет разрешения на публикацию сообщений в этот канал\\.\n\n" +
                    'Только администраторы канала с разрешением "Редактировать сообщения" могут публиковать сообщения через этого бота\\.\n\n' +
                    "Попросите администратора канала предоставить вам это разрешение\\.",
            );
        }

        const channelSettings = getChannelSettings(channelConfig.channelId);
        const foreignAgentBlurb = channelSettings?.foreignAgentBlurb;

        if (!foreignAgentBlurb) {
            const requirements = await checkChannelRequirements(channelConfig.channelId);

            let errorMessage = `❌ Невозможно опубликовать сообщение: Блурб иностранного агента не настроен для ` + `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            errorMessage += `📋 Требования:\n` + `${formatChannelRequirements(requirements)}\n\n`;
            errorMessage += `*Следующий шаг:* Используйте \`${escapeMarkdown("/set_fa_blurb")} <ваш текст>\` для настройки текста иностранного агента для этого канала\\.\n\n`;
            errorMessage += `Только администраторы канала могут настраивать параметры\\.`;

            return ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
        }

        const messageText = ctx.message.text || ctx.message.caption;

        if (!messageText || !messageText.includes(foreignAgentBlurb)) {
            let errorMessage = `❌ Невозможно опубликовать сообщение: Ваше сообщение должно содержать текст иностранного агента\\.\n\n`;
            errorMessage += `🌍 *Необходимый текст:*\n` + `${escapeMarkdown(foreignAgentBlurb)}\n\n`;
            errorMessage += `Пожалуйста\\, добавьте этот текст к вашему сообщению и повторите попытку\\.`;

            return ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
        }

        try {
            await ctx.api.copyMessage(channelConfig.channelId, ctx.chat.id, ctx.message.message_id);

            return ctx.reply(
                `✅ Сообщение опубликовано в ` + formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle),
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

            let errorMessage = `❌ Не удалось опубликовать сообщение в ` + `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            errorMessage += `📋 Требования:\n` + `${formatChannelRequirements(requirements)}\n\n`;

            if (!requirements.channelExists) {
                errorMessage +=
                    "*Следующий шаг:* Канал больше не существует или бот не может получить к нему доступ\\. Пожалуйста\\, выберите другой канал\\.";

                const keyboard = new Keyboard()
                    .requestChat("Выбрать другой канал", 1, {
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
                    "*Следующий шаг:* Попросите администратора канала добавить этого бота в качестве администратора в канал\\.";
            } else if (!requirements.botCanPost) {
                errorMessage +=
                    '*Следующий шаг:* Попросите администратора канала предоставить боту разрешение "Публиковать сообщения"\\.';
            }

            errorMessage += "\n\nИли используйте /setchannel для настройки другого канала";

            return ctx.reply(errorMessage);
        }
    });
}
