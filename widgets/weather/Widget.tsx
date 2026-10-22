import { CloudLightning, Droplets, MapPin, Snowflake, TriangleAlert, Waves, Wind, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import { dayParts, warnings, type Warning } from "./forecast";
import { iconUrl } from "./icons";
import type { WeatherData } from "./manifest";
import { wmo } from "./parse";
import { phaseAt } from "./sky";

const ICE = "#9cc8ff";

const r = (n: number) => Math.round(n);
const weekday = (date: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "");

/** Day or night for the icons follows the clock: once a minute is enough. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Composition box (px): the glass orb, the parts of the day on an arc right around it, the days on a wider one.
const BOX = { w: 320, h: 262 };
const C = { x: 160, y: 62 };
const ORB_R = 54;
const INNER_R = 88;
const OUTER_R = 142;
// Lower half: angles in degrees, 180 = left, 270 = straight down, 360 = right.
const FROM = 198;
const TO = 342;

const at = (radius: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C.x + radius * Math.cos(a), y: C.y - radius * Math.sin(a) };
};
const angles = (n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 270 : FROM + ((TO - FROM) * i) / (n - 1)));
/** SVG path of the lower arc between FROM and TO. */
const arcPath = (radius: number) => {
  const a = at(radius, FROM - 8);
  const b = at(radius, TO + 8);
  return `M${a.x},${a.y} A${radius},${radius} 0 0 0 ${b.x},${b.y}`;
};

interface Stop {
  key: string;
  label: string;
  icon: string;
  temp: string;
  low?: string;
  precip: number;
}

/** A forecast hanging below its glowing point on the arc. */
function ArcStop({ s, radius, deg, small }: { s: Stop; radius: number; deg: number; small?: boolean }) {
  const p = at(radius, deg);
  return (
    <>
      <span
        aria-hidden
        className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        style={{ left: p.x, top: p.y, boxShadow: `0 0 0 1.5px ${ICE}55, 0 0 8px 1px ${ICE}` }}
      />
      <div className="absolute flex w-14 -translate-x-1/2 flex-col items-center pt-1.5 text-center" style={{ left: p.x, top: p.y }}>
        <span className={`${small ? "text-[0.6rem]" : "text-[0.65rem]"} leading-none text-white/65`}>{s.label}</span>
        <img src={s.icon} alt="" className={small ? "-my-0.5 size-7" : "-my-0.5 size-8"} />
        <span className={`${small ? "text-[0.7rem]" : "text-xs"} leading-none font-light tabular-nums`}>
          {s.low && <span className="text-white/50">{s.low}/</span>}
          {s.temp}
        </span>
        {s.precip >= 30 && (
          <span className="pt-0.5 text-[0.55rem] leading-none" style={{ color: ICE }}>
            {s.precip}%
          </span>
        )}
      </div>
    </>
  );
}

/** The glass orb: dark blue glass with a highlight, a glowing ring, the condition and the temperature inside. */
function Orb({ code, night, temp }: { code: number; night: boolean; temp: number }) {
  const size = ORB_R * 2;
  return (
    <div className="absolute" style={{ left: C.x - ORB_R, top: C.y - ORB_R, width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.22), transparent 34%), radial-gradient(circle at 50% 62%, #1d3263, #0a1430 62%, #050a1a)",
          boxShadow: "0 10px 30px rgb(0 0 0 / 0.55), inset 0 -10px 24px rgb(120 170 255 / 0.18)",
        }}
      />
      {/* The ring glows strongest on the left and at the bottom, like light caught in the glass. */}
      <svg viewBox="0 0 100 100" className="absolute -inset-1 size-[calc(100%+0.5rem)] overflow-visible" style={{ filter: `drop-shadow(0 0 4px ${ICE})` }} aria-hidden>
        <defs>
          <linearGradient id="orb-glass-ring" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="35%" stopColor={ICE} stopOpacity="0.9" />
            <stop offset="75%" stopColor={ICE} stopOpacity="0.15" />
            <stop offset="100%" stopColor={ICE} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <circle cx={50} cy={50} r={48.5} fill="none" stroke="url(#orb-glass-ring)" strokeWidth={1.4} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <img src={iconUrl(code, night)} alt={wmo(code).label} className="-mt-3 -mb-2 size-14 drop-shadow-[0_4px_10px_rgb(0_0_0/0.5)]" />
        <span className="text-4xl leading-none font-light tabular-nums">
          {r(temp)}
          <span className="align-top text-lg">°</span>
        </span>
      </div>
    </div>
  );
}

