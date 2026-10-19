import { freemem, totalmem } from "node:os";
import si from "systeminformation";
import { defineCollector } from "@shared/widget-contract";
import { manifest, type SystemData } from "./manifest";

// fsSize() shells out to PowerShell/WMI on Windows (~0.5–1 s): refresh it at most once a minute.
const DISK_TTL_MS = 60_000;
let diskCache: { at: number; disks: SystemData["disks"] } | undefined;

async function disks(): Promise<SystemData["disks"]> {
  if (diskCache && Date.now() - diskCache.at < DISK_TTL_MS) return diskCache.disks;
  const fs = await si.fsSize();
  const list = fs.map(d => ({ mount: d.mount, usedBytes: d.used, sizeBytes: d.size }));
  diskCache = { at: Date.now(), disks: list };
  return list;
}

export const collector = defineCollector(manifest, {
  async collect({ config }) {
    const [load, allDisks] = await Promise.all([si.currentLoad(), disks()]);
    const wanted = config.drives?.map(d => d.toUpperCase());
    // Not si.mem(): it took ~94 s on Windows 11 here. os.freemem() is the "available" memory
    // from Task Manager, so total - free is the memory in use without the standby cache.
    const total = totalmem();
    return {
      cpu: { load: Math.round(load.currentLoad * 10) / 10 },
      mem: { usedBytes: total - freemem(), totalBytes: total },
      disks: wanted ? allDisks.filter(d => wanted.includes(d.mount.toUpperCase())) : allDisks,
      uptimeS: Math.round(si.time().uptime),
    };
  },
});
