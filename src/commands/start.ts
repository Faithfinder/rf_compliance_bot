import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import { showChannelSelectionUI } from "./channel";
import { formatChannelInfo } from "../utils";

export function registerStartCommand(): void {
    bot.command("start", async (ctx: SessionContext) => {
        const welcomeMessage = `
Welcome to the RF Compliance Bot! 👋

I can help you with RF compliance information and regulations.
    `.trim();

        if (!ctx.session.channelConfig) {
            const { text, keyboard } = showChannelSelectionUI();

            ctx.session.awaitingChannelSelection = true;

            await ctx.reply(welcomeMessage);
            return ctx.reply(`To get started, please configure a channel where I'll post your messages:\n\n${text}`, {
                reply_markup: keyboard,
            });
        }

        const channelInfo = formatChannelInfo(
            ctx.session.channelConfig.channelId,
            ctx.session.channelConfig.channelTitle,
        );

        return ctx.reply(
            `${welcomeMessage}\n\n✅ Your channel is configured: ${channelInfo}\n\nUse /help to see available commands.`,
        );
    });
}
