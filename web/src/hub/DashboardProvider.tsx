import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { LayoutResponse } from "@shared/api";
import type { WidgetState } from "@shared/widget-contract";

const RETRY_MS = 5_000;
// Server pings every 15 s; after 40 s of silence the connection counts as dead.
const WATCHDOG_MS = 40_000;

interface Dashboard {
  layout: LayoutResponse | null;
  states: Record<string, WidgetState>;
  online: boolean;
  refresh(instance: string): Promise<void>;
}

const DashboardContext = createContext<Dashboard | null>(null);

export function useDashboard(): Dashboard {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard outside <DashboardProvider>");
  return ctx;
}

async function fetchLayout(): Promise<{ layout: LayoutResponse; json: string }> {
  const res = await fetch("/api/layout");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.text();
  return { layout: JSON.parse(json) as LayoutResponse, json };
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<LayoutResponse | null>(null);
  const [states, setStates] = useState<Record<string, WidgetState>>({});
  const [online, setOnline] = useState(false);
  const layoutJson = useRef<string | null>(null);

  // Layout: retry until the server answers.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      fetchLayout()
        .then(({ layout, json }) => {
          if (cancelled) return;
          layoutJson.current = json;
          setLayout(layout);
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(load, RETRY_MS);
        });
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Live states over SSE. Unlike relaunch-radar there is no pause while hidden: a wallpaper is always "visible".
  useEffect(() => {
    let es: EventSource | null = null;
    let lastEventAt = Date.now();
    let wasOffline = false;

    const data = <T,>(e: Event) => JSON.parse((e as MessageEvent<string>).data) as T;

    const onReconnected = async () => {
      // New widgets after a server restart: reload the page once the layout changed.
      try {
        const { json } = await fetchLayout();
        if (layoutJson.current !== null && json !== layoutJson.current) location.reload();
      } catch {
        // the next reconnect tries again
      }
    };

    const connect = () => {
      es?.close();
      es = new EventSource("/api/stream");
      es.addEventListener("snapshot", e => {
        lastEventAt = Date.now();
        setStates(Object.fromEntries(data<WidgetState[]>(e).map(s => [s.instance, s])));
        setOnline(true);
        if (wasOffline) {
          wasOffline = false;
          void onReconnected();
        }
      });
      es.addEventListener("widget", e => {
        lastEventAt = Date.now();
        const s = data<WidgetState>(e);
        setStates(prev => ({ ...prev, [s.instance]: s }));
      });
      es.addEventListener("ping", () => {
        lastEventAt = Date.now();
      });
      // EventSource reconnects on its own; the next snapshot sets online again.
      es.onerror = () => {
        wasOffline = true;
        setOnline(false);
      };
    };

    connect();
    // Watchdog for silent deaths (standby, half-open connections) where onerror never fires.
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventAt > WATCHDOG_MS) {
        wasOffline = true;
        setOnline(false);
        lastEventAt = Date.now();
        connect();
      }
    }, 5_000);

    return () => {
      clearInterval(watchdog);
      es?.close();
    };
  }, []);

  const refresh = useCallback(async (instance: string) => {
    try {
      // JSON content type: the server rejects state-changing requests without it (CSRF guard).
      const res = await fetch(`/api/widgets/${encodeURIComponent(instance)}/actions/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) return;
      const s = (await res.json()) as WidgetState;
      setStates(prev => ({ ...prev, [s.instance]: s }));
    } catch {
      // Server unreachable: the offline banner already says so.
    }
  }, []);

  return <DashboardContext.Provider value={{ layout, states, online, refresh }}>{children}</DashboardContext.Provider>;
}
