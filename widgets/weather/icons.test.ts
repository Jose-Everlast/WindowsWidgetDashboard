import clearDay from "@bybas/weather-icons/production/fill/all/clear-day.svg";
import clearNight from "@bybas/weather-icons/production/fill/all/clear-night.svg";
import drizzle from "@bybas/weather-icons/production/fill/all/drizzle.svg";
import overcastDay from "@bybas/weather-icons/production/fill/all/overcast-day.svg";
import partlyNight from "@bybas/weather-icons/production/fill/all/partly-cloudy-night.svg";
import rain from "@bybas/weather-icons/production/fill/all/rain.svg";
import sleet from "@bybas/weather-icons/production/fill/all/sleet.svg";
import snow from "@bybas/weather-icons/production/fill/all/snow.svg";
import stormNight from "@bybas/weather-icons/production/fill/all/thunderstorms-night.svg";
import { describe, expect, it } from "vitest";
import { iconUrl } from "./icons";

describe("iconUrl", () => {
  it("maps WMO codes to Meteocons, with night variants", () => {
    expect(iconUrl(0)).toBe(clearDay);
    expect(iconUrl(0, true)).toBe(clearNight);
    expect(iconUrl(2, true)).toBe(partlyNight);
    expect(iconUrl(3)).toBe(overcastDay);
    expect(iconUrl(53)).toBe(drizzle);
    expect(iconUrl(63)).toBe(rain);
    expect(iconUrl(66)).toBe(sleet);
    expect(iconUrl(75)).toBe(snow);
    expect(iconUrl(95, true)).toBe(stormNight);
    expect(iconUrl(1234)).toBe(overcastDay);
  });
});
