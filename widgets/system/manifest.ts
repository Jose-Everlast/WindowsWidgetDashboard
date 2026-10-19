import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const SystemData = z.object({
  cpu: z.object({ load: z.number() }),
  mem: z.object({ usedBytes: z.number(), totalBytes: z.number() }),
  disks: z.array(z.object({ mount: z.string(), usedBytes: z.number(), sizeBytes: z.number() })),
  uptimeS: z.number(),
});
export type SystemData = z.infer<typeof SystemData>;

export const manifest = defineManifest({
  id: "system",
  title: "System",
  version: 1,
  category: "system",
  defaultSize: { w: 3, h: 3 },
  intervalMs: 5_000,
  capabilities: ["process"],
  // e.g. ["C:", "D:"]; default: all drives
  config: z.object({ drives: z.array(z.string()).optional() }),
  data: SystemData,
});
