import { z } from "zod";
import { WidgetView, defineManifest } from "@shared/widget-contract";

export const manifest = defineManifest({
  id: "external",
  title: "Extern",
  version: 1,
  category: "projects",
  defaultSize: { w: 3, h: 2 },
  intervalMs: 30_000,
  capabilities: ["network", "fs"],
  config: z.union([
    z.object({ url: z.url({ protocol: /^https?$/ }) }),
    z.object({ file: z.string().min(1) }),
  ]),
  // The view variant comes from the payload itself, so manifest.view stays unset.
  data: WidgetView,
});
