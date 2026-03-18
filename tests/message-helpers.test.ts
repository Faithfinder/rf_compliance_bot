import { describe, test, expect, beforeAll } from "bun:test";
import type { Message } from "grammy/types";

let messageHelpers: typeof import("../src/handlers/message-helpers");

beforeAll(async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        process.env.TELEGRAM_BOT_TOKEN = "test-token";
    }

    messageHelpers = await import("../src/handlers/message-helpers");
});

function createMockMessage(overrides: Partial<Message> = {}): Message {
    return {
        message_id: 1,
        date: Date.now(),
        chat: { id: 123, type: "private" },
        ...overrides,
    } as Message;
}

const BLURB = "Данное сообщение создано иностранным агентом";

describe("validateMessageCompliance", () => {
    test("should pass for text message containing blurb", () => {
        const msg = createMockMessage({ text: `Новость дня. ${BLURB}` });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(true);
    });

    test("should fail for text message without blurb", () => {
        const msg = createMockMessage({ text: "Новость дня." });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(false);
    });

    test("should pass for caption containing blurb", () => {
        const msg = createMockMessage({ caption: `Фото дня. ${BLURB}` });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(true);
    });

    test("should pass for poll question containing blurb", () => {
        const msg = createMockMessage({
            poll: {
                id: "poll-1",
                question: `Ваше мнение? ${BLURB}`,
                options: [
                    { text: "Да", voter_count: 0 },
                    { text: "Нет", voter_count: 0 },
                ],
                total_voter_count: 0,
                is_closed: false,
                is_anonymous: true,
                type: "regular",
                allows_multiple_answers: false,
            },
        });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(true);
    });

    test("should fail for poll question without blurb", () => {
        const msg = createMockMessage({
            poll: {
                id: "poll-2",
                question: "Ваше мнение?",
                options: [
                    { text: "Да", voter_count: 0 },
                    { text: "Нет", voter_count: 0 },
                ],
                total_voter_count: 0,
                is_closed: false,
                is_anonymous: true,
                type: "regular",
                allows_multiple_answers: false,
            },
        });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(false);
    });

    test("should fail for message with no text, caption, or poll", () => {
        const msg = createMockMessage();
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(false);
    });
});

describe("createMediaGroupValidator", () => {
    test("should pass if any message in group is a poll with blurb", () => {
        const validate = messageHelpers.createMediaGroupValidator(BLURB);
        const messages = [
            createMockMessage({ message_id: 1 }),
            createMockMessage({
                message_id: 2,
                poll: {
                    id: "poll-3",
                    question: `Опрос. ${BLURB}`,
                    options: [
                        { text: "Да", voter_count: 0 },
                        { text: "Нет", voter_count: 0 },
                    ],
                    total_voter_count: 0,
                    is_closed: false,
                    is_anonymous: true,
                    type: "regular",
                    allows_multiple_answers: false,
                },
            }),
        ];
        expect(validate(messages)).toBe(true);
    });
});
