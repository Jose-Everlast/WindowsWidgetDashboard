import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNetstatListeners, parseTasklistRows } from "../../server/lib/win";
import { PortsConfig } from "./manifest";
import { buildListeners, isExposed, stopBlocker, type ProcessInfo } from "./parse";

const raw = parseNetstatListeners(readFileSync(new URL("../../server/lib/fixtures/netstat.txt", import.meta.url), "latin1"));
const processes = new Map(
  parseTasklistRows(readFileSync(new URL("../../server/lib/fixtures/tasklist.csv", import.meta.url), "latin1")).map(r => [
    r.pid,
    { name: r.name, session: r.session },
  ]),
);
const self = { pid: 1, port: 4700 };
const node = (name = "node.exe"): ProcessInfo => ({ name, session: "Console" });

describe("buildListeners", () => {
  it("drops ports below minPort and excluded system processes from real netstat output", () => {
    const { listeners } = buildListeners(raw, processes, PortsConfig.parse({}), self);
    expect(listeners.every(l => l.port >= 1024)).toBe(true);
    expect(listeners.some(l => l.process === "svchost.exe" || l.process === "lsass.exe")).toBe(false);
    expect(listeners.map(l => l.port)).toEqual([...listeners.map(l => l.port)].sort((a, b) => a - b));
  });

  it("merges IPv4/IPv6 twins, keeps the most open address, applies labels and marks what can be stopped", () => {
    const procs = new Map([[7, node()]]);
    const { listeners } = buildListeners(
      [
        { port: 3000, address: "127.0.0.1", pid: 7 },
        { port: 3000, address: "::", pid: 7 },
        { port: 3000, address: "::1", pid: 7 },
        { port: 4700, address: "127.0.0.1", pid: 8 },
      ],
      procs,
      PortsConfig.parse({ labels: { "3000": "relaunch-radar API" } }),
      self,
    );
    expect(listeners).toEqual([
      { port: 3000, address: "::", pid: 7, process: "node.exe", label: "relaunch-radar API", stoppable: true },
      { port: 4700, address: "127.0.0.1", pid: 8, process: null, stoppable: false },
    ]);
  });

  it("offers no stop when allowStop is off", () => {
    const { listeners } = buildListeners([{ port: 3000, address: "127.0.0.1", pid: 7 }], new Map([[7, node()]]), PortsConfig.parse({ allowStop: false }), self);
    expect(listeners[0]!.stoppable).toBe(false);
  });
});

describe("buildListeners address ranking", () => {
  it("prefers wildcard over LAN over loopback regardless of input order", () => {
    const procs = new Map([[7, node()]]);
    const cfg = PortsConfig.parse({});
    const addrOf = (addresses: string[]) =>
      buildListeners(addresses.map(address => ({ port: 3000, address, pid: 7 })), procs, cfg, self).listeners[0]?.address;
    expect(addrOf(["127.0.0.1", "192.0.2.5"])).toBe("192.0.2.5");
    expect(addrOf(["192.0.2.5", "127.0.0.1"])).toBe("192.0.2.5");
    expect(addrOf(["192.0.2.5", "0.0.0.0", "127.0.0.1"])).toBe("0.0.0.0");
    expect(addrOf(["::1", "127.0.0.1"])).toBe("::1");
  });
});

describe("stopBlocker", () => {
  const allowed = { ...self, allowStop: true };
  const l = { pid: 500, port: 3000, process: "node.exe", session: "Console" };

  it("allows an ordinary desktop process", () => {
    expect(stopBlocker(l, allowed)).toBeNull();
  });

  it.each([
    ["switched off", l, { ...allowed, allowStop: false }, "Stoppen ist ausgeschaltet"],
    ["own PID", { ...l, pid: 1 }, allowed, "Das ist das Dashboard selbst"],
    ["own port", { ...l, port: 4700 }, allowed, "Das ist das Dashboard selbst"],
    ["PID 4", { ...l, pid: 4 }, allowed, "Systemprozess"],
    ["system name, any case", { ...l, process: "SvcHost.EXE" }, allowed, "Systemprozess"],
    ["unknown process", { ...l, process: null }, allowed, "Prozess unbekannt"],
    ["Windows service session", { ...l, session: "Services" }, allowed, "Windows-Dienst"],
  ])("blocks: %s", (_, listener, s, reason) => {
    expect(stopBlocker(listener, s)).toBe(reason);
  });
});

describe("isExposed", () => {
  it("flags wildcard and LAN addresses, not loopback", () => {
    expect(isExposed("0.0.0.0")).toBe(true);
    expect(isExposed("::")).toBe(true);
    expect(isExposed("192.0.2.2")).toBe(true);
    expect(isExposed("127.0.0.1")).toBe(false);
    expect(isExposed("::1")).toBe(false);
  });
});
