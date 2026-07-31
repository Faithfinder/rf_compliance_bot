---
name: add-telemetry-event
description: Add or change a PostHog telemetry event in rf_compliance_bot. Use when instrumenting a new user action, adding an analytics event or property, or reviewing what telemetry data leaves the process.
---

# Adding a telemetry event

Events are declared in the `TelemetryEventProperties` map in [src/telemetry/events.ts](../../../src/telemetry/events.ts). That map is the single source of truth: a name or property that is not in it will not typecheck, which is what keeps sensitive data out by construction rather than by review.

1. **Add a key to `TelemetryEventProperties`.** Name the event `noun_verbed` (`message_published`, `blurb_configured`). Property names are camelCase in TypeScript and converted to snake_case on the wire. Include `channelId` (and `channelTitle` where available) for anything channel-scoped — that also groups the event by channel in PostHog.

2. **Call `captureEvent` at the site**, after the user-facing reply where control flow allows:

   ```typescript
   captureEvent("message_published", userId, {
       channelId: channelConfig.channelId,
       channelTitle: channelConfig.channelTitle,
       contentKind: "single",
   });
   ```

   The second argument is the acting Telegram user id, or `null` for events that belong to the deployment rather than a person (see `bot_started`). Pass **raw** ids — hashing happens inside.

3. **Add a test** using the `__setTelemetrySink` seam from [src/config/posthog.ts](../../../src/config/posthog.ts). It observes the exact wire payload after hashing and scrubbing, needs no API key and makes no network calls. See [tests/telemetry-capture.test.ts](../../../tests/telemetry-capture.test.ts).

## Rules that must not be broken

**Never add a property that can hold user-authored text.** Send a length, a count or a boolean instead — `blurb_configured` carries `blurbLength`, never the blurb, because the blurb names the agent. The one sanctioned exception is the bounded command token in [src/telemetry/commands.ts](../../../src/telemetry/commands.ts); command *arguments* are never recorded, because `/notify_add` and `/notify_remove` take a raw Telegram user id there.

**People are hashed, channels are not.** Channel ids and titles go through in plaintext — a moderated channel is public information. Telegram user ids leave only as a salted HMAC via [src/telemetry/identity.ts](../../../src/telemetry/identity.ts), which is the only place in the codebase that hashes. Usernames, display names and author signatures are never sent at all.

**`captureEvent` must never throw and must never be awaited.** Several call sites sit inside `try` blocks whose `catch` reports a publishing failure to the user, so a throw would report failure for a post that was delivered. Others run inside the media-group debounce timer, outside grammY's error handling, where a throw takes down the process.

Telemetry is disabled unless `POSTHOG_API_KEY` is set, so every capture must be safe as a no-op. Document any new event in the "Телеметрия" section of [README.md](../../../README.md) — that section is what self-hosters rely on to know what leaves their machine, and it is in Russian.
