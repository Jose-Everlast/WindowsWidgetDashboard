import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDashboardConfig } from "./config-file";

let dir: string;
let paths: { configPath: string; examplePath: string };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-config-"));
  paths = { configPath: join(dir, "dashboard.config.json"), examplePath: join(dir, "dashboard.config.example.json") };
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const write = (path: string, value: unknown) => writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));

describe("loadDashboardConfig", () => {
  it("creates the config from the example when it is missing", () => {
    write(paths.examplePath, { widgets: [{ instance: "system", type: "system", x: 0, y: 0 }] });
    const { config, createdFromExample } = loadDashboardConfig(paths);
    expect(createdFromExample).toBe(true);
    expect(existsSync(paths.configPath)).toBe(true);
    // Loud, not silent: the user has to adapt location and feeds.
    expect(console.log).toHaveBeenCalledWith("[config]", expect.stringMatching(/aus Beispiel erstellt/));
    expect(config.widgets).toHaveLength(1);
  });

  it("applies grid and instance defaults", () => {
    write(paths.configPath, { widgets: [{ instance: "system", type: "system", x: 0, y: 0 }] });
    const { config, createdFromExample } = loadDashboardConfig(paths);
    expect(createdFromExample).toBe(false);
    expect(config.grid.columns).toBe(12);
    expect(config.widgets[0]?.enabled).toBe(true);
  });

  it("rejects duplicate instance ids", () => {
    write(paths.configPath, {
      widgets: [
        { instance: "a", type: "system", x: 0, y: 0 },
        { instance: "a", type: "news", x: 1, y: 0 },
      ],
    });
    expect(() => loadDashboardConfig(paths)).toThrow(/"a" ist doppelt/);
  });

  it("names the file on broken JSON", () => {
    write(paths.configPath, "{ nope");
    expect(() => loadDashboardConfig(paths)).toThrow(/dashboard\.config\.json: ungültiges JSON/);
  });

  it("reports schema errors", () => {
    write(paths.configPath, { widgets: [{ instance: "Bad Id", type: "system", x: 0, y: 0 }] });
    expect(() => loadDashboardConfig(paths)).toThrow(/kebab-case/);
  });
});
