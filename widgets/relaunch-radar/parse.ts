// Pure mapping from relaunch-radar's API/file shapes to the widget payload. Also imported by
// Widget.tsx (leadUrl), so no Node APIs here.
import { z } from "zod";
import { AttentionKind, AutopilotStatus, type RelaunchRadarConfig, type RelaunchRadarData } from "./manifest";

// Lenient input schemas: only the fields we use. z.object drops unknown keys, so new fields in
// relaunch-radar never break the widget; a changed field we rely on does (and should).
const Pick = z.object({ slug: z.string(), name: z.string(), step: z.string() });

const AutopilotIn = z.object({
  on: z.boolean(),
  status: AutopilotStatus,
  pausedUntil: z.string().nullable(),
  next: Pick.nullable(),
  running: z.array(Pick.extend({ jobId: z.string(), etaMin: z.number().nullable().optional() })),
});

export const OverviewIn = z.object({
  autopilot: AutopilotIn,
  attention: z.array(
    z.object({ slug: z.string(), name: z.string(), kind: AttentionKind, text: z.string(), at: z.string().nullable() }),
  ),
});

export const JobsRunningIn = z.array(
  z.object({
    id: z.string(),
    request: z.object({ type: z.string(), slug: z.string().optional() }),
    startedAt: z.string(),
  }),
);

const NotificationIn = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.string(),
  slug: z.string().nullable(),
  title: z.string(),
  next: z.object({ by: z.string(), text: z.string() }),
});

export const FeedIn = z.object({ items: z.array(NotificationIn), unread: z.number().int() });
export const NotificationFileIn = z.object({ seenAt: z.string().nullable(), items: z.array(NotificationIn) });

export function leadUrl(uiUrl: string, slug: string): string {
  return `${uiUrl.replace(/\/+$/, "")}/lead/${encodeURIComponent(slug)}/uebersicht`;
}

const pickNotification = (n: z.infer<typeof NotificationIn>) => ({
  id: n.id,
  at: n.at,
  kind: n.kind,
  slug: n.slug,
  title: n.title,
  next: n.next,
});

export function fromApi(
  input: { overview: z.infer<typeof OverviewIn>; running: z.infer<typeof JobsRunningIn>; feed: z.infer<typeof FeedIn> },
  config: Pick<RelaunchRadarConfig, "attentionLimit" | "notificationLimit">,
  uiUrl: string,
): RelaunchRadarData {
  const { overview, running, feed } = input;
  const { autopilot } = overview;
  const byJob = new Map(autopilot.running.map(r => [r.jobId, r]));
  const counts = { rate: 0, failed: 0, limit: 0 };
  for (const a of overview.attention) counts[a.kind]++;

  return {
    mode: "live",
    uiUrl,
    autopilot: {
      on: autopilot.on,
      status: autopilot.status,
      pausedUntil: autopilot.pausedUntil,
      next: autopilot.next && { slug: autopilot.next.slug, name: autopilot.next.name, step: autopilot.next.step },
    },
    jobs: running.map(j => {
      const pick = byJob.get(j.id);
      return {
        type: j.request.type,
        slug: j.request.slug ?? null,
        name: pick?.name ?? null,
        startedAt: j.startedAt,
        etaMin: pick?.etaMin ?? null,
      };
    }),
    attention: { counts, items: overview.attention.slice(0, config.attentionLimit) },
    notifications: feed.items.slice(0, config.notificationLimit).map(pickNotification),
    unread: feed.unread,
  };
}

export function fromFile(
  file: z.infer<typeof NotificationFileIn>,
  config: Pick<RelaunchRadarConfig, "notificationLimit">,
  uiUrl: string,
  apiError: string,
): RelaunchRadarData {
  const seen = file.seenAt ? Date.parse(file.seenAt) : -Infinity;
  return {
    mode: "file",
    apiError,
    uiUrl,
    autopilot: null,
    jobs: null,
    attention: null,
    notifications: file.items.slice(0, config.notificationLimit).map(pickNotification),
    unread: file.items.filter(n => Date.parse(n.at) > seen).length,
  };
}
