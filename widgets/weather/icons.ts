// Meteocons "fill" (Bas Milius, MIT, @bybas/weather-icons): static SVGs with soft gradients, like the mockups.
// Imported as URLs by Vite, bundled locally; nothing is loaded from the internet.
import clearDay from "@bybas/weather-icons/production/fill/all/clear-day.svg";
import clearNight from "@bybas/weather-icons/production/fill/all/clear-night.svg";
import drizzle from "@bybas/weather-icons/production/fill/all/drizzle.svg";
import fogDay from "@bybas/weather-icons/production/fill/all/fog-day.svg";
import fogNight from "@bybas/weather-icons/production/fill/all/fog-night.svg";
import overcastDay from "@bybas/weather-icons/production/fill/all/overcast-day.svg";
import overcastNight from "@bybas/weather-icons/production/fill/all/overcast-night.svg";
import partlyDay from "@bybas/weather-icons/production/fill/all/partly-cloudy-day.svg";
import partlyNight from "@bybas/weather-icons/production/fill/all/partly-cloudy-night.svg";
import rainDay from "@bybas/weather-icons/production/fill/all/partly-cloudy-day-rain.svg";
import rainNight from "@bybas/weather-icons/production/fill/all/partly-cloudy-night-rain.svg";
import rain from "@bybas/weather-icons/production/fill/all/rain.svg";
import sleet from "@bybas/weather-icons/production/fill/all/sleet.svg";
import snow from "@bybas/weather-icons/production/fill/all/snow.svg";
import stormDay from "@bybas/weather-icons/production/fill/all/thunderstorms-day.svg";
import stormNight from "@bybas/weather-icons/production/fill/all/thunderstorms-night.svg";
import stormRain from "@bybas/weather-icons/production/fill/all/thunderstorms-rain.svg";

const FREEZING = new Set([56, 57, 66, 67]);

/** WMO code → icon URL; night variants where the sky matters (sun vs. moon). */
export function iconUrl(code: number, night = false): string {
  if (code === 0) return night ? clearNight : clearDay;
  if (code === 1 || code === 2) return night ? partlyNight : partlyDay;
  if (code === 3) return night ? overcastNight : overcastDay;
  if (code === 45 || code === 48) return night ? fogNight : fogDay;
  if (FREEZING.has(code)) return sleet;
  if (code >= 51 && code <= 55) return drizzle;
  if (code >= 80 && code <= 82) return night ? rainNight : rainDay;
  if (code >= 61 && code <= 65) return rain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return snow;
  if (code === 95) return night ? stormNight : stormDay;
  if (code === 96 || code === 99) return stormRain;
  return night ? overcastNight : overcastDay;
}
