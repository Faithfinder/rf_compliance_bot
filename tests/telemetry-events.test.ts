import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import type { Update, UserFromGetMe } from "grammy/types";

// Loaded dynamically because src/config/bot.ts throws at import time without a token, and an
// import statement would be hoisted above any assignment to process.env.
let botModule: typeof import("../src/config/bot");
let posthog: typeof import("../src/config/posthog");
let database: typeof import("../src/db/database");

const BLURB = "НАСТОЯЩИЙ МАТЕРИАЛ ПРОИЗВЕДЕН ИНОСТРАННЫМ АГЕНТОМ";
const CHANNEL_ID = -1009876543211;
const CHANNEL_TITLE = "Канал телеметрии";
const NOTIFY_USER_ID = 556;

// Left without a blurb on purpose. Each dedup test needs its own id: the set backing the
// once-per-channel behaviour lives for the lifetime of the module and cannot be reset from here.
const UNCONFIGURED_CHANNEL_ID = -1009000000001;
const OTHER_UNCONFIGURED_CHANNEL_ID = -1009000000002;

// utils/media-groups.ts debounces album assembly by 200ms.
const DEBOUNCE_WAIT_MS = 250;

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

let payloads: import("../src/config/posthog").TelemetryPayload[] = [];

interface PostOptions {
    chatId?: number;
    title?: string;
    messageId?: number;
    mediaGroupId?: string;
    fromId?: number;
}

function channelPost(text: string, options: PostOptions = {}): Update {
    const chatId = options.chatId ?? CHANNEL_ID;

    return {
        update_id: 1,
        channel_post: {
            message_id: options.messageId ?? 10,
            date: 0,
            chat: { id: chatId, type: "channel", title: options.title ?? CHANNEL_TITLE },
            text,
            ...(options.mediaGroupId && { media_group_id: options.mediaGroupId }),
            ...(options.fromId && {
                from: { id: options.fromId, is_bot: options.fromId === botInfo.id, first_name: "Автор" },
            }),
        },
    } as Update;
}

function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WAIT_MS));
}

