import { FormattedString, b, fmt } from "@grammyjs/parse-mode";
import { bot } from "../config/bot";
import type { ChannelConfig, SessionContext } from "../config/session";
import { showChannelSelectionUI } from "./channel";
import {
    type ChannelRequirements,
    checkChannelRequirements,
    formatChannelInfo,
    formatNextSetupStep,
    moderationRequirementsPassed,
    publishRequirementsPassed,
} from "../utils";

export const START_INTRO = [
    "Добро пожаловать! 👋",
    "",
    "Я слежу за тем, чтобы в канале не осталось материала без маркировки иностранного агента. Работаю в двух режимах.",
    "",
    "1️⃣ Модерация канала — основной режим. Публикуйте в канал как обычно: я проверяю каждый пост и удаляю немаркированный, а копию присылаю автору и администраторам.",
    "",
    "2️⃣ Публикация через бота — строгий режим, по желанию. Пришлите пост мне в личные сообщения: без маркировки он в канал просто не уйдёт.",
    "",
    "⚠️ Режимы по-разному ломаются, и это главное отличие. Модерация проверяет уже опубликованный пост: подписчики успевают получить уведомление, а если бот недоступен — немаркированный пост останется в канале, и никто об этом не узнает. Публикация через бота проверяет до выхода поста: если бот недоступен, пост просто не выйдет.",
    "",
    "Я сверяю только наличие заданной строки в тексте. Это техническое средство контроля, а не юридическая консультация.",
].join("\n");

/**
 * The prompt shown before a channel is picked. `pickerText` is the channel-selection copy from
 * showChannelSelectionUI(), appended so the keyboard and its instructions stay together.
 */
export function buildSetupPrompt(pickerText: string): string {
    return [
        "Чтобы начать, выберите канал.",
        "",
        "Сначала добавьте меня в канал администратором с правом «Удалять сообщения» — кнопка ниже показывает только те каналы, где я уже состою.",
        "",
        "Сама модерация работает без привязки к вам, но выбрать канал нужно: только так я пойму, для какого канала вы задаёте текст маркировки.",
        "",
        pickerText,
    ].join("\n");
}

/**
 * Status for a user who already picked a channel. The full START_INTRO is deliberately not repeated
 * here - by this point they have seen it, and /start is mostly used to re-check state.
 */
export function buildStartStatus(channelConfig: ChannelConfig, requirements: ChannelRequirements): FormattedString {
    const sections: Array<string | FormattedString> = [
        fmt`📢 ${fmt`${b}Ваш канал:${b}`} ${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}`,
    ];

    if (moderationRequirementsPassed(requirements)) {
        sections.push(
            [
                "1️⃣ ✅ Модерация канала работает — публикуйте как обычно, немаркированные посты я удалю.",
                publishRequirementsPassed(requirements) ?
                    "2️⃣ ✅ Публикация через бота доступна — пришлите мне любой пост, чтобы проверить его."
                :   "2️⃣ ➖ Публикация через бота не настроена.",
            ].join("\n"),
        );

        if (!publishRequirementsPassed(requirements)) {
            sections.push(
                "Модерация удаляет пост уже после публикации: подписчики успевают его увидеть, а если я буду недоступен — он и вовсе останется в канале. Публикация через бота проверяет до выхода поста. Как её включить — /info.",
            );
        }
    } else {
        sections.push("1️⃣ ❌ Модерация канала пока не работает.");

        const nextStep = formatNextSetupStep(requirements);
        if (nextStep) {
            sections.push(nextStep);
        }
    }

    sections.push("Что настроено — /info, список команд — /help.");

    return FormattedString.join(sections, "\n\n");
}

export function registerStartCommand(): void {
    bot.command("start", async (ctx: SessionContext) => {
        if (!ctx.session.channelConfig) {
            const { text, keyboard } = showChannelSelectionUI();

            ctx.session.awaitingChannelSelection = true;

            await ctx.reply(START_INTRO);

            return ctx.reply(buildSetupPrompt(text), { reply_markup: keyboard });
        }

        const requirements = await checkChannelRequirements(ctx.session.channelConfig.channelId);
        const message = buildStartStatus(ctx.session.channelConfig, requirements);

        const entities = message.entities;
        return ctx.reply(message.text, entities.length ? { entities } : undefined);
    });
}
