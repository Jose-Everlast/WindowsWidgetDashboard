// Test helper: a real SQLite file with the recorded schema of wpndatabase.db (fixtures/wpn-schema.sql).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface TestToast {
  id: number;
  primaryId: string;
  type?: string;
  tag?: string;
  group?: string;
  /** Epoch ms */
  at: number;
  payload: string;
}

const SCHEMA = readFileSync(join(import.meta.dirname, "fixtures", "wpn-schema.sql"), "utf8");

export const msToFiletime = (ms: number): bigint => (BigInt(ms) + 11_644_473_600_000n) * 10_000n;

export const toastXml = (title: string, ...texts: string[]) =>
  `<toast launch="…"><visual><binding template="ToastGeneric"><text>${title}</text>${texts.map(t => `<text>${t}</text>`).join("")}</binding></visual></toast>`;

/** Creates (or extends) the database at path. journalMode "delete" lets a test take a real exclusive lock. */
export function writeToasts(path: string, toasts: TestToast[], opts: { journalMode?: "wal" | "delete" } = {}): void {
  const db = new DatabaseSync(path);
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'Notification'").get()) {
      db.exec(`PRAGMA journal_mode = ${opts.journalMode ?? "wal"};`);
      db.exec(SCHEMA);
    }
    const handler = db.prepare("INSERT OR IGNORE INTO NotificationHandler (PrimaryId) VALUES (?)");
    const handlerId = db.prepare("SELECT RecordId FROM NotificationHandler WHERE PrimaryId = ?");
    const insert = db.prepare(
      `INSERT INTO Notification (Id, HandlerId, Type, Payload, Tag, "Group", ArrivalTime, PayloadType) VALUES (?, ?, ?, ?, ?, ?, ?, 'Xml')`,
    );
    for (const t of toasts) {
      if (!handlerId.get(t.primaryId)) handler.run(t.primaryId);
      const { RecordId } = handlerId.get(t.primaryId) as { RecordId: number };
      insert.run(t.id, RecordId, t.type ?? "toast", Buffer.from(t.payload, "utf8"), t.tag ?? "", t.group ?? "", msToFiletime(t.at));
    }
  } finally {
    db.close();
  }
}

/** Removes toasts like Windows does when they are dismissed in the action center. */
export function deleteToasts(path: string, ids: number[]): void {
  const db = new DatabaseSync(path);
  try {
    const del = db.prepare("DELETE FROM Notification WHERE Id = ?");
    for (const id of ids) del.run(id);
  } finally {
    db.close();
  }
}
