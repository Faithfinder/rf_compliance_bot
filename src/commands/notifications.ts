import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import { addNotificationUser, removeNotificationUser, getNotificationUsers } from "../db/database";
import { checkUserChannelPermissions, formatChannelInfo, resolveUserIdentifier, escapeHtml } from "../utils";

interface ValidationResult {
    success: boolean;
    channelId?: string;
    channelTitle?: string;
}

type RequiredPermission = "isAdmin" | "canManageChat";

const permissionErrorMessages: Record<RequiredPermission, string> = {
    isAdmin: "❌ Только администраторы канала могут просматривать список уведомлений.",
    canManageChat:
        "❌ Только администраторы канала с разрешением управления чатом могут управлять списком уведомлений.",
};

async function validateNotificationAccess(
    ctx: SessionContext,
    requiredPermission: RequiredPermission = "canManageChat",
): Promise<ValidationResult> {
    const userId = ctx.from?.id;

    if (!userId) {
        await ctx.reply("Не удается идентифицировать пользователя.");
        return { success: false };
    }

    const channelConfig = ctx.session.channelConfig;

    if (!channelConfig) {
        await ctx.reply(
            "Вы еще не настроили канал.\n\n" +
                "Используйте /setchannel <@channel или ID> для настройки.\n" +
                "Пример: /setchannel @mychannel",
        );
        return { success: false };
    }

    const permissions = await checkUserChannelPermissions(channelConfig.channelId, userId);

    if (!permissions?.[requiredPermission]) {
        await ctx.reply(permissionErrorMessages[requiredPermission], { parse_mode: "HTML" });
        return { success: false };
    }

    return {
        success: true,
        channelId: channelConfig.channelId,
        channelTitle: channelConfig.channelTitle,
    };
}

function createUserSelectionKeyboard(requestId: number): Keyboard {
    return new Keyboard()
        .requestUsers("Выбрать администратора", requestId, {
            user_is_bot: false,
            max_quantity: 1,
        })
        .resized()
        .oneTime();
}

async function processUserOperation(
    ctx: SessionContext,
    channelId: string,
    channelTitle: string | undefined,
    targetUserId: number,
    operation: "add" | "remove",
): Promise<unknown> {
    const targetPermissions = await checkUserChannelPermissions(channelId, targetUserId);

    if (!targetPermissions?.isAdmin) {
        return ctx.reply(
            "❌ Только администраторы канала могут быть добавлены в список уведомлений.",
            {
                parse_mode: "HTML",
            },
        );
    }

    let message = "";

    if (operation === "add") {
        addNotificationUser(channelId, targetUserId);

        message = `✅ Администратор успешно добавлен в список уведомлений!\n\n`;
        message += `📢 <b>Канал:</b> ${formatChannelInfo(channelId, channelTitle)}\n`;
        message += `🆔 <b>ID пользователя:</b> <code>${escapeHtml(String(targetUserId))}</code>\n\n`;
        message += `Администратор будет получать уведомления, когда сообщения отклоняются из-за отсутствия текста иностранного агента.`;
    } else {
        removeNotificationUser(channelId, targetUserId);

        message = `✅ Администратор успешно удален из списка уведомлений!\n\n`;
        message += `📢 <b>Канал:</b> ${formatChannelInfo(channelId, channelTitle)}\n`;
        message += `🆔 <b>ID пользователя:</b> <code>${escapeHtml(String(targetUserId))}</code>`;
    }

    return ctx.reply(message, { parse_mode: "HTML" });
}

async function handleUserSelection(
    ctx: SessionContext,
    args: string | RegExpMatchArray,
    channelId: string,
    channelTitle: string | undefined,
    operation: "add" | "remove",
): Promise<unknown> {
    if (!args || typeof args !== "string" || args.trim() === "") {
        ctx.session.awaitingNotificationUserSelection = operation;

        const keyboard = createUserSelectionKeyboard(operation === "add" ? 1 : 2);
        const action = operation === "add" ? "добавления" : "удаления";
        const preposition = operation === "add" ? "в" : "из";

        return ctx.reply(
            `👤 Пожалуйста, выберите администратора для ${action} ${preposition} списка уведомлений.`,
            { reply_markup: keyboard, parse_mode: "HTML" },
        );
    }

    const targetIdentifier = (args as string).trim();
    const targetUser = await resolveUserIdentifier(targetIdentifier, channelId);

    if (!targetUser) {
        return ctx.reply("❌ Не удалось найти пользователя. Убедитесь, что вы указали правильный числовой ID.");
    }

    return processUserOperation(ctx, channelId, channelTitle, targetUser.id, operation);
}

export function registerNotificationCommands(): void {
    bot.command("notify_add", async (ctx) => {
        const validation = await validateNotificationAccess(ctx);
        if (!validation.success || !validation.channelId) return;

        await handleUserSelection(ctx, ctx.match, validation.channelId, validation.channelTitle, "add");
    });

    bot.command("notify_remove", async (ctx) => {
        const validation = await validateNotificationAccess(ctx);
        if (!validation.success || !validation.channelId) return;

        await handleUserSelection(ctx, ctx.match, validation.channelId, validation.channelTitle, "remove");
    });

    bot.command("notify_list", async (ctx) => {
        const validation = await validateNotificationAccess(ctx, "isAdmin");
        if (!validation.success || !validation.channelId) return;

        const notificationUserIds = getNotificationUsers(validation.channelId);

        let message = `🔔 <b>Список уведомлений</b>\n\n`;
        message += `📢 <b>Канал:</b> ${formatChannelInfo(validation.channelId, validation.channelTitle)}\n\n`;

        if (notificationUserIds.length === 0) {
            message += `Список пуст. Используйте <code>/notify_add</code> для добавления администраторов.`;
        } else {
            message += `👥 <b>Подписчики на уведомления:</b>\n`;

            for (const targetUserId of notificationUserIds) {
                try {
                    const chatMember = await bot.api.getChatMember(validation.channelId, targetUserId);
                    const user = chatMember.user;
                    message += `• ${escapeHtml(user.first_name)}`;
                    if (user.username) {
                        message += ` (@${escapeHtml(user.username)})`;
                    }
                    message += ` <code>${escapeHtml(String(targetUserId))}</code>\n`;
                } catch {
                    message += `• ID: <code>${escapeHtml(String(targetUserId))}</code> (недоступен)\n`;
                }
            }

            message += `\n<b>Всего:</b> ${notificationUserIds.length}`;
        }

        return ctx.reply(message, { parse_mode: "HTML" });
    });
}

export function registerNotificationUserSelectionHandler(): void {
    bot.chatType("private").on("message:users_shared", async (ctx) => {
        const pendingOperation = ctx.session.awaitingNotificationUserSelection;

        if (!pendingOperation) {
            return;
        }

        const validation = await validateNotificationAccess(ctx);
        if (!validation.success || !validation.channelId) {
            ctx.session.awaitingNotificationUserSelection = undefined;
            return;
        }

        const sharedUsers = ctx.message.users_shared.users;
        const firstUser = sharedUsers[0];

        if (!sharedUsers || !firstUser) {
            ctx.session.awaitingNotificationUserSelection = undefined;
            return ctx.reply("❌ Пользователь не был выбран. Попробуйте снова.");
        }

        const targetUserId = firstUser.user_id;

        ctx.session.awaitingNotificationUserSelection = undefined;

        return processUserOperation(ctx, validation.channelId, validation.channelTitle, targetUserId, pendingOperation);
    });
}
