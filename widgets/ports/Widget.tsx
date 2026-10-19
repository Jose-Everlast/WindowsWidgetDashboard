import type { WidgetProps } from "@shared/widget-contract";
import type { PortsData } from "./manifest";
import { isExposed } from "./parse";

export default function PortsWidget({ state }: WidgetProps<PortsData>) {
  const { listeners } = state.data;
  if (!listeners.length) return <p className="text-sm text-muted">Keine Ports belegt.</p>;

  return (
    <ul className="flex h-full flex-col gap-1 overflow-y-auto pr-1 text-sm">
      {listeners.map(l => (
        <li key={`${l.port}-${l.pid}`} className="flex items-baseline gap-2">
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
          <span className="w-12 shrink-0 text-right text-xs text-muted tabular-nums">{l.pid}</span>
        </li>
      ))}
    </ul>
  );
}
