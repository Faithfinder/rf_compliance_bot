import { mkdir } from "fs/promises";
import { file } from "bun";
import { join } from "path";

interface ChannelConfig {
    channelId: string;
    channelTitle?: string;
}

interface UserChannelData {
    [userId: string]: ChannelConfig;
}

const DATA_DIR = join(process.cwd(), "data");
const STORAGE_FILE = join(DATA_DIR, "user-channels.json");

/**
 * Ensures the data directory exists
 */
async function ensureDataDir(): Promise<void> {
    try {
        await mkdir(DATA_DIR, { recursive: true });
    } catch {
        // Directory might already exist, ignore error
    }
}

/**
 * Loads the user channel data from storage
 */
async function loadData(): Promise<UserChannelData> {
    try {
        const storageFile = file(STORAGE_FILE);
        const exists = await storageFile.exists();

        if (!exists) {
            return {};
        }

        const content = await storageFile.text();
        return JSON.parse(content) as UserChannelData;
    } catch (error) {
        console.error("Error loading storage data:", error);
        return {};
    }
}

/**
 * Saves the user channel data to storage
 */
async function saveData(data: UserChannelData): Promise<void> {
    await ensureDataDir();
    await Bun.write(STORAGE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Gets the configured channel for a user
 */
export async function getUserChannel(userId: number): Promise<ChannelConfig | null> {
    const data = await loadData();
    return data[userId.toString()] || null;
}

/**
 * Sets the channel configuration for a user
 */
export async function setUserChannel(userId: number, channelId: string, channelTitle?: string): Promise<void> {
    const data = await loadData();
    data[userId.toString()] = { channelId, channelTitle };
    await saveData(data);
}

/**
 * Removes the channel configuration for a user
 */
export async function removeUserChannel(userId: number): Promise<boolean> {
    const data = await loadData();
    const userIdStr = userId.toString();

    if (data[userIdStr]) {
        delete data[userIdStr];
        await saveData(data);
        return true;
    }

    return false;
}
