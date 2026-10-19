// Gmail REST (server only): unread conversations in INBOX plus the newest messages' From/Subject/Date.
// format=metadata fetches headers only, never a body.
import type { MailMessage } from "./manifest";
import { getJson, type TokenGetter } from "./api";
import { GmailLabelIn, GmailListIn, GmailMessageIn, GmailProfileIn, fromGmail } from "./parse";

export const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface CollectGmailOptions {
  account: string;
  email: string | null;
  perAccount: number;
  token: TokenGetter;
  signal: AbortSignal;
  base?: string;
  fetchImpl?: typeof fetch;
}

export async function collectGmail(o: CollectGmailOptions): Promise<{ unread: number | null; messages: MailMessage[] }> {
  const api = { base: o.base ?? GMAIL_BASE, token: o.token, signal: o.signal, fetchImpl: o.fetchImpl, name: "Gmail" };
  const list = new URLSearchParams({ labelIds: "INBOX", maxResults: String(o.perAccount) });
  const [label, ids] = await Promise.all([
    getJson(api, "/labels/INBOX", GmailLabelIn),
    getJson(api, `/messages?${list}`, GmailListIn),
  ]);
  const meta = new URLSearchParams({ format: "metadata" });
  // Repeated parameter, not a comma list.
  for (const h of ["From", "Subject", "Date"]) meta.append("metadataHeaders", h);
  const messages = await Promise.all(
    (ids.messages ?? []).map(({ id }) => getJson(api, `/messages/${encodeURIComponent(id)}?${meta}`, GmailMessageIn)),
  );
  return {
    // The web UI counts conversations in conversation view.
    unread: label.threadsUnread ?? label.messagesUnread ?? null,
    messages: messages.map(m => fromGmail(m, o.account, o.email)),
  };
}

/** The account address for deep links (/mail/u/<email>/), fetched once at login. */
export async function gmailProfile(o: { token: TokenGetter; signal: AbortSignal; base?: string; fetchImpl?: typeof fetch }) {
  const api = { base: o.base ?? GMAIL_BASE, token: o.token, signal: o.signal, fetchImpl: o.fetchImpl, name: "Gmail" };
  return (await getJson(api, "/profile", GmailProfileIn)).emailAddress;
}
