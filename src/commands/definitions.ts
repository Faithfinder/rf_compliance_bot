import { registerStartCommand } from "./start";
import { registerHelpCommand } from "./help";
import { registerInfoCommand } from "./info";
import { registerChannelCommands } from "./channel";
import { registerSettingsCommand } from "./settings";
import { registerNotificationCommands } from "./notifications";
import { isFixedChannelMode } from "../config/environment";

export type CommandGroup = "setup" | "notifications" | "reference";

/**
 * Rendering order of the /help sections. The commandDefinitions order below is what the Telegram
 * menu uses, so the two are deliberately independent.
 */
export const commandGroupOrder: CommandGroup[] = ["setup", "notifications", "reference"];

export const commandGroupTitles: Record<CommandGroup, string> = {
    setup: "⚙️ Настройка",
    notifications: "🔔 Уведомления",
    reference: "ℹ️ Справка",
};

export interface CommandDefinition {
    command: string;
    description: string;
    helpText: string;
    group: CommandGroup;
    register: () => void;
    available?: () => boolean;
}

export const commandDefinitions: CommandDefinition[] = [
    {
        command: "start",
        description: "Запустить бота",
        helpText: `/start - Как работает бот и что осталось настроить`,
        group: "reference",
        register: registerStartCommand,
    },
    {
        command: "help",
        description: "Показать справочное сообщение",
        helpText: `/help - Показать это справочное сообщение`,
        group: "reference",
        register: registerHelpCommand,
    },
    {
        command: "info",
        description: "Что настроено и что работает",
        helpText: `/info - Показать, какие требования выполнены и работает ли каждый из режимов`,
        group: "reference",
        register: registerInfoCommand,
    },
    {
        command: "setchannel",
        description: "Выбрать канал",
        helpText: [
            `/setchannel <@channel или ID> - Выбрать канал, за которым я слежу`,
            `Нужен и для модерации: без выбранного канала некуда записать текст маркировки`,
            `Пример: /setchannel @mychannel`,
        ].join("\n"),
        group: "setup",
        register: registerChannelCommands,
        available: () => !isFixedChannelMode(),
    },
    {
        command: "removechannel",
        description: "Удалить настройку канала",
        helpText: `/removechannel - Удалить настройку канала`,
        group: "setup",
        register: () => {}, // Registered together with setchannel
        available: () => !isFixedChannelMode(),
    },
    {
        command: "set_fa_blurb",
        description: "Задать текст маркировки",
        helpText: [
            `/set_fa_blurb <текст> - Задать текст маркировки иностранного агента для канала`,
            `Работает на оба режима. Пока текст не задан, бот не проверяет ничего: модерация канала выключена, а публиковать через бота нельзя`,
            `Без аргументов показывает текущий текст`,
            `Пример: /set_fa_blurb НАСТОЯЩИЙ МАТЕРИАЛ (ИНФОРМАЦИЯ) ПРОИЗВЕДЕН И РАСПРОСТРАНЕН ИНОСТРАННЫМ АГЕНТОМ «ИМЯ АГЕНТА» ЛИБО КАСАЕТСЯ ДЕЯТЕЛЬНОСТИ ИНОСТРАННОГО АГЕНТА «ИМЯ АГЕНТА». 18+`,
        ].join("\n"),
        group: "setup",
        register: registerSettingsCommand,
    },
    {
        command: "notify_add",
        description: "Добавить получателя уведомлений",
        helpText: [
            `/notify_add - Добавить администратора в список получателей уведомлений. Откроется кнопка для выбора пользователя`,
            `Получатели видят копию каждого удалённого или отклонённого поста. Не обязательно: без них модерация работает, просто удаляет молча`,
        ].join("\n"),
        group: "notifications",
        register: registerNotificationCommands,
    },
    {
        command: "notify_remove",
        description: "Удалить получателя уведомлений",
        helpText: `/notify_remove - Удалить администратора из списка получателей уведомлений. Откроется кнопка для выбора пользователя`,
        group: "notifications",
        register: () => {},
    },
    {
        command: "notify_list",
        description: "Показать список получателей уведомлений",
        helpText: `/notify_list - Показать список администраторов, получающих уведомления`,
        group: "notifications",
        register: () => {},
    },
];
