import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { DashboardConfig } from "@shared/widget-contract";
import { log } from "./log";

export interface ConfigPaths {
  configPath: string;
  examplePath: string;
}

/** Loads dashboard.config.json, creating it from the example on first start. Throws on invalid content. */
export function loadDashboardConfig(paths: ConfigPaths): { config: DashboardConfig; createdFromExample: boolean } {
  let createdFromExample = false;
  if (!existsSync(paths.configPath)) {
    copyFileSync(paths.examplePath, paths.configPath);
    createdFromExample = true;
    log("config", `${basename(paths.configPath)} aus Beispiel erstellt – Standort und Feeds anpassen`);
  }

  const name = basename(paths.configPath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paths.configPath, "utf8"));
  } catch (err) {
    throw new Error(`${name}: ungültiges JSON – ${(err as Error).message}`, { cause: err });
  }

  const parsed = DashboardConfig.safeParse(raw);
  if (!parsed.success) throw new Error(`${name}: ${z.prettifyError(parsed.error)}`);

  const seen = new Set<string>();
  for (const w of parsed.data.widgets) {
    if (seen.has(w.instance)) throw new Error(`${name}: Instanz "${w.instance}" ist doppelt`);
    seen.add(w.instance);
  }
  return { config: parsed.data, createdFromExample };
}
