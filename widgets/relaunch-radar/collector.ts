import { defineCollector } from "@shared/widget-contract";
import { subscribeSSE } from "../../server/lib/sse";
import { collectRelaunchRadar } from "./collect";
import { manifest } from "./manifest";

// Events that change what the widget shows. jobs/stream "line" (every log line) and "snapshot" are ignored.
const TRIGGERS: Record<string, Set<string>> = {
  "/api/notifications/stream": new Set(["notify", "autopilot"]),
  "/api/jobs/stream": new Set(["start", "end", "queue"]),
};

export const collector = defineCollector(manifest, {
  collect: ({ config, signal }) => collectRelaunchRadar({ config, signal }),

  subscribe({ config, signal, log, refresh }) {
    const base = config.url.replace(/\/+$/, "");
    for (const [path, events] of Object.entries(TRIGGERS)) {
      let connected = true; // log only the first failure after a success, not every retry
      void subscribeSSE(`${base}${path}`, {
        signal,
        onEvent: e => {
          if (events.has(e.event)) refresh();
        },
        // (Re)connected: relaunch-radar may just have started, so leave file mode quickly.
        onOpen: () => {
          connected = true;
          refresh();
        },
        onError: err => {
          if (!connected) return;
          connected = false;
          log(`SSE ${path} getrennt – verbinde neu:`, err instanceof Error ? err.message : String(err));
        },
      });
    }
  },
});
