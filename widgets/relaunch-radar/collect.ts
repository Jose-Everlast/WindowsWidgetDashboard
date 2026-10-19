import { readFile as fsReadFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { RelaunchRadarConfig, RelaunchRadarData } from "./manifest";
import { FeedIn, JobsRunningIn, NotificationFileIn, OverviewIn, fromApi, fromFile } from "./parse";

/** relaunch-radar answered, but not in the shape we rely on: a real error, not a reason for file mode. */
export class FormatError extends Error {}

export interface CollectRelaunchRadarOptions {
  config: RelaunchRadarConfig;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  readFile?: (path: string) => Promise<string>;
}

async function getJson<T extends z.ZodType>(base: string, path: string, schema: T, o: CollectRelaunchRadarOptions) {
  const res = await (o.fetchImpl ?? fetch)(`${base}${path}`, { signal: o.signal });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new FormatError(`relaunch-radar API ${path}: unerwartetes Format – ${z.prettifyError(parsed.error)}`);
  return parsed.data as z.output<T>;
}

/** Live from the API; when the API is unreachable, from logs/notifications.json ("file mode"). */
export async function collectRelaunchRadar(o: CollectRelaunchRadarOptions): Promise<RelaunchRadarData> {
  const base = o.config.url.replace(/\/+$/, "");
  try {
    const [overview, running, feed] = await Promise.all([
      getJson(base, "/api/overview", OverviewIn, o),
      getJson(base, "/api/jobs/running", JobsRunningIn, o),
      getJson(base, "/api/notifications", FeedIn, o),
    ]);
    return fromApi({ overview, running, feed }, o.config, base);
  } catch (err) {
    if (err instanceof FormatError || o.signal.aborted) throw err;
    const apiError = err instanceof Error ? (err.cause instanceof Error ? `${err.message} (${err.cause.message})` : err.message) : String(err);
    const file = join(o.config.dir, "logs", "notifications.json");
    let text: string;
    try {
      text = await (o.readFile ?? (p => fsReadFile(p, "utf8")))(file);
    } catch (fileErr) {
      throw new Error(`API nicht erreichbar (${apiError}) und ${file} nicht lesbar (${(fileErr as Error).message})`, {
        cause: fileErr,
      });
    }
    const parsed = NotificationFileIn.safeParse(JSON.parse(text));
    if (!parsed.success) throw new FormatError(`${file}: unerwartetes Format – ${z.prettifyError(parsed.error)}`);
    return fromFile(parsed.data, o.config, base, apiError);
  }
}
