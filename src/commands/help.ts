import { bot } from "../config/bot";

/**
 * Registers the /help command handler
 */
export function registerHelpCommand(): void {
    bot.command("help", (ctx) => {
        const helpMessage = `
Available commands:

/start - Start the bot and see welcome message
/help - Show this help message
/setchannel <@channel or ID> - Configure channel to post your messages to
/channelstatus - Show your current channel configuration
/removechannel - Remove your channel configuration

Example: /setchannel @mychannel
    `.trim();

        return ctx.reply(helpMessage);
    });
}
