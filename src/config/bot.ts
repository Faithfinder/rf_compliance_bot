import { Bot } from "grammy";
import type { SessionContext } from "./session";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

export const bot = new Bot<SessionContext>(BOT_TOKEN);
