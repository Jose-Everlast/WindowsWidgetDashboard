// Pure helpers, also imported by Widget.tsx: no Node APIs here.
import type { PortsConfig, PortsData } from "./manifest";

interface RawListener {
  port: number;
  address: string;
  pid: number;
}

const WILDCARD = new Set(["0.0.0.0", "::"]);
const isLoopback = (address: string) => /^(127\.|::1$)/.test(address);

/** Reachable from the network, not just this machine. */
export const isExposed = (address: string) => !isLoopback(address);

/** How open a bind address is: wildcard > LAN address > loopback. */
const openness = (address: string) => (WILDCARD.has(address) ? 2 : isLoopback(address) ? 0 : 1);

/** Filters system noise, merges the IPv4/IPv6 twins of one socket and attaches labels. */
export function buildListeners(raw: RawListener[], processes: Map<number, string>, config: PortsConfig): PortsData {
  const excluded = new Set(config.excludeProcesses.map(p => p.toLowerCase()));
  const byKey = new Map<string, PortsData["listeners"][number]>();

  for (const l of raw) {
    if (l.port < config.minPort) continue;
    const process = processes.get(l.pid) ?? null;
    if (process && excluded.has(process.toLowerCase())) continue;
    const key = `${l.port}|${l.pid}`;
    const existing = byKey.get(key);
    // Keep the most open address, independent of netstat's order (it lists loopback before LAN).
    if (existing && openness(existing.address) >= openness(l.address)) continue;
    const label = config.labels[String(l.port)];
    byKey.set(key, { port: l.port, address: l.address, pid: l.pid, process, ...(label && { label }) });
  }

  return { listeners: [...byKey.values()].sort((a, b) => a.port - b.port || a.pid - b.pid) };
}
