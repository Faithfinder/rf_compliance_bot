import { bot } from "./config/bot";

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
export function formatChannelInfo(channelId: string, channelTitle?: string): string {
    if (channelTitle) {
        return `${channelTitle} (\`${channelId}\`)`;
    }
    return channelId;
}

export interface ChannelRequirements {
    channelExists: boolean;
    botIsAdded: boolean;
    botCanPost: boolean;
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

    return requirements;
}

/**
 * Formats channel requirements as a text message
 * @param requirements The requirements to format
 * @returns Formatted requirements text
 */
export function formatChannelRequirements(requirements: ChannelRequirements): string {
    const lines = [
        requirements.channelExists ? "✅ Configured channel exists" : (
            "❌ Channel doesn't exist or bot cannot access it"
        ),
        requirements.botIsAdded ? "✅ 🤖 Bot is added to the channel" : "❌ 🤖 Bot is not added to the channel",
        requirements.botCanPost ? "✅ 🤖 Bot can post to the channel" : "❌ 🤖 Bot lacks permission to post messages",
    ];

    return lines.join("\n");
}

/**
 * Checks if all channel requirements are passed
 * @param requirements The requirements to check
 * @returns True if all requirements are met
 */
export function allRequirementsPassed(requirements: ChannelRequirements): boolean {
    return requirements.channelExists && requirements.botIsAdded && requirements.botCanPost;
}
