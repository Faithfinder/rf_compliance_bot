import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

/**
 * Initializes PostHog telemetry
 * @returns true if PostHog was initialized, false otherwise
 */
export function initializePostHog(): boolean {
    const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
    const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://app.posthog.com";

    if (!POSTHOG_API_KEY) {
        console.warn("PostHog API key not provided, telemetry disabled");
        return false;
    }

    posthogClient = new PostHog(POSTHOG_API_KEY, {
        host: POSTHOG_HOST,
    });

    console.warn("PostHog initialized");
    return true;
}

/**
 * Gets the PostHog client instance
 * @returns PostHog client or null if not initialized
 */
export function getPostHog(): PostHog | null {
    return posthogClient;
}

/**
 * Tracks an event in PostHog
 * @param distinctId - Unique identifier for the user (e.g., Telegram user ID)
 * @param event - Event name
 * @param properties - Additional event properties
 */
export function trackEvent(
    distinctId: string | number,
    event: string,
    properties?: Record<string, unknown>,
): void {
    if (!posthogClient) {
        return;
    }

    posthogClient.capture({
        distinctId: String(distinctId),
        event,
        properties: {
            ...properties,
            environment: process.env.NODE_ENV || "development",
        },
    });
}

/**
 * Identifies a user in PostHog
 * @param distinctId - Unique identifier for the user
 * @param properties - User properties
 */
export function identifyUser(
    distinctId: string | number,
    properties?: Record<string, unknown>,
): void {
    if (!posthogClient) {
        return;
    }

    posthogClient.identify({
        distinctId: String(distinctId),
        properties,
    });
}

/**
 * Shuts down PostHog and flushes all pending events
 */
export async function closePostHog(): Promise<void> {
    if (!posthogClient) {
        return;
    }

    console.warn("Flushing PostHog events...");
    await posthogClient.shutdown();
}
