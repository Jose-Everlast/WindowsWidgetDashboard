import { useEffect, useState } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import { relativeTime } from "../../web/src/lib/time";
import type { AgentsData } from "./manifest";

const BADGE = { claude: "bg-accent/15 text-accent", codex: "bg-good/15 text-good" } as const;

function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function AgentsWidget({ state }: WidgetProps<AgentsData>) {
  const { processes, sessions } = state.data;
  const now = useNow();

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="text-xs text-muted">
        {processes.claude ?? "?"} Claude · {processes.codex ?? "?"} Codex Prozesse
      </div>
      {!sessions.length && <p className="text-sm text-muted">Keine Sessions in letzter Zeit.</p>}
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1 text-sm">
        {sessions.map(s => (
          <li key={`${s.agent}-${s.sessionId}`} className="flex items-center gap-2" title={`${s.cwd}\n${s.sessionId}`}>
            <span
              className={`size-2 shrink-0 rounded-full ${s.active ? "bg-good" : "bg-muted/50"}`}
              aria-label={s.active ? "aktiv" : "inaktiv"}
            />
            <span className={`shrink-0 rounded px-1.5 text-xs ${BADGE[s.agent]}`}>{s.agent}</span>
            <span className={`min-w-0 flex-1 truncate ${s.active ? "" : "text-muted"}`}>
              {s.project}
              {s.branch && <span className="text-muted"> ({s.branch})</span>}
              {s.kind === "exec" && <span className="text-muted"> · exec</span>}
            </span>
            <span className="shrink-0 text-xs text-muted">{relativeTime(s.lastActivity, now)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
