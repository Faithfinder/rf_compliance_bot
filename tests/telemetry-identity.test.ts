process.env.TELEGRAM_BOT_TOKEN ??= "123456:TEST_TOKEN";

import { describe, test, expect, afterEach } from "bun:test";
import { userRef, deploymentRef } from "../src/telemetry/identity";
import { getTelemetryIdentitySalt } from "../src/config/environment";

const originalSalt = process.env.POSTHOG_ID_SALT;
const originalToken = process.env.TELEGRAM_BOT_TOKEN;

function restoreEnvironment(): void {
    if (originalSalt === undefined) {
        delete process.env.POSTHOG_ID_SALT;
    } else {
        process.env.POSTHOG_ID_SALT = originalSalt;
    }

    if (originalToken === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
        process.env.TELEGRAM_BOT_TOKEN = originalToken;
    }
}

describe("Telemetry identity", () => {
    afterEach(restoreEnvironment);

    test("produces a stable prefixed reference for the same user", () => {
        expect(userRef(123)).toBe(userRef(123));
        expect(userRef(123)).toStartWith("u_");
    });

    test("never exposes the raw user id", () => {
        expect(userRef(123)).not.toContain("123");
        expect(userRef(987654321)).not.toContain("987654321");
    });

    test("gives different users different references", () => {
        expect(userRef(123)).not.toBe(userRef(124));
    });

    test("deployment reference is stable and distinctly prefixed", () => {
        expect(deploymentRef()).toBe(deploymentRef());
        expect(deploymentRef()).toStartWith("d_");
        expect(deploymentRef()).not.toBe(userRef(1));
    });

    // The salt is read per call rather than cached. A memoized salt would silently keep using a
    // stale key here, so this is the regression test for that hazard.
    test("changing the salt changes the reference", () => {
        process.env.POSTHOG_ID_SALT = "salt-one";
        const first = userRef(555);

        process.env.POSTHOG_ID_SALT = "salt-two";
        const second = userRef(555);

        expect(first).not.toBe(second);
    });

    test("falls back to the bot token rather than an empty key", () => {
        delete process.env.POSTHOG_ID_SALT;
        process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
        const fromToken = userRef(777);

        process.env.POSTHOG_ID_SALT = "an-explicit-salt";
        const fromSalt = userRef(777);

        expect(getTelemetryIdentitySalt()).toBe("an-explicit-salt");
        expect(fromToken).not.toBe(fromSalt);
    });

    test("reports no salt when neither the salt nor the token is set", () => {
        delete process.env.POSTHOG_ID_SALT;
        delete process.env.TELEGRAM_BOT_TOKEN;

        expect(getTelemetryIdentitySalt()).toBe("");
    });

    test("prefers an explicit salt over the bot token", () => {
        process.env.POSTHOG_ID_SALT = "  explicit  ";
        expect(getTelemetryIdentitySalt()).toBe("explicit");
    });
});
