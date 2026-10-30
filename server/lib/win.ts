// Fast Windows commands only. WMI/CIM (Get-NetTCPConnection, Win32_Process) took 39–49 s on the
// target machine, see PRD section 7 and .agents/reference/widgets.md.
import { execFile } from "node:child_process";

export interface Listener {
  port: number;
  address: string;
  pid: number;
}

export async function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string> {
  if (process.platform !== "win32") throw new Error(`${cmd}: nur unter Windows verfügbar`);
  return new Promise((resolve, reject) => {
    // No shell: fixed arguments, nothing user-controlled.
    execFile(
      cmd,
      args,
      { windowsHide: true, encoding: "latin1", maxBuffer: 8 * 1024 * 1024, timeout: opts.timeoutMs ?? 10_000, signal: opts.signal },
      (err, stdout) => (err ? reject(new Error(`${cmd} fehlgeschlagen: ${err.message}`, { cause: err })) : resolve(stdout)),
    );
  });
}

const LISTEN_REMOTE = new Set(["0.0.0.0:0", "[::]:0"]);

/**
 * Listening TCP sockets from `netstat -ano`. The state column is localized ("ABHÖREN") and comes in
 * the OEM codepage, so a socket counts as listening when its remote address is 0.0.0.0:0 or [::]:0.
 */
export function parseNetstatListeners(text: string): Listener[] {
  const seen = new Set<string>();
  const result: Listener[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols[0] !== "TCP" || cols.length < 5) continue;
    const local = cols[1]!;
    if (!LISTEN_REMOTE.has(cols[2]!)) continue;
    const pid = Number(cols[cols.length - 1]);
    const sep = local.lastIndexOf(":");
    const port = Number(local.slice(sep + 1));
    if (sep < 0 || !Number.isInteger(port) || port <= 0 || !Number.isInteger(pid)) continue;
    const address = local.slice(0, sep).replace(/^\[(.*)\]$/, "$1");
    const key = `${address}|${port}|${pid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ port, address, pid });
  }
  return result;
}

export interface ProcessRow {
  pid: number;
  name: string;
  /** "Console" for the desktop session, "Services" for session 0 (not localized). */
  session: string;
}

/**
 * Rows of `tasklist /fo csv /nh`. The localized memory column is ignored, and so is the "INFORMATION: …"
 * line tasklist prints when a /fi filter matches nothing.
 */
export function parseTasklistRows(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^"([^"]+)","(\d+)","([^"]*)"/.exec(line.trim());
    if (m) rows.push({ pid: Number(m[2]), name: m[1]!, session: m[3]! });
  }
  return rows;
}

/** PID → image name. */
export function parseTasklist(text: string): Map<number, string> {
  return new Map(parseTasklistRows(text).map(r => [r.pid, r.name]));
}

export async function listListeners(signal?: AbortSignal): Promise<Listener[]> {
  return parseNetstatListeners(await run("netstat", ["-ano"], { signal }));
}

/** Rejects as soon as the caller's signal aborts, without touching the shared promise. */
export function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      v => (signal.removeEventListener("abort", onAbort), resolve(v)),
      e => (signal.removeEventListener("abort", onAbort), reject(e)),
    );
  });
}

/**
 * One call shared by all callers within ttlMs. The load runs without any caller's signal, so one
 * caller aborting cannot fail the others; a failed load is not cached.
 */
export function sharedCall<T>(load: () => Promise<T>, ttlMs: number, now: () => number = Date.now) {
  let cache: { at: number; value: Promise<T> } | undefined;
  return (signal?: AbortSignal): Promise<T> => {
    if (!cache || now() - cache.at >= ttlMs) {
      const value = load();
      cache = { at: now(), value };
      value.catch(() => {
        if (cache?.value === value) cache = undefined;
      });
    }
    return withSignal(cache.value, signal);
  };
}

// Ports and agents both need tasklist in the same 10 s rhythm: share one call (run() has its own timeout).
export const listProcessRows = sharedCall(() => run("tasklist", ["/fo", "csv", "/nh"]).then(parseTasklistRows), 5_000);

export const listProcesses = (signal?: AbortSignal): Promise<Map<number, string>> =>
  listProcessRows(signal).then(rows => new Map(rows.map(r => [r.pid, r.name])));

function assertPid(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Ungültige PID ${pid}`);
}

/** One process, fresh (no shared cache): right before acting on a PID it must be current. */
export async function processRow(pid: number, signal?: AbortSignal): Promise<ProcessRow | null> {
  assertPid(pid);
  const rows = parseTasklistRows(await run("tasklist", ["/fo", "csv", "/nh", "/fi", `PID eq ${pid}`], { signal }));
  return rows.find(r => r.pid === pid) ?? null;
}

/**
 * Ends one process. Deliberately without /T: the tree of e.g. Code.exe holds the terminals running this
 * dashboard and coding agents, and checking the tree would need WMI (39 s+ on this machine).
 */
export async function killProcess(pid: number, signal?: AbortSignal): Promise<void> {
  assertPid(pid);
  await run("taskkill", ["/PID", String(pid), "/F"], { signal });
}
