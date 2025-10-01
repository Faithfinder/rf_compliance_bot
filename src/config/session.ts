import { Context, session, type SessionFlavor } from "grammy";
import { FileAdapter } from "@grammyjs/storage-file";
import { join } from "path";

/**
 * Channel configuration stored in user session
 */
export interface ChannelConfig {
    channelId: string;
    channelTitle?: string;
}

/**
 * Session data structure
 */
export interface SessionData {
    channelConfig?: ChannelConfig;
}

/**
 * Session context type - extends Context with session data
 */
export type SessionContext = Context & SessionFlavor<SessionData>;

/**
 * Creates and returns the configured session middleware
 */
export function createSessionMiddleware() {
    return session({
        initial: (): SessionData => ({}),
        storage: new FileAdapter<SessionData>({
            dirName: join(process.cwd(), "data"),
        }),
    });
}
