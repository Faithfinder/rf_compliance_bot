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
import { getChannelSettings, getNotificationUsers } from "../db/database";

async function sendRejectionNotification(
    channelId: string,
    channelTitle: string | undefined,
    rejectedUserId: number,
    rejectedUserFirstName: string,
    rejectedUserHandle: string | undefined,
    rejectedMessageChatId: number,
    rejectedMessageId: number,
): Promise<void> {
    const notificationUserIds = getNotificationUsers(channelId).filter((id) => id !== rejectedUserId);

    if (notificationUserIds.length === 0) {
        return;
    }

    const timestamp = new Date().toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });

    let notificationMessage = `🚫 <b>Сообщение отклонено</b>\n\n`;
    notificationMessage += `📢 <b>Канал:</b> ${formatChannelInfo(channelId, channelTitle)}\n`;
    notificationMessage += `👤 <b>Пользователь:</b> ${escapeHtml(rejectedUserFirstName)}`;
    if (rejectedUserHandle) {
        notificationMessage += ` (@${escapeHtml(rejectedUserHandle)})`;
    }
    notificationMessage += `\n🆔 <b>ID:</b> <code>${escapeHtml(String(rejectedUserId))}</code>\n`;
    notificationMessage += `🕐 <b>Время:</b> ${escapeHtml(timestamp)}\n\n`;
    notificationMessage += `❌ <b>Причина:</b> Отсутствует текст иностранного агента\n\n`;
    notificationMessage += `📝 <b>Отклоненное сообщение:</b>`;

    for (const notifyUserId of notificationUserIds) {
        try {
            await bot.api.sendMessage(notifyUserId, notificationMessage, {
                parse_mode: "HTML",
            });

            await bot.api.copyMessage(notifyUserId, rejectedMessageChatId, rejectedMessageId);
        } catch (error) {
            console.error(`Failed to send notification to user ${notifyUserId}:`, error);

            Sentry.withScope((scope) => {
                scope.setContext("notification_failure", {
                    channel_id: channelId,
                    notify_user_id: notifyUserId,
                    rejected_user_id: rejectedUserId,
                });
                scope.setTag("error_type", "notification_send_failed");
                Sentry.captureException(error);
            });
        }
    }
}

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
            await sendRejectionNotification(
                channelConfig.channelId,
                channelConfig.channelTitle,
                userId,
                ctx.from.first_name,
                ctx.from.username,
                ctx.chat.id,
                ctx.message.message_id,
            );

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
}
