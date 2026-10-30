import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseNetstatListeners, parseTasklist, parseTasklistRows, sharedCall } from "./win";

// Real output from the target machine (German Windows 11), LAN IPs replaced by 192.0.2.x.
const netstat = readFileSync(new URL("./fixtures/netstat.txt", import.meta.url), "latin1");
const tasklist = readFileSync(new URL("./fixtures/tasklist.csv", import.meta.url), "latin1");

describe("parseNetstatListeners", () => {
  it("returns only listening TCP sockets from real output", () => {
    const listeners = parseNetstatListeners(netstat);
    expect(listeners.length).toBeGreaterThan(10);
    for (const l of listeners) {
      expect(l.port).toBeGreaterThan(0);
      expect(l.pid).toBeGreaterThanOrEqual(0);
    }
    // 127.0.0.1 ↔ 127.0.0.1 connections and UDP lines are in the fixture but are not listeners.
    const established = netstat.split(/\r?\n/).filter(l => /^\s+TCP\s+127\.0\.0\.1:\d+\s+127\.0\.0\.1:\d+/.test(l));
    expect(established.length).toBeGreaterThan(0);
    expect(listeners.some(l => l.address === "*")).toBe(false);
    // A real ESTABLISHED (HERGESTELLT) line: its local port 50061 is no listener.
    expect(netstat).toMatch(/HERGESTELLT/);
    expect(listeners.some(l => l.port === 50061)).toBe(false);
    expect(listeners.find(l => l.address === "::" && l.port === 135)).toBeDefined();
  });

  it("handles IPv6 brackets, CRLF and skips malformed lines", () => {
    const text = [
      "  TCP    [::1]:4700             [::]:0                 ABHÖREN         13004\r",
      "  TCP    127.0.0.1:4700         0.0.0.0:0              LISTENING       13004\r",
      "  TCP    127.0.0.1:4700         0.0.0.0:0              LISTENING       13004\r",
      "  TCP    kaputt                 0.0.0.0:0              LISTENING       x\r",
      "  UDP    0.0.0.0:5353           *:*                                    6816\r",
    ].join("\n");
    expect(parseNetstatListeners(text)).toEqual([
      { port: 4700, address: "::1", pid: 13004 },
      { port: 4700, address: "127.0.0.1", pid: 13004 },
    ]);
  });
});

describe("parseTasklist", () => {
  it("maps PIDs to image names and ignores the localized memory column", () => {
    const map = parseTasklist(tasklist);
    expect(map.get(4)).toBe("System");
    expect([...map.values()]).toContain("claude.exe");
    expect(parseTasklist('Kaputt\n"x.exe","12","Console","1","1.024 K"')).toEqual(new Map([[12, "x.exe"]]));
  });
});

describe("parseTasklistRows", () => {
  it("reads the session, so Windows services can be told apart from desktop programs", () => {
    const rows = parseTasklistRows(tasklist);
    expect(rows.find(r => r.pid === 4)).toEqual({ pid: 4, name: "System", session: "Services" });
    expect(rows.some(r => r.session === "Console")).toBe(true);
  });

  it("returns nothing for the INFORMATION line of a /fi filter without match", () => {
    // Real output on the target machine (German Windows 11).
    expect(parseTasklistRows("INFORMATION: Es werden keine Aufgaben mit den angegebenen Kriterien ausgeführt.\r\n")).toEqual([]);
  });
});

describe("sharedCall", () => {
  it("shares one load within the TTL and reloads after it", async () => {
    let t = 0;
    const load = vi.fn(async () => t);
    const get = sharedCall(load, 5000, () => t);
    expect(await get()).toBe(0);
    t = 1000;
    expect(await get()).toBe(0);
    expect(load).toHaveBeenCalledTimes(1);
    t = 6000;
    expect(await get()).toBe(6000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not let one caller's abort fail the others", async () => {
    let finish: (v: string) => void = () => {};
    const get = sharedCall(() => new Promise<string>(r => (finish = r)), 5000);
    const ports = new AbortController();
    const a = get(ports.signal);
    const b = get(new AbortController().signal);
    ports.abort(new Error("ports timeout"));
    finish("tasklist");
    await expect(a).rejects.toThrow("ports timeout");
    await expect(b).resolves.toBe("tasklist");
  });

  it("does not cache a failed load", async () => {
    let fail = true;
    const get = sharedCall(async () => {
      if (fail) throw new Error("tasklist kaputt");
      return "ok";
    }, 5000);
    await expect(get()).rejects.toThrow("kaputt");
    fail = false;
    expect(await get()).toBe("ok");
  });
});
