import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const PortsConfig = z.object({
  minPort: z.number().int().min(0).default(1024),
  excludeProcesses: z
    .array(z.string())
    .default(["svchost.exe", "lsass.exe", "wininit.exe", "services.exe", "spoolsv.exe", "System"]),
  // "3000" → "relaunch-radar API"
  labels: z.record(z.string().regex(/^\d+$/), z.string()).default({}),
  /** Offer a stop button per port (two clicks, re-checked on the server). */
  allowStop: z.boolean().default(true),
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
      /** Not protected and not the dashboard itself, see stopBlocker. */
      stoppable: z.boolean(),
    }),
  ),
});
export type PortsData = z.infer<typeof PortsData>;

/** Input of the stop action: browser input, the server re-checks all of it before the kill. */
export const StopIn = z.strictObject({
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  process: z.string().min(1).max(260),
});
export type StopIn = z.infer<typeof StopIn>;

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
