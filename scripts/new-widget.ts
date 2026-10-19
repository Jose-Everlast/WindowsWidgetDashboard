// npm run new-widget <id> [--view list|stat|progress|status|markdown]
// Creates widgets/<id>/ with manifest, collector, README and fixture. The collector throws until it is
// implemented: no placeholder data.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VIEW_TYPES, type WidgetViewType } from "../shared/widget-contract";

const ID = /^[a-z0-9][a-z0-9-]*$/;

const VIEW_SCHEMA: Record<WidgetViewType, string> = {
  stat: "StatView",
  list: "ListView",
  progress: "ProgressView",
  status: "StatusView",
  markdown: "MarkdownView",
};

const VIEW_FIXTURE: Record<WidgetViewType, unknown> = {
  stat: { view: "stat", items: [] },
  list: { view: "list", items: [] },
  progress: { view: "progress", items: [] },
  status: { view: "status", items: [] },
  markdown: { view: "markdown", text: "" },
};

const pascal = (id: string) => id.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());

export function scaffoldWidget(widgetsDir: string, id: string, opts: { view?: WidgetViewType } = {}): string[] {
  if (!ID.test(id)) throw new Error(`Ungültige ID "${id}" – kebab-case erwartet, z. B. git-status`);
  const dir = join(widgetsDir, id);
  if (existsSync(dir)) throw new Error(`widgets/${id} existiert bereits`);
  mkdirSync(join(dir, "fixtures"), { recursive: true });

  const { view } = opts;
  const files: Record<string, string> = {};

  files["manifest.ts"] = view
    ? `import { z } from "zod";
import { ${VIEW_SCHEMA[view]}, defineManifest } from "@shared/widget-contract";

export const manifest = defineManifest({
  id: "${id}",
  title: "${pascal(id)}",
  version: 1,
  category: "projects",
  defaultSize: { w: 3, h: 2 },
  intervalMs: 60_000,
  capabilities: [],
  view: "${view}",
  config: z.object({}),
  data: ${VIEW_SCHEMA[view]},
});
`
    : `import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const ${pascal(id)}Data = z.object({});
export type ${pascal(id)}Data = z.infer<typeof ${pascal(id)}Data>;

export const manifest = defineManifest({
  id: "${id}",
  title: "${pascal(id)}",
  version: 1,
  category: "projects",
  defaultSize: { w: 3, h: 2 },
  intervalMs: 60_000,
  capabilities: [],
  config: z.object({}),
  data: ${pascal(id)}Data,
});
`;

  files["collector.ts"] = `import { defineCollector } from "@shared/widget-contract";
import { manifest } from "./manifest";

export const collector = defineCollector(manifest, {
  async collect() {
    throw new Error("TODO: collect() implementieren");
  },
});
`;

  if (!view) {
    files["Widget.tsx"] = `import type { WidgetProps } from "@shared/widget-contract";
import type { ${pascal(id)}Data } from "./manifest";

export default function ${pascal(id)}Widget({ state }: WidgetProps<${pascal(id)}Data>) {
  return <pre className="text-xs text-muted">{JSON.stringify(state.data, null, 2)}</pre>;
}
`;
  }

  files["README.md"] = `# ${id}

TODO: Was zeigt das Widget, woher kommen die Daten, welche Keys braucht es?

## Konfiguration

\`\`\`json
{ "instance": "${id}", "type": "${id}", "x": 0, "y": 0, "config": {} }
\`\`\`

## Fixtures

\`fixtures/${id}.json\` muss eine echte Beispiel-Payload enthalten (geprüft von widgets/contract.test.ts).
`;

  files[join("fixtures", `${id}.json`)] = JSON.stringify(view ? VIEW_FIXTURE[view] : {}, null, 2) + "\n";

  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return Object.keys(files).map(f => join("widgets", id, f));
}

function main(argv: string[]) {
  const id = argv.find(a => !a.startsWith("--"));
  const viewIdx = argv.indexOf("--view");
  const view = viewIdx >= 0 ? argv[viewIdx + 1] : undefined;
  if (!id) throw new Error("Aufruf: npm run new-widget <id> [--view list|stat|progress|status|markdown]");
  if (view !== undefined && !(VIEW_TYPES as readonly string[]).includes(view)) {
    throw new Error(`--view muss einer von ${VIEW_TYPES.join(", ")} sein`);
  }
  const widgetsDir = fileURLToPath(new URL("../widgets", import.meta.url));
  const created = scaffoldWidget(widgetsDir, id, { view: view as WidgetViewType | undefined });
  console.log(`Angelegt:\n  ${created.join("\n  ")}`);
  console.log(`\nNächste Schritte: collect() implementieren, fixtures/${id}.json mit echten Daten füllen,`);
  console.log(`dann in dashboard.config.json eintragen: { "instance": "${id}", "type": "${id}", "x": 0, "y": 0 }`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
