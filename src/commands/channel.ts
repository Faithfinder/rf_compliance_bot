import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import {
    resolveChannel,
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    allRequirementsPassed,
    escapeMarkdown,
} from "../utils";

export function showChannelSelectionUI(errorMessage?: string): { text: string; keyboard: Keyboard } {
    const keyboard = new Keyboard()
        .requestChat("Выбрать канал", 1, {
            chat_is_channel: true,
            bot_is_member: true,
        })
        .resized()
        .oneTime();

    let text =
        "Пожалуйста, выберите канал из кнопки ниже или используйте:\n/setchannel <@channel или ID>\n\nПример: /setchannel @mychannel";

    if (errorMessage) {
        text = `❌ ${errorMessage}\n\n${text}`;
    }

    return { text, keyboard };
}

async function processChannelSelection(ctx: SessionContext, channelIdentifier: string): Promise<void> {
    const chatId = ctx.chat!.id;

    const workingMsg = await ctx.reply("Поиск канала...");
    const channelInfo = await resolveChannel(channelIdentifier);

    if (!channelInfo) {
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

    await bot.api.editMessageText(chatId, workingMsg.message_id, "Проверка разрешений бота...");

    const requirements = await checkChannelRequirements(channelInfo.id);

    await bot.api.deleteMessage(chatId, workingMsg.message_id).catch(() => {});

    let responseText = `✅ Канал настроен!\n\n`;
    responseText += `Ваши сообщения теперь будут публиковаться в: ${formatChannelInfo(channelInfo.id, channelInfo.title)}\n\n`;
    responseText += `📋 Требования:\n${formatChannelRequirements(requirements)}`;

    if (!allRequirementsPassed(requirements)) {
        responseText += `\n\n`;

        if (!requirements.foreignAgentBlurbConfigured) {
            responseText += `**Следующий шаг:** Используйте \`${escapeMarkdown("/set_fa_blurb")} <ваш текст>\` для настройки текста иностранного агента. Только администраторы канала могут настраивать параметры.\n\n`;
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
        await ctx.reply(responseText, { reply_markup: keyboard, parse_mode: "Markdown" });
    } else {
        responseText += `\n\nОтправьте мне любое сообщение, чтобы проверить его.`;
        await ctx.reply(responseText, { reply_markup: { remove_keyboard: true } });
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

        delete ctx.session.channelConfig;

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
