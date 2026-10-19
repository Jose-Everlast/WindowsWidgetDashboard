// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./WidgetFrame";

afterEach(cleanup);

function Tile({ broken }: { broken: boolean }) {
  if (broken) throw new Error("kaputt");
  return <p>Daten ok</p>;
}

describe("ErrorBoundary", () => {
  it("isolates a render error and recovers when new data arrives", () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // React logs caught render errors
    const { rerender } = render(
      <ErrorBoundary resetKey="T1">
        <Tile broken />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Darstellungsfehler: kaputt")).toBeTruthy();

    // Same data again: stays in the error state.
    rerender(
      <ErrorBoundary resetKey="T1">
        <Tile broken={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Darstellungsfehler: kaputt")).toBeTruthy();

    // New data (new updatedAt): renders again.
    rerender(
      <ErrorBoundary resetKey="T2">
        <Tile broken={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Daten ok")).toBeTruthy();
    vi.restoreAllMocks();
  });
});
