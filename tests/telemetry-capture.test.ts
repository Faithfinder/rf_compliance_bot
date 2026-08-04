process.env.TELEGRAM_BOT_TOKEN ??= "123456:TEST_TOKEN";
process.env.POSTHOG_ID_SALT ??= "a-test-identity-salt";

import { describe, test, expect, afterEach } from "bun:test";
import { __setTelemetrySink, type TelemetryPayload } from "../src/config/posthog";
import { captureEvent, classifyPublishFailure } from "../src/telemetry/events";
import type { ChannelRequirements } from "../src/utils";

const CHANNEL_ID = "-1009876543210";
const CHANNEL_TITLE = "Тестовый канал";
// A realistic Telegram id: a single-digit id would appear in a hex digest by chance, making the
// "never exposes the raw user id" assertion below meaningless.
const USER_ID = 987654321;

function collect(): TelemetryPayload[] {
    const payloads: TelemetryPayload[] = [];
    __setTelemetrySink((payload) => payloads.push(payload));
    return payloads;
}

describe("Telemetry capture", () => {
    afterEach(() => __setTelemetrySink(null));

    // This is what keeps CI safe: it sets no PostHog environment variables, so every capture in
    // every other test suite has to be an inert no-op.
    test("is a silent no-op with no sink and no client", () => {
        expect(() =>
            captureEvent("message_published", USER_ID, {
                channelId: CHANNEL_ID,
                contentKind: "single",
            }),
        ).not.toThrow();
    });

    // The real CI and production-without-telemetry configuration: no client, no sink, and no salt to
    // hash with. captureEvent has to bail out before it tries to build a distinct id.
    test("is a silent no-op when there is no salt either", () => {
        const salt = process.env.POSTHOG_ID_SALT;
        delete process.env.POSTHOG_ID_SALT;

        try {
            expect(() =>
                captureEvent("message_published", USER_ID, {
                    channelId: CHANNEL_ID,
                    contentKind: "single",
                }),
            ).not.toThrow();
        } finally {
            if (salt !== undefined) {
                process.env.POSTHOG_ID_SALT = salt;
            }
        }
    });

    test("sends channel id and title in the clear", () => {
        const payloads = collect();

        captureEvent("message_published", USER_ID, {
            channelId: CHANNEL_ID,
            channelTitle: CHANNEL_TITLE,
            contentKind: "single",
        });

        expect(payloads).toHaveLength(1);
        expect(payloads[0]?.properties).toEqual({
            channel_id: CHANNEL_ID,
            channel_title: CHANNEL_TITLE,
            content_kind: "single",
        });
    });

    // The counterpart to the test above. Together they are the executable statement of the
    // asymmetry: channels are public, people are not.
    test("never exposes the raw user id", () => {
        const payloads = collect();

        captureEvent("message_published", USER_ID, {
            channelId: CHANNEL_ID,
            channelTitle: CHANNEL_TITLE,
            contentKind: "single",
        });

        const serialized = JSON.stringify(payloads);
        expect(payloads[0]?.distinctId).toStartWith("u_");
        expect(payloads[0]?.distinctId).not.toContain(String(USER_ID));
        expect(serialized).not.toContain(`"${USER_ID}"`);
        expect(serialized).not.toContain(`:${USER_ID},`);
    });

    test("uses a deployment distinct id for a deployment event", () => {
        const payloads = collect();

        captureEvent("bot_started", "deployment", {
            environment: "test",
            fixedChannelMode: false,
            ownerCommandsEnabled: false,
            commandCount: 9,
        });

        expect(payloads[0]?.distinctId).toStartWith("d_");
    });

    // No stand-in identity: posthog-node substitutes a throwaway id and suppresses person
    // processing, so an unidentifiable subject does not accumulate on some other Person.
    test("sends no distinct id for an anonymous event", () => {
        const payloads = collect();

        captureEvent("channel_post_moderated", "anonymous", {
            channelId: CHANNEL_ID,
            channelTitle: CHANNEL_TITLE,
            contentKind: "single",
            notifiedTargets: 1,
            notificationFailures: 0,
            authorKnown: false,
        });

        expect(payloads).toHaveLength(1);
        expect(payloads[0]?.distinctId).toBeUndefined();
        // The channel dimension has to survive, since it is what replaces person attribution.
        expect(payloads[0]?.groups).toEqual({ channel: CHANNEL_ID });
        expect(payloads[0]?.properties.channel_id).toBe(CHANNEL_ID);
    });

    // The anonymous path never hashes, so it must not depend on the salt the way userRef does.
    test("captures an anonymous event with no salt configured", () => {
        const payloads = collect();
        const salt = process.env.POSTHOG_ID_SALT;
        delete process.env.POSTHOG_ID_SALT;

        try {
            captureEvent("channel_post_ignored", "anonymous", {
                channelId: CHANNEL_ID,
                channelTitle: CHANNEL_TITLE,
            });

            expect(payloads).toHaveLength(1);
            expect(payloads[0]?.distinctId).toBeUndefined();
        } finally {
            if (salt !== undefined) {
                process.env.POSTHOG_ID_SALT = salt;
            }
        }
    });

    test("groups channel-scoped events by the raw channel id", () => {
        const payloads = collect();

        captureEvent("message_rejected", USER_ID, {
            channelId: CHANNEL_ID,
            channelTitle: CHANNEL_TITLE,
            contentKind: "single",
            notifiedTargets: 2,
            notificationFailures: 0,
        });

        expect(payloads[0]?.groups).toEqual({ channel: CHANNEL_ID });
    });

    test("omits events with no channel from the channel group", () => {
        const payloads = collect();

        captureEvent("unknown_command", USER_ID, { command: "nope", chatType: "private" });

        expect(payloads[0]?.groups).toBeUndefined();
    });

    test("omits undefined properties entirely", () => {
        const payloads = collect();

        captureEvent("message_published", USER_ID, {
            channelId: CHANNEL_ID,
            channelTitle: undefined,
            contentKind: "album",
            albumSize: undefined,
        });

        expect(payloads[0]?.properties).toEqual({
            channel_id: CHANNEL_ID,
            content_kind: "album",
        });
    });

    test("drops an oversized string property but keeps its siblings", () => {
        const payloads = collect();

        captureEvent("message_published", USER_ID, {
            channelId: CHANNEL_ID,
            channelTitle: "т".repeat(129),
            contentKind: "single",
        });

        expect(payloads[0]?.properties).toEqual({
            channel_id: CHANNEL_ID,
            content_kind: "single",
        });
    });

    test("records the blurb length without the blurb itself", () => {
        const payloads = collect();
        const blurb = "НАСТОЯЩИЙ МАТЕРИАЛ ПРОИЗВЕДЕН ИНОСТРАННЫМ АГЕНТОМ";

        captureEvent("blurb_configured", USER_ID, {
            channelId: CHANNEL_ID,
            blurbLength: blurb.length,
            isUpdate: true,
        });

        expect(payloads[0]?.properties.blurb_length).toBe(blurb.length);
        expect(JSON.stringify(payloads)).not.toContain("ИНОСТРАННЫМ");
    });

    // Every call site relies on this: some sit inside try blocks whose catch reports a publishing
    // failure to the user, and others run in the media group timer where a throw is fatal.
    test("swallows a throwing sink", () => {
        __setTelemetrySink(() => {
            throw new Error("sink exploded");
        });

        expect(() =>
            captureEvent("message_published", USER_ID, {
                channelId: CHANNEL_ID,
                contentKind: "single",
            }),
        ).not.toThrow();
    });
});

describe("classifyPublishFailure", () => {
    const base: ChannelRequirements = {
        channelExists: true,
        botIsAdded: true,
        botCanPost: true,
        botCanDelete: true,
        foreignAgentBlurbConfigured: true,
        notificationRecipientsConfigured: true,
    };

    test.each([
        ["channel_missing", { ...base, channelExists: false }],
        ["bot_not_admin", { ...base, botIsAdded: false }],
        ["bot_cannot_post", { ...base, botCanPost: false }],
        ["unknown", base],
    ] as const)("classifies %s", (expected, requirements) => {
        expect(classifyPublishFailure(requirements)).toBe(expected);
    });
});
