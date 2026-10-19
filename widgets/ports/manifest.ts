import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const PortsConfig = z.object({
  minPort: z.number().int().min(0).default(1024),
  excludeProcesses: z
    .array(z.string())
    .default(["svchost.exe", "lsass.exe", "wininit.exe", "services.exe", "spoolsv.exe", "System"]),
  // "3000" → "relaunch-radar API"
  labels: z.record(z.string().regex(/^\d+$/), z.string()).default({}),
});
export type PortsConfig = z.infer<typeof PortsConfig>;

export const PortsData = z.object({
  listeners: z.array(
    z.object({
      port: z.number().int(),
      address: z.string(),
      pid: z.number().int(),
      process: z.string().nullable(),
      label: z.string().optional(),
    }),
  ),
});
export type PortsData = z.infer<typeof PortsData>;

export const manifest = defineManifest({
  id: "ports",
  title: "Ports",
  version: 1,
  category: "system",
  defaultSize: { w: 3, h: 3 },
  intervalMs: 10_000,
  timeoutMs: 15_000,
  capabilities: ["process"],
  config: PortsConfig,
  data: PortsData,
});