describe("Handler telemetry", () => {
    beforeAll(async () => {
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
        }

        // Required: identifier hashing has no default salt.
        process.env.POSTHOG_ID_SALT ??= "a-test-identity-salt";

        botModule = await import("../src/config/bot");
        posthog = await import("../src/config/posthog");
        database = await import("../src/db/database");
        const { registerMessageHandler } = await import("../src/handlers/message");

        database.initializeDatabase();
        database.updateChannelSettings(String(CHANNEL_ID), {
            foreignAgentBlurb: BLURB,
            notificationUserIds: [NOTIFY_USER_ID],
        });

        const bot = botModule.bot;
        bot.botInfo = botInfo;

        bot.api.config.use((_prev, method) => {
            const result =
                method === "sendMessage" || method === "copyMessage" ?
                    { message_id: 1, date: 0, chat: { id: 1, type: "private" } }
                :   true;
            return Promise.resolve({ ok: true, result } as never);
        });

        registerMessageHandler();
    });

    beforeEach(() => {
        payloads = [];
        posthog.__setTelemetrySink((payload) => payloads.push(payload));
    });

    afterAll(() => {
        posthog.__setTelemetrySink(null);
        database.deleteChannelSettings(String(CHANNEL_ID));
    });

    function eventsNamed(event: string) {
        return payloads.filter((payload) => payload.event === event);
    }

    test("records a moderated channel post with plaintext channel data", async () => {
        await botModule.bot.handleUpdate(channelPost("Пост без маркировки"));

        const moderatedEvents = eventsNamed("channel_post_moderated");
        expect(moderatedEvents).toHaveLength(1);

        const [moderated] = moderatedEvents;
        expect(moderated?.properties).toEqual({
            channel_id: String(CHANNEL_ID),
            channel_title: CHANNEL_TITLE,
            content_kind: "single",
            notified_targets: 1,
            notification_failures: 0,
            unreachable_targets: 0,
            author_known: false,
        });
        expect(moderated?.groups).toEqual({ channel: String(CHANNEL_ID) });
    });

    // Telegram usually omits `from` on channel posts, so this is the common path. It must not land
    // on the deployment Person, which would otherwise absorb almost all channel activity.
    test("creates no person for a channel post with no identifiable author", async () => {
        await botModule.bot.handleUpdate(channelPost("Ещё один пост без маркировки"));

        const [moderated] = eventsNamed("channel_post_moderated");
        expect(moderated?.distinctId).toBeUndefined();
        expect(moderated?.groups).toEqual({ channel: String(CHANNEL_ID) });
    });

    test("attributes a channel post to the author when Telegram provides one", async () => {
        // Must not be a substring of CHANNEL_ID, or the leak assertion below matches the channel id
        // that is legitimately in the payload.
        const authorId = 555000111;

        await botModule.bot.handleUpdate(channelPost("Пост от автора", { fromId: authorId }));

        const [moderated] = eventsNamed("channel_post_moderated");
        expect(moderated?.distinctId).toStartWith("u_");
        expect(moderated?.properties.author_known).toBe(true);
        expect(JSON.stringify(payloads)).not.toContain(String(authorId));
    });

    test("never records the post text or the blurb", async () => {
        await botModule.bot.handleUpdate(channelPost("Совершенно секретный текст поста"));

        const serialized = JSON.stringify(payloads);
        expect(serialized).not.toContain("секретный");
        expect(serialized).not.toContain("ИНОСТРАННЫМ");
    });

    test("records a compliant channel post as allowed", async () => {
        await botModule.bot.handleUpdate(channelPost(`Пост с маркировкой. ${BLURB}`));

        const allowed = eventsNamed("channel_post_allowed");
        expect(allowed).toHaveLength(1);
        expect(allowed[0]?.properties).toEqual({
            channel_id: String(CHANNEL_ID),
            channel_title: CHANNEL_TITLE,
            content_kind: "single",
            author_known: false,
        });
        expect(eventsNamed("channel_post_moderated")).toHaveLength(0);
    });

    test("does not record notification counts on an allowed post", async () => {
        await botModule.bot.handleUpdate(channelPost(`Пост с маркировкой. ${BLURB}`));

        const properties = eventsNamed("channel_post_allowed")[0]?.properties ?? {};
        expect(properties).not.toHaveProperty("notified_targets");
        expect(properties).not.toHaveProperty("notification_failures");
    });

    test("never records the text of an allowed post", async () => {
        await botModule.bot.handleUpdate(channelPost(`Ещё один секрет в разрешённом посте. ${BLURB}`));

        const serialized = JSON.stringify(payloads);
        expect(serialized).not.toContain("секрет");
        expect(serialized).not.toContain("ИНОСТРАННЫМ");
    });

    test("records a compliant album as allowed, with its size", async () => {
        const mediaGroupId = "allowed-album-1";

        await botModule.bot.handleUpdate(channelPost(`Первая часть. ${BLURB}`, { messageId: 20, mediaGroupId }));
        await botModule.bot.handleUpdate(channelPost("Вторая часть", { messageId: 21, mediaGroupId }));
        await settle();

        const allowed = eventsNamed("channel_post_allowed");
        expect(allowed).toHaveLength(1);
        expect(allowed[0]?.properties).toEqual({
            channel_id: String(CHANNEL_ID),
            channel_title: CHANNEL_TITLE,
            content_kind: "album",
            album_size: 2,
            author_known: false,
        });
    });

    // Both posts go through one test so the result cannot depend on test ordering.
    test("reports an unconfigured channel once, not once per post", async () => {
        const chatId = UNCONFIGURED_CHANNEL_ID;

        await botModule.bot.handleUpdate(channelPost("Первый пост", { chatId, title: "Ненастроенный" }));
        await botModule.bot.handleUpdate(channelPost("Второй пост", { chatId, title: "Ненастроенный", messageId: 11 }));

        const ignored = eventsNamed("channel_post_ignored");
        expect(ignored).toHaveLength(1);
        expect(ignored[0]?.properties).toEqual({
            channel_id: String(chatId),
            channel_title: "Ненастроенный",
        });
        // A channel's configuration gap is neither a person nor a fact about the deployment.
        expect(ignored[0]?.distinctId).toBeUndefined();
    });

    // Proves the dedup is keyed per channel rather than being a global once-only flag.
    test("still reports a different unconfigured channel", async () => {
        await botModule.bot.handleUpdate(
            channelPost("Пост", { chatId: OTHER_UNCONFIGURED_CHANNEL_ID, title: "Другой" }),
        );

        expect(eventsNamed("channel_post_ignored")).toHaveLength(1);
        expect(eventsNamed("channel_post_ignored")[0]?.properties.channel_id).toBe(
            String(OTHER_UNCONFIGURED_CHANNEL_ID),
        );
    });

    test("neither moderates nor counts an unconfigured channel post", async () => {
        await botModule.bot.handleUpdate(
            channelPost("Пост", { chatId: UNCONFIGURED_CHANNEL_ID, title: "Ненастроенный", messageId: 12 }),
        );

        expect(eventsNamed("channel_post_allowed")).toHaveLength(0);
        expect(eventsNamed("channel_post_moderated")).toHaveLength(0);
    });

    // The bot echoes published messages into the channel itself. Counting those would double-count
    // every message_published.
    test("records nothing for the bot's own channel post", async () => {
        await botModule.bot.handleUpdate(channelPost(`Опубликовано ботом. ${BLURB}`, { fromId: botInfo.id }));

        expect(payloads).toHaveLength(0);
    });
});
