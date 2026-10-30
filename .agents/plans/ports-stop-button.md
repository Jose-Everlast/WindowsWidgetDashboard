# Feature: Stopp-Knopf pro Port im Ports-Widget

Der Plan sollte vollständig sein. Prüfe vor der Umsetzung Doku, Codebase-Muster und die Sinnhaftigkeit jedes Tasks. Achte auf die exakten Namen bestehender Helfer und Typen und importiere aus den richtigen Dateien.

## Feature Description

Jede Zeile im Ports-Widget bekommt einen Knopf „Stoppen“, der den Prozess beendet, der auf diesem Port lauscht. Der Klick ist zweistufig: Der erste Klick macht daraus „Wirklich stoppen?“ (4 s), erst der zweite beendet den Prozess. Ein Browser-Dialog kommt nicht in Frage, er würde Lively blockieren.

Der Server prüft unmittelbar vor dem Beenden mit frischem `netstat` und `tasklist` nach, ob die PID noch auf diesem Port lauscht und noch denselben Prozessnamen hat. Sonst antwortet er mit 409, z. B. wenn die PID inzwischen einem anderen Prozess gehört. Geschützte Prozesse bekommen keinen Knopf und werden auch serverseitig abgelehnt (403):
- PID ≤ 4 und Systemprozesse (Namensliste)
- Prozesse in der Windows-Sitzung `Services`
- das Dashboard selbst (eigene PID, eigener Port 4700)

Das ist die erste Aktion des Dashboards, die etwas außerhalb seiner eigenen Daten verändert. PRD-Prinzip 1, die Hard Rule in `CLAUDE.md` und `security.md` werden deshalb angepasst: Ein ausdrücklicher Zwei-Klick des Nutzers im Dashboard gilt als „vorher gefragt“.

## User Story

Als Nutzer will ich im Ports-Widget einen Prozess direkt beenden können, damit ich bei `EADDRINUSE` oder einem verwaisten Server (z. B. einem `npm start`, dessen Terminal schon zu ist) nicht erst die PID heraussuchen und `taskkill` tippen muss.

## Problem Statement

Das Ports-Widget zeigt zwar, wer einen Port belegt. Zum Beenden braucht der Nutzer aber ein Terminal und die PID. Server, die aus einem längst geschlossenen Terminal gestartet wurden, lassen sich sonst nur über den Task-Manager finden, wo viele gleichnamige `node.exe` stehen. Genau das ist gerade mit dem Dashboard-Server selbst passiert.

## Solution Statement

