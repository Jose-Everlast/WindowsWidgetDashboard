import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, type LucideIcon } from "lucide-react";
import type { WidgetProps } from "@shared/widget-contract";
import type { WeatherData } from "./manifest";
import { wmo } from "./parse";

const ICONS: Record<ReturnType<typeof wmo>["icon"], LucideIcon> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

const round = (n: number) => Math.round(n);
const weekday = (date: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(new Date(`${date}T12:00:00`));

export default function WeatherWidget({ state }: WidgetProps<WeatherData>) {
  const { label, current, hours, days } = state.data;
  const now = wmo(current.code);
  const NowIcon = ICONS[now.icon];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <NowIcon className="size-12 text-accent" strokeWidth={1.5} />
        <div>
          <div className="text-4xl font-light tabular-nums">{round(current.temp)}°</div>
          <div className="text-sm text-muted">
            {now.label} · gefühlt {round(current.apparent)}° · {round(current.wind)} km/h
          </div>
        </div>
        <div className="ml-auto self-start text-sm text-muted">{label}</div>
      </div>

      <div className="grid grid-cols-6 gap-1 text-center text-xs text-muted">
        {hours.filter((_, i) => i % 2 === 0).map(h => {
          const Icon = ICONS[wmo(h.code).icon];
          return (
            <div key={h.time} className="flex flex-col items-center gap-0.5">
              <span>{h.time.slice(11, 13)}h</span>
              <Icon className="size-4 text-fg" />
              <span className="text-fg tabular-nums">{round(h.temp)}°</span>
              {h.precipProb !== null && h.precipProb > 0 && <span className="text-accent">{h.precipProb}%</span>}
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-1 text-sm">
        {days.map(d => {
          const Icon = ICONS[wmo(d.code).icon];
          return (
            <div key={d.date} className="flex items-center gap-2">
              <span className="w-8 text-muted">{weekday(d.date)}</span>
              <Icon className="size-4" />
              <span className="ml-auto tabular-nums text-muted">{round(d.min)}°</span>
              <span className="w-8 text-right tabular-nums">{round(d.max)}°</span>
              <span className="w-10 text-right text-xs text-accent">{d.precipProb ? `${d.precipProb}%` : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
