import { useEffect, useState } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import { openUrl } from "../../web/src/lib/openUrl";
import { relativeTime } from "../../web/src/lib/time";
import type { RelaunchRadarData } from "./manifest";
import { leadUrl } from "./parse";

type Status = NonNullable<RelaunchRadarData["autopilot"]>["status"];

const STATUS: Record<Status, { label: string; cls: string }> = {
  running: { label: "läuft", cls: "bg-good/15 text-good" },
  waiting: { label: "wartet", cls: "bg-warn/15 text-warn" },
  paused: { label: "pausiert", cls: "bg-warn/15 text-warn" },
  idle: { label: "untätig", cls: "bg-line text-muted" },
  off: { label: "aus", cls: "bg-line text-muted" },
};

function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

export default function RelaunchRadarWidget({ state }: WidgetProps<RelaunchRadarData>) {
  const { mode, apiError, uiUrl, autopilot, jobs, attention, notifications, unread } = state.data;
  const now = useNow();
  const open = (slug: string | null) => slug && void openUrl(leadUrl(uiUrl, slug));

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {mode === "file" ? (
          <span className="rounded px-1.5 text-xs text-warn bg-warn/15" title={apiError}>
            API offline – Dateimodus
          </span>
        ) : (
          autopilot && (
            <>
              <span className={`rounded px-1.5 text-xs ${STATUS[autopilot.status].cls}`}>
                Autopilot {STATUS[autopilot.status].label}
              </span>
              {autopilot.next && (
                <span className="min-w-0 truncate text-xs text-muted">
                  als Nächstes: {autopilot.next.name} · {autopilot.next.step}
                </span>
              )}
            </>
          )
        )}
        {unread > 0 && <span className="ml-auto text-xs text-accent">{unread} neu</span>}
      </div>

      {jobs && jobs.length > 0 && (
        <Section title="Läuft">
          {jobs.map(j => (
            <button
              key={`${j.type}-${j.startedAt}`}
              type="button"
              onClick={() => open(j.slug)}
              className="flex items-baseline gap-2 rounded text-left hover:bg-line/50"
            >
              <span className="text-xs text-good">{j.type}</span>
              <span className="min-w-0 flex-1 truncate">{j.name ?? j.slug ?? ""}</span>
              <span className="shrink-0 text-xs text-muted">
                seit {relativeTime(j.startedAt, now).replace(/^vor /, "")}
                {j.etaMin ? ` · ETA ${j.etaMin} min` : ""}
              </span>
            </button>
          ))}
        </Section>
      )}

      {attention && (
        <Section title="Wartet auf dich">
          <div className="flex gap-3 text-xs">
            <span className={attention.counts.rate ? "text-accent" : "text-muted"}>{attention.counts.rate} bewerten</span>
            <span className={attention.counts.failed ? "text-bad" : "text-muted"}>{attention.counts.failed} fehlgeschlagen</span>
            {attention.counts.limit > 0 && <span className="text-warn">{attention.counts.limit} Limit</span>}
          </div>
          {attention.items.map(a => (
            <button
              key={`${a.kind}-${a.slug}`}
              type="button"
              onClick={() => open(a.slug)}
              className="flex items-baseline gap-2 rounded text-left hover:bg-line/50"
              title={a.text}
            >
              <span className={`size-1.5 shrink-0 self-center rounded-full ${a.kind === "rate" ? "bg-accent" : a.kind === "failed" ? "bg-bad" : "bg-warn"}`} />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="shrink-0 text-xs text-muted">{relativeTime(a.at, now)}</span>
            </button>
          ))}
        </Section>
      )}

      <Section title="Zuletzt">
        {!notifications.length && <p className="text-muted">Keine Ereignisse.</p>}
        {notifications.map(n => (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n.slug)}
            disabled={!n.slug}
            className="flex flex-col rounded text-left enabled:hover:bg-line/50"
          >
            <span className="truncate">{n.title}</span>
            <span className="text-xs text-muted">
              {relativeTime(n.at, now)}
              {n.next.by !== "none" && (
                <span className={n.next.by === "du" ? "text-accent" : ""}> · {n.next.by === "du" ? "du: " : ""}{n.next.text}</span>
              )}
            </span>
          </button>
        ))}
      </Section>
    </div>
  );
}
