import { b, fmt } from "@grammyjs/parse-mode";
import { Keyboard } from "grammy";
import type { Message } from "grammy/types";
import { bot } from "../config/bot";
import { trackEvent } from "../config/posthog";
import {
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    checkUserChannelPermissions,
} from "../utils";
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

                            trackEvent(userId, "message_posted", {
                                channel_id: channelConfig.channelId,
                                message_type: "media_group",
                                media_count: messages.length,
                            });

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
                        } catch (error) {
                            reportChannelPostError(error, {
                                userId,
                                channelId: channelConfig.channelId,
                                channelTitle: channelConfig.channelTitle,
                                mediaGroupId,
                            });

                            const requirements = await checkChannelRequirements(channelConfig.channelId);
                            let errorMessage = fmt`❌ Не удалось опубликовать альбом в ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n📋 Требования:\n${formatChannelRequirements(requirements)}\n\n`;

                            if (!requirements.channelExists) {
                                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Канал больше не существует или бот не может получить к нему доступ. Пожалуйста, выберите другой канал.`;
                            } else if (!requirements.botIsAdded) {
                                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Попросите администратора канала добавить этого бота в качестве администратора в канал.`;
                            } else if (!requirements.botCanPost) {
                                errorMessage = fmt`${errorMessage}${fmt`${b}Следующий шаг:${b}`} Попросите администратора канала предоставить боту разрешение "Публиковать сообщения".`;
                            }

                            errorMessage = fmt`${errorMessage}\n\nИли используйте /setchannel для настройки другого канала`;

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

                        trackEvent(userId, "message_rejected", {
                            channel_id: channelConfig.channelId,
                            message_type: "media_group",
                            media_count: messages.length,
                            reason: "missing_foreign_agent_text",
                        });

                        await handleRejectionWithNotifications({
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

                        let errorMessage = fmt`❌ Невозможно опубликовать альбом: Ваше сообщение должно содержать текст иностранного агента.\n\n🌍 ${fmt`${b}Необходимый текст:${b}`}\n${foreignAgentBlurb}\n\nПожалуйста, добавьте этот текст к вашему сообщению и повторите попытку.\nОригинальное сообщение:`;

                        const messageIds = messages.map((m) => m.message_id).sort((a, b) => a - b);
                        await ctx.api.copyMessages(ctx.chat.id, ctx.chat.id, messageIds);

                        const entities = errorMessage.entities;
                        await ctx.api.sendMessage(
                            ctx.chat.id,
                            errorMessage.text,
                            entities.length ? { entities } : undefined,
                        );
                    }
                },
                createMediaGroupValidator(foreignAgentBlurb),
            );

            return;
        }

        if (!validateMessageCompliance(ctx.message, foreignAgentBlurb)) {
            trackEvent(userId, "message_rejected", {
                channel_id: channelConfig.channelId,
                message_type: "single",
                reason: "missing_foreign_agent_text",
            });

            await handleRejectionWithNotifications({
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

            let errorMessage = fmt`❌ Невозможно опубликовать сообщение: Ваше сообщение должно содержать текст иностранного агента.\n\n🌍 ${fmt`${b}Необходимый текст:${b}`}\n${foreignAgentBlurb}\n\nПожалуйста, добавьте этот текст к вашему сообщению и повторите попытку.\nОригинальное сообщение:`;

            await ctx.api.copyMessage(ctx.chat.id, ctx.chat.id, ctx.message.message_id);

            const entities = errorMessage.entities;
            return await ctx.reply(errorMessage.text, entities.length ? { entities } : undefined);
        }

        try {
            await ctx.api.copyMessage(channelConfig.channelId, ctx.chat.id, ctx.message.message_id);

            trackEvent(userId, "message_posted", {
                channel_id: channelConfig.channelId,
                message_type: "single",
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

                    if (actor?.id) {
                        trackEvent(actor.id, "channel_post_moderated", {
                            channel_id: channelId,
                            message_type: "media_group",
                            media_count: messages.length,
                            reason: "missing_foreign_agent_text",
                        });
                    }

                    await handleRejectionWithNotifications({
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
                    } catch (error) {
                        reportModerationError(error, {
                            channelId,
                            mediaGroupId,
                            messageCount: messages.length,
                            notificationTargets: 0,
                            notificationFailures: 0,
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

        if (actor?.id) {
            trackEvent(actor.id, "channel_post_moderated", {
                channel_id: channelId,
                message_type: "single",
                reason: "missing_foreign_agent_text",
            });
        }

        await handleRejectionWithNotifications({
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
            reportModerationError(error, {
                channelId,
                messageId: message.message_id,
                notificationTargets: 0,
                notificationFailures: 0,
            });

            return;
        }
    });
}
