import { useEffect, useState } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import type { CoreData } from "./manifest";
import { formatClock, formatUptime } from "./parse";

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const C = 100; // ring center in the 200×200 viewBox
const TICKS = Array.from({ length: 72 }, (_, i) => i);

/** A progress arc from 12 o'clock, clockwise. */
function Arc({ r, percent, width, className }: { r: number; percent: number; width: number; className: string }) {
  const len = 2 * Math.PI * r;
  return (
    <>
      <circle cx={C} cy={C} r={r} fill="none" strokeWidth={width} className="stroke-line/70" />
      <circle
        cx={C}
        cy={C}
        r={r}
        fill="none"
        strokeWidth={width}
        strokeLinecap="butt"
        strokeDasharray={`${(len * percent) / 100} ${len}`}
        transform={`rotate(-90 ${C} ${C})`}
        className={`${className} transition-[stroke-dasharray] duration-700`}
      />
    </>
  );
}

function Ring({ label, cpu, mem }: { label: string; cpu: number | null; mem: number }) {
  return (
    // No CSS filter on this SVG: with turning rings inside it would be re-rendered every frame.
    <svg viewBox="0 0 200 200" className="size-32 shrink-0" aria-hidden>
      <defs>
        <radialGradient id="core-halo">
          <stop offset="70%" stopColor="rgb(34 211 238 / 0)" />
          <stop offset="85%" stopColor="rgb(34 211 238 / 0.10)" />
          <stop offset="100%" stopColor="rgb(34 211 238 / 0)" />
        </radialGradient>
        <radialGradient id="core-glow">
          <stop offset="0%" stopColor="rgb(94 231 255 / 0.55)" />
          <stop offset="60%" stopColor="rgb(34 211 238 / 0.12)" />
          <stop offset="100%" stopColor="rgb(34 211 238 / 0)" />
        </radialGradient>
      </defs>
      {/* Static tick ring */}
      {TICKS.map(i => (
        <line
          key={i}
          x1={C}
          y1={4}
          x2={C}
          y2={i % 6 === 0 ? 12 : 8}
          transform={`rotate(${i * 5} ${C} ${C})`}
          className={i % 6 === 0 ? "stroke-accent/70" : "stroke-accent/25"}
          strokeWidth={1}
        />
      ))}
      {/* Slowly turning segment rings: the only motion, transform only. */}
      <g className="hud-spin">
        <circle cx={C} cy={C} r={86} fill="none" strokeWidth={1.5} strokeDasharray="34 10 6 10" className="stroke-glow/60" />
      </g>
      <g className="hud-spin-reverse">
        <circle cx={C} cy={C} r={78} fill="none" strokeWidth={1} strokeDasharray="2 5" className="stroke-accent/50" />
      </g>
      <Arc r={68} width={6} percent={cpu ?? 0} className="stroke-glow" />
      <Arc r={57} width={4} percent={mem} className="stroke-warn/90" />
      {/* Static glow behind everything instead of a filter. */}
      <circle cx={C} cy={C} r={100} fill="url(#core-halo)" />
      <circle cx={C} cy={C} r={46} fill="url(#core-glow)" />
      <circle cx={C} cy={C} r={46} fill="none" strokeWidth={1} className="stroke-accent/40" />
      <text x={C} y={C - 4} textAnchor="middle" className="fill-fg font-display text-[15px] tracking-[0.15em]">
        {label}
      </text>
      <text x={C} y={C + 14} textAnchor="middle" className="fill-glow font-mono text-[11px]">
        {cpu === null ? "--" : `${Math.round(cpu)}%`}
      </text>
    </svg>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-0.5">
      <span className="font-display text-[0.6rem] tracking-[0.2em] text-muted">{label}</span>
      <span className={`font-mono text-sm ${tone}`}>{value}</span>
    </div>
  );
}

export default function CoreWidget({ state, config }: WidgetProps<CoreData>) {
  const { host, cpuPercent, memPercent, cores, uptimeS } = state.data;
  // config is the raw instance config; the server already validated it against CoreConfig.
  const label = typeof config.label === "string" ? config.label : "CORE";
  const { time, date } = formatClock(useClock());

  return (
    <div className="flex items-center gap-6">
      <Ring label={label} cpu={cpuPercent} mem={memPercent} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="hud-glow font-display text-4xl font-bold tracking-[0.12em] text-glow tabular-nums">{time}</span>
        <span className="font-display text-xs tracking-[0.35em] text-muted">{date}</span>
      </div>
      <div className="flex w-44 shrink-0 flex-col">
        <Readout label="CPU" value={cpuPercent === null ? "--" : `${cpuPercent.toFixed(1)} %`} tone="text-glow" />
        <Readout label="RAM" value={`${memPercent.toFixed(1)} %`} tone="text-warn" />
        <Readout label="KERNE" value={String(cores)} tone="text-fg" />
        <Readout label="UPTIME" value={formatUptime(uptimeS)} tone="text-fg" />
        <Readout label="HOST" value={host} tone="text-fg truncate" />
      </div>
    </div>
  );
}
