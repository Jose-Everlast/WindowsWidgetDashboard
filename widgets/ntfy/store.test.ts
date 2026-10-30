import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_TOPICS, type NtfyMessage } from "./manifest";
import {
  DISMISS_KEEP_MS,
  addTopic,
  applyDismissed,
  dismiss,
  dismissAll,
  loadState,
  mergeTopics,
  mutateState,
  removeTopic,
  restoreAll,
  stateFile,
  type TileState,
} from "./store";

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "wd-ntfy-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const empty: TileState = { topics: [], dismissed: [], clearedAt: null };
const msg = (id: string, at: string): NtfyMessage => ({ id, at, topic: "t", title: null, text: "", priority: 3, tags: [], click: null });

describe("topic list", () => {
  it("merges config and tile topics, config first, duplicates once as fixed", () => {
    expect(mergeTopics(["a"], ["b", "a"])).toEqual([
      { name: "a", removable: false },
      { name: "b", removable: true },
    ]);
  });

  it("adds new topics only, up to the limit", () => {
    expect(addTopic(["a"], [], "b")).toEqual(["b"]);
    expect(() => addTopic(["a"], [], "a")).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => addTopic([], ["b"], "b")).toThrow(expect.objectContaining({ status: 409 }));
    const many = Array.from({ length: MAX_TOPICS }, (_, i) => `t${i}`);
    expect(() => addTopic([], many, "x")).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("removes tile topics only", () => {
    expect(removeTopic([], ["b", "c"], "b")).toEqual(["c"]);
    expect(() => removeTopic(["a"], [], "a")).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => removeTopic([], [], "x")).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe("dismissed messages", () => {
  const now = new Date("2026-10-28T08:00:00.000Z");

  it("hides single messages and counts them", () => {
    const s = dismiss(empty, "b", now);
    const r = applyDismissed([msg("a", "2026-10-28T07:00:00.000Z"), msg("b", "2026-10-28T06:00:00.000Z")], s);
    expect(r.messages.map(m => m.id)).toEqual(["a"]);
    expect(r.hidden).toBe(1);
  });

  it("stores an id once and drops entries older than the keep window", () => {
    const old = new Date(now.getTime() - DISMISS_KEEP_MS - 1000).toISOString();
    const s = dismiss({ ...empty, dismissed: [{ id: "x", at: old }, { id: "a", at: old }] }, "a", now);
    expect(s.dismissed).toEqual([{ id: "a", at: now.toISOString() }]);
  });

  it("dismiss all hides up to the given time, newer messages stay; the cutoff never moves back", () => {
    const s = dismissAll(dismiss(empty, "z", now), "2026-10-28T07:00:00.000Z");
    expect(s.dismissed).toEqual([]);
    const r = applyDismissed([msg("new", "2026-10-28T07:30:00.000Z"), msg("old", "2026-10-28T07:00:00.000Z")], s);
    expect(r).toMatchObject({ messages: [{ id: "new" }], hidden: 1 });
    expect(dismissAll(s, "2026-10-28T06:00:00.000Z").clearedAt).toBe("2026-10-28T07:00:00.000Z");
  });

  it("restore brings everything back and keeps the topics", () => {
    const s = restoreAll({ topics: ["t"], dismissed: [{ id: "a", at: now.toISOString() }], clearedAt: now.toISOString() });
    expect(s).toEqual({ topics: ["t"], dismissed: [], clearedAt: null });
  });
});

describe("state file", () => {
  it("rejects instance names that are not kebab-case", () => {
    expect(() => stateFile(dir, "../x")).toThrow(/Ungültige Instanz/);
  });

  it("reads nothing as empty and writes atomically", async () => {
    const file = stateFile(dir, "ntfy");
    expect(await loadState(file)).toEqual(empty);
    await mutateState(file, s => ({ ...s, topics: ["a"] }));
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ version: 1, topics: ["a"], dismissed: [], clearedAt: null });
  });

  it("reads files from before dismissing existed", async () => {
    const file = stateFile(dir, "ntfy");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: 1, topics: ["a"] }));
    expect(await loadState(file)).toEqual({ topics: ["a"], dismissed: [], clearedAt: null });
  });

  it("never overwrites a broken file", async () => {
    const file = stateFile(dir, "ntfy");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "{broken");
    await expect(mutateState(file, s => s)).rejects.toThrow(/kein gültiges JSON/);
    expect(readFileSync(file, "utf8")).toBe("{broken");
  });
});
