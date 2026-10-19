// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import externalFixture from "../../../widgets/external/fixtures/external.json";
import newsFixture from "../../../widgets/news/fixtures/news.json";
import { GenericView } from "./GenericView";

// UI-internal helper (it calls our own /api/open), not an external service.
vi.mock("../lib/openUrl", () => ({ openUrl: vi.fn(async () => {}) }));
const { openUrl } = await import("../lib/openUrl");

afterEach(cleanup);

describe("GenericView", () => {
  it("renders the news list fixture and opens links on click", () => {
    render(<GenericView data={newsFixture} />);
    const first = newsFixture.items[0]!;
    fireEvent.click(screen.getByText(first.title));
    expect(openUrl).toHaveBeenCalledWith(first.url);
  });

  it("renders the status fixture", () => {
    render(<GenericView data={externalFixture} />);
    expect(screen.getByText("Dashboard-Server")).toBeTruthy();
  });

  it("renders stat, progress and markdown views", () => {
    render(<GenericView data={{ view: "stat", items: [{ label: "Leads", value: 178, trend: "up" }] }} />);
    expect(screen.getByText("Leads")).toBeTruthy();
    expect(screen.getByLabelText("steigend")).toBeTruthy();
    cleanup();

    render(<GenericView data={{ view: "progress", items: [{ label: "Queue", percent: 40 }] }} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
    cleanup();

    render(<GenericView data={{ view: "markdown", text: "<b>kein html</b>" }} />);
    expect(screen.getByText("<b>kein html</b>")).toBeTruthy();
  });

  it("shows an error for invalid payloads", () => {
    render(<GenericView data={{ view: "chart" }} />);
    expect(screen.getByText(/Keine gültige Ansicht/)).toBeTruthy();
  });
});
