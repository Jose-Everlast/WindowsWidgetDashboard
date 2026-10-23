// The feed of one instance in data/messages/<instance>.json (server only). Read-modify-write under one lock
// per file; written only when something changed, so a quiet poll leaves the file alone.
import { join } from "node:path";
import { z } from "zod";
import { HttpError } from "../../server/http";
import { readJsonFile, withLock, writeJsonFileAtomic } from "../../server/lib/json-file";
import { emptyFeed, type Feed } from "./feed";

const Line = z.object({ id: z.string(), text: z.string(), at: z.number() });
const Chat = z.object({ key: z.string(), app: z.string(), title: z.string(), lines: z.array(Line).min(1), readAt: z.number() });
const FeedFile = z.object({
  version: z.literal(1),
  chats: z.array(Chat),
  lastSeenAt: z.number(),
  dismissed: z.record(z.string(), z.number()),
  mutedApps: z.array(z.string()),
  undo: z
    .object({ kind: z.enum(["dismiss", "clear", "mute"]), chats: z.array(Chat), app: z.string().optional(), at: z.number() })
    .nullable(),
});

export function messagesFile(dataDir: string, instance: string): string {
  // Already kebab-case from InstanceConfig; checked again because it becomes a path.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(instance)) throw new Error(`Ungültige Instanz "${instance}"`);
  return join(dataDir, "messages", `${instance}.json`);
}

export async function loadFeed(file: string): Promise<Feed> {
  return (await readJsonFile(file, FeedFile)) ?? emptyFeed();
}

/**
 * A broken file is never overwritten. collect() reports it as a widget error ("error"); an action answers
 * 409, because the user cannot fix it by retrying.
 */
export function mutateFeed<T>(file: string, fn: (feed: Feed) => { feed: Feed; result: T }, broken: "error" | "conflict"): Promise<T> {
  return withLock(file, async () => {
    let feed: Feed;
    try {
      feed = await loadFeed(file);
    } catch (err) {
      const msg = `${err instanceof Error ? err.message : String(err)} – Datei reparieren oder entfernen`;
      throw broken === "conflict" ? new HttpError(409, msg) : new Error(msg);
    }
    const next = fn(feed);
    if (JSON.stringify(next.feed) !== JSON.stringify(feed)) await writeJsonFileAtomic(file, next.feed);
    return next.result;
  });
}
