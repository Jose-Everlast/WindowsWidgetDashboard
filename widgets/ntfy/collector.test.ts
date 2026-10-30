import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ntfyCollector } from "./collector";

const raw = readFileSync(new URL("./fixtures/poll.ndjson", import.meta.url), "utf8");
const config = (server: string, topics: string[]) => ({ server, topics, since: "12h", max: 20 });
const ctx = <C>(config: C, env: Record<string, string> = {}) => ({
  instance: "ntfy",
  config,
  env,
  signal: AbortSignal.timeout(5000),
  log: () => {},
});

let dir: string;
let server: Server | undefined;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "wd-ntfyc-"))));
afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  rmSync(dir, { recursive: true, force: true });
});

// A real local HTTP server standing in for ntfy: polls get the recorded response, SSE stays open.
function listen(status: number, onRequest: (req: IncomingMessage, res: ServerResponse) => void = () => {}): Promise<string> {
  server = createServer((req, res) => {
    onRequest(req, res);
    if (res.headersSent) return;
    res.writeHead(status, { "content-type": "application/x-ndjson" });
    res.end(status === 200 ? raw : "{}");
  });
  return new Promise(resolve => server!.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`)));
}

describe("ntfy collector", () => {
  it("returns an empty payload without topics and makes no request", async () => {
    const c = ntfyCollector(dir);
    expect(await c.collect(ctx(config("http://127.0.0.1:1", [])))).toEqual({ topics: [], messages: [], hidden: 0 });
  });

  it("polls config and tile topics in one request and sends the token", async () => {
    let req: IncomingMessage | undefined;
    const url = await listen(200, r => (req = r));
    const c = ntfyCollector(dir);
    await c.actions!.addTopic!(ctx(config(url, ["a"])), { topic: "b" });
    const data = await c.collect(ctx(config(url, ["a"]), { NTFY_TOKEN: "tk_x" }));
    expect(req!.url).toBe("/a,b/json?poll=1&since=12h");
    expect(req!.headers.authorization).toBe("Bearer tk_x");
    expect(data.topics).toEqual([
      { name: "a", removable: false },
      { name: "b", removable: true },
    ]);
    expect(data.messages).toHaveLength(5);
  });

  it("throws on HTTP errors", async () => {
    const url = await listen(401);
    await expect(ntfyCollector(dir).collect(ctx(config(url, ["a"])))).rejects.toThrow(/HTTP 401/);
  });

  it("adds and removes tile topics in data/ntfy/<instance>.json", async () => {
    const c = ntfyCollector(dir);
    const cx = ctx(config("http://127.0.0.1:1", ["fixed"]));
    await c.actions!.addTopic!(cx, { topic: "mine" });
    expect(JSON.parse(readFileSync(join(dir, "ntfy", "ntfy.json"), "utf8"))).toMatchObject({ version: 1, topics: ["mine"] });
    await expect(c.actions!.removeTopic!(cx, { topic: "fixed" })).rejects.toMatchObject({ status: 409 });
    await c.actions!.removeTopic!(cx, { topic: "mine" });
    expect(JSON.parse(readFileSync(join(dir, "ntfy", "ntfy.json"), "utf8")).topics).toEqual([]);
  });

  it("hides dismissed messages, filling up with older ones, and restores them", async () => {
    const url = await listen(200);
    const c = ntfyCollector(dir, () => new Date("2026-10-28T08:00:00.000Z"));
    const cx = ctx({ ...config(url, ["test"]), max: 2 });
    const before = await c.collect(cx);
    expect(before.hidden).toBe(0);
    const [first, second] = before.messages;

    await c.actions!.dismiss!(cx, { id: first!.id });
    const after = await c.collect(cx);
    expect(after.messages.map(m => m.id)).toEqual([second!.id, expect.any(String)]);
    expect(after.messages).toHaveLength(2);
    expect(after.hidden).toBe(1);

    await c.actions!.dismissAll!(cx, { until: first!.at });
    expect(await c.collect(cx)).toMatchObject({ messages: [], hidden: 5 });

    await c.actions!.restoreAll!(cx, {});
    expect((await c.collect(cx)).messages.map(m => m.id)).toEqual([first!.id, second!.id]);
  });

  it("rejects invalid action input with 400", async () => {
    const c = ntfyCollector(dir);
    const cx = ctx(config("http://127.0.0.1:1", []));
    for (const input of [{}, { topic: "" }, { topic: "a/b" }, { topic: "../x" }, { topic: "a".repeat(65) }, { topic: "a", extra: 1 }]) {
      await expect(c.actions!.addTopic!(cx, input)).rejects.toMatchObject({ status: 400 });
    }
    await expect(c.actions!.removeTopic!(cx, { topic: 1 })).rejects.toMatchObject({ status: 400 });
    for (const input of [{}, { id: "" }, { id: "a/b" }, { id: "a", x: 1 }]) {
      await expect(c.actions!.dismiss!(cx, input)).rejects.toMatchObject({ status: 400 });
    }
    for (const input of [{}, { until: "gestern" }, { until: "2026-10-28T08:00:00.000Z", x: 1 }]) {
      await expect(c.actions!.dismissAll!(cx, input)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("subscribes to SSE, refreshes on messages and reconnects when topics change", async () => {
    const sse: string[] = [];
    const streams: ServerResponse[] = [];
    const url = await listen(200, (req, res) => {
      if (!req.url!.includes("/sse")) return;
      sse.push(req.url!);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      streams.push(res);
    });
    const c = ntfyCollector(dir);
    const refresh = vi.fn();
    const stop = new AbortController();
    c.subscribe!({ ...ctx(config(url, ["a"])), signal: stop.signal, refresh });
    await vi.waitFor(() => expect(sse).toEqual(["/a/sse"]));

    streams[0]!.write(`data: ${JSON.stringify({ id: "1", time: 1, event: "message", topic: "a", message: "x" })}\n\n`);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    await c.actions!.addTopic!(ctx(config(url, ["a"])), { topic: "b" });
    await vi.waitFor(() => expect(sse).toEqual(["/a/sse", "/a,b/sse"]));

    stop.abort();
    for (const s of streams) s.end();
  });
});
