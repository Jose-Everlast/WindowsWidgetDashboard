// The accumulated chat feed (server only): a port of MessagesState/MessageItem from the Android widget hub.
// Pure functions on plain data; every function returns a new Feed and never mutates its input.
import { HttpError, notFound } from "../../server/http";
import { MAX_CHATS, MAX_DISMISSED, MAX_LINES, UNDO_MS, type App, type MessengerData } from "./manifest";

export interface Line {
  /** "wpn:<Notification.Id>" */
  id: string;
  text: string;
  /** Epoch ms of the toast's arrival. */
  at: number;
}

export interface Chat {
  /** "<appId>:<title|group|tag>", see chatKeyOf. */
  key: string;
  app: string;
  title: string;
  /** Oldest first, at most MAX_LINES. */
  lines: Line[];
  /** Read here (expanded); older lines no longer count as unread. */
  readAt: number;
}

export interface Undo {
  kind: "dismiss" | "clear" | "mute";
  chats: Chat[];
  app?: string;
  at: number;
}

export interface Feed {
  version: 1;
  /** Newest first, at most MAX_CHATS. */
  chats: Chat[];
  /** "Alle gelesen": lines up to here no longer count as unread. */
  lastSeenAt: number;
  /** Dismissed chat key → time of its newest dismissed line; older lines stay hidden when Windows still has them. */
  dismissed: Record<string, number>;
  mutedApps: string[];
  /** One step back for dismiss, clear and mute; kept on the server so the browser never sends chat data back. */
  undo: Undo | null;
}

/** One toast, already matched to an app and a chat. */
export interface FeedItem {
  id: string;
  app: string;
  key: string;
  title: string;
  text: string;
  at: number;
}

export const emptyFeed = (): Feed => ({ version: 1, chats: [], lastSeenAt: 0, dismissed: {}, mutedApps: [], undo: null });

/**
 * Status texts that messengers post like a message, e.g. WhatsApp's "Überprüfe auf neue Nachrichten" while it
 * syncs. Lowercase, compared with the whole text without a trailing ellipsis (MessageFilter.StatusTexts).
 */
export const STATUS_TEXTS = new Set([
  // German
  "überprüfe auf neue nachrichten",
  "suche nach neuen nachrichten",
  "nach neuen nachrichten suchen",
  "nachrichten werden geladen",
  "nachrichten werden abgerufen",
  "nachrichten werden synchronisiert",
  // English
  "checking for new messages",
  "looking for new messages",
  "loading messages",
  "fetching messages",
  "syncing messages",
]);

const normalize = (text: string) =>
  text
    .trim()
    .replace(/[….\s]+$/u, "")
    .trim()
    .toLowerCase();

export function isStatusText(text: string, extra: string[] = []): boolean {
  const t = normalize(text);
  return STATUS_TEXTS.has(t) || extra.some(e => normalize(e) === t);
}

/** A re-posted toast gets a new id: the same text within two minutes is the same message (ChatLine.sameMessage). */
const SAME_MESSAGE_WINDOW_MS = 2 * 60_000;
const sameMessage = (a: Line, b: Line) => a.id === b.id || (a.text === b.text && Math.abs(a.at - b.at) <= SAME_MESSAGE_WINDOW_MS);

export const latestAt = (chat: Chat): number => Math.max(...chat.lines.map(l => l.at));

/** Adds the lines not seen yet and keeps the newest MAX_LINES (MessageItem.merge). */
function mergeLines(existing: Line[], incoming: Line[]): Line[] {
  const merged = [...existing];
  for (const line of incoming) if (!merged.some(l => sameMessage(l, line))) merged.push(line);
  return merged.sort((a, b) => a.at - b.at).slice(-MAX_LINES);
}

const byLatest = (chats: Chat[]) => [...chats].sort((a, b) => latestAt(b) - latestAt(a)).slice(0, MAX_CHATS);

/** Keeps the newest marks so the map cannot grow without bound (MessagesState.capMarks). */
function capMarks(marks: Record<string, number>): Record<string, number> {
  const entries = Object.entries(marks);
  if (entries.length <= MAX_DISMISSED) return marks;
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_DISMISSED));
}

/**
 * Merges the toasts Windows currently holds into the feed. Idempotent: the same toasts twice change nothing,
 * so every poll may pass everything it reads.
 */
export function addToasts(feed: Feed, items: FeedItem[], ignoreTexts: string[] = []): Feed {
  const byKey = new Map<string, FeedItem[]>();
  for (const item of items) {
    if (!item.text.trim() || isStatusText(item.text, ignoreTexts) || feed.mutedApps.includes(item.app)) continue;
    const cutoff = feed.dismissed[item.key];
    if (cutoff !== undefined && item.at <= cutoff) continue;
    byKey.set(item.key, [...(byKey.get(item.key) ?? []), item]);
  }
  if (!byKey.size) return feed;

  const chats = new Map(feed.chats.map(c => [c.key, c]));
  for (const [key, group] of byKey) {
    const newest = group.reduce((a, b) => (b.at > a.at ? b : a));
    const lines = group.map(i => ({ id: i.id, text: i.text, at: i.at }));
    const chat = chats.get(key);
    chats.set(
      key,
      chat
        ? { ...chat, title: newest.at >= latestAt(chat) ? newest.title : chat.title, lines: mergeLines(chat.lines, lines) }
        : { key, app: newest.app, title: newest.title, lines: mergeLines([], lines), readAt: 0 },
    );
  }
  return { ...feed, chats: byLatest([...chats.values()]) };
}

