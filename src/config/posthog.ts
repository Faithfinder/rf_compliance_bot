import { PostHog } from "posthog-node";
import { getPostHogApiKey, getPostHogHost, getTelemetryIdentitySalt } from "./environment";

/**
 * A payload that is ready for the wire. Everything here has already been hashed or reduced to a
 * bounded scalar by src/telemetry/events.ts - no raw Telegram user id and no user-authored text
 * may reach this module.
 */
export interface TelemetryPayload {
    event: string;
    distinctId: string;
    properties: Record<string, string | number | boolean>;
    groups?: Record<string, string>;
}

export type TelemetrySink = (payload: TelemetryPayload) => void;

// Telegram caps chat titles at 128 characters, so every value we legitimately send fits. A
// longer string means a future event definition started carrying user-authored text, which is
// dropped here rather than shipped to a third-party service.
const MAX_PROPERTY_LENGTH = 128;

const FLUSH_TIMEOUT_MS = 2000;

let client: PostHog | null = null;
let sink: TelemetrySink | null = null;

/**
 * Initializes PostHog product analytics
 * @returns true if PostHog was initialized, false otherwise
 */
export function initializePostHog(): boolean {
    const apiKey = getPostHogApiKey();

    if (!apiKey) {
        console.warn("PostHog API key not provided, product analytics disabled");
        return false;
    }

    // Refusing to start without a salt is deliberate. The alternative is emitting hashes that can
    // be brute-forced back to Telegram user ids, which is worse than collecting nothing.
    if (getTelemetryIdentitySalt() === "") {
        console.warn("No telemetry identity salt available, product analytics disabled");
        return false;
    }

    try {
        client = new PostHog(apiKey, {
            host: getPostHogHost(),
            disableGeoip: true,
            // Sentry owns error reporting; autocapture here would duplicate every exception.
            enableExceptionAutocapture: false,
            flushAt: 5,
            flushInterval: 5000,
            requestTimeout: 5000,
            // Telemetry is not worth several seconds of background retrying per failed batch.
            fetchRetryCount: 1,
        });

        // Background flush failures surface here. They are logged and nothing more - routing them
        // to Sentry would turn a PostHog outage into an error storm.
        client.on("error", (error: unknown) => {
            console.error("PostHog client error:", error);
        });
    } catch (error) {
        console.error("Failed to initialize PostHog, product analytics disabled:", error);
        client = null;
        return false;
    }

    console.warn("PostHog initialized");
    return true;
}

function scrubProperties(properties: Record<string, string | number | boolean>) {
    const scrubbed: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(properties)) {
        if (typeof value === "string" && value.length > MAX_PROPERTY_LENGTH) {
            console.error(`Dropped oversized telemetry property "${key}" (${value.length} chars)`);
            continue;
        }

        scrubbed[key] = value;
    }

    return scrubbed;
}

export function emitTelemetry(payload: TelemetryPayload): void {
    const scrubbed: TelemetryPayload = { ...payload, properties: scrubProperties(payload.properties) };

    if (sink) {
        sink(scrubbed);
        return;
    }

    client?.capture({
        distinctId: scrubbed.distinctId,
        event: scrubbed.event,
        properties: scrubbed.properties,
        ...(scrubbed.groups && { groups: scrubbed.groups }),
    });
}

/**
 * Gives the PostHog "channel" group a readable name so per-channel breakdowns are legible. Group
 * analytics is a paid feature on PostHog Cloud; where it is unavailable this is simply ignored and
 * the channel_id / channel_title event properties carry the same information.
 */
export function identifyChannel(channelId: string, channelTitle?: string): void {
    if (!client) {
        return;
    }

    try {
        client.groupIdentify({
            groupType: "channel",
            groupKey: channelId,
            ...(channelTitle && { properties: { name: channelTitle } }),
        });
    } catch (error) {
        console.error("Failed to identify channel for telemetry:", error);
    }
}

export async function closePostHog(): Promise<void> {
    if (!client) {
        return;
    }

    console.warn("Flushing PostHog events...");

    // Detach before flushing so late captures are dropped instead of racing the drain.
    const pending = client;
    client = null;

    // A hung ingest endpoint must not hold up teardown - the database still has to be closed.
    try {
        await pending.shutdown(FLUSH_TIMEOUT_MS);
    } catch (error) {
        console.error("Failed to flush PostHog events:", error);
    }
}

/**
 * Test-only seam. Replaces the PostHog client with an in-process observer so tests can assert on
 * the exact wire payload - including that it carries no raw identifier - without an API key, a
 * client, or network access.
 */
export function __setTelemetrySink(next: TelemetrySink | null): void {
    sink = next;
}
