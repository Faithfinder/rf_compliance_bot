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

function channelPost(text: string): Update {
    return {
        update_id: 1,
        channel_post: {
            message_id: 10,
            date: 0,
            chat: { id: CHANNEL_ID, type: "channel", title: CHANNEL_TITLE },
            text,
        },
    } as Update;
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
            author_known: false,
        });
        expect(moderated?.groups).toEqual({ channel: String(CHANNEL_ID) });
    });

    test("attributes an anonymous channel post to the deployment", async () => {
        await botModule.bot.handleUpdate(channelPost("Ещё один пост без маркировки"));

        expect(eventsNamed("channel_post_moderated")[0]?.distinctId).toStartWith("d_");
    });

    test("never records the post text or the blurb", async () => {
        await botModule.bot.handleUpdate(channelPost("Совершенно секретный текст поста"));

        const serialized = JSON.stringify(payloads);
        expect(serialized).not.toContain("секретный");
        expect(serialized).not.toContain("ИНОСТРАННЫМ");
    });

    test("records nothing for a compliant channel post", async () => {
        await botModule.bot.handleUpdate(channelPost(`Пост с маркировкой. ${BLURB}`));

        expect(payloads).toHaveLength(0);
    });
});
