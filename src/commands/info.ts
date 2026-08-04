import { FormattedString, b, code, fmt } from "@grammyjs/parse-mode";
import { bot } from "../config/bot";
import {
    checkChannelRequirements,
    formatCommonRequirements,
    formatModerationRequirements,
    formatNextSetupStep,
    formatPublishRequirements,
    checkUserChannelPermissions,
    formatChannelInfo,
    moderationRequirementsPassed,
    publishRequirementsPassed,
} from "../utils";
import { getChannelSettings } from "../db/database";
import { isFixedChannelMode } from "../config/environment";

export function registerInfoCommand(): void {
    bot.command("info", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId || !ctx.from) {
            return ctx.reply("Не удается идентифицировать пользователя.");
        }

        const channelConfig = ctx.session.channelConfig;

        const sections: Array<string | FormattedString> = [];

        sections.push(fmt`🤖 ${fmt`${b}Конфигурация бота${b}`}`);

        const usernamePart = ctx.from.username ? fmt` (@${ctx.from.username})` : undefined;
        const userLine =
            usernamePart ?
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
            const userPermissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

            sections.push(fmt`📋 ${fmt`${b}Общее:${b}`}\n${formatCommonRequirements(requirements)}`);

            const moderationVerdict = moderationRequirementsPassed(requirements) ? "✅ работает" : "❌ не работает";
            sections.push(
                fmt`1️⃣ ${fmt`${b}Модерация канала${b}`} — ${moderationVerdict}\n${formatModerationRequirements(requirements)}`,
            );

            let publishSection = fmt`2️⃣ ${fmt`${b}Публикация через бота${b}`} — по желанию\n${formatPublishRequirements(requirements, userPermissions)}`;

            if (publishRequirementsPassed(requirements) && userPermissions?.canEditMessages) {
                publishSection = fmt`${publishSection}\n\n💡 Чтобы через бота шло всё, снимите право «Публиковать сообщения» у администраторов-людей: тогда единственным путём в канал останется проверка до публикации.`;
            } else {
                publishSection = fmt`${publishSection}\n\nМодерация удаляет пост уже после публикации; публикация через бота не даёт ему выйти вовсе — в том числе когда бот недоступен.`;
            }

            sections.push(publishSection);

            const channelSettings = getChannelSettings(channelConfig.channelId);

            if (channelSettings?.foreignAgentBlurb) {
                sections.push(fmt`🌍 ${fmt`${b}Текущий текст маркировки:${b}`}\n${channelSettings.foreignAgentBlurb}`);
            }

            if (userPermissions) {
                const permissionLines: Array<string | FormattedString> = [
                    fmt`👤 ${fmt`${b}Ваши права в канале:${b}`}`,
                    userPermissions.isMember ? "✅ Участник канала" : "❌ Не является участником канала",
                ];

                if (userPermissions.isAdmin) {
                    permissionLines.push("✅ Администратор");
                    if (userPermissions.canPostMessages) {
                        permissionLines.push("✅ Может публиковать сообщения напрямую в канал");
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

            const nextStep = formatNextSetupStep(requirements);
            if (nextStep) {
                sections.push(nextStep);
            }

            if (!isFixedChannelMode()) {
                sections.push("Используйте /removechannel для удаления этой конфигурации");
            }
        } else {
            const channelLines: Array<string | FormattedString> = [
                fmt`📢 ${fmt`${b}Настроенный канал:${b}`} Нет`,
                "❌ Канал не выбран, поэтому оба режима выключены: без канала некуда записать текст маркировки, а без него бот не проверяет посты.",
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
