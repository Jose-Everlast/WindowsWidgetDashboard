import { describe, expect, it } from "vitest";
import fixture from "./fixtures/weather.json";
import type { WeatherData } from "./manifest";
import { dayParts, warnings } from "./forecast";

const data = fixture as WeatherData;

// 36 hourly rows from a given start (local time), all calm unless overridden.
function hours(startIso: string, f: (i: number, hour: number) => Partial<WeatherData["hours"][number]> = () => ({})) {
  const start = new Date(startIso);
  return Array.from({ length: 36 }, (_, i) => {
    const d = new Date(start.getTime() + i * 3600_000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
    return { time: iso, temp: 10, precipProb: 0, code: 3, gusts: 20, ...f(i, d.getHours()) };
  });
}
const day = (date: string, over: Partial<WeatherData["days"][number]> = {}): WeatherData["days"][number] => ({
  date,
  min: 5,
  max: 12,
  precipProb: 0,
  code: 3,
  sunrise: null,
  sunset: null,
  gustsMax: 30,
  snowfall: 0,
  ...over,
});
const DAYS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"].map(d => day(d));
const calm = (h: WeatherData["hours"], d = DAYS): WeatherData => ({ ...data, hours: h, days: d });

describe("dayParts", () => {
  it("starts with the current part and takes the next three", () => {
    const parts = dayParts(hours("2026-10-19T21:00"));
    expect(parts.map(p => `${p.label} ${p.day}`)).toEqual(["Abends heute", "Nachts heute", "Morgens morgen", "Mittags morgen"]);
  });

  it("uses the warmest hour by day, the coldest by night, and the worst weather", () => {
    const h = hours("2026-10-20T05:00", (_, hh) => ({
      temp: hh,
      code: hh === 13 ? 63 : 3,
      precipProb: hh === 13 ? 80 : 0,
    }));
    const [morning, noon, , night] = dayParts(h);
    expect(morning).toMatchObject({ key: "morning", temp: 10 });
    expect(noon).toMatchObject({ key: "noon", temp: 16, code: 63, precipProb: 80 });
    expect(night).toMatchObject({ key: "night", temp: 0 });
  });

  it("works on the recorded forecast", () => {
    expect(dayParts(data.hours)).toHaveLength(4);
  });
});

describe("warnings", () => {
  it("is quiet on a calm forecast", () => {
    expect(warnings(calm(hours("2026-10-19T14:00")))).toEqual([]);
  });

  it("warns of storm gusts with the peak and when they start", () => {
    const h = hours("2026-10-19T14:00", i => ({ gusts: i === 5 ? 70 : i === 6 ? 95 : 20 }));
    expect(warnings(calm(h))).toEqual([{ kind: "storm", level: "severe", text: "Orkanböen bis 95 km/h heute ab 19 Uhr" }]);
  });

  it("warns of ice when it freezes with precipitation, and of freezing rain", () => {
    const h = hours("2026-10-19T14:00", i => (i === 12 ? { temp: 0, precipProb: 40 } : {}));
    expect(warnings(calm(h))).toEqual([{ kind: "ice", level: "moderate", text: "Glätte möglich morgen ab 2 Uhr" }]);
    const fr = hours("2026-10-19T14:00", i => (i === 3 ? { code: 66 } : {}));
    expect(warnings(calm(fr))[0]).toMatchObject({ kind: "ice" });
  });

  it("warns of snow and thunderstorms, by the hour and later by day", () => {
    const h = hours("2026-10-19T14:00", i => (i === 2 ? { code: 95 } : i === 20 ? { code: 73 } : {}));
    expect(warnings(calm(h)).map(w => w.text)).toEqual(["Gewitter heute ab 16 Uhr", "Schnee morgen ab 10 Uhr"]);
    const later = DAYS.map((d, i) => (i === 3 ? { ...d, snowfall: 2 } : i === 4 ? { ...d, min: -1, precipProb: 60 } : d));
    expect(warnings(calm(hours("2026-10-19T14:00"), later)).map(w => w.text)).toEqual(["Schnee am Donnerstag", "Glättegefahr am Freitag"]);
  });

  it("finds the real storm in the recorded forecast", () => {
    const storm = warnings(data).find(w => w.kind === "storm");
    // The recording has gusts of 71.6 km/h on Friday.
    expect(storm?.text).toBe("Sturmböen bis 72 km/h am Freitag");
  });
});
