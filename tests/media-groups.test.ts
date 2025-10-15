import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { Message } from "grammy/types";
import {
    addMessageToGroup,
    isMediaGroupValidated,
    getMediaGroupApproval,
    clearMediaGroup,
} from "../src/utils/media-groups";

function createMockMessage(id: number, text?: string, caption?: string): Message {
    return {
        message_id: id,
        date: Date.now(),
        chat: {
            id: 123,
            type: "private",
        },
        text,
        caption,
    } as Message;
}

describe("Media Groups", () => {
    beforeEach(() => {
        clearMediaGroup("test-group-1");
        clearMediaGroup("test-group-2");
    });

    test("should collect messages in a media group", async () => {
        const onComplete = mock();
        const validateGroup = mock(() => true);

        const msg1 = createMockMessage(1, undefined, "Test caption");
        const msg2 = createMockMessage(2);

        addMessageToGroup("test-group-1", msg1, onComplete, validateGroup);

        expect(isMediaGroupValidated("test-group-1")).toBe(false);

        addMessageToGroup("test-group-1", msg2, onComplete, validateGroup);

        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(validateGroup).toHaveBeenCalledTimes(1);
        expect(isMediaGroupValidated("test-group-1")).toBe(true);
    });

    test("should validate entire group based on any message having required text", async () => {
        const onComplete = mock();
        const requiredText = "REQUIRED";
        const validateGroup = mock((messages: Message[]) => {
            return messages.some((msg) => {
                const text = msg.text || msg.caption;
                return text?.includes(requiredText) ?? false;
            });
        });

        const msg1 = createMockMessage(1);
        const msg2 = createMockMessage(2, undefined, `Caption with ${requiredText} text`);
        const msg3 = createMockMessage(3);

        addMessageToGroup("test-group-1", msg1, onComplete, validateGroup);
        addMessageToGroup("test-group-1", msg2, onComplete, validateGroup);
        addMessageToGroup("test-group-1", msg3, onComplete, validateGroup);

        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(onComplete).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ message_id: 1 }),
                expect.objectContaining({ message_id: 2 }),
                expect.objectContaining({ message_id: 3 }),
            ]),
            true,
        );
    });

    test("should reject group when no message has required text", async () => {
        const onComplete = mock();
        const requiredText = "REQUIRED";
        const validateGroup = mock((messages: Message[]) => {
            return messages.some((msg) => {
                const text = msg.text || msg.caption;
                return text?.includes(requiredText) ?? false;
            });
        });

        const msg1 = createMockMessage(1, undefined, "Caption without required");
        const msg2 = createMockMessage(2);

        addMessageToGroup("test-group-1", msg1, onComplete, validateGroup);
        addMessageToGroup("test-group-1", msg2, onComplete, validateGroup);

        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(onComplete).toHaveBeenCalledWith(expect.any(Array), false);
    });

    test("should debounce multiple messages", async () => {
        const onComplete = mock();
        const validateGroup = mock(() => true);

        const msg1 = createMockMessage(1);
        const msg2 = createMockMessage(2);
        const msg3 = createMockMessage(3);

        addMessageToGroup("test-group-1", msg1, onComplete, validateGroup);

        await new Promise((resolve) => setTimeout(resolve, 100));

        addMessageToGroup("test-group-1", msg2, onComplete, validateGroup);

        await new Promise((resolve) => setTimeout(resolve, 100));

        addMessageToGroup("test-group-1", msg3, onComplete, validateGroup);

        expect(onComplete).toHaveBeenCalledTimes(0);

        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ message_id: 1 }),
                expect.objectContaining({ message_id: 2 }),
                expect.objectContaining({ message_id: 3 }),
            ]),
            true,
        );
    });

    test("should track approval status per group", async () => {
        const onComplete1 = mock();
        const onComplete2 = mock();
        const validateGroup1 = mock(() => true);
        const validateGroup2 = mock(() => false);

        const msg1 = createMockMessage(1);
        const msg2 = createMockMessage(2);

        addMessageToGroup("test-group-1", msg1, onComplete1, validateGroup1);
        addMessageToGroup("test-group-2", msg2, onComplete2, validateGroup2);

        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(getMediaGroupApproval("test-group-1")).toBe(true);
        expect(getMediaGroupApproval("test-group-2")).toBe(false);
    });

    test("should return validated status for already processed group", async () => {
        const onComplete = mock();
        const validateGroup = mock(() => true);

        const msg1 = createMockMessage(1);
        const msg2 = createMockMessage(2);

        addMessageToGroup("test-group-1", msg1, onComplete, validateGroup);

        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(isMediaGroupValidated("test-group-1")).toBe(true);

        const result = addMessageToGroup("test-group-1", msg2, onComplete, validateGroup);

        expect(result.isComplete).toBe(true);
        expect(result.approved).toBe(true);
    });

    test("should handle messages with text field", async () => {
        const onComplete = mock();
        const requiredText = "REQUIRED";
        const validateGroup = mock((messages: Message[]) => {
            return messages.some((msg) => {
                const text = msg.text || msg.caption;
                return text?.includes(requiredText) ?? false;
            });
        });

        const msg1 = createMockMessage(1, `Message with ${requiredText} text`);

        addMessageToGroup("test-group-1", msg1, onComplete, validateGroup);

        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(onComplete).toHaveBeenCalledWith(expect.any(Array), true);
    });

    test("should clear media group data", async () => {
        const onComplete = mock();
        const validateGroup = mock(() => true);

        const msg1 = createMockMessage(1);

        addMessageToGroup("test-group-1", msg1, onComplete, validateGroup);

        clearMediaGroup("test-group-1");

        expect(isMediaGroupValidated("test-group-1")).toBe(false);
        expect(getMediaGroupApproval("test-group-1")).toBeUndefined();

        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(onComplete).toHaveBeenCalledTimes(0);
    });
});
