import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { WidgetCollector, WidgetManifest, WidgetState } from "@shared/widget-contract";
import { createCache } from "./cache";
import { HttpError } from "./http";
import { createScheduler, nextState } from "./scheduler";
import type { ResolvedInstance } from "./widgets/loader";

const manifest: WidgetManifest = {
  id: "t",
  title: "T",
  version: 1,
  category: "system",
  defaultSize: { w: 1, h: 1 },
  intervalMs: 1000,
  timeoutMs: 500,
  capabilities: [],
  config: z.object({}),
  data: z.object({ n: z.number() }),
};

// Test doubles for the widget contract itself, not for any external service.
function instance(collect: WidgetCollector<unknown, unknown>["collect"], id = "t1"): ResolvedInstance {
  return {
    instance: id,
    type: "t",
    layout: { instance: id, type: "t", x: 0, y: 0, enabled: true, config: {} },
    loaded: { manifest, collector: { collect }, hasComponent: false },
    parsedConfig: {},
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("nextState", () => {
  const base: WidgetState = { instance: "a", type: "t", status: "stale", updatedAt: null, checkedAt: null, data: null };

  it("ok replaces data and clears the error", () => {
    const s = nextState({ ...base, error: "x" }, { ok: true, data: { n: 1 }, at: "T1" });
    expect(s).toMatchObject({ status: "ok", data: { n: 1 }, updatedAt: "T1", checkedAt: "T1" });
    expect(s.error).toBeUndefined();
  });

  it("failure after data → stale with old data", () => {
    const s = nextState({ ...base, status: "ok", data: { n: 1 }, updatedAt: "T1" }, { ok: false, error: "down", at: "T2" });
    expect(s).toMatchObject({ status: "stale", data: { n: 1 }, updatedAt: "T1", checkedAt: "T2", error: "down" });
  });

  it("failure without data → error", () => {
    expect(nextState(base, { ok: false, error: "down", at: "T2" })).toMatchObject({ status: "error", data: null, error: "down" });
  });
});

describe("createScheduler", () => {
  it("sets initial states, then ok after the first run", async () => {
    const cache = createCache();
    const unconfigured: ResolvedInstance = {
      instance: "u",
      type: "t",
      layout: { instance: "u", type: "t", x: 0, y: 0, enabled: true, config: {} },
      initialStatus: "unconfigured",
      initialError: "Fehlt in .env: K",
    };
    const s = createScheduler({ cache, instances: [instance(async () => ({ n: 1 })), unconfigured], env: {} });
    expect(cache.get("t1")?.status).toBe("stale");
    expect(cache.get("u")).toMatchObject({ status: "unconfigured", error: "Fehlt in .env: K" });
    s.start();
    await flush();
    expect(cache.get("t1")).toMatchObject({ status: "ok", data: { n: 1 } });
    s.stop();
  });

  it("goes stale after a failure that follows success, error without prior data", async () => {
    let fail = false;
    const cache = createCache();
    const s = createScheduler({
      cache,
      instances: [
        instance(async () => {
          if (fail) throw new Error("down");
          return { n: 1 };
        }),
        instance(async () => {
          throw new Error("never worked");
        }, "t2"),
      ],
      env: {},
    });
    s.start();
    await flush();
    fail = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.get("t1")).toMatchObject({ status: "stale", data: { n: 1 }, error: "down" });
    expect(cache.get("t2")).toMatchObject({ status: "error", data: null, error: "never worked" });
    s.stop();
  });

  it("rejects invalid payloads", async () => {
    const cache = createCache();
    const s = createScheduler({ cache, instances: [instance(async () => ({ n: "nope" }))], env: {} });
    s.start();
    await flush();
    expect(cache.get("t1")?.status).toBe("error");
    expect(cache.get("t1")?.error).toMatch(/^Ungültige Daten/);
    s.stop();
  });

  it("times out hanging collectors", async () => {
    const cache = createCache();
    const s = createScheduler({ cache, instances: [instance(() => new Promise(() => {}))], env: {} });
    s.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(cache.get("t1")).toMatchObject({ status: "error", error: "Zeitüberschreitung nach 500 ms" });
    s.stop();
  });

  it("keeps the last data as stale after a timeout", async () => {
    let hang = false;
    const cache = createCache();
    const s = createScheduler({
      cache,
      instances: [instance(() => (hang ? new Promise(() => {}) : Promise.resolve({ n: 1 })))],
      env: {},
    });
    s.start();
    await flush();
    hang = true;
    await vi.advanceTimersByTimeAsync(1000 + 500);
    expect(cache.get("t1")).toMatchObject({ status: "stale", data: { n: 1 }, error: "Zeitüberschreitung nach 500 ms" });
    s.stop();
  });

  it("does not start a new run while a timed-out collector is still running", async () => {
    let calls = 0;
    let finish: () => void = () => {};
    const cache = createCache();
    // Ignores its signal, like rss-parser or systeminformation.
    const stuck = instance(() => {
      calls++;
      return new Promise(resolve => (finish = () => resolve({ n: calls })));
    });
    const s = createScheduler({ cache, instances: [stuck], env: {} });
    s.start();
    await vi.advanceTimersByTimeAsync(4500);
    expect(calls).toBe(1);
    expect(cache.get("t1")?.error).toBe("Vorheriger Lauf hängt noch – übersprungen");

    finish(); // the original call settles → the next interval runs again
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toBe(2);
    s.stop();
  });

  it("turns non-JSON payloads into an error instead of crashing", async () => {
    const bigintInstance: ResolvedInstance = {
      ...instance(async () => ({ n: 1n })),
      loaded: {
        manifest: { ...manifest, data: z.object({ n: z.bigint() }) },
        collector: { collect: async () => ({ n: 1n }) },
        hasComponent: false,
      },
    };
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const cache = createCache();
    const s = createScheduler({ cache, instances: [bigintInstance], env: {} });
    s.start();
    await flush();
    process.off("unhandledRejection", unhandled);
    expect(cache.get("t1")?.status).toBe("error");
    expect(cache.get("t1")?.error).toMatch(/BigInt/);
    expect(unhandled).not.toHaveBeenCalled();
    s.stop();
  });

  it("never overlaps runs of a slow collector", async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const cache = createCache();
    const slow = instance(async () => {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 400)); // under the 500 ms timeout, but run+interval spans several ticks
      active--;
      return { n: calls };
    });
    const s = createScheduler({ cache, instances: [slow], env: {} });
    s.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(maxActive).toBe(1);
    // 400 ms run + 1000 ms pause per cycle
    expect(calls).toBeLessThanOrEqual(4);
    s.stop();
  });

  it("refresh dedupes concurrent requests and validates the instance", async () => {
    let calls = 0;
    const cache = createCache();
    const s = createScheduler({
      cache,
      instances: [
        instance(async () => {
          calls++;
          await new Promise(r => setTimeout(r, 100));
          return { n: calls };
        }),
      ],
      env: {},
    });
    const a = s.refresh("t1");
    const b = s.refresh("t1");
    await vi.advanceTimersByTimeAsync(100);
    expect(await a).toBe(await b);
    expect(calls).toBe(1);
    await expect(s.refresh("nope")).rejects.toMatchObject({ status: 404 });
  });

  it("refresh answers 409 for instances that cannot run", async () => {
    const cache = createCache();
    const unconfigured: ResolvedInstance = {
      instance: "u",
      type: "t",
      layout: { instance: "u", type: "t", x: 0, y: 0, enabled: true, config: {} },
      initialStatus: "unconfigured",
      initialError: "Fehlt in .env: K",
    };
    const s = createScheduler({ cache, instances: [unconfigured], env: {} });
    const err = await s.refresh("u").catch(e => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 409, message: "Fehlt in .env: K" });
  });

  it("stop() clears all timers", async () => {
    const collect = vi.fn(async () => ({ n: 1 }));
    const cache = createCache();
    const s = createScheduler({ cache, instances: [instance(collect)], env: {} });
    s.start();
    await flush();
    s.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(collect).toHaveBeenCalledTimes(1);
  });
});
