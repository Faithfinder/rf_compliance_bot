import { existsSync } from "fs";
import { join } from "path";
import { InputFile } from "grammy";
import { bot } from "../config/bot";
import { getBotOwnerId } from "../config/environment";

const DATABASE_PATH = join(process.cwd(), "data", "channels.db");

export function registerDumpDbCommand(): void {
    const ownerId = getBotOwnerId();

    if (!ownerId) {
        console.warn("BOT_OWNER_ID is not set; /dump_db command will remain disabled.");
        return;
    }

    bot.command("dump_db", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId || userId !== ownerId) {
            console.warn(`Unauthorized /dump_db attempt by user ${userId ?? "unknown"}.`);
            return;
        }

        if (ctx.chat.type !== "private") {
            await ctx.reply("Эта команда доступна только в приватном чате с ботом.");
            return;
        }

        if (!existsSync(DATABASE_PATH)) {
            await ctx.reply("Файл базы данных не найден.");
            return;
        }

        try {
            const file = new InputFile(DATABASE_PATH, "channels.db");
            await ctx.replyWithDocument(file, {
                caption: "📦 Резервная копия базы данных каналов.",
            });
        } catch (error) {
            console.error("Failed to send database dump:", error);
            await ctx.reply("Не удалось отправить файл базы данных. Проверьте логи сервера.");
        }
    });
}
