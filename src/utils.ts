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
        return `${channelTitle} (${channelId})`;
    }
    return channelId;
}
