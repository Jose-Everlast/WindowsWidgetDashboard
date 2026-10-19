import { z } from "zod";
import type { WidgetState } from "@shared/widget-contract";
import type { Cache } from "./cache";
import { HttpError, notFound } from "./http";
import { log, logError } from "./log";
import type { ResolvedInstance } from "./widgets/loader";

const DEFAULT_TIMEOUT_MS = 20_000;

export const formatDuration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`);

export type Outcome = { ok: true; data: unknown; at: string } | { ok: false; error: string; at: string };

/** The status table from the plan: success → ok; failure keeps old data as stale, else error. */
export function nextState(prev: WidgetState, outcome: Outcome): WidgetState {
  if (outcome.ok) {
    return { ...prev, status: "ok", data: outcome.data, updatedAt: outcome.at, checkedAt: outcome.at, error: undefined };
  }
  const hasData = prev.data !== null && prev.data !== undefined;
  return {
    ...prev,
    status: hasData ? "stale" : "error",
    data: hasData ? prev.data : null,
    checkedAt: outcome.at,
    error: outcome.error,
  };
}

export function initialState(r: ResolvedInstance): WidgetState {
  return {
    instance: r.instance,
    type: r.type,
    // Never ran yet: "stale" without updatedAt reads as "loading" in the UI.
    status: r.initialStatus ?? "stale",
    updatedAt: null,
    checkedAt: null,
    data: null,
    error: r.initialError,
  };
}

export interface Scheduler {
  start(): void;
  stop(): void;
  refresh(instance: string): Promise<WidgetState>;
}

export function createScheduler(deps: {
  cache: Cache;
  instances: ResolvedInstance[];
  env: Record<string, string | undefined>;
  now?: () => Date;
}): Scheduler {
  const now = deps.now ?? (() => new Date());
  const byId = new Map(deps.instances.map(r => [r.instance, r]));
  const inflight = new Map<string, Promise<WidgetState>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let running = false;

  // Collect promises that outlived their timeout. Collectors may ignore the signal (rss-parser,
  // systeminformation), so the instance stays blocked until the original call settles: no pile-up.
  const hanging = new Map<string, Promise<unknown>>();

  for (const r of deps.instances) deps.cache.set(initialState(r));

  async function collectOnce(r: ResolvedInstance): Promise<Outcome> {
    if (hanging.has(r.instance)) {
      return { ok: false, error: "Vorheriger Lauf hängt noch – übersprungen", at: now().toISOString() };
    }
    const { manifest, collector } = r.loaded!;
    const scope = `widget:${r.type}/${r.instance}`;
    const timeoutMs = manifest.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error(`Zeitüberschreitung nach ${formatDuration(timeoutMs)}`));
      }, timeoutMs);
    });
    // Wrapped so a synchronous throw inside collect() is a rejection too.
    const collecting = Promise.resolve().then(() =>
      collector.collect({
        config: r.parsedConfig,
        env: deps.env,
        signal: controller.signal,
        log: (...args) => log(scope, ...args),
      }),
    );
    try {
      const data = await Promise.race([collecting, timeout]);
      const parsed = manifest.data.safeParse(data);
      if (!parsed.success) return { ok: false, error: `Ungültige Daten: ${z.prettifyError(parsed.error)}`, at: now().toISOString() };
      // State goes out as JSON (cache fingerprint, SSE): BigInt or cycles must fail here, not crash later.
      JSON.stringify(parsed.data);
      return { ok: true, data: parsed.data, at: now().toISOString() };
    } catch (err) {
      if (timedOut) {
        const settled = collecting.then(
          () => undefined,
          () => undefined,
        );
        hanging.set(r.instance, settled);
        void settled.then(() => hanging.delete(r.instance));
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err), at: now().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  }

  function run(r: ResolvedInstance): Promise<WidgetState> {
    const existing = inflight.get(r.instance);
    if (existing) return existing;

    const p = collectOnce(r).then(outcome => {
      const prev = deps.cache.get(r.instance) ?? initialState(r);
      const next = nextState(prev, outcome);
      // Log only status transitions, not every repeat of the same failure.
      if (next.status !== prev.status || (next.error && next.error !== prev.error && next.status !== "ok")) {
        if (next.status === "ok") log(`widget:${r.type}/${r.instance}`, "ok");
        else logError(`widget:${r.type}/${r.instance}`, `${next.status}: ${next.error}`);
      }
      deps.cache.set(next);
      return next;
    });
    inflight.set(r.instance, p);
    // Settle handlers must never leave a rejection unhandled: Node 24 exits on those.
    p.then(
      () => inflight.delete(r.instance),
      () => inflight.delete(r.instance),
    );
    return p;
  }

  // setTimeout chain instead of setInterval: re-plan only after a run finished, so runs never overlap.
  function loop(r: ResolvedInstance) {
    if (!running) return;
    run(r)
      .catch(err => logError(`widget:${r.type}/${r.instance}`, err instanceof Error ? err.message : String(err)))
      .finally(() => {
        if (!running) return;
        const interval = r.layout.intervalMs ?? r.loaded!.manifest.intervalMs;
        timers.set(r.instance, setTimeout(() => loop(r), interval));
      });
  }

  return {
    start() {
      if (running) return;
      running = true;
      for (const r of deps.instances) if (r.loaded) loop(r);
    },
    stop() {
      running = false;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
    async refresh(instance) {
      const r = byId.get(instance);
      if (!r) throw notFound(`instance "${instance}"`);
      if (!r.loaded) throw new HttpError(409, r.initialError ?? `instance "${instance}" kann nicht laufen`);
      return run(r);
    },
  };
}
