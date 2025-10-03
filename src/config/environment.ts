export function getFixedChannelId(): string | null {
    const fixedChannelId = process.env.FIXED_CHANNEL_ID;
    return fixedChannelId && fixedChannelId.trim() !== "" ? fixedChannelId.trim() : null;
}

export function isFixedChannelMode(): boolean {
    return getFixedChannelId() !== null;
}
