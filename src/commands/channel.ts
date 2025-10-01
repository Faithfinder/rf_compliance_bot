import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import {
    resolveChannel,
    formatChannelInfo,
    checkChannelRequirements,
    formatChannelRequirements,
    allRequirementsPassed,
} from "../utils";

export function showChannelSelectionUI(errorMessage?: string): { text: string; keyboard: Keyboard } {
    const keyboard = new Keyboard()
        .requestChat("Select Channel", 1, {
            chat_is_channel: true,
            bot_is_member: true,
        })
        .resized()
        .oneTime();

    let text =
        "Please select a channel from the button below, or use:\n/setchannel <@channel or ID>\n\nExample: /setchannel @mychannel";

    if (errorMessage) {
        text = `❌ ${errorMessage}\n\n${text}`;
    }

    return { text, keyboard };
}

async function processChannelSelection(ctx: SessionContext, channelIdentifier: string): Promise<void> {
    const chatId = ctx.chat!.id;

    const workingMsg = await ctx.reply("Resolving channel...");
    const channelInfo = await resolveChannel(channelIdentifier);

    if (!channelInfo) {
        await bot.api.deleteMessage(chatId, workingMsg.message_id).catch(() => {});
        const errorMessage =
            "Unable to find or access that channel. Make sure the bot has been added to the channel as an administrator.";
        const { text, keyboard } = showChannelSelectionUI(errorMessage);
        ctx.session.awaitingChannelSelection = true;
        await ctx.reply(text, { reply_markup: keyboard });
        return;
    }

    ctx.session.channelConfig = {
        channelId: channelInfo.id,
        channelTitle: channelInfo.title,
    };

    await bot.api.editMessageText(chatId, workingMsg.message_id, "Checking bot permissions...");

    const requirements = await checkChannelRequirements(channelInfo.id);

    await bot.api.deleteMessage(chatId, workingMsg.message_id).catch(() => {});

    let responseText = `✅ Channel configured!\n\n`;
    responseText += `Your messages will now be posted to: ${formatChannelInfo(channelInfo.id, channelInfo.title)}\n\n`;
    responseText += `📋 Requirements:\n${formatChannelRequirements(requirements)}`;

    if (!allRequirementsPassed(requirements)) {
        const keyboard = new Keyboard()
            .requestChat("Select Another Channel", 2, {
                chat_is_channel: true,
                bot_is_member: true,
            })
            .text("/removechannel")
            .resized()
            .oneTime();

        ctx.session.awaitingChannelSelection = true;
        await ctx.reply(responseText, { reply_markup: keyboard });
    } else {
        responseText += `\n\nSend me any message to test it out.`;
        await ctx.reply(responseText, { reply_markup: { remove_keyboard: true } });
    }
}

export function registerChannelCommands(): void {
    bot.command("setchannel", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Unable to identify user.");
        }

        const args = ctx.match;
        if (!args || typeof args !== "string" || args.trim() === "") {
            const { text, keyboard } = showChannelSelectionUI();
            ctx.session.awaitingChannelSelection = true;
            return ctx.reply(text, { reply_markup: keyboard });
        }

        const channelIdentifier = args.trim();
        return processChannelSelection(ctx, channelIdentifier);
    });

    bot.command("removechannel", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Unable to identify user.");
        }

        if (!ctx.session.channelConfig) {
            return ctx.reply("You do not have a channel configured.");
        }

        delete ctx.session.channelConfig;

        return ctx.reply(
            "✅ Channel configuration removed successfully.\n\nYour messages will no longer be posted to any channel.",
        );
    });

    bot.on("message:chat_shared", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Unable to identify user.");
        }

        if (!ctx.session.awaitingChannelSelection) {
            return;
        }

        ctx.session.awaitingChannelSelection = false;
        const chatShared = ctx.message.chat_shared;

        if (chatShared.request_id !== 1 && chatShared.request_id !== 2) {
            return;
        }

        const channelId = chatShared.chat_id.toString();
        return processChannelSelection(ctx, channelId);
    });
}
