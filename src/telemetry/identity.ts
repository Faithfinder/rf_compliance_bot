import { createHmac } from "node:crypto";
import { getTelemetryIdentitySalt } from "../config/environment";

// 128 bits of a truncated HMAC: collision-free at this scale, short enough to read in the UI.
const REF_LENGTH = 32;

/**
 * The salt is read per call rather than memoized, because a cached value would leak between tests
 * that change POSTHOG_ID_SALT. The namespace stops identifiers of different kinds colliding when
 * they share the same digits.
 */
function telemetryRef(prefix: string, namespace: string, value: string): string {
    const salt = getTelemetryIdentitySalt();

    // Unreachable while callers check isTelemetryActive() first; guarded so that no future path can
    // produce an unsalted, brute-forceable digest.
    if (salt === null) {
        throw new Error("Refusing to hash a telemetry identifier without POSTHOG_ID_SALT");
    }

    const digest = createHmac("sha256", salt).update(`${namespace}:${value}`).digest("hex").slice(0, REF_LENGTH);

    return `${prefix}_${digest}`;
}

export function userRef(userId: number): string {
    return telemetryRef("u", "user", String(userId));
}

/** Distinct id for events that belong to the deployment rather than to any one person. */
export function deploymentRef(): string {
    return telemetryRef("d", "deployment", "self");
}
