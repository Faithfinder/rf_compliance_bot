import { Bot } from "grammy";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

/**
 * Singleton bot instance
 */
export const bot = new Bot(BOT_TOKEN);
