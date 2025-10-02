import { bot } from "../config/bot";

export function registerHelpCommand(): void {
    bot.command("help", (ctx) => {
        const helpMessage = `
Доступные команды:

/start - Запустить бота и показать приветственное сообщение
/help - Показать это справочное сообщение
/info - Показать сводку конфигурации бота
/setchannel <@channel или ID> - Настроить канал для публикации ваших сообщений
/removechannel - Удалить настройку канала

Пример: /setchannel @mychannel
    `.trim();

        return ctx.reply(helpMessage);
    });
}
