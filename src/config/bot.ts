import { Bot } from "grammy";
import type { SessionContext } from "./session";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

export const bot = new Bot<SessionContext>(BOT_TOKEN);

export async function setBotCommands(): Promise<void> {
    try {
        await bot.api.setMyCommands([
            { command: "start", description: "Запустить бота" },
            { command: "help", description: "Показать справочное сообщение" },
            { command: "info", description: "Показать конфигурацию бота" },
            { command: "setchannel", description: "Настроить канал" },
            { command: "removechannel", description: "Удалить настройку канала" },
            { command: "set_fa_blurb", description: "Настроить текст иностранного агента" },
        ]);
        console.warn("Bot commands menu configured successfully");
    } catch (error) {
        console.warn("Failed to set bot commands:", error);
    }
}
