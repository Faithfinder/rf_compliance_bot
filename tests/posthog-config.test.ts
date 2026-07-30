import { describe, test, expect, beforeAll, afterEach } from "bun:test";

// Loaded dynamically so the environment can be arranged before the module reads it. Importing it
// also proves posthog-node resolves and evaluates under Bun, which its package engines field does
// not promise.
let posthog: typeof import("../src/config/posthog");

const originalApiKey = process.env.POSTHOG_API_KEY;
const originalSalt = process.env.POSTHOG_ID_SALT;
const originalToken = process.env.TELEGRAM_BOT_TOKEN;

function restore(name: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}

describe("PostHog configuration", () => {
    beforeAll(async () => {
        posthog = await import("../src/config/posthog");
    });

    afterEach(async () => {
        restore("POSTHOG_API_KEY", originalApiKey);
        restore("POSTHOG_ID_SALT", originalSalt);
        restore("TELEGRAM_BOT_TOKEN", originalToken);
        await posthog.closePostHog();
    });

    test("stays disabled without an API key", () => {
        delete process.env.POSTHOG_API_KEY;

        expect(posthog.initializePostHog()).toBe(false);
    });

    // Emitting hashes that can be brute-forced back to Telegram user ids would be worse than
    // collecting nothing, so a missing salt disables telemetry rather than degrading it.
    test("refuses to start without an identity salt", () => {
        process.env.POSTHOG_API_KEY = "phc_test_key";
        delete process.env.POSTHOG_ID_SALT;
        delete process.env.TELEGRAM_BOT_TOKEN;

        expect(posthog.initializePostHog()).toBe(false);
    });

    test("initializes with an API key and a salt", () => {
        process.env.POSTHOG_API_KEY = "phc_test_key";
        process.env.POSTHOG_ID_SALT = "a-test-salt";

        expect(posthog.initializePostHog()).toBe(true);
    });

    test("closing without a client resolves", async () => {
        await expect(posthog.closePostHog()).resolves.toBeUndefined();
    });

    test("identifying a channel while disabled is a no-op", () => {
        expect(() => posthog.identifyChannel("-100123", "Канал")).not.toThrow();
    });
});
