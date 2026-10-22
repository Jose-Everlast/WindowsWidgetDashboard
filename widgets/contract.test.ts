// Every widgets/<id>/ folder, including future ones, must satisfy the widget contract.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DashboardConfig, WidgetView } from "@shared/widget-contract";
import { loadWidgetTypes } from "../server/widgets/loader";

const widgetsDir = fileURLToPath(new URL(".", import.meta.url));
const example = DashboardConfig.parse(
  JSON.parse(readFileSync(new URL("../dashboard.config.example.json", import.meta.url), "utf8")),
);
const types = await loadWidgetTypes(widgetsDir);

describe("widget contract", () => {
  it("finds the built-in widgets", () => {
    expect([...types.keys()]).toEqual(expect.arrayContaining(["external", "news", "system", "weather"]));
  });

  describe.each([...types.entries()])("%s", (id, { manifest, hasComponent }) => {
    const dir = join(widgetsDir, id);

    it("has a kebab-case id, a valid version and interval", () => {
      expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(Number.isInteger(manifest.version) && manifest.version >= 1).toBe(true);
      expect(manifest.intervalMs).toBeGreaterThanOrEqual(1000);
    });

    it("has a README", () => {
      expect(existsSync(join(dir, "README.md"))).toBe(true);
    });

    it(`fixtures/${id}.json matches manifest.data`, () => {
      const file = join(dir, "fixtures", `${id}.json`);
      expect(existsSync(file), `fixtures/${id}.json fehlt`).toBe(true);
      const fixture = JSON.parse(readFileSync(file, "utf8"));
      const parsed = manifest.data.safeParse(fixture);
      expect(parsed.success, parsed.error?.message).toBe(true);
      // Without Widget.tsx the hub renders generically, so the payload must be a WidgetView.
      if (!hasComponent) expect(WidgetView.safeParse(fixture).success).toBe(true);
    });

    it("has a Widget.tsx when it is an overlay or frameless", () => {
      // An overlay has no tile, so there is no generic rendering to fall back to.
      if (manifest.overlay || manifest.frameless) expect(hasComponent).toBe(true);
    });

    it("accepts its config from dashboard.config.example.json", () => {
      for (const w of example.widgets.filter(w => w.type === id)) {
        const parsed = manifest.config.safeParse(w.config);
        expect(parsed.success, `${w.instance}: ${parsed.error?.message}`).toBe(true);
      }
    });
  });
});
