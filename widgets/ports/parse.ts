// Pure helpers, also imported by Widget.tsx: no Node APIs here.
import type { PortsConfig, PortsData } from "./manifest";

interface RawListener {
  port: number;
  address: string;
  pid: number;
}

export interface ProcessInfo {
  name: string;
  /** tasklist session: "Console" for the desktop, "Services" for session 0. */
  session: string;
}

const WILDCARD = new Set(["0.0.0.0", "::"]);
const isLoopback = (address: string) => /^(127\.|::1$)/.test(address);

/** Reachable from the network, not just this machine. */
export const isExposed = (address: string) => !isLoopback(address);

/** How open a bind address is: wildcard > LAN address > loopback. */
const openness = (address: string) => (WILDCARD.has(address) ? 2 : isLoopback(address) ? 0 : 1);

/** Never stopped from the dashboard, whatever session they run in (lowercase image names). */
const PROTECTED = new Set([
  "system",
  "secure system",
  "registry",
  "smss.exe",
  "csrss.exe",
  "wininit.exe",
  "winlogon.exe",
  "services.exe",
  "lsass.exe",
  "svchost.exe",
  "dwm.exe",
  "fontdrvhost.exe",
  "explorer.exe",
]);

/**
 * Why the process behind a port must not be stopped, or null if it may. One rule for both the payload
 * (no button) and the stop action (403), so the tile never offers what the server refuses.
 */
export function stopBlocker(
  l: { pid: number; port: number; process: string | null; session: string | null },
  self: { pid: number; port: number; allowStop: boolean },
): string | null {
  if (!self.allowStop) return "Stoppen ist ausgeschaltet";
  if (l.pid === self.pid || l.port === self.port) return "Das ist das Dashboard selbst";
  if (l.pid <= 4 || PROTECTED.has(l.process?.toLowerCase() ?? "")) return "Systemprozess";
  if (!l.process) return "Prozess unbekannt";
  if (l.session?.toLowerCase() === "services") return "Windows-Dienst";
  return null;
}

/** Filters system noise, merges the IPv4/IPv6 twins of one socket, attaches labels and whether it can be stopped. */
export function buildListeners(
  raw: RawListener[],
  processes: Map<number, ProcessInfo>,
  config: PortsConfig,
  self: { pid: number; port: number },
): PortsData {
  const excluded = new Set(config.excludeProcesses.map(p => p.toLowerCase()));
  const byKey = new Map<string, PortsData["listeners"][number]>();

  for (const l of raw) {
    if (l.port < config.minPort) continue;
    const info = processes.get(l.pid);
    const process = info?.name ?? null;
    if (process && excluded.has(process.toLowerCase())) continue;
    const key = `${l.port}|${l.pid}`;
    const existing = byKey.get(key);
    // Keep the most open address, independent of netstat's order (it lists loopback before LAN).
    if (existing && openness(existing.address) >= openness(l.address)) continue;
    const label = config.labels[String(l.port)];
    const stoppable =
      stopBlocker({ pid: l.pid, port: l.port, process, session: info?.session ?? null }, { ...self, allowStop: config.allowStop }) === null;
    byKey.set(key, { port: l.port, address: l.address, pid: l.pid, process, ...(label && { label }), stoppable });
  }

  return { listeners: [...byKey.values()].sort((a, b) => a.port - b.port || a.pid - b.pid) };
}
