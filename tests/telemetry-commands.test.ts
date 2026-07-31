import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import type { Update, UserFromGetMe } from "grammy/types";

// Loaded dynamically because src/config/bot.ts throws at import time without a token, and an
// import statement would be hoisted above any assignment to process.env.
let botModule: typeof import("../src/config/bot");
let posthog: typeof import("../src/config/posthog");

const USER_ID = 4242;

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

function privateMessage(text: string): Update {
    return {
        update_id: 1,
        message: {
            message_id: 10,
            date: 0,
            chat: { id: USER_ID, type: "private", first_name: "Тест" },
            from: { id: USER_ID, is_bot: false, first_name: "Тест" },
            text,
            // grammY derives the command from the entities, exactly as Telegram sends them.
            entities:
                text.startsWith("/") ?
                    [{ type: "bot_command", offset: 0, length: text.split(" ")[0]?.length ?? 0 }]
                :   undefined,
        },
    } as Update;
}

function mentionedCommand(): Update {
    const text = "смотри /help вот так";
    return {
        update_id: 2,
        message: {
            message_id: 11,
            date: 0,
            chat: { id: USER_ID, type: "private", first_name: "Тест" },
            from: { id: USER_ID, is_bot: false, first_name: "Тест" },
            text,
            entities: [{ type: "bot_command", offset: text.indexOf("/help"), length: 5 }],
        },
    } as Update;
}

describe("Command telemetry", () => {
    beforeAll(async () => {
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
        }

        // Required: identifier hashing has no default salt.
        process.env.POSTHOG_ID_SALT ??= "a-test-identity-salt";

        botModule = await import("../src/config/bot");
        posthog = await import("../src/config/posthog");
        const { registerCommandTelemetry } = await import("../src/telemetry/commands");

        const bot = botModule.bot;
        bot.botInfo = botInfo;

        // Nothing may reach Telegram. Installed before the middleware under test so a command
        // handler registered by another suite cannot make a real request either.
        bot.api.config.use((_prev, method) => {
            const result =
                method === "sendMessage" || method === "copyMessage" ?
                    { message_id: 1, date: 0, chat: { id: 1, type: "private" } }
                :   true;
            return Promise.resolve({ ok: true, result } as never);
        });

        // A stand-in for the session middleware: the telemetry middleware reports whether a channel
        // is configured, and the real session store would need the database.
        bot.chatType("private").use(async (ctx, next) => {
            ctx.session = {};
            return next();
        });

        registerCommandTelemetry();
    });

    beforeEach(() => {
        payloads = [];
        posthog.__setTelemetrySink((payload) => payloads.push(payload));
    });

    afterAll(() => posthog.__setTelemetrySink(null));

    function eventsNamed(event: string) {
        return payloads.filter((payload) => payload.event === event);
    }

    test("records a known command", async () => {
        await botModule.bot.handleUpdate(privateMessage("/help"));

        const [invoked] = eventsNamed("command_invoked");
        expect(invoked?.properties).toEqual({
            command: "help",
            chat_type: "private",
            has_args: false,
            channel_configured: false,
        });
    });

    test("strips the @botname suffix", async () => {
        await botModule.bot.handleUpdate(privateMessage("/help@test_bot"));

        expect(eventsNamed("command_invoked")[0]?.properties.command).toBe("help");
    });

    test("reports that arguments were present without recording them", async () => {
        await botModule.bot.handleUpdate(privateMessage("/set_fa_blurb СЕКРЕТНЫЙ ТЕКСТ"));

        const [invoked] = eventsNamed("command_invoked");
        expect(invoked?.properties.command).toBe("set_fa_blurb");
        expect(invoked?.properties.has_args).toBe(true);
        expect(JSON.stringify(payloads)).not.toContain("СЕКРЕТНЫЙ");
    });

    // /notify_add and /notify_remove take a raw numeric Telegram user id as their argument, which is
    // exactly the identifier the hashing exists to protect.
    test("never records a user id passed as a command argument", async () => {
        await botModule.bot.handleUpdate(privateMessage("/notify_add 123456789"));

        const [invoked] = eventsNamed("command_invoked");
        expect(invoked?.properties.command).toBe("notify_add");
        expect(invoked?.properties.has_args).toBe(true);
        expect(JSON.stringify(payloads)).not.toContain("123456789");
    });

    test("records an unrecognised command", async () => {
        await botModule.bot.handleUpdate(privateMessage("/setblurb"));

        expect(eventsNamed("command_invoked")).toHaveLength(0);
        expect(eventsNamed("unknown_command")[0]?.properties).toEqual({
            command: "setblurb",
            chat_type: "private",
        });
    });

    // An unknown token is user-controlled, so an id-shaped one must not be passed through just
    // because it happens to occupy the command position.
    test("redacts an identifier-shaped unknown command", async () => {
        await botModule.bot.handleUpdate(privateMessage("/123456789"));

        expect(eventsNamed("unknown_command")[0]?.properties.command).toBe("redacted");
        expect(JSON.stringify(payloads)).not.toContain("123456789");
    });

    test("redacts an unknown command with an embedded identifier", async () => {
        await botModule.bot.handleUpdate(privateMessage("/user_987654321"));

        expect(eventsNamed("unknown_command")[0]?.properties.command).toBe("redacted");
    });

    test("keeps a short digit suffix that cannot be an identifier", async () => {
        await botModule.bot.handleUpdate(privateMessage("/step2"));

        expect(eventsNamed("unknown_command")[0]?.properties.command).toBe("step2");
    });

    test("ignores a message that is not a command", async () => {
        await botModule.bot.handleUpdate(privateMessage("обычное сообщение"));

        expect(eventsNamed("command_invoked")).toHaveLength(0);
        expect(eventsNamed("unknown_command")).toHaveLength(0);
    });

    // Matches grammY's own semantics: only a command at offset 0 invokes a handler.
    test("ignores a command mentioned mid-text", async () => {
        await botModule.bot.handleUpdate(mentionedCommand());

        expect(eventsNamed("command_invoked")).toHaveLength(0);
        expect(eventsNamed("unknown_command")).toHaveLength(0);
    });

    test("hashes the invoking user", async () => {
        await botModule.bot.handleUpdate(privateMessage("/start"));

        const [invoked] = eventsNamed("command_invoked");
        expect(invoked?.distinctId).toStartWith("u_");
        expect(invoked?.distinctId).not.toContain(String(USER_ID));
    });
});
