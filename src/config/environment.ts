export function getFixedChannelId(): string | null {
    const fixedChannelId = process.env.FIXED_CHANNEL_ID;
    return fixedChannelId && fixedChannelId.trim() !== "" ? fixedChannelId.trim() : null;
}

export function isFixedChannelMode(): boolean {
    return getFixedChannelId() !== null;
}

export function getBotOwnerId(): number | null {
    const ownerId = process.env.BOT_OWNER_ID;

    if (!ownerId || ownerId.trim() === "") {
        return null;
    }

    const parsedId = Number(ownerId);

    if (!Number.isInteger(parsedId)) {
        console.warn("BOT_OWNER_ID is set but is not a valid integer:", ownerId);
        return null;
    }

    return parsedId;
}
