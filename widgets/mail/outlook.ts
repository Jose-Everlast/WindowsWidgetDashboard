// Microsoft Graph (server only): inbox unread count and the newest messages. $select keeps bodies out.
import type { MailMessage } from "./manifest";
import { getJson, type TokenGetter } from "./api";
import { GraphFolderIn, GraphMessagesIn, fromGraph } from "./parse";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0/me";

export interface CollectOutlookOptions {
  account: string;
  perAccount: number;
  token: TokenGetter;
  signal: AbortSignal;
  base?: string;
  fetchImpl?: typeof fetch;
}

export async function collectOutlook(o: CollectOutlookOptions): Promise<{ unread: number | null; messages: MailMessage[] }> {
  const api = { base: o.base ?? GRAPH_BASE, token: o.token, signal: o.signal, fetchImpl: o.fetchImpl, name: "Outlook" };
  // Built by hand: URLSearchParams would encode "$" as %24 in the OData option names.
  const query = Object.entries({
    $top: String(o.perAccount),
    $select: "id,from,subject,receivedDateTime,isRead,webLink",
    $orderby: "receivedDateTime desc",
  })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const [folder, list] = await Promise.all([
    getJson(api, "/mailFolders/inbox?$select=unreadItemCount", GraphFolderIn),
    getJson(api, `/mailFolders/inbox/messages?${query}`, GraphMessagesIn),
  ]);
  return { unread: folder.unreadItemCount, messages: list.value.map(m => fromGraph(m, o.account)) };
}
