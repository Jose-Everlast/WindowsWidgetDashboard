import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createSSEParser, subscribeSSE, type SSEEvent } from "./sse";

describe("createSSEParser", () => {
  const parse = (chunks: string[]) => {
    const events: SSEEvent[] = [];
    const p = createSSEParser(e => events.push(e));
    for (const c of chunks) p.push(c);
    return events;
  };

  it("handles chunk boundaries inside lines and CRLF split across chunks", () => {
    expect(parse(["event: no", "tify\r", "\ndata: {\"a\":1}\r\n\r\n"])).toEqual([{ event: "notify", data: '{"a":1}' }]);
  });

  it("joins multi-line data, skips comments, defaults to 'message' and strips one leading space", () => {
    expect(parse([": ping\n", "data:  zwei Leerzeichen\n", "data: x\n\n", "id: 7\ndata:y\n\n"])).toEqual([
      { event: "message", data: " zwei Leerzeichen\nx" },
      { event: "message", data: "y", id: "7" },
    ]);
  });

  it("does not dispatch events without data, nor a trailing incomplete event", () => {
    const events: SSEEvent[] = [];
    const p = createSSEParser(e => events.push(e));
    p.push("event: leer\n\n");
    p.push("event: halb\ndata: x\n");
    p.end();
    expect(events).toEqual([]);
  });
});

describe("subscribeSSE against a real local server", () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>(r => (server ? server.close(() => r()) : r())));

  function listen(handler: (res: ServerResponse, n: number) => void): Promise<string> {
    let n = 0;
    server = createServer((_req, res) => handler(res, n++));
    return new Promise(r => server!.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/s`)));
  }
  const sse = (res: ServerResponse) => res.writeHead(200, { "content-type": "text/event-stream" });

  it("receives events and reconnects after the server ends the stream", async () => {
    const url = await listen((res, n) => {
      sse(res);
      res.end(`event: notify\ndata: ${n}\n\nevent: autopilot\ndata: on\n\n`);
    });
    const controller = new AbortController();
    const events: string[] = [];
    let opens = 0;
    const done = subscribeSSE(url, {
      signal: controller.signal,
      minRetryMs: 10,
      onOpen: () => opens++,
      onEvent: e => {
        events.push(`${e.event}:${e.data}`);
        if (events.length === 4) controller.abort();
      },
    });
    await done;
    expect(events).toEqual(["notify:0", "autopilot:on", "notify:1", "autopilot:on"]);
    expect(opens).toBe(2);
  });

  it("reports HTTP errors and retries until the stream works", async () => {
    const url = await listen((res, n) => {
      if (n === 0) {
        res.writeHead(500);
        res.end();
        return;
      }
      sse(res);
      res.write("data: ok\n\n");
    });
    const controller = new AbortController();
    const errors: string[] = [];
    await subscribeSSE(url, {
      signal: controller.signal,
      minRetryMs: 10,
      onError: e => errors.push((e as Error).message),
      onEvent: () => controller.abort(),
    });
    expect(errors[0]).toMatch(/HTTP 500/);
  });

  it("resolves when aborted while waiting for data on an open stream", async () => {
    const url = await listen(res => {
      sse(res);
      res.write(": open\n\n");
    });
    const controller = new AbortController();
    const done = subscribeSSE(url, { signal: controller.signal, minRetryMs: 10, onEvent: () => {}, onOpen: () => controller.abort() });
    await expect(done).resolves.toBeUndefined();
  });

  it("retries when nothing listens on the port", async () => {
    const url = await listen(() => {});
    await new Promise<void>(r => server!.close(() => r()));
    server = undefined;
    const controller = new AbortController();
    let errors = 0;
    await subscribeSSE(url, {
      signal: controller.signal,
      minRetryMs: 5,
      onEvent: () => {},
      onError: () => {
        if (++errors === 3) controller.abort();
      },
    });
    expect(errors).toBe(3);
  });
});
