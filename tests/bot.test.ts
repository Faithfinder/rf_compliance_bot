import { describe, test, expect } from "bun:test";
import { formatChannelInfo } from "../src/utils";

describe("Utility Functions", () => {
    test("should format channel info with title", () => {
        const channelId = "-1001234567890";
        const channelTitle = "Test Channel";

        const formatted = formatChannelInfo(channelId, channelTitle);
        expect(formatted).toBe("Test Channel (`-1001234567890`)");
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
