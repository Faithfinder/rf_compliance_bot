export function getFixedChannelId(): string | null {
    const fixedChannelId = process.env.FIXED_CHANNEL_ID;
    return fixedChannelId && fixedChannelId.trim() !== "" ? fixedChannelId.trim() : null;
}

export function isFixedChannelMode(): boolean {
    return getFixedChannelId() !== null;
}

export function getBotOwnerId(): number | null {
    const ownerId = process.env.BOT_OWNER_ID;

    if (!ownerId || ownerId.trim() === "") {
        return null;
    }

    const parsedId = Number(ownerId);

    if (!Number.isInteger(parsedId)) {
        console.warn("BOT_OWNER_ID is set but is not a valid integer:", ownerId);
        return null;
    }

    return parsedId;
}

export function getPostHogApiKey(): string | null {
    const apiKey = process.env.POSTHOG_API_KEY;
    return apiKey && apiKey.trim() !== "" ? apiKey.trim() : null;
}

export function getPostHogHost(): string {
    const host = process.env.POSTHOG_HOST;
    return host && host.trim() !== "" ? host.trim() : "https://eu.i.posthog.com";
}

/**
 * Secret that keys the HMAC behind every user id sent to PostHog. Required whenever telemetry is
 * enabled, and deliberately without a default: the Telegram user id space is small enough to
 * enumerate, so an unsalted or predictably-salted digest is reversible by brute force and would be
 * privacy theatre. Returns null when unset so that "absent" is a state a caller cannot overlook.
 */
export function getTelemetryIdentitySalt(): string | null {
    const salt = process.env.POSTHOG_ID_SALT;
    return salt && salt.trim() !== "" ? salt.trim() : null;
}
