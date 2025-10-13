import * as Sentry from "@sentry/bun";
import { b, fmt } from "@grammyjs/parse-mode";
import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import {
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    checkUserChannelPermissions,
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

            let errorMessage = fmt`❌ Невозможно опубликовать сообщение: Блурб иностранного агента не настроен для ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n📋 Требования:\n${formatChannelRequirements(requirements)}\n\n`;
            errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Используйте /set_fa_blurb <ваш текст> для настройки текста иностранного агента для этого канала.\n\nТолько администраторы канала могут настраивать параметры.`;

            const entities = errorMessage.entities;
            return ctx.reply(errorMessage.text, entities.length ? { entities } : undefined);
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

            let errorMessage = fmt`❌ Невозможно опубликовать сообщение: Ваше сообщение должно содержать текст иностранного агента.\n\n🌍 ${fmt`${b}Необходимый текст:${b}`}\n${foreignAgentBlurb}\n\nПожалуйста, добавьте этот текст к вашему сообщению и повторите попытку.\nОригинальное сообщение:`;

            await ctx.api.copyMessage(ctx.chat.id, ctx.chat.id, ctx.message.message_id);

            const entities = errorMessage.entities;
            return await ctx.reply(errorMessage.text, entities.length ? { entities } : undefined);
        }

        try {
            await ctx.api.copyMessage(channelConfig.channelId, ctx.chat.id, ctx.message.message_id);

            const successMessage = fmt`✅ Сообщение опубликовано в ${formatChannelInfo(
                channelConfig.channelId,
                channelConfig.channelTitle,
            )}`;
            const entities = successMessage.entities;
            return ctx.reply(successMessage.text, entities.length ? { entities } : undefined);
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

            let errorMessage = fmt`❌ Не удалось опубликовать сообщение в ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n📋 Требования:\n${formatChannelRequirements(requirements)}\n\n`;

            if (!requirements.channelExists) {
                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Канал больше не существует или бот не может получить к нему доступ. Пожалуйста, выберите другой канал.`;

                const keyboard = new Keyboard()
                    .requestChat("Выбрать другой канал", 1, {
                        chat_is_channel: true,
                        bot_is_member: true,
                    })
                    .text("/removechannel")
                    .resized()
                    .oneTime();

                ctx.session.awaitingChannelSelection = true;
                const entities = errorMessage.entities;
                return ctx.reply(errorMessage.text, {
                    reply_markup: keyboard,
                    ...(entities.length ? { entities } : {}),
                });
            } else if (!requirements.botIsAdded) {
                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Попросите администратора канала добавить этого бота в качестве администратора в канал.`;
            } else if (!requirements.botCanPost) {
                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Попросите администратора канала предоставить боту разрешение "Публиковать сообщения".`;
            }

            errorMessage = fmt`${errorMessage}\n\nИли используйте /setchannel для настройки другого канала`;

            const entities = errorMessage.entities;
            return ctx.reply(errorMessage.text, entities.length ? { entities } : undefined);
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
