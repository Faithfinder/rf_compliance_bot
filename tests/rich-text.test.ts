import { describe, test, expect } from "bun:test";
import type { RichBlock, RichMessage } from "grammy/types";
import { extractRichMessageText, flattenRichText } from "../src/utils/rich-text";

function createRichMessage(blocks: RichBlock[]): RichMessage {
    return { blocks };
}

describe("flattenRichText", () => {
    test("should return plain strings as is", () => {
        expect(flattenRichText("Привет")).toBe("Привет");
    });

    test("should concatenate nested arrays without separators", () => {
        expect(flattenRichText(["Привет, ", { type: "bold", text: "мир" }, "!"])).toBe("Привет, мир!");
    });

    test("should flatten deeply nested formatting", () => {
        const text = {
            type: "bold" as const,
            text: ["жирный ", { type: "italic" as const, text: { type: "underline" as const, text: "текст" } }],
        };
        expect(flattenRichText(text)).toBe("жирный текст");
    });

    test("should use the alternative text of custom emoji", () => {
        expect(flattenRichText({ type: "custom_emoji", custom_emoji_id: "1", alternative_text: "👍" })).toBe("👍");
    });

    test("should use the LaTeX source of mathematical expressions", () => {
        expect(flattenRichText({ type: "mathematical_expression", expression: "E = mc^2" })).toBe("E = mc^2");
    });

    test("should ignore anchors", () => {
        expect(flattenRichText({ type: "anchor", name: "chapter-1" })).toBe("");
    });

    test("should return the visible text of links and mentions", () => {
        expect(flattenRichText({ type: "url", text: "ссылка", url: "https://t.me/" })).toBe("ссылка");
        expect(flattenRichText({ type: "hashtag", text: "#тег", hashtag: "тег" })).toBe("#тег");
    });

    test("should return an empty string for missing text", () => {
        expect(flattenRichText(undefined)).toBe("");
    });
});

describe("extractRichMessageText", () => {
    test("should join blocks with newlines and skip empty ones", () => {
        const richMessage = createRichMessage([
            { type: "heading", text: "Заголовок", size: 1 },
            { type: "divider" },
            { type: "paragraph", text: "Первый абзац" },
            { type: "paragraph", text: "" },
            { type: "paragraph", text: "Второй абзац" },
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Заголовок\nПервый абзац\nВторой абзац");
    });

    test("should extract text from list items, including nested lists", () => {
        const richMessage = createRichMessage([
            {
                type: "list",
                items: [
                    { label: "1.", blocks: [{ type: "paragraph", text: "Первый пункт" }] },
                    {
                        label: "2.",
                        blocks: [
                            { type: "paragraph", text: "Второй пункт" },
                            {
                                type: "list",
                                items: [{ label: "-", blocks: [{ type: "paragraph", text: "Вложенный пункт" }] }],
                            },
                        ],
                    },
                ],
            },
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Первый пункт\nВторой пункт\nВложенный пункт");
    });

    test("should extract quotations with their credit", () => {
        const richMessage = createRichMessage([
            {
                type: "blockquote",
                blocks: [{ type: "paragraph", text: "Цитата" }],
                credit: "Автор",
            },
            { type: "pullquote", text: "Выноска", credit: "Другой автор" },
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Цитата\nАвтор\nВыноска\nДругой автор");
    });

    test("should extract captions of media blocks", () => {
        const richMessage = createRichMessage([
            {
                type: "photo",
                photo: [{ file_id: "photo-1", file_unique_id: "photo-1-unique", width: 100, height: 100 }],
                caption: { text: "Подпись к фото", credit: "Фотограф" },
            },
            {
                type: "video",
                video: {
                    file_id: "video-1",
                    file_unique_id: "video-1-unique",
                    width: 100,
                    height: 100,
                    duration: 10,
                },
            },
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Подпись к фото\nФотограф");
    });

    test("should extract captions of collages and slideshows", () => {
        const richMessage = createRichMessage([
            {
                type: "collage",
                blocks: [
                    {
                        type: "photo",
                        photo: [{ file_id: "photo-1", file_unique_id: "photo-1-unique", width: 100, height: 100 }],
                        caption: { text: "Внутренняя подпись" },
                    },
                ],
                caption: { text: "Подпись к коллажу" },
            },
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Внутренняя подпись\nПодпись к коллажу");
    });

    test("should extract table cells row by row", () => {
        const richMessage = createRichMessage([
            {
                type: "table",
                cells: [
                    [
                        { text: "Метрика", is_header: true, align: "left", valign: "top" },
                        { text: "Значение", is_header: true, align: "right", valign: "top" },
                    ],
                    [
                        { text: "Скорость", align: "left", valign: "middle" },
                        { align: "right", valign: "middle" },
                    ],
                ],
                caption: "Таблица",
            },
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Метрика Значение\nСкорость \nТаблица");
    });

    test("should extract the summary and content of details blocks", () => {
        const richMessage = createRichMessage([
            {
                type: "details",
                summary: "Подробности",
                blocks: [{ type: "paragraph", text: "Скрытый текст" }],
            },
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Подробности\nСкрытый текст");
    });

    test("should extract footers, preformatted text and formulas", () => {
        const richMessage = createRichMessage([
            { type: "pre", text: "print('hi')", language: "python" },
            { type: "mathematical_expression", expression: "E = mc^2" },
            { type: "footer", text: "Сноска" },
        ]);

        expect(extractRichMessageText(richMessage)).toBe("print('hi')\nE = mc^2\nСноска");
    });

    test("should extract text from block types unknown to the current Bot API types", () => {
        const richMessage = createRichMessage([
            { type: "future_block", text: "Новый блок" } as unknown as RichBlock,
            {
                type: "future_container",
                blocks: [{ type: "paragraph", text: "Вложенный абзац" }],
                caption: { text: "Подпись" },
            } as unknown as RichBlock,
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Новый блок\nВложенный абзац\nПодпись");
    });

    test("should survive unknown blocks whose blocks/items are not arrays", () => {
        const richMessage = createRichMessage([
            { type: "poll", items: ["Да", "Нет"] } as unknown as RichBlock,
            { type: "widget", blocks: { inner: 1 } } as unknown as RichBlock,
            { type: "future_block", text: "Виден" } as unknown as RichBlock,
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Виден");
    });

    test("should read captions given as bare rich text", () => {
        const richMessage = createRichMessage([
            { type: "future_media", caption: "Подпись строкой" } as unknown as RichBlock,
            { type: "future_media", caption: ["Подпись ", { type: "bold", text: "массивом" }] } as unknown as RichBlock,
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Подпись строкой\nПодпись массивом");
    });

    test("should read the bare rich text caption of a table", () => {
        const richMessage = createRichMessage([
            {
                type: "table",
                cells: [[{ text: "Ячейка" }]],
                caption: "Подпись таблицы",
            } as unknown as RichBlock,
        ]);

        expect(extractRichMessageText(richMessage)).toBe("Ячейка\nПодпись таблицы");
    });

    test("should return an empty string for a message without text content", () => {
        const richMessage = createRichMessage([{ type: "divider" }, { type: "anchor", name: "top" }]);

        expect(extractRichMessageText(richMessage)).toBe("");
    });
});
