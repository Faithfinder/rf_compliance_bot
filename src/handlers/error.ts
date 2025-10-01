import * as Sentry from "@sentry/bun";
import { bot } from "../config/bot";

export function registerErrorHandler(): void {
    bot.catch((err) => {
        const ctx = err.ctx;
        console.error(`Error while handling update ${ctx.update.update_id}:`);
        console.error("Error:", err.error);

        Sentry.withScope((scope) => {
            scope.setContext("telegram_update", {
                update_id: ctx.update.update_id,
                user_id: ctx.from?.id,
                username: ctx.from?.username,
                chat_id: ctx.chat?.id,
                message_text: ctx.message?.text,
            });
            scope.setTag("bot", "telegram");
            Sentry.captureException(err.error);
        });
    });
}
