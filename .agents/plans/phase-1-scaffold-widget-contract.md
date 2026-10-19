# Feature: Phase 1 – Gerüst, Widget-Vertrag & Basis-Widgets

Der Plan sollte vollständig sein. Prüfe trotzdem vor der Umsetzung Doku, Patterns und Plausibilität der Tasks. Achte auf exakte Namen von Typen und Funktionen aus `shared/widget-contract.ts`. Alle anderen Dateien bauen darauf auf.

## Feature Description

Phase 1 legt das komplette Fundament des windowsDashboard an. Das Repo ist bis jetzt nur Boilerplate, deshalb startet die Umsetzung im leeren Repo. Bestandteile:

1. **Projekt-Setup:**
   - ein einzelnes npm-Paket mit ESM, TypeScript strict, ESLint (flat), Vitest, Vite, Tailwind v4 und Hono
   - Ordner `server/`, `web/`, `shared/`, `widgets/`
2. **Widget-Vertrag** (PRD 6.1): `shared/widget-contract.ts` mit Manifest, Collector, `WidgetState`, `WidgetView` und `defineWidget`. Jedes Widget ist ein Ordner `widgets/<id>/`.
3. **Server:**
   - Loader findet `widgets/*/`, liest `dashboard.config.json` und prüft die Instanz-Konfigurationen
   - Scheduler pollt jede Instanz mit Timeout und schützt vor überlappenden Läufen
   - Cache leitet aus Erfolg oder Fehler den Status `ok`, `stale`, `error` oder `unconfigured` ab
   - REST, SSE `/api/stream` mit Snapshot und Ping, `POST /api/open` zum Öffnen von Links im Standardbrowser
   - liefert im Betrieb `dist/web` aus
4. **Web:**
   - Hub-Grid (12 Spalten) mit Widget-Rahmen, der Titel, Status und Fehler zeigt
   - Offline-Banner mit Reconnect, generische Views (`stat`, `list`, `progress`, `status`, `markdown`)
   - Registry über `import.meta.glob`, dunkles Theme
5. **Widgets:** `weather` (Open-Meteo), `news` (RSS), `system` (systeminformation), `external` (WidgetView-JSON von URL oder Datei, ohne Code)
6. **Werkzeuge:** `npm run new-widget <id>` als Scaffolder und `widgets/contract.test.ts` als Vertragstest
7. **Doku:** README-Abschnitt zu Setup und Lively, `.env.example` angepasst

## User Story

Als Nutzer will ich nach `npm run build && npm start` unter `http://127.0.0.1:4700` ein dunkles Dashboard mit echten Daten zu Wetter, News und System sehen und es in Lively als Desktop-Hintergrund setzen. Als Entwickler will ich neue Widgets per Ordner und Konfigurationseintrag einhängen können. So entsteht die Basis, auf der alle weiteren Phasen nur noch Widgets hinzufügen.

## Problem Statement

Es gibt noch keinen Code. Alle späteren Phasen, also Ports, Agents, relaunch-radar, Mail, Messenger und KI, brauchen einen stabilen und erweiterbaren Kern. Neue Datenquellen müssen sich ohne Änderung an Server-Kern oder Hub einhängen lassen, und Fehler einer Quelle dürfen den Rest nicht beeinträchtigen.

## Solution Statement

Die Patterns aus `C:\_repos\relaunch-radar` werden übernommen:
- Hono mit `createApp(deps)` für Testbarkeit
- `HttpError` mit `app.onError`
- SSE mit Snapshot beim Verbinden und verketteten Writes
- statisches Ausliefern von Hand mit SPA-Fallback
- `process.loadEnvFile`
- Server läuft über tsx, nur die UI wird gebaut

Das Widget-Grid und die Tailwind-v4-Tokens orientieren sich an `C:\_repos\widget_dashboard\web-mockup`.

Der Widget-Vertrag trennt pro Widget:
- `manifest.ts`: rein und auch im Browser importierbar
- `collector.ts`: nur Server
- `Widget.tsx`: nur Web, optional

So zieht die UI nie Server-Bibliotheken wie `systeminformation` ins Bundle.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High (Greenfield, viele Dateien, aber jede einzelne ist überschaubar)
**Primary Systems Affected**: alles neu: `server/`, `web/`, `shared/`, `widgets/`, `scripts/`, Root-Configs
**Dependencies**: hono, @hono/node-server, zod 4, react 19, vite 8, tailwindcss 4, systeminformation, rss-parser, vitest 5, typescript 5.9

---

## CONTEXT REFERENCES

### Relevante Dateien – VOR DER UMSETZUNG LESEN

Es gibt noch keinen eigenen Code. Die Pattern-Quellen liegen in Nachbar-Repos und werden nur gelesen, nie geändert:

- `C:\_repos\windowsDashboard\PRD.md` – Abschnitte 6, 6.1, 7, 9, 10, 11, 12 (Phase 1). Das ist die verbindliche Spezifikation. Bei Widersprüchen gilt dieser Plan, siehe NOTES.
- `C:\_repos\relaunch-radar\package.json` – Scripts und Versionen, `"type": "module"`
- `C:\_repos\relaunch-radar\tsconfig.json` – eine einzige tsconfig mit Bundler-Resolution und `@shared/*`-Alias
- `C:\_repos\relaunch-radar\server\index.ts` (Zeilen 22–34) – `serve()` mit Host und Port, Shutdown bei SIGINT/SIGTERM
- `C:\_repos\relaunch-radar\server\app.ts` (Zeilen 37, 57–80) – `createApp`, Reihenfolge der Routen (Static zuletzt), `notFound` und `onError`
- `C:\_repos\relaunch-radar\server\http.ts` (Zeilen 6–30) – `HttpError`, `notFound`, `parseJson` mit zod
- `C:\_repos\relaunch-radar\server\static.ts` (Zeilen 35–62) – statisches Ausliefern von Hand mit `safeRelPath`, Cache-Headern und SPA-Fallback
- `C:\_repos\relaunch-radar\server\routes\jobs.ts` (Zeilen 30–49) – `streamSSE` mit Snapshot, verketteten `writeSSE`-Aufrufen und `stream.onAbort`
- `C:\_repos\relaunch-radar\server\env.ts` (Zeilen 6–25) – `process.loadEnvFile`, `ROOT` über `import.meta.url`
- `C:\_repos\relaunch-radar\server\app.test.ts` (Zeilen 1–20) – Teststil mit `app.request`, expliziten vitest-Imports und tmp-Verzeichnis
- `C:\_repos\relaunch-radar\eslint.config.js` – Flat Config, an die die eigene Konfiguration angelehnt wird
- `C:\_repos\relaunch-radar\vite.config.ts` – `root: "web"`, `envDir: ".."`, Proxy und Alias
- `C:\_repos\relaunch-radar\vitest.config.ts` – include-Globs, Alias, `testTimeout`
- `C:\_repos\relaunch-radar\web\src\jobs\JobsContext.tsx` (Zeilen 66–122) – EventSource in einem Context-Provider mit `addEventListener` je Event
- `C:\_repos\widget_dashboard\web-mockup\src\index.css` (Zeilen 1–34) – Tailwind-v4-`@theme`-Tokens (dunkle Werte übernehmen)
- `C:\_repos\widget_dashboard\web-mockup\src\hub\WidgetTile.tsx` (Zeilen 5–37) – Kachel-Stil mit `border-line`, `bg-card` und Rundung
- `C:\_repos\widget_dashboard\web-mockup\src\widgets\types.ts` (Zeilen 3–23) und `registry.ts` – Idee der Registry, wird hier durch einen Glob ersetzt

### Neu zu erstellende Dateien

```
package.json, tsconfig.json, eslint.config.js, vite.config.ts, vitest.config.ts
.gitignore (UPDATE), .env.example (UPDATE), README.md (UPDATE)
dashboard.config.example.json            # tracked; dashboard.config.json ist gitignored
shared/widget-contract.ts                # Vertrag: Typen + zod-Schemas + defineWidget
shared/widget-contract.test.ts
shared/api.ts                            # Response-Typen für /api/* (Layout, Types)
server/env.ts                            # ROOT, loadEnvFile, config (host, port)
server/http.ts                           # HttpError, parseJson (MIRROR relaunch-radar)
server/log.ts                            # log(scope, ...) / logError(scope, ...)
server/config-file.ts                    # dashboard.config.json laden + validieren
server/config-file.test.ts
server/widgets/loader.ts                 # widgets/*/ finden, manifest+collector importieren
server/widgets/loader.test.ts
server/scheduler.ts                      # Poll-Loop pro Instanz, Timeout, Status-Ableitung
server/scheduler.test.ts
server/cache.ts                          # Map<instance, WidgetState> + EventEmitter
server/routes/api.ts                     # /api/health, /api/types, /api/layout, /api/widgets, actions, /api/open
server/routes/stream.ts                  # SSE /api/stream
server/static.ts                         # MIRROR relaunch-radar static.ts
server/app.ts                            # createApp(deps)
server/app.test.ts
server/index.ts                          # Bootstrap: env → config → loader → scheduler → serve
widgets/weather/{manifest.ts,collector.ts,parse.ts,parse.test.ts,Widget.tsx,fixtures/forecast.json,README.md}
widgets/news/{manifest.ts,collector.ts,parse.ts,parse.test.ts,fixtures/*.xml,fixtures/news.json,README.md}   # nutzt view "list"
widgets/system/{manifest.ts,collector.ts,Widget.tsx,fixtures/system.json,README.md}
widgets/external/{manifest.ts,collector.ts,collector.test.ts,fixtures/external.json,README.md}  # rendert generisch
widgets/contract.test.ts
web/index.html
web/src/main.tsx, web/src/index.css
web/src/hub/{DashboardProvider.tsx,Hub.tsx,WidgetFrame.tsx,OfflineBanner.tsx,registry.ts}
web/src/views/{GenericView.tsx,StatView.tsx,ListView.tsx,ProgressView.tsx,StatusView.tsx,MarkdownView.tsx,GenericView.test.tsx}
web/src/lib/{openUrl.ts,time.ts}
scripts/new-widget.ts
scripts/new-widget.test.ts
```

