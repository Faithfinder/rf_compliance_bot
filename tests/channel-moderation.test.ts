import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import type { Update, UserFromGetMe } from "grammy/types";

// src/config/bot.ts throws at import time without a token, and a static import would be hoisted
// above any assignment to process.env. The modules are loaded on demand in beforeAll instead.
let botModule: typeof import("../src/config/bot");
let database: typeof import("../src/db/database");

const BLURB = "НАСТОЯЩИЙ МАТЕРИАЛ ПРОИЗВЕДЕН ИНОСТРАННЫМ АГЕНТОМ";
const CHANNEL_ID = -1009876543210;
const NOTIFY_USER_ID = 555;

const botInfo: UserFromGetMe = {
    id: 42,
    is_bot: true,
    first_name: "Test",
    username: "test_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
};

interface ApiCall {
    method: string;
    payload: Record<string, unknown>;
}

let calls: ApiCall[] = [];

function callsTo(method: string): ApiCall[] {
    return calls.filter((call) => call.method === method);
}

function channelPost(text: string): Update {
    return {
        update_id: 1,
        channel_post: {
            message_id: 10,
            date: 0,
            chat: { id: CHANNEL_ID, type: "channel", title: "Тестовый канал" },
            text,
        },
    } as Update;
}

describe("Channel post moderation", () => {
    beforeAll(async () => {
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
        }

        botModule = await import("../src/config/bot");
        database = await import("../src/db/database");
        const { registerMessageHandler } = await import("../src/handlers/message");

        const bot = botModule.bot;

        database.initializeDatabase();
        bot.botInfo = botInfo;

        // Every outbound API call is captured instead of hitting Telegram. grammY copies the
        // transformers installed on bot.api onto the per-update Api that handlers receive.
        bot.api.config.use((_prev, method, payload) => {
            calls.push({ method, payload: payload as Record<string, unknown> });

            const result =
                method === "sendMessage" || method === "copyMessage" ?
                    { message_id: 1, date: 0, chat: { id: 1, type: "private" } }
                :   true;

            return Promise.resolve({ ok: true, result } as never);
        });

        registerMessageHandler();
    });

    afterAll(() => {
        database.deleteChannelSettings(CHANNEL_ID.toString());
        database.closeDatabase();
    });

    beforeEach(() => {
        calls = [];
        database.deleteChannelSettings(CHANNEL_ID.toString());
        database.updateChannelSettings(CHANNEL_ID.toString(), {
            foreignAgentBlurb: BLURB,
            notificationUserIds: [NOTIFY_USER_ID],
        });
    });

    test("deletes a channel post that is missing the blurb", async () => {
        await botModule.bot.handleUpdate(channelPost("Обычный пост без всего"));

        expect(callsTo("deleteMessage")).toHaveLength(1);
        expect(callsTo("deleteMessage")[0]?.payload).toMatchObject({
            chat_id: CHANNEL_ID,
            message_id: 10,
        });
    });

    test("notifies subscribed admins before deleting, with a copy of the post", async () => {
        await botModule.bot.handleUpdate(channelPost("Обычный пост без всего"));

        const notifications = callsTo("sendMessage");
        expect(notifications).toHaveLength(1);
        expect(notifications[0]?.payload.chat_id).toBe(NOTIFY_USER_ID);
        expect(notifications[0]?.payload.text).toContain("Сообщение отклонено");

        const copies = callsTo("copyMessage");
        expect(copies).toHaveLength(1);
        expect(copies[0]?.payload).toMatchObject({
            chat_id: NOTIFY_USER_ID,
            from_chat_id: CHANNEL_ID,
            message_id: 10,
        });

        // The copy has to be forwarded before the original is removed from the channel.
        const methods = calls.map((call) => call.method);
        expect(methods.indexOf("copyMessage")).toBeLessThan(methods.indexOf("deleteMessage"));
    });

    test("leaves a compliant channel post alone", async () => {
        await botModule.bot.handleUpdate(channelPost(`Текст поста.\n\n${BLURB}`));

        expect(calls).toHaveLength(0);
    });

    test("skips moderation when no blurb is configured for the channel", async () => {
        database.deleteChannelSettings(CHANNEL_ID.toString());

        await botModule.bot.handleUpdate(channelPost("Обычный пост без всего"));

        expect(calls).toHaveLength(0);
    });
});