- **Win-Helfer** (`server/lib/win.ts`): `parseTasklistRows` liest Name, PID und Sitzung. `listProcessRows` ist der geteilte `tasklist`-Aufruf, `listProcesses` (Name pro PID, genutzt von agents) wird daraus abgeleitet, es bleibt also bei einem Aufruf. Neu sind außerdem `processRow(pid)` (frisch, `tasklist /fi "PID eq n"`) und `killProcess(pid)` (`taskkill /PID n /F`).
- **Reine Regel** (`widgets/ports/parse.ts`): `stopBlocker(...)` liefert den Grund, warum ein Prozess nicht gestoppt werden darf, oder `null`. Sie gilt für die Payload (`stoppable`) **und** die Aktion, es gibt also nur eine Regel.
- **Kern** (`widgets/ports/stop.ts`): `stopListener(deps, input, config, signal)`, injizierbar. Er prüft nach, beendet den Prozess und wartet kurz, bis der Port frei ist.
- **Collector**: `portsCollector(deps)` mit der Aktion `stop`; die Eingabe wird mit `z.strictObject` geprüft.
- **UI**: In `Widget.tsx` gibt es einen Knopf pro Zeile mit `stoppable`, die Zwei-Klick-Bestätigung und eine Fehlerzeile.
- **Doku**: PRD, CLAUDE.md, security.md, README des Widgets.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `server/lib/win.ts`, `widgets/ports/*`, Doku (PRD, CLAUDE.md, security.md)
**Dependencies**: keine neuen Pakete; `taskkill.exe`, `tasklist.exe`, `netstat.exe` (Windows-Bordmittel)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `server/lib/win.ts` (ganz, 102 Zeilen). Warum: `run()` (execFile ohne Shell, latin1, Timeout, Signal), `parseTasklist`, `sharedCall`, `listProcesses` (Zeile 102); hier kommen die neuen Helfer hin.
- `server/lib/win.test.ts`. Warum: So werden die Parser gegen `server/lib/fixtures/tasklist.csv` und `netstat.txt` getestet.
- `server/lib/fixtures/tasklist.csv`. Warum: echte Ausgabe; die Spalte 3 ist die Sitzung (`"Services"` bzw. `"Console"`, auch unter deutschem Windows nicht lokalisiert).
- `widgets/ports/manifest.ts`, `collector.ts`, `parse.ts`, `Widget.tsx`, `parse.test.ts`, `fixtures/ports.json`, `README.md`. Warum: das Widget, das erweitert wird.
- `widgets/agents/collector.ts` / `collect.ts`. Warum: nutzt `listProcesses` (Map PID → Name); diese Signatur darf sich **nicht** ändern.
- `widgets/notes/collector.ts` (Zeilen 8–33). Warum: Muster für `actions` und eine injizierbare Collector-Fabrik (`notesCollector(dataDir)` + `export const collector = …`).
- `server/lib/action-input.ts`. Warum: `parseActionInput(schema, input)` → `HttpError(400)`.
- `server/http.ts`. Warum: `HttpError(status, message)`.
- `server/scheduler.ts` (Zeilen 229–257). Warum: Die Aktion bekommt `ctx` mit `config`, `signal` (Manifest-`timeoutMs`) und `log`; danach wird automatisch neu gesammelt.
- `server/env.ts` (Zeile 15). Warum: `config.port` (Standard 4700) ist der eigene Port.
- `widgets/messenger/Widget.tsx` (Zeilen 88–102). Warum: Muster für `useDashboard().runAction` mit einer Fehlerzeile, die sich selbst ausblendet.
- `widgets/messenger/Widget.test.tsx` (Zeilen 1–30). Warum: Muster für `vi.mock("../../web/src/hub/DashboardProvider")` und `state(...)` im UI-Test.
- `server/app.test.ts` (Zeilen 78–128). Warum: 403/415 für die Aktions-Route sind dort schon **generisch** abgedeckt (jede Aktion läuft über dieselbe Route); es braucht keine neue Route.
- `.agents/reference/security.md`, `widgets.md`, `testing.md`. Warum: Regeln, die hier gelten und ergänzt werden.

### New Files to Create

