import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsStore } from "./settings";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-settings-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("settings store", () => {
  it("persists changes and notifies listeners", async () => {
    const file = join(dir, "ui-settings.json");
    const store = await createSettingsStore(file);
    const seen = vi.fn();
    const off = store.onChange(seen);
    await store.update({ tileBackground: false });
    expect(seen).toHaveBeenCalledWith({ tileBackground: false, tileBorder: true, gameOfLife: true });
    off();
    await store.update({ tileBorder: false });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ tileBackground: false, tileBorder: false, gameOfLife: true });
    expect((await createSettingsStore(file)).get()).toEqual({ tileBackground: false, tileBorder: false, gameOfLife: true });
  });

  it("falls back to defaults on a broken file and says so", async () => {
    const file = join(dir, "ui-settings.json");
    writeFileSync(file, "{kaputt");
    const log = vi.fn();
    expect((await createSettingsStore(file, log)).get()).toEqual({ tileBackground: true, tileBorder: true, gameOfLife: true });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/kein gültiges JSON – Standardwerte/));
  });
});
