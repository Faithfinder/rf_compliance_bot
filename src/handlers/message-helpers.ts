import * as Sentry from "@sentry/bun";
import type { Message } from "grammy/types";
import { dispatchRejectionNotifications } from "../notifications/rejection";

export interface MessageActor {
    id?: number;
    displayName: string;
    username?: string;
}

export function extractMessageActor(message: Message): MessageActor | undefined {
    if (message.from) {
        return {
            id: message.from.id,
            displayName: message.from.first_name,
            username: message.from.username,
        };
    }

    if (message.author_signature) {
        return {
            displayName: message.author_signature,
        };
    }

    return undefined;
}

function extractMessageText(message: Message): string {
    return message.text ?? message.caption ?? "";
}

export function validateMessageCompliance(message: Message, requiredBlurb: string): boolean {
    const text = extractMessageText(message);
    return text.includes(requiredBlurb);
}

export function createMediaGroupValidator(requiredBlurb: string) {
    return (messages: Message[]): boolean => {
        return messages.some((msg) => {
            const text = extractMessageText(msg);
            return text.includes(requiredBlurb);
        });
    };
}

export interface RejectionNotificationParams {
    channelId: string;
    channelTitle?: string;
    rejectedMessageChatId: number;
    rejectedMessageId: number;
    actor?: MessageActor;
    excludeUserIds?: number[];
    includeAuthor?: boolean;
}

export async function handleRejectionWithNotifications(
    params: RejectionNotificationParams,
): Promise<void> {
    const notificationsResult = await dispatchRejectionNotifications(params);

    if (notificationsResult.failedTargets > 0) {
        console.warn(
            `Failed to notify ${notificationsResult.failedTargets} recipients about rejection in channel ${params.channelId}.`,
        );
    }
}

export interface SentryChannelPostContext {
    userId: number;
    channelId: string;
    channelTitle?: string;
    mediaGroupId?: string;
}

export function reportChannelPostError(error: unknown, context: SentryChannelPostContext): void {
    console.error("Error posting to channel:", error);

    Sentry.withScope((scope) => {
        scope.setContext("channel_post", {
            user_id: context.userId,
            channel_id: context.channelId,
            channel_title: context.channelTitle,
            ...(context.mediaGroupId && { media_group_id: context.mediaGroupId }),
        });
        scope.setTag(
            "error_type",
            context.mediaGroupId ? "media_group_post_failed" : "channel_post_failed",
        );
        Sentry.captureException(error);
    });
}

export interface SentryModerationContext {
    channelId: string;
    messageId?: number;
    mediaGroupId?: string;
    messageCount?: number;
    notificationTargets: number;
    notificationFailures: number;
}

export function reportModerationError(error: unknown, context: SentryModerationContext): void {
    console.error(
        context.mediaGroupId ?
            "Failed to delete non-compliant media group:"
        :   "Failed to delete non-compliant channel message:",
        error,
    );

    Sentry.withScope((scope) => {
        scope.setContext("channel_moderation", {
            channel_id: context.channelId,
            ...(context.messageId && { message_id: context.messageId }),
            ...(context.mediaGroupId && { media_group_id: context.mediaGroupId }),
            ...(context.messageCount && { message_count: context.messageCount }),
            notification_targets: context.notificationTargets,
            notification_failures: context.notificationFailures,
        });
        scope.setTag(
            "error_type",
            context.mediaGroupId ? "media_group_delete_failed" : "channel_message_delete_failed",
        );
        Sentry.captureException(error);
    });
}
