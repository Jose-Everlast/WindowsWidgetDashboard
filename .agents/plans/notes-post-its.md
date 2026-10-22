# Feature: Post-its (Notiz-Widget) + Widget-Aktionen im Kern

Der Plan sollte vollständig sein. Prüfe vor der Umsetzung Doku, Codebase-Muster und die Sinnhaftigkeit jedes Tasks. Achte auf die exakten Namen bestehender Helfer und Typen.

**Reihenfolge:** Dieser Plan kommt **nach** `phase-4-mail.md` (Entscheidung des Nutzers am 2026-10-19). Er ist von Mail unabhängig. Kollisionen gibt es nur in `dashboard.config.example.json` und `README.md`; dort den Stand nach Phase 4 übernehmen.

## Feature Description

Ein Widget `notes` zeigt Post-its in einer Kachel. Der Nutzer kann:
- Zettel **direkt im Dashboard** anlegen, bearbeiten und löschen
- pro Zettel eine **Farbe** wählen: gelb, rosa, grün, blau
- Zettel **abhaken**: Erledigte erscheinen durchgestrichen und ausgegraut am Ende der Liste

Gespeichert wird in `data/notes/<instance>.json` (gitignored); die Zettel überleben Neustarts. Mehrere Instanzen sind möglich, z. B. „Heute“ und „Ideen“.

Dafür wird der im Widget-Vertrag schon deklarierte, aber **noch nicht verdrahtete** Mechanismus `collector.actions` im Kern angeschlossen: `POST /api/widgets/:instance/actions/:action` ruft künftig neben `refresh` auch Collector-Aktionen auf und gibt den neuen `WidgetState` zurück. Das ist generisch und kommt später anderen Widgets zugute, etwa dem Briefing „neu erstellen“ in Phase 6.

## User Story

Als Nutzer will ich kurze Notizen als Post-its direkt auf meinem Desktop-Dashboard festhalten, einfärben und abhaken, damit ich Gedanken und To-dos sofort im Blick habe, ohne eine Notiz-App zu öffnen.

## Problem Statement

Kurze Merkzettel landen heute in Editor-Tabs oder auf Papier. Das Dashboard ist ständig sichtbar, kann aber bisher nur anzeigen, nichts festhalten.

## Solution Statement

- **Neues Widget `notes`** mit eigenem `Widget.tsx`.
- **`collect()`** liest die JSON-Datei.
- **Ändern geht über Collector-Aktionen** (`add`, `update`, `remove`), deren Eingaben mit zod geprüft werden. Sie schreiben atomar und serialisiert pro Datei.
- **Im Kern** gibt es dafür `scheduler.action(instance, action, input)`: Aktion ausführen, danach `run(r)`. Damit gehen die neuen Daten über denselben Validierungs-, Cache- und SSE-Weg wie jeder Poll, ganz im Sinne von „Push nur als Auslöser“ (widgets.md Regel 8).

## Feature Metadata

**Feature Type**: New Capability (+ kleine Kern-Erweiterung)
**Estimated Complexity**: Medium
**Primary Systems Affected**: `server/scheduler.ts`, `server/routes/api.ts`, `web/src/hub/DashboardProvider.tsx`, `widgets/notes/` (neu)
**Dependencies**: keine neuen

---

## CONTEXT REFERENCES

### Relevant Codebase Files – VOR DER UMSETZUNG LESEN

- `CLAUDE.md`, `.agents/reference/widgets.md`, `.agents/reference/security.md`, `.agents/reference/testing.md`
- `shared/widget-contract.ts`:
  - Z. 58–64: `WidgetCollector.actions?: Record<string, (ctx: CollectContext<C>, input: unknown) => Promise<unknown>>`, Kommentar „"refresh" is built in“
  - `defineCollector` typisiert `actions` mit `z.output<C>`
- `server/scheduler.ts`:
  - `run(r)` (Z. 116) dedupliziert parallele Läufe.
  - `refresh(instance)` (Z. 215) ist das Muster für `action(...)`: 404/409-Fehler über `notFound` und `HttpError`.
  - `collectOnce` (Z. 68) baut `CollectContext` mit `controller.signal`.
