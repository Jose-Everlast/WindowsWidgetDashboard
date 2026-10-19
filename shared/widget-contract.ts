// The widget contract shared by server, web and every widgets/<id>/ folder.
// Only zod may be imported here: this file is bundled into the browser too.
import { z } from "zod";

export const WIDGET_CATEGORIES = ["daily", "comms", "projects", "system", "ai"] as const;
export const CAPABILITIES = ["network", "fs", "powershell", "process", "ai"] as const;
export const VIEW_TYPES = ["stat", "list", "progress", "status", "markdown"] as const;
export type WidgetViewType = (typeof VIEW_TYPES)[number];
export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];
export type Capability = (typeof CAPABILITIES)[number];

export type WidgetStatus = "ok" | "stale" | "unconfigured" | "error";

export interface WidgetManifest<C extends z.ZodType = z.ZodType, T extends z.ZodType = z.ZodType> {
  /** Equals the folder name, kebab-case. */
  id: string;
  title: string;
  /** Integer >= 1; bump on incompatible payload changes. */
  version: number;
  category: WidgetCategory;
  /** Size in grid cells. */
  defaultSize: { w: 1 | 2 | 3 | 4 | 5 | 6; h: 1 | 2 | 3 | 4 };
  /** Default poll interval; an instance may override it. */
  intervalMs: number;
  /** Per-run timeout, default 20 s. */
  timeoutMs?: number;
  /** Schema of the instance config in dashboard.config.json. */
  config: C;
  /** Schema of the payload returned by collect(). */
  data: T;
  /** Required .env variables; missing ones make the instance "unconfigured". */
  env?: string[];
  capabilities: Capability[];
  /** Hint that the payload is a generic WidgetView of this type. */
  view?: WidgetViewType;
}

export interface CollectContext<C> {
  config: C;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
  log: (...args: unknown[]) => void;
}

export interface SubscribeContext<C> {
  config: C;
  env: Record<string, string | undefined>;
  /** Aborted when the scheduler stops. */
  signal: AbortSignal;
  log: (...args: unknown[]) => void;
  /** Ask for an immediate collect(); debounced by the scheduler. Push never carries data itself. */
  refresh: () => void;
}

export interface WidgetCollector<C, T> {
  collect(ctx: CollectContext<C>): Promise<T>;
  /**
   * Optional push trigger (SSE, file watch): call ctx.refresh() when the source changed.
   * Data still comes only through collect(). Clean up via ctx.signal or the returned function.
   */
  subscribe?(ctx: SubscribeContext<C>): void | (() => void);
  /** Extra actions; "refresh" is built in and provided by the scheduler. */
  actions?: Record<string, (ctx: CollectContext<C>, input: unknown) => Promise<unknown>>;
}

export const defineManifest = <C extends z.ZodType, T extends z.ZodType>(m: WidgetManifest<C, T>) => m;

export const defineCollector = <C extends z.ZodType, T extends z.ZodType>(
  _manifest: WidgetManifest<C, T>,
  collector: WidgetCollector<z.output<C>, z.input<T>>,
) => collector;

export interface WidgetState<T = unknown> {
  instance: string;
  type: string;
  status: WidgetStatus;
  /** ISO time of the last successful data. */
  updatedAt: string | null;
  /** ISO time of the last attempt. */
  checkedAt: string | null;
  /** On "stale" the last good data is kept. */
  data: T | null;
  error?: string;
}

// ---- Generic views (zod, because the external widget validates foreign JSON) ----

export const Tone = z.enum(["neutral", "good", "warn", "bad"]);
export type Tone = z.infer<typeof Tone>;

const httpUrl = z.url({ protocol: /^https?$/ });

export const StatView = z.object({
  view: z.literal("stat"),
  items: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().optional(),
        trend: z.enum(["up", "down"]).optional(),
        tone: Tone.optional(),
      }),
    )
    .max(12),
});

export const ListView = z.object({
  view: z.literal("list"),
  items: z
    .array(
      z.object({
        title: z.string(),
        subtitle: z.string().optional(),
        meta: z.string().optional(),
        url: httpUrl.optional(),
        tone: Tone.optional(),
      }),
    )
    .max(50),
});

export const ProgressView = z.object({
  view: z.literal("progress"),
  items: z
    .array(z.object({ label: z.string(), percent: z.number().min(0).max(100), caption: z.string().optional() }))
    .max(12),
});

export const StatusView = z.object({
  view: z.literal("status"),
  items: z
    .array(
      z.object({
        label: z.string(),
        state: z.enum(["ok", "warn", "error", "idle"]),
        detail: z.string().optional(),
      }),
    )
    .max(30),
});

export const MarkdownView = z.object({ view: z.literal("markdown"), text: z.string().max(5000) });

export const WidgetView = z.discriminatedUnion("view", [StatView, ListView, ProgressView, StatusView, MarkdownView]);
export type WidgetView = z.infer<typeof WidgetView>;

// ---- dashboard.config.json ----

export const InstanceConfig = z.object({
  instance: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case erwartet, z. B. wetter-muenster"),
  type: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  // Default: manifest.defaultSize
  w: z.number().int().min(1).optional(),
  h: z.number().int().min(1).optional(),
  title: z.string().optional(),
  intervalMs: z.number().int().min(1000).optional(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type InstanceConfig = z.infer<typeof InstanceConfig>;

const GRID_DEFAULTS = { columns: 12, rows: 8, gapPx: 12, reserveLeftPx: 0, reserveTopPx: 0 };

export const DashboardConfig = z.object({
  grid: z
    .object({
      columns: z.number().int().min(1).default(GRID_DEFAULTS.columns),
      rows: z.number().int().min(1).default(GRID_DEFAULTS.rows),
      gapPx: z.number().int().min(0).default(GRID_DEFAULTS.gapPx),
      // Room for desktop icons
      reserveLeftPx: z.number().int().min(0).default(GRID_DEFAULTS.reserveLeftPx),
      reserveTopPx: z.number().int().min(0).default(GRID_DEFAULTS.reserveTopPx),
    })
    .default(GRID_DEFAULTS),
  widgets: z.array(InstanceConfig),
});
export type DashboardConfig = z.infer<typeof DashboardConfig>;

/** Props of every widgets/<id>/Widget.tsx. */
export interface WidgetProps<T> {
  state: WidgetState<T> & { data: T };
  config: Record<string, unknown>;
}

/** Required variables that are missing or empty. */
export function missingEnv(required: string[] | undefined, env: Record<string, string | undefined>): string[] {
  return (required ?? []).filter(name => !env[name]?.trim());
}
