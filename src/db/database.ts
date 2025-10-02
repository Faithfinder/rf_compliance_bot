import { Database } from "bun:sqlite";
import { join } from "path";

export interface ChannelSettingsData {
    foreignAgentBlurb?: string;
}

export interface ChannelSettings {
    channelId: string;
    settings: ChannelSettingsData;
    createdAt: number;
    updatedAt: number;
}

interface DbRow {
    channelId: string;
    settings: string;
    createdAt: number;
    updatedAt: number;
}

let db: Database | null = null;

export function initializeDatabase(): void {
    const dbPath = join(process.cwd(), "data", "channels.db");
    db = new Database(dbPath, { create: true });

    db.run(`
        CREATE TABLE IF NOT EXISTS channel_settings (
            channel_id TEXT PRIMARY KEY,
            settings TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `);

    console.warn("Database initialized at", dbPath);
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        console.warn("Database connection closed");
    }
}

function ensureDatabase(): Database {
    if (!db) {
        throw new Error("Database not initialized. Call initializeDatabase() first.");
    }
    return db;
}

export function getChannelSettings(channelId: string): ChannelSettingsData | null {
    const database = ensureDatabase();

    const query = database.query<DbRow, [string]>(
        "SELECT channel_id as channelId, settings, created_at as createdAt, updated_at as updatedAt FROM channel_settings WHERE channel_id = ?",
    );

    const result = query.get(channelId);

    if (!result) {
        return null;
    }

    return JSON.parse(result.settings) as ChannelSettingsData
}

export function updateChannelSettings(channelId: string, settings: Partial<ChannelSettingsData>): void {
    const database = ensureDatabase();
    const now = Date.now();

    const existing = getChannelSettings(channelId);

    if (existing) {
        const mergedSettings = { ...existing, ...settings };
        const updateQuery = database.query(
            "UPDATE channel_settings SET settings = ?, updated_at = ? WHERE channel_id = ?",
        );
        updateQuery.run(JSON.stringify(mergedSettings), now, channelId);
    } else {
        const insertQuery = database.query(
            "INSERT INTO channel_settings (channel_id, settings, created_at, updated_at) VALUES (?, ?, ?, ?)",
        );
        insertQuery.run(channelId, JSON.stringify(settings), now, now);
    }
}

export function deleteChannelSettings(channelId: string): void {
    const database = ensureDatabase();

    const deleteQuery = database.query("DELETE FROM channel_settings WHERE channel_id = ?");
    deleteQuery.run(channelId);
}
