import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const WeatherIcon = z.enum(["sun", "cloud-sun", "cloud", "fog", "drizzle", "rain", "snow", "storm"]);

export const WeatherData = z.object({
  label: z.string(),
  current: z.object({
    temp: z.number(),
    apparent: z.number(),
    code: z.number(),
    wind: z.number(),
    /** relative humidity in %, null when Open-Meteo has none */
    humidity: z.number().nullable(),
  }),
  hours: z.array(
    z.object({
      time: z.string(),
      temp: z.number(),
      precipProb: z.number().nullable(),
      code: z.number(),
      /** km/h; null when Open-Meteo has none. */
      gusts: z.number().nullable(),
    }),
  ),
  days: z.array(
    z.object({
      date: z.string(),
      min: z.number(),
      max: z.number(),
      precipProb: z.number().nullable(),
      code: z.number(),
      // Local time "YYYY-MM-DDTHH:MM" (timezone=auto); null when Open-Meteo has none (polar day/night).
      sunrise: z.string().nullable(),
      sunset: z.string().nullable(),
      gustsMax: z.number().nullable(),
      /** cm of fresh snow */
      snowfall: z.number().nullable(),
    }),
  ),
});
export type WeatherData = z.infer<typeof WeatherData>;

export const manifest = defineManifest({
  id: "weather",
  title: "Wetter",
  version: 1,
  category: "daily",
  // 4 rows: the forecast arc must fit without a scrollbar.
  defaultSize: { w: 3, h: 4 },
  intervalMs: 600_000,
  capabilities: ["network"],
  // Floats on the wallpaper like the mockup: grid place, no frame.
  frameless: true,
  config: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    label: z.string(),
  }),
  data: WeatherData,
});