- `server/scheduler.test.ts`: Fake-Collector-Muster mit dem `instance(...)`-Helfer, `flush()`.
- `server/routes/api.ts` Z. 41–45: Aktions-Route, heute nur `refresh`, sonst 404. `parseJson` aus `server/http.ts`.
- `server/app.test.ts` Z. 69–110: Tests für die Aktions-Route (404 bei unbekannter Aktion, 415 ohne JSON, 403 bei fremder Origin). **Bestehende Erwartung „unknown action → 404“ bleibt.**
- `web/src/hub/DashboardProvider.tsx` Z. 120–135: `refresh(instance)` als `fetch` mit JSON-Header und `body: "{}"`; das Ergebnis geht über `setStates`. Daneben kommt `runAction(instance, action, input)`.
- `widgets/relaunch-radar/Widget.tsx`: Muster für Widget-UI, Tokens (`text-muted`, `bg-line`, `text-good`, …), `useNow`
- `widgets/relaunch-radar/collect.ts`, `collector.ts`: reiner, injizierbarer Kern plus dünner Wrapper
- `server/env.ts`: `config.root`; `config.dataDir` gibt es nach Phase 4 (sonst hier anlegen: `join(ROOT, "data")`).
- Nach Phase 4 `server/auth/token-store.ts`: atomares Schreiben (Temp-Datei + `rename`, einmal Retry bei `EPERM`) und Lock pro Schlüssel. **Dieses Muster wiederverwenden** und als Helfer nach `server/lib/json-file.ts` herausziehen, wenn Phase 4 es inline hat (siehe Task 1).
- `web/src/index.css`: Theme-Tokens; dunkles Theme, es ist ein Wallpaper.
- `web/src/views/GenericView.test.tsx`: `vi.mock` für eigene UI-Helfer, Testing Library mit jsdom.

### New Files to Create

```
server/lib/json-file.ts           # readJsonFile / writeJsonFileAtomic / withLock (falls nicht schon aus Phase 4)
server/lib/json-file.test.ts
widgets/notes/manifest.ts         # Config, Data, Note-Schema, Farben
widgets/notes/store.ts            # reine Operationen add/update/remove auf Note[] + Datei-I/O (server-only)
widgets/notes/store.test.ts
widgets/notes/collector.ts        # collect + actions
widgets/notes/collector.test.ts   # Aktionen über einen echten Scheduler laufen lassen
widgets/notes/Widget.tsx
widgets/notes/Widget.test.tsx
widgets/notes/README.md
widgets/notes/fixtures/notes.json # erwartete Payload (Beispielzettel, keine persönlichen Inhalte)
```

### Relevant Documentation

