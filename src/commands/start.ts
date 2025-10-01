import { Bot, Context } from "grammy";

/**
 * Registers the /start command handler
 */
export function registerStartCommand(bot: Bot<Context>): void {
    bot.command("start", (ctx) => {
        const welcomeMessage = `
Welcome to the RF Compliance Bot! 👋

I can help you with RF compliance information and regulations.

Use /help to see available commands.
    `.trim();

        return ctx.reply(welcomeMessage);
    });
}
