import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WeatherData } from "./manifest";
import { parseForecast, wmo } from "./parse";

const raw = JSON.parse(readFileSync(new URL("./fixtures/forecast.json", import.meta.url), "utf8"));

describe("parseForecast with a real Open-Meteo response", () => {
  it("zips 12 hours and 3 days", () => {
    const data = parseForecast(raw, "Münster");
    expect(WeatherData.safeParse(data).success).toBe(true);
    expect(data.hours).toHaveLength(12);
    expect(data.days).toHaveLength(3);
    expect(data.current.temp).toBe(raw.current.temperature_2m);
    expect(data.days[0]).toMatchObject({ date: raw.daily.time[0], max: raw.daily.temperature_2m_max[0] });
    if (process.env.UPDATE_FIXTURES) {
      writeFileSync(new URL("./fixtures/weather.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
    }
  });
});

describe("wmo", () => {
  it.each([
    [0, "sun"],
    [2, "cloud-sun"],
    [3, "cloud"],
    [45, "fog"],
    [53, "drizzle"],
    [63, "rain"],
    [81, "rain"],
    [75, "snow"],
    [86, "snow"],
    [95, "storm"],
    [999, "cloud"],
  ])("code %i → %s", (code, icon) => {
    expect(wmo(code).icon).toBe(icon);
  });

  it("labels unknown codes", () => {
    expect(wmo(999).label).toBe("Unbekannt");
  });
});
