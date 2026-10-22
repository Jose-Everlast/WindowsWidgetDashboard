import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WeatherData } from "./manifest";
import { parseForecast, wmo } from "./parse";

const raw = JSON.parse(readFileSync(new URL("./fixtures/forecast.json", import.meta.url), "utf8"));

describe("parseForecast with a real Open-Meteo response", () => {
  it("zips 36 hours and 6 days", () => {
    const data = parseForecast(raw, "Münster");
    expect(WeatherData.safeParse(data).success).toBe(true);
    expect(data.hours).toHaveLength(36);
    expect(data.days).toHaveLength(6);
    expect(data.hours[0]!.gusts).toBe(raw.hourly.wind_gusts_10m[0]);
    expect(data.days[1]).toMatchObject({ gustsMax: raw.daily.wind_gusts_10m_max[1], snowfall: raw.daily.snowfall_sum[1] });
    expect(data.current.temp).toBe(raw.current.temperature_2m);
    expect(data.current.humidity).toBe(raw.current.relative_humidity_2m);
    expect(data.days[0]).toMatchObject({ date: raw.daily.time[0], max: raw.daily.temperature_2m_max[0] });
    expect(data.days[0]).toMatchObject({ sunrise: raw.daily.sunrise[0], sunset: raw.daily.sunset[0] });
    expect(parseForecast({ ...raw, daily: { ...raw.daily, sunrise: undefined, sunset: undefined } }, "x").days[0]).toMatchObject({
      sunrise: null,
      sunset: null,
    });
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
