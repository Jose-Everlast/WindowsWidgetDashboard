import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WidgetView } from "@shared/widget-contract";
import { loadWidgetTypes } from "../server/widgets/loader";
import { scaffoldWidget } from "./new-widget";

let dir: string;
beforeEach(() => {
  // Inside the repo so the generated files resolve zod and @shared like real widgets.
  const base = fileURLToPath(new URL("../node_modules/.tmp", import.meta.url));
  mkdirSync(base, { recursive: true });
  dir = mkdtempSync(join(base, "wd-scaffold-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fixture = (id: string) => JSON.parse(readFileSync(join(dir, id, "fixtures", `${id}.json`), "utf8"));

describe("scaffoldWidget", () => {
  it("creates a generic view widget that passes the loader and its schema", async () => {
    scaffoldWidget(dir, "git-status", { view: "status" });
    expect(existsSync(join(dir, "git-status", "Widget.tsx"))).toBe(false);
    const types = await loadWidgetTypes(dir);
    const w = types.get("git-status")!;
    expect(w.manifest.view).toBe("status");
    expect(w.manifest.data.safeParse(fixture("git-status")).success).toBe(true);
    expect(WidgetView.safeParse(fixture("git-status")).success).toBe(true);
  });

  it("creates a component widget with Widget.tsx", async () => {
    scaffoldWidget(dir, "hello");
    const w = (await loadWidgetTypes(dir)).get("hello")!;
    expect(w.hasComponent).toBe(true);
    expect(w.manifest.data.safeParse(fixture("hello")).success).toBe(true);
  });

  it("generates a collector that throws instead of returning fake data", async () => {
    scaffoldWidget(dir, "todo");
    const w = (await loadWidgetTypes(dir)).get("todo")!;
    await expect(
      w.collector.collect({ config: {}, env: {}, signal: AbortSignal.timeout(1000), log: () => {} }),
    ).rejects.toThrow(/TODO/);
  });

  it("rejects invalid ids and existing folders", () => {
    expect(() => scaffoldWidget(dir, "Git Status")).toThrow(/Ungültige ID/);
    scaffoldWidget(dir, "dup");
    expect(() => scaffoldWidget(dir, "dup")).toThrow(/existiert bereits/);
  });
});
