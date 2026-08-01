import { describe, test, expect, beforeAll } from "bun:test";
import { GrammyError } from "grammy";

let rejectionModule: typeof import("../src/notifications/rejection");
let reachabilityModule: typeof import("../src/notifications/reachability");
let botModule: typeof import("../src/config/bot");

beforeAll(async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        process.env.TELEGRAM_BOT_TOKEN = "test-token";
    }

    rejectionModule = await import("../src/notifications/rejection");
    reachabilityModule = await import("../src/notifications/reachability");
    botModule = await import("../src/config/bot");
});

function apiError(errorCode: number, description: string, method = "sendMessage"): GrammyError {
    return new GrammyError(
        `Call to '${method}' failed!`,
        { ok: false, error_code: errorCode, description },
        method,
        {},
    );
}

describe("Rejection notifications", () => {
    test("buildRejectionNotificationMessage includes actor details when provided", () => {
        const timestamp = new Date("2024-01-01T12:00:00+03:00");

        const message = rejectionModule.buildRejectionNotificationMessage({
            channelId: "-1001234567890",
            channelTitle: "Test Channel",
            rejectedMessageChatId: -1001234567890,
            rejectedMessageId: 10,
            actor: {
                id: 42,
                displayName: "Moderator",
                username: "moderator",
            },
            occurredAt: timestamp,
        });

        expect(message.text).toContain("🚫 Сообщение отклонено");
        expect(message.text).toContain("Test Channel (-1001234567890)");
        expect(message.text).toContain("👤 Пользователь: Moderator (@moderator)");
        expect(message.text).toContain("🆔 ID: 42");
        expect(message.text).toContain(`❌ Причина: ${rejectionModule.FOREIGN_AGENT_REJECTION_REASON}`);
        expect(message.text).toContain("📝 Отклоненное сообщение:");
        expect(message.entities?.some((entity) => entity.type === "bold")).toBe(true);
        expect(message.entities?.some((entity) => entity.type === "code")).toBe(true);
    });

    test("buildRejectionNotificationMessage omits ID when actor id is unavailable", () => {
        const message = rejectionModule.buildRejectionNotificationMessage({
            channelId: "-100987654321",
            rejectedMessageChatId: -100987654321,
            rejectedMessageId: 11,
            actor: {
                displayName: "Signed Author",
            },
        });

        expect(message.text).toContain("Signed Author");
        expect(message.text).not.toContain("🆔 ID:");
    });

    test("dispatchRejectionNotifications notifies author when available and filters duplicates", async () => {
        const sendCalls: Array<{ userId: number; text: string }> = [];
        const copyCalls: Array<{ userId: number; chatId: number; messageId: number }> = [];

        const originalSend = botModule.bot.api.sendMessage;
        const originalCopy = botModule.bot.api.copyMessage;

        botModule.bot.api.sendMessage = ((userId: number, text: string) => {
            sendCalls.push({ userId, text });
            return Promise.resolve({ message_id: 99 } as unknown);
        }) as typeof botModule.bot.api.sendMessage;

        botModule.bot.api.copyMessage = ((userId: number, chatId: number, messageId: number) => {
            copyCalls.push({ userId, chatId, messageId });
            return Promise.resolve({ message_id: 100 } as unknown);
        }) as typeof botModule.bot.api.copyMessage;

        try {
            const result = await rejectionModule.dispatchRejectionNotifications({
                channelId: "-100123",
                channelTitle: "Channel",
                rejectedMessageChatId: -100123,
                rejectedMessageId: 77,
                actor: {
                    id: 1,
                    displayName: "Admin",
                    username: "admin",
                },
                includeAuthor: true,
                notificationUserIds: [1, 2, 3],
            });

            expect(result.totalTargets).toBe(3);
            expect(result.successfulTargets).toBe(3);
            expect(result.failedTargets).toBe(0);
            expect(result.unreachableTargets).toBe(0);

            // Author plus two distinct notify users should be contacted
            expect(sendCalls.map((call) => call.userId).sort()).toEqual([1, 2, 3]);
            expect(copyCalls).toHaveLength(3);
            expect(copyCalls.every((call) => call.chatId === -100123 && call.messageId === 77)).toBe(true);
        } finally {
            // Restore original implementations
            botModule.bot.api.sendMessage = originalSend;
            botModule.bot.api.copyMessage = originalCopy;
        }
    });

    test("dispatchRejectionNotifications counts recipients without a private chat as unreachable", async () => {
        const originalSend = botModule.bot.api.sendMessage;
        const originalCopy = botModule.bot.api.copyMessage;

        botModule.bot.api.sendMessage = ((userId: number) => {
            if (userId === 1) {
                return Promise.reject(apiError(400, "Bad Request: chat not found"));
            }

            if (userId === 2) {
                return Promise.reject(apiError(403, "Forbidden: bot was blocked by the user"));
            }

            return Promise.resolve({ message_id: 99 } as unknown);
        }) as typeof botModule.bot.api.sendMessage;

        botModule.bot.api.copyMessage = (() =>
            Promise.resolve({ message_id: 100 } as unknown)) as typeof botModule.bot.api.copyMessage;

        try {
            const result = await rejectionModule.dispatchRejectionNotifications({
                channelId: "-100123",
                rejectedMessageChatId: -100123,
                rejectedMessageId: 77,
                actor: { id: 1, displayName: "Author" },
                includeAuthor: true,
                notificationUserIds: [2, 3],
            });

            expect(result.totalTargets).toBe(3);
            expect(result.successfulTargets).toBe(1);
            expect(result.unreachableTargets).toBe(2);
            expect(result.failedTargets).toBe(0);
        } finally {
            botModule.bot.api.sendMessage = originalSend;
            botModule.bot.api.copyMessage = originalCopy;
        }
    });

    test("dispatchRejectionNotifications still counts genuine delivery errors as failures", async () => {
        const originalSend = botModule.bot.api.sendMessage;

        botModule.bot.api.sendMessage = (() =>
            Promise.reject(
                apiError(400, "Bad Request: message text is empty"),
            )) as typeof botModule.bot.api.sendMessage;

        try {
            const result = await rejectionModule.dispatchRejectionNotifications({
                channelId: "-100123",
                rejectedMessageChatId: -100123,
                rejectedMessageId: 77,
                notificationUserIds: [5],
            });

            expect(result.failedTargets).toBe(1);
            expect(result.unreachableTargets).toBe(0);
        } finally {
            botModule.bot.api.sendMessage = originalSend;
        }
    });
});

