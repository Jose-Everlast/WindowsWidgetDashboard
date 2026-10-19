import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collector } from "./collector";

// A real local HTTP server serving the recorded feeds: rss-parser goes through its normal HTTP path.
const tagesschau = readFileSync(new URL("./fixtures/tagesschau.xml", import.meta.url), "utf8");
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/tagesschau.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(tagesschau);
    } else {
      res.writeHead(500);
      res.end("boom");
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

const run = (feeds: Array<{ label: string; url: string }>, logs: unknown[][] = []) =>
  collector.collect({
    config: { feeds, perFeed: 5 },
    env: {},
    signal: AbortSignal.timeout(10_000),
    log: (...args) => logs.push(args),
  });

describe("news collector", () => {
  it("shows the remaining feeds when one fails and logs the failure", async () => {
    const logs: unknown[][] = [];
    const view = await run(
      [
        { label: "tagesschau", url: `${base}/tagesschau.xml` },
        { label: "kaputt", url: `${base}/broken.xml` },
      ],
      logs,
    );
    expect(view.items.length).toBe(5);
    expect(view.items.every(i => i.subtitle === "tagesschau")).toBe(true);
    expect(String(logs[0]?.[1])).toMatch(/kaputt/);
  });

  it("throws when every feed fails", async () => {
    await expect(run([{ label: "kaputt", url: `${base}/broken.xml` }])).rejects.toThrow(/Alle Feeds fehlgeschlagen/);
  });
});
