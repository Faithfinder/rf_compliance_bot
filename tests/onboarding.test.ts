import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import type { ChannelRequirements } from "../src/utils";
import type { ChannelConfig } from "../src/config/session";

// The command modules reach the bot singleton, which throws at import time without a token, and a
// static import would be hoisted above any assignment to process.env. The type-only imports above
// are erased and carry no runtime dependency.
let start: typeof import("../src/commands/start");
let help: typeof import("../src/commands/help");
let channel: typeof import("../src/commands/channel");

const CHANNEL: ChannelConfig = { channelId: "-1001234567890", channelTitle: "Тестовый канал" };

// Moderation live, publishing available: the fully-configured baseline each case deviates from.
const allPassing = (): ChannelRequirements => ({
    channelExists: true,
    botIsAdded: true,
    botCanPost: true,
    botCanDelete: true,
    foreignAgentBlurbConfigured: true,
    notificationRecipientsConfigured: true,
});

beforeAll(async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
    }

    start = await import("../src/commands/start");
    help = await import("../src/commands/help");
    channel = await import("../src/commands/channel");
});

afterEach(() => {
    delete process.env.FIXED_CHANNEL_ID;
});

describe("/help", () => {
    test("leads with moderation and contrasts how the two modes fail", () => {
        const text = help.buildHelpMessage();

        expect(text).toContain("1️⃣ Модерация канала — основной режим");
        expect(text.indexOf("Модерация канала")).toBeLessThan(text.indexOf("Публикация через бота"));
        expect(text).toContain("останется в канале незамеченным");
        expect(text).toContain("просто не выпустит пост");
    });

    test("groups the commands under headings", () => {
        const text = help.buildHelpMessage();

        expect(text).toContain("⚙️ Настройка");
        expect(text).toContain("🔔 Уведомления");
        expect(text).toContain("ℹ️ Справка");
    });

    test("lists every command exactly once", () => {
        const text = help.buildHelpMessage();

        for (const command of ["/start", "/help", "/info", "/setchannel", "/notify_add", "/notify_list"]) {
            expect(text).toContain(command);
        }
    });

    test("omits channel commands in fixed-channel mode", () => {
        process.env.FIXED_CHANNEL_ID = CHANNEL.channelId;

        const text = help.buildHelpMessage();

        expect(text).not.toContain("/setchannel");
        expect(text).not.toContain("/removechannel");
        // The setup group still carries /set_fa_blurb, so its heading stays rather than rendering bare.
        expect(text).toContain("⚙️ Настройка");
        expect(text).toContain("/set_fa_blurb");
    });
});

describe("/start intro", () => {
    test("describes moderation before publishing", () => {
        expect(start.START_INTRO.indexOf("1️⃣ Модерация канала")).toBeLessThan(
            start.START_INTRO.indexOf("2️⃣ Публикация через бота"),
        );
    });

    test("states both failure modes", () => {
        expect(start.START_INTRO).toContain("немаркированный пост останется в канале, и никто об этом не узнает");
        expect(start.START_INTRO).toContain("если бот недоступен, пост просто не выйдет");
    });

    test("setup prompt names the delete right and keeps the picker copy", () => {
        const prompt = start.buildSetupPrompt(channel.showChannelSelectionUI().text);

        expect(prompt).toContain("«Удалять сообщения»");
        expect(prompt).toContain("/setchannel <@channel или ID>");
    });
});

describe("/start status", () => {
    test("reports moderation as working when its requirements are met", () => {
        const text = start.buildStartStatus(CHANNEL, allPassing()).text;

        expect(text).toContain("1️⃣ ✅ Модерация канала работает");
        expect(text).toContain("2️⃣ ✅ Публикация через бота доступна");
    });

    test("names the missing delete right as the next step", () => {
        const text = start.buildStartStatus(CHANNEL, { ...allPassing(), botCanDelete: false }).text;

        expect(text).toContain("1️⃣ ❌ Модерация канала пока не работает.");
        expect(text).toContain("«Удалять сообщения»");
    });

    test("asks for the blurb before the delete right", () => {
        const text = start.buildStartStatus(CHANNEL, {
            ...allPassing(),
            foreignAgentBlurbConfigured: false,
            botCanDelete: false,
        }).text;

        expect(text).toContain("/set_fa_blurb");
    });

    // Publishing is opt-in: a bot without the post right is a working setup, not a broken one.
    test("does not treat a missing post right as a setup failure", () => {
        const text = start.buildStartStatus(CHANNEL, { ...allPassing(), botCanPost: false }).text;

        expect(text).toContain("1️⃣ ✅ Модерация канала работает");
        expect(text).toContain("➖ Публикация через бота не настроена");
    });

    // An empty recipient list changes who hears about a deletion, not whether it happens.
    test("stays green with no notification recipients", () => {
        const text = start.buildStartStatus(CHANNEL, { ...allPassing(), notificationRecipientsConfigured: false }).text;

        expect(text).toContain("1️⃣ ✅ Модерация канала работает");
    });
});
