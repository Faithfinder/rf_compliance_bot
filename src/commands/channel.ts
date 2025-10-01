import { Keyboard } from "grammy";
import { bot } from "../config/bot";
import type { SessionContext } from "../config/session";
import { resolveChannel, formatChannelInfo } from "../utils";

/**
 * Shows channel selection UI with error message
 */
export function showChannelSelectionUI(errorMessage?: string): { text: string; keyboard: Keyboard } {
    const keyboard = new Keyboard()
        .requestChat("Select Channel", 1, {
            chat_is_channel: true,
            bot_is_member: true,
        })
        .resized();

    let text =
        "Please select a channel from the button below, or use:\n/setchannel <@channel or ID>\n\nExample: /setchannel @mychannel";

    if (errorMessage) {
        text = `❌ ${errorMessage}\n\n${text}`;
    }

    return { text, keyboard };
}

/**
 * Processes channel selection: validates permissions, saves to session, and notifies user
 * Handles all common logic for both manual ID entry and keyboard selection flows
 */
async function processChannelSelection(ctx: SessionContext, channelIdentifier: string): Promise<void> {
    const chatId = ctx.chat!.id;
    let errorMessage: string | undefined;

    // Show a "working" message
    const workingMsg = await ctx.reply("Resolving channel...");

    // Try to resolve the channel
    const channelInfo = await resolveChannel(channelIdentifier);

    if (!channelInfo) {
        errorMessage =
            "Unable to find or access that channel. Make sure the bot has been added to the channel as an administrator.";
    } else {
        // Test if bot has permission to write to the channel
        await bot.api.editMessageText(chatId, workingMsg.message_id, "Checking bot permissions...");

        try {
            // Get bot's status in the channel to verify permissions
            const botInfo = await bot.api.getMe();
            const botMember = await bot.api.getChatMember(channelInfo.id, botInfo.id);

            // Check if bot is an administrator with post_messages permission
            if (botMember.status !== "administrator" && botMember.status !== "creator") {
                errorMessage =
                    "Bot does not have permission to post to this channel. Make sure the bot is an administrator with permission to post messages.";
            } else if (botMember.status === "administrator" && botMember.can_post_messages !== true) {
                // For administrators, check if they have post_messages permission (if it's set)
                errorMessage =
                    "Bot is an administrator but doesn't have permission to post messages. Please grant the 'Post Messages' permission.";
            }
        } catch (error) {
            console.error("Permission check failed:", error);
            errorMessage =
                "Unable to check bot permissions for this channel. Make sure the bot has been added to the channel as an administrator.";
        }
    }

    await bot.api.deleteMessage(chatId, workingMsg.message_id).catch(() => {
        // Ignore if deletion fails
    });

    // If any verification failed, show selection UI and return
    if (errorMessage) {
        const { text, keyboard } = showChannelSelectionUI(errorMessage);

        ctx.session.awaitingChannelSelection = true;

        // Send new message with keyboard
        await ctx.reply(text, { reply_markup: keyboard });
        return;
    }

    // All verification passed - save the channel configuration
    // channelInfo is guaranteed to be non-null here since errorMessage is undefined
    ctx.session.channelConfig = {
        channelId: channelInfo!.id,
        channelTitle: channelInfo!.title,
    };

    await ctx.reply(
        `✅ Channel configured successfully!\n\n` +
            `Your messages will now be posted to: ${formatChannelInfo(channelInfo!.id, channelInfo!.title)}\n\n` +
            `Send me any message to test it out.`,
        { reply_markup: { remove_keyboard: true } },
    );
}

/**
 * Registers all channel-related command handlers
 */
export function registerChannelCommands(): void {
    // /setchannel command - Configure channel for user
    bot.command("setchannel", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Unable to identify user.");
        }

        // Get the channel identifier from the command
        const args = ctx.match;
        if (!args || typeof args !== "string" || args.trim() === "") {
            // No channel ID provided - show channel selection keyboard
            const { text, keyboard } = showChannelSelectionUI();

            ctx.session.awaitingChannelSelection = true;

            return ctx.reply(text, { reply_markup: keyboard });
        }

        const channelIdentifier = args.trim();

        // Process the channel selection
        return processChannelSelection(ctx, channelIdentifier);
    });

    // /removechannel command - Remove channel configuration
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

    // Handle channel selection via KeyboardButtonRequestChat
    bot.on("message:chat_shared", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) {
            return ctx.reply("Unable to identify user.");
        }

        // Check if we're expecting a channel selection
        if (!ctx.session.awaitingChannelSelection) {
            return; // Ignore if not in channel selection flow
        }

        // Clear the awaiting flag
        ctx.session.awaitingChannelSelection = false;

        const chatShared = ctx.message.chat_shared;

        // Verify this is the channel selection request (request_id = 1)
        if (chatShared.request_id !== 1) {
            return;
        }

        const channelId = chatShared.chat_id.toString();

        // Process the channel selection
        return processChannelSelection(ctx, channelId);
    });
}
