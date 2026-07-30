import * as Sentry from "@sentry/bun";
import { bot } from "../config/bot";
import { extractMessageText } from "./message-helpers";

// Rich messages can hold up to 32768 characters, far more than is useful in an error report.
const MAX_REPORTED_TEXT_LENGTH = 1024;

export function registerErrorHandler(): void {
    bot.catch((err) => {
        const ctx = err.ctx;
        console.error(`Error while handling update ${ctx.update.update_id}:`);
        console.error("Error:", err.error);

        const messageText = ctx.msg ? extractMessageText(ctx.msg).slice(0, MAX_REPORTED_TEXT_LENGTH) : undefined;

        Sentry.withScope((scope) => {
            scope.setContext("telegram_update", {
                update_id: ctx.update.update_id,
                user_id: ctx.from?.id,
                username: ctx.from?.username,
                chat_id: ctx.chat?.id,
                message_text: messageText,
            });
            scope.setTag("bot", "telegram");
            Sentry.captureException(err.error);
        });
    });
}
