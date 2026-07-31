import { bot } from "../config/bot";
import { commandDefinitions } from "../commands/definitions";
import { captureEvent } from "./events";

// /dump_db is registered outside commandDefinitions on purpose, so it has to be listed here or
// every invocation of it would be recorded as an unknown command.
const HIDDEN_COMMANDS = ["dump_db"];

// A command token made of digits is far more likely to be a Telegram user id than a mistyped
// command - /notify_add and /notify_remove take raw numeric ids as arguments, so the shape turns up
// naturally. Unknown tokens are user-controlled, so any that could be an identifier are collapsed
// into one harmless bucket rather than sent.
const IDENTIFIER_SHAPED = /\d{5,}/;

function sanitizeUnknownCommand(command: string): string {
    if (/^\d+$/.test(command) || IDENTIFIER_SHAPED.test(command)) {
        return "redacted";
    }

    return command;
}

export function registerCommandTelemetry(): void {
    // Every definition is included regardless of available(): /setchannel still exists as a name in
    // fixed channel mode, and reporting it as unknown would be misleading.
    const knownCommands = new Set([...commandDefinitions.map((cmd) => cmd.command), ...HIDDEN_COMMANDS]);

    bot.chatType(["private", "group", "supergroup"]).use(async (ctx, next) => {
        // Reading the entities and the session happens outside captureEvent's own guard, so this
        // needs a try/catch of its own. A telemetry failure must never cost the user their command.
        try {
            // Only a command at offset 0 invokes a handler; a command mentioned later in the text is
            // just text. This mirrors what grammY's own bot.command() triggers on.
            const entity = ctx.entities("bot_command").find((candidate) => candidate.offset === 0);

            if (entity) {
                const command = entity.text.slice(1).split("@")[0]?.toLowerCase() ?? "";
                const text = ctx.msg?.text ?? "";
                // Arguments are reduced to a boolean and never sent. /notify_add and /notify_remove
                // carry a raw Telegram user id here, which is exactly what the hashing exists to
                // protect, and /start deep link payloads are in the same position.
                const hasArgs = text.slice(entity.offset + entity.length).trim() !== "";

                if (knownCommands.has(command)) {
                    captureEvent("command_invoked", ctx.from?.id ?? null, {
                        command,
                        chatType: ctx.chat.type,
                        hasArgs,
                        channelConfigured: ctx.session.channelConfig !== undefined,
                    });
                } else {
                    captureEvent("unknown_command", ctx.from?.id ?? null, {
                        command: sanitizeUnknownCommand(command),
                        chatType: ctx.chat.type,
                    });
                }
            }
        } catch (error) {
            console.error("Failed to record command telemetry:", error);
        }

        return next();
    });
}
