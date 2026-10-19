import Parser from "rss-parser";
import { defineCollector } from "@shared/widget-contract";
import { manifest } from "./manifest";
import { toListItems, type FeedItem } from "./parse";

// rss-parser takes no AbortSignal: its own timeout plus the scheduler timeout bound a run.
const parser = new Parser({ timeout: 15_000, headers: { "User-Agent": "windowsDashboard/0.1 (+local)" } });

export const collector = defineCollector(manifest, {
  async collect({ config, log }) {
    const results = await Promise.allSettled(config.feeds.map(f => parser.parseURL(f.url)));
    const feeds: Array<{ label: string; items: FeedItem[] }> = [];
    const failures: string[] = [];
    results.forEach((r, i) => {
      const feed = config.feeds[i]!;
      if (r.status === "fulfilled") feeds.push({ label: feed.label, items: r.value.items });
      else failures.push(`${feed.label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    });
    if (failures.length) log("Feeds fehlgeschlagen:", failures.join("; "));
    if (!feeds.length) throw new Error(`Alle Feeds fehlgeschlagen – ${failures.join("; ")}`);
    return toListItems(feeds, config.perFeed, new Date());
  },
});
