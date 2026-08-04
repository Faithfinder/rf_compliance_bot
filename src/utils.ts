import { FormattedString, code, fmt } from "@grammyjs/parse-mode";
import { bot } from "./config/bot";
import { isFixedChannelMode } from "./config/environment";
import { getChannelSettings, getNotificationUsers } from "./db/database";

/**
 * Text shown when no channel is configured. In fixed-channel mode /setchannel is never
 * registered, so pointing the user at it would be a dead end.
 */
export function formatNoChannelMessage(): string {
    if (isFixedChannelMode()) {
        return "Канал не настроен. Обратитесь к администратору бота.";
    }

    return (
        "Канал ещё не выбран.\n\n" +
        "Используйте /setchannel <@channel или ID> для настройки.\n" +
        "Пример: /setchannel @mychannel"
    );
}

/**
 * Trailing hint offering to reconfigure the channel, omitted in fixed-channel mode where the
 * user cannot change it.
 */
export function formatChangeChannelHint(): string {
    return isFixedChannelMode() ? "" : "\n\nИли используйте /setchannel для настройки другого канала";
}

interface ChannelInfo {
    id: string;
    title: string;
}

/**
 * Resolves a channel identifier (handle or ID) to a validated channel info
 * @param identifier Channel handle (e.g., @channelname) or numeric ID (e.g., -1001234567890)
 * @returns Channel info if valid and bot has access, null otherwise
 */
export async function resolveChannel(identifier: string): Promise<ChannelInfo | null> {
    try {
        const trimmed = identifier.trim();

        if (!trimmed) {
            return null;
        }

        const isHandle = trimmed.startsWith("@");
        const isNumericId = /^-?\d+$/.test(trimmed);

        if (!isHandle && !isNumericId) {
            return null;
        }

        const chat = await bot.api.getChat(trimmed);

        if (chat.type !== "channel" && chat.type !== "supergroup") {
            return null;
        }

        return {
            id: chat.id.toString(),
            title: chat.title || trimmed,
        };
    } catch (error) {
        console.error("Error resolving channel:", error);
        return null;
    }
}

/**
 * Formats a channel identifier for display
 * @param channelId The channel ID
 * @param channelTitle Optional channel title
 * @returns Formatted string for display
 */
export function formatChannelInfo(channelId: string, channelTitle?: string): FormattedString {
    const idWithCode = fmt`${code}${channelId}${code}`;

    if (channelTitle) {
        return fmt`${channelTitle} (${idWithCode})`;
    }

    return idWithCode;
}

export interface ChannelRequirements {
    channelExists: boolean;
    botIsAdded: boolean;
    botCanPost: boolean;
    botCanDelete: boolean;
    foreignAgentBlurbConfigured: boolean;
    notificationRecipientsConfigured: boolean;
}

/**
 * Checks if all channel requirements are met
 * @param channelId The channel ID to check
 * @returns Object with requirement status
 */
export async function checkChannelRequirements(channelId: string): Promise<ChannelRequirements> {
    const requirements: ChannelRequirements = {
        channelExists: false,
        botIsAdded: false,
        botCanPost: false,
        botCanDelete: false,
        foreignAgentBlurbConfigured: false,
        notificationRecipientsConfigured: false,
    };

    try {
        await bot.api.getChat(channelId);
        requirements.channelExists = true;
    } catch (error) {
        console.error("Channel existence check failed:", error);
        return requirements;
    }

    try {
        const botMember = await bot.api.getChatMember(channelId, bot.botInfo.id);

        requirements.botIsAdded = botMember.status === "administrator" || botMember.status === "creator";

        if (requirements.botIsAdded) {
            requirements.botCanPost =
                botMember.status === "creator" ||
                (botMember.status === "administrator" && botMember.can_post_messages === true);
            requirements.botCanDelete =
                botMember.status === "creator" ||
                (botMember.status === "administrator" && botMember.can_delete_messages === true);
        }
    } catch (error) {
        console.error("Permission check failed:", error);
    }

    const channelSettings = getChannelSettings(channelId);
    requirements.foreignAgentBlurbConfigured = !!channelSettings?.foreignAgentBlurb;
    requirements.notificationRecipientsConfigured = getNotificationUsers(channelId).length > 0;

    return requirements;
}

/**
 * Prerequisites both modes share: the channel has to be reachable, the bot has to be an admin of
 * it, and the blurb is what every check compares against.
 */
export function formatCommonRequirements(requirements: ChannelRequirements): string {
    const lines = [
        requirements.channelExists ? "✅ Канал доступен" : "❌ Канал не существует или бот не имеет к нему доступа",
        requirements.botIsAdded ? "✅ 🤖 Бот — администратор канала" : "❌ 🤖 Бот не администратор канала",
        requirements.foreignAgentBlurbConfigured ? "✅ 🌍 Текст маркировки задан" : (
            "❌ 🌍 Текст маркировки не задан — бот ничего не проверяет"
        ),
    ];

    return lines.join("\n");
}

/**
 * Channel moderation, the primary mode. Recipients are informational (ℹ️), not a requirement:
 * moderation deletes unmarked posts regardless, it just forwards a copy to nobody.
 */
export function formatModerationRequirements(requirements: ChannelRequirements): string {
    const lines = [
        requirements.botCanDelete ?
            "✅ 🤖 Бот может удалять сообщения"
        :   "❌ 🤖 У бота нет права «Удалять сообщения» — немаркированные посты останутся в канале",
        requirements.notificationRecipientsConfigured ?
            "✅ 🔔 Получатели уведомлений заданы"
        :   "ℹ️ 🔔 Получатели уведомлений не заданы — копии удалённых постов никому не уходят (/notify_add)",
    ];

    return lines.join("\n");
}

