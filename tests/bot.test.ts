import { describe, test, expect, beforeAll } from "bun:test";
import type { ChannelRequirements } from "../src/utils";

// src/utils.ts imports the bot singleton, which throws at import time without a token. A static
// import would be hoisted above any assignment to process.env, so the module is loaded on demand.
// The type-only import above is erased and carries no runtime dependency.
let utils: typeof import("../src/utils");

beforeAll(async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
    }

    utils = await import("../src/utils");
});

const allPassing = (): ChannelRequirements => ({
    channelExists: true,
    botIsAdded: true,
    botCanPost: true,
    botCanDelete: true,
    foreignAgentBlurbConfigured: true,
    notificationRecipientsConfigured: true,
});

const allFailing = (): ChannelRequirements => ({
    channelExists: false,
    botIsAdded: false,
    botCanPost: false,
    botCanDelete: false,
    foreignAgentBlurbConfigured: false,
    notificationRecipientsConfigured: false,
});

describe("Utility Functions", () => {
    test("should format channel info with title", () => {
        const channelId = "-1001234567890";
        const channelTitle = "Test Channel";

        const formatted = utils.formatChannelInfo(channelId, channelTitle);
        expect(formatted.text).toBe("Test Channel (-1001234567890)");
        expect(formatted.entities).toEqual([{ type: "code", offset: 14, length: 14 }]);
    });

    test("should format channel info without title", () => {
        const channelId = "-1001234567890";

        const formatted = utils.formatChannelInfo(channelId);
        expect(formatted.text).toBe("-1001234567890");
        expect(formatted.entities).toEqual([{ type: "code", offset: 0, length: 14 }]);
    });

    test("should handle empty title", () => {
        const channelId = "-1001234567890";
        const channelTitle = "";

        const formatted = utils.formatChannelInfo(channelId, channelTitle);
        expect(formatted.text).toBe("-1001234567890");
        expect(formatted.entities).toEqual([{ type: "code", offset: 0, length: 14 }]);
    });

    test("should format common requirements with all checks passed", () => {
        const formatted = utils.formatCommonRequirements(allPassing());

        expect(formatted).toContain("✅ Канал доступен");
        expect(formatted).toContain("✅ 🤖 Бот — администратор канала");
        expect(formatted).toContain("✅ 🌍 Текст маркировки задан");
    });

    test("should format common requirements with all checks failed", () => {
        const formatted = utils.formatCommonRequirements(allFailing());

        expect(formatted).toContain("❌ Канал не существует или бот не имеет к нему доступа");
        expect(formatted).toContain("❌ 🤖 Бот не администратор канала");
        expect(formatted).toContain("❌ 🌍 Текст маркировки не задан");
    });
});

describe("Moderation requirements", () => {
    test("reports the delete right as a hard failure", () => {
        const formatted = utils.formatModerationRequirements({ ...allPassing(), botCanDelete: false });

        expect(formatted).toContain("❌ 🤖 У бота нет права «Удалять сообщения»");
    });

    // Moderation still deletes with an empty recipient list, so the line is informational and must
    // not read as a failure the admin has to fix.
    test("reports an empty recipient list as informational, not a failure", () => {
        const formatted = utils.formatModerationRequirements({
            ...allPassing(),
            notificationRecipientsConfigured: false,
        });

        expect(formatted).toContain("ℹ️ 🔔 Получатели уведомлений не заданы");
        expect(formatted).not.toContain("❌ 🔔");
    });

    test("passes without notification recipients", () => {
        expect(utils.moderationRequirementsPassed({ ...allPassing(), notificationRecipientsConfigured: false })).toBe(
            true,
        );
    });

    test.each([["channelExists"], ["botIsAdded"], ["botCanDelete"], ["foreignAgentBlurbConfigured"]] as const)(
        "fails when %s is missing",
        (field) => {
            expect(utils.moderationRequirementsPassed({ ...allPassing(), [field]: false })).toBe(false);
        },
    );
});

describe("Publish requirements", () => {
    // Publishing is opt-in, so unmet items are ➖ rather than ❌ - nothing is broken when the mode is
    // simply not set up.
    test("reports unmet requirements as optional rather than failed", () => {
        const formatted = utils.formatPublishRequirements({ ...allPassing(), botCanPost: false }, null);

        expect(formatted).toContain("➖ 🤖 У бота нет права «Публиковать сообщения»");
        expect(formatted).not.toContain("❌");
    });

    test("includes the user's own edit right when permissions are known", () => {
        const withRight = utils.formatPublishRequirements(allPassing(), {
            isMember: true,
            isAdmin: true,
            canEditMessages: true,
        });
        const withoutRight = utils.formatPublishRequirements(allPassing(), {
            isMember: true,
            isAdmin: true,
            canEditMessages: false,
        });

        expect(withRight).toContain("✅ 👤 У вас есть право «Редактировать сообщения»");
        expect(withoutRight).toContain("➖ 👤 У вас нет права «Редактировать сообщения»");
    });

    test("omits the user line when permissions are unavailable", () => {
        expect(utils.formatPublishRequirements(allPassing(), null)).not.toContain("👤");
    });

    // publishRequirementsPassed replaced allRequirementsPassed over the same four fields, which is
    // what keeps the `requirementsSatisfied` telemetry property comparable across the rename.
    test("ignores the delete right and the recipient list", () => {
        expect(
            utils.publishRequirementsPassed({
                ...allPassing(),
                botCanDelete: false,
                notificationRecipientsConfigured: false,
            }),
        ).toBe(true);
    });

    test.each([["channelExists"], ["botIsAdded"], ["botCanPost"], ["foreignAgentBlurbConfigured"]] as const)(
        "fails when %s is missing",
        (field) => {
            expect(utils.publishRequirementsPassed({ ...allPassing(), [field]: false })).toBe(false);
        },
    );
});

describe("formatNextSetupStep", () => {
    test("returns null once moderation works", () => {
        expect(utils.formatNextSetupStep(allPassing())).toBeNull();
    });

    test("returns null when only the recipient list is empty", () => {
        expect(utils.formatNextSetupStep({ ...allPassing(), notificationRecipientsConfigured: false })).toBeNull();
    });

    test("returns null when only publishing is unavailable", () => {
        expect(utils.formatNextSetupStep({ ...allPassing(), botCanPost: false })).toBeNull();
    });

    test("asks for the blurb before the delete right", () => {
        const step = utils.formatNextSetupStep({
            ...allPassing(),
            foreignAgentBlurbConfigured: false,
            botCanDelete: false,
        });

        expect(step).toContain("/set_fa_blurb");
    });

    test("asks for the delete right once the blurb is set", () => {
        const step = utils.formatNextSetupStep({ ...allPassing(), botCanDelete: false });

        expect(step).toContain("«Удалять сообщения»");
    });

    test("asks to add the bot as admin before the blurb", () => {
        const step = utils.formatNextSetupStep({ ...allFailing(), channelExists: true });

        expect(step).toContain("администратором");
    });

    test("reports an unreachable channel before anything else", () => {
        const step = utils.formatNextSetupStep(allFailing());

        expect(step).toContain("канал недоступен");
    });
});

// Note: Testing the resolveChannel and checkChannelRequirements functions requires mocking the Telegram API
// which is beyond the scope of basic unit tests. Integration tests would be
// needed to test the full channel resolution flow.
