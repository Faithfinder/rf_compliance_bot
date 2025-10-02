import { Context, session, type SessionFlavor } from "grammy";
import { getDatabase } from "../db/database";
import { SqliteSessionStorage } from "../db/session-storage";

export interface ChannelConfig {
    channelId: string;
    channelTitle?: string;
}

export interface SessionData {
    channelConfig?: ChannelConfig;
    awaitingChannelSelection?: boolean;
}

export type SessionContext = Context & SessionFlavor<SessionData>;

export function createSessionMiddleware() {
    const db = getDatabase();
    const storage = new SqliteSessionStorage<SessionData>(db);

    return session({
        initial: (): SessionData => ({}),
        storage,
    });
}
