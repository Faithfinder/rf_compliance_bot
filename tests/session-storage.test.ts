import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { unlink } from "fs/promises";
import { join } from "path";
import { initializeDatabase, closeDatabase, getDatabase } from "../src/db/database";
import { SqliteSessionStorage } from "../src/db/session-storage";
import type { SessionData } from "../src/config/session";

const testDbPath = join(process.cwd(), "data", "channels.db");

describe("Session Storage Operations", () => {
    let storage: SqliteSessionStorage<SessionData>;

    beforeAll(() => {
        initializeDatabase();
        const db = getDatabase();
        storage = new SqliteSessionStorage(db);
    });

    afterAll(async () => {
        closeDatabase();
        try {
            await unlink(testDbPath);
        } catch (error) {
            console.error("Failed to clean up test database:", error);
        }
    });

    it("should return undefined for non-existent session", () => {
        const session = storage.read("user_12345");
        expect(session).toBeUndefined();
    });

    it("should write and read session data", () => {
        const userId = "user_11111";
        const sessionData: SessionData = {
            channelConfig: {
                channelId: "-1001234567890",
                channelTitle: "Test Channel",
            },
            awaitingChannelSelection: false,
        };

        storage.write(userId, sessionData);
        const result = storage.read(userId);

        expect(result).not.toBeUndefined();
        expect(result?.channelConfig?.channelId).toBe("-1001234567890");
        expect(result?.channelConfig?.channelTitle).toBe("Test Channel");
        expect(result?.awaitingChannelSelection).toBe(false);
    });

    it("should update existing session data", () => {
        const userId = "user_22222";
        const initialData: SessionData = {
            channelConfig: {
                channelId: "-1001111111111",
            },
        };

        storage.write(userId, initialData);

        const updatedData: SessionData = {
            channelConfig: {
                channelId: "-1002222222222",
                channelTitle: "Updated Channel",
            },
            awaitingChannelSelection: true,
        };

        storage.write(userId, updatedData);
        const result = storage.read(userId);

        expect(result?.channelConfig?.channelId).toBe("-1002222222222");
        expect(result?.channelConfig?.channelTitle).toBe("Updated Channel");
        expect(result?.awaitingChannelSelection).toBe(true);
    });

    it("should delete session data", () => {
        const userId = "user_33333";
        const sessionData: SessionData = {
            channelConfig: {
                channelId: "-1003333333333",
            },
        };

        storage.write(userId, sessionData);
        expect(storage.read(userId)).not.toBeUndefined();

        storage.delete(userId);
        expect(storage.read(userId)).toBeUndefined();
    });

    it("should handle empty session data", () => {
        const userId = "user_44444";
        const sessionData: SessionData = {};

        storage.write(userId, sessionData);
        const result = storage.read(userId);

        expect(result).not.toBeUndefined();
        expect(result?.channelConfig).toBeUndefined();
        expect(result?.awaitingChannelSelection).toBeUndefined();
    });

    it("should handle session data with only channelConfig", () => {
        const userId = "user_55555";
        const sessionData: SessionData = {
            channelConfig: {
                channelId: "-1005555555555",
            },
        };

        storage.write(userId, sessionData);
        const result = storage.read(userId);

        expect(result?.channelConfig?.channelId).toBe("-1005555555555");
        expect(result?.channelConfig?.channelTitle).toBeUndefined();
        expect(result?.awaitingChannelSelection).toBeUndefined();
    });

    it("should handle session data with only awaitingChannelSelection", () => {
        const userId = "user_66666";
        const sessionData: SessionData = {
            awaitingChannelSelection: true,
        };

        storage.write(userId, sessionData);
        const result = storage.read(userId);

        expect(result?.awaitingChannelSelection).toBe(true);
        expect(result?.channelConfig).toBeUndefined();
    });

    it("should handle multiple concurrent sessions", () => {
        const user1 = "user_77777";
        const user2 = "user_88888";
        const user3 = "user_99999";

        const data1: SessionData = {
            channelConfig: { channelId: "-1007777777777" },
        };
        const data2: SessionData = {
            channelConfig: { channelId: "-1008888888888" },
        };
        const data3: SessionData = {
            channelConfig: { channelId: "-1009999999999" },
        };

        storage.write(user1, data1);
        storage.write(user2, data2);
        storage.write(user3, data3);

        expect(storage.read(user1)?.channelConfig?.channelId).toBe("-1007777777777");
        expect(storage.read(user2)?.channelConfig?.channelId).toBe("-1008888888888");
        expect(storage.read(user3)?.channelConfig?.channelId).toBe("-1009999999999");
    });
});
