import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectRelaunchRadar } from "./collect";
import { collector } from "./collector";
import { RelaunchRadarConfig } from "./manifest";

// A real local HTTP server serving the recorded (anonymized) relaunch-radar responses.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const ROUTES: Record<string, string> = {
  "/api/overview": fixture("overview.json"),
  "/api/jobs/running": fixture("jobs-running.json"),
  "/api/notifications": fixture("notifications.json"),
};

let server: Server | undefined;
let dir: string;
let streams: ServerResponse[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-rr-"));
  streams = [];
});
afterEach(async () => {
  for (const s of streams) s.end();
  await new Promise<void>(r => (server ? server.close(() => r()) : r()));
  server = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function listen(routes: Record<string, string> = ROUTES): Promise<string> {
  server = createServer((req, res) => {
    if (req.url?.endsWith("/stream")) {
      // Like relaunch-radar (Hono): headers go out at once although no event is sent on connect.
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      streams.push(res);
      return;
    }
    const body = routes[req.url ?? ""];
    res.writeHead(body ? 200 : 404, { "content-type": "application/json" });
    res.end(body ?? "{}");
  });
  return new Promise(r => server!.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`)));
}

const config = (url: string) => RelaunchRadarConfig.parse({ url, dir });
const writeNotificationFile = () => {
  mkdirSync(join(dir, "logs"));
  writeFileSync(join(dir, "logs", "notifications.json"), fixture("notifications-file.json"));
};

describe("collectRelaunchRadar", () => {
  it("is live while the API answers", async () => {
    const url = await listen();
    const data = await collectRelaunchRadar({ config: config(url), signal: AbortSignal.timeout(5000) });
    expect(data.mode).toBe("live");
    expect(data.jobs?.[0]?.type).toBe("mockup-create");
  });

  it("falls back to logs/notifications.json when the API is down", async () => {
    const url = await listen();
    await new Promise<void>(r => server!.close(() => r()));
    server = undefined;
    writeNotificationFile();
    const data = await collectRelaunchRadar({ config: config(url), signal: AbortSignal.timeout(5000) });
    expect(data.mode).toBe("file");
    expect(data.apiError).toBeTruthy();
    expect(data.notifications.length).toBeGreaterThan(0);
  });

  it("throws with both reasons when API and file are unavailable", async () => {
    const url = await listen();
    await new Promise<void>(r => server!.close(() => r()));
    server = undefined;
    await expect(collectRelaunchRadar({ config: config(url), signal: AbortSignal.timeout(5000) })).rejects.toThrow(
      /API nicht erreichbar .* nicht lesbar/,
    );
  });

  it("treats an unexpected API format as an error, not as file mode", async () => {
    const url = await listen({ ...ROUTES, "/api/overview": JSON.stringify({ autopilot: "kaputt" }) });
    writeNotificationFile();
    await expect(collectRelaunchRadar({ config: config(url), signal: AbortSignal.timeout(5000) })).rejects.toThrow(
      /unerwartetes Format/,
    );
  });
});

describe("subscribe", () => {
  it("refreshes on relevant SSE events and on (re)connect, not on log lines", async () => {
    const url = await listen();
    const controller = new AbortController();
    let refreshes = 0;
    collector.subscribe!({
      instance: "relaunch-radar",
      config: config(url),
      env: {},
      signal: controller.signal,
      log: () => {},
      refresh: () => refreshes++,
    });
    // both streams connected → one refresh each from onOpen
    await expect.poll(() => streams.length, { timeout: 3000 }).toBe(2);
    await expect.poll(() => refreshes, { timeout: 3000 }).toBe(2);

    for (const s of streams) s.write("event: line\ndata: {\"id\":\"j\",\"line\":\"x\"}\n\n");
    await new Promise(r => setTimeout(r, 100));
    expect(refreshes).toBe(2);

    streams[0]!.write('event: notify\ndata: {"id":"n1"}\n\n');
    await expect.poll(() => refreshes, { timeout: 3000 }).toBe(3);
    controller.abort();
  });
});
