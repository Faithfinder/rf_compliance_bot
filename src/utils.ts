import { bot } from "./config/bot";
import { getChannelSettings } from "./db/database";

interface ChannelInfo {
    id: string;
    title: string;
}

/**
 * Escapes special characters in text for MarkdownV2 formatting
 * @param text The text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export function escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
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
export function formatChannelInfo(channelId: string, channelTitle?: string): string {
    const escapedId = channelId.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    const idWithCode = `\`${escapedId}\``;

    if (channelTitle) {
        return `${escapeMarkdown(channelTitle)} \\(${idWithCode}\\)`;
    }

    return idWithCode;
}

export interface ChannelRequirements {
    channelExists: boolean;
    botIsAdded: boolean;
    botCanPost: boolean;
    foreignAgentBlurbConfigured: boolean;
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
        foreignAgentBlurbConfigured: false,
    };

    try {
        await bot.api.getChat(channelId);
        requirements.channelExists = true;
    } catch (error) {
        console.error("Channel existence check failed:", error);
        return requirements;
    }

    try {
        const botInfo = await bot.api.getMe();
        const botMember = await bot.api.getChatMember(channelId, botInfo.id);

        requirements.botIsAdded = botMember.status === "administrator" || botMember.status === "creator";

        if (requirements.botIsAdded) {
            requirements.botCanPost =
                botMember.status === "creator" ||
                (botMember.status === "administrator" && botMember.can_post_messages === true);
        }
    } catch (error) {
        console.error("Permission check failed:", error);
    }

    const channelSettings = getChannelSettings(channelId);
    requirements.foreignAgentBlurbConfigured = !!channelSettings?.foreignAgentBlurb;

    return requirements;
}

/**
 * Formats channel requirements as a text message
 * @param requirements The requirements to format
 * @returns Formatted requirements text
 */
export function formatChannelRequirements(requirements: ChannelRequirements): string {
    const lines = [
        requirements.channelExists ?
            "✅ Настроенный канал существует"
        :   "❌ Канал не существует или бот не может получить к нему доступ",
        requirements.botIsAdded ? "✅ 🤖 Бот добавлен в канал" : "❌ 🤖 Бот не добавлен в канал",
        requirements.botCanPost ?
            "✅ 🤖 Бот может публиковать сообщения в канал"
        :   "❌ 🤖 Бот не имеет разрешения публиковать сообщения",
        requirements.foreignAgentBlurbConfigured ?
            "✅ 🌍 Текст иностранного агента настроен"
        :   "❌ 🌍 Текст иностранного агента не настроен",
    ];

    return lines.join("\n");
}

/**
 * Checks if all channel requirements are passed
 * @param requirements The requirements to check
 * @returns True if all requirements are met
 */
export function allRequirementsPassed(requirements: ChannelRequirements): boolean {
    return (
        requirements.channelExists &&
        requirements.botIsAdded &&
        requirements.botCanPost &&
        requirements.foreignAgentBlurbConfigured
    );
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
