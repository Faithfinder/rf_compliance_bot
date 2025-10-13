import * as Sentry from "@sentry/bun";
import { bot } from "../config/bot";
import { getNotificationUsers } from "../db/database";
import { escapeHtml, formatChannelInfo } from "../utils";

export const FOREIGN_AGENT_REJECTION_REASON = "Отсутствует текст иностранного агента";

interface RejectedActor {
    id?: number;
    displayName: string;
    username?: string;
}

export interface RejectionNotificationParams {
    channelId: string;
    channelTitle?: string;
    rejectedMessageChatId: number;
    rejectedMessageId: number;
    actor?: RejectedActor;
    includeAuthor?: boolean;
    excludeUserIds?: number[];
    occurredAt?: Date;
    notificationUserIds?: number[];
}

interface NotificationTarget {
    userId: number;
    scope: "author" | "notify";
}

export function buildRejectionNotificationMessage(params: RejectionNotificationParams): string {
    const timestamp = (params.occurredAt ?? new Date()).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });

    const channelInfo = formatChannelInfo(params.channelId, params.channelTitle);

    let message = `🚫 <b>Сообщение отклонено</b>\n\n`;
    message += `📢 <b>Канал:</b> ${channelInfo}\n`;

    if (params.actor) {
        message += `👤 <b>Пользователь:</b> ${escapeHtml(params.actor.displayName)}`;
        if (params.actor.username) {
            message += ` (@${escapeHtml(params.actor.username)})`;
        }
        if (typeof params.actor.id === "number") {
            message += `\n🆔 <b>ID:</b> <code>${escapeHtml(String(params.actor.id))}</code>`;
        }
        message += `\n`;
    }

    message += `🕐 <b>Время:</b> ${escapeHtml(timestamp)}\n\n`;
    message += `❌ <b>Причина:</b> ${escapeHtml(FOREIGN_AGENT_REJECTION_REASON)}\n\n`;
    message += `📝 <b>Отклоненное сообщение:</b>`;

    return message;
}

export interface RejectionNotificationResult {
    totalTargets: number;
    successfulTargets: number;
    failedTargets: number;
}

export async function dispatchRejectionNotifications(
    params: RejectionNotificationParams,
): Promise<RejectionNotificationResult> {
    const notificationMessage = buildRejectionNotificationMessage(params);

    const notificationUserIds = params.notificationUserIds ?? getNotificationUsers(params.channelId);
    const excluded = new Set<number>(params.excludeUserIds ?? []);

    const targets: NotificationTarget[] = [];

    if (params.includeAuthor && params.actor && typeof params.actor.id === "number") {
        targets.push({
            userId: params.actor.id,
            scope: "author",
        });
        excluded.add(params.actor.id);
    }

    for (const userId of notificationUserIds) {
        if (excluded.has(userId)) {
            continue;
        }

        targets.push({
            userId,
            scope: "notify",
        });
    }

    if (targets.length === 0) {
        return {
            totalTargets: 0,
            successfulTargets: 0,
            failedTargets: 0,
        };
    }

    let successfulTargets = 0;
    let failedTargets = 0;

    for (const target of targets) {
        try {
            await bot.api.sendMessage(target.userId, notificationMessage, { parse_mode: "HTML" });
            await bot.api.copyMessage(target.userId, params.rejectedMessageChatId, params.rejectedMessageId);
            successfulTargets += 1;
        } catch (error) {
            console.error(`Failed to send rejection notification to ${target.scope} ${target.userId}:`, error);

            Sentry.withScope((scope) => {
                scope.setContext("rejection_notification", {
                    channel_id: params.channelId,
                    notify_user_id: target.userId,
                    scope: target.scope,
                    actor_user_id: params.actor?.id,
                });
                scope.setTag("error_type", "rejection_notification_failed");
                Sentry.captureException(error);
            });

            failedTargets += 1;
        }
    }

    return {
        totalTargets: targets.length,
        successfulTargets,
        failedTargets,
    };
}
