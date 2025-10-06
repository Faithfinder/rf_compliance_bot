import { registerStartCommand } from "./start";
import { registerHelpCommand } from "./help";
import { registerInfoCommand } from "./info";
import { registerChannelCommands } from "./channel";
import { registerSettingsCommand } from "./settings";
import { registerNotificationCommands } from "./notifications";
import { isFixedChannelMode } from "../config/environment";
import { escapeMarkdown } from "../utils";

export interface CommandDefinition {
    command: string;
    description: string;
    helpText: string;
    register: () => void;
    available?: () => boolean;
}

export const commandDefinitions: CommandDefinition[] = [
    {
        command: "start",
        description: "Запустить бота",
        helpText: "/start - Запустить бота и показать приветственное сообщение",
        register: registerStartCommand,
    },
    {
        command: "help",
        description: "Показать справочное сообщение",
        helpText: "/help - Показать это справочное сообщение",
        register: registerHelpCommand,
    },
    {
        command: "info",
        description: "Показать конфигурацию бота",
        helpText: "/info - Показать сводку конфигурации бота",
        register: registerInfoCommand,
    },
    {
        command: "setchannel",
        description: "Настроить канал",
        helpText:
            "/setchannel <@channel или ID> - Настроить канал для публикации ваших сообщений\nПример: /setchannel @mychannel",
        register: registerChannelCommands,
        available: () => !isFixedChannelMode(),
    },
    {
        command: "removechannel",
        description: "Удалить настройку канала",
        helpText: "/removechannel - Удалить настройку канала",
        register: () => {}, // Registered together with setchannel
        available: () => !isFixedChannelMode(),
    },
    {
        command: "set_fa_blurb",
        description: "Настроить текст иностранного агента",
        helpText:
            `${escapeMarkdown("/set_fa_blurb")} <текст> - Настроить текст иностранного агента для канала\nПример: ${escapeMarkdown("/set_fa_blurb")} НАСТОЯЩИЙ МАТЕРИАЛ (ИНФОРМАЦИЯ) ПРОИЗВЕДЕН И РАСПРОСТРАНЕН ИНОСТРАННЫМ АГЕНТОМ «ИМЯ АГЕНТА» ЛИБО КАСАЕТСЯ ДЕЯТЕЛЬНОСТИ ИНОСТРАННОГО АГЕНТА «ИМЯ АГЕНТА». 18+`,
        register: registerSettingsCommand,
    },
    {
        command: "notify_add",
        description: "Добавить получателя уведомлений",
        helpText:
            `${escapeMarkdown("/notify_add")} \\[ID\\] - Добавить администратора в список получателей уведомлений об отклоненных сообщениях\nПример: ${escapeMarkdown("/notify_add")} 123456789\nИли используйте команду без параметров для выбора через кнопку`,
        register: registerNotificationCommands,
    },
    {
        command: "notify_remove",
        description: "Удалить получателя уведомлений",
        helpText:
            `${escapeMarkdown("/notify_remove")} \\[ID\\] - Удалить администратора из списка получателей уведомлений\nПример: ${escapeMarkdown("/notify_remove")} 123456789\nИли используйте команду без параметров для выбора через кнопку`,
        register: () => {},
    },
    {
        command: "notify_list",
        description: "Показать список получателей уведомлений",
        helpText: `${escapeMarkdown("/notify_list")} - Показать список администраторов\\, получающих уведомления об отклоненных сообщениях`,
        register: () => {},
    },
];
