import { CheckCheck, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import { useDashboard } from "../../web/src/hub/DashboardProvider";
import { openUrl } from "../../web/src/lib/openUrl";
import { relativeTime } from "../../web/src/lib/time";
import { MAX_TOPICS, Topic, type NtfyData, type NtfyMessage, type TopicEntry } from "./manifest";

const ERROR_MS = 8_000;

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// Priority 4/5 stand out, 1/2 fade; 3 is the ntfy default.
const PRIORITY_BAR: Record<number, string> = { 1: "bg-line", 2: "bg-line", 3: "bg-accent/60", 4: "bg-warn", 5: "bg-bad" };
const PRIORITY_LABEL: Record<number, string> = { 1: "min", 2: "niedrig", 3: "normal", 4: "hoch", 5: "dringend" };

function Row({ m, now, showTopic, onDismiss }: { m: NtfyMessage; now: number; showTopic: boolean; onDismiss: () => void }) {
  const body = (
    <>
      <span className={`w-0.5 shrink-0 rounded-full ${PRIORITY_BAR[m.priority]}`} title={`Priorität ${PRIORITY_LABEL[m.priority]}`} />
      <span className="flex min-w-0 flex-1 flex-col py-0.5">
        <span className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate ${m.priority >= 4 ? "font-semibold text-fg" : ""}`}>{m.title ?? m.topic}</span>
          <span className="shrink-0 font-mono text-xs text-muted">{relativeTime(m.at, now)}</span>
        </span>
        {m.text && <span className="line-clamp-2 text-xs break-words whitespace-pre-wrap text-muted">{m.text}</span>}
        {(showTopic || m.tags.length > 0) && (
          <span className="flex flex-wrap gap-x-2 font-mono text-[0.65rem] text-muted">
            {showTopic && m.title && <span className="text-accent">{m.topic}</span>}
            {m.tags.map(t => (
              <span key={t}>#{t}</span>
            ))}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className="group relative">
      {m.click ? (
        <button type="button" onClick={() => void openUrl(m.click!)} className="flex w-full items-stretch gap-2 rounded pr-6 text-left hover:bg-line/50">
          {body}
        </button>
      ) : (
        <div className="flex items-stretch gap-2 pr-6">{body}</div>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Nachricht ausblenden"
        title="Ausblenden"
        className="absolute top-0.5 right-0 p-1 text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-bad"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function TopicChip({ topic, onRemove }: { topic: TopicEntry; onRemove: () => void }) {
  return (
    <span
      className="flex items-center gap-0.5 rounded border border-line px-1.5 font-mono text-xs"
      title={topic.removable ? undefined : "aus dashboard.config.json"}
    >
      {topic.name}
      {topic.removable && (
        <button type="button" onClick={onRemove} aria-label={`Topic ${topic.name} entfernen`} className="text-muted hover:text-bad">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Latest ntfy messages, newest first; topics are added and removed right in the tile. */
export default function NtfyWidget({ state }: WidgetProps<NtfyData>) {
  const { runAction } = useDashboard();
  const { topics, messages, hidden } = state.data;
  const now = useNow();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(errorTimer.current), []);

  const showError = (msg: string | null) => {
    clearTimeout(errorTimer.current);
    setError(msg);
    if (msg) errorTimer.current = setTimeout(() => setError(null), ERROR_MS);
  };

  const run = async (action: string, input: unknown = {}): Promise<boolean> => {
    setBusy(true);
    const r = await runAction(state.instance, action, input);
    setBusy(false);
    showError(r.ok ? null : r.error);
    return r.ok;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const topic = draft.trim();
    if (!topic) return;
    // Same rule as the server, so typos show up without a round trip.
    if (!Topic.safeParse(topic).success) return showError("Nur Buchstaben, Ziffern, - und _ (höchstens 64)");
    if (await run("addTopic", { topic })) setDraft("");
  };

  const full = topics.length >= MAX_TOPICS;

  return (
    <div className="flex h-full flex-col gap-2 text-sm">
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topics.map(t => (
            <TopicChip key={t.name} topic={t} onRemove={() => void run("removeTopic", { topic: t.name })} />
          ))}
        </div>
      )}
      <form onSubmit={e => void submit(e)} className="flex gap-1">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={full ? `Höchstens ${MAX_TOPICS} Topics` : "Topic hinzufügen"}
          aria-label="ntfy-Topic hinzufügen"
          disabled={busy || full}
          maxLength={64}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-line bg-transparent px-2 py-0.5 font-mono text-xs placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || full || !draft.trim()}
          aria-label="Topic hinzufügen"
          className="rounded border border-line px-1.5 text-muted enabled:hover:text-glow disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
      {topics.length > 0 && (messages.length > 0 || hidden > 0) && (
        <div className="flex items-center gap-2 text-xs">
          {hidden > 0 && (
            <button type="button" onClick={() => void run("restoreAll")} disabled={busy} className="text-muted enabled:hover:text-glow">
              {hidden} ausgeblendet · zurückholen
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              // Messages are sorted newest first: everything up to this one is what the user sees.
              onClick={() => void run("dismissAll", { until: messages[0]!.at })}
              disabled={busy}
              className="ml-auto flex items-center gap-1 text-muted enabled:hover:text-glow"
            >
              <CheckCheck className="size-3.5" />
              Alle ausblenden
            </button>
          )}
        </div>
      )}
      {!topics.length ? (
        <p className="text-xs text-muted">Noch keine Topics. Namen oben eintragen, z. B. ein langes, zufälliges Topic von ntfy.sh.</p>
      ) : messages.length ? (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {messages.map(m => (
            <Row key={m.id} m={m} now={now} showTopic={topics.length > 1} onDismiss={() => void run("dismiss", { id: m.id })} />
          ))}
        </ul>
      ) : (
        <p className="text-muted">Keine Nachrichten</p>
      )}
    </div>
  );
}