/**
 * Publishing through the bot, the opt-in strict mode. Unmet items are ➖ rather than ❌: nothing is
 * broken when this mode is simply not set up.
 */
export function formatPublishRequirements(
    requirements: ChannelRequirements,
    permissions?: UserChannelPermissions | null,
): string {
    const lines = [
        requirements.botCanPost ?
            "✅ 🤖 Бот может публиковать сообщения"
        :   "➖ 🤖 У бота нет права «Публиковать сообщения» — публикация через бота недоступна",
    ];

    if (permissions) {
        lines.push(
            permissions.canEditMessages ?
                "✅ 👤 У вас есть право «Редактировать сообщения»"
            :   "➖ 👤 У вас нет права «Редактировать сообщения» — публиковать через бота вы не сможете",
        );
    }

    return lines.join("\n");
}

/**
 * Whether channel moderation is live. Notification recipients are deliberately absent: an empty
 * list changes who hears about a deletion, not whether it happens.
 */
export function moderationRequirementsPassed(requirements: ChannelRequirements): boolean {
    return (
        requirements.channelExists &&
        requirements.botIsAdded &&
        requirements.botCanDelete &&
        requirements.foreignAgentBlurbConfigured
    );
}

/**
 * Whether publishing through the bot is available at the channel level. The user's own
 * "edit messages" right is per-user and checked separately at publish time.
 *
 * The field set is unchanged from the former allRequirementsPassed(), which keeps the
 * `requirementsSatisfied` telemetry property comparable across this rename.
 */
export function publishRequirementsPassed(requirements: ChannelRequirements): boolean {
    return (
        requirements.channelExists &&
        requirements.botIsAdded &&
        requirements.botCanPost &&
        requirements.foreignAgentBlurbConfigured
    );
}

/**
 * The single most useful next action towards working moderation, or null once it is live. Only
 * moderation gaps appear here - publishing is opt-in, so its unmet requirements are reported by
 * /info rather than pushed at the user as a to-do.
 */
export function formatNextSetupStep(requirements: ChannelRequirements): string | null {
    if (!requirements.channelExists) {
        return isFixedChannelMode() ?
                "Следующий шаг: канал недоступен. Обратитесь к администратору бота."
            :   "Следующий шаг: канал недоступен. Выберите другой командой /setchannel.";
    }

    if (!requirements.botIsAdded) {
        return "Следующий шаг: добавьте бота в канал администратором с правом «Удалять сообщения».";
    }

    if (!requirements.foreignAgentBlurbConfigured) {
        return "Следующий шаг: задайте текст маркировки командой /set_fa_blurb <ваш текст>. Пока он не задан, бот не проверяет посты.";
    }

    if (!requirements.botCanDelete) {
        return "Следующий шаг: выдайте боту право «Удалять сообщения» в настройках канала — без него он не сможет убрать немаркированный пост.";
    }

    return null;
}

export interface UserChannelPermissions {
    isMember: boolean;
    isAdmin: boolean;
    canPostMessages?: boolean;
    canEditMessages?: boolean;
    canDeleteMessages?: boolean;
    canManageChat?: boolean;
    canInviteUsers?: boolean;
    canPinMessages?: boolean;
    canManageTopics?: boolean;
}

/**
 * Checks if user is a member/administrator in the configured channel and returns their permissions
 * @param channelId The channel ID to check
 * @param userId The user ID to check
 * @returns User permissions, or null if error occurred
 */
export async function checkUserChannelPermissions(
    channelId: string,
    userId: number,
): Promise<UserChannelPermissions | null> {
    try {
        const member = await bot.api.getChatMember(channelId, userId);

        const isMember = member.status === "member" || member.status === "administrator" || member.status === "creator";
        const isAdmin = member.status === "administrator" || member.status === "creator";

        if (!isAdmin) {
            return { isMember, isAdmin: false };
        }

        if (member.status === "creator") {
            return {
                isMember: true,
                isAdmin: true,
                canPostMessages: true,
                canEditMessages: true,
                canDeleteMessages: true,
                canManageChat: true,
                canInviteUsers: true,
                canPinMessages: true,
                canManageTopics: true,
            };
        }

        return {
            isMember: true,
            isAdmin: true,
            canPostMessages: member.can_post_messages,
            canEditMessages: member.can_edit_messages,
            canDeleteMessages: member.can_delete_messages,
            canManageChat: member.can_manage_chat,
            canInviteUsers: member.can_invite_users,
            canPinMessages: member.can_pin_messages,
            canManageTopics: member.can_manage_topics,
        };
    } catch (error) {
        console.error("Error checking user permissions:", error);
        return null;
    }
}

export interface UserInfo {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
}

/**
 * Resolves a user identifier (numeric ID) to user info by looking them up in a channel
 * Note: Only supports numeric user IDs. Telegram Bot API doesn't support username lookups.
 * @param identifier Numeric user ID
 * @param channelId Channel ID to look up the user in
 * @returns User info if found, null otherwise
 */
export async function resolveUserIdentifier(identifier: string, channelId: string): Promise<UserInfo | null> {
    try {
        const trimmed = identifier.trim();

        if (!trimmed) {
            return null;
        }

        const isNumericId = /^\d+$/.test(trimmed);

        if (!isNumericId) {
            return null;
        }

        const userId = parseInt(trimmed, 10);

        const chatMember = await bot.api.getChatMember(channelId, userId);
        const user = chatMember.user;

        return {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            username: user.username,
        };
    } catch (error) {
        console.error("Error resolving user identifier:", error);
        return null;
    }
}
