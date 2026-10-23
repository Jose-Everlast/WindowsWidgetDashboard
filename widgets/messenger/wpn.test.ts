import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toastXml, writeToasts } from "./test-db";
import { decodePayload, filetimeToMs, isLockError, readToasts } from "./wpn";

const WA = "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App";
const T0 = Date.UTC(2026, 9, 22, 8, 0, 0, 123);

let dir: string;
let db: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-wpn-test-"));
  db = join(dir, "wpndatabase.db");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const wpnTemps = () => readdirSync(tmpdir()).filter(f => f.startsWith("wd-wpn-") && !f.startsWith("wd-wpn-test-"));

describe("readToasts", () => {
  it("returns toasts newest first with exact times and decoded payloads, other types left out", async () => {
    writeToasts(db, [
      { id: 7, primaryId: WA, at: T0, payload: toastXml("Chat 1", "Nachricht 1"), group: "g1", tag: "t1" },
      { id: 8, primaryId: WA, at: T0 + 1000, payload: toastXml("Chat 1", "Nachricht 2") },
      { id: 9, primaryId: WA, at: T0 + 2000, payload: "<badge value='3'/>", type: "badge" },
    ]);
    const { toasts, copied } = await readToasts(db);
    expect(copied).toBe(false);
    expect(toasts.map(t => t.id)).toEqual([8, 7]);
    expect(toasts[1]).toEqual({ id: 7, primaryId: WA, tag: "t1", group: "g1", at: T0, payload: toastXml("Chat 1", "Nachricht 1") });
  });

  it("reads a copy (with the WAL) when the database is locked, and removes the copy", async () => {
    writeToasts(db, [{ id: 1, primaryId: WA, at: T0, payload: toastXml("Chat 1", "Nachricht 1") }], { journalMode: "delete" });
    const before = wpnTemps();
    // A real exclusive lock, as Windows' notification service may hold one.
    const holder = new DatabaseSync(db);
    holder.exec("BEGIN EXCLUSIVE; UPDATE Notification SET Tag = Tag;");
    try {
      const { toasts, copied } = await readToasts(db);
      expect(copied).toBe(true);
      expect(toasts.map(t => t.id)).toEqual([1]);
    } finally {
      holder.exec("ROLLBACK");
      holder.close();
    }
    expect(wpnTemps()).toEqual(before);
  });

  it("names a missing database, and passes on errors that are not a lock", async () => {
    await expect(readToasts(join(dir, "fehlt.db"))).rejects.toThrow(/nicht gefunden/);
    writeToasts(db, []);
    const boom = Object.assign(new Error("no such table: Notification"), { errcode: 1 });
    await expect(
      readToasts(db, {
        query: () => {
          throw boom;
        },
      }),
    ).rejects.toBe(boom);
    expect(existsSync(db)).toBe(true);
  });
});

describe("helpers", () => {
  it("converts FILETIME without losing milliseconds", () => {
    expect(filetimeToMs((BigInt(T0) + 11_644_473_600_000n) * 10_000n)).toBe(T0);
  });

  it("decodes UTF-8, UTF-8 with BOM and UTF-16", () => {
    expect(decodePayload(Buffer.from("<toast>ä</toast>", "utf8"))).toBe("<toast>ä</toast>");
    expect(decodePayload(Buffer.from("﻿<toast/>", "utf8"))).toBe("<toast/>");
    expect(decodePayload(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("<toast/>", "utf16le")]))).toBe("<toast/>");
    expect(decodePayload(null)).toBe("");
  });

  it("recognizes lock errors by SQLite code or message", () => {
    expect(isLockError({ errcode: 5 })).toBe(true);
    expect(isLockError({ errcode: 261 })).toBe(true); // SQLITE_BUSY_RECOVERY
    expect(isLockError({ errcode: 14 })).toBe(true);
    expect(isLockError({ errcode: 1 })).toBe(false);
    expect(isLockError(new Error("database is locked"))).toBe(true);
    expect(isLockError(null)).toBe(false);
  });
});
