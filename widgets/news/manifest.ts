import { z } from "zod";
import { ListView, defineManifest } from "@shared/widget-contract";

export const manifest = defineManifest({
  id: "news",
  title: "News",
  version: 1,
  category: "daily",
  defaultSize: { w: 6, h: 3 },
  intervalMs: 900_000,
  capabilities: ["network"],
  view: "list",
  config: z.object({
    feeds: z.array(z.object({ label: z.string(), url: z.url() })).min(1),
    perFeed: z.number().int().min(1).max(20).default(5),
  }),
  data: ListView,
});
