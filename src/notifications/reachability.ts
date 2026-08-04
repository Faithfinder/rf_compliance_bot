import { GrammyError } from "grammy";
import { bot } from "../config/bot";

/**
 * Telegram wordings that all mean the same thing: the bot has no usable private chat with this
 * person, and no retry will change that. Nobody has to talk to the bot in order to post to a
 * channel or to be an admin of one, so a recipient the bot cannot write to is an ordinary state
 * of the world rather than a fault. Telegram answers "chat not found" for someone who never
 * opened the bot; the remaining variants cover blocks and dead accounts.
 */
const UNREACHABLE_RECIPIENT_DESCRIPTIONS = [
    "chat not found",
    "bot can't initiate conversation with a user",
    "bot was blocked by the user",
    "user is deactivated",
];

export function isUnreachableRecipientError(error: unknown): boolean {
    if (!(error instanceof GrammyError)) {
        return false;
    }

    if (error.error_code !== 400 && error.error_code !== 403) {
        return false;
    }

    const description = error.description.toLowerCase();

    return UNREACHABLE_RECIPIENT_DESCRIPTIONS.some((known) => description.includes(known));
}

export function describeDeliveryError(error: unknown): string {
    if (error instanceof GrammyError) {
        return `${error.error_code}: ${error.description}`;
    }

    return error instanceof Error ? error.message : String(error);
}

/**
 * Whether the bot can deliver a private message to this user right now. The Bot API has no method
 * that answers this question, so we call the cheapest one that fails in the same way:
 * sendChatAction needs an existing chat and errors out with "chat not found" without one, while
 * costing a reachable recipient nothing but a fleeting "typing" indicator. Failures unrelated to
 * reachability count as reachable, so a network hiccup never turns into a false warning.
 */
export async function isRecipientReachable(userId: number): Promise<boolean> {
    try {
        await bot.api.sendChatAction(userId, "typing");
        return true;
    } catch (error) {
        if (isUnreachableRecipientError(error)) {
            return false;
        }

        console.warn(`Could not verify whether user ${userId} can receive bot messages:`, error);
        return true;
    }
}