describe("Recipient reachability", () => {
    test("isUnreachableRecipientError recognizes every wording for a missing private chat", () => {
        expect(reachabilityModule.isUnreachableRecipientError(apiError(400, "Bad Request: chat not found"))).toBe(true);
        expect(
            reachabilityModule.isUnreachableRecipientError(
                apiError(403, "Forbidden: bot can't initiate conversation with a user"),
            ),
        ).toBe(true);
        expect(reachabilityModule.isUnreachableRecipientError(apiError(403, "Forbidden: user is deactivated"))).toBe(
            true,
        );
    });

    test("isUnreachableRecipientError leaves real faults alone", () => {
        expect(
            reachabilityModule.isUnreachableRecipientError(apiError(400, "Bad Request: message text is empty")),
        ).toBe(false);
        expect(reachabilityModule.isUnreachableRecipientError(apiError(429, "Too Many Requests"))).toBe(false);
        expect(reachabilityModule.isUnreachableRecipientError(new Error("chat not found"))).toBe(false);
    });

    test("isRecipientReachable reports only reachability failures, not transient ones", async () => {
        const originalSendChatAction = botModule.bot.api.sendChatAction;

        botModule.bot.api.sendChatAction = ((userId: number) => {
            if (userId === 1) {
                return Promise.reject(apiError(400, "Bad Request: chat not found", "sendChatAction"));
            }

            if (userId === 2) {
                return Promise.reject(new Error("network down"));
            }

            return Promise.resolve(true);
        }) as typeof botModule.bot.api.sendChatAction;

        try {
            expect(await reachabilityModule.isRecipientReachable(1)).toBe(false);
            expect(await reachabilityModule.isRecipientReachable(2)).toBe(true);
            expect(await reachabilityModule.isRecipientReachable(3)).toBe(true);
        } finally {
            botModule.bot.api.sendChatAction = originalSendChatAction;
        }
    });
});
