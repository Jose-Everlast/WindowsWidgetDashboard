import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetCollector } from "@shared/widget-contract";
import { createCache } from "../../server/cache";
import { createScheduler, type Scheduler } from "../../server/scheduler";
import type { ResolvedInstance } from "../../server/widgets/loader";
import { messengerCollector } from "./collector";
import { MessengerConfig, manifest, type MessengerData } from "./manifest";
import { toastXml, writeToasts } from "./test-db";
import { readToasts } from "./wpn";

const WA = "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App";
const TEAMS = "MSTeams_8wekyb3d8bbwe!MSTeams";
const T0 = Date.UTC(2026, 9, 22, 8, 0, 0);
const min = (n: number) => T0 + n * 60_000;

let dir: string;
let db: string;
let reads: number;
let scheduler: Scheduler | undefined;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-msgc-"));
  db = join(dir, "wpndatabase.db");
  reads = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  writeToasts(db, [
    { id: 1, primaryId: WA, at: min(0), payload: toastXml("Chat 1", "Nachricht 1") },
    { id: 2, primaryId: TEAMS, at: min(1), payload: toastXml("Kontakt 1", "Nachricht 2") },
  ]);
});
afterEach(() => {
  scheduler?.stop();
  scheduler = undefined;
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// The real scheduler, cache, database reader and feed file; only the folders are temporary.
/** Like the UI: chats are known from a first collect before anyone acts on them. */
async function start(now = min(5)) {
  const collector = messengerCollector(join(dir, "data"), {
    readToasts: (path, opts) => {
      reads++;
      return readToasts(path, opts);
    },
    now: () => now,
  });
  const r: ResolvedInstance = {
    instance: "nachrichten",
    type: "messenger",
    layout: { instance: "nachrichten", type: "messenger", x: 0, y: 0, enabled: true, config: {} },
    loaded: { manifest, collector: collector as WidgetCollector<unknown, unknown>, hasComponent: true },
    parsedConfig: MessengerConfig.parse({ dbPath: db }),
  };
  scheduler = createScheduler({ cache: createCache(), instances: [r], env: {} });
  await scheduler.refresh("nachrichten");
  return scheduler;
}
const dataOf = (s: { data: unknown }) => s.data as MessengerData;
const titles = (s: { data: unknown }) => dataOf(s).chats.map(c => c.title);

describe("messenger actions through the scheduler", () => {
  it("dismisses a chat and brings it back with undo", async () => {
    const s = await start();
    let state = await s.action("nachrichten", "dismiss", { key: "whatsapp:Chat 1" });
    expect(titles(state)).toEqual(["Kontakt 1"]);
    expect(dataOf(state).undo).toEqual({ kind: "dismiss", count: 1 });
    // Windows still holds the toast: it stays hidden.
    expect(titles(await s.refresh("nachrichten"))).toEqual(["Kontakt 1"]);
    state = await s.action("nachrichten", "undo", {});
    expect(titles(state)).toEqual(["Kontakt 1", "Chat 1"]);
    expect(dataOf(state).undo).toBeNull();
  });

  it("clears all, marks read, mutes and unmutes an app", async () => {
    const s = await start();
    let state = await s.action("nachrichten", "markRead", { key: "teams:Kontakt 1" });
    expect(dataOf(state).chats.map(c => c.unread)).toEqual([0, 1]);
    state = await s.action("nachrichten", "markAllRead", {});
    expect(dataOf(state).unread).toBe(0);
    state = await s.action("nachrichten", "mute", { app: "whatsapp" });
    expect(titles(state)).toEqual(["Kontakt 1"]);
    expect(dataOf(state).apps.find(a => a.id === "whatsapp")!.muted).toBe(true);
    state = await s.action("nachrichten", "unmute", { app: "whatsapp" });
    expect(titles(state)).toEqual(["Kontakt 1", "Chat 1"]);
    state = await s.action("nachrichten", "clear", {});
    expect(dataOf(state).chats).toEqual([]);
    expect(dataOf(state).undo).toEqual({ kind: "clear", count: 2 });
  });

  it("keeps its feed across a restart", async () => {
    await (await start()).action("nachrichten", "dismiss", { key: "whatsapp:Chat 1" });
    scheduler!.stop();
    expect(titles(await (await start()).refresh("nachrichten"))).toEqual(["Kontakt 1"]);
  });

  it("rejects bad input with 400, unknown chats and apps with 404", async () => {
    const s = await start();
    await expect(s.action("nachrichten", "dismiss", { key: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(s.action("nachrichten", "dismiss", { key: "whatsapp:Chat 1", extra: true })).rejects.toMatchObject({ status: 400 });
    await expect(s.action("nachrichten", "clear", { all: true })).rejects.toMatchObject({ status: 400 });
    await expect(s.action("nachrichten", "markRead", { key: "whatsapp:nope" })).rejects.toMatchObject({ status: 404 });
    await expect(s.action("nachrichten", "mute", { app: "icq" })).rejects.toMatchObject({ status: 404 });
    await expect(s.action("nachrichten", "undo", {})).rejects.toMatchObject({ status: 409 });
    expect(titles(await s.refresh("nachrichten"))).toEqual(["Kontakt 1", "Chat 1"]);
  });

  it("shows a broken feed file as stale and refuses changes", async () => {
    const s = await start();
    await s.refresh("nachrichten");
    writeFileSync(join(dir, "data", "messages", "nachrichten.json"), "{broken");
    expect((await s.refresh("nachrichten")).status).toBe("stale");
    await expect(s.action("nachrichten", "clear", {})).rejects.toMatchObject({ status: 409 });
  });
});

describe("folder watch", () => {
  it("collects when the database or its WAL changes, not on -shm", async () => {
    const s = await start();
    s.start();
    await vi.waitFor(() => expect(reads).toBeGreaterThan(0));
    // Let the first poll and any events of the setup settle.
    await new Promise(r => setTimeout(r, 800));
    const before = reads;
    appendFileSync(`${db}-shm`, "x");
    await new Promise(r => setTimeout(r, 1200));
    expect(reads).toBe(before);
    writeToasts(db, [{ id: 3, primaryId: WA, at: min(2), payload: toastXml("Chat 2", "Nachricht 3") }]);
    await vi.waitFor(() => expect(reads).toBeGreaterThan(before), { timeout: 3000 });
  });
});
