import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Cache } from "../cache";

const PING_MS = 15_000;

/** SSE: "snapshot" on connect, "widget" per change, "ping" every 15 s so the UI can detect a dead server. */
export function streamRoutes(cache: Cache): Hono {
  const app = new Hono();

  app.get("/", c =>
    streamSSE(c, async stream => {
      // Chained writes keep events in order.
      let chain: Promise<unknown> = Promise.resolve();
      const send = (event: string, data: unknown) =>
        (chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })));

      void send("snapshot", cache.all());
      const off = cache.onChange(state => void send("widget", state));
      const ping = setInterval(() => void send("ping", { at: new Date().toISOString() }), PING_MS);
      await new Promise<void>(resolve =>
        stream.onAbort(() => {
          off();
          clearInterval(ping);
          resolve();
        }),
      );
    }),
  );

  return app;
}
