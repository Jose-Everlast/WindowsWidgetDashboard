import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNetstatListeners, parseTasklist } from "../../server/lib/win";
import { PortsConfig } from "./manifest";
import { buildListeners, isExposed } from "./parse";

const raw = parseNetstatListeners(readFileSync(new URL("../../server/lib/fixtures/netstat.txt", import.meta.url), "latin1"));
const processes = parseTasklist(readFileSync(new URL("../../server/lib/fixtures/tasklist.csv", import.meta.url), "latin1"));

describe("buildListeners", () => {
  it("drops ports below minPort and excluded system processes from real netstat output", () => {
    const { listeners } = buildListeners(raw, processes, PortsConfig.parse({}));
    expect(listeners.every(l => l.port >= 1024)).toBe(true);
    expect(listeners.some(l => l.process === "svchost.exe" || l.process === "lsass.exe")).toBe(false);
    expect(listeners.map(l => l.port)).toEqual([...listeners.map(l => l.port)].sort((a, b) => a - b));
  });

  it("merges IPv4/IPv6 twins, keeps the most open address and applies labels", () => {
    const procs = new Map([[7, "node.exe"]]);
    const { listeners } = buildListeners(
      [
        { port: 3000, address: "127.0.0.1", pid: 7 },
        { port: 3000, address: "::", pid: 7 },
        { port: 3000, address: "::1", pid: 7 },
        { port: 4700, address: "127.0.0.1", pid: 8 },
      ],
      procs,
      PortsConfig.parse({ labels: { "3000": "relaunch-radar API" } }),
    );
    expect(listeners).toEqual([
      { port: 3000, address: "::", pid: 7, process: "node.exe", label: "relaunch-radar API" },
      { port: 4700, address: "127.0.0.1", pid: 8, process: null },
    ]);
  });
});

describe("buildListeners address ranking", () => {
  it("prefers wildcard over LAN over loopback regardless of input order", () => {
    const procs = new Map([[7, "node.exe"]]);
    const cfg = PortsConfig.parse({});
    const addrOf = (addresses: string[]) =>
      buildListeners(addresses.map(address => ({ port: 3000, address, pid: 7 })), procs, cfg).listeners[0]?.address;
    expect(addrOf(["127.0.0.1", "192.0.2.5"])).toBe("192.0.2.5");
    expect(addrOf(["192.0.2.5", "127.0.0.1"])).toBe("192.0.2.5");
    expect(addrOf(["192.0.2.5", "0.0.0.0", "127.0.0.1"])).toBe("0.0.0.0");
    expect(addrOf(["::1", "127.0.0.1"])).toBe("::1");
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
