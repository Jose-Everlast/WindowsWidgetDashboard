import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";
import { DEFAULT_APPS, appsOf } from "./apps";

export const MAX_CHATS = 50;
export const MAX_LINES = 10;
export const MAX_DISMISSED = 200;
export const MAX_TEXT = 2000;
/** How long "Rückgängig" stays possible after dismiss, clear or mute. */
export const UNDO_MS = 5 * 60_000;
/** Chat keys contain the chat name; bounded so a key from the browser stays small. */
export const MAX_KEY = 400;

const AppId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case erwartet, z. B. whatsapp");
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex-Farbe erwartet, z. B. #25d366");

export const App = z.object({
  id: AppId,
  label: z.string().min(1),
  /** Substrings of the AppUserModelID (NotificationHandler.PrimaryId), case-insensitive; the first app that matches wins. */
  match: z.array(z.string().min(1)).min(1),
  color: Color.default("#93b6c6"),
  /** What makes two toasts the same chat: the toast title (chat or sender name), its Group or its Tag. */
  chatKey: z.enum(["title", "group", "tag"]).default("title"),
});
export type App = z.output<typeof App>;

export const MessengerConfig = z.object({
  /** Default: %LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db */
  dbPath: z.string().min(1).optional(),
  apps: z
    .array(App)
    .min(1)
    .refine(a => new Set(a.map(x => x.id)).size === a.length, "App-IDs müssen eindeutig sein")
    .default(DEFAULT_APPS),
  /** Narrow the apps by ID, so one app can get its own tile: { only: ["slack"] } here, { except: ["slack"] } there. */
  only: z.array(AppId).min(1).optional(),
  except: z.array(AppId).optional(),
  /** Extra status texts to hide (whole text, case-insensitive), e.g. an app's own "running in the background". */
  ignoreTexts: z.array(z.string().min(1)).default([]),
})
  .refine(c => [...(c.only ?? []), ...(c.except ?? [])].every(id => c.apps.some(a => a.id === id)), {
    message: "only/except nennen eine App, die nicht in apps steht",
  })
  .refine(c => appsOf(c).length > 0, { message: "only/except lassen keine App übrig" });
export type MessengerConfig = z.output<typeof MessengerConfig>;

const Iso = z.string();

export const ChatLine = z.object({ id: z.string(), text: z.string().max(MAX_TEXT), at: Iso });

export const ChatSummary = z.object({
  key: z.string().max(MAX_KEY),
  app: AppId,
  appLabel: z.string(),
  color: Color,
  title: z.string(),
  /** Latest message. */
  text: z.string().max(MAX_TEXT),
  at: Iso,
  unread: z.number().int().min(0),
  /** Oldest first. */
  lines: z.array(ChatLine).max(MAX_LINES),
});
export type ChatSummary = z.infer<typeof ChatSummary>;

export const MessengerData = z.object({
  /** Newest first. */
  chats: z.array(ChatSummary).max(MAX_CHATS),
  unread: z.number().int().min(0),
  apps: z.array(z.object({ id: AppId, label: z.string(), color: Color, muted: z.boolean() })),
  /** What "Rückgängig" would bring back; null when there is nothing (or it expired). */
  undo: z.object({ kind: z.enum(["dismiss", "clear", "mute"]), count: z.number().int().min(0), app: z.string().optional() }).nullable(),
  source: z.object({
    /** Toasts of the configured apps currently in the Windows database. */
    toasts: z.number().int().min(0),
    /** The database was locked and a copy was read. */
    copied: z.boolean(),
  }),
});
export type MessengerData = z.infer<typeof MessengerData>;

// Action inputs come from the browser: strict, so unknown fields are rejected instead of ignored.
export const KeyIn = z.strictObject({ key: z.string().min(1).max(MAX_KEY) });
export const AppIn = z.strictObject({ app: AppId });
export const EmptyIn = z.strictObject({});

export const manifest = defineManifest({
  id: "messenger",
  title: "Nachrichten",
  version: 1,
  category: "comms",
  defaultSize: { w: 3, h: 3 },
  // The folder watch triggers a collect on every new toast; polling is the safety net.
  intervalMs: 30_000,
  timeoutMs: 10_000,
  capabilities: ["fs"],
  config: MessengerConfig,
  data: MessengerData,
});
