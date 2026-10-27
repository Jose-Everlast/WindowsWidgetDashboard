// The testable core of the messenger collector: read the toasts Windows holds, merge them into the
// instance's own feed and build the payload. Injectable reader and clock.
import { appsOf, chatKeyOf, matchApp } from "./apps";
import { addToasts, toPayload, type FeedItem } from "./feed";
import type { App, MessengerConfig, MessengerData } from "./manifest";
import { messagesFile, mutateFeed } from "./store";
import { parseToast } from "./toast";
import { defaultDbPath, type RawToast, type readToasts } from "./wpn";

export interface MessengerDeps {
  dataDir: string;
  readToasts: typeof readToasts;
  now: () => number;
}

export function dbPathOf(config: MessengerConfig, env: Record<string, string | undefined>): string {
  const path = config.dbPath ?? defaultDbPath(env);
  if (!path) throw new Error("LOCALAPPDATA nicht gesetzt – dbPath in der Konfiguration angeben");
  return path;
}

/** Toasts of configured apps that carry a message; every other toast is not even parsed. */
export function toFeedItems(toasts: RawToast[], apps: App[]): { items: FeedItem[]; matched: number } {
  const items: FeedItem[] = [];
  let matched = 0;
  for (const t of toasts) {
    const app = matchApp(t.primaryId, apps);
    if (!app) continue;
    matched++;
    const parsed = parseToast(t.payload);
    if (!parsed) continue;
    items.push({ id: `wpn:${t.id}`, app: app.id, key: chatKeyOf(app, { title: parsed.title, tag: t.tag, group: t.group }), title: parsed.title, text: parsed.body, at: t.at });
  }
  return { items, matched };
}

export async function collectMessenger(
  deps: MessengerDeps,
  ctx: { instance: string; config: MessengerConfig; env: Record<string, string | undefined> },
): Promise<MessengerData> {
  const { toasts, copied } = await deps.readToasts(dbPathOf(ctx.config, ctx.env));
  const apps = appsOf(ctx.config);
  const { items, matched } = toFeedItems(toasts, apps);
  return mutateFeed(
    messagesFile(deps.dataDir, ctx.instance),
    feed => {
      const next = addToasts(feed, items, ctx.config.ignoreTexts);
      return { feed: next, result: toPayload(next, apps, { toasts: matched, copied }, deps.now()) };
    },
    "error",
  );
}