- [React 19: `<textarea>`](https://react.dev/reference/react-dom/components/textarea): kontrolliert vs. unkontrolliert; hier mit lokalem Entwurfs-State, gespeichert bei `blur`.
- [Lively Wallpaper – Interaktion](https://github.com/rocksdanister/lively/wiki): Ob Tastatureingaben ans Wallpaper weitergeleitet werden, hängt von der Lively-Einstellung „Wallpaper input“ ab (Maus bzw. Tastatur). **Vor der Umsetzung im Lively-Wiki bzw. in den Einstellungen prüfen** und im README dokumentieren (siehe Risiken).

### Patterns to Follow

- **Aktions-Eingaben** sind fremder Input aus dem Browser: Jede Aktion prüft `input` mit zod (`safeParse`). Fehler → `HttpError(400, z.prettifyError(...))`.
- **Darstellung nur als Text:** `<textarea value>` bzw. `{note.text}` mit `whitespace-pre-wrap`, kein HTML.
- **Logging:** `ctx.log(...)` in Aktionen. Notizinhalte nicht loggen, nur IDs bzw. Aktionen.
- **Naming:** Widget-ID `notes`, UI-Titel „Notizen“, deutsche UI-Texte.

---

## DESIGN-ENTSCHEIDUNGEN

1. **Aktionen im Kern, generisch.**
   - `scheduler.action(instance, name, input)`:
     - Instanz unbekannt → 404
     - nicht lauffähig → 409
     - `name === "refresh"` → `run(r)`
     - Aktion fehlt in `collector.actions` → 404 `"unknown action"`
     - sonst Aktion mit `CollectContext` (eigenes Signal, `timeoutMs` wie collect) ausführen, danach `return run(r)`
   - **Fehler einer Aktion** gehen als `HttpError` an die Route: `HttpError` durchreichen, andere Fehler → 500 mit Meldung. Sie ändern **nicht** den Widget-Status, denn eine fehlgeschlagene Eingabe macht die Daten nicht stale.
   - **`run()` dedupliziert.** Läuft gerade ein Poll, darf die Aktion nicht dessen alten Stand zurückbekommen. Deshalb wartet `action` erst auf einen laufenden `inflight`-Lauf und startet danach einen frischen `run(r)`.
2. **Ändern ist hier erlaubt.** Das Prinzip „Nur lesen, nichts verändern“ betrifft fremde Dienste (Mail, Messenger, relaunch-radar). Notizen sind eigene Daten des Dashboards. Im PRD wird das als Ergänzung in Abschnitt 2/4 vermerkt.
3. **Speicher:**
   - `data/notes/<instance>.json` = `{ version: 1, notes: Note[] }`
   - Ohne Datei: leere Liste, kein Fehler. Kaputte Datei → `collect` wirft. Der Scheduler macht daraus `error`, und Schreibaktionen verweigern mit 409, damit nichts überschrieben wird.
   - Schreiben atomar und pro Datei serialisiert (`withLock(path, fn)`). Lesen, ändern und schreiben passiert innerhalb des Locks.
4. **Datenmodell:**
   ```ts
   Note = { id: string (randomUUID), text: string (max 500), color: "yellow"|"pink"|"green"|"blue",
            done: boolean, createdAt: ISO, updatedAt: ISO }
   ```
   - Höchstens 50 Zettel pro Instanz; `add` darüber hinaus → 409 „Höchstens 50 Notizen“.
   - Sortierung in der Payload: offene vor erledigten, innerhalb jeder Gruppe `createdAt` absteigend (neueste oben).
5. **Aktionen** (Eingaben strikt mit `z.strictObject`):
   - `add { text?: string, color?: Color }`: Default `text: ""`, `color` aus `config.defaultColor`. Gibt `{ id }` zurück. Die UI fokussiert den neuen Zettel; die Route gibt den State zurück, die UI erkennt den neuen Zettel an der Differenz.
   - `update { id, text?, color?, done? }`: mindestens ein Feld; unbekannte `id` → 404.
   - `remove { id }`: unbekannte `id` → 404.
   - Ein separates `toggle` gibt es nicht, `update { done }` reicht.
6. **UI:**
   - Raster aus Zetteln (`grid grid-cols-2 gap-2`, bei `w ≥ 4` drei Spalten), jeder Zettel als Karte in seiner Farbe. Halbtransparente, dunkle Varianten passen zum Dark-Theme: `bg-yellow-300/20 border-yellow-300/40` usw., als statische Klassen-Map, damit Tailwind sie findet.
   - **Bearbeiten:** `textarea` ohne Rahmen; lokaler Entwurf; Speichern bei `blur`, bei Strg+Enter und 800 ms nach der letzten Eingabe (debounced). Keine Aktion, wenn sich der Text nicht geändert hat.
   - **Steuerleiste pro Zettel** (sichtbar bei Hover/Fokus): Checkbox „erledigt“, vier Farbpunkte, Löschen (Mülleimer-Icon aus `lucide-react`).
     - Löschen ohne `confirm()`, weil Dialoge in Lively blockieren.
     - Stattdessen **Rückgängig-Leiste** 5 s lang: „Notiz gelöscht · Rückgängig“ ruft `add` mit dem alten Text und der alten Farbe auf.
   - **„+ Notiz“-Button** im Kachelkopf bzw. oben in der Kachel.
   - **Leerer Zustand:** „Noch keine Notizen – + Notiz“.
   - Erledigte Zettel: `line-through opacity-50`, unten einsortiert.
   - **SSE-Updates beim Tippen:** Kommt ein SSE-Update, während ein Zettel fokussiert ist und sein lokaler Entwurf vom Server-Text abweicht, gilt der lokale Entwurf. Den Entwurf erst übernehmen, wenn der Zettel nicht fokussiert ist.
7. **Kein Polling nötig.** `intervalMs: 300_000` als Sicherheitsnetz, falls die Datei von Hand geändert wird. Aktualisiert wird über die Aktion selbst.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation
JSON-Datei-Helfer; `scheduler.action` + Route; `runAction` in der UI.

### Phase 2: Core
Widget `notes`: Manifest, Store, Collector mit Aktionen.

### Phase 3: Integration
`Widget.tsx`, Config-Beispiel, Doku.

### Phase 4: Testing & Validation
Unit-, Route- und Komponententests; manuell im Browser und in Lively.

---

## STEP-BY-STEP TASKS

### 1. CREATE `server/lib/json-file.ts` + Test

- **IMPLEMENT:**
  - `readJsonFile<T>(path, schema)`: `T | null` (ENOENT → `null`). JSON- oder Schemafehler → `throw new Error(\`${path}: …\`)`.
  - `writeJsonFileAtomic(path, value)`: `mkdir -p`, `<path>.tmp`, `rename`, einmal Retry nach 50 ms bei `EPERM`/`EBUSY` (Windows).
  - `withLock(key, fn)`: Map `key → Promise`, Kette `prev.then(fn, fn)`, aufräumen, wenn die Kette leer ist.
- **Falls Phase 4** in `server/auth/token-store.ts` dieselbe Logik inline hat: dorthin refactoren, sodass der Token-Store diese Helfer nutzt. Danach `npx vitest run server/auth`.
- **Tests:**
  - ENOENT → `null`
  - kaputtes JSON wirft mit Pfad
  - atomar: nach dem Schreiben bleibt keine `.tmp`-Datei
  - `withLock` serialisiert zwei parallele read-modify-write-Läufe; Ergebnis enthält beide Änderungen
- **VALIDATE:** `npx vitest run server/lib/json-file.test.ts`

### 2. UPDATE `server/scheduler.ts` + Tests

- **ADD** in `Scheduler`: `action(instance: string, name: string, input: unknown): Promise<WidgetState>` (Design 1).
- **IMPLEMENT:**
  - CollectContext wie in `collectOnce` bauen (`config`, `env`, `signal` mit `AbortSignal.timeout(timeoutMs)`, `log` mit Scope).
  - Vor `run(r)` auf einen laufenden `inflight.get(r.instance)` warten (Fehler ignorieren), damit der zurückgegebene State die Änderung enthält.
  - `refresh` bleibt und ruft intern dasselbe auf (`action(instance, "refresh")`) oder bleibt unverändert; Hauptsache, die bestehenden Tests bleiben grün.
- **Tests** in `server/scheduler.test.ts`:
  - Aktion läuft, danach ein frischer collect: Der State enthält die neue Zahl.
  - Unbekannte Aktion → `HttpError` 404.
  - Instanz `unconfigured` → 409.
  - Aktion wirft `HttpError(400)` → der Fehler kommt durch, der Widget-Status bleibt `ok`.
  - Läuft gerade ein collect mit altem Stand, gibt `action` den neuen Stand zurück (Fake-Collector mit verzögertem Promise).
- **VALIDATE:** `npx vitest run server/scheduler.test.ts`

### 3. UPDATE `server/routes/api.ts` + `server/app.test.ts`

- **IMPLEMENT:**
  ```ts
  app.post("/widgets/:instance/actions/:action", async c => {
    const input = await parseJson(c, z.unknown());
    return c.json(await deps.scheduler.action(c.req.param("instance"), c.req.param("action"), input));
  });
  ```
  - `ApiDeps.scheduler: Pick<Scheduler, "refresh" | "action">`
  - Der Body `"{}"` von `refresh` funktioniert weiter.
- **Tests:**
  - Bestehende Tests anpassen (`scheduler.action` als `vi.fn`).
  - `refresh` geht über `action("refresh")` bzw. bleibt kompatibel.
  - Input wird durchgereicht.
  - Unbekannte Aktion → 404 (das `vi.fn` wirft `HttpError(404)`).
  - Ohne JSON-Content-Type 415, fremde Origin 403. Diese Tests gibt es schon; sicherstellen, dass sie weiter greifen.
  - Ungültiges JSON → 400.
- **VALIDATE:** `npx vitest run server/app.test.ts`

### 4. UPDATE `web/src/hub/DashboardProvider.tsx`

- **ADD** `runAction(instance, action, input): Promise<{ ok: true; state: WidgetState } | { ok: false; error: string }>` im Context neben `refresh`.
  - `fetch` mit JSON-Header und `JSON.stringify(input ?? {})`.
  - Bei Erfolg `setStates`.
  - Bei HTTP ≠ 2xx `{ ok: false, error: body.error ?? \`HTTP ${status}\` }`. Server nicht erreichbar → `{ ok: false, error: "Server nicht erreichbar" }`.
- `refresh` darf intern `runAction(instance, "refresh", {})` nutzen; das Verhalten bleibt gleich.
- **Context-Typ** exportieren bzw. erweitern, damit `useDashboard()` in Widgets `runAction` liefert.
  - Widgets bekommen `runAction` **nicht** über `WidgetProps`; der Vertrag bleibt gleich. Sie holen es per `useDashboard()`, Import aus `../../web/src/hub/DashboardProvider`.
  - Alternative, falls zirkuläre Imports stören: ein Hook `useWidgetAction(instance)` in `web/src/lib/actions.ts`, der den Context nutzt.
- **VALIDATE:** `npm run typecheck`

### 5. CREATE `widgets/notes/manifest.ts`

- **IMPLEMENT:**
  ```ts
  export const NOTE_COLORS = ["yellow", "pink", "green", "blue"] as const;
  export const NoteColor = z.enum(NOTE_COLORS);
  export const Note = z.object({ id: z.string(), text: z.string().max(500), color: NoteColor, done: z.boolean(),
    createdAt: z.string(), updatedAt: z.string() });
  export const NotesConfig = z.object({ defaultColor: NoteColor.default("yellow") });
  export const NotesData = z.object({ notes: z.array(Note).max(50) });
  export const manifest = defineManifest({ id: "notes", title: "Notizen", version: 1, category: "daily",
    defaultSize: { w: 3, h: 3 }, intervalMs: 300_000, timeoutMs: 5_000, capabilities: ["fs"],
    config: NotesConfig, data: NotesData });
  export const MAX_NOTES = 50; export const MAX_TEXT = 500;
  ```
- **Eingabe-Schemas** in derselben Datei; sie sind browser-safe und die UI kann die Limits nutzen:
  - `AddIn = z.strictObject({ text: z.string().max(MAX_TEXT).optional(), color: NoteColor.optional() })`
  - `UpdateIn = z.strictObject({ id: z.string(), text: …optional, color: …optional, done: z.boolean().optional() }).refine(…mindestens ein Feld)`
  - `RemoveIn = z.strictObject({ id: z.string() })`
- **VALIDATE:** `npm run typecheck`

### 6. CREATE `widgets/notes/store.ts` + Test

- **IMPLEMENT:**
  - **Reine Funktionen** (`now` und `newId` injiziert):
    - `addNote(notes, input, defaults)`
    - `updateNote(notes, input)` (setzt `updatedAt`)
    - `removeNote(notes, id)`
    - `sortNotes(notes)` (Design 4)
  - **Datei:** `notesFile(dataDir, instance) = join(dataDir, "notes", \`${instance}.json\`)`. Die `instance` ist bereits kebab-case geprüft (`InstanceConfig`), trotzdem zur Sicherheit gegen `/^[a-z0-9][a-z0-9-]*$/` prüfen.
  - `loadNotes(file)`: `readJsonFile` mit `z.object({ version: z.literal(1), notes: z.array(Note) })` → `notes` bzw. `[]`
  - `mutateNotes(file, fn)`: `withLock(file, …)`: laden, `fn`, speichern.
- **Fehler** als `HttpError` aus `server/http` (`notFound("Notiz")`, `HttpError(409, "Höchstens 50 Notizen")`). Die Datei ist server-only, also erlaubt.
- **Tests:**
  - add, update, remove, sort
  - Limit 50
  - unbekannte ID
  - `update` ohne Felder wird vom Schema abgelehnt
  - parallele `mutateNotes` verlieren nichts
  - kaputte Datei → `mutateNotes` wirft und überschreibt **nicht**
- **VALIDATE:** `npx vitest run widgets/notes/store.test.ts`

### 7. CREATE `widgets/notes/collector.ts` + Test

- **IMPLEMENT:**
  ```ts
  export function notesCollector(dataDir: string) { return defineCollector(manifest, {
    collect: async ({ config, … }) => ({ notes: sortNotes(await loadNotes(fileFor(ctx))) }),
    actions: {
      add: async (ctx, input) => …parse(AddIn)…mutateNotes…,
      update: …, remove: …,
    },
  }); }
  export const collector = notesCollector(serverConfig.dataDir);
  ```
  - **Problem:** Die Aktion braucht den Instanznamen für den Dateipfad, `CollectContext` hat ihn aber nicht.
    - **Lösung:** `CollectContext` um `instance: string` erweitern. Das ist eine kleine Vertragsänderung: In `shared/widget-contract.ts` `instance` in `CollectContext` und `SubscribeContext` ergänzen und im Scheduler setzen (`collectOnce`, `subscribe`, `action`).
    - Bestehende Collectors ignorieren das Feld. Der Fake-Kontext in `server/scheduler.test.ts` muss angepasst werden.
  - Eingabefehler: `safeParse` → `throw new HttpError(400, z.prettifyError(err))`
- **Tests:** Die Aktionen über einen echten `createScheduler` mit `createCache` und einem temporären `dataDir` laufen lassen (`mkdtempSync`):
  - `add` → `action` liefert einen State mit dem Zettel.
  - Die Datei existiert.
  - Neustart (neuer Scheduler) → der Zettel ist noch da.
  - `update { done: true }` sortiert nach unten.
  - Ungültige Eingabe → 400.
  - Zusätzlich der Fixture-Schreibmodus (`UPDATE_FIXTURES=1` erzeugt `fixtures/notes.json` aus drei Beispielzetteln mit neutralen Texten).
- **VALIDATE:** `npx vitest run widgets/notes`

### 8. CREATE `widgets/notes/Widget.tsx` + Test

- **IMPLEMENT** nach Design 6:
  - Komponenten `NoteCard` (eigener Entwurfs-State, Debounce mit `useRef`-Timer, `onBlur` speichert) und `UndoBar`.
  - Farb-Klassen als statische Map:
    ```ts
    const COLOR: Record<NoteColor, { card: string; dot: string }> = {
      yellow: { card: "bg-yellow-300/15 border-yellow-300/40", dot: "bg-yellow-300" },
      pink:   { card: "bg-pink-300/15 border-pink-300/40",     dot: "bg-pink-300" },
      green:  { card: "bg-emerald-300/15 border-emerald-300/40", dot: "bg-emerald-300" },
      blue:   { card: "bg-sky-300/15 border-sky-300/40",       dot: "bg-sky-300" },
    };
    ```
  - `runAction` per `useDashboard()`. Fehler einer Aktion → kleine Zeile `text-bad` unter dem Zettel; der Entwurf bleibt erhalten.
  - `textarea`: `maxLength={MAX_TEXT}`, `aria-label="Notiz"`, `resize-none`, Höhe automatisch über `field-sizing: content` (Tailwind `field-sizing-content`) oder `rows` nach Zeilen.
  - Bedienelemente mit `aria-label`: „als erledigt markieren“, „Farbe gelb“, „Notiz löschen“, „Neue Notiz“.
- **Tests** (jsdom, Provider-Context mit einem Fake-`runAction` per Wrapper, oder `vi.mock` des Hooks-Moduls):
  - Rendert Zettel als Text.
  - Tippen, dann `blur` → `runAction("update", { id, text })`.
  - Kein Aufruf, wenn der Text unverändert ist.
  - Checkbox → `update { done: true }`.
  - Farbe → `update { color }`.
  - Löschen → `remove`, danach erscheint „Rückgängig“; Klick → `add` mit altem Text und alter Farbe.
  - „+ Notiz“ → `add {}`.
  - Text `<b>x</b>` erscheint als Text.
- **VALIDATE:** `npx vitest run widgets/notes/Widget.test.tsx`

### 9. UPDATE Konfiguration und Doku

- **`dashboard.config.example.json`** und lokale `dashboard.config.json`: Instanz `notes` an einer freien Stelle im 12×8-Raster einfügen, z. B. `x: 0, y: 6, w: 3, h: 2`; nach Phase 4 prüfen, was frei ist.
- **`widgets/notes/README.md`** (deutsch):
  - was das Widget kann
  - Speicherort `data/notes/<instance>.json`
  - mehrere Instanzen
  - Limits (50 Zettel, 500 Zeichen)
  - **Lively:** Tastatureingabe muss erlaubt sein (Einstellung nennen, nachdem sie in Task 10 geprüft ist). Alternative: im Browser bearbeiten, Lively zeigt den Stand per SSE.
- **`README.md`** (Widgets-Liste)
- **`PRD.md`:**
  - Abschnitt 4 Kernfunktionen: „✅ Notiz-Widget (Post-its)“
  - Abschnitt 2 Prinzip 1: Ergänzung „Eigene Dashboard-Daten wie Notizen sind davon ausgenommen“
  - Abschnitt 10: Aktions-Route mit Body `input`
- **`.agents/reference/widgets.md`:** neue Regel zu Aktionen:
  - Eingaben mit `z.strictObject` prüfen, Fehler als `HttpError(400)`
  - Schreiben nur atomar und mit `withLock`
  - die Aktion liefert keine Daten zurück; der Scheduler sammelt danach neu
- **`.agents/reference/security.md`:** Aktions-Eingaben sind Browser-Input. Pro neuer Aktion gibt es Tests für 400 bei ungültigem Input; 403 und 415 deckt die Route ab.
- **VALIDATE:** `npm run typecheck && npx vitest run widgets/contract.test.ts`

### 10. Manuelle Validierung

- `npm run build && npm start`, dann `http://127.0.0.1:4700` mit den Chrome-Tools öffnen:
  - Zettel anlegen, tippen, Farbe wechseln, abhaken, löschen, rückgängig machen
  - Seite neu laden → alles ist noch da
  - Server neu starten → alles ist noch da
  - zweiter Tab: Änderungen erscheinen per SSE
- **Lively:** Tastatureingabe im Wallpaper prüfen; die nötige Einstellung im README festhalten. Funktioniert Tippen in Lively nicht, ist das ein bekanntes Limit und kein Blocker.
- **VALIDATE:** `curl -s http://127.0.0.1:4700/api/widgets/notes`

---

## TESTING STRATEGY

- **Unit:** `json-file`, `store` (reine Funktionen und Datei-Locking), Eingabe-Schemas
- **Integration:**
  - `scheduler.action` mit Fake-Collectors (Vertrags-Doubles sind erlaubt)
  - `widgets/notes/collector.test.ts` mit echtem Scheduler und Temp-Verzeichnis
  - `server/app.test.ts` für die Route
- **Komponenten:** `Widget.test.tsx` (jsdom)
- **Edge Cases:**
  - leere bzw. fehlende Datei
  - kaputte Datei, die nicht überschrieben werden darf
  - 50er-Limit
  - 500 Zeichen
  - unbekannte ID
  - parallele Aktionen
  - Aktion während eines laufenden Polls
  - SSE-Update, während ein Zettel fokussiert ist
  - HTML im Text
  - Rückgängig nach dem Löschen

## VALIDATION COMMANDS

Alle Befehle über **Bash**.

```bash
npm run typecheck && npm run lint
npx vitest run server/lib/json-file.test.ts server/scheduler.test.ts server/app.test.ts
npx vitest run widgets/notes
npm run check
```
Manuell: Task 10.

## ACCEPTANCE CRITERIA

- [ ] Zettel lassen sich in der Kachel anlegen, bearbeiten, einfärben (4 Farben), abhaken und löschen (mit Rückgängig).
- [ ] Zettel überleben Reload und Server-Neustart (`data/notes/<instance>.json`).
- [ ] `POST /api/widgets/:instance/actions/:action` führt Collector-Aktionen generisch aus und gibt den neuen State zurück.
  - `refresh` funktioniert unverändert.
  - Unbekannte Aktionen liefern 404, ungültige Eingaben 400.
  - 403 und 415 greifen weiter.
- [ ] Eine fehlgeschlagene Aktion ändert den Widget-Status nicht.
- [ ] Parallele Änderungen gehen nicht verloren; Schreiben ist atomar.
- [ ] Text wird nur als Text gerendert.
- [ ] `npm run check` ist grün.
- [ ] Doku ist nachgezogen: Widget-README, README, PRD und die Referenzdokumente.

## COMPLETION CHECKLIST

- [ ] Alle Tasks sind der Reihe nach erledigt, jede Validierung lief.
- [ ] Die manuelle Prüfung im Browser und in Lively ist erledigt.
- [ ] Kein Commit; der kommt mit `/commit` nach `/validate` und `/code-review`.

## NOTES

- **`instance` im `CollectContext`** ist die einzige Vertragsänderung. Sie ist rückwärtskompatibel, weil nur ein Feld dazukommt.
- **Risiko Lively-Tastatur:** Wenn Lively keine Tastatureingaben weiterleitet, bleibt die Kachel im Wallpaper anzeigend, bearbeitet wird im Browser-Tab. Die Daten sind dieselben, SSE synchronisiert.
- **Bewusst nicht enthalten** (vom Nutzer nicht gewählt): frei verschiebbare Zettel per Drag & Drop, Fälligkeitsdaten, Markdown.
