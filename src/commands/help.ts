import { bot } from "../config/bot";
import { trackEvent } from "../config/posthog";
import { commandDefinitions } from "./definitions";

export function registerHelpCommand(): void {
    bot.command("help", (ctx) => {
        const userId = ctx.from?.id;
        if (userId) {
            trackEvent(userId, "command_executed", {
                command: "help",
            });
        }

        const commandList = commandDefinitions
            .filter((cmd) => !cmd.available || cmd.available())
            .map((cmd) => cmd.helpText)
            .join("\n\n");

        const helpMessage = `Доступные команды:\n\n${commandList}`;

        return ctx.reply(helpMessage);
    });
}
