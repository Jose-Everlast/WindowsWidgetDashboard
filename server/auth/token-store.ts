// OAuth tokens per mail account in data/tokens/<account>.json (gitignored, never logged, never served).
// One lock per account: collect() and the login callback must not refresh at the same time, because
// Microsoft rotates the refresh token on every use.
import { join } from "node:path";
import { z } from "zod";
import { readJsonFile, withLock, writeJsonFileAtomic } from "../lib/json-file";
import { refreshAccessToken, type OAuthClientOptions, type OAuthProviderId } from "./providers";

export { OAuthError, ReauthRequiredError } from "./providers";

/** No token for this account yet: it has to be connected first. */
export class NotConnectedError extends Error {}

export const StoredToken = z.object({
  provider: z.enum(["google", "microsoft"]),
  refreshToken: z.string().min(1),
  accessToken: z.string().nullable(),
  expiresAt: z.number().nullable(),
  email: z.string().nullable(),
  savedAt: z.string(),
});
export type StoredToken = z.infer<typeof StoredToken>;

const ACCOUNT_ID = /^[a-z0-9][a-z0-9-]*$/;
// Refresh a bit early so a token does not expire between check and request.
const EXPIRY_MARGIN_MS = 60_000;

export interface TokenStore {
  read(account: string): Promise<StoredToken | null>;
  save(account: string, token: Omit<StoredToken, "savedAt">): Promise<void>;
  /** A valid access token; refreshes (and persists a rotated refresh token) when needed. */
  accessToken(
    account: string,
    provider: OAuthProviderId,
    env: Record<string, string | undefined>,
    signal: AbortSignal,
    opts?: { force?: boolean },
  ): Promise<string>;
}

export interface TokenStoreOptions extends Omit<OAuthClientOptions, "env"> {
  dir: string;
}

export function createTokenStore(o: TokenStoreOptions): TokenStore {
  const now = o.now ?? Date.now;

  const fileOf = (account: string) => {
    if (!ACCOUNT_ID.test(account)) throw new Error(`Ungültige Konto-ID "${account}"`);
    return join(o.dir, `${account}.json`);
  };

  // The content holds secrets: errors name the file, never what is in it.
  const read = async (account: string) => readJsonFile(fileOf(account), StoredToken);
  const save = (account: string, token: Omit<StoredToken, "savedAt">) =>
    writeJsonFileAtomic(fileOf(account), { ...token, savedAt: new Date(now()).toISOString() });

  return {
    read,
    save: (account, token) => withLock(fileOf(account), () => save(account, token)),
    accessToken: (account, provider, env, signal, opts) =>
      withLock(fileOf(account), async () => {
        const stored = await read(account);
        if (!stored || stored.provider !== provider) throw new NotConnectedError(`Konto "${account}" ist nicht verbunden`);
        if (!opts?.force && stored.accessToken && stored.expiresAt !== null && stored.expiresAt - EXPIRY_MARGIN_MS > now()) {
          return stored.accessToken;
        }
        const fresh = await refreshAccessToken({ ...o, env, provider, refreshToken: stored.refreshToken, signal });
        await save(account, {
          ...stored,
          accessToken: fresh.accessToken,
          expiresAt: fresh.expiresAt,
          // Microsoft rotates it; Google keeps the old one.
          refreshToken: fresh.refreshToken ?? stored.refreshToken,
        });
        return fresh.accessToken;
      }),
  };
}

const shared = new Map<string, TokenStore>();

/** One store per directory for the mail collector and the auth routes (locks are keyed by file path anyway). */
export function tokenStoreFor(dir: string): TokenStore {
  let store = shared.get(dir);
  if (!store) shared.set(dir, (store = createTokenStore({ dir })));
  return store;
}
