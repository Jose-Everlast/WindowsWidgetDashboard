// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetState } from "@shared/widget-contract";
import { dayParts } from "./forecast";
import fixture from "./fixtures/weather.json";
import type { WeatherData } from "./manifest";
import WeatherWidget from "./Widget";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const data = fixture as WeatherData;
const state = (d: WeatherData) =>
  ({ instance: "wetter", type: "weather", status: "ok", updatedAt: null, checkedAt: null, data: d }) as WidgetState<WeatherData> & { data: WeatherData };
const at = (hh: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 19, hh, 0));
};

describe("WeatherWidget (glass orb, mockup 1)", () => {
  it("shows place, condition, high/low, the orb, the values and the forecast on the arcs", () => {
    at(21);
    render(<WeatherWidget state={state(data)} config={{}} />);
    const [today] = data.days;
    expect(screen.getByText(data.label)).toBeTruthy();
    expect(screen.getByText(`H ${Math.round(today!.max)}° / T ${Math.round(today!.min)}°`)).toBeTruthy();
    expect(document.querySelector(".text-4xl")!.textContent).toBe(`${Math.round(data.current.temp)}°`);
    expect(screen.getByText("Luft")).toBeTruthy();
    expect(screen.getByText(`${Math.round(data.current.humidity!)} %`)).toBeTruthy();
    for (const p of dayParts(data.hours)) expect(screen.getAllByText(p.label).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^(Mo|Di|Mi|Do|Fr|Sa|So)$/)).toHaveLength(5);
    // Meteocons: the orb, 4 parts of the day, 5 days.
    expect(document.querySelectorAll("img")).toHaveLength(1 + 4 + 5);
  });

  it("leaves out humidity when Open-Meteo has none", () => {
    at(13);
    render(<WeatherWidget state={state({ ...data, current: { ...data.current, humidity: null } })} config={{}} />);
    expect(screen.queryByText("Luft")).toBeNull();
  });

  it("shows warnings only when there are some", () => {
    at(13);
    render(<WeatherWidget state={state(data)} config={{}} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Sturmböen/);
    cleanup();
    const calm = { ...data, days: data.days.map(d => ({ ...d, gustsMax: 20 })), hours: data.hours.map(h => ({ ...h, gusts: 20 })) };
    render(<WeatherWidget state={state(calm)} config={{}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
