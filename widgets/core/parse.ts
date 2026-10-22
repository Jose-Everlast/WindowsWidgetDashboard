// Pure helpers for the core widget. No Node imports: Widget.tsx uses formatClock too.

export interface CpuTimes {
  idle: number;
  total: number;
}

/** Sums os.cpus() times over all cores. */
export function sumCpuTimes(cpus: Array<{ times: Record<"user" | "nice" | "sys" | "idle" | "irq", number> }>): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const { times: t } of cpus) {
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

/** Load between two samples in percent, one decimal; null without a usable previous sample. */
export function cpuPercent(prev: CpuTimes | undefined, next: CpuTimes): number | null {
  if (!prev) return null;
  const total = next.total - prev.total;
  if (total <= 0) return null;
  const busy = total - (next.idle - prev.idle);
  return Math.round(Math.min(100, Math.max(0, (busy / total) * 100)) * 10) / 10;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local time as HH:MM:SS plus a German date line, e.g. "MO 19.10.2026". */
export function formatClock(d: Date): { time: string; date: string } {
  const day = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"][d.getDay()]!;
  return {
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    date: `${day} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
  };
}

export function formatUptime(s: number): string {
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d} T ${h} h` : `${h} h ${m} min`;
}
