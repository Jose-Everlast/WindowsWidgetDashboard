import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { LayoutResponse, TypesResponse } from "@shared/api";
import {
  missingEnv,
  type DashboardConfig,
  type InstanceConfig,
  type WidgetCollector,
  type WidgetManifest,
  type WidgetStatus,
} from "@shared/widget-contract";

export interface LoadedWidget {
  manifest: WidgetManifest;
  collector: WidgetCollector<unknown, unknown>;
  hasComponent: boolean;
}

export interface ResolvedInstance {
  instance: string;
  type: string;
  layout: InstanceConfig;
  /** Set when the instance can run. */
  loaded?: LoadedWidget;
  parsedConfig?: unknown;
  /** Set when the instance cannot run; the scheduler never polls it. */
  initialStatus?: Extract<WidgetStatus, "error" | "unconfigured">;
  initialError?: string;
}

const isWidgetDir = (name: string) => !name.startsWith("_") && !name.startsWith(".") && name !== "fixtures";

/** Finds widgets/<id>/ folders and imports manifest.ts + collector.ts. Contract violations throw: they are developer errors. */
export async function loadWidgetTypes(widgetsDir: string): Promise<Map<string, LoadedWidget>> {
  const types = new Map<string, LoadedWidget>();
  const dirs = readdirSync(widgetsDir, { withFileTypes: true }).filter(d => d.isDirectory() && isWidgetDir(d.name));

  for (const { name } of dirs) {
    const dir = join(widgetsDir, name);
    const manifestFile = join(dir, "manifest.ts");
    const collectorFile = join(dir, "collector.ts");
    if (!existsSync(manifestFile) || !existsSync(collectorFile)) {
      throw new Error(`widgets/${name}: manifest.ts und collector.ts sind Pflicht`);
    }
    // import() needs a file:// URL on Windows; a C:\ path fails.
    const { manifest } = (await import(pathToFileURL(manifestFile).href)) as { manifest?: WidgetManifest };
    const { collector } = (await import(pathToFileURL(collectorFile).href)) as {
      collector?: WidgetCollector<unknown, unknown>;
    };
    if (!manifest) throw new Error(`widgets/${name}/manifest.ts: export "manifest" fehlt`);
    if (!collector || typeof collector.collect !== "function") {
      throw new Error(`widgets/${name}/collector.ts: export "collector" mit collect() fehlt`);
    }
    if (manifest.id !== name) throw new Error(`widgets/${name}: manifest.id "${manifest.id}" muss dem Ordnernamen entsprechen`);

    types.set(name, { manifest, collector, hasComponent: existsSync(join(dir, "Widget.tsx")) });
  }
  return types;
}

/** Matches config instances to widget types and settles which ones can run. */
export function resolveInstances(
  config: DashboardConfig,
  types: Map<string, LoadedWidget>,
  env: Record<string, string | undefined>,
): ResolvedInstance[] {
  return config.widgets
    .filter(w => w.enabled)
    .map(layout => {
      const base = { instance: layout.instance, type: layout.type, layout };
      const loaded = types.get(layout.type);
      if (!loaded) return { ...base, initialStatus: "error", initialError: `Unbekannter Widget-Typ "${layout.type}"` };

      const parsed = loaded.manifest.config.safeParse(layout.config);
      if (!parsed.success) {
        return { ...base, initialStatus: "error", initialError: `Ungültige Konfiguration: ${z.prettifyError(parsed.error)}` };
      }

      const missing = missingEnv(loaded.manifest.env, env);
      if (missing.length) return { ...base, initialStatus: "unconfigured", initialError: `Fehlt in .env: ${missing.join(", ")}` };

      return { ...base, loaded, parsedConfig: parsed.data };
    });
}

export function buildLayout(config: DashboardConfig, types: Map<string, LoadedWidget>): LayoutResponse {
  return {
    grid: config.grid,
    widgets: config.widgets
      .filter(w => w.enabled)
      .map(w => {
        const m = types.get(w.type)?.manifest;
        return {
          ...w,
          w: w.w ?? m?.defaultSize.w ?? 3,
          h: w.h ?? m?.defaultSize.h ?? 2,
          title: w.title ?? m?.title ?? w.type,
          view: m?.view,
          hasComponent: types.get(w.type)?.hasComponent ?? false,
          overlay: (m?.overlay ?? false) && (types.get(w.type)?.hasComponent ?? false),
          frameless: (m?.frameless ?? false) && (types.get(w.type)?.hasComponent ?? false),
        };
      }),
  };
}

export function buildTypes(types: Map<string, LoadedWidget>): TypesResponse {
  return [...types.values()].map(({ manifest: m }) => {
    let configSchema: unknown = null;
    try {
      configSchema = z.toJSONSchema(m.config);
    } catch {
      // Not every zod schema is representable as JSON Schema.
    }
    return {
      id: m.id,
      title: m.title,
      version: m.version,
      category: m.category,
      defaultSize: m.defaultSize,
      capabilities: m.capabilities,
      env: m.env ?? [],
      view: m.view,
      configSchema,
    };
  });
}
