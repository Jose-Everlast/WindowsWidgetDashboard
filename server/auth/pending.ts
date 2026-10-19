// Login attempts between /auth/<provider>/start and /callback. In memory only: a server restart
// simply means "start the login again". A state is single use, which blocks login CSRF.
import type { OAuthProviderId } from "./providers";

export interface PendingAuth {
  provider: OAuthProviderId;
  account: string;
  verifier: string;
  createdAt: number;
}

export interface PendingStore {
  put(state: string, entry: Omit<PendingAuth, "createdAt">): void;
  /** Returns the entry once; it is always removed. Expired entries are undefined. */
  take(state: string): PendingAuth | undefined;
}

export function createPendingStore({
  ttlMs = 600_000,
  max = 20,
  now = Date.now,
}: { ttlMs?: number; max?: number; now?: () => number } = {}): PendingStore {
  // Map keeps insertion order: the first key is the oldest.
  const entries = new Map<string, PendingAuth>();
  return {
    put(state, entry) {
      entries.set(state, { ...entry, createdAt: now() });
      while (entries.size > max) entries.delete(entries.keys().next().value!);
    },
    take(state) {
      const entry = entries.get(state);
      entries.delete(state);
      if (!entry || now() - entry.createdAt > ttlMs) return undefined;
      return entry;
    },
  };
}
