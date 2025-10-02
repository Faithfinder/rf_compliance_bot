import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import { showChannelSelectionUI } from "./channel";
import { formatChannelInfo } from "../utils";

export function registerStartCommand(): void {
    bot.command("start", async (ctx: SessionContext) => {
        const welcomeMessage = `
Добро пожаловать в RF Compliance Bot! 👋

Я могу помочь вам с соответствием требованиям РФ об иностранных агентах.
    `.trim();

        if (!ctx.session.channelConfig) {
            const { text, keyboard } = showChannelSelectionUI();

            ctx.session.awaitingChannelSelection = true;

            await ctx.reply(welcomeMessage);
            return ctx.reply(`Для начала работы настройте канал, куда я буду публиковать ваши сообщения:\n\n${text}`, {
                reply_markup: keyboard,
            });
        }

        const channelInfo = formatChannelInfo(
            ctx.session.channelConfig.channelId,
            ctx.session.channelConfig.channelTitle,
        );

        return ctx.reply(
            `${welcomeMessage}\n\n✅ Ваш канал настроен: ${channelInfo}\n\nИспользуйте /help для просмотра доступных команд.`,
        );
    });
}
