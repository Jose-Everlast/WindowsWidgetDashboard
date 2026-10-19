import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const WeatherIcon = z.enum(["sun", "cloud-sun", "cloud", "fog", "drizzle", "rain", "snow", "storm"]);

export const WeatherData = z.object({
  label: z.string(),
  current: z.object({ temp: z.number(), apparent: z.number(), code: z.number(), wind: z.number() }),
  hours: z.array(z.object({ time: z.string(), temp: z.number(), precipProb: z.number().nullable(), code: z.number() })),
  days: z.array(
    z.object({ date: z.string(), min: z.number(), max: z.number(), precipProb: z.number().nullable(), code: z.number() }),
  ),
});
export type WeatherData = z.infer<typeof WeatherData>;

export const manifest = defineManifest({
  id: "weather",
  title: "Wetter",
  version: 1,
  category: "daily",
  defaultSize: { w: 3, h: 3 },
  intervalMs: 600_000,
  capabilities: ["network"],
  config: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    label: z.string(),
  }),
  data: WeatherData,
});
