// Pure mappers from Gmail, Graph and IMAP answers to MailMessage. No Node imports: bundled for the browser too.
// Input schemas are lenient (z.object drops unknown fields) and read only what the widget shows.
import { z } from "zod";
import type { MailMessage } from "./manifest";

export const GmailLabelIn = z.object({ threadsUnread: z.number().optional(), messagesUnread: z.number().optional() });
// An empty inbox comes without the "messages" field.
export const GmailListIn = z.object({ messages: z.array(z.object({ id: z.string(), threadId: z.string() })).optional() });
export const GmailMessageIn = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).optional(),
  internalDate: z.string(),
  payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).optional() }).optional(),
});
export type GmailMessageIn = z.infer<typeof GmailMessageIn>;
export const GmailProfileIn = z.object({ emailAddress: z.string() });

export const GraphFolderIn = z.object({ unreadItemCount: z.number() });
export const GraphMessagesIn = z.object({
  value: z.array(
    z.object({
      id: z.string(),
      subject: z.string().nullable().optional(),
      receivedDateTime: z.string(),
      isRead: z.boolean(),
      webLink: z.string().nullable().optional(),
      from: z
        .object({ emailAddress: z.object({ name: z.string().optional(), address: z.string().optional() }) })
        .nullable()
        .optional(),
    }),
  ),
});
export type GraphMessageIn = z.infer<typeof GraphMessagesIn>["value"][number];

/** Fields imapflow delivers for fetch({ envelope, flags, internalDate, uid }). */
export interface ImapMessageIn {
  uid: number;
  flags: string[];
  internalDate?: string | Date;
  envelope?: { date?: string | Date; subject?: string; from?: Array<{ name?: string; address?: string }> };
}

const PALETTE = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171"];
export const accountColor = (index: number, color?: string) => color ?? PALETTE[index % PALETTE.length]!;

const SUBJECT_MAX = 200;

export function cleanSubject(s: string | null | undefined): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "(kein Betreff)";
  return t.length > SUBJECT_MAX ? `${t.slice(0, SUBJECT_MAX - 1)}…` : t;
}

export function displayFrom(name?: string | null, address?: string | null): string {
  const n = name?.trim().replace(/^"(.*)"$/, "$1").trim();
  return n || address?.trim() || "(unbekannt)";
}

/** `"Kunde GmbH" <a@b.de>` → Kunde GmbH, `a@b.de` → a@b.de. Gmail already decodes RFC 2047. */
export function parseFromHeader(value: string | undefined): string {
  if (!value) return displayFrom();
  const m = /^\s*(.*?)\s*<([^>]*)>\s*$/.exec(value);
  return m ? displayFrom(m[1], m[2]) : displayFrom(null, value);
}

const toIso = (d: string | Date | undefined): string | null => {
  if (d === undefined) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const gmailUrl = (email: string | null, threadId: string) =>
  `https://mail.google.com/mail/u/${email ? encodeURIComponent(email) : "0"}/#all/${encodeURIComponent(threadId)}`;

export function fromGmail(msg: GmailMessageIn, account: string, email: string | null): MailMessage {
  const header = (name: string) => msg.payload?.headers?.find(h => h.name.toLowerCase() === name)?.value;
  return {
    id: `${account}:${msg.id}`,
    account,
    from: parseFromHeader(header("from")),
    subject: cleanSubject(header("subject")),
    // internalDate is ms since epoch as a string: time zone independent.
    receivedAt: new Date(Number(msg.internalDate)).toISOString(),
    unread: msg.labelIds?.includes("UNREAD") ?? false,
    url: gmailUrl(email, msg.threadId),
  };
}

const OUTLOOK_HOSTS = new Set(["outlook.live.com", "outlook.office.com", "outlook.office365.com"]);

/** webLink is foreign input: only https links to Outlook on the web leave the server. */
export function safeOutlookLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" && OUTLOOK_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

export function fromGraph(msg: GraphMessageIn, account: string): MailMessage {
  return {
    id: `${account}:${msg.id}`,
    account,
    from: displayFrom(msg.from?.emailAddress.name, msg.from?.emailAddress.address),
    subject: cleanSubject(msg.subject),
    receivedAt: toIso(msg.receivedDateTime) ?? msg.receivedDateTime,
    unread: !msg.isRead,
    url: safeOutlookLink(msg.webLink),
  };
}

export function fromImap(msg: ImapMessageIn, account: string, webmailUrl: string | null): MailMessage {
  const from = msg.envelope?.from?.[0];
  return {
    id: `${account}:${msg.uid}`,
    account,
    from: displayFrom(from?.name, from?.address),
    subject: cleanSubject(msg.envelope?.subject),
    receivedAt: toIso(msg.envelope?.date) ?? toIso(msg.internalDate) ?? new Date(0).toISOString(),
    unread: !msg.flags.includes("\\Seen"),
    url: webmailUrl,
  };
}

/** All accounts mixed, newest first. */
export function mergeMessages(lists: MailMessage[][], limit: number): MailMessage[] {
  return lists
    .flat()
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, limit);
}
