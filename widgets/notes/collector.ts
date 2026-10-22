import { z } from "zod";
import { defineCollector } from "@shared/widget-contract";
import { config as serverConfig } from "../../server/env";
import { HttpError } from "../../server/http";
import { AddIn, RemoveIn, UpdateIn, manifest } from "./manifest";
import { addNote, loadNotes, mutateNotes, notesFile, removeNote, sortNotes, systemClock, updateNote, type Clock } from "./store";

function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
  return parsed.data;
}

/** dataDir and clock are injectable for tests. */
export function notesCollector(dataDir: string, clock: Clock = systemClock) {
  return defineCollector(manifest, {
    collect: async ({ instance }) => ({ notes: sortNotes(await loadNotes(notesFile(dataDir, instance))) }),
    actions: {
      add: async ({ instance, config, log }, input) => {
        const data = parseInput(AddIn, input);
        const id = await mutateNotes(notesFile(dataDir, instance), notes => {
          const r = addNote(notes, data, config.defaultColor, clock);
          return { notes: r.notes, result: r.id };
        });
        log(`Notiz ${id} angelegt`); // ids only, never the text
      },
      update: async ({ instance }, input) => {
        const data = parseInput(UpdateIn, input);
        await mutateNotes(notesFile(dataDir, instance), notes => ({ notes: updateNote(notes, data, clock), result: undefined }));
      },
      remove: async ({ instance, log }, input) => {
        const { id } = parseInput(RemoveIn, input);
        await mutateNotes(notesFile(dataDir, instance), notes => ({ notes: removeNote(notes, id), result: undefined }));
        log(`Notiz ${id} gelöscht`);
      },
    },
  });
}

export const collector = notesCollector(serverConfig.dataDir);
