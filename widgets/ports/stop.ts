// Stops the process behind one listening port (server only). Re-checks right before the kill, because
// the tile may show a PID that has since exited or been reused by another process.
import { config as serverConfig } from "../../server/env";
import { HttpError } from "../../server/http";
import { killProcess, listListeners, processRow, type Listener, type ProcessRow } from "../../server/lib/win";
import type { PortsConfig, StopIn } from "./manifest";
import { stopBlocker } from "./parse";

export interface StopDeps {
  listListeners(signal?: AbortSignal): Promise<Listener[]>;
  processRow(pid: number, signal?: AbortSignal): Promise<ProcessRow | null>;
  killProcess(pid: number, signal?: AbortSignal): Promise<void>;
  sleep(ms: number): Promise<void>;
  /** The dashboard's own process and port: never stopped from its own tile. */
  self: { pid: number; port: number };
}

export const systemStopDeps: StopDeps = {
  listListeners,
  processRow,
  killProcess,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  self: { pid: process.pid, port: serverConfig.port },
};

const FREE_POLLS = 8;
const FREE_POLL_MS = 250;

export async function stopListener(deps: StopDeps, input: StopIn, config: PortsConfig, signal?: AbortSignal): Promise<void> {
  const { pid, port } = input;
  const holds = (listeners: Listener[]) => listeners.some(l => l.pid === pid && l.port === port);
  const [listeners, row] = await Promise.all([deps.listListeners(signal), deps.processRow(pid, signal)]);
  if (!holds(listeners)) throw new HttpError(409, `Port ${port} gehört nicht mehr zu PID ${pid}`);
  if (!row || row.name.toLowerCase() !== input.process.toLowerCase()) throw new HttpError(409, `PID ${pid} ist nicht mehr ${input.process}`);
  const reason = stopBlocker({ pid, port, process: row.name, session: row.session }, { ...deps.self, allowStop: config.allowStop });
  if (reason) throw new HttpError(403, reason);

  try {
    await deps.killProcess(pid, signal);
  } catch (err) {
    throw new HttpError(409, `${row.name} (PID ${pid}) ließ sich nicht beenden, evtl. braucht es Adminrechte`, err);
  }

  // Wait briefly for Windows to release the socket, so the collect after the action already shows it gone.
  // Still held after 2 s is no error: the process is ended, the next poll catches up.
  for (let i = 0; i < FREE_POLLS; i++) {
    await deps.sleep(FREE_POLL_MS);
    if (!holds(await deps.listListeners(signal).catch(() => []))) return;
  }
}
