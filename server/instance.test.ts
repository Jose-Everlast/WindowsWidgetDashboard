import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerInfo } from "@shared/api";
import { describeServer, findRunning, instanceFile, probe, readInstance, removeInstance, serverMode, writeInstance } from "./instance";

const info = (over: Partial<ServerInfo> = {}): ServerInfo => ({
  app: "windowsDashboard",
  pid: 4242,
  port: 4700,
  mode: "prod",
  startedAt: "2026-10-30T07:00:00.000Z",
  version: "0.1.0",
  ...over,
});

let dir: string;
let server: Server | undefined;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "wd-instance-"))));
afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  rmSync(dir, { recursive: true, force: true });
});

// A real local HTTP server answering /api/health with the given body.
function listen(body: unknown, status = 200): Promise<number> {
  server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise(resolve => server!.listen(0, "127.0.0.1", () => resolve((server!.address() as AddressInfo).port)));
}

describe("serverMode", () => {
  it("maps npm scripts to modes", () => {
    expect(serverMode("start")).toBe("prod");
    expect(serverMode("dev:server")).toBe("dev");
    expect(serverMode("dev")).toBe("dev");
    expect(serverMode(undefined)).toBe("unknown");
  });
});

describe("probe", () => {
  it("recognizes our server, also an older one, and nothing else", async () => {
    let port = await listen({ ok: true, server: info({ port: 1 }), uptimeS: 1, instances: [] });
    expect(await probe(port)).toMatchObject({ pid: 4242, mode: "prod" });
    server!.close();

    port = await listen({ ok: true, uptimeS: 60, instances: [] });
    expect(await probe(port)).toMatchObject({ pid: 0, port, mode: "unknown", version: "älter" });
    server!.close();

    port = await listen({ hello: "other app" });
    expect(await probe(port)).toBeNull();
    server!.close();

    port = await listen({}, 404);
    expect(await probe(port)).toBeNull();
  });

  it("returns null when nothing listens", async () => {
    const port = await listen({});
    server!.close();
    await new Promise(r => setTimeout(r, 50));
    expect(await probe(port, { timeoutMs: 500 })).toBeNull();
  });
});

describe("findRunning", () => {
  it("checks the port from server.json besides the configured ones", async () => {
    const port = await listen({ ok: true, server: info(), uptimeS: 1, instances: [] });
    const file = instanceFile(dir);
    await writeInstance(file, info({ port }));
    expect(await findRunning({ file, ports: [1], confirmAttempts: 2, confirmDelayMs: 10 })).toMatchObject({ pid: 4242 });
  });

  it("ignores a server that goes away while confirming (restart)", async () => {
    const port = await listen({ ok: true, server: info(), uptimeS: 1, instances: [] });
    const closing = findRunning({ file: instanceFile(dir), ports: [port], confirmAttempts: 3, confirmDelayMs: 100 });
    setTimeout(() => server!.close(), 20);
    server!.closeAllConnections();
    expect(await closing).toBeNull();
  });

  it("finds nothing without file and listener", async () => {
    expect(await findRunning({ file: instanceFile(dir), ports: [1], confirmAttempts: 1 })).toBeNull();
  });
});

describe("server.json", () => {
  it("writes, reads and removes only its own entry", async () => {
    const file = instanceFile(dir);
    await writeInstance(file, info());
    expect(await readInstance(file)).toEqual(info());
    removeInstance(file, 1);
    expect(existsSync(file)).toBe(true);
    removeInstance(file, 4242);
    expect(existsSync(file)).toBe(false);
  });

  it("treats a broken file as missing", async () => {
    const file = instanceFile(dir);
    writeFileSync(file, "{broken");
    expect(await readInstance(file)).toBeNull();
    removeInstance(file, 4242);
    expect(existsSync(file)).toBe(true);
  });
});

describe("describeServer", () => {
  it("prints url, mode, pid and age", () => {
    expect(describeServer(info(), new Date("2026-10-30T08:12:00.000Z"))).toMatch(
      /^http:\/\/127\.0\.0\.1:4700 · prod · PID 4242 · seit \d\d:00 \(1 h 12 min\)$/,
    );
    expect(describeServer(info({ pid: 0, version: "älter" }), new Date("2026-10-30T07:05:00.000Z"))).toMatch(/PID \? .*\(5 min\) · ältere Version/);
  });
});
