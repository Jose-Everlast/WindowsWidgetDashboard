import { defineCollector } from "@shared/widget-contract";
import { HttpError } from "../../server/http";
import { parseActionInput } from "../../server/lib/action-input";
import { listProcessRows } from "../../server/lib/win";
import { StopIn, manifest } from "./manifest";
import { buildListeners } from "./parse";
import { stopListener, systemStopDeps, type StopDeps } from "./stop";

/** deps are injectable for tests; collect() still shares the one tasklist call with the agents widget. */
export function portsCollector(deps: StopDeps = systemStopDeps) {
  return defineCollector(manifest, {
    async collect({ config, signal }) {
      const [listeners, rows] = await Promise.all([deps.listListeners(signal), listProcessRows(signal)]);
      const processes = new Map(rows.map(r => [r.pid, { name: r.name, session: r.session }]));
      return buildListeners(listeners, processes, config, deps.self);
    },
    actions: {
      stop: async ({ config, signal, log }, input) => {
        const data = parseActionInput(StopIn, input);
        try {
          await stopListener(deps, data, config, signal);
        } catch (err) {
          // taskkill's own (localized) output stays in the log, the UI gets the German message.
          if (err instanceof HttpError && err.details instanceof Error) log(`Stop von PID ${data.pid} fehlgeschlagen: ${err.details.message}`);
          throw err;
        }
        log(`${data.process} (PID ${data.pid}) auf Port ${data.port} beendet`);
      },
    },
  });
}

export const collector = portsCollector();