- `widgets/ports/stop.ts`: `stopListener` (Node, nur Server) und `StopDeps`
- `widgets/ports/stop.test.ts`: Kern mit Test-Doubles für die eigenen Systemaufrufe, plus ein echter Windows-Test gegen einen selbst gestarteten Kindprozess
- `widgets/ports/Widget.test.tsx`: Knopf, Zwei-Klick, Fehler

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [taskkill](https://learn.microsoft.com/windows-server/administration/windows-commands/taskkill): `/PID`, `/F`, `/T`. Warum: Wir nehmen bewusst **kein** `/T`, siehe Notes.
- [tasklist](https://learn.microsoft.com/windows-server/administration/windows-commands/tasklist): Filter `/fi "PID eq n"`. Ohne Treffer kommt eine `INFORMATION:`-Zeile auf stdout mit Exit-Code 0.
- [Node child_process.execFile](https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback). Warum: Argumente ohne Shell; `"PID eq 123"` ist **ein** Argument, Anführungszeichen braucht es nicht.

### Patterns to Follow

**Actions (aus `widgets/notes/collector.ts`):**
```ts
export function notesCollector(dataDir: string, clock: Clock = systemClock) {
  return defineCollector(manifest, {
    collect: async ({ instance }) => ({ ... }),
    actions: {
      remove: async ({ instance, log }, input) => {
        const { id } = parseActionInput(RemoveIn, input);
        ...
        log(`Notiz ${id} gelöscht`);
      },
    },
  });
}
export const collector = notesCollector(serverConfig.dataDir);
```

**Eingabeschemas im Manifest** (wie `AddIn`/`RemoveIn` in `widgets/notes/manifest.ts`, `AppIn`/`KeyIn` in `widgets/messenger/manifest.ts`): `z.strictObject({...})`, exportiert aus `manifest.ts`.

**Systemaufrufe:** immer `run(cmd, args, { signal })` aus `server/lib/win.ts`, nie `exec`/Shell.

**Fehler:** `throw new HttpError(409, "…")`; Meldungen auf Deutsch, ohne fremde Ausgaben (die stdout von `taskkill` ist OEM-codiert und lokalisiert, sie wird nicht durchgereicht, nur geloggt).

**Logging:** `ctx.log(...)` (Scope `widget:ports/ports` setzt der Scheduler).

**UI-Fehlerzeile (aus `widgets/messenger/Widget.tsx`):**
```ts
const run = (...) => void runAction(state.instance, action, input).then(r => {
  clearTimeout(errorTimer.current);
  setError(r.ok ? null : r.error);
  if (!r.ok) errorTimer.current = setTimeout(() => setError(null), ERROR_MS);
});
```
Farben/Tokens: `text-muted`, `text-warn`, `text-bad` (siehe bestehende Widgets). Keine animierten `box-shadow`/`filter` (widgets.md Regel 13).

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation
Win-Helfer für Sitzung, Einzel-PID-Abfrage und Beenden; die reine `stopBlocker`-Regel.

### Phase 2: Core Implementation
`stopListener` mit Nachprüfung, Beenden und kurzem Warten auf den freien Port.

### Phase 3: Integration
Collector-Aktion `stop`, `stoppable` in der Payload, UI-Knopf.

### Phase 4: Testing & Docs
Unit-Tests, ein echter Windows-Test, UI-Test, Doku-Updates, Fixture.

---

## STEP-BY-STEP TASKS

### UPDATE `server/lib/win.ts`

- **IMPLEMENT**:
  - `export interface ProcessRow { pid: number; name: string; session: string }`
  - `export function parseTasklistRows(text: string): ProcessRow[]` mit dem Regex `/^"([^"]+)","(\d+)","([^"]*)"/`. Zeilen, die nicht passen (z. B. `INFO: …`), werden übersprungen.
  - `parseTasklist(text)` bleibt mit derselben Signatur erhalten und baut die Map aus `parseTasklistRows`.
  - `export const listProcessRows = sharedCall(() => run("tasklist", ["/fo", "csv", "/nh"]).then(parseTasklistRows), 5_000);`
  - `listProcesses` wird zu `(signal?: AbortSignal) => listProcessRows(signal).then(rows => new Map(rows.map(r => [r.pid, r.name])))`. Es bleibt ein einziger `tasklist`-Aufruf, den agents und ports teilen.
  - `export async function processRow(pid: number, signal?: AbortSignal): Promise<ProcessRow | null>` ruft `run("tasklist", ["/fo", "csv", "/nh", "/fi", \`PID eq ${pid}\`], { signal })` auf **ohne** Cache und liefert die Zeile mit `pid === pid` oder `null`.
  - `export async function killProcess(pid: number, signal?: AbortSignal): Promise<void>` ruft `run("taskkill", ["/PID", String(pid), "/F"], { signal })` auf.
- **PATTERN**: `listListeners` (Zeile 65), `sharedCall` (Zeile 87)
- **GOTCHA**:
  - `pid` muss vor dem Aufruf eine positive Ganzzahl sein. Das prüft das zod-Schema, aber `processRow`/`killProcess` werfen zusätzlich selbst, wenn `!Number.isInteger(pid) || pid <= 0`, damit die Funktionen auch für sich allein sicher sind.
  - Kein `/T`: Es würde alle Kindprozesse mit beenden, siehe Notes.
  - Agents darf sich nicht ändern; `npx vitest run widgets/agents` muss grün bleiben.
- **VALIDATE**: `npx vitest run server/lib widgets/agents`

### UPDATE `server/lib/win.test.ts`

- **IMPLEMENT**: Test für `parseTasklistRows` gegen `fixtures/tasklist.csv`:
  - `System`/PID 4 hat die Sitzung `Services`
  - mindestens eine Zeile hat die Sitzung `Console`
  - eine `INFO: Es sind keine Aufgaben …`-Zeile ergibt `[]`

  Den bestehenden `parseTasklist`-Test unverändert lassen.
- **GOTCHA**: Datei mit `"latin1"` lesen wie die bestehenden Tests.
- **VALIDATE**: `npx vitest run server/lib/win.test.ts`

### UPDATE `widgets/ports/parse.ts`

- **IMPLEMENT** (rein, keine Node-Imports):
  - `export interface ProcessInfo { name: string; session: string }`
  - `const PROTECTED = new Set(["system", "secure system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe", "svchost.exe", "dwm.exe", "fontdrvhost.exe", "explorer.exe"])`
  - `export function stopBlocker(l: { pid: number; port: number; process: string | null; session: string | null }, self: { pid: number; port: number; allowStop: boolean }): string | null` gibt der Reihe nach zurück:
    - `"Stoppen ist ausgeschaltet"`, wenn `!self.allowStop`
    - `"Das ist das Dashboard selbst"`, wenn `l.pid === self.pid || l.port === self.port`
    - `"Systemprozess"`, wenn `l.pid <= 4 || PROTECTED.has(l.process?.toLowerCase() ?? "")`
    - `"Prozess unbekannt"`, wenn `!l.process`
    - `"Windows-Dienst"`, wenn `l.session?.toLowerCase() === "services"`
    - sonst `null`
  - `buildListeners(raw, processes: Map<number, ProcessInfo>, config, self: { pid: number; port: number })`: Der Prozessname kommt jetzt aus `processes.get(pid)?.name`. Neu kommt `stoppable: stopBlocker({...}, { ...self, allowStop: config.allowStop }) === null` dazu.
- **PATTERN**: bestehendes `buildListeners`, Zeilen 20–37
- **GOTCHA**: `Widget.tsx` importiert `isExposed` aus dieser Datei, also bleibt sie frei von Node-APIs. `stopBlocker` ist in `stop.ts` dieselbe Funktion, es gibt keine zweite Liste.
- **VALIDATE**: `npm run typecheck` (die Tests folgen im nächsten Task)

### UPDATE `widgets/ports/manifest.ts`

- **IMPLEMENT**:
  - `PortsConfig` bekommt `allowStop: z.boolean().default(true)`.
  - `PortsData.listeners[]` bekommt `stoppable: z.boolean()`.
  - Neu: `export const StopIn = z.strictObject({ pid: z.number().int().positive(), port: z.number().int().min(1).max(65535), process: z.string().min(1).max(260) })` und `export type StopIn = z.infer<typeof StopIn>`.
- **VALIDATE**: `npm run typecheck`

### UPDATE `widgets/ports/parse.test.ts`

- **IMPLEMENT**:
  - Die bestehenden Tests auf `Map<number, ProcessInfo>` umstellen. Die Fixture-Map baust du aus `parseTasklistRows`, die kleinen Maps als `{ name: "node.exe", session: "Console" }`. Als `self` übergibst du `{ pid: 1, port: 4700 }`. In den `toEqual`-Erwartungen kommt `stoppable` dazu: Port 4700 → `false`.
  - Neu: ein `describe("stopBlocker")` mit je einem Fall pro Grund (ausgeschaltet, eigene PID, eigener Port, PID 4, `svchost.exe` in beliebiger Schreibweise, `process: null`, Sitzung `Services`) und dem Erfolgsfall `node.exe`/`Console` → `null`.
- **VALIDATE**: `npx vitest run widgets/ports/parse.test.ts`

### CREATE `widgets/ports/stop.ts`

- **IMPLEMENT**:
```ts
// Stops the process behind one listening port (server only). Re-checks right before the kill, because
// the UI may show a PID that has since exited or been reused by another process.
export interface StopDeps {
  listListeners(signal?: AbortSignal): Promise<Listener[]>;
  processRow(pid: number, signal?: AbortSignal): Promise<ProcessRow | null>;
  killProcess(pid: number, signal?: AbortSignal): Promise<void>;
  sleep(ms: number): Promise<void>;
  self: { pid: number; port: number };
}
export async function stopListener(deps: StopDeps, input: StopIn, config: PortsConfig, signal?: AbortSignal): Promise<void>
```
  Ablauf:
  1. `const [listeners, row] = await Promise.all([deps.listListeners(signal), deps.processRow(input.pid, signal)])`
  2. Liegt kein Listener mit `pid === input.pid && port === input.port` vor, wirf `HttpError(409, \`Port ${port} gehört nicht mehr zu PID ${pid}\`)`.
  3. Ist `!row || row.name.toLowerCase() !== input.process.toLowerCase()`, wirf `HttpError(409, \`PID ${pid} ist nicht mehr ${input.process}\`)`.
  4. `const reason = stopBlocker({ pid, port, process: row.name, session: row.session }, { ...deps.self, allowStop: config.allowStop })`; ist ein Grund gesetzt, wirf `HttpError(403, reason)`.
  5. `try { await deps.killProcess(pid, signal) } catch (err) { throw new HttpError(409, \`${row.name} (PID ${pid}) ließ sich nicht beenden, evtl. braucht es Adminrechte\`, { cause: err }) }`. Wenn `HttpError` kein `cause` unterstützt, `cause` weglassen und den Fehler nur in `collector.ts` loggen.
  6. Warten, bis der Port frei ist: bis zu 8 × `await deps.sleep(250)`, danach `listListeners`. Ist der Port frei, wird abgebrochen. Ist er nach 2 s noch belegt, gibt es keinen Fehler: Der Prozess ist beendet, Windows gibt den Socket nur später frei, und der nächste Poll zeigt es.
  - `export const systemStopDeps: StopDeps` mit `listListeners`, `processRow`, `killProcess` aus `server/lib/win`, `sleep: ms => new Promise(r => setTimeout(r, ms))` und `self: { pid: process.pid, port: serverConfig.port }`.
- **IMPORTS**: `HttpError` aus `../../server/http`; `config as serverConfig` aus `../../server/env`; `listListeners, processRow, killProcess, type Listener, type ProcessRow` aus `../../server/lib/win`; `stopBlocker` aus `./parse`; `type PortsConfig, type StopIn` aus `./manifest`
- **GOTCHA**:
  - `HttpError` zuerst in `server/http.ts` lesen: Konstruktor und `cause`-Unterstützung prüfen.
  - Erst nachprüfen, dann beenden. Kein Weg darf `killProcess` aufrufen, bevor die Schritte 2–4 bestanden sind.
- **VALIDATE**: `npm run typecheck`

### UPDATE `widgets/ports/collector.ts`

- **IMPLEMENT**:
```ts
export function portsCollector(deps: StopDeps = systemStopDeps) {
  return defineCollector(manifest, {
    async collect({ config, signal }) {
      const [listeners, rows] = await Promise.all([deps.listListeners(signal), listProcessRows(signal)]);
      return buildListeners(listeners, new Map(rows.map(r => [r.pid, { name: r.name, session: r.session }])), config, deps.self);
    },
    actions: {
      stop: async ({ config, signal, log }, input) => {
        const data = parseActionInput(StopIn, input);
        await stopListener(deps, data, config, signal);
        log(`${data.process} (PID ${data.pid}) auf Port ${data.port} beendet`);
      },
    },
  });
}
export const collector = portsCollector();
```
- **GOTCHA**:
  - Wenn `HttpError` kein `cause` kann, wird der eigentliche taskkill-Fehler hier mit `log` protokolliert, bevor die 409 weitergeht.
  - `collect` nutzt den **geteilten** `listProcessRows` (Cache 5 s), die Aktion dagegen frische Aufrufe.
- **VALIDATE**: `npx vitest run widgets/contract.test.ts widgets/ports`

### UPDATE `widgets/ports/fixtures/ports.json`

- **IMPLEMENT**: In jeden Eintrag `"stoppable"` aufnehmen: `false` für 4700 (Dashboard), `true` für alle anderen (alle `Console`-Prozesse). Die übrigen Werte bleiben unverändert.
- **VALIDATE**: `npx vitest run widgets/contract.test.ts`

### CREATE `widgets/ports/stop.test.ts`

- **IMPLEMENT**:
  - `fakeDeps(over)` mit Listenern `[{ port: 3000, address: "127.0.0.1", pid: 500 }]`, `processRow` → `{ pid: 500, name: "node.exe", session: "Console" }`, `killProcess: vi.fn()`, `sleep: async () => {}` und `self: { pid: 1, port: 4700 }`. Nach dem Beenden liefert `listListeners` `[]`; dafür ein Zähler bzw. eine Variable.
  - Fälle (wo die Aktion abgelehnt wird, immer auch prüfen, dass `killProcess` **nicht** aufgerufen wurde):
    - Erfolg: `killProcess` wird mit 500 aufgerufen.
    - Port gehört nicht mehr zur PID → 409.
    - PID hat einen anderen Namen (wiederverwendet) → 409.
    - `processRow` liefert `null` → 409.
    - Sitzung `Services` → 403.
    - eigene PID bzw. eigener Port → 403.
    - `allowStop: false` → 403.
    - `killProcess` wirft → 409.
    - Port bleibt belegt → kein Fehler, `sleep` wurde 8× aufgerufen.
  - Collector-Test für die Eingabe (Pflicht laut security.md): `portsCollector(fakeDeps()).actions!.stop!(ctx, input)` mit `{ pid: "500" }`, `{ pid: 500, port: 3000, process: "node.exe", extra: 1 }` und `{ pid: -1, port: 3000, process: "x" }` → jeweils `HttpError` mit dem Status 400. `ctx` = `{ instance: "ports", config: PortsConfig.parse({}), env: {}, signal: new AbortController().signal, log: () => {} }`.
  - **Echter Windows-Test** mit `it.runIf(process.platform === "win32")`:
    - Kindprozess starten: `spawn(process.execPath, ["-e", "const s=require('node:http').createServer().listen(0,'127.0.0.1',()=>console.log(s.address().port))"])`, den Port aus stdout lesen.
    - `stopListener({ ...systemStopDeps, self: { pid: process.pid, port: 4700 } }, { pid: child.pid!, port, process: "node.exe" }, PortsConfig.parse({}))` aufrufen.
    - Erwarten, dass der Kindprozess endet (das `exit`-Event als Promise) und `listListeners()` den Port nicht mehr enthält.
    - In `afterEach` `child.kill()` als Absicherung.
- **PATTERN**: `vi.fn` für eigene Test-Doubles wie die Fake-Collector in `server/scheduler.test.ts`; Real-Prozess-Tests wie die Real-Socket-Tests (testing.md).
- **GOTCHA**:
  - Der echte Test beendet **nur** den selbst gestarteten Kindprozess, nie etwas anderes.
  - Timeout großzügig setzen (`netstat` braucht etwa 1 s): `{ timeout: 20_000 }`.
- **VALIDATE**: `npx vitest run widgets/ports/stop.test.ts`

### UPDATE `widgets/ports/Widget.tsx`

- **IMPLEMENT**:
  - `const { runAction } = useDashboard()`, `const [armed, setArmed] = useState<string | null>(null)` (Schlüssel `${port}-${pid}`), `const [busy, setBusy] = useState<string | null>(null)`, `error` plus Timer wie im messenger.
  - Pro Zeile mit `l.stoppable && l.process` gibt es einen kleinen Knopf (Icon `Square` oder `Power` aus `lucide-react`, `size-3.5`) mit `aria-label={\`${l.process} auf Port ${l.port} stoppen\`}`. Er ist unauffällig (`opacity-0 group-hover:opacity-100 focus-visible:opacity-100`; die Zeile bekommt `group`).
  - Erster Klick: `setArmed(key)`. Der Knopf wird zum Text-Knopf „Wirklich stoppen?“ in `text-bad`, der immer sichtbar ist, und ein Timer setzt nach `ARM_MS = 4000` zurück.
  - Zweiter Klick: `setBusy(key)`, `runAction(state.instance, "stop", { pid: l.pid, port: l.port, process: l.process })`. Danach `setArmed(null)` und `setBusy(null)`; bei Fehler `setError(r.error)` (ausblenden nach `ERROR_MS = 6000`).
  - Timer beim Unmount aufräumen.
  - Die Fehlerzeile steht unter der Liste in `text-xs text-bad`, nur als Text.
- **PATTERN**: `widgets/messenger/Widget.tsx` Zeilen 88–102; `useDashboard` aus `../../web/src/hub/DashboardProvider`
- **GOTCHA**:
  - Kein `window.confirm`/`alert`.
  - Knopf-`type="button"`.
  - `busy` deaktiviert den Knopf (kein Doppel-Stop).
  - Das UI-Label steht auf Deutsch.
- **VALIDATE**: `npm run typecheck && npm run lint`

### CREATE `widgets/ports/Widget.test.tsx`

- **IMPLEMENT** (`// @vitest-environment jsdom`, Mock von `useDashboard` wie im Messenger-Test):
  - Knopf nur bei `stoppable: true`: Port 4700 hat keinen, 3000 hat einen.
  - Erster Klick ruft `runAction` **nicht** auf und zeigt „Wirklich stoppen?“; der zweite Klick ruft `runAction("ports", "stop", { pid, port, process })` auf.
  - Mit `vi.useFakeTimers()`: Nach 4 s ohne zweiten Klick ist der Knopf wieder zurückgesetzt, und ein Klick danach ruft `runAction` noch nicht auf.
  - Antwortet `runAction` mit `{ ok: false, error: "Port 3000 gehört nicht mehr zu PID 500" }`, steht der Text als Text in der Kachel.
  - Daten aus `fixtures/ports.json`.
- **VALIDATE**: `npx vitest run widgets/ports`

### UPDATE Doku

- **`PRD.md`**:
  - Prinzip 1 (Abschnitt 2) um die Ausnahme ergänzen: „Einzige Ausnahme nach außen: Im Ports-Widget kann der Nutzer einen lauschenden Prozess mit zwei Klicks beenden. Das Dashboard tut das nie von sich aus.“
  - Kernfunktion „Ports-Widget“ (Abschnitt 4) um „mit Stopp-Knopf (Zwei-Klick, serverseitig nachgeprüft)“ ergänzen.
  - Bei Abschnitt 10 (API) bzw. 14 (Risiken) einen Eintrag „versehentliches Beenden → Zwei-Klick, Nachprüfung, geschützte Prozesse“ ergänzen, falls dort Aktionen aufgezählt sind.
- **`CLAUDE.md`**:
  - Overview: „It reads data only“ wird zu „It reads data only (exception: the two-click stop in the ports tile)“.
  - Hard Rule „Hands off foreign tools“: „never trigger jobs in relaunch-radar. Processes are stopped only by the user's own two-click in the ports tile; an agent never calls the `stop` action or kills processes without asking.“
- **`.agents/reference/security.md`**: neue Regel 8 „Prozesse beenden“:
  - nur die Aktion `ports/stop`
  - die Eingabe `{pid, port, process}` strikt prüfen
  - vor dem Beenden frisch nachprüfen (netstat + tasklist), sonst 409
  - geschützt sind (403): PID ≤ 4, Systemnamen, Sitzung `Services`, das Dashboard selbst
  - `taskkill /F` **ohne** `/T`
  - `execFile` ohne Shell
  - die UI-Bestätigung zweistufig, ohne Browser-Dialog

  Im Abschnitt „Tests“ ergänzen: „Die Aktion `stop` testet jede Ablehnung samt ‚kein Kill‘.“
- **`widgets/ports/README.md`**: Abschnitt „Prozess stoppen“ (Zwei-Klick, was geschützt ist, warum ohne `/T`, `allowStop: false` schaltet es ab) und `allowStop` in die Konfigurationsliste.
- **VALIDATE**: `grep -n "allowStop" widgets/ports/README.md && grep -n "Ports-Widget" PRD.md`

---

## TESTING STRATEGY

### Unit Tests
- `parseTasklistRows` gegen die echte Fixture.
- `stopBlocker`: jeder Grund einzeln.
- `buildListeners`: `stoppable` gesetzt.
- `stopListener`: Test-Doubles für die eigenen Systemaufrufe (kein externer Dienst; erlaubt laut testing.md wie die Fake-Collector), jede Ablehnung mit der Prüfung „kein Kill“.

### Integration Tests
- Echter Windows-Lauf: Ein selbst gestarteter Node-HTTP-Server wird über `stopListener` mit den echten `netstat`/`tasklist`/`taskkill` beendet.
- Contract-Test mit der aktualisierten Fixture.
- 403/415 der Aktions-Route sind in `server/app.test.ts` schon generisch abgedeckt.

### Edge Cases
- PID inzwischen beendet (`tasklist` liefert `INFORMATION:` → `null` → 409)
- PID wiederverwendet von einem anderen Prozess (Name passt nicht → 409)
- gleiche PID auf mehreren Ports (Stop über eine Zeile beendet den Prozess, beide Zeilen verschwinden)
- Prozess mit Adminrechten (taskkill „Zugriff verweigert“ → 409 mit Hinweis)
- Port bleibt nach dem Beenden kurz belegt (kein Fehler)
- Doppelklick bzw. zweiter Stop während der erste läuft (`busy`)
- `process: null` in der Payload (kein Knopf)

---

## VALIDATION COMMANDS

Alle über das **Bash**-Tool (nicht PowerShell).

### Level 1: Syntax & Style
```bash
npm run typecheck
npm run lint
```

### Level 2: Unit Tests
```bash
npx vitest run server/lib widgets/ports widgets/agents
```

### Level 3: Integration Tests
```bash
npx vitest run widgets/contract.test.ts server/app.test.ts
npm run check
```

### Level 4: Manual Validation
1. Server neu starten (`npm start`), `http://127.0.0.1:4700` in Chrome öffnen (Chrome-Tools, kein e2e-Skill unter Windows).
2. In einem eigenen Terminal einen Wegwerf-Server starten: `node -e "require('http').createServer().listen(4799)"`.
3. Ports-Kachel: Bei 4799 erscheint der Knopf beim Hover; bei 4700 (Dashboard) gibt es keinen.
4. Erster Klick → „Wirklich stoppen?“; 4 s warten → Knopf zurückgesetzt.
5. Zwei Klicks → Die Zeile 4799 verschwindet innerhalb von etwa 2 s, das Terminal meldet, dass der Prozess beendet ist.
6. **Nicht** an fremden Prozessen ausprobieren (relaunch-radar auf 3000 usw.).

### Level 5: Additional Validation
- `curl -s -X POST http://127.0.0.1:4700/api/widgets/ports/actions/stop -H "content-type: application/json" -d '{"pid":4,"port":1,"process":"System"}'` → 409 oder 403, auf keinen Fall 200.
- `... -d '{"pid":"x"}'` → 400.

---

## ACCEPTANCE CRITERIA

- [ ] Jede Ports-Zeile mit `stoppable` hat einen Stopp-Knopf mit Zwei-Klick-Bestätigung (4 s), ohne Browser-Dialog
- [ ] Der Server prüft vor dem Beenden frisch nach: falscher Port, PID weg oder anderer Name → 409, ohne dass etwas beendet wird
- [ ] PID ≤ 4, Systemnamen, Sitzung `Services` und das Dashboard selbst (PID und Port) sind geschützt: in der UI kein Knopf, serverseitig 403
- [ ] Beendet wird mit `taskkill /PID n /F` über `execFile`, ohne `/T` und ohne Shell
- [ ] Ungültige Eingabe → 400 (getestet)
- [ ] `allowStop: false` schaltet die Funktion ab (UI und Server)
- [ ] agents bleibt unverändert grün und es läuft weiterhin nur **ein** geteilter `tasklist`-Aufruf pro Takt
- [ ] PRD, CLAUDE.md, security.md und das ports-README sind aktualisiert
- [ ] `npm run check` grün

---

## COMPLETION CHECKLIST

- [ ] Alle Tasks in Reihenfolge erledigt, jede VALIDATE-Zeile grün
- [ ] `npm run check` grün
- [ ] Manueller Test mit einem Wegwerf-Server (Level 4) bestanden
- [ ] Kein fremder Prozess beim Testen beendet

---

## NOTES

- **Warum kein `/T`** (Abweichung vom ersten Entwurf): `/T` beendet alle Kindprozesse mit. `Code.exe` lauscht auf Ports und ist über die Terminals der Elternprozess von `npm start` (also auch dieses Dashboard) und von Claude-Sessions. Den Prozessbaum prüfen ginge nur über WMI (`Win32_Process.ParentProcessId`), und WMI braucht hier 39 s und mehr. Für die eigentlichen Fälle reicht `/F` ohne `/T`: Bei `npm → tsx → node` lauscht der Blattprozess, und wenn er endet, beenden sich `tsx` und `npm` selbst. Vite beendet seinen esbuild-Kindprozess über die geschlossene stdin.
- **Warum Name statt Startzeit gegen PID-Wiederverwendung:** Die Startzeit gibt es nur über WMI. Die Kombination Port + PID + Name, frisch geprüft, reicht für eine Aktion, die der Nutzer gerade per Zwei-Klick bestätigt hat.
- **`stopBlocker` an einer Stelle:** Dieselbe Funktion entscheidet über `stoppable` in der Payload und über die 403 der Aktion. So kann die UI nie einen Knopf zeigen, den der Server ablehnt (bis auf echte Zustandswechsel, die mit 409 abgefangen werden).
- **Agenten-Regel:** Die Funktion ist für den Nutzer gedacht. Ein Coding-Agent ruft die Aktion `stop` nie selbst auf, ohne vorher zu fragen. Das steht künftig in CLAUDE.md.
- **Nicht enthalten:** ein „Neustart“ für das Dashboard selbst (eigener späterer Plan, zusammen mit `npm run stop/restart` und dem Autostart in Phase 7).
