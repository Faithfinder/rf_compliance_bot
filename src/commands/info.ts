import { bot } from "../config/bot";
import { formatChannelInfo } from "../utils";

export function registerInfoCommand(): void {
    bot.command("info", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId || !ctx.from) {
            return ctx.reply("Unable to identify user.");
        }

        const channelConfig = ctx.session.channelConfig;

        let infoMessage = "🤖 *Bot Configuration*\n\n";
        infoMessage += `👤 *User:* ${ctx.from.first_name}`;
        if (ctx.from.username) {
            infoMessage += ` (@${ctx.from.username})`;
        }
        infoMessage += `\n📱 *User ID:* \`${userId}\`\n\n`;

        if (channelConfig) {
            infoMessage += `📢 *Configured Channel:*\n`;
            infoMessage += `${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}\n\n`;
            infoMessage += `✅ Messages will be posted to this channel\n`;
            infoMessage += `Use /removechannel to remove this configuration`;
        } else {
            infoMessage += `📢 *Configured Channel:* None\n\n`;
            infoMessage += `❌ No channel configured\n`;
            infoMessage += `Use /setchannel to configure one`;
        }

        return ctx.reply(infoMessage, { parse_mode: "Markdown" });
    });
}
