import { describe, test, expect } from "bun:test";
import {
    formatChannelInfo,
    formatChannelRequirements,
    allRequirementsPassed,
    type ChannelRequirements,
} from "../src/utils";

describe("Utility Functions", () => {
    test("should format channel info with title", () => {
        const channelId = "-1001234567890";
        const channelTitle = "Test Channel";

        const formatted = formatChannelInfo(channelId, channelTitle);
        expect(formatted.text).toBe("Test Channel (-1001234567890)");
        expect(formatted.entities).toEqual([{ type: "code", offset: 14, length: 14 }]);
    });

    test("should format channel info without title", () => {
        const channelId = "-1001234567890";

        const formatted = formatChannelInfo(channelId);
        expect(formatted.text).toBe("-1001234567890");
        expect(formatted.entities).toEqual([{ type: "code", offset: 0, length: 14 }]);
    });

    test("should handle empty title", () => {
        const channelId = "-1001234567890";
        const channelTitle = "";

        const formatted = formatChannelInfo(channelId, channelTitle);
        expect(formatted.text).toBe("-1001234567890");
        expect(formatted.entities).toEqual([{ type: "code", offset: 0, length: 14 }]);
    });

    test("should format channel requirements with all checks passed", () => {
        const requirements: ChannelRequirements = {
            channelExists: true,
            botIsAdded: true,
            botCanPost: true,
            foreignAgentBlurbConfigured: true,
        };

        const formatted = formatChannelRequirements(requirements);
        expect(formatted).toContain("✅ Настроенный канал существует");
        expect(formatted).toContain("✅ 🤖 Бот добавлен в канал");
        expect(formatted).toContain("✅ 🤖 Бот может публиковать сообщения в канал");
        expect(formatted).toContain("✅ 🌍 Текст иностранного агента настроен");
    });

    test("should format channel requirements with all checks failed", () => {
        const requirements: ChannelRequirements = {
            channelExists: false,
            botIsAdded: false,
            botCanPost: false,
            foreignAgentBlurbConfigured: false,
        };

        const formatted = formatChannelRequirements(requirements);
        expect(formatted).toContain("❌ Канал не существует или бот не может получить к нему доступ");
        expect(formatted).toContain("❌ 🤖 Бот не добавлен в канал");
        expect(formatted).toContain("❌ 🤖 Бот не имеет разрешения публиковать сообщения");
        expect(formatted).toContain("❌ 🌍 Текст иностранного агента не настроен");
    });

    test("should return true when all requirements are passed", () => {
        const requirements: ChannelRequirements = {
            channelExists: true,
            botIsAdded: true,
            botCanPost: true,
            foreignAgentBlurbConfigured: true,
        };

        expect(allRequirementsPassed(requirements)).toBe(true);
    });

    test("should return false when foreign agent blurb is not configured", () => {
        const requirements: ChannelRequirements = {
            channelExists: true,
            botIsAdded: true,
            botCanPost: true,
            foreignAgentBlurbConfigured: false,
        };

        expect(allRequirementsPassed(requirements)).toBe(false);
    });

    test("should return false when any requirement fails", () => {
        const requirements: ChannelRequirements = {
            channelExists: false,
            botIsAdded: true,
            botCanPost: true,
            foreignAgentBlurbConfigured: true,
        };

        expect(allRequirementsPassed(requirements)).toBe(false);
    });
});

// Note: Testing the resolveChannel and checkChannelRequirements functions requires mocking the Telegram API
// which is beyond the scope of basic unit tests. Integration tests would be
// needed to test the full channel resolution flow.
