import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

// https://docs.ntfy.sh/publish/#message-priority: 1 min … 3 default … 5 max
export const NtfyMessage = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  topic: z.string(),
  title: z.string().nullable(),
  text: z.string(),
  priority: z.number().int().min(1).max(5),
  tags: z.array(z.string()),
  click: z.url({ protocol: /^https?$/ }).nullable(),
});
export type NtfyMessage = z.infer<typeof NtfyMessage>;

export const MAX_TOPICS = 20;

// ntfy topic names: https://docs.ntfy.sh/publish/ (letters, digits, "-" and "_", at most 64)
export const Topic = z.string().regex(/^[-_A-Za-z0-9]{1,64}$/, "ntfy-Topic: nur Buchstaben, Ziffern, - und _ (höchstens 64)");

/** removable: added in the tile; config topics are fixed. */
export const TopicEntry = z.object({ name: Topic, removable: z.boolean() });
export type TopicEntry = z.infer<typeof TopicEntry>;

export const NtfyData = z.object({
  topics: z.array(TopicEntry).max(MAX_TOPICS),
  messages: z.array(NtfyMessage).max(50),
  /** Messages in the fetched window that the user dismissed. */
  hidden: z.number().int().min(0),
});
export type NtfyData = z.infer<typeof NtfyData>;

// Action inputs (browser input, strict)
export const TopicIn = z.strictObject({ topic: Topic });
// ntfy message ids are short alphanumeric strings (12 chars on ntfy.sh)
export const DismissIn = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9]{1,64}$/) });
/** until: time of the newest message shown, so one that arrives meanwhile stays visible. */
export const DismissAllIn = z.strictObject({ until: z.iso.datetime() });

export const manifest = defineManifest({
  id: "ntfy",
  title: "ntfy",
  version: 3,
  category: "comms",
  defaultSize: { w: 3, h: 3 },
  // The SSE subscription triggers a collect on every message; the poll is only a safety net.
  intervalMs: 300_000,
  capabilities: ["network"],
  config: z.object({
    server: z.url({ protocol: /^https?$/ }).default("https://ntfy.sh"),
    // Fixed topics; more can be added in the tile (data/ntfy/<instance>.json).
    topics: z.array(Topic).max(MAX_TOPICS).default([]),
    // ntfy duration ("12h", "2d"); the server keeps messages for 12 h on ntfy.sh.
    since: z.string().regex(/^\d+[smhd]$/).default("12h"),
    max: z.number().int().min(1).max(50).default(20),
  }),
  data: NtfyData,
});
