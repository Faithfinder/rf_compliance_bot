import type { StorageAdapter } from "grammy";
import type { Database } from "bun:sqlite";

export class SqliteSessionStorage<T> implements StorageAdapter<T> {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    read(key: string): T | undefined {
        const query = this.db.query<{ data: string }, [string]>("SELECT data FROM sessions WHERE user_id = ?");

        const result = query.get(key);

        if (!result) {
            return undefined;
        }

        return JSON.parse(result.data) as T;
    }

    write(key: string, value: T): void {
        const now = Date.now();
        const data = JSON.stringify(value);

        const upsertQuery = this.db.query(
            "INSERT INTO sessions (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        );

        upsertQuery.run(key, data, now);
    }

    delete(key: string): void {
        const deleteQuery = this.db.query("DELETE FROM sessions WHERE user_id = ?");
        deleteQuery.run(key);
    }
}
