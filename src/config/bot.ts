import { Bot } from "grammy";

/**
 * Creates and configures the bot instance
 * @returns The configured Bot instance
 * @throws Error if TELEGRAM_BOT_TOKEN is not set
 */
export function createBot(): Bot {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
    }

    return new Bot(BOT_TOKEN);
}
