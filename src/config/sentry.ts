import * as Sentry from "@sentry/bun";

/**
 * Initializes Sentry error tracking
 * @returns true if Sentry was initialized, false otherwise
 */
export function initializeSentry(): boolean {
    const SENTRY_DSN = process.env.SENTRY_DSN;

    if (!SENTRY_DSN) {
        console.warn("Sentry DSN not provided, error tracking disabled");
        return false;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || "development",
        tracesSampleRate: 1.0,
    });

    console.warn("Sentry initialized");
    return true;
}

export async function closeSentry(): Promise<void> {
    console.warn("Flushing Sentry events...");
    await Sentry.close(2000);
}
