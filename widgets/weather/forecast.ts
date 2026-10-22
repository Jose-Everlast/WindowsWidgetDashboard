// Parts of the day and weather warnings from the Open-Meteo rows. Pure, browser-safe.
import type { WeatherData } from "./manifest";
import { wmo } from "./parse";

type Hour = WeatherData["hours"][number];
type Day = WeatherData["days"][number];
type Icon = ReturnType<typeof wmo>["icon"];

export type PartKey = "morning" | "noon" | "evening" | "night";

// Contiguous windows over 24 h (start hour inclusive). Night runs over midnight.
const PARTS: Array<{ key: PartKey; label: string; from: number }> = [
  { key: "morning", label: "Morgens", from: 5 },
  { key: "noon", label: "Mittags", from: 11 },
  { key: "evening", label: "Abends", from: 17 },
  { key: "night", label: "Nachts", from: 22 },
];

export interface DayPart {
  key: PartKey;
  label: string;
  /** "heute" or "morgen", for the start of the window. */
  day: "heute" | "morgen";
  /** Warmest hour by day, coldest by night: what you feel in that part. */
  temp: number;
  code: number;
  precipProb: number;
}

const hourOf = (iso: string) => Number(iso.slice(11, 13));
const dateOf = (iso: string) => iso.slice(0, 10);

function partIndex(h: number): number {
  if (h >= 22 || h < 5) return 3;
  if (h >= 17) return 2;
  if (h >= 11) return 1;
  return 0;
}

// Worse weather wins when a part mixes conditions.
const SEVERITY: Icon[] = ["sun", "cloud-sun", "cloud", "fog", "drizzle", "rain", "snow", "storm"];
const worst = (codes: number[]) =>
  codes.reduce((a, b) => (SEVERITY.indexOf(wmo(b).icon) > SEVERITY.indexOf(wmo(a).icon) ? b : a));

/** The current part of the day and the three after it, from the hourly rows (which start at the current hour). */
export function dayParts(hours: Hour[]): DayPart[] {
  if (!hours.length) return [];
  const today = dateOf(hours[0]!.time);
  // Group consecutive hours into windows: a new window starts whenever the part changes.
  const windows: Hour[][] = [];
  let last = -1;
  for (const h of hours) {
    const p = partIndex(hourOf(h.time));
    if (p !== last) windows.push([]);
    windows.at(-1)!.push(h);
    last = p;
  }
  return windows.slice(0, 4).map(w => {
    const part = PARTS[partIndex(hourOf(w[0]!.time))]!;
    const temps = w.map(h => h.temp);
    const rainy = Math.max(...w.map(h => h.precipProb ?? 0));
    return {
      key: part.key,
      label: part.label,
      day: dateOf(w[0]!.time) === today ? "heute" : "morgen",
      temp: part.key === "night" ? Math.min(...temps) : Math.max(...temps),
      code: worst(w.map(h => h.code)),
      precipProb: rainy,
    };
  });
}

export type WarningKind = "storm" | "thunder" | "snow" | "ice";

export interface Warning {
  kind: WarningKind;
  text: string;
  /** red for storm and thunder, amber for snow and ice */
  level: "severe" | "moderate";
}

const STORM_KMH = 62; // Beaufort 8 (stürmischer Wind)
const HURRICANE_KMH = 89; // Beaufort 10
const FREEZING = new Set([56, 57, 66, 67]); // freezing drizzle and rain

const weekdayLong = (date: string) => new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(new Date(`${date}T12:00:00`));

/** "heute ab 18 Uhr", "morgen ab 3 Uhr", "in der Nacht" style for an hourly row. */
function whenHour(h: Hour, today: string): string {
  const hh = hourOf(h.time);
  return `${dateOf(h.time) === today ? "heute" : "morgen"} ab ${hh} Uhr`;
}

/** Ice, snow, storm and thunderstorm warnings: the next 36 hours by the hour, then by day. Earliest first. */
export function warnings({ hours, days }: WeatherData): Warning[] {
  const today = hours[0] ? dateOf(hours[0].time) : (days[0]?.date ?? "");
  const out: Warning[] = [];
  const seen = new Set<WarningKind>();
  const add = (w: Warning) => {
    if (seen.has(w.kind)) return;
    seen.add(w.kind);
    out.push(w);
  };

  for (const h of hours) {
    const icon = wmo(h.code).icon;
    if (icon === "storm") add({ kind: "thunder", level: "severe", text: `Gewitter ${whenHour(h, today)}` });
    if ((h.gusts ?? 0) >= STORM_KMH) {
      const peak = Math.round(Math.max(...hours.map(x => x.gusts ?? 0)));
      add({ kind: "storm", level: "severe", text: `${peak >= HURRICANE_KMH ? "Orkanböen" : "Sturmböen"} bis ${peak} km/h ${whenHour(h, today)}` });
    }
    if (icon === "snow") add({ kind: "snow", level: "moderate", text: `Schnee ${whenHour(h, today)}` });
    if (FREEZING.has(h.code) || (h.temp <= 1 && (h.precipProb ?? 0) >= 30)) {
      add({ kind: "ice", level: "moderate", text: `Glätte möglich ${whenHour(h, today)}` });
    }
  }
  // Beyond the hourly range: by day (skip today and tomorrow, the hours cover them).
  for (const d of days.slice(2) as Day[]) {
    const on = `am ${weekdayLong(d.date)}`;
    const icon = wmo(d.code).icon;
    if (icon === "storm") add({ kind: "thunder", level: "severe", text: `Gewitter ${on}` });
    if ((d.gustsMax ?? 0) >= STORM_KMH) {
      add({ kind: "storm", level: "severe", text: `${d.gustsMax! >= HURRICANE_KMH ? "Orkanböen" : "Sturmböen"} bis ${Math.round(d.gustsMax!)} km/h ${on}` });
    }
    if (icon === "snow" || (d.snowfall ?? 0) > 0) add({ kind: "snow", level: "moderate", text: `Schnee ${on}` });
    if (FREEZING.has(d.code) || (d.min <= 0 && (d.precipProb ?? 0) >= 40)) add({ kind: "ice", level: "moderate", text: `Glättegefahr ${on}` });
  }
  return out;
}
