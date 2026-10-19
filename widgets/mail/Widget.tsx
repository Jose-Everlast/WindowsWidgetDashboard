import { useEffect, useState } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import { openUrl } from "../../web/src/lib/openUrl";
import { relativeTime } from "../../web/src/lib/time";
import type { MailAccountSummary, MailData } from "./manifest";

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function AccountChip({ account: a }: { account: MailAccountSummary }) {
  // Colors are validated as #rrggbb by the payload schema.
  const dot = <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />;
  const base = "flex items-center gap-1.5 rounded bg-line/60 px-1.5 py-0.5 text-xs";

  if (a.status === "unconfigured") {
    return a.action ? (
      <button
        type="button"
        // The login runs in the default browser: inside Lively it would navigate the wallpaper away.
        onClick={() => void openUrl(new URL(a.action!, window.location.origin).href)}
        className={`${base} text-accent hover:bg-line`}
        title={a.error}
      >
        {dot}
        {a.label} · verbinden
      </button>
    ) : (
      <span className={`${base} text-muted`} title={a.error}>
        {dot}
        {a.label} · nicht eingerichtet
      </span>
    );
  }
  if (a.status === "error") {
    return (
      <span className={`${base} text-bad`} title={a.error}>
        {dot}
        {a.label} · Fehler
      </span>
    );
  }
  return (
    <span className={base} title={a.email ?? undefined}>
      {dot}
      {a.label}
      <span className={a.unread ? "font-semibold text-fg" : "text-muted"}>{a.unread ?? "–"}</span>
    </span>
  );
}

export default function MailWidget({ state }: WidgetProps<MailData>) {
  const { accounts, messages } = state.data;
  const now = useNow();
  const colorOf = new Map(accounts.map(a => [a.id, a.color]));

  return (
    <div className="flex h-full flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {accounts.map(a => (
          <AccountChip key={a.id} account={a} />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
        {!messages.length && <p className="text-muted">Keine Mails in der Inbox</p>}
        {messages.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => m.url && void openUrl(m.url)}
            disabled={!m.url}
            title={m.subject}
            className="flex items-stretch gap-2 rounded text-left enabled:hover:bg-line/50"
          >
            <span className="w-0.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf.get(m.account) }} />
            <span className="flex min-w-0 flex-1 flex-col py-0.5">
              <span className="flex items-baseline gap-2">
                <span className={`min-w-0 flex-1 truncate ${m.unread ? "font-semibold" : "text-muted"}`}>{m.from}</span>
                <span className="shrink-0 text-xs text-muted">{relativeTime(m.receivedAt, now)}</span>
              </span>
              <span className={`truncate text-xs ${m.unread ? "" : "text-muted"}`}>{m.subject}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
