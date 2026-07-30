import * as Sentry from "@sentry/bun";
import type { Message } from "grammy/types";
import { dispatchRejectionNotifications, type RejectionNotificationResult } from "../notifications/rejection";
import { extractRichMessageText } from "../utils/rich-text";

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

export function extractMessageText(message: Message): string {
    if (message.rich_message) {
        return extractRichMessageText(message.rich_message);
    }

    return message.text ?? message.caption ?? message.poll?.question ?? "";
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

export function validateMessageCompliance(message: Message, requiredBlurb: string): boolean {
    const text = extractMessageText(message);

    if (text.includes(requiredBlurb)) {
        return true;
    }

    // Rich messages are structured blocks rather than a flat string, so the line breaks we
    // reconstruct don't have to match the ones in the configured blurb. Compare again ignoring
    // whitespace differences to avoid rejecting a message that visibly contains the blurb.
    if (message.rich_message) {
        return normalizeWhitespace(text).includes(normalizeWhitespace(requiredBlurb));
    }

    return false;
}

export function createMediaGroupValidator(requiredBlurb: string) {
    return (messages: Message[]): boolean => {
        return messages.some((msg) => validateMessageCompliance(msg, requiredBlurb));
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
): Promise<RejectionNotificationResult> {
    const notificationsResult = await dispatchRejectionNotifications(params);

    if (notificationsResult.failedTargets > 0) {
        console.warn(
            `Failed to notify ${notificationsResult.failedTargets} recipients about rejection in channel ${params.channelId}.`,
        );
    }

    return notificationsResult;
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
        scope.setTag("error_type", context.mediaGroupId ? "media_group_post_failed" : "channel_post_failed");
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
