// Pure helpers, also imported by Widget.tsx: no Node APIs here.
import type { z } from "zod";
import type { WeatherData, WeatherIcon } from "./manifest";

type Icon = z.infer<typeof WeatherIcon>;

interface OpenMeteoResponse {
  current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: Array<number | null>; weather_code: number[] };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: Array<number | null>;
  };
}

/** Open-Meteo returns parallel arrays; zip them into rows. */
export function parseForecast(json: OpenMeteoResponse, label: string): WeatherData {
  const { current, hourly, daily } = json;
  return {
    label,
    current: {
      temp: current.temperature_2m,
      apparent: current.apparent_temperature,
      code: current.weather_code,
      wind: current.wind_speed_10m,
    },
    hours: hourly.time.map((time, i) => ({
      time,
      temp: hourly.temperature_2m[i]!,
      precipProb: hourly.precipitation_probability[i] ?? null,
      code: hourly.weather_code[i]!,
    })),
    days: daily.time.map((date, i) => ({
      date,
      min: daily.temperature_2m_min[i]!,
      max: daily.temperature_2m_max[i]!,
      precipProb: daily.precipitation_probability_max[i] ?? null,
      code: daily.weather_code[i]!,
    })),
  };
}

/** WMO weather codes (table at the end of open-meteo.com/en/docs). */
export function wmo(code: number): { label: string; icon: Icon } {
  if (code === 0) return { label: "Klar", icon: "sun" };
  if (code >= 1 && code <= 2) return { label: "Heiter", icon: "cloud-sun" };
  if (code === 3) return { label: "Bewölkt", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Nebel", icon: "fog" };
  if (code >= 51 && code <= 57) return { label: "Niesel", icon: "drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Regen", icon: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Schnee", icon: "snow" };
  if (code >= 95 && code <= 99) return { label: "Gewitter", icon: "storm" };
  return { label: "Unbekannt", icon: "cloud" };
}
