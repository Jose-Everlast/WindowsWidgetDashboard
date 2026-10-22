// Notes of one instance in data/notes/<instance>.json (server only). Pure list operations plus file I/O;
// every change runs read-modify-write under one lock per file.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { HttpError, notFound } from "../../server/http";
import { readJsonFile, withLock, writeJsonFileAtomic } from "../../server/lib/json-file";
import { MAX_NOTES, Note, type AddIn, type NoteColor, type UpdateIn } from "./manifest";

export interface Clock {
  now: () => Date;
  newId: () => string;
}
export const systemClock: Clock = { now: () => new Date(), newId: randomUUID };

export function addNote(notes: Note[], input: AddIn, defaultColor: NoteColor, clock: Clock = systemClock): { notes: Note[]; id: string } {
  if (notes.length >= MAX_NOTES) throw new HttpError(409, `Höchstens ${MAX_NOTES} Notizen`);
  const at = clock.now().toISOString();
  const note: Note = {
    id: clock.newId(),
    text: input.text ?? "",
    color: input.color ?? defaultColor,
    done: false,
    x: input.x ?? null,
    y: input.y ?? null,
    createdAt: at,
    updatedAt: at,
  };
  return { notes: [...notes, note], id: note.id };
}

export function updateNote(notes: Note[], input: UpdateIn, clock: Clock = systemClock): Note[] {
  if (!notes.some(n => n.id === input.id)) throw notFound("Notiz");
  const { id, ...changes } = input;
  return notes.map(n => (n.id === id ? { ...n, ...changes, updatedAt: clock.now().toISOString() } : n));
}

export function removeNote(notes: Note[], id: string): Note[] {
  if (!notes.some(n => n.id === id)) throw notFound("Notiz");
  return notes.filter(n => n.id !== id);
}

/** Open before done, newest first within each group. */
export const sortNotes = (notes: Note[]): Note[] =>
  [...notes].sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt));

const NotesFile = z.object({ version: z.literal(1), notes: z.array(Note) });

export function notesFile(dataDir: string, instance: string): string {
  // Already kebab-case from InstanceConfig; checked again because it becomes a path.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(instance)) throw new Error(`Ungültige Instanz "${instance}"`);
  return join(dataDir, "notes", `${instance}.json`);
}

export async function loadNotes(file: string): Promise<Note[]> {
  return (await readJsonFile(file, NotesFile))?.notes ?? [];
}

/** A broken file throws before anything is written: it is never overwritten. */
export function mutateNotes<T>(file: string, fn: (notes: Note[]) => { notes: Note[]; result: T }): Promise<T> {
  return withLock(file, async () => {
    let notes: Note[];
    try {
      notes = await loadNotes(file);
    } catch (err) {
      throw new HttpError(409, `${err instanceof Error ? err.message : String(err)} – Datei reparieren oder entfernen`);
    }
    const next = fn(notes);
    await writeJsonFileAtomic(file, { version: 1, notes: next.notes });
    return next.result;
  });
}
