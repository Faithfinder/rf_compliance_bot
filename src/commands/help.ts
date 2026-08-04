import { bot } from "../config/bot";
import { commandDefinitions, commandGroupOrder, commandGroupTitles } from "./definitions";

export const HELP_PREAMBLE = [
    "Я слежу за тем, чтобы в канале не осталось материала без маркировки иностранного агента. Работаю в двух режимах.",
    "",
    "1️⃣ Модерация канала — основной режим. Немаркированный пост, попавший в канал, удаляется, а копия уходит автору и администраторам.",
    "",
    "2️⃣ Публикация через бота — строгий режим, по желанию. Пост из личных сообщений уходит в канал, только если маркировка на месте.",
    "",
    "Разница в том, как они ломаются: модерация проверяет уже опубликованный пост, и при недоступном боте немаркированный пост останется в канале незамеченным. Публикация через бота при недоступном боте просто не выпустит пост.",
].join("\n");

export function buildHelpMessage(): string {
    const availableCommands = commandDefinitions.filter((cmd) => !cmd.available || cmd.available());

    const groupBlocks = commandGroupOrder
        .map((group) => {
            const helpTexts = availableCommands.filter((cmd) => cmd.group === group).map((cmd) => cmd.helpText);

            // Fixed-channel mode strips /setchannel and /removechannel, so a group can end up
            // empty and must not render as a bare heading.
            if (helpTexts.length === 0) {
                return null;
            }

            return `${commandGroupTitles[group]}\n\n${helpTexts.join("\n\n")}`;
        })
        .filter((block): block is string => block !== null);

    return [HELP_PREAMBLE, ...groupBlocks, "Что настроено и что работает: /info"].join("\n\n");
}

export function registerHelpCommand(): void {
    bot.command("help", (ctx) => ctx.reply(buildHelpMessage()));
}
