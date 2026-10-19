// IMAP via imapflow (server only). Strictly read-only: the inbox is opened with EXAMINE and only
// ENVELOPE/FLAGS are fetched, so no message ever gets \Seen. One fresh client per poll (it cannot reconnect).
import { ImapFlow } from "imapflow";
import type { MailMessage } from "./manifest";
import { fromImap } from "./parse";

export interface ImapAccount {
  id: string;
  host: string;
  port: number;
  user: string;
  webmailUrl?: string;
}

export interface CollectImapOptions {
  account: ImapAccount;
  password: string;
  perAccount: number;
  signal: AbortSignal;
  log?: (...args: unknown[]) => void;
  /** Tests only: plain TCP against a local server. Production always uses implicit TLS. */
  transport?: { secure: false };
}

export class ImapAuthError extends Error {}

export async function collectImap(o: CollectImapOptions): Promise<{ unread: number | null; messages: MailMessage[] }> {
  if (o.signal.aborted) throw o.signal.reason;
  const plain = o.transport?.secure === false;
  const client = new ImapFlow({
    host: o.account.host,
    port: o.account.port,
    secure: !plain,
    doSTARTTLS: plain ? false : undefined,
    auth: { user: o.account.user, pass: o.password },
    logger: false,
    // The defaults (90 s connect, 5 min socket) are far too long for a poller.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    disableAutoIdle: true,
  });
  // Mandatory: an unhandled "error" event would crash the server.
  client.on("error", (err: Error) => o.log?.(`IMAP ${o.account.id}:`, err.message));
  const onAbort = () => client.close();
  o.signal.addEventListener("abort", onAbort, { once: true });

  try {
    try {
      await client.connect();
    } catch (err) {
      if ((err as { authenticationFailed?: boolean }).authenticationFailed) {
        throw new ImapAuthError("IMAP-Anmeldung fehlgeschlagen – App-Passwort prüfen");
      }
      throw err;
    }
    const status = await client.status("INBOX", { unseen: true });
    const messages: MailMessage[] = [];
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const exists = client.mailbox ? client.mailbox.exists : 0;
      if (exists > 0) {
        const range = `${Math.max(1, exists - o.perAccount + 1)}:*`;
        for await (const m of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true })) {
          messages.push(
            fromImap(
              { uid: m.uid, flags: [...(m.flags ?? [])], internalDate: m.internalDate, envelope: m.envelope },
              o.account.id,
              o.account.webmailUrl ?? null,
            ),
          );
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { unread: status ? (status.unseen ?? null) : null, messages: messages.reverse() };
  } catch (err) {
    if (o.signal.aborted) throw o.signal.reason instanceof Error ? o.signal.reason : new Error("abgebrochen");
    throw err;
  } finally {
    o.signal.removeEventListener("abort", onAbort);
    client.close();
  }
}
