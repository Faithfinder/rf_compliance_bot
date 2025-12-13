import { Keyboard } from "grammy";
import { FormattedString, b, fmt } from "@grammyjs/parse-mode";
import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import { trackEvent } from "../config/posthog";
import {
    resolveChannel,
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    allRequirementsPassed,
} from "../utils";

export function showChannelSelectionUI(errorMessage?: string): { text: string; keyboard: Keyboard } {
    const keyboard = new Keyboard()
        .requestChat("Выбрать канал", 1, {
            chat_is_channel: true,
            bot_is_member: true,
        })
        .resized()
        .oneTime();

    const baseText = [
        "Пожалуйста, выберите канал из кнопки ниже или используйте:",
        "/setchannel <@channel или ID>",
        "",
        "Пример: /setchannel @mychannel",
    ].join("\n");

    let text = baseText;

    if (errorMessage) {
        text = `❌ ${errorMessage}\n\n${text}`;
    }

    return { text, keyboard };
}

async function processChannelSelection(ctx: SessionContext, channelIdentifier: string): Promise<void> {
    const chatId = ctx.chat!.id;
    const userId = ctx.from?.id;

    const workingMsg = await ctx.reply("Поиск канала...");
    const channelInfo = await resolveChannel(channelIdentifier);

    if (!channelInfo) {
        if (userId) {
            trackEvent(userId, "channel_selection_failed", {
                channel_identifier: channelIdentifier,
                reason: "channel_not_found",
            });
        }
        await bot.api.deleteMessage(chatId, workingMsg.message_id).catch(() => {});
        const errorMessage =
            "Не удается найти или получить доступ к этому каналу. Убедитесь, что бот был добавлен в канал в качестве администратора.";
        const { text, keyboard } = showChannelSelectionUI(errorMessage);
        ctx.session.awaitingChannelSelection = true;
        await ctx.reply(text, { reply_markup: keyboard });
        return;
    }

    ctx.session.channelConfig = {
        channelId: channelInfo.id,
        channelTitle: channelInfo.title,
    };

    if (userId) {
        trackEvent(userId, "channel_configured", {
            channel_id: channelInfo.id,
            channel_title: channelInfo.title,
        });
    }

    await bot.api.editMessageText(chatId, workingMsg.message_id, "Проверка разрешений бота...");

    const requirements = await checkChannelRequirements(channelInfo.id);

    await bot.api.deleteMessage(chatId, workingMsg.message_id).catch(() => {});

    const sections: Array<string | FormattedString> = [
        "✅ Канал настроен!",
        fmt`Ваши сообщения теперь будут публиковаться в: ${formatChannelInfo(channelInfo.id, channelInfo.title)}`,
        fmt`📋 Требования:\n${formatChannelRequirements(requirements)}`,
    ];

    let responseMessage = FormattedString.join(sections, "\n\n");

    if (!allRequirementsPassed(requirements)) {
        const additional: Array<string | FormattedString> = [];
        if (!requirements.foreignAgentBlurbConfigured) {
            additional.push(
                fmt`${fmt`${b}Следующий шаг:${b}`} Используйте /set_fa_blurb <ваш текст> для настройки текста иностранного агента. Только администраторы канала могут настраивать параметры.`,
            );
        }

        if (additional.length > 0) {
            responseMessage = FormattedString.join([responseMessage, FormattedString.join(additional, "\n\n")], "\n\n");
        }

        const keyboard = new Keyboard()
            .requestChat("Выбрать другой канал", 2, {
                chat_is_channel: true,
                bot_is_member: true,
            })
            .text("/removechannel")
            .resized()
            .oneTime();

        ctx.session.awaitingChannelSelection = true;
        const entities = responseMessage.entities;
        await ctx.reply(responseMessage.text, {
            reply_markup: keyboard,
            ...(entities.length ? { entities } : {}),
        });
    } else {
        responseMessage = FormattedString.join(
            [responseMessage, "Отправьте мне любое сообщение, чтобы проверить его."],
            "\n\n",
        );
        const entities = responseMessage.entities;
        await ctx.reply(responseMessage.text, {
            reply_markup: { remove_keyboard: true },
            ...(entities.length ? { entities } : {}),
        });
    }
}

export function registerChannelCommands(): void {
    bot.command("setchannel", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        const args = ctx.match;
        if (!args || typeof args !== "string" || args.trim() === "") {
            const { text, keyboard } = showChannelSelectionUI();
            ctx.session.awaitingChannelSelection = true;
            return ctx.reply(text, { reply_markup: keyboard });
        }

        const channelIdentifier = args.trim();
        return processChannelSelection(ctx, channelIdentifier);
    });

    bot.command("removechannel", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        if (!ctx.session.channelConfig) {
            return ctx.reply("У вас не настроен канал.");
        }

        const channelId = ctx.session.channelConfig.channelId;
        delete ctx.session.channelConfig;

        trackEvent(userId, "channel_removed", {
            channel_id: channelId,
        });

        return ctx.reply(
            "✅ Конфигурация канала успешно удалена.\n\nВаши сообщения больше не будут публиковаться ни в какой канал.",
        );
    });

    bot.on("message:chat_shared", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        if (!ctx.session.awaitingChannelSelection) {
            return;
        }

        ctx.session.awaitingChannelSelection = false;
        const chatShared = ctx.message.chat_shared;

        if (chatShared.request_id !== 1 && chatShared.request_id !== 2) {
            return;
        }

        const channelId = chatShared.chat_id.toString();
        return processChannelSelection(ctx, channelId);
    });
}
