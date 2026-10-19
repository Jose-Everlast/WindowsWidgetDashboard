// OAuth tokens per mail account in data/tokens/<account>.json (gitignored, never logged, never served).
// One lock per account: collect() and the login callback must not refresh at the same time, because
// Microsoft rotates the refresh token on every use.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
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
  const locks = new Map<string, Promise<unknown>>();

  const fileOf = (account: string) => {
    if (!ACCOUNT_ID.test(account)) throw new Error(`Ungültige Konto-ID "${account}"`);
    return join(o.dir, `${account}.json`);
  };

  function withLock<T>(account: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(account) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    locks.set(account, settled);
    void settled.then(() => {
      if (locks.get(account) === settled) locks.delete(account);
    });
    return next;
  }

  async function read(account: string): Promise<StoredToken | null> {
    const file = fileOf(account);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${file}: kein gültiges JSON`);
    }
    const parsed = StoredToken.safeParse(json);
    // The content holds secrets: report the file, not what is in it.
    if (!parsed.success) throw new Error(`${file}: unerwartetes Format`);
    return parsed.data;
  }

  async function save(account: string, token: Omit<StoredToken, "savedAt">): Promise<void> {
    const file = fileOf(account);
    await mkdir(o.dir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify({ ...token, savedAt: new Date(now()).toISOString() }, null, 2), "utf8");
    try {
      await rename(tmp, file);
    } catch (err) {
      // Windows: EPERM/EBUSY while another handle reads the target. Retry once.
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY") throw err;
      await new Promise(r => setTimeout(r, 50));
      await rename(tmp, file);
    }
  }

  return {
    read,
    save: (account, token) => withLock(account, () => save(account, token)),
    accessToken: (account, provider, env, signal, opts) =>
      withLock(account, async () => {
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

/** One store per directory, so the mail collector and the auth routes share the per-account locks. */
export function tokenStoreFor(dir: string): TokenStore {
  let store = shared.get(dir);
  if (!store) shared.set(dir, (store = createTokenStore({ dir })));
  return store;
}
