import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthResponse, LayoutResponse } from "@shared/api";
import type { WidgetState } from "@shared/widget-contract";
import { createApp, type AppDeps } from "./app";
import { createCache } from "./cache";
import { HttpError } from "./http";

const ORIGIN = "http://127.0.0.1:4700";
const state: WidgetState = {
  instance: "system",
  type: "system",
  status: "ok",
  updatedAt: "2026-10-19T10:00:00.000Z",
  checkedAt: "2026-10-19T10:00:00.000Z",
  data: { n: 1 },
};
const layout: LayoutResponse = {
  grid: { columns: 12, rows: 8, gapPx: 12, reserveLeftPx: 0, reserveTopPx: 0 },
  widgets: [{ instance: "system", type: "system", x: 0, y: 0, w: 3, h: 3, title: "System", enabled: true, config: {}, hasComponent: true, overlay: false, frameless: false }],
};

let distDir: string;
let deps: AppDeps;

beforeEach(() => {
  distDir = mkdtempSync(join(tmpdir(), "wd-dist-"));
  mkdirSync(join(distDir, "assets"));
  writeFileSync(join(distDir, "index.html"), "<!doctype html><title>Dashboard</title>");
  writeFileSync(join(distDir, "assets", "app-abc.js"), "console.log(1)");
  const cache = createCache();
  cache.set(state);
  deps = {
    cache,
    scheduler: {
      refresh: vi.fn(async () => state),
      action: vi.fn(async (_instance: string, name: string) => {
        if (name !== "refresh" && name !== "add") throw new HttpError(404, "unknown action");
        return state;
      }),
    },
    layout,
    types: [],
    openUrl: vi.fn(async () => {}),
    startedAt: Date.now() - 5000,
    // app.request("/x") has no Host header; the guard then uses the URL host "localhost".
    allowedHosts: ["localhost", "127.0.0.1:4700"],
    allowedOrigins: [ORIGIN],
    distDir,
  };
});
afterEach(() => rmSync(distDir, { recursive: true, force: true }));

const open = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  createApp(deps).request("/api/open", { method: "POST", headers, body: JSON.stringify(body) });

describe("API", () => {
  it("GET /api/health lists instances", async () => {
    const res = await createApp(deps).request("/api/health");
    const body = (await res.json()) as HealthResponse;
    expect(body.ok).toBe(true);
    expect(body.uptimeS).toBeGreaterThanOrEqual(5);
    expect(body.instances).toEqual([{ instance: "system", type: "system", status: "ok", updatedAt: state.updatedAt }]);
  });

  it("GET /api/layout and /api/widgets", async () => {
    const app = createApp(deps);
    expect(await (await app.request("/api/layout")).json()).toEqual(layout);
    expect(await (await app.request("/api/widgets")).json()).toEqual([state]);
    expect(await (await app.request("/api/widgets/system")).json()).toEqual(state);
    expect((await app.request("/api/widgets/nope")).status).toBe(404);
  });

  it("POST actions go to the scheduler with the body as input, unknown actions are 404", async () => {
    const app = createApp(deps);
    const post = (path: string, body = "{}") => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body });
    const res = await post("/api/widgets/system/actions/refresh");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(state);
    expect(deps.scheduler.action).toHaveBeenCalledWith("system", "refresh", {});
    expect((await post("/api/widgets/system/actions/add", '{"text":"Milch"}')).status).toBe(200);
    expect(deps.scheduler.action).toHaveBeenLastCalledWith("system", "add", { text: "Milch" });
    expect((await post("/api/widgets/system/actions/nuke")).status).toBe(404);
  });

  it("POST actions reject a body that is not JSON", async () => {
    const res = await createApp(deps).request("/api/widgets/system/actions/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{text",
    });
    expect(res.status).toBe(400);
    expect(deps.scheduler.action).not.toHaveBeenCalled();
  });

  it("unknown API paths return JSON 404", async () => {
    const res = await createApp(deps).request("/api/x");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});

describe("localGuard", () => {
  it("rejects foreign Host headers (DNS rebinding)", async () => {
    const res = await createApp(deps).request("http://evil.example:4700/api/widgets", {
      headers: { host: "evil.example:4700" },
    });
    expect(res.status).toBe(403);
    const ok = await createApp(deps).request("http://127.0.0.1:4700/api/widgets", { headers: { host: "127.0.0.1:4700" } });
    expect(ok.status).toBe(200);
  });

  it("protects state-changing requests like refresh from other sites", async () => {
    const app = createApp(deps);
    const simple = await app.request("/api/widgets/system/actions/refresh", { method: "POST" });
    expect(simple.status).toBe(415);
    const foreign = await app.request("/api/widgets/system/actions/refresh", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: "{}",
    });
    expect(foreign.status).toBe(403);
    expect(deps.scheduler.action).not.toHaveBeenCalled();
  });
});

describe("POST /api/open", () => {
  it("opens http(s) urls", async () => {
    const res = await open({ url: "https://www.tagesschau.de/" }, { "content-type": "application/json", origin: ORIGIN });
    expect(res.status).toBe(204);
    expect(deps.openUrl).toHaveBeenCalledWith("https://www.tagesschau.de/");
  });

  it("passes only the normalized href to the OS (foreign feed links)", async () => {
    const res = await open({ url: 'https://x.de/a" /select,"C:\\Windows' });
    expect(res.status).toBe(204);
    const href = vi.mocked(deps.openUrl).mock.calls[0]![0];
    expect(href).not.toMatch(/[" \\]/);
    expect(href).toBe(new URL('https://x.de/a" /select,"C:\\Windows').href);
  });

  it("rejects javascript: urls", async () => {
    expect((await open({ url: "javascript:alert(1)" })).status).toBe(400);
    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it("requires a JSON content type", async () => {
    expect((await open({ url: "https://x.de" }, { "content-type": "text/plain" })).status).toBe(415);
  });

  it("rejects foreign origins", async () => {
    const res = await open({ url: "https://x.de" }, { "content-type": "application/json", origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(deps.openUrl).not.toHaveBeenCalled();
  });
});

describe("static UI", () => {
  it("serves assets and falls back to index.html", async () => {
    const app = createApp(deps);
    const asset = await app.request("/assets/app-abc.js");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    const page = await app.request("/irgendwas");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>Dashboard</title>");
  });

  it("answers 503 when the UI is not built", async () => {
    rmSync(join(distDir, "index.html"));
    const res = await createApp(deps).request("/");
    expect(res.status).toBe(503);
  });
});

describe("GET /api/stream", () => {
  it("starts with a snapshot event", async () => {
    const controller = new AbortController();
    const res = await createApp(deps).request("/api/stream", { signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("\n\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    controller.abort();
    await reader.cancel();
    expect(text).toMatch(/^event: snapshot\ndata: /);
    expect(text).toContain('"instance":"system"');
  });
});
