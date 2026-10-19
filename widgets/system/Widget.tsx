import type { WidgetProps } from "@shared/widget-contract";
import type { SystemData } from "./manifest";

const GB = 1024 ** 3;
const gb = (bytes: number) => (bytes / GB).toFixed(bytes < 10 * GB ? 1 : 0);

function uptime(s: number): string {
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} T ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

function Bar({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const tone = percent >= 90 ? "bg-bad" : percent >= 75 ? "bg-warn" : "bg-accent";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {Math.round(percent)} % · {detail}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

export default function SystemWidget({ state }: WidgetProps<SystemData>) {
  const { cpu, mem, disks, uptimeS } = state.data;
  return (
    <div className="flex h-full flex-col gap-3">
      <Bar label="CPU" percent={cpu.load} detail="Last" />
      <Bar label="RAM" percent={(mem.usedBytes / mem.totalBytes) * 100} detail={`${gb(mem.usedBytes)} / ${gb(mem.totalBytes)} GB`} />
      {disks.map(d => (
        <Bar
          key={d.mount}
          label={d.mount}
          percent={d.sizeBytes ? (d.usedBytes / d.sizeBytes) * 100 : 0}
          detail={`${gb(d.sizeBytes - d.usedBytes)} GB frei`}
        />
      ))}
      <div className="mt-auto text-xs text-muted">Läuft seit {uptime(uptimeS)}</div>
    </div>
  );
}
