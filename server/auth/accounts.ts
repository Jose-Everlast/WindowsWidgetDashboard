import { z } from "zod";
import type { ResolvedInstance } from "../widgets/loader";
import type { OAuthProviderId } from "./providers";

export interface OAuthAccount {
  id: string;
  provider: OAuthProviderId;
}

const PROVIDER: Record<string, OAuthProviderId> = { gmail: "google", outlook: "microsoft" };
const WithAccounts = z.object({ accounts: z.array(z.object({ id: z.string(), provider: z.string() })) });

/**
 * OAuth accounts of all runnable mail instances. Kept type-agnostic (no widget manifest import).
 * Account IDs are token file names, so they must be unique across instances.
 */
export function oauthAccounts(instances: ResolvedInstance[]): OAuthAccount[] {
  const seen = new Set<string>();
  const out: OAuthAccount[] = [];
  for (const r of instances) {
    if (r.type !== "mail" || !r.loaded) continue;
    const parsed = WithAccounts.safeParse(r.parsedConfig);
    if (!parsed.success) continue;
    for (const a of parsed.data.accounts) {
      if (seen.has(a.id)) throw new Error(`Mail-Konto-ID "${a.id}" ist doppelt – IDs müssen über alle Mail-Instanzen eindeutig sein`);
      seen.add(a.id);
      const provider = PROVIDER[a.provider];
      if (provider) out.push({ id: a.id, provider });
    }
  }
  return out;
}
