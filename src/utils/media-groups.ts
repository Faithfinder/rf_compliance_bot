import * as Sentry from "@sentry/bun";
import type { Message } from "grammy/types";

interface MediaGroupMessage {
    message: Message;
    timestamp: number;
}

interface MediaGroupData {
    messages: MediaGroupMessage[];
    validated: boolean;
    approved: boolean;
    timerId?: ReturnType<typeof setTimeout>;
}

const DEBOUNCE_MS = 200;
const TTL_MS = 5 * 60 * 1000;

const mediaGroups = new Map<string, MediaGroupData>();

function cleanupExpiredGroups(): void {
    const now = Date.now();
    for (const [groupId, data] of mediaGroups.entries()) {
        const oldestMessage = data.messages[0];
        if (oldestMessage && now - oldestMessage.timestamp > TTL_MS) {
            if (data.timerId) {
                clearTimeout(data.timerId);
            }
            mediaGroups.delete(groupId);
        }
    }
}

setInterval(cleanupExpiredGroups, 60 * 1000);

function reportMediaGroupError(error: unknown, mediaGroupId: string, messageCount: number): void {
    console.error("Failed to process media group:", error);

    Sentry.withScope((scope) => {
        scope.setContext("media_group", {
            media_group_id: mediaGroupId,
            message_count: messageCount,
        });
        scope.setTag("error_type", "media_group_processing_failed");
        Sentry.captureException(error);
    });
}

export interface MediaGroupValidationResult {
    isComplete: boolean;
    approved?: boolean;
    messages?: Message[];
}

export function addMessageToGroup(
    mediaGroupId: string,
    message: Message,
    onComplete: (_messages: Message[], _approved: boolean) => void | Promise<void>,
    validateGroup: (_messages: Message[]) => boolean,
): MediaGroupValidationResult {
    let groupData = mediaGroups.get(mediaGroupId);

    if (!groupData) {
        groupData = {
            messages: [],
            validated: false,
            approved: false,
        };
        mediaGroups.set(mediaGroupId, groupData);
    }

    groupData.messages.push({
        message,
        timestamp: Date.now(),
    });

    if (groupData.timerId) {
        clearTimeout(groupData.timerId);
    }

    // This runs outside grammY's middleware, so `bot.catch` never sees what is thrown here.
    // Anything escaping would be an unhandled rejection, which terminates the Bun process.
    groupData.timerId = setTimeout(() => {
        void (async () => {
            const allMessages = groupData!.messages.map((m) => m.message);

            try {
                const approved = validateGroup(allMessages);

                groupData!.validated = true;
                groupData!.approved = approved;

                await onComplete(allMessages, approved);
            } catch (error) {
                reportMediaGroupError(error, mediaGroupId, allMessages.length);
            }
        })();
    }, DEBOUNCE_MS);

    if (groupData.validated) {
        return {
            isComplete: true,
            approved: groupData.approved,
            messages: groupData.messages.map((m) => m.message),
        };
    }

    return {
        isComplete: false,
    };
}

export function isMediaGroupValidated(mediaGroupId: string): boolean {
    const groupData = mediaGroups.get(mediaGroupId);
    return groupData?.validated ?? false;
}

export function getMediaGroupApproval(mediaGroupId: string): boolean | undefined {
    const groupData = mediaGroups.get(mediaGroupId);
    return groupData?.validated ? groupData.approved : undefined;
}

export function clearMediaGroup(mediaGroupId: string): void {
    const groupData = mediaGroups.get(mediaGroupId);
    if (groupData?.timerId) {
        clearTimeout(groupData.timerId);
    }
    mediaGroups.delete(mediaGroupId);
}
