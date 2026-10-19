import { ArrowDown, ArrowUp } from "lucide-react";
import type { z } from "zod";
import {
  WidgetView,
  type ListView,
  type MarkdownView,
  type ProgressView,
  type StatView,
  type StatusView,
  type Tone,
} from "@shared/widget-contract";
import { openUrl } from "../lib/openUrl";

const TONE_TEXT: Record<Tone, string> = { neutral: "text-fg", good: "text-good", warn: "text-warn", bad: "text-bad" };

export function StatViewC({ items }: z.infer<typeof StatView>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
      {items.map(i => (
        <div key={i.label} className="flex flex-col">
          <span className="text-xs text-muted">{i.label}</span>
          <span className={`flex items-baseline gap-1 text-2xl font-light tabular-nums ${TONE_TEXT[i.tone ?? "neutral"]}`}>
            {i.value}
            {i.unit && <span className="text-sm text-muted">{i.unit}</span>}
            {i.trend === "up" && <ArrowUp className="size-4 self-center" aria-label="steigend" />}
            {i.trend === "down" && <ArrowDown className="size-4 self-center" aria-label="fallend" />}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ListViewC({ items }: z.infer<typeof ListView>) {
  return (
    <ul className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
      {items.map((i, idx) => {
        const content = (
          <>
            <span className={`line-clamp-2 text-sm ${TONE_TEXT[i.tone ?? "neutral"]}`}>{i.title}</span>
            {(i.subtitle || i.meta) && (
              <span className="text-xs text-muted">{[i.subtitle, i.meta].filter(Boolean).join(" · ")}</span>
            )}
          </>
        );
        return (
          <li key={`${idx}-${i.title}`}>
            {i.url ? (
              <button
                type="button"
                onClick={() => void openUrl(i.url!)}
                className="flex w-full flex-col rounded px-1 py-0.5 text-left hover:bg-line/50"
              >
                {content}
              </button>
            ) : (
              <div className="flex flex-col px-1 py-0.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ProgressViewC({ items }: z.infer<typeof ProgressView>) {
  return (
    <div className="flex flex-col gap-3">
      {items.map(i => (
        <div key={i.label} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span>{i.label}</span>
            <span className="tabular-nums text-muted">{i.caption ?? `${Math.round(i.percent)} %`}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={i.percent}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${i.percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const STATE_DOT = { ok: "bg-good", warn: "bg-warn", error: "bg-bad", idle: "bg-muted" } as const;

export function StatusViewC({ items }: z.infer<typeof StatusView>) {
  return (
    <ul className="flex flex-col gap-2 overflow-y-auto">
      {items.map(i => (
        <li key={i.label} className="flex items-start gap-2 text-sm">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STATE_DOT[i.state]}`} title={i.state} />
          <span className="flex flex-col">
            <span>{i.label}</span>
            {i.detail && <span className="text-xs text-muted">{i.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Plain text on purpose: no HTML rendering of foreign content.
export function MarkdownViewC({ text }: z.infer<typeof MarkdownView>) {
  return <p className="h-full overflow-y-auto text-sm whitespace-pre-wrap">{text}</p>;
}

/** Renders any WidgetView payload; invalid payloads show an error instead of crashing. */
export function GenericView({ data }: { data: unknown }) {
  const parsed = WidgetView.safeParse(data);
  if (!parsed.success) {
    return <p className="text-sm text-bad">Keine gültige Ansicht: die Daten entsprechen keinem WidgetView-Format.</p>;
  }
  const v = parsed.data;
  switch (v.view) {
    case "stat":
      return <StatViewC {...v} />;
    case "list":
      return <ListViewC {...v} />;
    case "progress":
      return <ProgressViewC {...v} />;
    case "status":
      return <StatusViewC {...v} />;
    case "markdown":
      return <MarkdownViewC {...v} />;
  }
}
