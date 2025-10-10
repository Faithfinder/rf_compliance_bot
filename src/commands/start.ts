import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import { showChannelSelectionUI } from "./channel";
import { formatChannelInfo, escapeHtml } from "../utils";

export function registerStartCommand(): void {
    bot.command("start", async (ctx: SessionContext) => {
        const welcomeMessage =
            "Добро пожаловать в RF Compliance Bot! 👋\n\nЯ могу помочь вам с соответствием требованиям РФ об иностранных агентах.";

        if (!ctx.session.channelConfig) {
            const { text, keyboard } = showChannelSelectionUI();

            ctx.session.awaitingChannelSelection = true;

            await ctx.reply(welcomeMessage);
            const setupPrompt =
                `Для начала работы настройте канал, куда я буду публиковать ваши сообщения:\n\n` +
                text;
            return ctx.reply(setupPrompt, {
                reply_markup: keyboard,
                parse_mode: "HTML",
            });
        }

        const channelInfo = formatChannelInfo(
            ctx.session.channelConfig.channelId,
            ctx.session.channelConfig.channelTitle,
        );

        return ctx.reply(
            `${escapeHtml(welcomeMessage)}\n\n` +
                `✅ Ваш канал настроен: ${channelInfo}\n\n` +
                `Используйте ${escapeHtml("/help")} для просмотра доступных команд.`,
            { parse_mode: "HTML" },
        );
    });
}
