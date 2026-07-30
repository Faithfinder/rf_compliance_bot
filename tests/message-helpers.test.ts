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
                    { text: "Да", voter_count: 0, persistent_id: "opt-yes" },
                    { text: "Нет", voter_count: 0, persistent_id: "opt-no" },
                ],
                total_voter_count: 0,
                is_closed: false,
                is_anonymous: true,
                type: "regular",
                allows_multiple_answers: false,
                allows_revoting: false,
                members_only: false,
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
                    { text: "Да", voter_count: 0, persistent_id: "opt-yes" },
                    { text: "Нет", voter_count: 0, persistent_id: "opt-no" },
                ],
                total_voter_count: 0,
                is_closed: false,
                is_anonymous: true,
                type: "regular",
                allows_multiple_answers: false,
                allows_revoting: false,
                members_only: false,
            },
        });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(false);
    });

    test("should fail for message with no text, caption, or poll", () => {
        const msg = createMockMessage();
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(false);
    });

    test("should pass for rich message with the blurb in a paragraph", () => {
        const msg = createMockMessage({
            rich_message: {
                blocks: [
                    { type: "heading", text: "Новость дня", size: 2 },
                    { type: "paragraph", text: BLURB },
                ],
            },
        });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(true);
    });

    test("should pass for rich message with the blurb split by inline formatting", () => {
        const msg = createMockMessage({
            rich_message: {
                blocks: [
                    {
                        type: "paragraph",
                        text: ["Данное сообщение создано ", { type: "bold", text: "иностранным агентом" }],
                    },
                ],
            },
        });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(true);
    });

    test("should pass for rich message with the blurb in a footer", () => {
        const msg = createMockMessage({
            rich_message: {
                blocks: [
                    { type: "paragraph", text: "Новость дня." },
                    { type: "footer", text: BLURB },
                ],
            },
        });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(true);
    });

    test("should pass for rich message with the blurb split across blocks", () => {
        const msg = createMockMessage({
            rich_message: {
                blocks: [
                    { type: "paragraph", text: "Данное сообщение создано" },
                    { type: "paragraph", text: "иностранным агентом" },
                ],
            },
        });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(true);
    });

    test("should fail for rich message without the blurb", () => {
        const msg = createMockMessage({
            rich_message: {
                blocks: [
                    { type: "heading", text: "Новость дня", size: 2 },
                    { type: "paragraph", text: "Обычный текст без предупреждения." },
                ],
            },
        });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(false);
    });

    test("should not relax whitespace matching for plain text messages", () => {
        const msg = createMockMessage({ text: "Данное сообщение создано\nиностранным агентом" });
        expect(messageHelpers.validateMessageCompliance(msg, BLURB)).toBe(false);
    });
});

describe("extractMessageText", () => {
    test("should prefer rich message content over other fields", () => {
        const msg = createMockMessage({
            rich_message: { blocks: [{ type: "paragraph", text: "Богатый текст" }] },
        });
        expect(messageHelpers.extractMessageText(msg)).toBe("Богатый текст");
    });

    test("should fall back to caption for media messages", () => {
        const msg = createMockMessage({ caption: "Подпись" });
        expect(messageHelpers.extractMessageText(msg)).toBe("Подпись");
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
                        { text: "Да", voter_count: 0, persistent_id: "opt-yes" },
                        { text: "Нет", voter_count: 0, persistent_id: "opt-no" },
                    ],
                    total_voter_count: 0,
                    is_closed: false,
                    is_anonymous: true,
                    type: "regular",
                    allows_multiple_answers: false,
                    allows_revoting: false,
                    members_only: false,
                },
            }),
        ];
        expect(validate(messages)).toBe(true);
    });
});
