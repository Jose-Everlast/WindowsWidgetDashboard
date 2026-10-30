import { Power } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import { useDashboard } from "../../web/src/hub/DashboardProvider";
import type { PortsData } from "./manifest";
import { isExposed } from "./parse";

/** How long "Wirklich stoppen?" waits for the second click. */
export const ARM_MS = 4000;
const ERROR_MS = 6000;

type Listener = PortsData["listeners"][number];

export default function PortsWidget({ state }: WidgetProps<PortsData>) {
  const { runAction } = useDashboard();
  const { listeners } = state.data;
  // Two clicks, no browser dialog (it would block Lively): the first arms the row, the second stops.
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(armTimer.current);
      clearTimeout(errorTimer.current);
    },
    [],
  );

  const stop = async (l: Listener, key: string) => {
    clearTimeout(armTimer.current);
    if (armed !== key) {
      setArmed(key);
      armTimer.current = setTimeout(() => setArmed(null), ARM_MS);
      return;
    }
    setArmed(null);
    setBusy(key);
    const r = await runAction(state.instance, "stop", { pid: l.pid, port: l.port, process: l.process });
    setBusy(null);
    clearTimeout(errorTimer.current);
    setError(r.ok ? null : r.error);
    if (!r.ok) errorTimer.current = setTimeout(() => setError(null), ERROR_MS);
  };

  if (!listeners.length) return <p className="text-sm text-muted">Keine Ports belegt.</p>;

  return (
    <div className="flex h-full flex-col gap-1 text-sm">
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {listeners.map(l => {
          const key = `${l.port}-${l.pid}`;
          return (
            <li key={key} className="group flex items-baseline gap-2">
              <span className="w-12 shrink-0 text-right font-medium tabular-nums">{l.port}</span>
              <span className="min-w-0 flex-1 truncate" title={`${l.process ?? "?"} · PID ${l.pid} · ${l.address}`}>
                {l.label ?? l.process ?? "unbekannt"}
                {l.label && <span className="text-muted"> · {l.process ?? "?"}</span>}
              </span>
              {isExposed(l.address) && (
                <span className="text-xs text-warn" title={`lauscht auf ${l.address}: im Netzwerk erreichbar`}>
                  Netz
                </span>
              )}
              {/* The stop button shares the PID column (the tile is narrow): the PID gives way on hover. */}
              {l.stoppable && l.process && armed === key ? (
                <button
                  type="button"
                  title={`${l.process} (PID ${l.pid}) wirklich beenden?`}
                  onClick={() => void stop(l, key)}
                  className="shrink-0 rounded-sm px-1 text-xs font-semibold text-bad hover:bg-bad/15"
                >
                  Stoppen?
                </button>
              ) : (
                <span className="relative w-12 shrink-0 text-right text-xs text-muted tabular-nums">
                  <span className={l.stoppable && l.process ? "group-focus-within:invisible group-hover:invisible" : ""}>{l.pid}</span>
                  {l.stoppable && l.process && (
                    <button
                      type="button"
                      aria-label={`${l.process} auf Port ${l.port} stoppen`}
                      title={`${l.process} (PID ${l.pid}) beenden`}
                      disabled={busy === key}
                      onClick={() => void stop(l, key)}
                      className="absolute inset-y-0 right-0 grid w-6 place-items-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad focus-visible:opacity-100 disabled:opacity-40"
                    >
                      <Power className="size-3.5" />
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
