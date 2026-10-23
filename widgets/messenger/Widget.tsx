import { CheckCheck, EyeOff, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import { useDashboard } from "../../web/src/hub/DashboardProvider";
import { relativeTime } from "../../web/src/lib/time";
import type { ChatSummary, MessengerData } from "./manifest";

const ERROR_MS = 8_000;

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

function undoText(undo: NonNullable<MessengerData["undo"]>): string {
  if (undo.kind === "dismiss") return "Chat ausgeblendet";
  if (undo.kind === "clear") return undo.count === 1 ? "1 Chat geleert" : `${undo.count} Chats geleert`;
  return `${undo.app ?? "App"} ausgeblendet`;
}

type Run = (action: string, input?: unknown) => void;

function ChatRow({ chat, open, now, run, onToggle }: { chat: ChatSummary; open: boolean; now: number; run: Run; onToggle: () => void }) {
  const unread = chat.unread > 0;
  return (
    <li className="group relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-stretch gap-2 rounded pr-12 text-left hover:bg-line/50"
      >
        {/* Colors are validated as #rrggbb by the payload schema. */}
        <span className="w-0.5 shrink-0 rounded-full" style={{ backgroundColor: chat.color }} title={chat.appLabel} />
        <span className="flex min-w-0 flex-1 flex-col py-0.5">
          <span className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate ${unread ? "font-semibold text-fg" : "text-muted"}`}>{chat.title}</span>
            {unread && (
              <span aria-label={`${chat.unread} ungelesen`} className="shrink-0 rounded-full bg-accent/20 px-1.5 font-mono text-xs text-glow">
                {chat.unread}
              </span>
            )}
            <span className="shrink-0 font-mono text-xs text-muted">{relativeTime(chat.at, now)}</span>
          </span>
          {!open && <span className={`line-clamp-2 text-xs break-words whitespace-pre-wrap ${unread ? "" : "text-muted"}`}>{chat.text}</span>}
        </span>
      </button>
      {open && (
        <ol className="mt-1 mb-2 ml-2.5 flex flex-col gap-1 border-l border-line pl-2.5 text-xs">
          {chat.lines.map(l => (
            <li key={l.id} className="flex gap-2">
              <span className="shrink-0 font-mono text-muted">{clock(l.at)}</span>
              <span className="min-w-0 break-words whitespace-pre-wrap">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
      <span className="absolute top-0.5 right-0 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => run("mute", { app: chat.app })}
          aria-label={`${chat.appLabel} ausblenden`}
          title={`${chat.appLabel} ausblenden`}
          className="p-1 text-muted hover:text-glow"
        >
          <EyeOff className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => run("dismiss", { key: chat.key })}
          aria-label="Chat ausblenden"
          title="Chat ausblenden"
          className="p-1 text-muted hover:text-bad"
        >
          <X className="size-3.5" />
        </button>
      </span>
    </li>
  );
}

export default function MessengerWidget({ state }: WidgetProps<MessengerData>) {
  const { runAction } = useDashboard();
  const { chats, unread, apps, undo } = state.data;
  const now = useNow();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(errorTimer.current), []);

  const run: Run = (action, input = {}) =>
    void runAction(state.instance, action, input).then(r => {
      clearTimeout(errorTimer.current);
      setError(r.ok ? null : r.error);
      if (!r.ok) errorTimer.current = setTimeout(() => setError(null), ERROR_MS);
    });

  const toggle = (chat: ChatSummary) => {
    const opening = open !== chat.key;
    setOpen(opening ? chat.key : null);
    // Reading the history here counts as read; Windows and the app stay untouched.
    if (opening && chat.unread > 0) run("markRead", { key: chat.key });
  };
  const muted = apps.filter(a => a.muted);

  return (
    <div className="flex h-full flex-col gap-2 text-sm">
      <div className="flex items-center gap-2 text-xs">
        <span className={unread ? "font-semibold text-glow" : "text-muted"}>{unread ? `${unread} ungelesen` : "Alles gelesen"}</span>
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => run("markAllRead")}
            disabled={!unread}
            className="flex items-center gap-1 px-1 py-0.5 text-muted enabled:hover:text-glow disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" /> Alle gelesen
          </button>
          <button
            type="button"
            onClick={() => run("clear")}
            disabled={!chats.length}
            className="flex items-center gap-1 px-1 py-0.5 text-muted enabled:hover:text-bad disabled:opacity-40"
          >
            <Trash2 className="size-3.5" /> Leeren
          </button>
        </span>
      </div>

      {undo && (
        <div role="status" className="flex items-center gap-2 rounded bg-line/50 px-2 py-1 text-xs">
          <span className="text-muted">{undoText(undo)}</span>
          <button type="button" onClick={() => run("undo")} className="ml-auto text-accent hover:text-glow">
            Rückgängig
          </button>
        </div>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}

      {chats.length ? (
        <ul className="flex min-h-0 flex-1 flex-col gap-1">
          {chats.map(c => (
            <ChatRow key={c.key} chat={c} open={open === c.key} now={now} run={run} onToggle={() => toggle(c)} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          Keine Nachrichten. Es erscheint nur, was als Windows-Benachrichtigung ankommt: Fokus-Assistent aus und Benachrichtigungen der App
          an.
        </p>
      )}

      {muted.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Ausgeblendet:
          {muted.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => run("unmute", { app: a.id })}
              aria-label={`${a.label} wieder einblenden`}
              className="flex items-center gap-1.5 rounded bg-line/60 px-1.5 py-0.5 hover:bg-line hover:text-fg"
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
