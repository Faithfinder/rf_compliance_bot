import { b, fmt } from "@grammyjs/parse-mode";
import { Keyboard } from "grammy";
import type { Message } from "grammy/types";
import { bot } from "../config/bot";
import {
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    checkUserChannelPermissions,
    formatNoChannelMessage,
    formatChangeChannelHint,
} from "../utils";
import { isFixedChannelMode } from "../config/environment";
import { getChannelSettings } from "../db/database";
import { addMessageToGroup, isMediaGroupValidated } from "../utils/media-groups";
import {
    extractMessageActor,
    validateMessageCompliance,
    createMediaGroupValidator,
    handleRejectionWithNotifications,
    reportChannelPostError,
    reportModerationError,
} from "./message-helpers";
import { captureEvent, classifyPublishFailure } from "../telemetry/events";

export function registerMessageHandler(): void {
    bot.chatType("private").on("message", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        const channelConfig = ctx.session.channelConfig;

        if (!channelConfig) {
            captureEvent("publish_blocked", userId, { reason: "no_channel" });
            return ctx.reply(formatNoChannelMessage());
        }

        const permissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

        if (!permissions?.canEditMessages) {
            captureEvent("publish_blocked", userId, {
                reason: "no_permission",
                channelId: channelConfig.channelId,
                channelTitle: channelConfig.channelTitle,
            });

            return ctx.reply(
                "❌ У вас нет разрешения на публикацию сообщений в этот канал.\n\n" +
                    'Только администраторы канала с разрешением "Редактировать сообщения" могут публиковать сообщения через этого бота.\n\n' +
                    "Попросите администратора канала предоставить вам это разрешение.",
            );
        }

        const channelSettings = getChannelSettings(channelConfig.channelId);
        const foreignAgentBlurb = channelSettings?.foreignAgentBlurb;

        if (!foreignAgentBlurb) {
            captureEvent("publish_blocked", userId, {
                reason: "no_blurb",
                channelId: channelConfig.channelId,
                channelTitle: channelConfig.channelTitle,
            });

            const requirements = await checkChannelRequirements(channelConfig.channelId);

            let errorMessage = fmt`❌ Невозможно опубликовать сообщение: Блурб иностранного агента не настроен для ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n📋 Требования:\n${formatChannelRequirements(requirements)}\n\n`;
            errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Используйте /set_fa_blurb <ваш текст> для настройки текста иностранного агента для этого канала.\n\nТолько администраторы канала могут настраивать параметры.`;

            const entities = errorMessage.entities;
            return ctx.reply(errorMessage.text, entities.length ? { entities } : undefined);
        }

        const mediaGroupId = ctx.message.media_group_id;

        if (mediaGroupId) {
            if (isMediaGroupValidated(mediaGroupId)) {
                return;
            }

            addMessageToGroup(
                mediaGroupId,
                ctx.message,
                async (messages: Message[], approved: boolean) => {
                    if (approved) {
                        try {
                            const messageIds = messages.map((m) => m.message_id).sort((a, b) => a - b);
                            await ctx.api.copyMessages(channelConfig.channelId, ctx.chat.id, messageIds);

                            const successMessage = fmt`✅ Альбом опубликован в ${formatChannelInfo(
                                channelConfig.channelId,
                                channelConfig.channelTitle,
                            )}`;
                            const entities = successMessage.entities;
                            await ctx.api.sendMessage(
                                ctx.chat.id,
                                successMessage.text,
                                entities.length ? { entities } : undefined,
                            );

                            captureEvent("message_published", userId, {
                                channelId: channelConfig.channelId,
                                channelTitle: channelConfig.channelTitle,
                                contentKind: "album",
                                albumSize: messages.length,
                            });
                        } catch (error) {
                            reportChannelPostError(error, {
                                userId,
                                channelId: channelConfig.channelId,
                                channelTitle: channelConfig.channelTitle,
                                mediaGroupId,
                            });

                            const requirements = await checkChannelRequirements(channelConfig.channelId);

                            captureEvent("publish_failed", userId, {
                                channelId: channelConfig.channelId,
                                channelTitle: channelConfig.channelTitle,
                                contentKind: "album",
                                failureReason: classifyPublishFailure(requirements),
                            });

                            let errorMessage = fmt`❌ Не удалось опубликовать альбом в ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n📋 Требования:\n${formatChannelRequirements(requirements)}\n\n`;

                            if (!requirements.channelExists) {
                                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Канал больше не существует или бот не может получить к нему доступ. Пожалуйста, выберите другой канал.`;
                            } else if (!requirements.botIsAdded) {
                                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Попросите администратора канала добавить этого бота в качестве администратора в канал.`;
                            } else if (!requirements.botCanPost) {
                                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Попросите администратора канала предоставить боту разрешение "Публиковать сообщения".`;
                            }

                            errorMessage = fmt`${errorMessage}${formatChangeChannelHint()}`;

                            const entities = errorMessage.entities;
                            await ctx.api.sendMessage(
                                ctx.chat.id,
                                errorMessage.text,
                                entities.length ? { entities } : undefined,
                            );
                        }
                    } else {
                        const firstMessage = messages[0];
                        if (!firstMessage) {
                            return;
                        }

                        const notifications = await handleRejectionWithNotifications({
                            channelId: channelConfig.channelId,
                            channelTitle: channelConfig.channelTitle,
                            rejectedMessageChatId: ctx.chat.id,
                            rejectedMessageId: firstMessage.message_id,
                            actor: {
                                id: userId,
                                displayName: ctx.from.first_name,
                                username: ctx.from.username,
                            },
                            excludeUserIds: [userId],
                        });

                        captureEvent("message_rejected", userId, {
                            channelId: channelConfig.channelId,
                            channelTitle: channelConfig.channelTitle,
                            contentKind: "album",
                            albumSize: messages.length,
                            notifiedTargets: notifications.totalTargets,
                            notificationFailures: notifications.failedTargets,
                            unreachableTargets: notifications.unreachableTargets,
                        });

                        const errorMessage = fmt`❌ Невозможно опубликовать альбом: Ваше сообщение должно содержать текст иностранного агента.\n\n🌍 ${fmt`${b}Необходимый текст:${b}`}\n${foreignAgentBlurb}\n\nПожалуйста, добавьте этот текст к вашему сообщению и повторите попытку.\nОригинальное сообщение:`;

                        const entities = errorMessage.entities;
                        await ctx.api.sendMessage(
                            ctx.chat.id,
                            errorMessage.text,
                            entities.length ? { entities } : undefined,
                        );

                        // The echo is a convenience; losing it must not cost the user the
                        // explanation above, and this runs outside grammY's error handling.
                        try {
                            const messageIds = messages.map((m) => m.message_id).sort((a, b) => a - b);
                            await ctx.api.copyMessages(ctx.chat.id, ctx.chat.id, messageIds);
                        } catch (error) {
                            console.error("Failed to echo the rejected album back to the user:", error);
                        }
                    }
                },
                createMediaGroupValidator(foreignAgentBlurb),
            );

            return;
        }

        if (!validateMessageCompliance(ctx.message, foreignAgentBlurb)) {
            const notifications = await handleRejectionWithNotifications({
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

            captureEvent("message_rejected", userId, {
                channelId: channelConfig.channelId,
                channelTitle: channelConfig.channelTitle,
                contentKind: "single",
                notifiedTargets: notifications.totalTargets,
                notificationFailures: notifications.failedTargets,
                unreachableTargets: notifications.unreachableTargets,
            });

            const errorMessage = fmt`❌ Невозможно опубликовать сообщение: Ваше сообщение должно содержать текст иностранного агента.\n\n🌍 ${fmt`${b}Необходимый текст:${b}`}\n${foreignAgentBlurb}\n\nПожалуйста, добавьте этот текст к вашему сообщению и повторите попытку.\nОригинальное сообщение:`;

            const entities = errorMessage.entities;
            await ctx.reply(errorMessage.text, entities.length ? { entities } : undefined);

            return ctx.api.copyMessage(ctx.chat.id, ctx.chat.id, ctx.message.message_id);
        }

        try {
            await ctx.api.copyMessage(channelConfig.channelId, ctx.chat.id, ctx.message.message_id);

            // captureEvent never throws, which is what makes it safe here: this sits inside the try
            // whose catch below tells the user that publishing failed.
            captureEvent("message_published", userId, {
                channelId: channelConfig.channelId,
                channelTitle: channelConfig.channelTitle,
                contentKind: "single",
            });

            const successMessage = fmt`✅ Сообщение опубликовано в ${formatChannelInfo(
                channelConfig.channelId,
                channelConfig.channelTitle,
            )}`;
            const entities = successMessage.entities;
            return ctx.reply(successMessage.text, entities.length ? { entities } : undefined);
        } catch (error) {
            reportChannelPostError(error, {
                userId,
                channelId: channelConfig.channelId,
                channelTitle: channelConfig.channelTitle,
            });

            const requirements = await checkChannelRequirements(channelConfig.channelId);

            captureEvent("publish_failed", userId, {
                channelId: channelConfig.channelId,
                channelTitle: channelConfig.channelTitle,
                contentKind: "single",
                failureReason: classifyPublishFailure(requirements),
            });

            let errorMessage = fmt`❌ Не удалось опубликовать сообщение в ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n📋 Требования:\n${formatChannelRequirements(requirements)}\n\n`;

            if (!requirements.channelExists) {
                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Канал больше не существует или бот не может получить к нему доступ.`;

                // The channel selection handlers are only registered when the channel is not
                // fixed, so offering the keyboard in fixed mode would produce dead buttons.
                if (isFixedChannelMode()) {
                    errorMessage = fmt`${errorMessage} Обратитесь к администратору бота.`;
                } else {
                    errorMessage = fmt`${errorMessage} Пожалуйста, выберите другой канал.`;

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
                }
            } else if (!requirements.botIsAdded) {
                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Попросите администратора канала добавить этого бота в качестве администратора в канал.`;
            } else if (!requirements.botCanPost) {
                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Попросите администратора канала предоставить боту разрешение "Публиковать сообщения".`;
            }

            errorMessage = fmt`${errorMessage}${formatChangeChannelHint()}`;

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

        const mediaGroupId = message.media_group_id;

        if (mediaGroupId) {
            if (isMediaGroupValidated(mediaGroupId)) {
                return;
            }

            addMessageToGroup(
                mediaGroupId,
                message,
                async (messages: Message[], approved: boolean) => {
                    if (approved) {
                        return;
                    }

                    const firstMessage = messages[0];
                    if (!firstMessage) {
                        return;
                    }

                    const actor = extractMessageActor(firstMessage);

                    const notifications = await handleRejectionWithNotifications({
                        channelId,
                        channelTitle,
                        rejectedMessageChatId: firstMessage.chat.id,
                        rejectedMessageId: firstMessage.message_id,
                        actor,
                        includeAuthor: true,
                    });

                    try {
                        const messageIds = messages.map((m) => m.message_id).sort((a, b) => a - b);
                        await ctx.api.deleteMessages(message.chat.id, messageIds);

                        captureEvent("channel_post_moderated", actor?.id ?? null, {
                            channelId,
                            channelTitle,
                            contentKind: "album",
                            albumSize: messages.length,
                            notifiedTargets: notifications.totalTargets,
                            notificationFailures: notifications.failedTargets,
                            unreachableTargets: notifications.unreachableTargets,
                            authorKnown: typeof actor?.id === "number",
                        });
                    } catch (error) {
                        reportModerationError(error, {
                            channelId,
                            mediaGroupId,
                            messageCount: messages.length,
                            notificationTargets: notifications.totalTargets,
                            notificationFailures: notifications.failedTargets,
                        });

                        captureEvent("moderation_failed", actor?.id ?? null, {
                            channelId,
                            channelTitle,
                            contentKind: "album",
                            albumSize: messages.length,
                        });
                    }
                },
                createMediaGroupValidator(foreignAgentBlurb),
            );

            return;
        }

        if (validateMessageCompliance(message, foreignAgentBlurb)) {
            return;
        }

        const actor = extractMessageActor(message);

        const notifications = await handleRejectionWithNotifications({
            channelId,
            channelTitle,
            rejectedMessageChatId: message.chat.id,
            rejectedMessageId: message.message_id,
            actor,
            includeAuthor: true,
        });

        try {
            await ctx.api.deleteMessage(message.chat.id, message.message_id);

            captureEvent("channel_post_moderated", actor?.id ?? null, {
                channelId,
                channelTitle,
                contentKind: "single",
                notifiedTargets: notifications.totalTargets,
                notificationFailures: notifications.failedTargets,
                unreachableTargets: notifications.unreachableTargets,
                authorKnown: typeof actor?.id === "number",
            });
        } catch (error) {
            reportModerationError(error, {
                channelId,
                messageId: message.message_id,
                notificationTargets: notifications.totalTargets,
                notificationFailures: notifications.failedTargets,
            });

            captureEvent("moderation_failed", actor?.id ?? null, {
                channelId,
                channelTitle,
                contentKind: "single",
            });

            return;
        }
    });
}
