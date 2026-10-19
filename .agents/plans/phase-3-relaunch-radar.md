# Feature: Phase 3 – relaunch-radar-Widget mit Live-Updates (Push)

Vor der Umsetzung lesen: `.agents/reference/widgets.md` (Regeln 1–7, Fixtures) und `.agents/reference/security.md`. Diese Phase ist die **erste seit Phase 1, die den Kern ändert**: Der Widget-Vertrag bekommt `subscribe`, der Scheduler unterstützt Push-Auslöser. Alle bestehenden Tests müssen unverändert grün bleiben.

## Feature Description

Ein Widget `relaunch-radar` zeigt den Zustand des lokalen Sales-Tools relaunch-radar:
- Autopilot-Status
- laufende Jobs
- was auf den Nutzer wartet: Mockups bewerten, fehlgeschlagene Läufe
- die letzten Benachrichtigungen

Updates kommen **live**: Das Widget hört auf die SSE-Streams von relaunch-radar und holt sofort neu, wenn dort etwas passiert. Läuft der relaunch-radar-Server nicht, liest das Widget `logs/notifications.json` direkt und zeigt „Dateimodus“.

## User Story

Als Agenturinhaber will ich den Autopiloten von relaunch-radar live auf dem Desktop verfolgen, damit ich Fortschritt und Fehler sehe und weiß, was ich bewerten muss, ohne dessen UI zu öffnen.

*Beispiel:* „Autopilot läuft · mockup-create für Firma A (ETA 6 min) · 3 bewerten · 2 fehlgeschlagen · vor 2 Min.: Firma B: Mockup gebaut“

## Feature Metadata
**Type:** New Capability (plus Kern-Erweiterung) · **Complexity:** Medium · **Systems:** `shared/widget-contract.ts`, `server/scheduler.ts`, neu `server/lib/sse.ts`, neu `widgets/relaunch-radar/` · **Dependencies:** keine neuen npm-Pakete

---

## CONTEXT REFERENCES – VOR DER UMSETZUNG LESEN

### Dieses Repo
- `shared/widget-contract.ts` (Zeilen 38–56): `CollectContext`, `WidgetCollector`, `defineCollector`. Hier kommt `subscribe` hinzu.
- `server/scheduler.ts`:
  - `createScheduler` mit den Maps `inflight` und `hanging` sowie `run`, `loop`, `start` und `stop`
  - `run()` dedupliziert parallele Läufe; darüber laufen auch Push-Auslöser
- `server/scheduler.test.ts`: Muster für Fake-Timer, `instance(...)`-Helfer, `flush()`
- `server/lib/win.ts`: Muster für einen Server-Helfer mit reinen, testbaren Funktionen (`parseNetstatListeners`) und `withSignal`
- `widgets/external/collector.ts` + `collector.test.ts`: `fetch` mit `signal`, Test gegen einen **echten** lokalen `node:http`-Server
- `widgets/agents/collect.ts`: Kern als reine, injizierbare Funktion, `collector.ts` nur als dünner Wrapper; Teilausfälle tolerieren
- `widgets/agents/Widget.tsx`: Muster für Liste, Badges, `relativeTime` und `useNow`
- `web/src/lib/openUrl.ts`: Links öffnen (über `/api/open`, den Standardbrowser)
- `dashboard.config.example.json` und die lokale `dashboard.config.json` (gitignored): Hier kommt die neue Instanz hinein.

### relaunch-radar (`C:\_repos\relaunch-radar`, nur lesen)
- **Schemas:** `shared/schemas/autopilot.ts`
  - `Overview` (:94) = `{ autopilot: AutopilotState, attention: Attention[], leads: OverviewLead[] }` (strictObject)
  - `AttentionKind` (:80) = `rate | failed | limit`; `Attention` = `{ slug, name, kind, text, at: Iso|null }`
  - `AutopilotState` (:33–42) = `{ on, since, status: off|running|waiting|paused|idle, running: {slug,name,step,reason,jobId,startedAt,etaMin}[], pausedUntil, next: {slug,name,step,reason}|null, push }`
  - `NotificationFeed` (:65–68) = `{ seenAt, items, unread }`
  - Notification (:50–61) = `{ id, at, kind: built|failed|limit|chatgpt|step|idle|test, slug|null, title, lastStep, track, next: { by: auto|du|none, text }, etaMin|null, pushed }`
