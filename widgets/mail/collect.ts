// All accounts in parallel, each with its own status. One broken or unconnected account never hides the others;
// the instance fails only when every configured account fails.
import { missingCredentials, type OAuthProviderId } from "../../server/auth/providers";
import { NotConnectedError, ReauthRequiredError, type TokenStore } from "../../server/auth/token-store";
import { collectGmail } from "./gmail";
import { collectImap } from "./imap";
import type { MailAccount, MailAccountSummary, MailConfig, MailData, MailMessage } from "./manifest";
import { collectOutlook } from "./outlook";
import { accountColor, mergeMessages } from "./parse";

export interface MailAdapters {
  gmailBase?: string;
  graphBase?: string;
  fetchImpl?: typeof fetch;
  imapTransport?: { secure: false };
}

export interface CollectMailOptions {
  config: MailConfig;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
  tokens: TokenStore;
  log: (...args: unknown[]) => void;
  adapters?: MailAdapters;
}

const OAUTH: Record<"gmail" | "outlook", OAuthProviderId> = { gmail: "google", outlook: "microsoft" };

const errorText = (err: unknown) =>
  err instanceof Error ? (err.cause instanceof Error ? `${err.message} (${err.cause.message})` : err.message) : String(err);

type Result = { summary: MailAccountSummary; messages: MailMessage[] };

async function resolveAccount(account: MailAccount, index: number, o: CollectMailOptions): Promise<Result> {
  const base = { id: account.id, label: account.label, provider: account.provider, color: accountColor(index, account.color) };
  const unconfigured = (error: string, action?: string): Result => ({
    summary: { ...base, status: "unconfigured", unread: null, email: null, error, ...(action ? { action } : {}) },
    messages: [],
  });

  try {
    if (account.provider === "imap") {
      const password = o.env[account.passwordEnv]?.trim();
      if (!password) return unconfigured(`Fehlt in .env: ${account.passwordEnv}`);
      const r = await collectImap({
        account,
        password,
        perAccount: o.config.perAccount,
        signal: o.signal,
        log: o.log,
        transport: o.adapters?.imapTransport,
      });
      return { summary: { ...base, status: "ok", unread: r.unread, email: account.user }, messages: r.messages };
    }

    const provider = OAUTH[account.provider];
    const action = oauthAction(account);
    const missing = missingCredentials(provider, o.env);
    if (missing.length) return unconfigured(`Fehlt in .env: ${missing.join(", ")}`);

    const stored = await o.tokens.read(account.id);
    if (!stored || stored.provider !== provider) return unconfigured("Nicht verbunden", action);
    const token = (opts?: { force?: boolean }) => o.tokens.accessToken(account.id, provider, o.env, o.signal, opts);
    const common = { account: account.id, perAccount: o.config.perAccount, token, signal: o.signal, fetchImpl: o.adapters?.fetchImpl };
    const r =
      account.provider === "gmail"
        ? await collectGmail({ ...common, email: stored.email, base: o.adapters?.gmailBase })
        : await collectOutlook({ ...common, base: o.adapters?.graphBase });
    return { summary: { ...base, status: "ok", unread: r.unread, email: stored.email }, messages: r.messages };
  } catch (err) {
    if (err instanceof NotConnectedError) return unconfigured("Nicht verbunden", oauthAction(account));
    if (err instanceof ReauthRequiredError) return unconfigured("Anmeldung abgelaufen – neu verbinden", oauthAction(account));
    o.log(`${account.id}:`, errorText(err));
    return { summary: { ...base, status: "error", unread: null, email: null, error: errorText(err) }, messages: [] };
  }
}

const oauthAction = (account: MailAccount) =>
  account.provider === "imap" ? undefined : `/auth/${OAUTH[account.provider]}/start?account=${encodeURIComponent(account.id)}`;

export async function collectMail(o: CollectMailOptions): Promise<MailData> {
  // resolveAccount never rejects: every failure becomes that account's status.
  const results = await Promise.all(o.config.accounts.map((a, i) => resolveAccount(a, i, o)));
  if (o.signal.aborted) throw new Error("abgebrochen");

  const accounts = results.map(r => r.summary);
  const configured = accounts.filter(a => a.status !== "unconfigured");
  if (configured.length > 0 && configured.every(a => a.status === "error")) {
    throw new Error(configured.map(a => `${a.label}: ${a.error}`).join(" · "));
  }
  return { accounts, messages: mergeMessages(results.map(r => r.messages), o.config.limit) };
}
