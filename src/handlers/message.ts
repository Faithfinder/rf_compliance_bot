import * as Sentry from "@sentry/bun";
import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import {
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    checkUserChannelPermissions,
    escapeHtml,
} from "../utils";
import { getChannelSettings } from "../db/database";
import { dispatchRejectionNotifications } from "../notifications/rejection";

export function registerMessageHandler(): void {
    bot.chatType("private").on("message", async (ctx) => {
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

        const permissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

        if (!permissions?.canEditMessages) {
            return ctx.reply(
                "❌ У вас нет разрешения на публикацию сообщений в этот канал.\n\n" +
                    'Только администраторы канала с разрешением "Редактировать сообщения" могут публиковать сообщения через этого бота.\n\n' +
                    "Попросите администратора канала предоставить вам это разрешение.",
            );
        }

        const channelSettings = getChannelSettings(channelConfig.channelId);
        const foreignAgentBlurb = channelSettings?.foreignAgentBlurb;

        if (!foreignAgentBlurb) {
            const requirements = await checkChannelRequirements(channelConfig.channelId);

            let errorMessage =
                `❌ Невозможно опубликовать сообщение: Блурб иностранного агента не настроен для ` +
                `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            errorMessage += `📋 Требования:\n` + `${formatChannelRequirements(requirements)}\n\n`;
            errorMessage += `<b>Следующий шаг:</b> Используйте ${escapeHtml(
                "/set_fa_blurb <ваш текст>",
            )} для настройки текста иностранного агента для этого канала.\n\n`;
            errorMessage += `Только администраторы канала могут настраивать параметры.`;

            return ctx.reply(errorMessage, { parse_mode: "HTML" });
        }

        const messageText = ctx.message.text || ctx.message.caption;

        if (!messageText || !messageText.includes(foreignAgentBlurb)) {
            const notificationsResult = await dispatchRejectionNotifications({
                channelId: channelConfig.channelId,
                channelTitle: channelConfig.channelTitle,
                rejectedMessageChatId: ctx.chat.id,
                rejectedMessageId: ctx.message.message_id,
                actor: {
                    id: userId,
                    displayName: ctx.from.first_name,
                    username: ctx.from.username,
                },
                excludeUserIds: [userId],
            });

            if (notificationsResult.failedTargets > 0) {
                console.warn(
                    `Failed to notify ${notificationsResult.failedTargets} recipients about rejection in channel ${channelConfig.channelId}.`,
                );
            }

            let errorMessage = `❌ Невозможно опубликовать сообщение: Ваше сообщение должно содержать текст иностранного агента.\n\n`;
            errorMessage += `🌍 <b>Необходимый текст:</b>\n` + `${escapeHtml(foreignAgentBlurb)}\n\n`;
            errorMessage += `Пожалуйста, добавьте этот текст к вашему сообщению и повторите попытку.\n`;
            errorMessage += `Оригинальное сообщение:`;

            await ctx.api.copyMessage(ctx.chat.id, ctx.chat.id, ctx.message.message_id);

            return await ctx.reply(errorMessage, { parse_mode: "HTML" });
        }

        try {
            await ctx.api.copyMessage(channelConfig.channelId, ctx.chat.id, ctx.message.message_id);

            return ctx.reply(
                `✅ Сообщение опубликовано в ` + formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle),
                { parse_mode: "HTML" },
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

            let errorMessage =
                `❌ Не удалось опубликовать сообщение в ` +
                `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            errorMessage += `📋 Требования:\n` + `${formatChannelRequirements(requirements)}\n\n`;

            if (!requirements.channelExists) {
                errorMessage +=
                    "<b>Следующий шаг:</b> Канал больше не существует или бот не может получить к нему доступ. Пожалуйста, выберите другой канал.";

                const keyboard = new Keyboard()
                    .requestChat("Выбрать другой канал", 1, {
                        chat_is_channel: true,
                        bot_is_member: true,
                    })
                    .text("/removechannel")
                    .resized()
                    .oneTime();

                ctx.session.awaitingChannelSelection = true;
                return ctx.reply(errorMessage, { reply_markup: keyboard, parse_mode: "HTML" });
            } else if (!requirements.botIsAdded) {
                errorMessage +=
                    '<b>Следующий шаг:</b> Попросите администратора канала добавить этого бота в качестве администратора в канал.';
            } else if (!requirements.botCanPost) {
                errorMessage +=
                    '<b>Следующий шаг:</b> Попросите администратора канала предоставить боту разрешение "Публиковать сообщения".';
            }

            errorMessage += `\n\nИли используйте ${escapeHtml("/setchannel")} для настройки другого канала`;

            return ctx.reply(errorMessage, { parse_mode: "HTML" });
        }
    });

    bot.chatType("channel").on("channel_post", async (ctx) => {
        const message = ctx.channelPost ?? ctx.msg;

        if (!message) {
            return;
        }

        const channelId = message.chat.id.toString();
        const channelTitle = message.chat.title;

        if (message.from && message.from.id === ctx.me.id) {
            return;
        }

        const channelSettings = getChannelSettings(channelId);
        const foreignAgentBlurb = channelSettings?.foreignAgentBlurb;

        if (!foreignAgentBlurb) {
            return;
        }

        const messageText = message.text ?? message.caption ?? "";

        if (messageText.includes(foreignAgentBlurb)) {
            return;
        }

        const actor =
            message.from ?
                {
                    id: message.from.id,
                    displayName: message.from.first_name,
                    username: message.from.username,
                }
            : message.author_signature ?
                { displayName: message.author_signature }
            : undefined;

        const notificationsResult = await dispatchRejectionNotifications({
            channelId,
            channelTitle,
            rejectedMessageChatId: message.chat.id,
            rejectedMessageId: message.message_id,
            actor,
            includeAuthor: true,
        });

        try {
            await ctx.api.deleteMessage(message.chat.id, message.message_id);
        } catch (error) {
            console.error("Failed to delete non-compliant channel message:", error);

            Sentry.withScope((scope) => {
                scope.setContext("channel_moderation", {
                    channel_id: channelId,
                    message_id: message.message_id,
                    notification_targets: notificationsResult.totalTargets,
                    notification_failures: notificationsResult.failedTargets,
                });
                scope.setTag("error_type", "channel_message_delete_failed");
                Sentry.captureException(error);
            });

            return;
        }
    });
}
