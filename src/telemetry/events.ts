import { emitTelemetry, isTelemetryActive } from "../config/posthog";
import { deploymentRef, userRef } from "./identity";
import type { ChannelRequirements } from "../utils";

export type ContentKind = "single" | "album";
export type PublishFailureReason = "channel_missing" | "bot_not_admin" | "bot_cannot_post" | "unknown";
export type ChannelSource = "command" | "chat_shared";
export type PublishBlockedReason = "no_channel" | "no_permission" | "no_blurb";

/** Plaintext by design - a moderated channel is public information. */
interface ChannelScoped {
    channelId: string;
    channelTitle?: string;
}

/**
 * Every telemetry event and the exact properties it carries. Adding a key here is the only way to
 * add a property, which is what keeps message text, usernames, display names and the configured
 * blurb out of the payload by construction rather than by review.
 */
export interface TelemetryEventProperties {
    bot_started: {
        environment: string;
        fixedChannelMode: boolean;
        ownerCommandsEnabled: boolean;
        commandCount: number;
    };
    command_invoked: {
        command: string;
        chatType: string;
        hasArgs: boolean;
        channelConfigured: boolean;
    };
    unknown_command: {
        command: string;
        chatType: string;
    };
    publish_blocked: {
        reason: PublishBlockedReason;
        channelId?: string;
        channelTitle?: string;
    };
    channel_configured: ChannelScoped & {
        source: ChannelSource;
        requirementsSatisfied: boolean;
    };
    channel_removed: ChannelScoped;
    blurb_configured: ChannelScoped & {
        blurbLength: number;
        isUpdate: boolean;
    };
    notification_recipient_added: ChannelScoped & {
        recipientCount: number;
    };
    notification_recipient_removed: ChannelScoped & {
        recipientCount: number;
    };
    message_published: ChannelScoped & {
        contentKind: ContentKind;
        albumSize?: number;
    };
    message_rejected: ChannelScoped & {
        contentKind: ContentKind;
        albumSize?: number;
        notifiedTargets: number;
        notificationFailures: number;
        /** Recipients with no private chat with the bot - a setup gap, not a delivery fault. */
        unreachableTargets: number;
    };
    publish_failed: ChannelScoped & {
        contentKind: ContentKind;
        failureReason: PublishFailureReason;
    };
    channel_post_moderated: ChannelScoped & {
        contentKind: ContentKind;
        albumSize?: number;
        notifiedTargets: number;
        notificationFailures: number;
        /** Recipients with no private chat with the bot - a setup gap, not a delivery fault. */
        unreachableTargets: number;
        authorKnown: boolean;
    };
    /** A post the bot inspected and left alone - the denominator for the compliance rate. */
    channel_post_allowed: ChannelScoped & {
        contentKind: ContentKind;
        albumSize?: number;
        authorKnown: boolean;
    };
    /** A post in a channel where no blurb is configured. Reported once per channel per process. */
    channel_post_ignored: ChannelScoped;
    moderation_failed: ChannelScoped & {
        contentKind: ContentKind;
        albumSize?: number;
    };
}

export type TelemetryEventName = keyof TelemetryEventProperties;

/**
 * A Telegram user id; "deployment" for events about the running process itself; "anonymous" when
 * there is no identifiable subject, which sends the event without any distinct id so that PostHog
 * creates no Person for it. Grep for "anonymous" to audit every event that deliberately has none.
 */
export type TelemetryActor = number | "deployment" | "anonymous";

function toSnakeCase(key: string): string {
    return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function toWireProperties(properties: object): Record<string, string | number | boolean> {
    const wire: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(properties)) {
        if (value === undefined || value === null) {
            continue;
        }

        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            wire[toSnakeCase(key)] = value;
        }
    }

    return wire;
}

export function captureEvent<E extends TelemetryEventName>(
    event: E,
    actor: TelemetryActor,
    properties: TelemetryEventProperties[E],
): void {
    // Checked before anything else because hashing the actor needs a salt, which only exists when
    // telemetry is configured. Without this, every capture in a deployment that has no PostHog key
    // would build a payload just to discard it, and would log a failed hash while doing so.
    if (!isTelemetryActive()) {
        return;
    }

    // Load-bearing try/catch: several call sites sit inside try blocks whose catch branch tells the
    // user that publishing or moderation failed, so a throw here would report a failure for a post
    // that was actually delivered. Others run inside the media group debounce timer, outside
    // grammY's error handling, where a throw takes down the process.
    try {
        const channelId = "channelId" in properties ? properties.channelId : undefined;

        // Left undefined for an anonymous event: posthog-node then substitutes a throwaway id and
        // sets $process_person_profile, so the event is counted without inventing a Person. A
        // channel is not a stand-in for one - its identity already travels in the properties.
        const distinctId =
            typeof actor === "number" ? userRef(actor)
            : actor === "deployment" ? deploymentRef()
            : undefined;

        emitTelemetry({
            event,
            ...(distinctId && { distinctId }),
            properties: toWireProperties(properties),
            ...(channelId && { groups: { channel: channelId } }),
        });
    } catch (error) {
        console.error(`Failed to capture telemetry event ${event}:`, error);
    }
}

/** Mirrors the requirement checks the user-facing failure messages already branch on. */
export function classifyPublishFailure(requirements: ChannelRequirements): PublishFailureReason {
    if (!requirements.channelExists) {
        return "channel_missing";
    }

    if (!requirements.botIsAdded) {
        return "bot_not_admin";
    }

    if (!requirements.botCanPost) {
        return "bot_cannot_post";
    }

    return "unknown";
}