- **Jobs:** `shared/schemas/job.ts:97–107` `JobInfo` = `{ id, request: { type, slug, … }, status, queuedAt, startedAt, endedAt, exitCode, logTail, logFile }`. **`type`/`slug` liegen unter `request`.**
- **Endpunkte** (gegen den laufenden Server am 2026-10-19 geprüft, keine Auth, kein CORS, kein Host-Check):
  - `GET /api/overview` → `Overview` (aktuell 47 attention, 176 leads; `leads` **ignorieren**)
  - `GET /api/jobs/running` → `JobInfo[]`
  - `GET /api/notifications` → `NotificationFeed` (bis 200 Einträge, neueste zuerst)
- **SSE** (`server/routes/autopilot.ts:47–64`, `server/routes/jobs.ts:27–49`):
  - `/api/notifications/stream`: Events `notify` (eine Notification) und `autopilot` (ganzer `AutopilotState`). **Kein Snapshot beim Verbinden, kein Heartbeat.**
  - `/api/jobs/stream`: `snapshot` beim Verbinden, danach `start`, `end`, `queue`, `line`. **`line` ist sehr häufig (Log-Zeilen) und wird ignoriert.**
- **Datei-Fallback:** `logs/notifications.json` = `{ seenAt, items }` (wie die API, ohne `unread`), höchstens 200 Einträge, neueste zuerst, **atomar** geschrieben (Temp-Datei plus `rename`, `server/repository.ts:67–83`), daher kein halbes Lesen.
- **UI-Deep-Link:** `http://127.0.0.1:3000/lead/<slug>/uebersicht` (Tabs: `uebersicht|analyse|mockup|angebot`)

