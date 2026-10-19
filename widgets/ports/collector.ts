import { defineCollector } from "@shared/widget-contract";
import { listListeners, listProcesses } from "../../server/lib/win";
import { manifest } from "./manifest";
import { buildListeners } from "./parse";

export const collector = defineCollector(manifest, {
  async collect({ config, signal }) {
    const [listeners, processes] = await Promise.all([listListeners(signal), listProcesses(signal)]);
    return buildListeners(listeners, processes, config);
  },
});
