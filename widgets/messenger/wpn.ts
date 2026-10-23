// Reads toasts from the Windows notification database (server only). Read-only; when Windows holds a lock,
// a copy of db + -wal + -shm is read instead. Never logs or reports what the toasts contain.
import { access, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface RawToast {
  /** Notification.Id */
  id: number;
  /** NotificationHandler.PrimaryId: the AppUserModelID of the sending app. */
  primaryId: string;
  tag: string;
  group: string;
  /** Epoch ms */
  at: number;
  /** Toast XML */
  payload: string;
}

export function defaultDbPath(env: Record<string, string | undefined>): string | null {
  return env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Microsoft", "Windows", "Notifications", "wpndatabase.db") : null;
}

/** FILETIME (100 ns steps since 1601) → epoch ms. Needs BigInt: the value is beyond 2^53. */
export const filetimeToMs = (ft: bigint): number => Number(ft / 10_000n - 11_644_473_600_000n);

/** Measured on Windows 11: UTF-8 without BOM; UTF-16 is recognized by its BOM or zero bytes just in case. */
export function decodePayload(payload: Uint8Array | string | null): string {
  if (payload === null) return "";
  if (typeof payload === "string") return payload;
  if (payload[0] === 0xff && payload[1] === 0xfe) return new TextDecoder("utf-16le").decode(payload.subarray(2));
  if (payload.length > 1 && payload[1] === 0) return new TextDecoder("utf-16le").decode(payload);
  // TextDecoder drops a UTF-8 BOM by itself.
  return new TextDecoder("utf-8").decode(payload);
}

// "Group" and "Order" are SQL keywords.
const QUERY = `SELECT n.Id AS id, h.PrimaryId AS primaryId, n.Tag AS tag, n."Group" AS grp, n.ArrivalTime AS arrival, n.Payload AS payload
  FROM Notification n JOIN NotificationHandler h ON h.RecordId = n.HandlerId
  WHERE n.Type = 'toast'
  ORDER BY n.ArrivalTime DESC
  LIMIT ?`;

interface Row {
  id: bigint;
  primaryId: string;
  tag: string | null;
  grp: string | null;
  arrival: bigint | null;
  payload: Uint8Array | string | null;
}

/** Synchronous, a few ms on the target machine (measured 2026-10-22: 8 ms for 47 rows). */
export function queryDb(path: string, limit: number): RawToast[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const stmt = db.prepare(QUERY);
    stmt.setReadBigInts(true);
    return (stmt.all(limit) as unknown as Row[]).map(r => ({
      id: Number(r.id),
      primaryId: r.primaryId,
      tag: r.tag ?? "",
      group: r.grp ?? "",
      at: r.arrival === null ? 0 : filetimeToMs(r.arrival),
      payload: decodePayload(r.payload),
    }));
  } finally {
    db.close();
  }
}

/** SQLITE_BUSY (5), SQLITE_LOCKED (6), SQLITE_CANTOPEN (14). */
export function isLockError(err: unknown): boolean {
  const e = err as { errcode?: unknown; message?: unknown } | null;
  if (e && typeof e.errcode === "number") return [5, 6, 14].includes(e.errcode & 0xff);
  return typeof e?.message === "string" && /locked|busy/i.test(e.message);
}

export async function readToasts(
  dbPath: string,
  { limit = 300, query = queryDb }: { limit?: number; query?: typeof queryDb } = {},
): Promise<{ toasts: RawToast[]; copied: boolean }> {
  try {
    await access(dbPath);
  } catch {
    throw new Error(`Benachrichtigungsdatenbank nicht gefunden: ${dbPath}`);
  }
  try {
    return { toasts: query(dbPath, limit), copied: false };
  } catch (err) {
    if (!isLockError(err)) throw err;
  }
  // Without -wal the newest toasts would be missing: copy all three files.
  const dir = await mkdtemp(join(tmpdir(), "wd-wpn-"));
  try {
    const copy = join(dir, "wpndatabase.db");
    await copyFile(dbPath, copy);
    for (const suffix of ["-wal", "-shm"]) {
      await copyFile(dbPath + suffix, copy + suffix).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      });
    }
    return { toasts: query(copy, limit), copied: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
