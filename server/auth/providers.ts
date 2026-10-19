// OAuth 2.0 authorization code flow with PKCE against Google and Microsoft, with plain fetch.
// Read-only scopes only (PRD section 9). Token responses are foreign input: validated with zod.
import { z } from "zod";
import { missingEnv } from "@shared/widget-contract";

export type OAuthProviderId = "google" | "microsoft";
export const OAUTH_PROVIDERS: readonly OAuthProviderId[] = ["google", "microsoft"];

export interface OAuthEndpoints {
  authorize: string;
  token: string;
}

type Env = Record<string, string | undefined>;

/** The account must log in again (revoked, expired, password changed). */
export class ReauthRequiredError extends Error {}
/** Any other OAuth failure (5xx, malformed answer): transient, not a reason to log in again. */
export class OAuthError extends Error {}

export const SCOPES: Record<OAuthProviderId, string> = {
  google: "https://www.googleapis.com/auth/gmail.readonly",
  microsoft: "offline_access Mail.Read",
};

const CREDENTIALS: Record<OAuthProviderId, string[]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  microsoft: ["MS_CLIENT_ID"],
};

export const missingCredentials = (provider: OAuthProviderId, env: Env) => missingEnv(CREDENTIALS[provider], env);

export function defaultEndpoints(provider: OAuthProviderId, env: Env): OAuthEndpoints {
  if (provider === "google") {
    return { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token" };
  }
  const tenant = env.MS_TENANT?.trim() || "consumers";
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
  return { authorize: `${base}/authorize`, token: `${base}/token` };
}

/**
 * Google Desktop clients accept any loopback port and path. Microsoft only lets the portal register
 * http://localhost (port ignored) without editing the manifest. Both hosts pass localGuard.
 * Authorize and token request must use the identical value.
 */
export const redirectUri = (provider: OAuthProviderId, port: number) =>
  provider === "google" ? `http://127.0.0.1:${port}/auth/google/callback` : `http://localhost:${port}/auth/microsoft/callback`;

export interface OAuthClientOptions {
  env: Env;
  endpoints?: Partial<Record<OAuthProviderId, OAuthEndpoints>>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const endpointsOf = (provider: OAuthProviderId, o: OAuthClientOptions) => o.endpoints?.[provider] ?? defaultEndpoints(provider, o.env);

export function authorizeUrl(
  o: OAuthClientOptions & { provider: OAuthProviderId; port: number; state: string; challenge: string },
): string {
  const url = new URL(endpointsOf(o.provider, o).authorize);
  const p = url.searchParams;
  p.set("client_id", o.provider === "google" ? o.env.GOOGLE_CLIENT_ID! : o.env.MS_CLIENT_ID!);
  p.set("redirect_uri", redirectUri(o.provider, o.port));
  p.set("response_type", "code");
  p.set("scope", SCOPES[o.provider]);
  p.set("state", o.state);
  p.set("code_challenge", o.challenge);
  p.set("code_challenge_method", "S256");
  if (o.provider === "google") {
    // A refresh token comes only with offline access, and only on a fresh consent.
    p.set("access_type", "offline");
    p.set("prompt", "consent");
  } else {
    p.set("response_mode", "query");
    p.set("prompt", "select_account");
  }
  return url.href;
}

export interface TokenSet {
  accessToken: string;
  /** ms epoch */
  expiresAt: number;
  refreshToken?: string;
}

const TokenIn = z.object({ access_token: z.string().min(1), expires_in: z.coerce.number(), refresh_token: z.string().optional() });
const TokenErrorIn = z.object({ error: z.string(), error_description: z.string().optional() });

async function tokenRequest(provider: OAuthProviderId, params: Record<string, string>, signal: AbortSignal, o: OAuthClientOptions) {
  const body = new URLSearchParams(params);
  if (provider === "google") {
    body.set("client_id", o.env.GOOGLE_CLIENT_ID!);
    // Desktop clients: Google calls the secret non-confidential but rejects the exchange without it.
    body.set("client_secret", o.env.GOOGLE_CLIENT_SECRET!);
  } else {
    // Public client: no secret. No Origin header either, or Microsoft treats it as an SPA (24 h tokens).
    body.set("client_id", o.env.MS_CLIENT_ID!);
  }
  let res: Response;
  try {
    res = await (o.fetchImpl ?? fetch)(endpointsOf(provider, o).token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new OAuthError(`${provider}: Token-Endpunkt nicht erreichbar (${err instanceof Error ? err.message : String(err)})`);
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // Never echo request parameters (code, refresh token, secret) into the message.
    const parsed = TokenErrorIn.safeParse(json);
    const code = parsed.success ? parsed.data.error : `HTTP ${res.status}`;
    if (code === "invalid_grant") throw new ReauthRequiredError(`${provider}: Anmeldung abgelaufen oder widerrufen`);
    throw new OAuthError(`${provider}: Token-Anfrage fehlgeschlagen (${code})`);
  }
  const parsed = TokenIn.safeParse(json);
  if (!parsed.success) throw new OAuthError(`${provider}: unerwartete Token-Antwort`);
  const now = o.now ?? Date.now;
  return {
    accessToken: parsed.data.access_token,
    expiresAt: now() + parsed.data.expires_in * 1000,
    refreshToken: parsed.data.refresh_token,
  } satisfies TokenSet;
}

export function exchangeCode(
  o: OAuthClientOptions & { provider: OAuthProviderId; port: number; code: string; verifier: string; signal: AbortSignal },
): Promise<TokenSet> {
  return tokenRequest(
    o.provider,
    { grant_type: "authorization_code", code: o.code, code_verifier: o.verifier, redirect_uri: redirectUri(o.provider, o.port) },
    o.signal,
    o,
  );
}

export function refreshAccessToken(
  o: OAuthClientOptions & { provider: OAuthProviderId; refreshToken: string; signal: AbortSignal },
): Promise<TokenSet> {
  return tokenRequest(o.provider, { grant_type: "refresh_token", refresh_token: o.refreshToken }, o.signal, o);
}
