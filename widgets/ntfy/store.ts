// Tile state in data/ntfy/<instance>.json (server only): topics added in the tile and hidden messages.
// Config topics stay in dashboard.config.json and are never written here. ntfy itself is never changed.
import { join } from "node:path";
import { z } from "zod";
import { HttpError, notFound } from "../../server/http";
import { readJsonFile, withLock, writeJsonFileAtomic } from "../../server/lib/json-file";
import { MAX_TOPICS, Topic, type NtfyMessage, type TopicEntry } from "./manifest";

// ntfy.sh keeps messages 12 h; a week covers self-hosted caches too, then dismissed ids are dropped.
export const DISMISS_KEEP_MS = 7 * 24 * 3600_000;
const MAX_DISMISSED = 1000;

const Dismissed = z.object({ id: z.string(), at: z.iso.datetime() });
const StateFile = z.object({
  version: z.literal(1),
  topics: z.array(Topic),
  // Added after the first release: older files have neither.
  dismissed: z.array(Dismissed).default([]),
  /** "Alle ausblenden": messages up to this time stay hidden. */
  clearedAt: z.iso.datetime().nullable().default(null),
});
export type TileState = Omit<z.output<typeof StateFile>, "version">;
const EMPTY: TileState = { topics: [], dismissed: [], clearedAt: null };

export function stateFile(dataDir: string, instance: string): string {
  // Already kebab-case from InstanceConfig; checked again because it becomes a path.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(instance)) throw new Error(`Ungültige Instanz "${instance}"`);
  return join(dataDir, "ntfy", `${instance}.json`);
}

export async function loadState(file: string): Promise<TileState> {
  const s = await readJsonFile(file, StateFile);
  return s ? { topics: s.topics, dismissed: s.dismissed, clearedAt: s.clearedAt } : EMPTY;
}

/** Config topics first (fixed), then the tile's own ones; duplicates count once, as fixed. */
export function mergeTopics(fixed: string[], added: string[]): TopicEntry[] {
  const seen = new Set(fixed);
  return [
    ...fixed.map(name => ({ name, removable: false })),
    ...added.filter(t => !seen.has(t) && seen.add(t)).map(name => ({ name, removable: true })),
  ];
}

export function addTopic(fixed: string[], added: string[], topic: string): string[] {
  if (fixed.includes(topic) || added.includes(topic)) throw new HttpError(409, `Topic "${topic}" ist schon eingetragen`);
  if (mergeTopics(fixed, added).length >= MAX_TOPICS) throw new HttpError(409, `Höchstens ${MAX_TOPICS} Topics`);
  return [...added, topic];
}

export function removeTopic(fixed: string[], added: string[], topic: string): string[] {
  if (fixed.includes(topic)) throw new HttpError(409, "Topics aus dashboard.config.json lassen sich nur dort entfernen");
  if (!added.includes(topic)) throw notFound("Topic");
  return added.filter(t => t !== topic);
}

/** Adds an id once and drops entries older than DISMISS_KEEP_MS (their messages are gone from ntfy). */
export function dismiss(state: TileState, id: string, now: Date): TileState {
  const cutoff = now.getTime() - DISMISS_KEEP_MS;
  const kept = state.dismissed.filter(d => d.id !== id && Date.parse(d.at) > cutoff);
  return { ...state, dismissed: [...kept, { id, at: now.toISOString() }].slice(-MAX_DISMISSED) };
}

/** Hides everything up to `until` (the newest message shown); single dismissals become redundant. */
export const dismissAll = (state: TileState, until: string): TileState => ({
  ...state,
  dismissed: [],
  clearedAt: state.clearedAt && state.clearedAt > until ? state.clearedAt : until,
});

export const restoreAll = (state: TileState): TileState => ({ ...state, dismissed: [], clearedAt: null });

/** Visible messages plus how many are hidden. */
export function applyDismissed(messages: NtfyMessage[], state: TileState): { messages: NtfyMessage[]; hidden: number } {
  const ids = new Set(state.dismissed.map(d => d.id));
  const visible = messages.filter(m => !ids.has(m.id) && !(state.clearedAt && m.at <= state.clearedAt));
  return { messages: visible, hidden: messages.length - visible.length };
}

/** A broken file throws before anything is written: it is never overwritten. */
export function mutateState(file: string, fn: (state: TileState) => TileState): Promise<void> {
  return withLock(file, async () => {
    const next = fn(await loadState(file));
    await writeJsonFileAtomic(file, { version: 1, ...next });
  });
}
