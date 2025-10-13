import { describe, test, expect, beforeAll } from "bun:test";

let rejectionModule: typeof import("../src/notifications/rejection");
let botModule: typeof import("../src/config/bot");

beforeAll(async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        process.env.TELEGRAM_BOT_TOKEN = "test-token";
    }

    rejectionModule = await import("../src/notifications/rejection");
    botModule = await import("../src/config/bot");
});

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

        expect(message).toContain("🚫 <b>Сообщение отклонено</b>");
        expect(message).toContain("Test Channel (<code>-1001234567890</code>)");
        expect(message).toContain("👤 <b>Пользователь:</b> Moderator (@moderator)");
        expect(message).toContain("🆔 <b>ID:</b> <code>42</code>");
        expect(message).toContain(
            `❌ <b>Причина:</b> ${rejectionModule.FOREIGN_AGENT_REJECTION_REASON}`,
        );
        expect(message).toContain("📝 <b>Отклоненное сообщение:</b>");
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

        expect(message).toContain("Signed Author");
        expect(message).not.toContain("🆔 <b>ID:</b>");
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
});
