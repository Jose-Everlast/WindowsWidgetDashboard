import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetCollector } from "@shared/widget-contract";
import { createCache } from "../../server/cache";
import { createScheduler } from "../../server/scheduler";
import type { ResolvedInstance } from "../../server/widgets/loader";
import { notesCollector } from "./collector";
import { NotesConfig, manifest, type NotesData } from "./manifest";
import type { Clock } from "./store";

let dir: string;
let t: number;
let ids: number;
const clock: Clock = { now: () => new Date(Date.UTC(2026, 9, 19, 8, 0, t++)), newId: () => `00000000-0000-4000-8000-00000000000${++ids}` };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-notesc-"));
  t = 0;
  ids = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// The real scheduler and cache, only the data folder is temporary.
function start() {
  const r: ResolvedInstance = {
    instance: "notizen",
    type: "notes",
    layout: { instance: "notizen", type: "notes", x: 0, y: 0, enabled: true, config: {} },
    loaded: { manifest, collector: notesCollector(dir, clock) as WidgetCollector<unknown, unknown>, hasComponent: true },
    parsedConfig: NotesConfig.parse({ defaultColor: "green" }),
  };
  return createScheduler({ cache: createCache(), instances: [r], env: {} });
}
const notesOf = (s: { data: unknown }) => (s.data as NotesData).notes;

describe("notes actions through the scheduler", () => {
  it("adds, updates and removes notes and returns the new state each time", async () => {
    const s = start();
    let state = await s.action("notizen", "add", { text: "Milch kaufen" });
    expect(notesOf(state)).toMatchObject([{ text: "Milch kaufen", color: "green", done: false }]);
    const id = notesOf(state)[0]!.id;

    state = await s.action("notizen", "add", { text: "Steuer", color: "pink" });
    expect(notesOf(state).map(n => n.text)).toEqual(["Steuer", "Milch kaufen"]);

    state = await s.action("notizen", "update", { id, done: true });
    expect(notesOf(state).map(n => [n.text, n.done])).toEqual([
      ["Steuer", false],
      ["Milch kaufen", true],
    ]);

    state = await s.action("notizen", "remove", { id });
    expect(notesOf(state).map(n => n.text)).toEqual(["Steuer"]);
    expect(state.status).toBe("ok");
  });

  it("keeps notes across a restart", async () => {
    await start().action("notizen", "add", { text: "bleibt" });
    expect(notesOf(await start().refresh("notizen"))).toMatchObject([{ text: "bleibt" }]);
  });

  it("rejects bad input with 400 and leaves the state alone", async () => {
    const s = start();
    await s.action("notizen", "add", { text: "a" });
    await expect(s.action("notizen", "add", { text: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(s.action("notizen", "update", { id: "nope", done: true })).rejects.toMatchObject({ status: 404 });
    await expect(s.action("notizen", "remove", {})).rejects.toMatchObject({ status: 400 });
    expect(notesOf(await s.refresh("notizen"))).toHaveLength(1);
  });

  it("shows a broken file as error and refuses changes", async () => {
    const s = start();
    await s.action("notizen", "add", { text: "a" });
    writeFileSync(join(dir, "notes", "notizen.json"), "{broken");
    expect((await s.refresh("notizen")).status).toBe("stale");
    await expect(s.action("notizen", "add", {})).rejects.toMatchObject({ status: 409 });
  });

  it("writes the expected payload fixture", async () => {
    const s = start();
    await s.action("notizen", "add", { text: "Beispiel: Rückruf Kunde" });
    await s.action("notizen", "add", { text: "Idee: Git-Status-Widget", color: "blue" });
    const state = await s.action("notizen", "add", { text: "Erledigtes Beispiel", color: "yellow" });
    const done = notesOf(state).find(n => n.text === "Erledigtes Beispiel")!;
    const final = await s.action("notizen", "update", { id: done.id, done: true });
    expect(notesOf(final)).toHaveLength(3);
    if (process.env.UPDATE_FIXTURES) {
      writeFileSync(new URL("./fixtures/notes.json", import.meta.url), `${JSON.stringify(final.data, null, 2)}\n`);
    }
  });
});
