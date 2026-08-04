import { Keyboard } from "grammy";
import { FormattedString, b, fmt } from "@grammyjs/parse-mode";
import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import {
    resolveChannel,
    formatChannelInfo,
    checkChannelRequirements,
    formatCommonRequirements,
    formatModerationRequirements,
    formatNextSetupStep,
    moderationRequirementsPassed,
    publishRequirementsPassed,
} from "../utils";
import { identifyChannel } from "../config/posthog";
import { captureEvent, type ChannelSource } from "../telemetry/events";

export function showChannelSelectionUI(errorMessage?: string): { text: string; keyboard: Keyboard } {
    const keyboard = new Keyboard()
        .requestChat("Выбрать канал", 1, {
            chat_is_channel: true,
            bot_is_member: true,
        })
        .resized()
        .oneTime();

    const baseText = [
        "Выберите канал кнопкой ниже или укажите вручную:",
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

async function processChannelSelection(
    ctx: SessionContext,
    channelIdentifier: string,
    source: ChannelSource,
): Promise<void> {
    const chatId = ctx.chat!.id;

    const workingMsg = await ctx.reply("Поиск канала...");
    const channelInfo = await resolveChannel(channelIdentifier);

    if (!channelInfo) {
        await bot.api.deleteMessage(chatId, workingMsg.message_id).catch(() => {});
        const errorMessage =
            "Не удаётся найти этот канал или получить к нему доступ. Убедитесь, что бот добавлен в канал администратором.";
        const { text, keyboard } = showChannelSelectionUI(errorMessage);
        ctx.session.awaitingChannelSelection = true;
        await ctx.reply(text, { reply_markup: keyboard });
        return;
    }

    ctx.session.channelConfig = {
        channelId: channelInfo.id,
        channelTitle: channelInfo.title,
    };

    await bot.api.editMessageText(chatId, workingMsg.message_id, "Проверка разрешений бота...");

    const requirements = await checkChannelRequirements(channelInfo.id);

    await bot.api.deleteMessage(chatId, workingMsg.message_id).catch(() => {});

    identifyChannel(channelInfo.id, channelInfo.title);

    // The field set behind publishRequirementsPassed is unchanged from the former
    // allRequirementsPassed, so this property stays comparable with historical events.
    captureEvent("channel_configured", ctx.from?.id ?? "anonymous", {
        channelId: channelInfo.id,
        channelTitle: channelInfo.title,
        source,
        requirementsSatisfied: publishRequirementsPassed(requirements),
    });

    const moderationReady = moderationRequirementsPassed(requirements);

    const sections: Array<string | FormattedString> = [
        "✅ Канал выбран!",
        fmt`📢 ${formatChannelInfo(channelInfo.id, channelInfo.title)}`,
        fmt`📋 ${fmt`${b}Общее:${b}`}\n${formatCommonRequirements(requirements)}`,
        fmt`1️⃣ ${fmt`${b}Модерация канала${b}`} — ${moderationReady ? "✅ работает" : "❌ не работает"}\n${formatModerationRequirements(requirements)}`,
    ];

    let responseMessage = FormattedString.join(sections, "\n\n");

    const nextStep = formatNextSetupStep(requirements);

    if (nextStep) {
        responseMessage = FormattedString.join([responseMessage, nextStep], "\n\n");

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
        const closing =
            publishRequirementsPassed(requirements) ?
                "Теперь я проверяю посты в канале. Хотите проверять до публикации — пришлите пост мне сюда, и я опубликую его сам."
            :   "Теперь я проверяю посты в канале. Что настроено — /info.";

        responseMessage = FormattedString.join([responseMessage, closing], "\n\n");
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
        return processChannelSelection(ctx, channelIdentifier, "command");
    });

    bot.command("removechannel", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        const channelConfig = ctx.session.channelConfig;

        if (!channelConfig) {
            return ctx.reply("У вас не настроен канал.");
        }

        delete ctx.session.channelConfig;

        captureEvent("channel_removed", userId, {
            channelId: channelConfig.channelId,
            channelTitle: channelConfig.channelTitle,
        });

        return ctx.reply(
            "✅ Настройка канала удалена.\n\nПубликовать через бота больше нельзя. Модерация канала при этом продолжает работать: она привязана к каналу, а не к вам, — чтобы выключить её, уберите бота из администраторов канала.",
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
        return processChannelSelection(ctx, channelId, "chat_shared");
    });
}