const WARN_ICON: Record<Warning["kind"], LucideIcon> = { storm: Wind, thunder: CloudLightning, snow: Snowflake, ice: TriangleAlert };

/** Mockup 1: place and condition on top, the glass orb, values beside it, the forecast on arcs around it. */
export default function WeatherWidget({ state }: WidgetProps<WeatherData>) {
  const data = state.data;
  const night = phaseAt(data, useMinute()) === "night";
  const w = wmo(data.current.code);
  const [today, ...rest] = data.days;
  const list = warnings(data);

  const parts: Stop[] = dayParts(data.hours).map(p => ({
    key: `${p.key}-${p.day}`,
    label: p.label,
    icon: iconUrl(p.code, p.key === "night" || p.key === "evening"),
    temp: `${r(p.temp)}°`,
    precip: p.precipProb,
  }));
  const days: Stop[] = rest.slice(0, 5).map(d => ({
    key: d.date,
    label: weekday(d.date),
    icon: iconUrl(d.code),
    temp: `${r(d.max)}°`,
    low: `${r(d.min)}°`,
    precip: d.precipProb ?? 0,
  }));
  const values: Array<{ Icon: LucideIcon; label: string; value: string }> = [
    { Icon: Droplets, label: "Regen", value: `${today?.precipProb ?? 0} %` },
    { Icon: Wind, label: "Wind", value: `${r(data.current.wind)} km/h` },
    ...(data.current.humidity !== null ? [{ Icon: Waves, label: "Luft", value: `${r(data.current.humidity)} %` }] : []),
  ];

  return (
    // Header, orb and warnings share the width of the composition, so H/T sits above the values like in the mockup.
    <div className="mx-auto flex flex-col gap-1" style={{ width: BOX.w }}>
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1 text-sm">
            <MapPin className="size-3.5" style={{ color: ICE }} aria-hidden /> {data.label}
          </span>
          <span className="truncate pl-[1.125rem] text-xs text-white/60">{w.label}</span>
        </div>
        {today && (
          <span className="shrink-0 pt-0.5 text-xs text-white/60 tabular-nums">
            H {r(today.max)}° / T {r(today.min)}°
          </span>
        )}
      </div>

      <div className="relative" style={{ width: BOX.w, height: BOX.h }}>
        <svg width={BOX.w} height={BOX.h} className="absolute inset-0 overflow-visible" style={{ filter: `drop-shadow(0 0 3px ${ICE}aa)` }} aria-hidden>
          <defs>
            <linearGradient id="arc-glass" x1="0" x2="1">
              <stop offset="0%" stopColor={ICE} stopOpacity="0" />
              <stop offset="20%" stopColor={ICE} stopOpacity="0.85" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="80%" stopColor={ICE} stopOpacity="0.85" />
              <stop offset="100%" stopColor={ICE} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={arcPath(INNER_R)} fill="none" stroke="url(#arc-glass)" strokeWidth={1.2} />
          <path d={arcPath(OUTER_R)} fill="none" stroke="url(#arc-glass)" strokeOpacity={0.45} strokeWidth={1} />
        </svg>

        <Orb code={data.current.code} night={night} temp={data.current.temp} />

        <div className="absolute top-3 right-0 flex flex-col gap-1.5 text-[0.7rem]">
          {values.map(({ Icon, label, value }) => (
            <span key={label} className="flex items-center gap-1.5 text-white/80">
              <Icon className="size-3.5 shrink-0" style={{ color: ICE }} aria-hidden />
              <span className="text-white/50">{label}</span>
              <span className="tabular-nums">{value}</span>
            </span>
          ))}
        </div>

        {parts.map((s, i) => (
          <ArcStop key={s.key} s={s} radius={INNER_R} deg={angles(parts.length)[i]!} />
        ))}
        {days.map((s, i) => (
          <ArcStop key={s.key} s={s} radius={OUTER_R} deg={angles(days.length)[i]!} small />
        ))}
      </div>

      {list.length > 0 && (
        <div role="alert" className="flex flex-wrap justify-center gap-1.5">
          {list.map(x => {
            const Icon = WARN_ICON[x.kind];
            return (
              <span
                key={x.kind}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] ring-1 ${
                  x.level === "severe" ? "bg-[#ff5d73]/12 text-[#ffa3af] ring-[#ff5d73]/40" : "bg-[#ffc857]/10 text-[#ffdc94] ring-[#ffc857]/35"
                }`}
              >
                <Icon className="size-3" aria-hidden /> {x.text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
