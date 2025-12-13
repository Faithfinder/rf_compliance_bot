import { fmt } from "@grammyjs/parse-mode";
import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import { trackEvent } from "../config/posthog";
import { showChannelSelectionUI } from "./channel";
import { formatChannelInfo } from "../utils";

export function registerStartCommand(): void {
    bot.command("start", async (ctx: SessionContext) => {
        const userId = ctx.from?.id;
        if (userId) {
            trackEvent(userId, "command_executed", {
                command: "start",
                has_channel_config: !!ctx.session.channelConfig,
            });
        }
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
            });
        }

        const channelInfo = formatChannelInfo(
            ctx.session.channelConfig.channelId,
            ctx.session.channelConfig.channelTitle,
        );

        const message = fmt`${welcomeMessage}\n\n✅ Ваш канал настроен: ${channelInfo}\n\nИспользуйте /help для просмотра доступных команд.`;
        const entities = message.entities;
        return ctx.reply(message.text, entities.length ? { entities } : undefined);
    });
}
