// UI settings shared by every view (Lively and browser): data/ui-settings.json, pushed over SSE.
import { EventEmitter } from "node:events";
import { z } from "zod";
import type { UiSettings } from "@shared/api";
import { readJsonFile, withLock, writeJsonFileAtomic } from "./lib/json-file";

const UiSettingsFile = z.object({
  tileBackground: z.boolean().default(true),
  tileBorder: z.boolean().default(true),
  gameOfLife: z.boolean().default(true),
});
export const DEFAULT_SETTINGS: UiSettings = UiSettingsFile.parse({});

/** Browser input: strict, every field optional. */
export const UiSettingsPatch = z.strictObject({
  tileBackground: z.boolean().optional(),
  tileBorder: z.boolean().optional(),
  gameOfLife: z.boolean().optional(),
});

export interface SettingsStore {
  get(): UiSettings;
  update(patch: z.infer<typeof UiSettingsPatch>): Promise<UiSettings>;
  onChange(fn: (s: UiSettings) => void): () => void;
}

export async function createSettingsStore(file: string, log: (msg: string) => void = () => {}): Promise<SettingsStore> {
  let current: UiSettings;
  try {
    current = (await readJsonFile(file, UiSettingsFile)) ?? DEFAULT_SETTINGS;
  } catch (err) {
    // A broken file must not stop the dashboard: defaults until the next change overwrites it.
    log(`${err instanceof Error ? err.message : String(err)} – Standardwerte`);
    current = DEFAULT_SETTINGS;
  }
  const events = new EventEmitter();
  events.setMaxListeners(0);

  return {
    get: () => current,
    update: patch =>
      withLock(file, async () => {
        const next = { ...current, ...patch };
        await writeJsonFileAtomic(file, next);
        current = next;
        events.emit("change", next);
        return next;
      }),
    onChange(fn) {
      events.on("change", fn);
      return () => events.off("change", fn);
    },
  };
}
