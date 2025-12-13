import { describe, test, expect, spyOn } from "bun:test";
import * as Sentry from "@sentry/bun";

describe("Sentry Configuration", () => {
    test("should initialize Sentry with normalizeDepth set to 5", async () => {
        const originalDSN = process.env.SENTRY_DSN;
        const originalEnv = process.env.NODE_ENV;

        try {
            const initSpy = spyOn(Sentry, "init");

            process.env.SENTRY_DSN = "https://test@sentry.io/12345";
            process.env.NODE_ENV = "test";

            const { initializeSentry } = await import("../src/config/sentry");
            const result = initializeSentry();

            expect(result).toBe(true);
            expect(initSpy).toHaveBeenCalled();

            const callArgs = initSpy.mock.calls[0][0];
            expect(callArgs.normalizeDepth).toBe(5);
            expect(callArgs.dsn).toBe("https://test@sentry.io/12345");
            expect(callArgs.tracesSampleRate).toBe(1.0);
        } finally {
            if (originalDSN !== undefined) {
                process.env.SENTRY_DSN = originalDSN;
            } else {
                delete process.env.SENTRY_DSN;
            }
            if (originalEnv !== undefined) {
                process.env.NODE_ENV = originalEnv;
            } else {
                delete process.env.NODE_ENV;
            }
        }
    });

    test("should not initialize Sentry when SENTRY_DSN is not provided", async () => {
        const originalDSN = process.env.SENTRY_DSN;

        try {
            delete process.env.SENTRY_DSN;

            const { initializeSentry } = await import("../src/config/sentry");
            const result = initializeSentry();

            expect(result).toBe(false);
        } finally {
            if (originalDSN !== undefined) {
                process.env.SENTRY_DSN = originalDSN;
            }
        }
    });
});
