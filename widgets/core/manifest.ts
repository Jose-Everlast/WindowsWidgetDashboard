import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const CoreConfig = z.object({
  /** Big label in the ring, e.g. a name for the machine. */
  label: z.string().max(24).default("CORE"),
});
export type CoreConfig = z.infer<typeof CoreConfig>;

export const CoreData = z.object({
  host: z.string(),
  /** null on the first run: CPU load needs two samples. */
  cpuPercent: z.number().min(0).max(100).nullable(),
  memPercent: z.number().min(0).max(100),
  cores: z.number().int().min(1),
  uptimeS: z.number().int().min(0),
});
export type CoreData = z.infer<typeof CoreData>;

export const manifest = defineManifest({
  id: "core",
  title: "Core",
  version: 1,
  category: "system",
  defaultSize: { w: 6, h: 2 },
  // Node os only (measured: ~0.2 ms per call), so a short interval is fine.
  intervalMs: 3_000,
  timeoutMs: 2_000,
  capabilities: [],
  config: CoreConfig,
  data: CoreData,
});
