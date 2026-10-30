import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../server/http";
import { listListeners, type Listener, type ProcessRow } from "../../server/lib/win";
import { portsCollector } from "./collector";
import { PortsConfig } from "./manifest";
import { stopListener, systemStopDeps, type StopDeps } from "./stop";

const input = { pid: 500, port: 3000, process: "node.exe" };
const config = PortsConfig.parse({});

// Test doubles for the app's own system calls (no external service); the real calls run in the Windows test below.
interface Over {
  row?: ProcessRow | null;
  listeners?: Listener[];
  freed?: boolean;
  killFails?: boolean;
  self?: StopDeps["self"];
}

function fakeDeps(over: Over = {}) {
  let killed = false;
  const listeners = over.listeners ?? [{ port: 3000, address: "127.0.0.1", pid: 500 }];
  const deps = {
    listListeners: vi.fn(async () => (killed && over.freed !== false ? [] : listeners)),
    processRow: vi.fn(async () => (over.row === undefined ? { pid: 500, name: "node.exe", session: "Console" } : over.row)),
    killProcess: vi.fn(async () => {
      if (over.killFails) throw new Error("FEHLER: Zugriff verweigert");
      killed = true;
    }),
    sleep: vi.fn(async () => {}),
    self: over.self ?? { pid: 1, port: 4700 },
  } satisfies StopDeps;
  return deps;
}

async function statusOf(p: Promise<unknown>): Promise<number> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  return (err as HttpError).status;
}

describe("stopListener", () => {
  it("kills the PID after the re-check and waits until the port is free", async () => {
    const deps = fakeDeps();
    await stopListener(deps, input, config);
    expect(deps.killProcess).toHaveBeenCalledWith(500, undefined);
    expect(deps.sleep).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Over, number]>([
    ["the port no longer belongs to the PID", { listeners: [{ port: 3000, address: "127.0.0.1", pid: 777 }] }, 409],
    ["the PID has exited", { row: null }, 409],
    ["the PID was reused by another program", { row: { pid: 500, name: "Code.exe", session: "Console" } }, 409],
    ["it is a Windows service", { row: { pid: 500, name: "node.exe", session: "Services" } }, 403],
    ["it is the dashboard's own PID", { self: { pid: 500, port: 4700 } }, 403],
    ["it is the dashboard's own port", { self: { pid: 1, port: 3000 } }, 403],
  ])("refuses without killing when %s", async (_, over, status) => {
    const deps = fakeDeps(over);
    expect(await statusOf(stopListener(deps, input, config))).toBe(status);
    expect(deps.killProcess).not.toHaveBeenCalled();
  });

  it("refuses when stopping is switched off", async () => {
    const deps = fakeDeps();
    expect(await statusOf(stopListener(deps, input, PortsConfig.parse({ allowStop: false })))).toBe(403);
    expect(deps.killProcess).not.toHaveBeenCalled();
  });

  it("answers 409 when taskkill fails, keeping its message only as details", async () => {
    const err = await stopListener(fakeDeps({ killFails: true }), input, config).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(409);
    expect((err as HttpError).message).not.toContain("Zugriff");
    expect(((err as HttpError).details as Error).message).toContain("Zugriff verweigert");
  });

  it("is no error when Windows holds the socket a little longer", async () => {
    const deps = fakeDeps({ freed: false });
    await stopListener(deps, input, config);
    expect(deps.sleep).toHaveBeenCalledTimes(8);
  });
});

describe("ports stop action", () => {
  const ctx = { instance: "ports", config, env: {}, signal: new AbortController().signal, log: () => {}, refresh: () => {} };

  it.each([[{ pid: "500", port: 3000, process: "node.exe" }], [{ ...input, extra: 1 }], [{ pid: -1, port: 3000, process: "x" }], [{ pid: 500, port: 70000, process: "x" }], [null]])(
    "rejects invalid input %j with 400 and kills nothing",
    async bad => {
      const deps = fakeDeps();
      expect(await statusOf(portsCollector(deps).actions!.stop!(ctx, bad))).toBe(400);
      expect(deps.killProcess).not.toHaveBeenCalled();
    },
  );
});

describe.runIf(process.platform === "win32")("stopListener on Windows", () => {
  let child: ChildProcess | undefined;
  afterEach(() => void child?.kill());

  it("stops a real node server it started itself, found through netstat and tasklist", { timeout: 20_000 }, async () => {
    child = spawn(process.execPath, ["-e", "const s=require('node:http').createServer().listen(0,'127.0.0.1',()=>console.log(s.address().port))"], {
      windowsHide: true,
    });
    const [chunk] = (await once(child.stdout!, "data")) as [Buffer];
    const port = Number(chunk.toString().trim());
    const exited = once(child, "exit");

    await stopListener({ ...systemStopDeps, self: { pid: process.pid, port: 4700 } }, { pid: child.pid!, port, process: "node.exe" }, config);

    await exited;
    expect((await listListeners()).some(l => l.port === port)).toBe(false);
  });
});
