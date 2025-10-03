import { bot } from "../config/bot";
import { commandDefinitions } from "./definitions";

export function registerHelpCommand(): void {
    bot.command("help", (ctx) => {
        const commandList = commandDefinitions.map((cmd) => cmd.helpText).join("\n\n");

        const helpMessage = `Доступные команды:\n\n${commandList}`;

        return ctx.reply(helpMessage);
    });
}
