import { FormattedString, b, code, fmt } from "@grammyjs/parse-mode";
import { bot } from "../config/bot";
import { trackEvent } from "../config/posthog";
import {
    checkChannelRequirements,
    formatChannelRequirements,
    checkUserChannelPermissions,
    formatChannelInfo,
} from "../utils";
import { getChannelSettings } from "../db/database";
import { isFixedChannelMode } from "../config/environment";

export function registerInfoCommand(): void {
    bot.command("info", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId || !ctx.from) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        trackEvent(userId, "command_executed", {
            command: "info",
            has_channel_config: !!ctx.session.channelConfig,
        });

        const channelConfig = ctx.session.channelConfig;

        const sections: Array<string | FormattedString> = [];

        sections.push(fmt`🤖 ${fmt`${b}Конфигурация бота${b}`}`);

        const usernamePart =
            ctx.from.username ?
                fmt` (@${ctx.from.username})`
            : undefined;
        const userLine = usernamePart ?
            fmt`👤 ${fmt`${b}Пользователь:${b}`} ${ctx.from.first_name}${usernamePart}`
        :   fmt`👤 ${fmt`${b}Пользователь:${b}`} ${ctx.from.first_name}`;
        const userIdLine = fmt`📱 ${fmt`${b}ID пользователя:${b}`} ${fmt`${code}${String(userId)}${code}`}`;
        sections.push(FormattedString.join([userLine, userIdLine], "\n"));

        if (channelConfig) {
            let channelSection = fmt`📢 ${fmt`${b}Настроенный канал:${b}`}\n${formatChannelInfo(channelConfig.channelId, channelConfig.channelTitle)}`;
            if (isFixedChannelMode()) {
                channelSection = fmt`${channelSection}\n🔒 Фиксированный канал (установлен администратором)`;
            }
            sections.push(channelSection);

            const requirements = await checkChannelRequirements(channelConfig.channelId);

            sections.push(fmt`📋 ${fmt`${b}Требования:${b}`}\n${formatChannelRequirements(requirements)}`);

            const channelSettings = getChannelSettings(channelConfig.channelId);

            if (channelSettings?.foreignAgentBlurb) {
                const settingsSection = fmt`⚙️ ${fmt`${b}Настройки канала:${b}`}\n🌍 ${fmt`${b}Текст иностранного агента:${b}`}\n${channelSettings.foreignAgentBlurb}`;
                sections.push(settingsSection);
            }

            const userPermissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

            if (userPermissions) {
                const permissionLines: Array<string | FormattedString> = [
                    fmt`👤 ${fmt`${b}Ваши разрешения:${b}`}`,
                    userPermissions.isMember ? "✅ Участник канала" : "❌ Не является участником канала",
                ];

                if (userPermissions.isAdmin) {
                    permissionLines.push("✅ Администратор");
                    if (userPermissions.canPostMessages) {
                        permissionLines.push(
                            "⚠️ Может публиковать сообщения (Это право следует убрать, чтобы предотвратить обход бота)",
                        );
                    }
                    if (userPermissions.canEditMessages) {
                        permissionLines.push("✅ Может редактировать сообщения");
                    }
                    if (userPermissions.canManageChat) {
                        permissionLines.push("✅ Может управлять чатом");
                    }
                } else {
                    permissionLines.push("❌ Не является администратором");
                }

                sections.push(FormattedString.join(permissionLines, "\n"));
            }

            if (!isFixedChannelMode()) {
                sections.push("Используйте /removechannel для удаления этой конфигурации");
            }
        } else {
            const channelLines: Array<string | FormattedString> = [
                fmt`📢 ${fmt`${b}Настроенный канал:${b}`} Нет`,
                "❌ Канал не настроен",
            ];
            if (!isFixedChannelMode()) {
                channelLines.push("Используйте /setchannel для настройки");
            }
            sections.push(FormattedString.join(channelLines, "\n"));
        }

        const infoMessage = FormattedString.join(sections, "\n\n");
        const entities = infoMessage.entities;
        return ctx.reply(infoMessage.text, entities.length ? { entities } : undefined);
    });
}