function chatOf(feed: Feed, key: string): Chat {
  const chat = feed.chats.find(c => c.key === key);
  if (!chat) throw notFound("Chat");
  return chat;
}

export const unreadOf = (chat: Chat, feed: Feed): number => {
  const seen = Math.max(feed.lastSeenAt, chat.readAt);
  return chat.lines.filter(l => l.at > seen).length;
};

export function markRead(feed: Feed, key: string, now: number): Feed {
  chatOf(feed, key);
  return { ...feed, chats: feed.chats.map(c => (c.key === key ? { ...c, readAt: Math.max(c.readAt, now) } : c)) };
}

export const markAllRead = (feed: Feed, now: number): Feed => ({ ...feed, lastSeenAt: Math.max(feed.lastSeenAt, now) });

const marksFor = (chats: Chat[]) => Object.fromEntries(chats.map(c => [c.key, latestAt(c)]));

/** Removes a chat from the feed only; Windows and the app stay untouched. */
export function dismiss(feed: Feed, key: string, now: number): Feed {
  const chat = chatOf(feed, key);
  return {
    ...feed,
    chats: feed.chats.filter(c => c !== chat),
    dismissed: capMarks({ ...feed.dismissed, ...marksFor([chat]) }),
    undo: { kind: "dismiss", chats: [chat], at: now },
  };
}

export function clear(feed: Feed, now: number): Feed {
  if (!feed.chats.length) return feed;
  return { ...feed, chats: [], dismissed: capMarks({ ...feed.dismissed, ...marksFor(feed.chats) }), undo: { kind: "clear", chats: feed.chats, at: now } };
}

/** Hides an app: its chats go, its new toasts are ignored until unmute. */
export function mute(feed: Feed, app: string, now: number): Feed {
  const removed = feed.chats.filter(c => c.app === app);
  return {
    ...feed,
    chats: feed.chats.filter(c => c.app !== app),
    mutedApps: feed.mutedApps.includes(app) ? feed.mutedApps : [...feed.mutedApps, app],
    undo: { kind: "mute", app, chats: removed, at: now },
  };
}

/** Toasts of the app that Windows still holds come back with the next collect. */
export const unmute = (feed: Feed, app: string): Feed => ({ ...feed, mutedApps: feed.mutedApps.filter(a => a !== app) });

/** Puts the chats of the last dismiss, clear or mute back, merged with what arrived since (MessagesState.restore). */
export function undo(feed: Feed, now: number): Feed {
  const step = feed.undo;
  if (!step || now - step.at > UNDO_MS) throw new HttpError(409, "Nichts rückgängig zu machen");
  const chats = new Map(feed.chats.map(c => [c.key, c]));
  for (const back of step.chats) {
    const current = chats.get(back.key);
    chats.set(back.key, current ? { ...current, lines: mergeLines(back.lines, current.lines), readAt: Math.max(back.readAt, current.readAt) } : back);
  }
  const restored = new Set(step.chats.map(c => c.key));
  return {
    ...feed,
    chats: byLatest([...chats.values()]),
    dismissed: Object.fromEntries(Object.entries(feed.dismissed).filter(([k]) => !restored.has(k))),
    mutedApps: step.kind === "mute" ? feed.mutedApps.filter(a => a !== step.app) : feed.mutedApps,
    undo: null,
  };
}

/** The payload for the UI: chats with their app's label and color and ready-made unread counts. */
export function toPayload(feed: Feed, apps: App[], source: MessengerData["source"], now: number): MessengerData {
  const appOf = new Map(apps.map(a => [a.id, a]));
  const chats = feed.chats.flatMap(c => {
    const app = appOf.get(c.app);
    // An app removed from the config: its chats stay in the file but are not shown.
    if (!app) return [];
    const last = c.lines.at(-1)!;
    return [
      {
        key: c.key,
        app: app.id,
        appLabel: app.label,
        color: app.color,
        title: c.title,
        text: last.text,
        at: new Date(latestAt(c)).toISOString(),
        unread: unreadOf(c, feed),
        lines: c.lines.map(l => ({ id: l.id, text: l.text, at: new Date(l.at).toISOString() })),
      },
    ];
  });
  const step = feed.undo && now - feed.undo.at <= UNDO_MS ? feed.undo : null;
  return {
    chats,
    unread: chats.reduce((n, c) => n + c.unread, 0),
    apps: apps.map(a => ({ id: a.id, label: a.label, color: a.color, muted: feed.mutedApps.includes(a.id) })),
    undo: step && { kind: step.kind, count: step.chats.length, ...(step.app && { app: appOf.get(step.app)?.label ?? step.app }) },
    source,
  };
}
