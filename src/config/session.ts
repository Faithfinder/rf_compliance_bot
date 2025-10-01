import { Context, session, type SessionFlavor } from "grammy";
import { FileAdapter } from "@grammyjs/storage-file";
import { join } from "path";

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
    return session({
        initial: (): SessionData => ({}),
        storage: new FileAdapter<SessionData>({
            dirName: join(process.cwd(), "data"),
        }),
    });
}
