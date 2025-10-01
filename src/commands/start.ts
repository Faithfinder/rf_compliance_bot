import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import { showChannelSelectionUI } from "./channel";
import { formatChannelInfo } from "../utils";

/**
 * Registers the /start command handler
 */
export function registerStartCommand(): void {
    bot.command("start", async (ctx: SessionContext) => {
        const welcomeMessage = `
Welcome to the RF Compliance Bot! 👋

I can help you with RF compliance information and regulations.
    `.trim();

        // Check if user has a channel configured
        if (!ctx.session.channelConfig) {
            // User hasn't set up a channel yet - show channel selection UI
            const { text, keyboard } = showChannelSelectionUI();

            ctx.session.awaitingChannelSelection = true;

            await ctx.reply(welcomeMessage);
            return ctx.reply(
                `To get started, please configure a channel where I'll post your messages:\n\n${text}`,
                { reply_markup: keyboard },
            );
        }

        // User already has a channel configured
        const channelInfo = formatChannelInfo(
            ctx.session.channelConfig.channelId,
            ctx.session.channelConfig.channelTitle,
        );

        return ctx.reply(
            `${welcomeMessage}\n\n✅ Your channel is configured: ${channelInfo}\n\nUse /help to see available commands.`,
        );
    });
}
