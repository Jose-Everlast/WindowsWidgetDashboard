// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";

// The app's own context hook, not an external service.
const updateSettings = vi.fn(async () => {});
let settings: { tileBackground: boolean; tileBorder: boolean; gameOfLife: boolean } | null = { tileBackground: true, tileBorder: false, gameOfLife: true };
vi.mock("./DashboardProvider", () => ({ useDashboard: () => ({ settings, updateSettings }) }));

afterEach(() => {
  cleanup();
  updateSettings.mockClear();
});

describe("SettingsPanel", () => {
  it("opens from the gear and toggles background and border", async () => {
    render(<SettingsPanel />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByLabelText("Einstellungen"));
    const bg = screen.getByRole("switch", { name: /Kachel-Hintergrund/ });
    const border = screen.getByRole("switch", { name: /Kachel-Rahmen/ });
    expect(bg.getAttribute("aria-checked")).toBe("true");
    expect(border.getAttribute("aria-checked")).toBe("false");
    await act(async () => fireEvent.click(bg));
    expect(updateSettings).toHaveBeenCalledWith({ tileBackground: false });
    await act(async () => fireEvent.click(border));
    expect(updateSettings).toHaveBeenCalledWith({ tileBorder: true });
  });

  it("closes on Escape and says when settings are not loaded yet", () => {
    settings = null;
    render(<SettingsPanel />);
    fireEvent.click(screen.getByLabelText("Einstellungen"));
    expect(screen.getByText("Verbinde …")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
