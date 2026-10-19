import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DashboardConfig } from "@shared/widget-contract";
import { buildLayout, loadWidgetTypes, resolveInstances } from "./loader";

const contractUrl = new URL("../../shared/widget-contract.ts", import.meta.url).href;

function writeWidget(root: string, folder: string, id = folder, opts: { env?: string[]; component?: boolean } = {}) {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "manifest.ts"),
    `import { z } from "zod";
import { defineManifest } from ${JSON.stringify(contractUrl)};
export const manifest = defineManifest({
  id: ${JSON.stringify(id)}, title: "Test", version: 1, category: "system",
  defaultSize: { w: 2, h: 1 }, intervalMs: 5000, capabilities: [],
  env: ${JSON.stringify(opts.env ?? [])},
  config: z.object({ n: z.number().default(1) }),
  data: z.object({ n: z.number() }),
});`,
  );
  writeFileSync(join(dir, "collector.ts"), `export const collector = { collect: async ({ config }) => ({ n: config.n }) };`);
  if (opts.component) writeFileSync(join(dir, "Widget.tsx"), "export default function W() { return null; }");
}

let dir: string;
beforeEach(() => {
  // Inside the repo so the temp widgets can resolve "zod" from node_modules.
  const base = fileURLToPath(new URL("../../node_modules/.tmp", import.meta.url));
  mkdirSync(base, { recursive: true });
  dir = mkdtempSync(join(base, "wd-widgets-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("loadWidgetTypes", () => {
  it("loads widget folders and skips _, . and fixtures", async () => {
    writeWidget(dir, "alpha", "alpha", { component: true });
    writeWidget(dir, "beta");
    mkdirSync(join(dir, "_draft"));
    mkdirSync(join(dir, "fixtures"));
    const types = await loadWidgetTypes(dir);
    expect([...types.keys()].sort()).toEqual(["alpha", "beta"]);
    expect(types.get("alpha")?.hasComponent).toBe(true);
    expect(types.get("beta")?.hasComponent).toBe(false);
  });

  it("throws when manifest.id differs from the folder name", async () => {
    writeWidget(dir, "alpha", "other");
    await expect(loadWidgetTypes(dir)).rejects.toThrow(/Ordnernamen/);
  });

  it("throws when collector.ts is missing", async () => {
    mkdirSync(join(dir, "broken"));
    writeFileSync(join(dir, "broken", "manifest.ts"), "export const manifest = {};");
    await expect(loadWidgetTypes(dir)).rejects.toThrow(/Pflicht/);
  });
});

describe("resolveInstances", () => {
  it("covers unknown type, invalid config, missing env and the good case", async () => {
    writeWidget(dir, "alpha");
    writeWidget(dir, "secret", "secret", { env: ["SECRET_KEY"] });
    const types = await loadWidgetTypes(dir);
    const config = DashboardConfig.parse({
      widgets: [
        { instance: "ok", type: "alpha", x: 0, y: 0 },
        { instance: "unknown", type: "nope", x: 0, y: 0 },
        { instance: "bad", type: "alpha", x: 0, y: 0, config: { n: "x" } },
        { instance: "nokey", type: "secret", x: 0, y: 0 },
        { instance: "off", type: "alpha", x: 0, y: 0, enabled: false },
      ],
    });
    const byId = Object.fromEntries(resolveInstances(config, types, {}).map(r => [r.instance, r]));

    expect(Object.keys(byId)).toEqual(["ok", "unknown", "bad", "nokey"]);
    expect(byId.ok?.loaded).toBeDefined();
    expect(byId.ok?.parsedConfig).toEqual({ n: 1 });
    expect(byId.unknown).toMatchObject({ initialStatus: "error", initialError: 'Unbekannter Widget-Typ "nope"' });
    expect(byId.bad?.initialStatus).toBe("error");
    expect(byId.bad?.initialError).toMatch(/Ungültige Konfiguration/);
    expect(byId.nokey).toMatchObject({ initialStatus: "unconfigured", initialError: "Fehlt in .env: SECRET_KEY" });
  });

  it("buildLayout fills size and title from the manifest", async () => {
    writeWidget(dir, "alpha", "alpha", { component: true });
    const types = await loadWidgetTypes(dir);
    const config = DashboardConfig.parse({ widgets: [{ instance: "a", type: "alpha", x: 1, y: 2 }] });
    expect(buildLayout(config, types).widgets[0]).toMatchObject({ w: 2, h: 1, title: "Test", hasComponent: true });
  });
});
