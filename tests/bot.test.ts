import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlink, exists } from "fs/promises";
import { join } from "path";
import { getUserChannel, setUserChannel, removeUserChannel } from "../src/storage";
import { formatChannelInfo } from "../src/utils";

// Test storage file path
const TEST_DATA_DIR = join(process.cwd(), "data");
const TEST_STORAGE_FILE = join(TEST_DATA_DIR, "user-channels.json");

describe("Storage Operations", () => {
    // Clean up test data before each test
    beforeEach(async () => {
        try {
            const fileExists = await exists(TEST_STORAGE_FILE);
            if (fileExists) {
                await unlink(TEST_STORAGE_FILE);
            }
        } catch {
            // File might not exist, ignore
        }
    });

    // Clean up after tests
    afterEach(async () => {
        try {
            const fileExists = await exists(TEST_STORAGE_FILE);
            if (fileExists) {
                await unlink(TEST_STORAGE_FILE);
            }
        } catch {
            // File might not exist, ignore
        }
    });

    test("should return null for non-existent user", async () => {
        const channel = await getUserChannel(123456);
        expect(channel).toBeNull();
    });

    test("should store and retrieve channel configuration", async () => {
        const userId = 123456;
        const channelId = "-1001234567890";
        const channelTitle = "Test Channel";

        await setUserChannel(userId, channelId, channelTitle);

        const config = await getUserChannel(userId);
        expect(config).not.toBeNull();
        expect(config?.channelId).toBe(channelId);
        expect(config?.channelTitle).toBe(channelTitle);
    });

    test("should update existing channel configuration", async () => {
        const userId = 123456;
        const channelId1 = "-1001234567890";
        const channelTitle1 = "Test Channel 1";
        const channelId2 = "-1009876543210";
        const channelTitle2 = "Test Channel 2";

        await setUserChannel(userId, channelId1, channelTitle1);
        await setUserChannel(userId, channelId2, channelTitle2);

        const config = await getUserChannel(userId);
        expect(config?.channelId).toBe(channelId2);
        expect(config?.channelTitle).toBe(channelTitle2);
    });

    test("should remove channel configuration", async () => {
        const userId = 123456;
        const channelId = "-1001234567890";
        const channelTitle = "Test Channel";

        await setUserChannel(userId, channelId, channelTitle);
        const removed = await removeUserChannel(userId);

        expect(removed).toBe(true);

        const config = await getUserChannel(userId);
        expect(config).toBeNull();
    });

    test("should return false when removing non-existent configuration", async () => {
        const userId = 123456;
        const removed = await removeUserChannel(userId);

        expect(removed).toBe(false);
    });

    test("should handle multiple users independently", async () => {
        const userId1 = 123456;
        const userId2 = 789012;
        const channelId1 = "-1001234567890";
        const channelId2 = "-1009876543210";
        const channelTitle1 = "Channel 1";
        const channelTitle2 = "Channel 2";

        await setUserChannel(userId1, channelId1, channelTitle1);
        await setUserChannel(userId2, channelId2, channelTitle2);

        const config1 = await getUserChannel(userId1);
        const config2 = await getUserChannel(userId2);

        expect(config1?.channelId).toBe(channelId1);
        expect(config2?.channelId).toBe(channelId2);
    });
});

describe("Utility Functions", () => {
    test("should format channel info with title", () => {
        const channelId = "-1001234567890";
        const channelTitle = "Test Channel";

        const formatted = formatChannelInfo(channelId, channelTitle);
        expect(formatted).toBe("Test Channel (-1001234567890)");
    });

    test("should format channel info without title", () => {
        const channelId = "-1001234567890";

        const formatted = formatChannelInfo(channelId);
        expect(formatted).toBe("-1001234567890");
    });

    test("should handle empty title", () => {
        const channelId = "-1001234567890";
        const channelTitle = "";

        const formatted = formatChannelInfo(channelId, channelTitle);
        expect(formatted).toBe("-1001234567890");
    });
});

// Note: Testing the resolveChannel function requires mocking the Telegram API
// which is beyond the scope of basic unit tests. Integration tests would be
// needed to test the full channel resolution flow.
