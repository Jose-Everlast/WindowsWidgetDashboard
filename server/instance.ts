// Single-instance check and data/server.json: answers "is the dashboard running, and where?" without WMI.
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { SERVER_APP_ID, type ServerInfo, type ServerMode } from "@shared/api";
import { readJsonFile, writeJsonFileAtomic } from "./lib/json-file";

const ServerInfoSchema = z.object({
  app: z.literal(SERVER_APP_ID),
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  mode: z.enum(["dev", "prod", "unknown"]),
  startedAt: z.iso.datetime(),
  version: z.string(),
});
const HealthSchema = z.object({ server: ServerInfoSchema });
// Servers from before ServerInfo existed answer { ok, uptimeS, instances } only.
const LegacyHealthSchema = z.object({ ok: z.literal(true), uptimeS: z.number(), instances: z.array(z.unknown()) });

/** npm sets npm_lifecycle_event: "start" → prod, "dev"/"dev:server" → dev. */
export function serverMode(lifecycleEvent: string | undefined): ServerMode {
  if (lifecycleEvent === "start") return "prod";
  if (lifecycleEvent?.startsWith("dev")) return "dev";
  return "unknown";
}

export const instanceFile = (dataDir: string) => join(dataDir, "server.json");

/** Last written instance, or null when missing or unreadable (it is only a hint). */
export async function readInstance(file: string): Promise<ServerInfo | null> {
  try {
    return await readJsonFile(file, ServerInfoSchema);
  } catch {
    return null;
  }
}

export const writeInstance = (file: string, info: ServerInfo) => writeJsonFileAtomic(file, info);

/** Sync, for process "exit": removes the file only if it still belongs to this process. */
export function removeInstance(file: string, pid: number): void {
  try {
    const current = ServerInfoSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (current.success && current.data.pid === pid) unlinkSync(file);
  } catch {
    // Missing or broken file: nothing to clean up.
  }
}

export interface ProbeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Asks 127.0.0.1:<port>/api/health; null unless a windowsDashboard server answers. */
export async function probe(port: number, o: ProbeOptions = {}): Promise<ServerInfo | null> {
  const fetchImpl = o.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(o.timeoutMs ?? 1500) });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const parsed = HealthSchema.safeParse(body);
    if (parsed.success) return parsed.data.server;
    const legacy = LegacyHealthSchema.safeParse(body);
    if (!legacy.success) return null;
    // pid 0 = unknown; describeServer prints "PID ?".
    const startedAt = new Date(Date.now() - legacy.data.uptimeS * 1000).toISOString();
    return { app: SERVER_APP_ID, pid: 0, port, mode: "unknown", startedAt, version: "älter" };
  } catch {
    return null;
  }
}

export interface FindRunningOptions extends ProbeOptions {
  file: string;
  /** Checked besides the port in the file, e.g. the configured PORT. */
  ports: number[];
  /** A server that is just shutting down (tsx watch restart) must not block the new one. */
  confirmAttempts?: number;
  confirmDelayMs?: number;
}

/** A running dashboard on the port from data/server.json or one of `ports`, confirmed over a short window. */
export async function findRunning(o: FindRunningOptions): Promise<ServerInfo | null> {
  const fromFile = await readInstance(o.file);
  const ports = [...new Set([...(fromFile ? [fromFile.port] : []), ...o.ports])];
  const attempts = o.confirmAttempts ?? 4;
  for (const port of ports) {
    let found: ServerInfo | null = null;
    for (let i = 0; i < attempts; i++) {
      found = await probe(port, o);
      if (!found) break;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, o.confirmDelayMs ?? 500));
    }
    if (found) return found;
  }
  return null;
}

/** "http://127.0.0.1:4700 · prod · PID 123 · seit 07:41 (1 h 12 min)" */
export function describeServer(info: ServerInfo, now: Date = new Date()): string {
  const started = new Date(info.startedAt);
  const clock = started.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const min = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 60_000));
  const age = min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  const legacy = info.version === "älter" ? " · ältere Version, Neustart zeigt Details" : "";
  return `http://127.0.0.1:${info.port} · ${info.mode} · PID ${info.pid || "?"} · seit ${clock} (${age})${legacy}`;
}
