import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { collector } from "./collector";

const ctx = <C>(config: C) => ({ instance: "external", config, env: {}, signal: AbortSignal.timeout(5000), log: () => {} });

let server: Server | undefined;
afterEach(() => new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve())));

// A real local HTTP server, not a mock: the collector talks HTTP to it like to any project.
function listen(status: number, body: unknown): Promise<string> {
  server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise(resolve =>
    server!.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/w.json`)),
  );
}

describe("external collector", () => {
  it("reads a file relative to the repo root", async () => {
    const data = await collector.collect(ctx({ file: "widgets/external/fixtures/external.json" }));
    expect(data).toMatchObject({ view: "status" });
  });

  it("fetches a URL", async () => {
    const url = await listen(200, { view: "markdown", text: "hi" });
    expect(await collector.collect(ctx({ url }))).toEqual({ view: "markdown", text: "hi" });
  });

  it("throws on HTTP errors", async () => {
    const url = await listen(500, { error: "boom" });
    await expect(collector.collect(ctx({ url }))).rejects.toThrow(/HTTP 500/);
  });
});
