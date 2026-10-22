// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListView, WidgetState } from "@shared/widget-contract";
import type { z } from "zod";
import json from "./fixtures/news.json";
import NewsWidget from "./Widget";

// UI-internal helper (it calls our own /api/open), not an external service.
vi.mock("../../web/src/lib/openUrl", () => ({ openUrl: vi.fn(async () => {}) }));
const { openUrl } = await import("../../web/src/lib/openUrl");

afterEach(cleanup);

type News = z.infer<typeof ListView>;
const fixture = json as News;
const state = (data: News) =>
  ({ instance: "news", type: "news", status: "ok", updatedAt: null, checkedAt: null, data }) as WidgetState<News> & { data: News };

describe("NewsWidget (ticker)", () => {
  it("shows every headline once for screen readers and loops a hidden copy", () => {
    render(<NewsWidget state={state(fixture)} config={{}} />);
    const first = fixture.items[0]!;
    expect(screen.getAllByText(first.title)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: new RegExp(first.title.slice(0, 20)) })).toHaveLength(1);
  });

  it("opens a headline in the browser and scales the speed with the item count", () => {
    const { container } = render(<NewsWidget state={state(fixture)} config={{}} />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(openUrl).toHaveBeenCalledWith(fixture.items[0]!.url);
    const track = container.querySelector<HTMLElement>(".hud-ticker-track")!;
    expect(track.style.animationDuration).toBe(`${fixture.items.length * 7}s`);
  });

  it("says when there are no headlines", () => {
    render(<NewsWidget state={state({ ...fixture, items: [] })} config={{}} />);
    expect(screen.getByText("Keine Meldungen")).toBeTruthy();
  });
});
