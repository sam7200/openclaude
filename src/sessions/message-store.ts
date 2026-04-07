/**
 * Persistent message store for group chat history.
 *
 * Uses JSONL (one JSON object per line) for append-only, crash-safe persistence.
 * Each chat gets its own file: {dataDir}/messages/{chatId}.jsonl
 *
 * Supports:
 * - Append messages from any source (group chat silent ingest)
 * - Query by time range, sender, keyword, limit
 * - Per-session read cursors (peek recent N unread for passive injection)
 */

import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

export interface StoredMessage {
  /** Telegram message_id (unique within chat) */
  id: string;
  /** Unix timestamp (seconds) */
  ts: number;
  /** Sender display name */
  sender: string;
  /** Sender user ID */
  senderId: string;
  /** Text content */
  text: string;
  /** Media references: "photo:file_id", "document:file_id:filename", etc. */
  media?: string[];
}

export interface MessageQueryOptions {
  chatId: string;
  /** Start time (epoch ms) */
  since?: number;
  /** End time (epoch ms) */
  until?: number;
  /** Max messages to return */
  limit?: number;
  /** Filter by sender name (case-insensitive substring) */
  sender?: string;
  /** Full-text search (case-insensitive substring) */
  search?: string;
}

export class MessageStore {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "messages");
    mkdirSync(this.dir, { recursive: true });
  }

  /** Append a message to the chat's JSONL file */
  append(chatId: string, msg: StoredMessage): void {
    const filePath = this.chatFile(chatId);
    const line = JSON.stringify(msg) + "\n";
    appendFileSync(filePath, line, "utf-8");
  }

  /** Query messages with filters */
  query(opts: MessageQueryOptions): StoredMessage[] {
    const filePath = this.chatFile(opts.chatId);
    if (!existsSync(filePath)) return [];

    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());

    let messages: StoredMessage[] = [];
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line) as StoredMessage);
      } catch {
        // skip malformed lines
      }
    }

    // Apply filters
    if (opts.since != null) {
      const sinceSec = opts.since / 1000;
      messages = messages.filter((m) => m.ts >= sinceSec);
    }
    if (opts.until != null) {
      const untilSec = opts.until / 1000;
      messages = messages.filter((m) => m.ts <= untilSec);
    }
    if (opts.sender) {
      const s = opts.sender.toLowerCase();
      messages = messages.filter((m) => m.sender.toLowerCase().includes(s));
    }
    if (opts.search) {
      const q = opts.search.toLowerCase();
      messages = messages.filter((m) => m.text.toLowerCase().includes(q));
    }

    // Apply limit (take last N)
    const limit = opts.limit ?? 200;
    if (messages.length > limit) {
      messages = messages.slice(-limit);
    }

    return messages;
  }

  /** Get recent messages for passive context injection (last N messages) */
  getRecent(chatId: string, count: number): StoredMessage[] {
    const filePath = this.chatFile(chatId);
    if (!existsSync(filePath)) return [];

    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());

    // Read from end for efficiency
    const result: StoredMessage[] = [];
    const start = Math.max(0, lines.length - count);
    for (let i = start; i < lines.length; i++) {
      try {
        result.push(JSON.parse(lines[i]) as StoredMessage);
      } catch {
        // skip
      }
    }
    return result;
  }

  /** Compact a chat file: keep only last N messages (run periodically) */
  compact(chatId: string, keepLast: number = 5000): void {
    const filePath = this.chatFile(chatId);
    if (!existsSync(filePath)) return;

    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());

    if (lines.length <= keepLast) return;

    const kept = lines.slice(-keepLast);
    const tmp = filePath + ".tmp";
    writeFileSync(tmp, kept.join("\n") + "\n", "utf-8");
    renameSync(tmp, filePath);
  }

  private chatFile(chatId: string): string {
    const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.dir, `${safe}.jsonl`);
  }
}
