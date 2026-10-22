import { cpus, freemem, hostname, totalmem, uptime } from "node:os";
import { defineCollector } from "@shared/widget-contract";
import { manifest } from "./manifest";
import { cpuPercent, sumCpuTimes, type CpuTimes } from "./parse";

// CPU load is the difference between two samples; the previous one lives here between polls.
let prev: CpuTimes | undefined;

export const collector = defineCollector(manifest, {
  async collect() {
    const list = cpus();
    const sample = sumCpuTimes(list);
    const cpu = cpuPercent(prev, sample);
    prev = sample;
    const total = totalmem();
    return {
      host: hostname(),
      cpuPercent: cpu,
      // freemem() is the "available" memory from Task Manager (no si.mem(): ~94 s here).
      memPercent: Math.round(((total - freemem()) / total) * 1000) / 10,
      cores: Math.max(1, list.length),
      uptimeS: Math.round(uptime()),
    };
  },
});
