import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Bot, session } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { SqliteSessionStorage } from "../src/db/session-storage";
import type { SessionContext, SessionData } from "../src/config/session";

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

const db = new Database(":memory:");
db.run(
    `CREATE TABLE sessions (user_id TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL)`,
);

function sessionKeys(): string[] {
    return db
        .query<{ user_id: string }, []>("SELECT user_id FROM sessions")
        .all()
        .map((row) => row.user_id);
}

/** Mirrors how src/index.ts registers the session middleware. */
function createBot(): Bot<SessionContext> {
    const bot = new Bot<SessionContext>("123456:TEST_TOKEN", { botInfo });

    bot.chatType(["private", "group", "supergroup"]).use(
        session({
            initial: (): SessionData => ({ channelConfig: { channelId: "-100777" } }),
            storage: new SqliteSessionStorage<SessionData>(db),
        }),
    );

    bot.on("channel_post", () => {});
    bot.chatType("private").on("message", () => {});

    return bot;
}

const channelPost = {
    update_id: 1,
    channel_post: {
        message_id: 10,
        date: 0,
        chat: { id: -1009876543210, type: "channel", title: "Тестовый канал" },
        text: "Пост",
    },
} as Update;

const privateMessage = {
    update_id: 2,
    message: {
        message_id: 11,
        date: 0,
        chat: { id: 777, type: "private" },
        from: { id: 777, is_bot: false, first_name: "Пользователь" },
        text: "Привет",
    },
} as Update;

describe("Session middleware scope", () => {
    beforeEach(() => {
        db.run("DELETE FROM sessions");
    });

    afterAll(() => {
        db.close();
    });

    // grammY keys sessions by chat id and writes back unconditionally because initial() returns
    // a value, so a globally registered session middleware persists a row per moderated channel.
    test("does not persist a session for a channel post", async () => {
        await createBot().handleUpdate(channelPost);

        expect(sessionKeys()).toEqual([]);
    });

    test("still persists a session for a private message", async () => {
        await createBot().handleUpdate(privateMessage);

        expect(sessionKeys()).toEqual(["777"]);
    });
});
