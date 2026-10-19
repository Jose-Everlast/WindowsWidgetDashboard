// Authorized JSON GET for Gmail and Graph (server only). Answers are foreign input: validated with zod.
import { z } from "zod";
import { ReauthRequiredError } from "../../server/auth/token-store";

export type TokenGetter = (opts?: { force?: boolean }) => Promise<string>;

/** The provider answered, but not in the shape we rely on. */
export class FormatError extends Error {}

export interface ApiOptions {
  base: string;
  token: TokenGetter;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  /** For error messages, e.g. "Gmail". */
  name: string;
}

export async function getJson<T extends z.ZodType>(o: ApiOptions, path: string, schema: T): Promise<z.output<T>> {
  const call = async (force: boolean) =>
    (o.fetchImpl ?? fetch)(`${o.base}${path}`, {
      headers: { authorization: `Bearer ${await o.token({ force })}`, accept: "application/json" },
      signal: o.signal,
    });
  let res = await call(false);
  // A revoked or rotated access token: refresh once, then the account has to log in again.
  if (res.status === 401) res = await call(true);
  if (res.status === 401) throw new ReauthRequiredError(`${o.name}: Zugriff verweigert (401)`);
  if (!res.ok) throw new Error(`${o.name} ${path.split("?")[0]}: HTTP ${res.status}`);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new FormatError(`${o.name}: unerwartetes Format – ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
