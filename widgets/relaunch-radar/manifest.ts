import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const RelaunchRadarConfig = z.object({
  url: z.url({ protocol: /^https?$/ }).default("http://127.0.0.1:3000"),
  dir: z.string().default("C:\\_repos\\relaunch-radar"),
  attentionLimit: z.number().int().min(1).max(20).default(5),
  notificationLimit: z.number().int().min(1).max(20).default(5),
});
export type RelaunchRadarConfig = z.infer<typeof RelaunchRadarConfig>;

export const AutopilotStatus = z.enum(["off", "running", "waiting", "paused", "idle"]);
export const AttentionKind = z.enum(["rate", "failed", "limit"]);

export const RelaunchRadarData = z.object({
  mode: z.enum(["live", "file"]),
  /** Why the widget fell back to the file. */
  apiError: z.string().optional(),
  /** Base URL of the relaunch-radar UI for deep links. */
  uiUrl: z.string(),
  // null in file mode
  autopilot: z
    .object({
      on: z.boolean(),
      status: AutopilotStatus,
      pausedUntil: z.string().nullable(),
      next: z.object({ slug: z.string(), name: z.string(), step: z.string() }).nullable(),
    })
    .nullable(),
  jobs: z
    .array(
      z.object({
        type: z.string(),
        slug: z.string().nullable(),
        name: z.string().nullable(),
        startedAt: z.string(),
        etaMin: z.number().nullable(),
      }),
    )
    .nullable(),
  attention: z
    .object({
      counts: z.object({ rate: z.number(), failed: z.number(), limit: z.number() }),
      items: z.array(
        z.object({ slug: z.string(), name: z.string(), kind: AttentionKind, text: z.string(), at: z.string().nullable() }),
      ),
    })
    .nullable(),
  notifications: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      kind: z.string(),
      slug: z.string().nullable(),
      title: z.string(),
      next: z.object({ by: z.string(), text: z.string() }),
    }),
  ),
  unread: z.number().int(),
});
export type RelaunchRadarData = z.infer<typeof RelaunchRadarData>;

export const manifest = defineManifest({
  id: "relaunch-radar",
  title: "relaunch-radar",
  version: 1,
  category: "projects",
  defaultSize: { w: 3, h: 3 },
  // SSE makes it live; polling is the safety net for missed events or a dead stream.
  intervalMs: 30_000,
  timeoutMs: 10_000,
  capabilities: ["network", "fs"],
  config: RelaunchRadarConfig,
  data: RelaunchRadarData,
});
