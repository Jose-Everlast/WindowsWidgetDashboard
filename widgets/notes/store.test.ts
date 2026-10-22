import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AddIn, MAX_NOTES, UpdateIn, type Note } from "./manifest";
import { addNote, loadNotes, mutateNotes, notesFile, removeNote, sortNotes, updateNote, type Clock } from "./store";

let t = 0;
let ids = 0;
const clock: Clock = { now: () => new Date(Date.UTC(2026, 9, 19, 8, 0, t++)), newId: () => `n${++ids}` };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-notes-"));
  t = 0;
  ids = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  text: id,
  color: "yellow",
  done: false,
  x: null,
  y: null,
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  ...over,
});

describe("note operations", () => {
  it("adds with defaults and updates single fields", () => {
    const { notes, id } = addNote([], {}, "pink", clock);
    expect(notes[0]).toMatchObject({ id, text: "", color: "pink", done: false });
    const updated = updateNote(notes, { id, done: true }, clock);
    expect(updated[0]).toMatchObject({ text: "", done: true });
    expect(updated[0]!.updatedAt > notes[0]!.updatedAt).toBe(true);
  });

  it("enforces the limit and rejects unknown IDs", () => {
    const full = Array.from({ length: MAX_NOTES }, (_, i) => note(`n${i}`));
    expect(() => addNote(full, {}, "yellow", clock)).toThrow(/Höchstens 50/);
    expect(() => updateNote([note("a")], { id: "x", done: true }, clock)).toThrow(/not found/);
    expect(() => removeNote([note("a")], "x")).toThrow(/not found/);
    expect(removeNote([note("a"), note("b")], "a").map(n => n.id)).toEqual(["b"]);
  });

  it("sorts open before done, newest first", () => {
    const sorted = sortNotes([
      note("old", { createdAt: "2026-10-18T00:00:00.000Z" }),
      note("done-new", { done: true, createdAt: "2026-10-19T09:00:00.000Z" }),
      note("new", { createdAt: "2026-10-19T00:00:00.000Z" }),
    ]);
    expect(sorted.map(n => n.id)).toEqual(["new", "old", "done-new"]);
  });

  it("stores and moves the position, within the screen", () => {
    const { notes, id } = addNote([], { x: 0.5, y: 0.25 }, "yellow", clock);
    expect(notes[0]).toMatchObject({ x: 0.5, y: 0.25 });
    expect(updateNote(notes, { id, x: 0.1, y: 0.9 }, clock)[0]).toMatchObject({ x: 0.1, y: 0.9 });
    expect(UpdateIn.safeParse({ id, x: 1.5 }).success).toBe(false);
    expect(UpdateIn.safeParse({ id, x: 0.3 }).success).toBe(true);
    expect(addNote([], {}, "yellow", clock).notes[0]).toMatchObject({ x: null, y: null });
  });

  it("validates action input strictly", () => {
    expect(UpdateIn.safeParse({ id: "a" }).success).toBe(false);
    expect(UpdateIn.safeParse({ id: "a", done: true, extra: 1 }).success).toBe(false);
    expect(AddIn.safeParse({ text: "x".repeat(501) }).success).toBe(false);
    expect(AddIn.safeParse({ color: "purple" }).success).toBe(false);
    expect(AddIn.safeParse({}).success).toBe(true);
  });
});

describe("notes file", () => {
  it("rejects instance names that are no kebab-case", () => {
    expect(() => notesFile(dir, "../x")).toThrow(/Ungültige Instanz/);
  });

  it("starts empty and keeps parallel changes", async () => {
    const file = notesFile(dir, "notes");
    expect(await loadNotes(file)).toEqual([]);
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        mutateNotes(file, notes => {
          const r = addNote(notes, { text: `#${i}` }, "yellow", clock);
          return { notes: r.notes, result: r.id };
        }),
      ),
    );
    expect((await loadNotes(file)).map(n => n.text).sort()).toEqual(["#0", "#1", "#2", "#3", "#4"]);
  });

  it("never overwrites a broken file", async () => {
    const file = notesFile(dir, "notes");
    mkdirSync(join(dir, "notes"));
    writeFileSync(file, "{broken");
    await expect(mutateNotes(file, notes => ({ notes, result: 0 }))).rejects.toMatchObject({ status: 409 });
    expect(readFileSync(file, "utf8")).toBe("{broken");
  });
});
