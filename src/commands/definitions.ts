import { registerStartCommand } from "./start";
import { registerHelpCommand } from "./help";
import { registerInfoCommand } from "./info";
import { registerChannelCommands } from "./channel";
import { registerSettingsCommand } from "./settings";
import { registerNotificationCommands } from "./notifications";
import { isFixedChannelMode } from "../config/environment";
import { escapeHtml } from "../utils";

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
        helpText: `${escapeHtml("/start")} - Запустить бота и показать приветственное сообщение`,
        register: registerStartCommand,
    },
    {
        command: "help",
        description: "Показать справочное сообщение",
        helpText: `${escapeHtml("/help")} - Показать это справочное сообщение`,
        register: registerHelpCommand,
    },
    {
        command: "info",
        description: "Показать конфигурацию бота",
        helpText: `${escapeHtml("/info")} - Показать сводку конфигурации бота`,
        register: registerInfoCommand,
    },
    {
        command: "setchannel",
        description: "Настроить канал",
        helpText: [
            `${escapeHtml("/setchannel <@channel или ID>")} - Настроить канал для публикации ваших сообщений`,
            `Пример: ${escapeHtml("/setchannel @mychannel")}`,
        ].join("\n"),
        register: registerChannelCommands,
        available: () => !isFixedChannelMode(),
    },
    {
        command: "removechannel",
        description: "Удалить настройку канала",
        helpText: `${escapeHtml("/removechannel")} - Удалить настройку канала`,
        register: () => {}, // Registered together with setchannel
        available: () => !isFixedChannelMode(),
    },
    {
        command: "set_fa_blurb",
        description: "Настроить текст иностранного агента",
        helpText: [
            `${escapeHtml("/set_fa_blurb <текст>")} - Настроить текст иностранного агента для канала`,
            `Пример: ${escapeHtml(
                "/set_fa_blurb НАСТОЯЩИЙ МАТЕРИАЛ (ИНФОРМАЦИЯ) ПРОИЗВЕДЕН И РАСПРОСТРАНЕН ИНОСТРАННЫМ АГЕНТОМ «ИМЯ АГЕНТА» ЛИБО КАСАЕТСЯ ДЕЯТЕЛЬНОСТИ ИНОСТРАННОГО АГЕНТА «ИМЯ АГЕНТА». 18+",
            )}`,
        ].join("\n"),
        register: registerSettingsCommand,
    },
    {
        command: "notify_add",
        description: "Добавить получателя уведомлений",
        helpText: `${escapeHtml("/notify_add")} - Добавить администратора в список получателей уведомлений об отклоненных сообщениях. Откроется кнопка для выбора пользователя.`,
        register: registerNotificationCommands,
    },
    {
        command: "notify_remove",
        description: "Удалить получателя уведомлений",
        helpText: `${escapeHtml("/notify_remove")} - Удалить администратора из списка получателей уведомлений. Откроется кнопка для выбора пользователя.`,
        register: () => {},
    },
    {
        command: "notify_list",
        description: "Показать список получателей уведомлений",
        helpText: `${escapeHtml("/notify_list")} - Показать список администраторов, получающих уведомления об отклоненных сообщениях`,
        register: () => {},
    },
];
