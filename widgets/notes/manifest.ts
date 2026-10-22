import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const MAX_NOTES = 50;
export const MAX_TEXT = 500;

export const NOTE_COLORS = ["yellow", "pink", "green", "blue"] as const;
export const NoteColor = z.enum(NOTE_COLORS);
export type NoteColor = z.infer<typeof NoteColor>;

// Position on the screen as a fraction of the viewport (0..1), so it survives other resolutions.
// null: not placed yet, the board picks a spot.
const Pos = z.number().min(0).max(1);

export const Note = z.object({
  id: z.string(),
  text: z.string().max(MAX_TEXT),
  color: NoteColor,
  done: z.boolean(),
  x: Pos.nullable().default(null),
  y: Pos.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Note = z.output<typeof Note>;

export const NotesConfig = z.object({ defaultColor: NoteColor.default("yellow") });
export type NotesConfig = z.infer<typeof NotesConfig>;

export const NotesData = z.object({ notes: z.array(Note).max(MAX_NOTES) });
export type NotesData = z.infer<typeof NotesData>;

// Action inputs come from the browser: strict, so unknown fields are rejected instead of ignored.
export const AddIn = z.strictObject({
  text: z.string().max(MAX_TEXT).optional(),
  color: NoteColor.optional(),
  x: Pos.optional(),
  y: Pos.optional(),
});
export const UpdateIn = z
  .strictObject({
    id: z.string().min(1),
    text: z.string().max(MAX_TEXT).optional(),
    color: NoteColor.optional(),
    done: z.boolean().optional(),
    x: Pos.optional(),
    y: Pos.optional(),
  })
  .refine(
    u => u.text !== undefined || u.color !== undefined || u.done !== undefined || u.x !== undefined || u.y !== undefined,
    "text, color, done, x oder y erwartet",
  );
export const RemoveIn = z.strictObject({ id: z.string().min(1) });
export type AddIn = z.infer<typeof AddIn>;
export type UpdateIn = z.infer<typeof UpdateIn>;

export const manifest = defineManifest({
  id: "notes",
  title: "Notizen",
  version: 1,
  category: "daily",
  defaultSize: { w: 3, h: 2 },
  // Changes arrive through actions; polling only catches edits made to the file by hand.
  intervalMs: 300_000,
  timeoutMs: 5_000,
  capabilities: ["fs"],
  // Post-its float over the whole dashboard; there is no tile.
  overlay: true,
  config: NotesConfig,
  data: NotesData,
});
