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
        helpText: `<code>${escapeHtml("/start")}</code> - Запустить бота и показать приветственное сообщение`,
        register: registerStartCommand,
    },
    {
        command: "help",
        description: "Показать справочное сообщение",
        helpText: `<code>${escapeHtml("/help")}</code> - Показать это справочное сообщение`,
        register: registerHelpCommand,
    },
    {
        command: "info",
        description: "Показать конфигурацию бота",
        helpText: `<code>${escapeHtml("/info")}</code> - Показать сводку конфигурации бота`,
        register: registerInfoCommand,
    },
    {
        command: "setchannel",
        description: "Настроить канал",
        helpText: [
            `<code>${escapeHtml("/setchannel <@channel или ID>")}</code> - Настроить канал для публикации ваших сообщений`,
            `Пример: <code>${escapeHtml("/setchannel @mychannel")}</code>`,
        ].join("\n"),
        register: registerChannelCommands,
        available: () => !isFixedChannelMode(),
    },
    {
        command: "removechannel",
        description: "Удалить настройку канала",
        helpText: `<code>${escapeHtml("/removechannel")}</code> - Удалить настройку канала`,
        register: () => {}, // Registered together with setchannel
        available: () => !isFixedChannelMode(),
    },
    {
        command: "set_fa_blurb",
        description: "Настроить текст иностранного агента",
        helpText: [
            `<code>${escapeHtml("/set_fa_blurb <текст>")}</code> - Настроить текст иностранного агента для канала`,
            `Пример: <code>${escapeHtml(
                "/set_fa_blurb НАСТОЯЩИЙ МАТЕРИАЛ (ИНФОРМАЦИЯ) ПРОИЗВЕДЕН И РАСПРОСТРАНЕН ИНОСТРАННЫМ АГЕНТОМ «ИМЯ АГЕНТА» ЛИБО КАСАЕТСЯ ДЕЯТЕЛЬНОСТИ ИНОСТРАННОГО АГЕНТА «ИМЯ АГЕНТА». 18+",
            )}</code>`,
        ].join("\n"),
        register: registerSettingsCommand,
    },
    {
        command: "notify_add",
        description: "Добавить получателя уведомлений",
        helpText: `<code>${escapeHtml("/notify_add")}</code> - Добавить администратора в список получателей уведомлений об отклоненных сообщениях. Откроется кнопка для выбора пользователя.`,
        register: registerNotificationCommands,
    },
    {
        command: "notify_remove",
        description: "Удалить получателя уведомлений",
        helpText: `<code>${escapeHtml("/notify_remove")}</code> - Удалить администратора из списка получателей уведомлений. Откроется кнопка для выбора пользователя.`,
        register: () => {},
    },
    {
        command: "notify_list",
        description: "Показать список получателей уведомлений",
        helpText: `<code>${escapeHtml("/notify_list")}</code> - Показать список администраторов, получающих уведомления об отклоненных сообщениях`,
        register: () => {},
    },
];
