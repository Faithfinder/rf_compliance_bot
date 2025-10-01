import { Api } from "grammy";

interface ChannelInfo {
    id: string;
    title: string;
}

/**
 * Resolves a channel identifier (handle or ID) to a validated channel info
 * @param bot The bot API instance
 * @param identifier Channel handle (e.g., @channelname) or numeric ID (e.g., -1001234567890)
 * @returns Channel info if valid and bot has access, null otherwise
 */
export async function resolveChannel(bot: Api, identifier: string): Promise<ChannelInfo | null> {
    try {
        // Trim whitespace
        const trimmed = identifier.trim();

        // Validate format
        if (!trimmed) {
            return null;
        }

        // Check if it's a handle (starts with @) or numeric ID
        const isHandle = trimmed.startsWith("@");
        const isNumericId = /^-?\d+$/.test(trimmed);

        if (!isHandle && !isNumericId) {
            return null;
        }

        // Try to get the chat info
        const chat = await bot.getChat(trimmed);

        // Verify it's a channel or supergroup
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
        return `${channelTitle} (${channelId})`;
    }
    return channelId;
}
