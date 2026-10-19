import { describe, expect, it } from "vitest";
import { DashboardConfig, InstanceConfig, WidgetView, missingEnv } from "./widget-contract";

describe("WidgetView", () => {
  it("accepts every view variant", () => {
    const views = [
      { view: "stat", items: [{ label: "CPU", value: 12, unit: "%", trend: "up", tone: "good" }] },
      { view: "list", items: [{ title: "Hallo", url: "https://example.com", meta: "08:00" }] },
      { view: "progress", items: [{ label: "Build", percent: 42 }] },
      { view: "status", items: [{ label: "API", state: "ok", detail: "läuft" }] },
      { view: "markdown", text: "**fett**" },
    ];
    for (const v of views) expect(WidgetView.safeParse(v).success, v.view).toBe(true);
  });

  it("rejects out-of-range percent, non-http urls and unknown views", () => {
    expect(WidgetView.safeParse({ view: "progress", items: [{ label: "x", percent: 120 }] }).success).toBe(false);
    expect(WidgetView.safeParse({ view: "list", items: [{ title: "x", url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(WidgetView.safeParse({ view: "chart", items: [] }).success).toBe(false);
  });
});

describe("DashboardConfig", () => {
  it("fills grid and instance defaults", () => {
    const cfg = DashboardConfig.parse({ widgets: [{ instance: "wetter", type: "weather", x: 0, y: 0 }] });
    expect(cfg.grid).toEqual({ columns: 12, rows: 8, gapPx: 12, reserveLeftPx: 0, reserveTopPx: 0 });
    expect(cfg.widgets[0]).toMatchObject({ enabled: true, config: {} });
  });

  it("rejects instance ids that are not kebab-case", () => {
    expect(InstanceConfig.safeParse({ instance: "Wetter Münster", type: "weather", x: 0, y: 0 }).success).toBe(false);
  });
});

describe("missingEnv", () => {
  it("reports missing and empty variables", () => {
    expect(missingEnv(["A", "B", "C"], { A: "x", B: "  " })).toEqual(["B", "C"]);
    expect(missingEnv(undefined, {})).toEqual([]);
  });
});
