import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCollector } from "@shared/widget-contract";
import { manifest } from "./manifest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

// Validation against WidgetView happens in the scheduler (manifest.data), not here.
export const collector = defineCollector(manifest, {
  async collect({ config, signal }) {
    if ("url" in config) {
      const res = await fetch(config.url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} von ${config.url}`);
      return await res.json();
    }
    const file = isAbsolute(config.file) ? config.file : join(ROOT, config.file);
    return JSON.parse(await readFile(file, "utf8"));
  },
});
