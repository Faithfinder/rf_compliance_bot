import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { unlink } from "fs/promises";
import { join } from "path";
import {
    initializeDatabase,
    closeDatabase,
    getChannelSettings,
    updateChannelSettings,
    deleteChannelSettings,
} from "../src/db/database";

const testDbPath = join(process.cwd(), "data", "channels.db");

describe("Database Operations", () => {
    beforeAll(() => {
        initializeDatabase();
    });

    afterAll(async () => {
        closeDatabase();
        try {
            await unlink(testDbPath);
        } catch (error) {
            console.error("Failed to clean up test database:", error);
        }
    });

    it("should return null for non-existent channel", () => {
        const settings = getChannelSettings("-1001234567890");
        expect(settings).toBeNull();
    });

    it("should create new channel settings", () => {
        const channelId = "-1001111111111";
        const blurb = "This is a test foreign agent blurb.";

        updateChannelSettings(channelId, { foreignAgentBlurb: blurb });

        const result = getChannelSettings(channelId);
        expect(result).not.toBeNull();
        expect(result?.foreignAgentBlurb).toBe(blurb);
    });

    it("should update existing channel settings", () => {
        const channelId = "-1002222222222";
        const originalBlurb = "Original blurb";
        const updatedBlurb = "Updated blurb";

        updateChannelSettings(channelId, { foreignAgentBlurb: originalBlurb });
        updateChannelSettings(channelId, { foreignAgentBlurb: updatedBlurb });
        const updatedResult = getChannelSettings(channelId);

        expect(updatedResult?.foreignAgentBlurb).toBe(updatedBlurb);
    });

    it("should delete channel settings", () => {
        const channelId = "-1003333333333";
        const blurb = "Temporary blurb";

        updateChannelSettings(channelId, { foreignAgentBlurb: blurb });
        expect(getChannelSettings(channelId)).not.toBeNull();

        deleteChannelSettings(channelId);
        expect(getChannelSettings(channelId)).toBeNull();
    });

    it("should handle empty string blurb", () => {
        const channelId = "-1004444444444";
        const blurb = "";

        updateChannelSettings(channelId, { foreignAgentBlurb: blurb });

        const result = getChannelSettings(channelId);
        expect(result?.foreignAgentBlurb).toBe("");
    });

    it("should handle long blurb text", () => {
        const channelId = "-1005555555555";
        const blurb = "A".repeat(4000);

        updateChannelSettings(channelId, { foreignAgentBlurb: blurb });

        const result = getChannelSettings(channelId);
        expect(result?.foreignAgentBlurb).toBe(blurb);
        expect(result?.foreignAgentBlurb?.length).toBe(4000);
    });

    it("should merge settings on partial update", () => {
        const channelId = "-1006666666666";

        updateChannelSettings(channelId, { foreignAgentBlurb: "Initial blurb" });
        const initial = getChannelSettings(channelId);
        expect(initial?.foreignAgentBlurb).toBe("Initial blurb");

        updateChannelSettings(channelId, { foreignAgentBlurb: "Updated blurb" });
        const updated = getChannelSettings(channelId);
        expect(updated?.foreignAgentBlurb).toBe("Updated blurb");
    });

    it("should handle settings object with empty values", () => {
        const channelId = "-1007777777777";

        updateChannelSettings(channelId, {});
        const result = getChannelSettings(channelId);
        expect(result).not.toBeNull();
        expect(result?.foreignAgentBlurb).toBeUndefined();
    });
});
