import { AlertTriangle, RotateCw, Settings } from "lucide-react";
import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import type { LayoutWidget } from "@shared/api";
import type { WidgetState, WidgetStatus } from "@shared/widget-contract";
import { relativeTime } from "../lib/time";
import { GenericView } from "../views/GenericView";
import { useDashboard } from "./DashboardProvider";
import { widgetComponents } from "./registry";

const DOT: Record<WidgetStatus, string> = {
  ok: "bg-good",
  stale: "bg-warn",
  error: "bg-bad",
  unconfigured: "bg-muted",
};

/**
 * One crashing widget must not take the whole hub down. A new resetKey (the data's updatedAt)
 * clears the error, so the tile recovers as soon as renderable data arrives.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidUpdate(prev: { resetKey: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  override render() {
    if (this.state.error) return <Message icon="error" text={`Darstellungsfehler: ${this.state.error.message}`} />;
    return this.props.children;
  }
}

function Message({ icon, text }: { icon: "error" | "setup"; text: string }) {
  const Icon = icon === "error" ? AlertTriangle : Settings;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
      <Icon className={`size-6 ${icon === "error" ? "text-bad" : ""}`} />
      <span className="max-w-[90%] break-words">{text}</span>
    </div>
  );
}

/** Re-renders every 30 s so "vor 3 Min." stays current. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Body({ widget, state }: { widget: LayoutWidget; state: WidgetState | undefined }) {
  if (!state || (state.data === null && state.status === "stale")) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">lädt …</div>;
  }
  if (state.data === null) {
    return state.status === "unconfigured" ? (
      <Message icon="setup" text={`Nicht eingerichtet: ${state.error ?? ""}`} />
    ) : (
      <Message icon="error" text={state.error ?? "Fehler"} />
    );
  }
  const Custom = widget.hasComponent ? widgetComponents[widget.type] : undefined;
  return (
    <ErrorBoundary resetKey={state.updatedAt}>
      {Custom ? (
        <Suspense fallback={null}>
          <Custom state={state as WidgetState<unknown> & { data: unknown }} config={widget.config} />
        </Suspense>
      ) : (
        <GenericView data={state.data} />
      )}
    </ErrorBoundary>
  );
}

export function WidgetFrame({ widget }: { widget: LayoutWidget }) {
  const { states, refresh } = useDashboard();
  const state = states[widget.instance];
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const canRefresh = state?.status !== "unconfigured" && !(state?.status === "error" && state.updatedAt === null && state.checkedAt === null);

  const onRefresh = async () => {
    setBusy(true);
    try {
      await refresh(widget.instance);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card p-4 backdrop-blur"
      style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}
    >
      <header className="mb-3 flex items-center gap-2 text-sm">
        <span className={`size-2 rounded-full ${state ? DOT[state.status] : "bg-muted"}`} title={state?.status} />
        <h2 className="font-medium">{widget.title}</h2>
        <span className="ml-auto text-xs text-muted">{relativeTime(state?.updatedAt ?? null, now)}</span>
        {canRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="rounded p-1 text-muted hover:bg-line/60 hover:text-fg disabled:opacity-50"
            aria-label={`${widget.title} aktualisieren`}
          >
            <RotateCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Body widget={widget} state={state} />
      </div>
      {state?.status === "stale" && state.data !== null && state.error && (
        <footer className="mt-2 truncate border-t border-warn/30 pt-1.5 text-xs text-warn" title={state.error}>
          Veraltet: {state.error}
        </footer>
      )}
    </section>
  );
}
