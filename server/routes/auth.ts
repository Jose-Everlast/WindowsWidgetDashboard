// OAuth login for mail accounts (PRD section 10). Runs in the default browser, not in Lively:
// answers are plain text (never HTML from query input), not cached and without a Referer.
import { Hono, type Context } from "hono";
import type { OAuthAccount } from "../auth/accounts";
import type { PendingStore } from "../auth/pending";
import { challengeOf, createState, createVerifier } from "../auth/pkce";
import {
  OAUTH_PROVIDERS,
  authorizeUrl,
  exchangeCode,
  missingCredentials,
  type OAuthEndpoints,
  type OAuthProviderId,
} from "../auth/providers";
import type { TokenStore } from "../auth/token-store";
import { HttpError, notFound } from "../http";
import { log, logError } from "../log";

export interface AuthDeps {
  port: number;
  env: Record<string, string | undefined>;
  accounts: OAuthAccount[];
  tokens: TokenStore;
  pending: PendingStore;
  /** A new login: re-collect the mail instances right away. */
  onConnected: (account: string) => void;
  /** Account address for deep links (Gmail: /mail/u/<email>/); null when not needed. */
  lookupEmail: (provider: OAuthProviderId, accessToken: string, signal: AbortSignal) => Promise<string | null>;
  endpoints?: Partial<Record<OAuthProviderId, OAuthEndpoints>>;
  fetchImpl?: typeof fetch;
}

const isProvider = (p: string): p is OAuthProviderId => (OAUTH_PROVIDERS as readonly string[]).includes(p);

const text = (c: Context, body: string, status: 200 | 400 | 502) => {
  c.header("cache-control", "no-store");
  // code and state are in the URL: no Referer may carry them to another site.
  c.header("referrer-policy", "no-referrer");
  return c.text(body, status);
};

export function authRoutes(deps: AuthDeps): Hono {
  const app = new Hono();

  app.get("/:provider/start", c => {
    const provider = c.req.param("provider");
    if (!isProvider(provider)) throw notFound(`provider "${provider}"`);
    const id = c.req.query("account");
    const account = deps.accounts.find(a => a.id === id && a.provider === provider);
    if (!account) throw new HttpError(404, "Konto nicht konfiguriert");
    const missing = missingCredentials(provider, deps.env);
    if (missing.length) throw new HttpError(409, `Fehlt in .env: ${missing.join(", ")}`);

    const state = createState();
    const verifier = createVerifier();
    deps.pending.put(state, { provider, account: account.id, verifier });
    c.header("cache-control", "no-store");
    c.header("referrer-policy", "no-referrer");
    return c.redirect(
      authorizeUrl({ provider, env: deps.env, port: deps.port, state, challenge: challengeOf(verifier), endpoints: deps.endpoints }),
      302,
    );
  });

  app.get("/:provider/callback", async c => {
    const provider = c.req.param("provider");
    if (!isProvider(provider)) throw notFound(`provider "${provider}"`);
    const error = c.req.query("error");
    // Only the error code goes back, as text.
    if (error) return text(c, `Anmeldung abgebrochen: ${error.slice(0, 100)}`, 400);

    const pending = deps.pending.take(c.req.query("state") ?? "");
    if (!pending || pending.provider !== provider) {
      return text(c, "Ungültiger oder abgelaufener Anmeldeversuch – bitte in der Kachel erneut auf „verbinden“ klicken", 400);
    }
    const code = c.req.query("code");
    if (!code) return text(c, "Anmeldung fehlgeschlagen: kein Code erhalten", 400);

    const signal = AbortSignal.timeout(20_000);
    const oauth = { env: deps.env, endpoints: deps.endpoints, fetchImpl: deps.fetchImpl };
    let tokens;
    try {
      tokens = await exchangeCode({ ...oauth, provider, port: deps.port, code, verifier: pending.verifier, signal });
    } catch (err) {
      // Messages from providers.ts never contain request parameters.
      const message = err instanceof Error ? err.message : String(err);
      logError("auth", `${pending.account}: ${message}`);
      return text(c, `Anmeldung fehlgeschlagen: ${message}`, 502);
    }
    if (!tokens.refreshToken) {
      return text(
        c,
        "Kein Refresh-Token erhalten – den Zugriff der App im Konto entfernen (bei Google: myaccount.google.com/permissions) und erneut verbinden",
        400,
      );
    }

    let email: string | null = null;
    try {
      email = await deps.lookupEmail(provider, tokens.accessToken, signal);
    } catch (err) {
      // Only the deep link needs it (/u/0/ otherwise).
      logError("auth", `${pending.account}: Profil nicht lesbar – ${err instanceof Error ? err.message : String(err)}`);
    }
    await deps.tokens.save(pending.account, {
      provider,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      email,
    });
    log("auth", `${pending.account} verbunden`);
    deps.onConnected(pending.account);
    return text(c, `Verbunden: ${pending.account}. Dieses Fenster kann geschlossen werden.`, 200);
  });

  return app;
}
