// Phase of the day from Open-Meteo's sunrise and sunset, for day or night icons. Pure, browser-safe.
import type { WeatherData } from "./manifest";

export type Phase = "night" | "dawn" | "day" | "dusk";

/** Minutes since midnight from a local "YYYY-MM-DDTHH:MM" (Open-Meteo, timezone=auto). */
export const minutesOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

// Dawn and dusk last about this long around sunrise and sunset.
const TWILIGHT_MIN = 40;

export function phaseOf(now: number, rise: number, set: number): Phase {
  if (Math.abs(now - rise) <= TWILIGHT_MIN) return "dawn";
  if (Math.abs(now - set) <= TWILIGHT_MIN) return "dusk";
  return now > rise && now < set ? "day" : "night";
}

/** Phase right now; without sun times (polar day/night) 7 and 19 o'clock. */
export function phaseAt(data: WeatherData, now: Date): Phase {
  const today = data.days[0];
  const rise = today?.sunrise ? minutesOf(today.sunrise) : 7 * 60;
  const set = today?.sunset ? minutesOf(today.sunset) : 19 * 60;
  return phaseOf(now.getHours() * 60 + now.getMinutes(), rise, set);
}
