import * as Sentry from "@sentry/bun";
import { Bot, Context } from "grammy";

/**
 * Registers the global error handler for the bot
 */
export function registerErrorHandler(bot: Bot<Context>, sentryEnabled: boolean): void {
    bot.catch((err) => {
        const ctx = err.ctx;
        console.error(`Error while handling update ${ctx.update.update_id}:`);
        console.error("Error:", err.error);

        // Send error to Sentry with context
        if (sentryEnabled) {
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
        }
    });
}
