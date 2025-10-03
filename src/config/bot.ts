import { Bot } from "grammy";
import type { SessionContext } from "./session";
import { commandDefinitions } from "../commands/definitions";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

export const bot = new Bot<SessionContext>(BOT_TOKEN);

export async function setBotCommands(): Promise<void> {
    try {
        const commands = commandDefinitions
            .filter((cmd) => !cmd.available || cmd.available())
            .map((cmd) => ({
                command: cmd.command,
                description: cmd.description,
            }));

        await bot.api.setMyCommands(commands);
        console.warn(`Bot commands registered: ${commands.length} commands`);

        await bot.api.setChatMenuButton({
            menu_button: { type: "commands" },
        });
        console.warn("Bot menu button configured to show commands");
    } catch (error) {
        console.warn("Failed to configure bot commands:", error);
    }
}
