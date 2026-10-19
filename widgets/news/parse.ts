import type { z } from "zod";
import type { ListView } from "@shared/widget-contract";

type ListItem = z.infer<typeof ListView>["items"][number];
export interface FeedItem {
  title?: string;
  link?: string;
  isoDate?: string;
}

const MAX_ITEMS = 30;
const TZ = "Europe/Berlin";
const dayKey = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, dateStyle: "short" }).format(d);

/** "08:15" today, "gestern", else "16.10.". */
export function formatMeta(iso: string | undefined, now: Date): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  if (dayKey(d) === dayKey(now)) {
    return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  }
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000))) return "gestern";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
}

/** Top items per feed, merged newest first. */
export function toListItems(
  feeds: Array<{ label: string; items: FeedItem[] }>,
  perFeed: number,
  now: Date,
): { view: "list"; items: ListItem[] } {
  const merged = feeds.flatMap(({ label, items }) =>
    items
      .filter(i => i.title?.trim())
      .slice(0, perFeed)
      .map(i => ({ item: i, label, time: i.isoDate ? new Date(i.isoDate).getTime() : 0 })),
  );
  merged.sort((a, b) => b.time - a.time);
  return {
    view: "list",
    items: merged.slice(0, MAX_ITEMS).map(({ item, label }) => {
      const meta = formatMeta(item.isoDate, now);
      const url = item.link && /^https?:\/\//.test(item.link) ? item.link : undefined;
      return { title: item.title!.trim(), subtitle: label, ...(meta && { meta }), ...(url && { url }) };
    }),
  };
}
