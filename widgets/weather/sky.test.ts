import { describe, expect, it } from "vitest";
import fixture from "./fixtures/weather.json";
import type { WeatherData } from "./manifest";
import { minutesOf, phaseAt, phaseOf } from "./sky";

const data = fixture as WeatherData;
const at = (hh: number, mm = 0) => new Date(2026, 9, 19, hh, mm);

describe("sky", () => {
  it("reads local Open-Meteo times as minutes", () => {
    expect(minutesOf("2026-10-19T08:04")).toBe(484);
  });

  it("knows the phase of the day", () => {
    expect(phaseOf(300, 480, 1110)).toBe("night");
    expect(phaseOf(470, 480, 1110)).toBe("dawn");
    expect(phaseOf(800, 480, 1110)).toBe("day");
    expect(phaseOf(1120, 480, 1110)).toBe("dusk");
    expect(phaseOf(1300, 480, 1110)).toBe("night");
  });

  it("uses the recorded sun times, with a fallback without them", () => {
    expect(phaseAt(data, at(13))).toBe("day");
    expect(phaseAt(data, at(23))).toBe("night");
    const polar = { ...data, days: data.days.map(d => ({ ...d, sunrise: null, sunset: null })) };
    expect(phaseAt(polar, at(12))).toBe("day");
    expect(phaseAt(polar, at(3))).toBe("night");
  });
});
