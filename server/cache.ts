import { EventEmitter } from "node:events";
import type { WidgetState } from "@shared/widget-contract";

export interface Cache {
  get(instance: string): WidgetState | undefined;
  /** All states in config order. */
  all(): WidgetState[];
  set(state: WidgetState): void;
  onChange(fn: (state: WidgetState) => void): () => void;
}

// checkedAt alone is no change worth pushing to every client.
const fingerprint = (s: WidgetState) => JSON.stringify([s.status, s.updatedAt, s.error ?? null, s.data]);

export function createCache(order: string[] = []): Cache {
  const states = new Map<string, WidgetState>(); // insertion order = config order
  const fingerprints = new Map<string, string>();
  const events = new EventEmitter();
  events.setMaxListeners(0);

  for (const id of order) states.set(id, undefined as unknown as WidgetState);

  return {
    get: instance => states.get(instance),
    all: () => [...states.values()].filter(Boolean),
    set(state) {
      states.set(state.instance, state);
      const fp = fingerprint(state);
      if (fingerprints.get(state.instance) === fp) return;
      fingerprints.set(state.instance, fp);
      events.emit("change", state);
    },
    onChange(fn) {
      events.on("change", fn);
      return () => events.off("change", fn);
    },
  };
}
