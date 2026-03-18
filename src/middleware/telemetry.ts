import type { Context, NextFunction } from "grammy";
import { trackEvent } from "../config/posthog";

/**
 * Middleware to automatically track command executions
 */
export async function commandTelemetryMiddleware(ctx: Context, next: NextFunction): Promise<void> {
    const userId = ctx.from?.id;
    const messageText = ctx.message?.text || ctx.channelPost?.text;

    if (userId && messageText?.startsWith("/")) {
        const commandMatch = messageText.match(/^\/([a-zA-Z_]+)/);
        if (commandMatch) {
            const command = commandMatch[1];

            trackEvent(userId, "command_executed", {
                command,
                chat_type: ctx.chat?.type,
            });
        }
    }

    await next();
}