### Relevante Dokumentation – VOR DER UMSETZUNG LESEN

- [Hono – Streaming Helper / streamSSE](https://hono.dev/docs/helpers/streaming#streamsse) – Snapshot, Ping und `onAbort` für `/api/stream`
- [Hono – Testing (`app.request`)](https://hono.dev/docs/guides/testing) – Tests der Routen ohne laufenden Server
- [@hono/node-server README](https://github.com/honojs/node-server#readme) – Signatur von `serve()` in v2
- [Zod 4 – JSON Schema (`z.toJSONSchema`)](https://zod.dev/json-schema) – für `/api/types`, ohne extra Paket
- [Zod 4 – Error formatting (`z.prettifyError`)](https://zod.dev/error-formatting) – verständliche Konfigurationsfehler
- [Open-Meteo Forecast API](https://open-meteo.com/en/docs) – Parameter `current`, `hourly`, `daily`, `timezone=auto`, `forecast_hours` sowie die WMO-Wettercodes (Tabelle am Ende der Seite)
- [rss-parser README](https://github.com/rbren/rss-parser#readme) – `parseString`/`parseURL`, Felder `items[].title|link|isoDate`
- [systeminformation – CPU/Memory/FS](https://systeminformation.io/) – `currentLoad()`, `mem()`, `fsSize()`, `time()`
- [Vite – `import.meta.glob`](https://vite.dev/guide/features.html#glob-import) – Registry der Widget-Komponenten
- [Tailwind v4 – Vite-Setup und `@theme`](https://tailwindcss.com/docs/installation/using-vite) – Theme-Tokens
- [Vitest – Environment per Datei](https://vitest.dev/guide/environment.html#environments-for-specific-files) – `// @vitest-environment jsdom` für Komponententests
- [Lively Wallpaper – Web-/URL-Wallpaper](https://github.com/rocksdanister/lively/wiki) – Abschnitt „Web wallpaper“ für die README-Anleitung

### Patterns to Follow

**Module/Imports (wie relaunch-radar):**
- ESM (`"type": "module"`), relative Imports **ohne** `.js`-Endung, Bundler-Resolution
- `verbatimModuleSyntax`: Typ-Imports immer mit `import type` bzw. `type` inline
- Alias `@shared/*` → `./shared/*`, eingetragen in `tsconfig.json`, `vite.config.ts` und `vitest.config.ts`
- Widgets importieren den Vertrag über `@shared/widget-contract`

**Benennung:**
- Dateien in kebab-case (`widget-contract.ts`, `config-file.ts`), React-Komponenten in PascalCase (`WidgetFrame.tsx`)
- Widget-IDs in kebab-case, identisch mit dem Ordnernamen (`weather`, `relaunch-radar`)
- Instanz-IDs in kebab-case (`wetter-muenster`)

**Error Handling (MIRROR `relaunch-radar/server/http.ts` + `app.ts:71-80`):**
```ts
export class HttpError extends Error {
  constructor(public status: ContentfulStatusCode, message: string, public details?: unknown) { super(message); }
}
// app.ts
app.notFound(c => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, details: err.details }, err.status);
  logError("server", err.message);
  return c.json({ error: err.message }, 500);
});
```
Routen werfen Fehler, statt sie mit try/catch abzufangen. Fehler eines Collectors landen **nie** im HTTP-Fehlerpfad. Sie werden im Scheduler gefangen und in `WidgetState.status` bzw. `error` übersetzt.

**Logging (wie relaunch-radar: console mit Scope-Tag):**
```ts
// server/log.ts
export const log = (scope: string, ...args: unknown[]) => console.log(`[${scope}]`, ...args);
export const logError = (scope: string, ...args: unknown[]) => console.error(`[${scope}]`, ...args);
```
Als Scope dient z. B. `server`, `scheduler` oder `widget:weather/wetter-muenster`. Pro Collector-Fehler wird **eine** Zeile geloggt. Wiederholt sich derselbe Fehler, wird er nur beim Statuswechsel geloggt, damit das Log nicht vollläuft.

**SSE (MIRROR `relaunch-radar/server/routes/jobs.ts:30-49`, plus Ping laut PRD):**
```ts
app.get("/api/stream", c => streamSSE(c, async stream => {
  let chain: Promise<unknown> = Promise.resolve();
  const send = (event: string, data: unknown) =>
    (chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })));
  void send("snapshot", cache.all());
  const off = cache.onChange(state => void send("widget", state));
  const ping = setInterval(() => void send("ping", { at: new Date().toISOString() }), 15_000);
  await new Promise<void>(resolve => stream.onAbort(() => { off(); clearInterval(ping); resolve(); }));
}));
```

**Tests (MIRROR `relaunch-radar/server/app.test.ts`):**
- vitest-Funktionen explizit importieren (`import { describe, expect, it } from "vitest"`), keine Globals
- Tests liegen neben dem Code (`*.test.ts` bzw. `*.test.tsx`)
- Die App wird mit `createApp(deps)` und injizierten Fakes für Cache und Registry getestet, nie gegen Netzwerk-APIs
- Externe Daten (Open-Meteo, RSS) werden **nur** über Fixture-Dateien getestet, die als echte Antworten gespeichert sind. Das ist kein Mock eines Dienstes, sondern ein Parser-Test.

---

## WIDGET-VERTRAG (verbindliche Definition)

`shared/widget-contract.ts` darf **nur** `zod` importieren und keine Node- oder DOM-APIs nutzen, weil die Datei von Server und Web gemeinsam verwendet wird.

```ts
import { z } from "zod";

export const WIDGET_CATEGORIES = ["daily", "comms", "projects", "system", "ai"] as const;
export const CAPABILITIES = ["network", "fs", "powershell", "process", "ai"] as const;
export const VIEW_TYPES = ["stat", "list", "progress", "status", "markdown"] as const;
export type WidgetViewType = (typeof VIEW_TYPES)[number];

export type WidgetStatus = "ok" | "stale" | "unconfigured" | "error";

export interface WidgetManifest<C extends z.ZodType = z.ZodType, T extends z.ZodType = z.ZodType> {
  id: string;                       // == Ordnername, kebab-case
  title: string;
  version: number;                  // ganzzahlig ≥ 1
  category: (typeof WIDGET_CATEGORIES)[number];
  defaultSize: { w: 1 | 2 | 3 | 4 | 5 | 6; h: 1 | 2 | 3 | 4 };
  intervalMs: number;               // Default-Poll-Intervall; Phase 1 nur Polling
  timeoutMs?: number;               // Default 20_000
  config: C;                        // zod-Schema der Instanz-Konfiguration
  data: T;                          // zod-Schema der Payload
  env?: string[];                   // fehlt eine Variable → "unconfigured"
  capabilities: Array<(typeof CAPABILITIES)[number]>;
  view?: WidgetViewType;            // gesetzt ⇒ Payload ist WidgetView, Hub rendert generisch
}

export interface CollectContext<C> {
  config: C;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
  log: (...args: unknown[]) => void;
}

export interface WidgetCollector<C, T> {
  collect(ctx: CollectContext<C>): Promise<T>;
  // Phase 1: nur "refresh" ist eingebaut (vom Scheduler bereitgestellt, nicht vom Collector).
  actions?: Record<string, (ctx: CollectContext<C>, input: unknown) => Promise<unknown>>;
}

export const defineManifest = <C extends z.ZodType, T extends z.ZodType>(m: WidgetManifest<C, T>) => m;
export const defineCollector = <C extends z.ZodType, T extends z.ZodType>(
  _m: WidgetManifest<C, T>, c: WidgetCollector<z.infer<C>, z.infer<T>>,
) => c;

export interface WidgetState<T = unknown> {
  instance: string;
  type: string;
  status: WidgetStatus;
  updatedAt: string | null;   // ISO; Zeitpunkt der letzten erfolgreichen Daten
  checkedAt: string | null;   // ISO; letzter Versuch
  data: T | null;             // bei "stale" bleiben die letzten guten Daten erhalten
  error?: string;
}

// ---- Generische Views (zod, weil "external" fremde JSONs validieren muss) ----
export const Tone = z.enum(["neutral", "good", "warn", "bad"]);
export const WidgetView = z.discriminatedUnion("view", [
  z.object({ view: z.literal("stat"), items: z.array(z.object({
    label: z.string(), value: z.union([z.string(), z.number()]), unit: z.string().optional(),
    trend: z.enum(["up", "down"]).optional(), tone: Tone.optional() })).max(12) }),
  z.object({ view: z.literal("list"), items: z.array(z.object({
    title: z.string(), subtitle: z.string().optional(), meta: z.string().optional(),
    url: z.url({ protocol: /^https?$/ }).optional(), tone: Tone.optional() })).max(50) }),
  z.object({ view: z.literal("progress"), items: z.array(z.object({
    label: z.string(), percent: z.number().min(0).max(100), caption: z.string().optional() })).max(12) }),
  z.object({ view: z.literal("status"), items: z.array(z.object({
    label: z.string(), state: z.enum(["ok", "warn", "error", "idle"]), detail: z.string().optional() })).max(30) }),
  z.object({ view: z.literal("markdown"), text: z.string().max(5000) }),
]);
export type WidgetView = z.infer<typeof WidgetView>;

// ---- dashboard.config.json ----
export const InstanceConfig = z.object({
  instance: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  type: z.string(),
  x: z.number().int().min(0), y: z.number().int().min(0),
  w: z.number().int().min(1).optional(), h: z.number().int().min(1).optional(), // Default: manifest.defaultSize
  title: z.string().optional(),
  intervalMs: z.number().int().min(1000).optional(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});
export const DashboardConfig = z.object({
  grid: z.object({
    columns: z.number().int().min(1).default(12),
    rows: z.number().int().min(1).default(8),
    gapPx: z.number().int().min(0).default(12),
    reserveLeftPx: z.number().int().min(0).default(0),   // Platz für Desktop-Icons
    reserveTopPx: z.number().int().min(0).default(0),
  }).default({ columns: 12, rows: 8, gapPx: 12, reserveLeftPx: 0, reserveTopPx: 0 }),
  widgets: z.array(InstanceConfig),
});
export type DashboardConfig = z.infer<typeof DashboardConfig>;
export type InstanceConfig = z.infer<typeof InstanceConfig>;

// Props jeder Widget.tsx
export interface WidgetProps<T> { state: WidgetState<T> & { data: T }; config: Record<string, unknown>; }
```

**Statuslogik** (`server/scheduler.ts`, als reine Funktion `nextState(prev, outcome)`, die einzeln getestet wird):

| Situation | status | data | error |
|---|---|---|---|
| Typ unbekannt (kein Ordner) | `error` | null | `Unbekannter Widget-Typ "<type>"` |
| Instanz-Config ungültig | `error` | null | `z.prettifyError(...)` |
| `manifest.env` unvollständig | `unconfigured` | null | `Fehlt in .env: X, Y` |
| collect ok + Payload ok | `ok` | neu | – |
| collect wirft / Timeout / Payload ungültig, es gab vorher Daten | `stale` | alte Daten | Meldung |
| collect wirft / Timeout / Payload ungültig, keine vorherigen Daten | `error` | null | Meldung |
| noch nie gelaufen | `stale` mit `updatedAt: null` → UI zeigt „lädt …“ | null | – |

---

## IMPLEMENTATION PLAN

### Phase A: Fundament
Root-Configs, Dependencies, Vertrag, `env`, `http`, `log`.

### Phase B: Server-Kern
config-file, loader, cache, scheduler, routes, static, app, index.

### Phase C: Widgets
weather, news, system, external, contract-Test, Scaffolder.

### Phase D: Web
Provider, Hub, Frame, Offline, Views, Registry, Theme.

### Phase E: Doku & Validierung
README, `.env.example`, Abnahme.

---

## STEP-BY-STEP TASKS

Die Tasks laufen streng von oben nach unten. Shell: Git Bash oder PowerShell. Alle Befehle sind nicht-interaktiv.

### 1. CREATE `package.json`
- **IMPLEMENT**:
  - `"name": "windows-dashboard"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=24" }`
  - Scripts:
    ```json
    "dev": "concurrently -k -n server,web \"npm:dev:server\" \"npm:dev:web\"",
    "dev:server": "tsx watch --exclude ./web --exclude ./dist server/index.ts",
    "dev:web": "vite",
    "start": "tsx server/index.ts",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "check": "npm run typecheck && npm run lint && npm run test && npm run build",
    "new-widget": "tsx scripts/new-widget.ts"
    ```
- **PATTERN**: `C:\_repos\relaunch-radar\package.json` (Scripts identisch aufgebaut)
- **IMPORTS**: Die Pakete werden per npm installiert, mit den zuletzt geprüften Versionen (Stand 2026-10-19):
  ```bash
  npm i hono@^4.13.13 @hono/node-server@^2.1.5 zod@^4.6.7 react@^19.3.1 react-dom@^19.3.1 systeminformation@^5.33.15 rss-parser@^3.13.0 lucide-react@^1.59.0
  npm i -D typescript@~5.9.3 tsx@^4.23.15 vite@^8.3.4 @vitejs/plugin-react@^6.1.2 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 vitest@^5.0.5 jsdom@^30.1.3 @testing-library/react@^16.3.3 eslint@^10.13.0 @eslint/js@^10.0.1 typescript-eslint@^8.71.2 eslint-plugin-react-hooks@^7.1.1 globals@^17.13.0 concurrently@^10.0.6 @types/node@^24 @types/react@^19.3.0 @types/react-dom@^19.3.0
  ```
- **GOTCHA**:
  - **Nicht** TypeScript 7 verwenden. `npm view typescript version` liefert 7.0.2, aber `typescript-eslint` 8.71 verlangt `typescript >=4.8.4 <6.1.0`. Deshalb `~5.9.3`, wie relaunch-radar.
  - `@types/node@^24` passt zur installierten Node-Version 24.12.
- **VALIDATE**: `npm ls --depth=0` (keine `UNMET`/`invalid`)

### 2. CREATE `tsconfig.json`
- **IMPLEMENT**: Kopie der relaunch-radar-Optionen:
  - `target ES2023`, `lib [ES2023, DOM, DOM.Iterable]`
  - `module ESNext`, `moduleResolution Bundler`, `jsx react-jsx`
  - `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `resolveJsonModule`, `skipLibCheck`, `noEmit`
  - `types ["node", "vite/client"]`, `paths { "@shared/*": ["./shared/*"] }`
  - `include`: `["shared", "server", "web/src", "widgets", "scripts", "*.config.ts"]`
- **PATTERN**: `C:\_repos\relaunch-radar\tsconfig.json`
- **GOTCHA**: `vite/client` wird gebraucht, damit `import.meta.glob` in `web/src/hub/registry.ts` typisiert ist.
- **VALIDATE**: `npx tsc --showConfig > /dev/null && echo ok`

### 3. CREATE `eslint.config.js`
- **IMPLEMENT**:
  - Flat Config mit `globalIgnores(["dist/", "node_modules/", "data/"])`, `js.configs.recommended` und `tseslint.configs.recommended`
  - Für `web/**/*.{ts,tsx}` und `widgets/**/*.tsx`: React-Hooks-Regeln (`reactHooks.configs.flat["recommended-latest"]`) und Browser-Globals
  - Für `server/**`, `scripts/**`, `shared/**`, `widgets/**/*.ts` und `*.config.{ts,js}`: Node-Globals
  - Regel `@typescript-eslint/no-unused-vars` mit `argsIgnorePattern: "^_"`
- **PATTERN**: `C:\_repos\relaunch-radar\eslint.config.js`
- **VALIDATE**: `npx eslint --print-config server/index.ts > /dev/null && echo ok` (Datei muss dafür noch nicht existieren; notfalls später unter Task 14 prüfen)

### 4. CREATE `vite.config.ts` und `vitest.config.ts`
- **IMPLEMENT** in `vite.config.ts` (`defineConfig(({ mode }) => …)`):
  - `loadEnv(mode, process.cwd(), "")`, API-Ziel `http://${HOST||127.0.0.1}:${PORT||4700}`
  - `root: "web"`, `envDir: ".."`, `plugins: [react(), tailwindcss()]`, Alias `@shared`
  - `server: { host: "127.0.0.1", port: 5174, strictPort: true, proxy: { "/api": { target: api, changeOrigin: false } } }`
  - `build: { outDir: "../dist/web", emptyOutDir: true }`
  - `server.fs.allow: [".."]`, damit Vite die Dateien `../widgets/*/Widget.tsx` ausliefern darf
- **IMPLEMENT** in `vitest.config.ts`:
  - `environment: "node"`
  - `include: ["shared/**/*.test.ts", "server/**/*.test.ts", "widgets/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "web/**/*.test.{ts,tsx}"]`
  - `testTimeout: 20000`, Alias `@shared`
- **PATTERN**: `C:\_repos\relaunch-radar\vite.config.ts`, `vitest.config.ts`
- **GOTCHA**:
  - Port **5174**, weil 5173 von relaunch-radar belegt ist.
  - Für SSE über den Vite-Proxy keine Kompression aktivieren. Der Standard-Proxy reicht für SSE aus.
- **VALIDATE**: `npx vite --version`

### 5. UPDATE `.gitignore`
- **ADD**: `data/` und `dashboard.config.json`
- **GOTCHA**: `dashboard.config.example.json` muss getrackt bleiben. Es passt nicht auf das Muster `dashboard.config.json`, das ist also in Ordnung.
- **VALIDATE**: `git check-ignore dashboard.config.json && ! git check-ignore dashboard.config.example.json && echo ok`

### 6. CREATE `shared/widget-contract.ts` + `shared/widget-contract.test.ts`
- **IMPLEMENT**: Exakt wie im Abschnitt „WIDGET-VERTRAG“.
- **IMPLEMENT** außerdem `export function missingEnv(required: string[] | undefined, env: Record<string, string | undefined>): string[]`. Sie gibt die fehlenden oder leeren Variablen zurück.
- **TESTS**:
  - `WidgetView` akzeptiert jede der 5 Varianten.
  - `WidgetView` lehnt ab: `percent: 120`, eine URL mit `javascript:` und eine unbekannte `view`.
  - `DashboardConfig` setzt die Grid-Defaults.
  - `InstanceConfig` lehnt `instance: "Wetter Münster"` ab.
  - `missingEnv` erkennt auch leere Strings.
- **GOTCHA**: zod 4 hat `z.url({ protocol })` und `z.record(keySchema, valueSchema)` mit zwei Argumenten. `z.string().url()` ist veraltet.
- **VALIDATE**: `npx vitest run shared`

### 7. CREATE `shared/api.ts`
- **IMPLEMENT**: Response-Typen der API:
  - `LayoutResponse = { grid: DashboardConfig["grid"]; widgets: Array<InstanceConfig & { w: number; h: number; title: string; view?: WidgetViewType; hasComponent: boolean }> }`
  - `TypesResponse = Array<{ id; title; version; category; defaultSize; capabilities; env: string[]; view?: WidgetViewType; configSchema: unknown }>`
  - `HealthResponse = { ok: true; uptimeS: number; instances: Array<{ instance; type; status; updatedAt }> }`
- **VALIDATE**: `npx tsc --noEmit`

### 8. CREATE `server/env.ts`, `server/http.ts`, `server/log.ts`
- **IMPLEMENT** in `env.ts`:
  - `ROOT = fileURLToPath(new URL("..", import.meta.url))`
  - `.env` laden, falls vorhanden (`process.loadEnvFile`)
  - `export const config = { root: ROOT, host: process.env.HOST || "127.0.0.1", port: Number(process.env.PORT || 4700), distDir: join(ROOT, "dist", "web"), widgetsDir: join(ROOT, "widgets"), dashboardConfigPath: join(ROOT, "dashboard.config.json"), dashboardExamplePath: join(ROOT, "dashboard.config.example.json") }`
  - Ist `HOST` nicht `127.0.0.1` oder `localhost`, **mit Fehlermeldung abbrechen** (PRD 9: nur localhost).
- **IMPLEMENT** in `http.ts`: MIRROR von relaunch-radar `http.ts:6-30` (`HttpError`, `notFound`, `parseJson`).
- **IMPLEMENT** in `log.ts`: siehe Pattern oben.
- **PATTERN**: `C:\_repos\relaunch-radar\server\env.ts:6-25`, `http.ts:6-30`
- **VALIDATE**: `npx tsc --noEmit`

### 9. CREATE `dashboard.config.example.json` + `server/config-file.ts` + Test
- **IMPLEMENT** im Beispiel: Grid `{ columns: 12, rows: 8, gapPx: 12, reserveLeftPx: 120, reserveTopPx: 0 }` und folgende Widgets:
  - `wetter` (weather, x 0, y 0, `{ lat: 51.96, lon: 7.63, label: "Münster" }`)
  - `news` (news, x 3, y 0, Feeds tagesschau und heise, siehe Task 15)
  - `system` (system, x 9, y 0)
  - `external-beispiel` (external, x 9, y 3, `{ file: "widgets/external/fixtures/external.json" }`)
- **IMPLEMENT** in `config-file.ts`: `loadDashboardConfig(paths): { config: DashboardConfig; createdFromExample: boolean }`
  - Fehlt `dashboard.config.json`, wird das Beispiel dorthin **kopiert** und `log("config", "dashboard.config.json aus Beispiel erstellt – Standort anpassen")` ausgegeben. Das ist laut, nicht still.
  - Bei ungültigem JSON oder einem Schema-Fehler wird mit `z.prettifyError` geworfen. Den Abbruch mit Meldung übernimmt der Server-Start.
  - Doppelte `instance`-IDs werfen ebenfalls.
- **TESTS** in einem tmp-Verzeichnis:
  - Die Kopie wird angelegt, wenn die Datei fehlt.
  - Doppelte IDs werfen.
  - Defaults für Grid und `enabled` werden gesetzt.
  - Kaputtes JSON führt zu einem Fehler, der den Dateinamen enthält.
- **VALIDATE**: `npx vitest run server/config-file`

### 10. CREATE `server/widgets/loader.ts` + Test
- **IMPLEMENT**: `loadWidgetTypes(widgetsDir): Promise<Map<string, LoadedWidget>>` mit `LoadedWidget = { manifest: WidgetManifest; collector: WidgetCollector<unknown, unknown>; hasComponent: boolean }`
  - Unterordner auflisten und alle mit `_` oder `.` am Anfang sowie `fixtures` ignorieren.
  - `manifest.ts` und `collector.ts` über `pathToFileURL(file).href` dynamisch importieren. Erwartet werden die Exporte `manifest` und `collector`.
  - Prüfen, dass `manifest.id === Ordnername`. Sonst werfen; das ist ein Entwicklerfehler und soll den Start abbrechen.
  - `hasComponent = existsSync(Widget.tsx)`. Ohne `Widget.tsx` rendert der Hub generisch; dass die Payload dann eine `WidgetView` ist, prüft der Contract-Test aus Task 18, nicht der Loader.
- **IMPLEMENT**: `resolveInstances(config, types, env)` liefert für jede `enabled` Instanz `{ instance, type, layout, loaded?, parsedConfig?, initialError?, initialStatus? }`. Daraus ergeben sich die Fälle „unbekannter Typ“, „ungültige Config“ und „env fehlt“ aus der Statustabelle.
- **GOTCHA**:
  - Unter Windows braucht `import()` eine `file://`-URL, ein Pfad wie `C:\...` scheitert. Deshalb immer `pathToFileURL`.
  - tsx übersetzt `.ts` bei dynamischem Import automatisch.
- **TESTS**:
  - gegen das echte `widgets/`-Verzeichnis, sobald Task 15 fertig ist; bis dahin gegen ein tmp-Verzeichnis mit einem Minimal-Widget
  - `resolveInstances` für alle 3 Fehlerfälle und den Gutfall
- **VALIDATE**: `npx vitest run server/widgets`

### 11. CREATE `server/cache.ts` + `server/scheduler.ts` + Test
- **IMPLEMENT** in `cache.ts`: `createCache()` mit `get(instance)`, `all(): WidgetState[]` (Reihenfolge wie in der Config), `set(state)` und `onChange(fn): () => void` (EventEmitter mit `setMaxListeners(0)`). `set` meldet eine Änderung nur, wenn sich `status`, `updatedAt`, `error` oder `data` (JSON-Vergleich) geändert haben. `checkedAt` allein löst kein Event aus, damit nicht alle 5 s unnötige Events für System entstehen. Ausnahme: System ändert sich ohnehin immer.
- **IMPLEMENT** in `scheduler.ts`:
  - `export function nextState(prev, outcome)` als reine Funktion für die Statustabelle
  - `createScheduler({ cache, instances, env, now? })` mit:
    - `start()`
    - `stop()`
    - `refresh(instance): Promise<WidgetState>`, wirft `HttpError(404)` bei unbekannter Instanz und `HttpError(409)`, wenn die Instanz `unconfigured` oder `error` durch die Config ist
  - Ablauf pro lauffähiger Instanz:
    1. Den ersten Lauf sofort starten.
    2. Danach `setTimeout`-Kette mit `instance.intervalMs ?? manifest.intervalMs`, also kein `setInterval`. So wird erst nach Abschluss neu geplant und es gibt keine überlappenden Läufe.
    3. Jeder Lauf bekommt `AbortSignal.timeout(manifest.timeoutMs ?? 20_000)`.
    4. Ergebnis mit `manifest.data.safeParse` prüfen. Bei einem Fehler wird `Ungültige Daten: <prettifyError>` zum Fehler des Laufs.
    5. Fehler nur bei einem Statuswechsel loggen.
  - `refresh` wartet, falls schon ein Lauf aktiv ist, auf diesen laufenden Promise. Das dedupliziert parallele Anfragen.
- **TESTS** mit `vi.useFakeTimers()` und Fake-Collectors (das sind Test-Doubles für den Vertrag, keine externen Dienste):
  - ok → `ok`
  - Fehler nach ok → `stale` mit alten Daten
  - Fehler ohne vorherige Daten → `error`
  - ungültige Payload → `error` mit „Ungültige Daten“
  - Timeout → `stale` bzw. `error`
  - Kein Overlap: Ein langsamer Collector wird bei einem Intervall kleiner als seine Dauer nicht doppelt gestartet.
  - `refresh` dedupliziert.
  - `stop()` beendet alle Timer.
- **VALIDATE**: `npx vitest run server/scheduler`

### 12. CREATE `server/routes/api.ts`, `server/routes/stream.ts`, `server/static.ts`, `server/app.ts` + Test
- **IMPLEMENT**: `createApp(deps: { cache; scheduler; layout: LayoutResponse; types: TypesResponse; distDir: string; openUrl: (url: string) => Promise<void>; startedAt: number })` mit folgenden Routen:
  - `GET /api/health` → `HealthResponse`
  - `GET /api/types` → `deps.types` (beim Start einmal berechnet; `configSchema` über `z.toJSONSchema(manifest.config)` in einem try/catch, bei Fehlern `null`)
  - `GET /api/layout` → `deps.layout`
  - `GET /api/widgets` → `cache.all()`
  - `GET /api/widgets/:instance` → einzelner Zustand oder 404
  - `POST /api/widgets/:instance/actions/:action`: Phase 1 kennt nur `refresh` (`scheduler.refresh`); alles andere gibt 404 mit der Meldung `unknown action`.
  - `POST /api/open`:
    - Body `{ url }` mit `parseJson`, Schema `z.object({ url: z.url({ protocol: /^https?$/ }) })`
    - **Schutz gegen CSRF:** `content-type` muss `application/json` sein, sonst 415. Ist ein `Origin`-Header gesetzt, muss er `http://127.0.0.1:<port>`, `http://localhost:<port>` oder in der Entwicklung `http://127.0.0.1:5174` sein, sonst 403.
    - danach `deps.openUrl(url)` und Antwort `204`
  - `GET /api/stream`: siehe SSE-Pattern; sendet `snapshot` (`WidgetState[]`), `widget` (ein `WidgetState`) und `ping`.
  - Static zuletzt: MIRROR `relaunch-radar/server/static.ts:35-62` mit `RESERVED = /^\/api(\/|$)/`. Fehlt `dist/web/index.html`, antwortet `GET /` mit 503 und dem Text `UI nicht gebaut – npm run build`.
  - `notFound` und `onError` wie im Pattern.
- **IMPLEMENT** `openUrl` in `server/index.ts` (nicht in `app.ts`, damit Tests es injizieren können): `spawn("explorer.exe", [url], { detached: true, stdio: "ignore" }).unref()`
- **GOTCHA**:
  - **Kein** `cmd /c start`: `&` in URLs wäre dort eine Command Injection. `explorer.exe <url>` öffnet den Standardbrowser, und die URL ist durch zod schon auf http(s) begrenzt.
  - `explorer.exe` beendet sich mit Code 1, obwohl es funktioniert hat. Den Exit-Code deshalb ignorieren.
- **TESTS** in `app.test.ts` über `app.request`:
  - health
  - layout
  - widgets (Liste und 404)
  - refresh-Action ruft den Scheduler auf
  - `/api/open`: ok → 204 und Fake-`openUrl` wurde mit der URL aufgerufen
  - `/api/open` mit `javascript:alert(1)` → 400
  - `/api/open` ohne JSON-Content-Type → 415
  - `/api/open` mit fremdem `Origin` (`https://evil.example`) → 403
  - unbekannter Pfad `/api/x` → 404 als JSON
  - SPA-Fallback liefert die `index.html` aus einem tmp-Verzeichnis `distDir`
  - `/api/stream` liefert `content-type: text/event-stream`, und der erste Event ist `snapshot`: Body lesen bis `\n\n`, dann mit `AbortController` abbrechen
- **VALIDATE**: `npx vitest run server/app`

### 13. CREATE `server/index.ts`
- **IMPLEMENT** in dieser Reihenfolge:
  1. `config` aus `env.ts`
  2. `loadDashboardConfig`
  3. `loadWidgetTypes`
  4. `resolveInstances`
  5. Layout- und Types-Responses bauen; dabei werden `w`/`h` mit `manifest.defaultSize` aufgefüllt und `title` mit `instance.title ?? manifest.title`.
  6. `createCache`, Anfangszustände setzen (initialError bzw. `stale` mit `updatedAt: null`)
  7. `createScheduler(...).start()`
  8. `createApp`
  9. `serve({ fetch: app.fetch, hostname, port }, info => log("server", \`listening on http://${host}:${info.port}\`))`
  10. Bei SIGINT/SIGTERM: `scheduler.stop()`, `server.close()`, `process.exit(0)`
- **Start-Fehler**, also kaputte Config, ein Widget-Ordner, der gegen den Vertrag verstößt, oder ein belegter Port (`EADDRINUSE`), werden mit klarer Meldung geloggt und beenden den Prozess mit `process.exit(1)`. Bei `EADDRINUSE` lautet der Hinweis: „Port 4700 belegt – PORT in .env ändern oder Prozess beenden“.
- **PATTERN**: `C:\_repos\relaunch-radar\server\index.ts:22-34`
- **VALIDATE**: siehe Task 22 (Start-Smoke-Test)

### 14. CREATE `widgets/external/*`
- **IMPLEMENT** in `manifest.ts`:
  - `id "external"`, `title "Extern"`, `version 1`, `category "projects"`, `defaultSize { w: 3, h: 2 }`, `intervalMs 30_000`, `capabilities ["network", "fs"]`
  - `config`: `z.union([z.object({ url: z.url({ protocol: /^https?$/ }) }), z.object({ file: z.string().min(1) })])`
  - `data: WidgetView`, ohne `view`. Der Typ ist dynamisch; der Hub rendert jede `WidgetView`-Payload generisch, siehe Task 21.
- **IMPLEMENT** in `collector.ts`:
  - Für `url`: `fetch(url, { signal })`; ist die Antwort nicht ok, mit `HTTP <status>` werfen. Danach `json()`.
  - Für `file`: Pfad relativ zum Repo-Root auflösen (über `ROOT` aus `server/env.ts`), dann `readFile` und `JSON.parse`.
  - Das Ergebnis wird **nicht** im Collector validiert, sondern vom Scheduler über `manifest.data`.
- **IMPLEMENT** `fixtures/external.json`: ein `status`-View mit 3 Einträgen. Es ist das Beispiel aus der Config, also echte Beispieldaten und keine Fake-API.
- **IMPLEMENT** `README.md`: Format (alle 5 Views mit Beispiel-JSON), Einbindung über `dashboard.config.json` und den Hinweis, dass jedes lokale Projekt so ein JSON liefern kann.
- **TESTS** in `collector.test.ts`: `file` liest das Fixture. Für `url` wird ein lokaler `node:http`-Server auf einem zufälligen Port gestartet (echtes HTTP, kein Mock) und geprüft, dass bei 500 geworfen wird.
- **GOTCHA**: Regel für den Hub: Fehlt `Widget.tsx`, rendert er `GenericView`, und `GenericView` liest die Variante aus `data.view`. `manifest.view` ist nur ein Hinweis für `/api/types`, beim `external`-Widget bleibt es leer.
- **VALIDATE**: `npx vitest run widgets/external`

### 15. CREATE `widgets/news/*`
- **IMPLEMENT** in `manifest.ts`:
  - `id "news"`, `title "News"`, `version 1`, `category "daily"`, `defaultSize { w: 6, h: 3 }`, `intervalMs 900_000`, `capabilities ["network"]`, `view: "list"`
  - `config`: `z.object({ feeds: z.array(z.object({ label: z.string(), url: z.url() })).min(1), perFeed: z.number().int().min(1).max(20).default(5) })`
  - `data`: `WidgetView`, eingeschränkt auf die `list`-Variante (`WidgetView.options` bzw. ein eigenes `ListView`-Schema aus dem Vertrag exportieren)
- **IMPLEMENT** in `parse.ts`: `toListItems(feedLabel, parsedFeed, perFeed)` gibt `{ title, subtitle: feedLabel, meta: <HH:MM bzw. "gestern">, url }` zurück. Die Feeds werden zusammengeführt und nach `isoDate` absteigend sortiert, höchstens 30 Einträge.
- **IMPLEMENT** in `collector.ts`:
  - `rss-parser` mit `new Parser({ timeout: 15000, headers: { "User-Agent": "windowsDashboard/0.1 (+local)" } })`
  - Die Feeds parallel über `Promise.allSettled` laden. Liefert ein Feed nichts, wird er übersprungen und geloggt. Scheitern **alle**, wirft der Collector.
- **Feeds** im Beispiel-Config (am 2026-10-19 geprüft, beide liefern HTTP 200):
  - tagesschau: `https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml` (RSS 2.0)
  - heise: `https://www.heise.de/rss/heise-top-atom.xml` (Atom)
- **FIXTURES**: beide Feeds einmal echt herunterladen und unter `fixtures/tagesschau.xml` bzw. `fixtures/heise.xml` speichern (höchstens 5 Items, Rest kürzen). Mit `parser.parseString` testen. Zusätzlich `fixtures/news.json` mit der erwarteten Payload anlegen; sie dient dem Contract-Test.
- **GOTCHA**:
  - `rss-parser` übernimmt `signal` nicht. Der Timeout kommt aus der Parser-Option, der Abbruch über das Scheduler-Timeout.
  - Die Zeit wird mit `Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin" })` formatiert.
- **VALIDATE**: `npx vitest run widgets/news`

### 16. CREATE `widgets/weather/*`
- **IMPLEMENT** in `manifest.ts`:
  - `id "weather"`, `title "Wetter"`, `version 1`, `category "daily"`, `defaultSize { w: 3, h: 3 }`, `intervalMs 600_000`, `capabilities ["network"]`
  - `config`: `z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), label: z.string() })`
  - `data`: `z.object({ label, current: { temp, apparent, code, wind }, hours: [{ time, temp, precipProb, code }] (12), days: [{ date, min, max, precipProb, code }] (3) })`
- **IMPLEMENT** in `collector.ts`: `fetch` mit `signal` auf
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3&forecast_hours=12`
  Ist die Antwort nicht ok, mit `Open-Meteo HTTP <status>` werfen.
- **IMPLEMENT** in `parse.ts`:
  - `parseForecast(json, label)` zippt die parallelen Arrays aus `hourly`/`daily` (`time[]`, `temperature_2m[]`, …) zu Objekten.
  - `wmo(code): { label: string; icon: "sun" | "cloud-sun" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm" }` mit deutschen Bezeichnungen:
    - 0 Klar
    - 1–3 Heiter bis bewölkt
    - 45/48 Nebel
    - 51–57 Niesel
    - 61–67 bzw. 80–82 Regen
    - 71–77 bzw. 85–86 Schnee
    - 95–99 Gewitter
- **IMPLEMENT** in `Widget.tsx`: groß die aktuelle Temperatur mit Icon (lucide: `Sun`, `CloudSun`, `Cloud`, `CloudFog`, `CloudDrizzle`, `CloudRain`, `CloudSnow`, `CloudLightning`) und „gefühlt“. Darunter eine 12-h-Reihe mit Temperatur und Regen-%, dann 3 Tageszeilen.
- **FIXTURE**: eine echte Antwort für Münster als `fixtures/forecast.json` speichern. **Achtung:** Beim Planen (2026-10-19) lieferte Open-Meteo zweimal HTTP 503. Wenn das noch so ist: später erneut versuchen oder die Beispielantwort von https://open-meteo.com/en/docs (Abschnitt „API Response“) übernehmen und gegen die eigene Anfrage abgleichen. **Kein erfundenes JSON.** `fixtures/weather.json` ist die erwartete Payload nach `parseForecast`.
- **TESTS**: `parseForecast` gegen das Fixture (12 Stunden, 3 Tage, Felder gesetzt) und `wmo` für alle Bereiche sowie unbekannte Codes (→ „Unbekannt“, `cloud`).
- **VALIDATE**: `npx vitest run widgets/weather`

### 17. CREATE `widgets/system/*`
- **IMPLEMENT** in `manifest.ts`:
  - `id "system"`, `title "System"`, `version 1`, `category "system"`, `defaultSize { w: 3, h: 3 }`, `intervalMs 5_000`, `capabilities ["process"]`
  - `config`: `z.object({ drives: z.array(z.string()).optional() })`
  - `data`: `{ cpu: { load: number }, mem: { usedBytes, totalBytes }, disks: [{ mount, usedBytes, sizeBytes }], uptimeS }`
- **IMPLEMENT** in `collector.ts`: `Promise.all([si.currentLoad(), si.mem(), si.fsSize()])` und `si.time().uptime`.
  - Für RAM gilt `mem.active` als belegt; `mem.used` enthält auf Windows den Cache.
  - `fsSize` wird auf `config.drives` gefiltert, falls gesetzt.
  - `fsSize` ist auf Windows langsam (PowerShell bzw. WMI, ca. 0,5–1 s). Deshalb im Modul-Scope cachen und nur alle 60 s neu abfragen.
- **IMPLEMENT** in `Widget.tsx`: Balken für CPU, RAM und je Laufwerk mit Prozentwert und `x,y / z GB`, dazu die Uptime als „3 T 4 h“.
- **FIXTURE**: `fixtures/system.json` aus einem echten Lauf erzeugen. Dafür einmal `npx tsx -e "…collector.collect(…)"` ausführen und die Ausgabe speichern.
- **VALIDATE**: `npx tsx -e "import('./widgets/system/collector.ts').then(async m => console.log(JSON.stringify(await m.collector.collect({ config: {}, env: process.env, signal: AbortSignal.timeout(20000), log: console.log }))))"` liefert plausible Werte.

### 18. CREATE `widgets/contract.test.ts`
- **IMPLEMENT**: Für jeden Ordner in `widgets/` (ohne `_*` und `.*`) wird über `loadWidgetTypes` geprüft:
  1. `manifest.id === Ordnername`, und `id` ist kebab-case.
  2. `version` ist eine Ganzzahl ≥ 1, und `intervalMs` ist ≥ 1000.
  3. Es gibt `README.md`.
  4. Es gibt `fixtures/<id>.json` (Pflicht), und die Datei besteht `manifest.data.parse()`. Rohantworten anderer Dienste haben eigene Namen (`forecast.json`, `*.xml`) und werden hier nicht geprüft.
  5. Ohne `Widget.tsx` muss `fixtures/<id>.json` auch `WidgetView.parse()` bestehen.
  6. `manifest.config` akzeptiert die Config des Widgets aus `dashboard.config.example.json`, falls es dort vorkommt.
- **Fixture-Dateien je Widget:**
  - external: `external.json`
  - weather: `weather.json` (Payload) und `forecast.json` (Rohantwort)
  - news: `news.json`, `tagesschau.xml`, `heise.xml`
  - system: `system.json`
- **VALIDATE**: `npx vitest run widgets/contract`

### 19. CREATE `scripts/new-widget.ts` + Test
- **IMPLEMENT**: `npm run new-widget <id> [--view list|stat|progress|status|markdown]`
  - `id` gegen `/^[a-z0-9][a-z0-9-]*$/` prüfen; existiert der Ordner schon, abbrechen (Exit 1).
  - Angelegt werden `manifest.ts`, `collector.ts` (der Collector wirft `new Error("TODO: collect() implementieren")`, **keine** Fake-Daten), `README.md` und `fixtures/<id>.json`.
  - Mit `--view` ist das Fixture ein minimaler gültiger View. Ohne `--view` wird zusätzlich `Widget.tsx` angelegt, und das Fixture ist `{}` mit dem Schema `z.object({})`.
  - Am Ende wird der Hinweis auf den Eintrag in `dashboard.config.json` ausgegeben.
- **IMPLEMENT** die Logik als exportierte Funktion `scaffoldWidget(widgetsDir, id, opts)`, damit sie testbar ist. Die CLI ist nur ein Wrapper.
- **TESTS**: In einem tmp-Verzeichnis anlegen und die Dateien prüfen. Danach mit `loadWidgetTypes(tmp)` laden; das muss ohne Fehler durchlaufen, und das Fixture besteht `manifest.data`. Bei einer ungültigen ID wird geworfen, bei einem existierenden Ordner ebenfalls.
- **VALIDATE**: `npx vitest run scripts`

### 20. CREATE `web/index.html`, `web/src/main.tsx`, `web/src/index.css`
- **IMPLEMENT** in `index.html`: `lang="de"`, Titel „Dashboard“ und `<div id="root">`. Kein Favicon nötig.
- **IMPLEMENT** in `index.css`:
  - `@import "tailwindcss";` und `@source "../../widgets";`, damit Tailwind die Klassen in `widgets/*/Widget.tsx` findet
  - `@theme` mit den **dunklen** Tokens aus `web-mockup/src/index.css`: page `#05070d`, surface `#0b0f19`, card `#161b26` mit ~85 % Deckkraft (`rgb(22 27 38 / 0.85)`), fg `#e5e7eb`, muted `#94a3b8`, line `#263041`
  - dazu die Farben good `#34d399`, warn `#fbbf24`, bad `#f87171`, accent `#60a5fa` und die Schriften `Inter`, `ui-sans-serif`, `system-ui`
  - `html, body, #root { height: 100%; }`, `body { background: var(--color-page); overflow: hidden; }`
  - Nur dunkles Theme, weil es ein Wallpaper ist (PRD 11 UX).
- **IMPLEMENT** in `main.tsx`: `createRoot(...).render(<StrictMode><DashboardProvider><Hub/></DashboardProvider></StrictMode>)`
- **PATTERN**: `C:\_repos\widget_dashboard\web-mockup\src\index.css:1-34`
- **GOTCHA**: Die `@source`-Direktive gibt es nur in Tailwind v4. Ohne sie fehlen die Klassen aus `widgets/` im Build.
- **VALIDATE**: `npx vite build` läuft durch (auch ohne Hub, falls dieser Task vorab separat geprüft wird)

### 21. CREATE `web/src/hub/*`, `web/src/views/*`, `web/src/lib/*`
- **`DashboardProvider.tsx`**:
  - Context mit `{ layout: LayoutResponse | null; states: Record<instance, WidgetState>; online: boolean; lastEventAt: number | null; refresh(instance) }`
  - Beim Mount wird `GET /api/layout` aufgerufen. Scheitert der Aufruf, wird alle 5 s erneut versucht, und `online` ist false.
  - Danach wird `EventSource("/api/stream")` geöffnet:
    - `snapshot` ersetzt alle Zustände
    - `widget` ersetzt eine Instanz
    - `ping` aktualisiert `lastEventAt`
  - `onerror` setzt `online = false`; EventSource verbindet sich selbst neu, und der nächste `snapshot` setzt `online = true`.
  - **Watchdog:** Kam 40 s lang kein Event (Ping alle 15 s), wird die EventSource geschlossen, eine neue geöffnet, `online = false` gesetzt und das Layout neu geladen. Das fängt Server-Neustarts und Standby ab.
  - **Layout-Version:** Unterscheidet sich der beim Neuverbinden geladene Layout-JSON-String vom alten, wird `location.reload()` ausgelöst. So kommen neue Widgets nach einem Server-Neustart ohne manuelles Neuladen an, auch in Lively.
  - PATTERN: `C:\_repos\relaunch-radar\web\src\jobs\JobsContext.tsx:66-122` (`addEventListener` je Event, `JSON.parse` der `MessageEvent.data`). **Anders als dort** wird bei unsichtbarer Seite **nicht** pausiert, weil das Wallpaper immer „sichtbar“ ist.
- **`Hub.tsx`**:
  - CSS-Grid über die gesamte Fläche, `paddingLeft = grid.reserveLeftPx`, `paddingTop = grid.reserveTopPx`, `gap = grid.gapPx`
  - `gridTemplateColumns: repeat(columns, 1fr)`, `gridTemplateRows: repeat(rows, 1fr)`
  - Für jede Layout-Instanz ein `<WidgetFrame>` mit `gridColumn: \`${x+1} / span ${w}\``, `gridRow: \`${y+1} / span ${h}\``
  - Solange `layout` null ist, wird nur das `OfflineBanner` gezeigt.
- **`WidgetFrame.tsx`**:
  - Karte (`rounded-2xl border border-line bg-card backdrop-blur p-4 overflow-hidden flex flex-col`)
  - Header mit Titel, Status-Punkt (ok grün, stale gelb, error rot, unconfigured grau), relativer Zeit `updatedAt` („vor 3 Min.“) und einem kleinen Refresh-Button (lucide `RotateCw`) → `refresh(instance)`
  - Body je nach Zustand:
    - `state` fehlt oder `stale` ohne Daten → dezentes „lädt …“
    - `error`/`unconfigured` ohne Daten → Icon und Fehlertext (bei `unconfigured`: „Nicht eingerichtet: …“)
    - sonst Inhalt, bei `stale` zusätzlich eine dünne gelbe Fußzeile mit dem Fehler
  - Inhalt: `hasComponent` → Lazy-Komponente aus der Registry in `<Suspense>`, sonst `<GenericView data={state.data} />`
  - Ein `ErrorBoundary` pro Widget (Klassen-Komponente in derselben Datei) verhindert, dass ein Renderfehler den ganzen Hub abstürzen lässt.
- **`OfflineBanner.tsx`**: bei `!online` eine schmale Leiste oben rechts: „Server nicht erreichbar – verbinde neu …“. Die letzten Daten bleiben sichtbar.
- **`registry.ts`**:
  - `const modules = import.meta.glob<{ default: ComponentType<WidgetProps<any>> }>("../../../widgets/*/Widget.tsx")`
  - `export function widgetComponent(type: string)` liefert `React.lazy(modules[\`../../../widgets/${type}/Widget.tsx\`])` und cached das Ergebnis pro Typ in einer Map, damit `lazy` stabil bleibt.
- **`views/*`**: `GenericView` schaltet über `data.view` auf eine der Komponenten um:
  - `StatView`: Kacheln mit Wert, Einheit und Trend-Pfeil
  - `ListView`: Zeilen mit Titel, Untertitel und meta; bei `url` klickbar über `openUrl`
  - `ProgressView`: Balken
  - `StatusView`: Punkt, Label, Detail
  - `MarkdownView`: **nur** `whitespace-pre-wrap` als Text, kein HTML-Rendering und keine Markdown-Abhängigkeit in Phase 1
  - Ist `data` kein gültiger `WidgetView` (per `WidgetView.safeParse`), wird ein Fehlertext gerendert.
- **`lib/openUrl.ts`**: `fetch("/api/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) })`. Scheitert der Aufruf, wird `window.open(url, "_blank")` als Fallback genutzt, weil die UI auch im normalen Browser funktionieren soll.
- **`lib/time.ts`**: `relativeTime(iso, now)` liefert deutsche Texte („gerade eben“, „vor 3 Min.“, „vor 2 Std.“, „gestern“).
- **TESTS** in `GenericView.test.tsx` mit `// @vitest-environment jsdom` in der ersten Zeile:
  - Jeder View rendert sein Fixture.
  - Ein ungültiger View zeigt den Fehlertext.
  - Ein Klick auf ein `ListView`-Item mit URL ruft `openUrl` auf (das Modul über `vi.mock("../lib/openUrl")` ersetzen; das ist ein UI-interner Helfer, kein externer Dienst).
  - `relativeTime` wird zusätzlich als Unit-Test geprüft.
- **GOTCHA**:
  - `import.meta.glob`-Pfade müssen relativ und **statisch** sein; Template-Strings im Glob sind nicht erlaubt.
  - Der Schlüssel der Map ist exakt der relative Pfad. Im Test `Object.keys(modules)` prüfen, wenn der Lookup fehlschlägt.
- **VALIDATE**: `npx vitest run web && npx vite build`

### 22. UPDATE `.env.example`
- **REMOVE**: die Boilerplate-Blöcke `NODE_ENV`/`APP_URL`, Database, Auth, Third-party
- **ADD**: den Kopfkommentar behalten, dazu:
  ```
  # --- Server ----------------------------------------------------------------
  # Nur localhost! Der Server verweigert den Start mit einer anderen Adresse.
  HOST=127.0.0.1
  # 3000 ist durch relaunch-radar/app-generator belegt, 5173 durch deren Vite.
  PORT=4700
  # --- Weitere Integrationen folgen in späteren Phasen (Mail, Messenger, KI) --
  # Widget-spezifische, nicht geheime Einstellungen (Standort, Feeds) stehen in
  # dashboard.config.json, nicht hier. Hier nur Secrets und Server-Settings.
  ```
- **VALIDATE**: `grep -c DATABASE_URL .env.example` gibt 0 aus

### 23. UPDATE `README.md`
- **IMPLEMENT**: Den Boilerplate-README nicht löschen, sondern **oben** einen Abschnitt „windowsDashboard“ einfügen. Der bisherige Inhalt wandert unter die Überschrift „## Agentic Coding Workflow (Boilerplate)“. Der neue Abschnitt enthält:
  - Kurzbeschreibung und Link zu `PRD.md`
  - Setup: `npm install`, `cp .env.example .env`, `npm run dev` (UI auf http://127.0.0.1:5174, API auf :4700)
  - Betrieb: `npm run build && npm start` → http://127.0.0.1:4700
  - Konfiguration: `dashboard.config.json` (wird beim ersten Start aus dem Beispiel erzeugt), Felder des Grids, Instanz-Felder
  - **Lively einrichten:**
    1. Lively Wallpaper aus dem Microsoft Store installieren.
    2. In Lively „+“ bzw. „Wallpaper hinzufügen“ wählen und die URL `http://127.0.0.1:4700` eingeben.
    3. Das Wallpaper anwenden.
    4. In den Lively-Einstellungen unter „Wallpaper“ die Eingabe bzw. Interaktion auf Maus stellen, damit Klicks ankommen.
    5. Lively-Autostart aktivieren.
    6. Den Server-Autostart beschreibt Phase 7.

    Die genauen Menübezeichnungen gegen das Lively-Wiki prüfen und so übernehmen, wie sie in der aktuellen Version heißen.
  - Neues Widget: `npm run new-widget <id> [--view list]`, dann Collector implementieren, `fixtures/<id>.json` mit echten Daten füllen und die Instanz in `dashboard.config.json` eintragen
  - Externes Widget ohne Code: Verweis auf `widgets/external/README.md`
  - Scripts-Tabelle (`dev`, `build`, `start`, `test`, `lint`, `typecheck`, `check`, `new-widget`)
- **VALIDATE**: `grep -q "127.0.0.1:4700" README.md && echo ok`

### 24. Gesamtvalidierung
- **VALIDATE**: `npm run check` (typecheck, lint, test, build), alles grün.
- **VALIDATE**: Start-Smoke-Test, siehe Level 3 unten.

---

## TESTING STRATEGY

### Unit Tests (Vitest, neben dem Code)
- `shared/widget-contract.test.ts`: Schemas (WidgetView, DashboardConfig, InstanceConfig), `missingEnv`
- `server/config-file.test.ts`: Kopie aus dem Beispiel, Duplikate, Defaults, kaputtes JSON
- `server/widgets/loader.test.ts`: Erkennung, ID-Prüfung, `resolveInstances` (4 Fälle)
- `server/scheduler.test.ts`: komplette Statustabelle, kein Overlap, Timeout, `refresh`-Deduplizierung, `stop`
- `widgets/*/parse.test.ts`: Open-Meteo und RSS/Atom gegen echte Fixtures, WMO-Mapping
- `widgets/contract.test.ts`: Vertrag für **alle** Widgets, auch künftige
- `scripts/new-widget.test.ts`: Scaffolder, und das Ergebnis besteht den Loader
- `web/src/views/GenericView.test.tsx`: alle Views, ungültige Payload, Klick auf einen Link

### Integrationstests
- `server/app.test.ts`: alle Routen über `app.request`, darunter die Sicherheitsfälle von `/api/open` und der erste SSE-Event
- `widgets/external/collector.test.ts`: echter lokaler HTTP-Server

### Edge Cases (müssen getestet sein)
- Collector wirft beim ersten Lauf → `error`; wirft nach Erfolg → `stale` mit alten Daten
- Collector hängt → Timeout → `stale` bzw. `error`; kein zweiter paralleler Lauf
- Collector liefert ungültige Payload → `error`/`stale` mit „Ungültige Daten“
- Unbekannter Typ, ungültige Instanz-Config oder fehlende env-Variable → Instanz-Fehler, **Server läuft weiter**
- `dashboard.config.json` fehlt → wird aus dem Beispiel erzeugt und laut geloggt
- `/api/open` mit `javascript:`, falschem Content-Type oder fremdem Origin → abgelehnt
- Ein einzelner News-Feed fällt aus → die übrigen werden angezeigt; alle fallen aus → Fehler
- Renderfehler in einem `Widget.tsx` → nur diese Kachel zeigt den Fehler (ErrorBoundary)

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style
```bash
npm run typecheck
npm run lint
```

### Level 2: Unit Tests
```bash
npm test
```

### Level 3: Integration / Smoke (echter Server, echte Daten)
Git Bash:
```bash
npm run build
(npm start > /tmp/wd-server.log 2>&1 &) ; sleep 8
curl -s http://127.0.0.1:4700/api/health
curl -s http://127.0.0.1:4700/api/layout | head -c 400
curl -s http://127.0.0.1:4700/api/widgets | head -c 800
curl -s -X POST http://127.0.0.1:4700/api/widgets/system/actions/refresh -o /dev/null -w "%{http_code}\n"   # 200
curl -s -X POST http://127.0.0.1:4700/api/open -H "content-type: text/plain" -d '{}' -o /dev/null -w "%{http_code}\n"  # 415
curl -s -N --max-time 3 http://127.0.0.1:4700/api/stream | head -c 300     # beginnt mit "event: snapshot"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4700/            # 200 (index.html)
```

Den Server danach beenden. In PowerShell:
`Get-NetTCPConnection -LocalPort 4700 -State Listen | % { Stop-Process -Id $_.OwningProcess }`

Hinweis: `sleep` ist in der Agent-Umgebung eventuell blockiert. Dann ein Poll-Loop auf `/api/health` oder die Monitor-Funktion des Harness nutzen.

**Erwartung:**
- `wetter`, `news` und `system` sind nach höchstens 30 s `ok`.
- Ausnahme: Liefert Open-Meteo weiterhin 503, ist `wetter` korrekt `error` mit `Open-Meteo HTTP 503`. Das ist **kein** Grund für Fake-Daten; im Report vermerken.
- `external-beispiel` ist `ok`.

### Level 4: Manuelle Validierung
1. Im Browser http://127.0.0.1:4700 öffnen. Erwartet werden 4 Kacheln im dunklen Theme mit echten Daten. Ein Klick auf eine News öffnet den Standardbrowser, auch in Lively.
2. Den Server stoppen. Innerhalb von höchstens 40 s erscheint das Offline-Banner, die alten Daten bleiben stehen. Den Server neu starten: Das Banner verschwindet ohne Neuladen.
3. In `dashboard.config.json` eine Instanz mit `type: "gibtsnicht"` eintragen und neu starten. Diese Kachel zeigt einen Fehler, der Rest läuft.
4. `npm run new-widget hello --view stat` ausführen, ein `stat`-Fixture füllen, den Collector auf `return <fixture>` setzen (nur lokal zum Ausprobieren, **nicht committen**), die Instanz eintragen und neu starten. Die Kachel erscheint. Danach den `hello`-Ordner wieder löschen.
5. Lively einrichten wie in der README beschrieben. Das Dashboard ist als Hintergrund sichtbar, und Klicks funktionieren. Das macht der Nutzer selbst; der Agent kann hier nur die README liefern.

### Level 5: Optional
`/e2e-test` läuft nicht auf nativem Windows. Stattdessen den Browser-Check über die Claude-in-Chrome-Tools oder manuell durchführen: Screenshot von http://127.0.0.1:4700.

---

## ACCEPTANCE CRITERIA

- [ ] `npm run check` ist grün (typecheck, lint, test, build).
- [ ] `npm run build && npm start` liefert UI und API über `127.0.0.1:4700`.
- [ ] `npm run dev` liefert die UI auf `:5174` mit Proxy auf `:4700`; der Server lädt bei Änderungen neu.
- [ ] Der Widget-Vertrag ist wie spezifiziert in `shared/widget-contract.ts` umgesetzt. Ein neues Widget braucht **keine** Änderung an `server/` oder `web/src/` (nachgewiesen durch den Scaffolder-Test und Level 4, Schritt 4).
- [ ] `weather`, `news`, `system` und `external` liefern echte Daten bzw. bei einem Ausfall der Quelle einen korrekten `error`-/`stale`-Zustand mit Meldung.
- [ ] Ein Fehler in einer Instanz beeinträchtigt keine andere und nicht den Server.
- [ ] SSE: Snapshot beim Verbinden, Updates bei Änderung, Ping alle 15 s. Die UI erholt sich nach einem Server-Neustart ohne Neuladen.
- [ ] `/api/open` öffnet nur http(s)-URLs und lehnt Anfragen mit falschem Content-Type oder fremdem Origin ab.
- [ ] Der Server startet nicht mit einem `HOST` außer localhost.
- [ ] `.env.example` und README sind aktualisiert, und es gibt eine Lively-Anleitung.
- [ ] Es gibt keine Fake- oder Mock-Daten im Laufzeitcode. Fixtures sind echte Antworten und werden nur in Tests genutzt.

---

## COMPLETION CHECKLIST

- [ ] Alle Tasks wurden in der Reihenfolge erledigt.
- [ ] Die Validierung jedes Tasks ist bestanden.
- [ ] Level 1–3 sind ausgeführt, die Ergebnisse stehen im Report.
- [ ] Level 4, Schritte 1–4, sind manuell bzw. per Browser-Tool geprüft.
- [ ] Die Acceptance Criteria sind erfüllt.
- [ ] Commit erst nach `/validate` und `/code-review`.

---

## NOTES

**Bewusste Abweichungen von der PRD (bitte in der PRD nachziehen, wenn bestätigt):**
1. **Ein npm-Paket statt npm workspaces.** Ein Widget-Ordner enthält Server-Code (`collector.ts`) und UI-Code (`Widget.tsx`) zugleich, und Workspaces würden ihn zerreißen. relaunch-radar zeigt, dass ein Paket mit einer tsconfig, Bundler-Resolution und Alias gut funktioniert.
2. **Manifest und Collector in getrennten Dateien** (`manifest.ts`, `collector.ts`). Die PRD skizziert ein kombiniertes `defineWidget`; getrennt ist sauberer, weil die UI das Manifest nie importiert (sie bekommt es über `/api/layout`) und Server-Bibliotheken so nie im Browser-Bundle landen.
3. **`WEATHER_LAT`/`LON`/`LABEL` und `NEWS_FEEDS` stehen nicht in `.env`, sondern in der Instanz-Config.** Das ist nötig für mehrere Instanzen pro Typ. `.env` enthält nur Secrets und Server-Einstellungen.
4. **`dashboard.config.json` ist gitignored** (persönlicher Standort), `dashboard.config.example.json` ist getrackt.
5. **Zusätzlich `POST /api/open`**: In Lively navigieren Links sonst im Wallpaper selbst. Die PRD fordert „Klick öffnet den Standardbrowser“.
6. **Keine Push-Collectors (`subscribe`) in Phase 1.** Sie kommen mit relaunch-radar in Phase 3; das Interface lässt Platz dafür.
7. **Kein Hot-Reload von Widgets.** Ein neues Widget braucht einen Server-Neustart (`tsx watch` erledigt das in der Entwicklung). Die UI lädt sich bei geändertem Layout selbst neu.

**Risiken:**
- Open-Meteo lieferte beim Planen 503. Die Statuslogik fängt das ab, aber das Fixture muss eventuell später erzeugt werden.
- Ob Lively Klicks an die Seite durchreicht und wie es mit `window.open` umgeht, muss der Nutzer prüfen. `/api/open` macht das Dashboard davon unabhängig.
- `import.meta.glob` über `../../../widgets`, also außerhalb von `root: "web"`, braucht `server.fs.allow`. Der Build ist davon nicht betroffen.
- `systeminformation.fsSize()` ist auf Windows langsam. Ohne den 60-s-Cache würde das 5-s-Intervall CPU kosten.

**Confidence:** 8/10 für eine Umsetzung in einem Durchgang. Unsicher sind die Open-Meteo-Verfügbarkeit und Details von `import.meta.glob` und `server.fs` außerhalb des Vite-Roots.