### Dokumentation
- [WHATWG HTML – Server-sent events, Parsing an event stream](https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream): Feldregeln (`event`, `data`, `id`, `retry`, Kommentar `:`), Dispatch bei Leerzeile, mehrzeilige `data`. Wird für den eigenen Parser gebraucht.
- [Node.js – `fetch` / `Response.body` (Web Streams)](https://nodejs.org/api/globals.html#fetch): Stream lesen mit `TextDecoderStream` bzw. `getReader()`. `EventSource` gibt es in Node 24 **nur mit Flag** (`--experimental-eventsource`, am 2026-10-19 geprüft), deshalb kommt ein eigener Reader zum Einsatz.

---

## DESIGN-ENTSCHEIDUNGEN

1. **Push löst nur einen Abruf aus, er liefert keine Daten.** `subscribe(ctx)` bekommt `ctx.refresh()` und ruft es bei Ereignissen auf. Die Daten kommen weiterhin ausschließlich über `collect()`, werden also gleich validiert, gehen über denselben Statusweg und durch dieselbe Timeout-Logik. Das hält den Kern klein, und es gibt nur einen Datenweg.
2. **Polling bleibt als Netz.** `intervalMs: 30_000`. SSE macht es schnell, Polling stellt sicher, dass ein verpasstes Event oder ein toter Stream höchstens 30 s Verzögerung kostet.
3. **Entprellen im Scheduler** (500 ms): Bursts wie `end`, `queue` und `notify` führen zu **einem** Abruf. `run()` dedupliziert außerdem laufende Abrufe.
4. **Eigener SSE-Reader** `server/lib/sse.ts`: ein reiner Parser plus ein `subscribeSSE`-Wrapper mit Reconnect und Backoff (1 s → 30 s). Den Parser kann später auch das Messenger-Widget nutzen.
5. **Modus „live“ vs. „Datei“**:
   - **API erreichbar:** live.
   - **API nicht erreichbar** (Verbindungsfehler, Timeout, HTTP ≠ 200): `notifications.json` lesen, Modus `file`. Autopilot und Jobs sind dann `null`, die UI zeigt „API offline – Dateimodus“ samt Grund.
   - **Beides scheitert:** werfen; der Scheduler macht daraus `stale` oder `error`.
6. **Nur die nötigen Felder** gehen in die Payload: Die 176 `leads` werden nie übertragen. Eingangsdaten werden mit **eigenen, nachsichtigen** zod-Schemas gelesen (`z.object` verwirft unbekannte Felder), damit neue Felder in relaunch-radar nichts kaputt machen.

---

## STEP-BY-STEP TASKS

### 1. UPDATE `shared/widget-contract.ts`: `subscribe` im Vertrag
- **ADD**:
  ```ts
  export interface SubscribeContext<C> {
    config: C;
    env: Record<string, string | undefined>;
    /** Aborted when the scheduler stops. */
    signal: AbortSignal;
    log: (...args: unknown[]) => void;
    /** Ask for an immediate collect(); debounced by the scheduler. Push never carries data itself. */
    refresh: () => void;
  }
  ```
  und im `WidgetCollector` optional `subscribe?(ctx: SubscribeContext<C>): void | (() => void);` mit einem Doc-Kommentar: „Optional push trigger (SSE, file watch). Cleanup via ctx.signal or the returned function.“
- **GOTCHA:** Die Datei darf nur `zod` importieren (wird im Browser gebündelt), es sind reine Typen.
- **VALIDATE:** `npm run -s typecheck`

### 2. UPDATE `server/scheduler.ts`: Push-Auslöser
- **IMPLEMENT** in `start()`: Für jede lauffähige Instanz mit `collector.subscribe`:
  - einen `AbortController` pro Instanz anlegen
  - `subscribe({ config, env, signal, log, refresh })` aufrufen, in try/catch: Wirft `subscribe` synchron, wird geloggt, Polling läuft weiter
  - eine zurückgegebene Cleanup-Funktion merken
- **IMPLEMENT** `refresh` pro Instanz: entprellt (`PUSH_DEBOUNCE_MS = 500`) über `setTimeout`. Danach `run(r)` mit `.catch` wie im `loop`. Ist `running` false, passiert nichts.
- **IMPLEMENT** in `stop()`: alle Controller abbrechen, Cleanups aufrufen (in try/catch), Debounce-Timer löschen.
- **GOTCHA:** Push darf die Polling-Kette nicht doppelt planen. `run()` dedupliziert bereits, und der `loop` plant nur nach eigenen Läufen neu. Ein Push-Lauf verschiebt das nächste Polling **nicht**; das ist gewollt und einfach.
- **TESTS** in `server/scheduler.test.ts`, Fake-Timer:
  - `subscribe` wird bei `start()` einmal pro Instanz aufgerufen, mit `config` = `parsedConfig`.
  - 3× `refresh()` innerhalb von 100 ms führt nach 500 ms zu **einem** zusätzlichen `collect`.
  - Ein `refresh()` nach `stop()` löst nichts aus; `signal.aborted === true`; die Cleanup-Funktion wurde aufgerufen.
  - Wirft `subscribe`, läuft das Polling trotzdem und der Status ist `ok`.
- **VALIDATE:** `npx vitest run server/scheduler` (alle alten und neuen Tests grün)

### 3. CREATE `server/lib/sse.ts` + `server/lib/sse.test.ts`
- **IMPLEMENT** `createSSEParser(onEvent: (e: { event: string; data: string; id?: string }) => void)` mit Methode `push(chunk: string)` und `end()`:
  - Zeilen trennen an `\r\n`, `\n` oder `\r`; Puffer für unvollständige Zeilen über Chunk-Grenzen hinweg
  - `:`-Zeilen sind Kommentare
  - `field: value`: genau **ein** führendes Leerzeichen des Werts entfernen
  - `data` sammelt mehrere Zeilen, verbunden mit `\n`
  - Eine Leerzeile löst den Dispatch aus, aber nur, wenn `data` gesetzt ist; der Standard-Event-Name ist `message`.
- **IMPLEMENT** `subscribeSSE(url, { onEvent, onOpen?, onError?, signal, minRetryMs = 1000, maxRetryMs = 30_000, fetchImpl = fetch })`:
  - Schleife bis `signal.aborted`: `fetch(url, { signal, headers: { accept: "text/event-stream" } })`
  - Bei `!res.ok` oder einem falschen Content-Type gilt der Versuch als Fehler.
  - Bei Erfolg: `onOpen()`, Backoff zurücksetzen, `res.body` per `TextDecoder` (stream: true) in den Parser geben.
  - Bei Stream-Ende oder Fehler: `onError(err)`, warten (Backoff verdoppeln, Deckel `maxRetryMs`, abbrechbar über `signal`), neu verbinden.
  - Rückgabe: `Promise<void>`, die nach dem Abbruch aufgelöst wird; sie wirft **nie**, Fehler gehen an `onError`.
- **TESTS:**
  - Parser: Chunk-Grenze mitten in einer Zeile, CRLF, Kommentar, mehrzeiliges `data`, `event` ohne `data` (kein Dispatch), Standard-Event `message`, führendes Leerzeichen.
  - `subscribeSSE` gegen einen **echten** lokalen `node:http`-Server:
    - empfängt 2 Events
    - der Server beendet die Antwort → Reconnect mit erneutem `onOpen`
    - Antwort 500 → `onError` und Retry
    - Abbruch über `signal` beendet die Schleife (Promise wird aufgelöst)
  - kleine `minRetryMs` (z. B. 20 ms) in den Tests
- **VALIDATE:** `npx vitest run server/lib/sse`

### 4. CREATE `widgets/relaunch-radar/manifest.ts`
- `id "relaunch-radar"`, `title "relaunch-radar"`, `category "projects"`, `defaultSize { w: 3, h: 3 }`, `intervalMs 30_000`, `timeoutMs 10_000`, `capabilities ["network","fs"]`
- `config`:
  ```ts
  z.object({
    url: z.url({ protocol: /^https?$/ }).default("http://127.0.0.1:3000"),
    dir: z.string().default("C:\\_repos\\relaunch-radar"),
    attentionLimit: z.number().int().min(1).max(20).default(5),
    notificationLimit: z.number().int().min(1).max(20).default(5),
  })
  ```
- `data`:
  ```ts
  z.object({
    mode: z.enum(["live", "file"]),
    apiError: z.string().optional(),            // why file mode
    uiUrl: z.string(),                          // base for deep links
    autopilot: z.object({
      on: z.boolean(),
      status: z.enum(["off","running","waiting","paused","idle"]),
      pausedUntil: z.string().nullable(),
      next: z.object({ slug: z.string(), name: z.string(), step: z.string() }).nullable(),
    }).nullable(),                              // null in file mode
    jobs: z.array(z.object({ type: z.string(), slug: z.string().nullable(), name: z.string().nullable(), startedAt: z.string(), etaMin: z.number().nullable() })).nullable(),
    attention: z.object({
      counts: z.object({ rate: z.number(), failed: z.number(), limit: z.number() }),
      items: z.array(z.object({ slug: z.string(), name: z.string(), kind: z.enum(["rate","failed","limit"]), text: z.string(), at: z.string().nullable() })),
    }).nullable(),
    notifications: z.array(z.object({ id: z.string(), at: z.string(), kind: z.string(), slug: z.string().nullable(), title: z.string(), next: z.object({ by: z.string(), text: z.string() }) })),
    unread: z.number().int(),
  })
  ```
- **VALIDATE:** `npm run -s typecheck`

### 5. CREATE `widgets/relaunch-radar/parse.ts` + Tests
- Nachsichtige Eingangsschemas (`OverviewIn`, `JobInfoIn`, `FeedIn`, `NotificationFileIn`) mit genau den benötigten Feldern.
- `fromApi({ overview, running, feed }, config, uiUrl)`:
  - `autopilot` aus `overview.autopilot`
  - `jobs` aus `running`: `type = request.type`, `slug = request.slug ?? null`; `name` und `etaMin` über einen Abgleich mit `autopilot.running[].jobId === info.id`, sonst `null`
  - `attention.counts` über **alle** Einträge, `items` = die ersten `attentionLimit`
  - `notifications` = die ersten `notificationLimit` aus `feed.items`, `unread = feed.unread`
- `fromFile(file, config, uiUrl, apiError)`:
  - `autopilot`, `jobs` und `attention` sind `null`
  - `unread` = Einträge mit `at > seenAt` (bei `seenAt === null` alle)
  - `notifications` wie oben
- `leadUrl(uiUrl, slug)` = `${uiUrl}/lead/${encodeURIComponent(slug)}/uebersicht`. Wird in `Widget.tsx` genutzt, also ohne Node-Imports.
- **FIXTURES** (echt, aber **anonymisiert** nach `widgets.md`: Firmennamen sind Kundendaten des Nutzers → „Firma A/B/…“, Slugs → `firma-a-de` …):
  - `fixtures/overview.json`: echte `/api/overview`-Antwort, `leads` auf 2 Einträge gekürzt, `attention` auf 8 gekürzt (beide Arten `rate` und `failed` enthalten)
  - `fixtures/jobs-running.json`: Läuft gerade kein Job (am 2026-10-19 war die Liste leer), nimm einen **echten** Eintrag aus `GET /api/jobs` (Historie), z. B. einen `mockup-create`, und kennzeichne in der README, dass er aus der Historie stammt. Erfinde kein JobInfo.
  - `fixtures/notifications.json`: echte `/api/notifications`-Antwort, auf 8 Einträge gekürzt
  - `fixtures/notifications-file.json`: echte `logs/notifications.json`, auf 8 Einträge gekürzt
  - `fixtures/relaunch-radar.json`: die erwartete Payload, erzeugt aus den Fixtures per `UPDATE_FIXTURES=1`
  - Anonymisierungs-Grep vor dem Commit: keine echten Firmennamen bzw. Slugs aus `/api/overview` und keine Pfade mit Benutzernamen
- **TESTS:**
  - `fromApi` mit den Fixtures: Zählung über alle `attention`, Limits, Job-Zuordnung über `request`, `leads` landen nicht in der Payload
  - `fromFile`: `unread` aus `seenAt`
  - `leadUrl` kodiert den Slug
- **VALIDATE:** `npx vitest run widgets/relaunch-radar`

### 6. CREATE `widgets/relaunch-radar/collect.ts`, `collector.ts` + Tests
- `collectRelaunchRadar({ url, dir, signal, fetchImpl, readFile, config })`:
  1. `Promise.all` über die drei GETs mit `signal`. Jede Antwort muss `ok` sein und zum Eingangsschema passen; ein Schemafehler ist **kein** Grund für den Dateimodus, sondern ein echter Fehler (werfen mit „relaunch-radar API: unerwartetes Format …“).
  2. Netzwerk- bzw. HTTP-Fehler: `apiError` merken, `logs/notifications.json` lesen → `fromFile`.
  3. Scheitert auch die Datei, mit beiden Gründen werfen.
- `collector.ts`:
  - `collect` ruft `collectRelaunchRadar` auf.
  - `subscribe(ctx)` startet **zwei** `subscribeSSE` auf `${url}/api/notifications/stream` (Events `notify`, `autopilot`) und `${url}/api/jobs/stream` (Events `start`, `end`, `queue`; `line` und `snapshot` ignorieren). Bei jedem relevanten Event wird `ctx.refresh()` aufgerufen, ebenso bei `onOpen` (die API ist wieder da, also schnell zurück in den Live-Modus). Ein Fehler wird nur beim **ersten** Auftreten nach einem Erfolg geloggt.
- **TESTS:** gegen einen **echten** lokalen `node:http`-Server, der die Fixtures ausliefert:
  - live → `mode "live"`
  - Server weg (Port geschlossen) und tmp-`dir` mit `logs/notifications.json` → `mode "file"`, `apiError` gesetzt
  - beides weg → wirft
  - API liefert ein falsches Format → wirft (kein Dateimodus)
  - `subscribe`: Ein SSE-Event `notify` vom Testserver löst `refresh` aus; `line` tut es nicht
- **VALIDATE:** `npx vitest run widgets/relaunch-radar`

### 7. CREATE `widgets/relaunch-radar/Widget.tsx` + `README.md`
- **UI:**
  - **Kopf:** Autopilot-Status als Badge (läuft = good, wartet/pausiert = warn, idle = muted, aus = muted), dazu `next` („als Nächstes: Firma A · mockup“). Im Dateimodus stattdessen das Badge „API offline – Dateimodus“ (`text-warn`, `title` = `apiError`).
  - **Jobs:** Liste mit `type`, Name bzw. Slug, „seit X Min.“ und ETA.
  - **Wartet auf dich:** Zähler `n bewerten · m fehlgeschlagen · k Limit`, dann die Einträge. Ein Klick öffnet `leadUrl` über `openUrl`.
  - **Letzte Ereignisse:** `title`, `next.text` (bei `by === "du"` hervorgehoben) und die relative Zeit. Ein Klick öffnet `leadUrl`, falls ein `slug` vorhanden ist.
  - Bei Platzmangel wird gescrollt.
- **README:** Datenquellen, Live-Modus vs. Dateimodus, Konfiguration, Hinweis auf die Anonymisierung der Fixtures.
- **VALIDATE:** `npx vitest run widgets/contract` (inkl. `fixtures/relaunch-radar.json`)

### 8. UPDATE Konfiguration und Doku
- `dashboard.config.example.json` **und** die lokale `dashboard.config.json`: `{ "instance": "relaunch-radar", "type": "relaunch-radar", "x": 6, "y": 3, "config": {} }` (Platz neben Agents; Extern liegt bei x 9)
- README-Widget-Tabelle: Zeile `relaunch-radar`
- `.agents/reference/widgets.md`: neue Regel „Push“: `subscribe` löst nur `ctx.refresh()` aus, die Daten kommen immer über `collect()`; Polling bleibt als Netz; für SSE `server/lib/sse.ts` verwenden
- PRD Abschnitt 6.1: Den Satz „Push-Collectors (`subscribe`) kommen erst mit Phase 3“ durch die tatsächliche Signatur ersetzen; Phase 3 als erledigt markieren (nach dem Commit)
- **VALIDATE:** `npm run check`

### 9. Smoke-Test (echt)
- Server neu starten, `curl /api/widgets/relaunch-radar` → `mode: "live"`, Zahlen wie `curl :3000/api/overview` (`attention`-Zählung)
- **Live-Test:** Bei laufendem relaunch-radar ein Ereignis auslösen. Der einfachste Weg ist ein Job über dessen UI, z. B. ein `probe`. Das ist eine **Aktion in einem fremden Tool**, daher **vorher den Nutzer fragen**. Alternative ohne Nebenwirkung: Die SSE-Kette ist durch Tests abgedeckt; live nur prüfen, dass `subscribe` verbunden ist (Server-Log ohne Fehler, ein Neustart von relaunch-radar führt innerhalb weniger Sekunden zurück zu `live`).
- **Dateimodus:** Nur wenn der Nutzer zustimmt, den relaunch-radar-Server kurz zu stoppen (fremder Prozess!). Sonst reicht der Integrationstest aus Task 6.
- UI-Screenshot im Browser, Konsole ohne Fehler

---

## ACCEPTANCE CRITERIA
- [ ] `npm run check` ist grün; **alle bisherigen Tests unverändert grün**.
- [ ] Der Vertrag hat `subscribe(ctx)` mit `refresh`; der Scheduler entprellt, räumt bei `stop()` auf und toleriert ein werfendes `subscribe`.
- [ ] `server/lib/sse.ts` parst nach WHATWG-Regeln, verbindet mit Backoff neu und wirft nie.
- [ ] Live-Modus: Zahlen stimmen mit `/api/overview` überein; `leads` ist nicht in der Payload.
- [ ] Ein SSE-Ereignis (`notify`, `autopilot`, `start`, `end`, `queue`) führt innerhalb von ~1 s zu neuen Daten (Test); `line` löst nichts aus.
- [ ] Dateimodus: Ist die API weg, werden die Daten aus `notifications.json` mit Grund angezeigt; scheitert beides, ist der Status `stale` bzw. `error`.
- [ ] Ein Klick auf einen Lead bzw. eine Benachrichtigung öffnet `/lead/<slug>/uebersicht` im Standardbrowser.
- [ ] Die Fixtures sind echt und anonymisiert (keine echten Firmennamen bzw. Slugs).

## NOTES
- **Warum keine Daten per Push:** Ein zweiter Datenweg würde Validierung, Timeout- und Statuslogik verdoppeln. Ein Abruf nach einem Ereignis kostet bei relaunch-radar ~3 lokale Requests, das ist vernachlässigbar.
- **Kern-Änderung minimal:** nur ein optionales Feld im Vertrag und ~30 Zeilen im Scheduler. Widgets ohne `subscribe` verhalten sich exakt wie vorher.
- **Nebenwirkungen in fremden Tools:** Der Smoke-Test löst in relaunch-radar **nichts** ohne Zustimmung aus und stoppt dessen Server nicht eigenmächtig.
- **Confidence:** 8/10. Risiko: Details des Stream-Lesens in Node (Abbruch während `reader.read()`) und Fake-Timer im Zusammenspiel mit den Push-Tests.
