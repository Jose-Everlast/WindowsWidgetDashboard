// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetState } from "@shared/widget-contract";
import fixture from "./fixtures/ports.json";
import type { PortsData } from "./manifest";
import PortsWidget, { ARM_MS } from "./Widget";

// The app's own context hook, not an external service.
const runAction = vi.fn();
vi.mock("../../web/src/hub/DashboardProvider", () => ({ useDashboard: () => ({ runAction }) }));

const data = fixture as PortsData;
const state: WidgetState<PortsData> & { data: PortsData } = {
  instance: "ports",
  type: "ports",
  status: "ok",
  updatedAt: "2026-10-19T08:00:00.000Z",
  checkedAt: "2026-10-19T08:00:00.000Z",
  data,
};
const show = (d: PortsData = data) => render(<PortsWidget state={{ ...state, data: d }} config={{}} />);
const port3000 = data.listeners.find(l => l.port === 3000)!;
const stopButton = () => screen.getByLabelText(`node.exe auf Port 3000 stoppen`);

beforeEach(() => runAction.mockImplementation(async () => ({ ok: true, state })));
afterEach(() => {
  cleanup();
  runAction.mockReset();
  vi.useRealTimers();
});

describe("PortsWidget", () => {
  it("offers a stop button only where stoppable, not for the dashboard itself", () => {
    show();
    expect(stopButton()).toBeTruthy();
    expect(screen.queryByLabelText("node.exe auf Port 4700 stoppen")).toBeNull();
  });

  it("stops only on the second click, with the row's pid, port and process", async () => {
    show();
    fireEvent.click(stopButton());
    expect(runAction).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByText("Stoppen?")));
    expect(runAction).toHaveBeenCalledWith("ports", "stop", { pid: port3000.pid, port: 3000, process: "node.exe" });
  });

  it("disarms after a few seconds without a second click", () => {
    vi.useFakeTimers();
    show();
    fireEvent.click(stopButton());
    act(() => vi.advanceTimersByTime(ARM_MS));
    expect(screen.queryByText("Stoppen?")).toBeNull();
    fireEvent.click(stopButton());
    expect(runAction).not.toHaveBeenCalled();
  });

  it("shows the server's refusal as text", async () => {
    runAction.mockImplementation(async () => ({ ok: false, error: "Port 3000 gehört nicht mehr zu PID 18708" }));
    show();
    fireEvent.click(stopButton());
    await act(async () => fireEvent.click(screen.getByText("Stoppen?")));
    expect(screen.getByText("Port 3000 gehört nicht mehr zu PID 18708")).toBeTruthy();
  });
});
