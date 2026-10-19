import { defineCollector } from "@shared/widget-contract";
import { manifest } from "./manifest";
import { parseForecast } from "./parse";

const PARAMS =
  "current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
  "&hourly=temperature_2m,precipitation_probability,weather_code" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
  "&timezone=auto&forecast_days=3&forecast_hours=12";

export const collector = defineCollector(manifest, {
  async collect({ config, signal }) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${config.lat}&longitude=${config.lon}&${PARAMS}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    return parseForecast(await res.json(), config.label);
  },
});
