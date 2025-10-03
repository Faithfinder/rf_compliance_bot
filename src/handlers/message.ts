import * as Sentry from "@sentry/bun";
import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import { formatChannelInfo, checkChannelRequirements, formatChannelRequirements, checkUserChannelPermissions, escapeMarkdown, escapeLiteral } from "../utils";
import { getChannelSettings } from "../db/database";

export function registerMessageHandler(): void {
    bot.on("message", async (ctx) => {
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

        const permissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

        if (!permissions?.canEditMessages) {
            return ctx.reply(
                escapeLiteral("❌ У вас нет разрешения на публикацию сообщений в этот канал.\n\n") +
                    escapeLiteral('Только администраторы канала с разрешением "Редактировать сообщения" могут публиковать сообщения через этого бота.\n\n') +
                    escapeLiteral("Попросите администратора канала предоставить вам это разрешение."),
            );
        }

        const channelSettings = getChannelSettings(channelConfig.channelId);
        const foreignAgentBlurb = channelSettings?.foreignAgentBlurb;

        if (!foreignAgentBlurb) {
            const requirements = await checkChannelRequirements(channelConfig.channelId);

            let errorMessage = escapeLiteral(`❌ Невозможно опубликовать сообщение: Блурб иностранного агента не настроен для `) + `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            errorMessage += escapeLiteral(`📋 Требования:\n`) + `${formatChannelRequirements(requirements)}\n\n`;
            errorMessage += escapeLiteral(`*Следующий шаг:* Используйте \`${escapeMarkdown("/set_fa_blurb")} <ваш текст>\` для настройки текста иностранного агента для этого канала.\n\n`);
            errorMessage += escapeLiteral(`Только администраторы канала могут настраивать параметры.`);

            return ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
        }

        const messageText = ctx.message.text || ctx.message.caption;

        if (!messageText || !messageText.includes(foreignAgentBlurb)) {
            let errorMessage = escapeLiteral(`❌ Невозможно опубликовать сообщение: Ваше сообщение должно содержать текст иностранного агента.\n\n`);
            errorMessage += escapeLiteral(`🌍 *Необходимый текст:*\n`) + `${escapeMarkdown(foreignAgentBlurb)}\n\n`;
            errorMessage += escapeLiteral(`Пожалуйста, добавьте этот текст к вашему сообщению и повторите попытку.`);

            return ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
        }

        try {
            await ctx.api.copyMessage(channelConfig.channelId, ctx.chat.id, ctx.message.message_id);

            return ctx.reply(
                escapeLiteral(`✅ Сообщение опубликовано в `) + formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle),
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

            let errorMessage = escapeLiteral(`❌ Не удалось опубликовать сообщение в `) + `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            errorMessage += escapeLiteral(`📋 Требования:\n`) + `${formatChannelRequirements(requirements)}\n\n`;

            if (!requirements.channelExists) {
                errorMessage +=
                    escapeLiteral("*Следующий шаг:* Канал больше не существует или бот не может получить к нему доступ. Пожалуйста, выберите другой канал.");

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
                    escapeLiteral("*Следующий шаг:* Попросите администратора канала добавить этого бота в качестве администратора в канал.");
            } else if (!requirements.botCanPost) {
                errorMessage +=
                    escapeLiteral('*Следующий шаг:* Попросите администратора канала предоставить боту разрешение "Публиковать сообщения".');
            }

            errorMessage += escapeLiteral("\n\nИли используйте /setchannel для настройки другого канала");

            return ctx.reply(errorMessage);
        }
    });
}
