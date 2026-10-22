# Feature: Phase 5 – Messenger-Widget mit kumulierten Chats

Der Plan sollte vollständig sein. Prüfe vor der Umsetzung Doku, Codebase-Muster und die Sinnhaftigkeit jedes Tasks. Achte auf die exakten Namen bestehender Helfer und Typen und importiere aus den richtigen Dateien.

**Reihenfolge:** Dieser Plan kommt **nach** `notes-post-its.md`. Er nutzt dessen Kern-Erweiterung (`scheduler.action`, `collector.actions`, `useDashboard().runAction`) und `server/lib/json-file.ts`. Beides liegt im Arbeitsbaum bereits vor (Stand 2026-10-22); vor dem Start prüfen, dass es committet ist.

## Feature Description

Ein Widget `messenger` zeigt die Nachrichten von WhatsApp, Teams, Discord, Slack und Lark. Quelle ist die Windows-Benachrichtigungsdatenbank `%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db`, also jeder Toast, den diese Apps zeigen.

Wie in der Android-App (`C:\_repos\widget_dashboard\android-app\app\src\main\java\com\widgethub\widgets\messages`) werden die Nachrichten **kumuliert**:
- **ein Eintrag pro Chat** statt eines Eintrags pro Toast, mit einem Verlauf der letzten 10 Nachrichten, höchstens 50 Chats
- ein **Ungelesen-Zähler** pro Chat und insgesamt
- Chats **ausblenden**, **alle leeren**, **rückgängig machen**, Apps **stummschalten**
- Statuszeilen wie „Überprüfe auf neue Nachrichten“ werden herausgefiltert

Windows löscht Toasts aus der Datenbank, sobald sie im Info-Center weggeklickt werden oder ablaufen. Darum führt das Widget einen **eigenen Speicher** `data/messages/<instance>.json`; Nachrichten bleiben dort, bis der Nutzer sie im Dashboard ausblendet.

Live-Updates kommen über `fs.watch` auf den Notifications-Ordner (Push nur als Auslöser); Polling alle 30 s bleibt als Sicherheitsnetz.

**Nicht enthalten:** antworten, „in der App als gelesen markieren“, den Chat in der App öffnen. Das Dashboard verändert fremde Dienste nicht (PRD Prinzip 1), und Toast-Aktionen fremder Apps lassen sich von außen ohnehin nicht auslösen.

## User Story

Als Nutzer will ich die Nachrichten aus WhatsApp, Teams, Discord, Slack und Lark gesammelt pro Chat auf meinem Desktop sehen, mit Ungelesen-Zählern, die ich selbst zurücksetzen kann, damit ich auf einen Blick weiß, wer mir geschrieben hat, auch wenn ich die Windows-Benachrichtigung schon weggeklickt habe.

## Problem Statement

Messenger-Nachrichten verteilen sich auf fünf Apps. Windows-Toasts verschwinden nach wenigen Sekunden, und im Info-Center steht jeder Toast einzeln, ohne Bezug zum Chat. Die Android-App löst das schon mit kumulierten Chats; unter Windows gibt es das noch nicht.

## Solution Statement

- **Lesen:** `wpn.ts` öffnet die Datenbank mit `node:sqlite` nur lesend und joint `Notification` mit `NotificationHandler`. Ist die Datei gesperrt, kopiert es `db`, `-wal` und `-shm` in ein temporäres Verzeichnis und liest die Kopie.
- **Parsen:** `toast.ts` liest aus dem Toast-XML die `<text>`-Elemente (Titel, Text). `apps.ts` ordnet die AppUserModelID (`PrimaryId`) einer konfigurierten App zu.
- **Kumulieren:** `feed.ts` ist eine reine TypeScript-Portierung von `MessagesState`/`MessageItem` und `MessageFilter.isStatusText`. Sie ist idempotent: Derselbe Toast, zweimal gelesen, ändert nichts.
- **Speichern:** `store.ts` hält den Feed in `data/messages/<instance>.json`, atomar und unter Lock (Muster `widgets/notes/store.ts`). `collect()` liest die Toasts, merged sie unter dem Lock in den Feed und schreibt nur, wenn sich etwas geändert hat.
- **Aktionen:** `markRead`, `markAllRead`, `dismiss`, `clear`, `undo`, `mute` und `unmute` sind Collector-Aktionen, die nur den eigenen Feed ändern.
- **Push:** `subscribe()` beobachtet den Notifications-Ordner und ruft `ctx.refresh()` auf, wenn sich `wpndatabase.db-wal` bzw. `wpndatabase.db` ändert.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High (eine fremde SQLite-Datenbank mit unklarer Belegung von `Group`/`Tag`, Merge-Logik, Push per File-Watch)
**Primary Systems Affected**: `widgets/messenger/` (neu), `scripts/record-wpn.ts` (neu), `dashboard.config.example.json`, `README.md`, `PRD.md`, `.agents/reference/widgets.md`
**Dependencies**: keine neuen npm-Pakete; `node:sqlite` (in Node 24.12 vorhanden, gibt eine `ExperimentalWarning` aus)

---

## CONTEXT REFERENCES

### Relevant Codebase Files – VOR DER UMSETZUNG LESEN

**Projekt-Regeln:**
- `CLAUDE.md`
- `.agents/reference/widgets.md`: besonders Regel 3 (Systemaufrufe messen), 5 (Teilausfälle), 8 (Push nur als Auslöser), 11 (Aktionen) und der Abschnitt Tests (anonymisierte Fixtures)
- `.agents/reference/security.md`: Regel 5 (fremde Daten nur als Text), Regel 4 (keine fremden URLs bzw. Protokolle öffnen)
- `.agents/reference/testing.md`

**Vertrag und Kern:**
- `shared/widget-contract.ts`:
  - Z. 14–43: `WidgetManifest`
  - Z. 45–52: `CollectContext` mit `instance`
  - Z. 54–63: `SubscribeContext`
  - Z. 65–78: `WidgetCollector.actions`
  - Z. 80–85: `defineManifest`/`defineCollector`
- `server/scheduler.ts` Z. 229–252: `action()`. Ruft die Aktion auf, wartet auf einen laufenden Poll und gibt dann `run(r)` zurück. Fehler der Aktion gehen an die Route, der Widget-Status bleibt unverändert.
- `server/lib/json-file.ts`: `readJsonFile(path, schema)` (null bei ENOENT, wirft bei kaputtem JSON), `writeJsonFileAtomic`, `withLock(key, fn)`
- `server/http.ts`: `HttpError`, `notFound(what)`
- `server/env.ts` Z. 12–22: `config.dataDir` (= `<root>/data`, gitignored)
- `server/log.ts`: `log(scope, …)`; in Collectoren immer `ctx.log`

**Vorlagen in anderen Widgets:**
- `widgets/notes/store.ts`: **direkte Vorlage** für `store.ts`:
  - `Clock`, `notesFile()` mit kebab-case-Prüfung der Instanz
  - `mutateNotes()`: Lock → laden → kaputt = 409 → ändern → atomar schreiben
- `widgets/notes/collector.ts`: **direkte Vorlage** für die Aktionen:
  - `parseInput()` (Z. 8–12)
  - injizierbares `notesCollector(dataDir, clock)`
  - `export const collector = notesCollector(serverConfig.dataDir)`
- `widgets/notes/manifest.ts`: Action-Input-Schemas mit `z.strictObject`, Konstanten `MAX_*`
- `widgets/notes/collector.test.ts`: Aktionen über einen **echten** Scheduler und Cache, Z. 29–39 `start()`
- `widgets/notes/Widget.test.tsx` Z. 1–30: `vi.mock` von `useDashboard` (eigener UI-Helfer, erlaubt), `state()`-Helfer
- `widgets/notes/Widget.tsx` Z. 253–290: `runAction`, Undo-Leiste mit Timer, Fehleranzeige
- `widgets/mail/Widget.tsx`: Listen-Layout, `useNow()` (Z. 7–14), `relativeTime` aus `web/src/lib/time.ts`, Theme-Tokens (`text-muted`, `bg-line`, `text-fg`, `text-accent`, `text-bad`)
- `widgets/relaunch-radar/collector.ts` Z. 15–36: `subscribe()` mit `refresh()`; Fehler nur beim ersten Auftreten loggen
- `widgets/mail/manifest.ts`: Config mit Defaults und `refine` (eindeutige IDs), Hex-Farben
- `widgets/contract.test.ts` Z. 29–50: verlangt `README.md`, `fixtures/<id>.json` passend zu `manifest.data` und eine Config aus `dashboard.config.example.json`
- `dashboard.config.example.json`: Raster mit Spalten 0/3/6/9, Breite 3. `notizen` ist ein Overlay; Zeile 6 hat bei x=6 noch Platz.

**Android-Vorlage (fremdes Repo, nur lesen):** `C:\_repos\widget_dashboard\android-app\app\src\main\java\com\widgethub\widgets\messages\`
- `MessagesState.kt`: Diese Logik wird portiert.
  - `ChatLine.sameMessage`: gleicher Text, gleicher Absender und gleiche Zeit, bei `loose` ±2 min
  - `MessageItem.merge`, `after(cutoff)`, `unread(lastSeenAt)`, `latestAt`
  - `MessagesState.add`, `dismiss`, `clear`, `restore`, `mute`, `unmute`, `markRead`, `markSeen`, `capMarks`
  - `MAX_ITEMS = 50`, `MAX_LINES = 10`, `MAX_DISMISSED = 200`
- `MessageFilter.kt`: `StatusTexts` und `isStatusText()` (Trim, Auslassungspunkte am Ende entfernen, lowercase)
- **Nicht** portieren: `ChatActions.kt` (Antworten), `withReply`, `openIntent`, den `fromMe`-Pfad und `MessageListenerService.kt`, weil es ein Android-API ist.

### New Files to Create

```
scripts/record-wpn.ts                  # zeichnet anonymisierte Fixtures + Schema aus der echten DB auf (Task 0)
widgets/messenger/manifest.ts          # Config (Apps, Limits), Payload-Schema, Action-Inputs
widgets/messenger/apps.ts              # DEFAULT_APPS, matchApp(primaryId, apps) – rein
widgets/messenger/apps.test.ts
widgets/messenger/toast.ts             # parseToast(xml) → { title, body } – rein, ohne DOM
widgets/messenger/toast.test.ts
widgets/messenger/feed.ts              # Portierung MessagesState: merge/add/dismiss/clear/undo/mute/… – rein
widgets/messenger/feed.test.ts
widgets/messenger/wpn.ts               # readToasts(dbPath, opts) über node:sqlite, Kopie bei Sperre (server-only)
widgets/messenger/wpn.test.ts
widgets/messenger/store.ts             # data/messages/<instance>.json laden/mutieren (server-only)
widgets/messenger/collect.ts           # collectMessenger(deps) – injizierbarer Kern
widgets/messenger/collect.test.ts
widgets/messenger/collector.ts         # dünner Wrapper: collect, subscribe (fs.watch), actions
widgets/messenger/collector.test.ts    # Aktionen + Watch über einen echten Scheduler
widgets/messenger/Widget.tsx
widgets/messenger/Widget.test.tsx
widgets/messenger/README.md
widgets/messenger/fixtures/wpn-schema.sql   # echtes CREATE-TABLE-Schema der zwei Tabellen (keine Daten)
widgets/messenger/fixtures/wpn-rows.json    # aufgezeichnete, anonymisierte Toast-Zeilen
widgets/messenger/fixtures/messenger.json   # erwartete Payload (UPDATE_FIXTURES)
```

`*.db` ist gitignored. Test-Datenbanken werden deshalb zur Laufzeit in einem Temp-Ordner aus `wpn-schema.sql` und `wpn-rows.json` gebaut, nie eingecheckt.

### Relevant Documentation – VOR DER UMSETZUNG LESEN

- [Node.js `node:sqlite`](https://nodejs.org/api/sqlite.html)
  - `new DatabaseSync(path, { readOnly: true })`: wirft, wenn die Datei fehlt
  - `StatementSync#setReadBigInts(true)`: **Pflicht** für `ArrivalTime`, sonst Präzisionsverlust (siehe Gotchas)
  - `db.close()`
  - Fehler tragen `code: 'ERR_SQLITE_ERROR'`, `errcode` (SQLite-Code) und `errstr`.
- [Velociraptor: Windows.Forensics.NotificationsDatabase](https://docs.velociraptor.app/exchange/artifacts/pages/windows.forensics.notificationsdatabase): Referenz-Query auf `Notification` ⨝ `NotificationHandler` (`RecordId = HandlerId`), Spalten `Payload`, `Tag`, `Group`, `Type`, `ArrivalTime`/`ExpiryTime` (FILETIME), `PrimaryId`
- [Plaso: windows_push_notification parser](https://plaso.readthedocs.io/en/stable/_modules/plaso/parsers/sqlite_plugins/windows_push_notification.html): zweite Quelle für Tabellen und Zeitfelder
- [Toast-Schema (`<toast>`, `<binding template="ToastGeneric">`, `<text>`, `placement="attribution"`)](https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/adaptive-interactive-toasts): welche `<text>`-Elemente Titel und Text sind
- [Node `fs.watch`](https://nodejs.org/api/fs.html#fswatchfilename-options-listener): `signal`-Option, `filename` kann `null` sein, `error`-Event

### Patterns to Follow

**Action-Input parsen** (aus `widgets/notes/collector.ts`):
```ts
function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
  return parsed.data;
}
```
Diesen Helfer nicht ein drittes Mal kopieren: nach `server/lib/action-input.ts` (`parseActionInput`) herausziehen und in `widgets/notes/collector.ts` mitbenutzen (Task 1).

**Datei-Mutation unter Lock** (aus `widgets/notes/store.ts`):
```ts
export function mutateNotes<T>(file: string, fn: (notes: Note[]) => { notes: Note[]; result: T }): Promise<T> {
  return withLock(file, async () => {
    let notes: Note[];
    try { notes = await loadNotes(file); }
    catch (err) { throw new HttpError(409, `${err instanceof Error ? err.message : String(err)} – Datei reparieren oder entfernen`); }
    const next = fn(notes);
    await writeJsonFileAtomic(file, { version: 1, notes: next.notes });
    return next.result;
  });
}
```

**Logging:** Nur Zähler und IDs, **nie** Titel, Absender oder Nachrichtentext. Auch nicht in Fehlermeldungen: Ein Parse-Fehler meldet die Toast-`Id`, nicht das XML.
```ts
ctx.log(`${added} neue Nachrichten in ${chats} Chats`);
```

**Naming:**
- Widget-ID `messenger`, UI-Titel „Nachrichten“, Datenordner `data/messages/`
- App-IDs kebab-case: `whatsapp`, `teams`, `discord`, `slack`, `lark`
- UI-Texte deutsch, Code-Kommentare englisch

**Darstellung:** Nur Text (`{line.text}`, `whitespace-pre-wrap`, `truncate`/`line-clamp-2`), kein `dangerouslySetInnerHTML`.

---

## DESIGN-ENTSCHEIDUNGEN

1. **Datenbank lesen (`wpn.ts`)**
   - Query (Spaltennamen in Task 0 gegen das echte Schema prüfen):
     ```sql
     SELECT n.Id AS id, h.PrimaryId AS primaryId, n.Tag AS tag, n."Group" AS grp,
            n.ArrivalTime AS arrival, n.Payload AS payload
     FROM Notification n JOIN NotificationHandler h ON h.RecordId = n.HandlerId
     WHERE n.Type = 'toast'
     ORDER BY n.ArrivalTime DESC LIMIT 300
     ```
     `Group` ist ein SQL-Schlüsselwort und muss in Anführungszeichen stehen.
   - `stmt.setReadBigInts(true)`. FILETIME (100-ns-Schritte seit 1601) wird zu Epoch-ms: `Number(arrival / 10_000n - 11_644_473_600_000n)`. `id` wird zu `Number(id)`.
   - `Payload` ist ein BLOB (`Uint8Array`) oder TEXT. Dekodieren mit `new TextDecoder("utf-8")`, BOM entfernen. Wenn Task 0 UTF-16 zeigt: an den Bytes `FF FE` erkennen und `utf-16le` nehmen.
   - **Sperre:** Öffnen bzw. Query wirft mit `errcode` ∈ {5 BUSY, 6 LOCKED, 14 CANTOPEN} oder einer Meldung `/locked|busy/i`. Dann:
     1. `mkdtemp(join(tmpdir(), "wd-wpn-"))`
     2. `wpndatabase.db` und die vorhandenen `-wal`/`-shm` kopieren. **Ohne `-wal` fehlen die neuesten Toasts.**
     3. die Kopie lesen und das Temp-Verzeichnis in `finally` löschen
   - Rückgabe `{ toasts: RawToast[], copied: boolean }`.
   - Fehlt die Datei: `Error("Benachrichtigungsdatenbank nicht gefunden: <pfad>")`. Der Pfad ist erlaubt, Inhalte nicht.
   - `DatabaseSync` ist synchron und blockiert den Event-Loop. Task 0 misst; Ziel < 100 ms. Liegt der Wert darüber, das Lesen per `worker_threads` auslagern (dann im Plan nachtragen).

2. **Toast parsen (`toast.ts`)**, rein und ohne DOMParser, weil die Datei auch im Server läuft:
   - `<text …>…</text>` per Regex sammeln. Elemente mit `placement="attribution"` überspringen, leere Elemente ebenso. Self-closing `<text/>` = leer.
   - Entities dekodieren (`&lt; &gt; &amp; &quot; &apos; &#NN; &#xHH;`), CDATA auspacken.
   - Erstes Element = `title`, die übrigen mit `\n` verbunden = `body`.
   - `null`, wenn es keinen `body` gibt (dann ist es keine Nachricht).
   - Keine Tags rendern, kein HTML: Das Ergebnis ist reiner Text.

3. **App-Zuordnung (`apps.ts`)**
   - Config `apps: [{ id, label, match, color?, chatKey }]`; `match` ist eine Teilzeichenkette der `PrimaryId`, ohne Beachtung der Groß- und Kleinschreibung. Ohne Angabe gilt `DEFAULT_APPS`.
   - Erwartete `PrimaryId`s, **in Task 0 an echten Daten bestätigen:**

     | App | Erwartete `PrimaryId` | `match` |
     |---|---|---|
     | WhatsApp Desktop | `5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App` | `whatsapp` |
     | Teams (neu) | `MSTeams_8wekyb3d8bbwe!MSTeams` | `teams` |
     | Teams (classic) | `com.squirrel.Teams.Teams` | `teams` |
     | Discord | `com.squirrel.Discord.Discord` | `discord` |
     | Slack | `com.squirrel.slack.slack` | `slack` |
     | Lark/Feishu | unbekannt | `lark` bzw. `feishu` |
   - Toasts aller anderen Apps werden ignoriert. Sie werden gar nicht erst geparst; das spart Zeit und hält fremde Inhalte draußen.

4. **Chat-Schlüssel**
   - `key = "<appId>:<wert>"`. Der Wert kommt aus `app.chatKey`:
     - `"title"` (Default): Chatname bzw. Absender aus dem ersten `<text>`
     - `"group"`: Toast-`Group`
     - `"tag"`: Toast-`Tag`
   - Ist das gewählte Feld leer, gilt der Titel als Fallback, danach `"(ohne Titel)"`.
   - **Task 0 entscheidet den Default pro App** anhand der aufgezeichneten Zeilen: Ist `Group` pro Chat stabil und zwischen Chats verschieden, nimm `"group"`, sonst `"title"`. Die Entscheidung kommt in `DEFAULT_APPS` und in die README.
   - Der Schlüssel enthält Chatnamen. Er bleibt lokal (`data/`, `/api` nur auf localhost) und wird nicht geloggt.

5. **Feed-Modell (`feed.ts`)**, Portierung von `MessagesState.kt`:
   ```ts
   Line = { id: string /* "wpn:<Notification.Id>" */, text: string, at: number /* epoch ms */ }
   Chat = { key, app /* appId */, title, lines: Line[] /* älteste zuerst, ≤ MAX_LINES */, readAt: number }
   Feed = { version: 1, chats: Chat[] /* neueste zuerst, ≤ MAX_CHATS */, lastSeenAt: number,
            dismissed: Record<string, number> /* key → latestAt, ≤ MAX_DISMISSED */,
            mutedApps: string[] /* appIds */, undo: Undo | null }
   Undo = { kind: "dismiss" | "clear" | "mute", chats: Chat[], app?: string, at: number }
   ```
   - **`addToasts(feed, items, now)`** gruppiert die eingehenden Toasts pro `key`. Je Chat:
     1. App stummgeschaltet → überspringen
     2. Cutoff `dismissed[key]`: nur Zeilen mit `at > cutoff` (`after()`)
     3. Merge mit dem bestehenden Chat
   - **Merge ist idempotent.** Duplikat = gleiche `id` **oder** gleicher Text mit |Δat| ≤ 2 min (`sameMessage` mit `loose`, als Schutz gegen Re-Posts). Danach nach `at` sortieren und `takeLast(MAX_LINES)`.
   - Chats nach `latestAt` absteigend sortieren und auf `MAX_CHATS` kürzen. Ein Toast eines herausgefallenen alten Chats, der noch in der DB steht, legt ihn bei jedem Collect neu an und fällt sofort wieder heraus. Das ist stabil, weil er älter ist; dafür gibt es einen Test.
   - **Statusfilter:** `isStatusText(body)` mit der Liste aus `MessageFilter.StatusTexts`, ergänzt um `config.ignoreTexts` (lowercase, ganze Zeichenkette). Leerer `body` → kein Eintrag.
   - **Ungelesen** pro Chat: Zeilen mit `at > max(lastSeenAt, chat.readAt)`. Beim ersten Start ist `lastSeenAt = 0`; was im Info-Center steht, zählt als ungelesen.
   - **Aktionen auf dem Feed** (alle rein, mit `now` als Parameter):
     - `markRead(key)` → `readAt = now`
     - `markAllRead()` → `lastSeenAt = now`
     - `dismiss(key)` → Chat entfernen, `dismissed[key] = latestAt`, `undo = { kind: "dismiss", chats: [chat], at: now }`
     - `clear()` → alle Chats, entsprechend `dismissed` und `undo`
     - `mute(app)` → App in `mutedApps`, ihre Chats entfernen, `undo = { kind: "mute", app, chats }`
     - `unmute(app)` → App aus `mutedApps`. Ihre Toasts, die noch in der DB stehen, kommen beim nächsten Collect zurück.
     - `undo()` → nur wenn `undo` existiert und `now - undo.at ≤ UNDO_MS` (5 min); sonst 409 „Nichts rückgängig zu machen“. Danach:
       - die Chats zurückholen und mit dem aktuellen Stand mergen (`restore`)
       - ihre `dismissed`-Marken löschen, bei `kind: "mute"` die App wieder freigeben
       - `undo = null`
   - **`undo` hält der Server, nicht der Browser.** Die Android-App gibt die entfernten Items aus der UI zurück. Hier wäre das Browser-Input mit kompletten Chat-Daten; ein Server-Slot ist sicherer und einfacher.
   - **Grenzen:** `MAX_CHATS = 50`, `MAX_LINES = 10`, `MAX_DISMISSED = 200` (`capMarks` behält die neuesten), `MAX_TEXT = 2000` Zeichen pro Zeile (beim Parsen kürzen).

6. **Speicher und Collect (`store.ts`, `collect.ts`)**
   - `messagesFile(dataDir, instance)` = `data/messages/<instance>.json`, mit derselben kebab-case-Prüfung wie `notesFile`.
   - `collectMessenger({ dataDir, instance, config, readToasts, now })`:
     1. `readToasts()` außerhalb des Locks
     2. Toasts zuordnen und parsen. Kaputte einzelne Toasts überspringen (widgets.md Regel 5) und am Ende **einmal** zählend loggen: „3 Toasts nicht lesbar“.
     3. unter `withLock(file)` den Feed laden (kaputt → werfen; der Scheduler macht daraus `error`), `addToasts` anwenden und **nur bei Änderung** schreiben (`JSON.stringify`-Vergleich)
     4. die Payload bauen
   - `collect` schreibt also eigene Daten. Das ist erlaubt, denn es sind Daten des Dashboards (PRD Prinzip 1, Ausnahme Notizen) – im PRD ergänzen.
   - **Fällt die DB aus** (gesperrt und Kopie scheitert, Datei fehlt): werfen. Der Scheduler zeigt `stale` mit dem letzten Stand. Der gespeicherte Feed geht dabei nicht verloren.

7. **Payload** (`manifest.data`), schon für die UI aufbereitet; die UI importiert `feed.ts` nicht:
   ```ts
   MessengerData = {
     chats: { key, app, appLabel, color, title, text /* letzte Zeile */, at /* ISO */,
              unread: number, lines: { id, text, at /* ISO */ }[] }[]   // ≤ 50
     unread: number,
     apps: { id, label, color, muted: boolean }[],
     undo: { kind: "dismiss" | "clear" | "mute", count: number } | null,   // null, wenn abgelaufen
     source: { toasts: number /* zugeordnete Toasts in der DB */, copied: boolean },
   }
   ```

8. **Push (`subscribe`)**
   - `fs.watch(dirname(dbPath), { signal })`. Bei `filename` = `wpndatabase.db-wal` oder `wpndatabase.db` → `refresh()`. Der Scheduler bündelt die Aufrufe (500 ms). Ist `filename` `null`, ebenfalls `refresh()`.
   - **Rückkopplung vermeiden:** Lesen kann `-shm` anfassen. Deshalb reagiert das Widget nicht auf `-shm`, und Task 0 prüft, dass ein Lesevorgang kein `-wal`-Event auslöst. Löst er doch eins aus, nach jedem eigenen Lesen 2 s lang Events ignorieren (Zeitstempel im Modul).
   - Einen `error`-Listener auf dem Watcher registrieren; nur das erste Auftreten loggen. Kann `watch` nicht starten (Ordner fehlt), bleibt das Polling.
   - `intervalMs: 30_000` als Sicherheitsnetz, `timeoutMs: 10_000`.

9. **Config** (`dashboard.config.json`, nicht geheim):
   ```ts
   MessengerConfig = {
     dbPath?: string,                 // Default: %LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db
     apps: App[] = DEFAULT_APPS,      // refine: eindeutige ids
     ignoreTexts: string[] = [],
   }
   ```
   - Ohne `LOCALAPPDATA` und ohne `dbPath` wirft `collect` „LOCALAPPDATA nicht gesetzt – dbPath angeben“.
   - **Kein** `manifest.env`: Ohne diese Variable läuft Windows praktisch nie.

10. **UI (`Widget.tsx`)**
    - **Kopf:** „N ungelesen“, dazu die Knöpfe „Alle gelesen“ (`markAllRead`) und „Leeren“ (`clear`).
    - **Liste der Chats:**
      - Farbpunkt der App, Titel (fett bei `unread > 0`), Ungelesen-Badge, `relativeTime(at, now)`
      - darunter die letzte Zeile mit `line-clamp-2`
      - Klick auf einen Chat klappt ihn auf, zeigt den Verlauf (alle `lines` mit Uhrzeit) und ruft `markRead` auf, wenn `unread > 0`
    - **Beim Darüberfahren:** „×“ (`dismiss`) und „App ausblenden“ (`mute`). Die Knöpfe haben `aria-label`s für die Tests.
    - **Undo-Leiste** bei `state.data.undo`: „Chat ausgeblendet · Rückgängig“, „Alle geleert · Rückgängig“ bzw. „WhatsApp ausgeblendet · Rückgängig“ → `undo`.
    - **Fuß:** stummgeschaltete Apps als Chips, Klick → `unmute`.
    - **Leer:** „Keine Nachrichten. Es erscheint nur, was als Windows-Benachrichtigung ankommt (Fokus-Assistent aus, Benachrichtigungen der App an).“
    - Fehler aus `runAction` 8 s lang als Zeile anzeigen (Muster Notes).

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation
Daten aufzeichnen und messen (Task 0), `parseActionInput` herausziehen, Manifest und Schemas anlegen.

### Phase 2: Core Implementation
Die reinen Module `toast.ts`, `apps.ts` und `feed.ts` mit Tests, danach `wpn.ts` gegen eine echte Temp-SQLite und `store.ts`/`collect.ts`.

### Phase 3: Integration
`collector.ts` (Aktionen und Watch), `Widget.tsx`, Beispielkonfiguration und Doku.

### Phase 4: Testing & Validation
Aktionen über den echten Scheduler, UI-Tests mit jsdom, `npm run check`, manuelle Prüfung mit einer echten WhatsApp-Nachricht.

---

## STEP-BY-STEP TASKS

Alle Tasks in dieser Reihenfolge ausführen. Test- und npm-Befehle über **Bash**, nicht über PowerShell (CLAUDE.md).

### Task 0 – CREATE `scripts/record-wpn.ts` und echte Daten aufzeichnen

- **VORHER DEN NUTZER FRAGEN.** Das Skript liest die private Benachrichtigungsdatenbank. Der Auto-Mode-Klassifikator hat einen direkten Zugriff schon einmal blockiert (2026-10-22). Erst nach ausdrücklicher Zustimmung ausführen. Das Skript gibt **nur anonymisierte Daten** aus.
- **IMPLEMENT:** `tsx scripts/record-wpn.ts [--out widgets/messenger/fixtures] [--apps whatsapp,teams,discord,slack,lark]`
  1. die DB nach `os.tmpdir()` kopieren (`db`, `-wal`, `-shm`) und die Kopie lesen
  2. das Schema `SELECT sql FROM sqlite_master WHERE name IN ('Notification','NotificationHandler')` nach `wpn-schema.sql` schreiben
  3. die Zeilen der passenden Apps (`PrimaryId` per `match`), höchstens 40 pro App, **anonymisiert** nach `wpn-rows.json` schreiben:
     - `<text>`-Inhalte: der erste wird pro App zu `Kontakt N` bzw. `Gruppe N`, konsistent abgebildet (gleicher Titel → gleicher Platzhalter); weitere Texte werden zu `Nachricht N`
     - XML-Struktur und Attribute bleiben, ebenso `launch`
     - `Tag`/`Group`: konsistent auf `t1`, `g1`, … abgebildet; leer bleibt leer
     - die Zeit bleibt
     - `Id` wird neu durchnummeriert
     - `launch`-Attribute mit IDs bzw. Telefonnummern werden auf `…` gekürzt
  4. auf stdout **nur Statistik** ausgeben:
     - pro `PrimaryId`: Anzahl, Anzahl distinct Group/Tag/Titel, ob `Group` je Titel eindeutig ist
     - Encoding des Payloads (utf-8 / utf-16)
     - Laufzeit von Öffnen und Query, gemessen auf der Original-DB (nur lesend) **und** auf der Kopie
     - ob das Öffnen der Original-DB eine Sperre meldet
  5. `fs.watch` auf den Ordner während eines Lesevorgangs: Welche Dateinamen melden sich?
  6. Status-Toasts (z. B. „WhatsApp läuft im Hintergrund“) nur als **Kandidatenliste** ausgeben: Texte, die bei mehreren Titeln identisch vorkommen. Diese Texte sind keine persönlichen Inhalte, trotzdem vor dem Übernehmen prüfen.
- **ENTSCHEIDEN und im Plan bzw. in `apps.ts` festhalten:**
  - `chatKey` pro App
  - echte `match`-Werte (Lark!)
  - Encoding
  - ob ein Worker nötig ist (> 100 ms)
  - ob es eine `-shm`/`-wal`-Rückkopplung gibt
  - zusätzliche `StatusTexts`
- **GOTCHA:** Vorher eine Testnachricht an sich selbst schicken (WhatsApp „Nachricht an dich selbst“, Teams-Chat mit sich selbst), damit es Zeilen gibt. Vor dem Commit den Anonymisierungs-Grep aus widgets.md ausführen und `wpn-rows.json` selbst durchsehen.
- **VALIDATE:** `npx tsx scripts/record-wpn.ts --out widgets/messenger/fixtures && grep -c '"payload"' widgets/messenger/fixtures/wpn-rows.json`

### Task 1 – REFACTOR `server/lib/action-input.ts`

- **IMPLEMENT:** `parseActionInput(schema, input)` mit dem Code aus `widgets/notes/collector.ts` Z. 8–12. Dort durch den Import ersetzen.
- **IMPORTS:** `import { z } from "zod"; import { HttpError } from "../http";`
- **VALIDATE:** `npx vitest run widgets/notes && npm run typecheck`

### Task 2 – CREATE `widgets/messenger/manifest.ts`

- **IMPLEMENT:**
  - Konstanten `MAX_CHATS`, `MAX_LINES`, `MAX_DISMISSED`, `MAX_TEXT`, `UNDO_MS`
  - `AppId` (kebab-case-Regex wie `AccountId` in `widgets/mail/manifest.ts`)
  - `App = { id, label, match: string.min(1), color: #rrggbb default, chatKey: enum["title","group","tag"].default("title") }`
  - `MessengerConfig` (siehe Design 9, `apps.default(DEFAULT_APPS)` mit `refine` auf eindeutige IDs)
  - `MessengerData` (Design 7)
  - Action-Inputs als `z.strictObject`: `KeyIn { key: string.min(1).max(400) }`, `AppIn { app: AppId }`, `EmptyIn {}`
  - `manifest` mit `id: "messenger"`, `title: "Nachrichten"`, `category: "comms"`, `defaultSize: { w: 3, h: 3 }`, `intervalMs: 30_000`, `timeoutMs: 10_000`, `capabilities: ["fs"]`
- **GOTCHA:** `DEFAULT_APPS` steht in `apps.ts` und wird von dort importiert. `manifest.ts` darf keine Node-APIs importieren, `apps.ts` ist rein.
- **VALIDATE:** `npm run typecheck`

### Task 3 – CREATE `widgets/messenger/apps.ts` + `apps.test.ts`

- **IMPLEMENT:**
  - `DEFAULT_APPS` mit den Werten aus Task 0
  - `matchApp(primaryId, apps): App | null`: erster Treffer, Teilzeichenkette ohne Groß- und Kleinschreibung
  - `chatKeyOf(app, { title, tag, group }): string` nach Design 4
- **TEST:** alle aufgezeichneten `PrimaryId`s aus `wpn-rows.json` werden zugeordnet; fremde IDs (`Microsoft.WindowsStore_…`) → `null`; Fallback Titel bei leerem `group`; `"(ohne Titel)"`.
- **VALIDATE:** `npx vitest run widgets/messenger/apps`

### Task 4 – CREATE `widgets/messenger/toast.ts` + `toast.test.ts`

- **IMPLEMENT:** `parseToast(xml: string): { title: string; body: string } | null` nach Design 2; `body` auf `MAX_TEXT` kürzen.
- **TEST:**
  - jeder aufgezeichnete Payload aus `wpn-rows.json` ergibt `title`/`body` mit den Platzhaltern (`Kontakt 1`, `Nachricht 3`)
  - Entities `&amp;lt;b&amp;gt;` ergeben den Text `<b>`, nicht HTML
  - `placement="attribution"` wird übersprungen
  - nur ein `<text>` → `null`
  - CDATA
  - kaputtes XML ohne `<text>` → `null`, wirft nicht
- **VALIDATE:** `npx vitest run widgets/messenger/toast`

### Task 5 – CREATE `widgets/messenger/feed.ts` + `feed.test.ts`

- **IMPLEMENT:** Design 5 als reine Funktionen:
  - `emptyFeed()`, `isStatusText(text, extra)`, `addToasts(feed, items, now)`
  - `markRead`, `markAllRead`, `dismiss`, `clear`, `mute`, `unmute`, `undo`
  - `unreadOf(chat, feed)`, `latestAt(chat)`
  - `toPayload(feed, apps, source, now)`
  - Eingangstyp `FeedItem = { id: string; app: string; key: string; title: string; text: string; at: number }`
  - Unbekannter `key`/`app` → `notFound("Chat")` / `notFound("App")`; `undo` ohne Slot → `HttpError(409, "Nichts rückgängig zu machen")`
- **PATTERN:** `MessagesState.kt` (`add`, `merge`, `after`, `restore`, `capMarks`); Kommentare sinngemäß übernehmen.
- **GOTCHA:** `feed.ts` importiert `HttpError` aus `server/http.ts`. Das ist erlaubt, weil `feed.ts` nur der Server nutzt. `Widget.tsx` darf `feed.ts` **nicht** importieren.
- **TEST** (Tabelle der Fälle):
  - zwei Toasts desselben Chats → ein Chat mit 2 Zeilen, `text` = neueste
  - derselbe Toast zweimal (gleiche `id`) → unverändert, auch `===`-gleiches JSON (idempotent)
  - gleicher Text, andere `id`, Δ 30 s → Duplikat; Δ 5 min → neue Zeile
  - 12 Toasts → 10 Zeilen, die neuesten
  - 51 Chats → 50, der älteste fällt heraus; erneutes `addToasts` mit dessen Toast ändert nichts
  - `dismiss` → Chat weg; derselbe alte Toast erneut → bleibt weg; ein neuer Toast danach → Chat nur mit der neuen Zeile
  - `clear` + `undo` → alle Chats zurück, mit inzwischen gekommenen Zeilen gemergt; `undo` nach 6 min → 409
  - `mute("whatsapp")` → WhatsApp-Chats weg, neue WhatsApp-Toasts ignoriert; `undo` → zurück und nicht mehr stumm; `unmute` → neue Toasts kommen wieder
  - Ungelesen: `markRead` setzt einen Chat auf 0, `markAllRead` alle; eine neue Zeile danach → 1
  - Statustext „Überprüfe auf neue Nachrichten…“ → kein Chat; `ignoreTexts` greift
  - `dismissed` wird auf 200 gekürzt und behält die neuesten
- **VALIDATE:** `npx vitest run widgets/messenger/feed`

### Task 6 – CREATE `widgets/messenger/wpn.ts` + `wpn.test.ts`

- **IMPLEMENT:**
  - `defaultDbPath(env)`
  - `readToasts(dbPath, { limit = 300 } = {}): Promise<{ toasts: RawToast[]; copied: boolean }>` nach Design 1, mit `RawToast = { id: number; primaryId: string; tag: string; group: string; at: number; payload: string }`
  - Öffnen und Query in einer synchronen Funktion `queryDb(path)`, `db.close()` in `finally`
  - `isLockError(err)` exportieren
- **IMPORTS:** `import { DatabaseSync } from "node:sqlite"; import { copyFile, mkdtemp, rm, access } from "node:fs/promises";`
- **GOTCHA:**
  - **`setReadBigInts(true)`**: FILETIME ≈ 1,34·10¹⁷ > 2⁵³; als `number` gelesen verliert der Wert Stellen.
  - Spalte `"Group"` in Anführungszeichen.
  - Payload kann `Uint8Array` sein.
  - Die Kopie muss `-wal` mitnehmen.
  - Das Temp-Verzeichnis wird immer gelöscht.
- **TEST** (echte SQLite im Temp-Ordner, keine Mocks):
  - Testhelfer `buildDb(dir, rows)`: `wpn-schema.sql` ausführen, Handler und Zeilen aus `wpn-rows.json` einfügen (`ArrivalTime` als BigInt, `Payload` als Buffer)
  - `readToasts` liefert alle Zeilen, absteigend nach Zeit; `at` stimmt **auf die Millisekunde** mit dem erwarteten Epoch-Wert überein
  - Typen ≠ `toast` werden ignoriert
  - **Sperre echt erzeugen:** zweite `DatabaseSync`-Verbindung, `PRAGMA journal_mode=DELETE` (vor dem Füllen), `BEGIN EXCLUSIVE` plus ein Schreibzugriff → `readToasts` liefert über die Kopie dieselben Zeilen mit `copied: true`, das Temp-Verzeichnis existiert danach nicht mehr. Klappt das Kopieren unter der Windows-Sperre nicht, `queryDb` per Parameter injizierbar machen und den ersten Aufruf einen BUSY-Fehler werfen lassen. Das ist ein Test-Double der eigenen Funktion, kein fremder Dienst.
  - fehlende Datei → wirft „nicht gefunden“
  - `isLockError` für `errcode` 5/6/14
- **VALIDATE:** `npx vitest run widgets/messenger/wpn`

### Task 7 – CREATE `widgets/messenger/store.ts`

- **IMPLEMENT:**
  - `messagesFile(dataDir, instance)`
  - `FeedFile`-zod-Schema (`version: z.literal(1)`)
  - `loadFeed(file)` (null → `emptyFeed()`)
  - `mutateFeed(file, fn, { onBroken: "throw409" | "throw" })`
    - unter `withLock`
    - schreibt nur, wenn `JSON.stringify(next) !== JSON.stringify(prev)`
    - Collect wirft bei kaputter Datei einen normalen Fehler, der zum Status `error` wird; Aktionen werfen 409
- **PATTERN:** `widgets/notes/store.ts` Z. 47–72
- **VALIDATE:** `npm run typecheck`

### Task 8 – CREATE `widgets/messenger/collect.ts` + `collect.test.ts`

- **IMPLEMENT:** `collectMessenger({ dataDir, instance, config, env, readToasts, now, log })` nach Design 6. Die Toasts in `FeedItem`s umwandeln (`matchApp` → `parseToast` → `chatKeyOf`), dann `mutateFeed` + `addToasts`, zuletzt `toPayload`.
- **TEST** (Temp-Datenordner, echte Temp-DB aus Task 6):
  - der erste Collect legt `data/messages/<instance>.json` an
  - die Zeilen werden danach aus der DB **gelöscht** (wie beim Wegklicken im Info-Center) → die Chats bleiben in der Payload
  - ein neuer Toast → wird gemergt, `unread` steigt
  - ein zweiter Collect ohne Änderung → die Datei-mtime bleibt gleich (kein Schreiben)
  - kaputte Feed-Datei → wirft, die Datei bleibt unverändert
  - ein unlesbarer Payload unter mehreren → wird übersprungen, der Rest kommt an, `log` erhält eine Zählzeile **ohne** Inhalt (prüfen: kein Platzhaltertext im Log-Argument)
  - `UPDATE_FIXTURES=1` schreibt `fixtures/messenger.json` aus diesem Test (Muster der anderen Widgets: `grep -rn UPDATE_FIXTURES widgets`)
- **VALIDATE:** `UPDATE_FIXTURES=1 npx vitest run widgets/messenger/collect && npx vitest run widgets/messenger/collect`

### Task 9 – CREATE `widgets/messenger/collector.ts` + `collector.test.ts`

- **IMPLEMENT:** `messengerCollector(dataDir, deps = { readToasts, now: Date.now })`:
  - `collect` → `collectMessenger`
  - `subscribe` → `fs.watch` nach Design 8, Cleanup über `signal`
  - `actions`: `markRead`, `markAllRead`, `dismiss`, `clear`, `undo`, `mute`, `unmute`
    - jede Aktion ruft `parseActionInput` auf, dann `mutateFeed(…, "throw409")` mit der Feed-Funktion
    - Log nur Aktion und Zähler: `log("Chat ausgeblendet")`, nie den Schlüssel, er enthält Namen
  - `export const collector = messengerCollector(serverConfig.dataDir)`
- **PATTERN:** `widgets/notes/collector.ts`, `widgets/relaunch-radar/collector.ts` Z. 15–36
- **TEST** (echter Scheduler und Cache wie `widgets/notes/collector.test.ts` Z. 29–39, Temp-DB, Temp-Datenordner):
  - `dismiss` → der Chat ist im zurückgegebenen State weg, `undo` in der Payload gesetzt; `undo` → wieder da
  - `mute` / `unmute`
  - `markRead` → `unread` 0
  - ungültige Eingabe `{ key: 1 }` bzw. zusätzliche Felder → 400
  - unbekannter Key → 404
  - Watch: ein temporärer Ordner als „Notifications“-Ordner, `dbPath` darin; eine Datei `wpndatabase.db-wal` beschreiben → innerhalb von 2 s ein neuer Collect (an `checkedAt` bzw. einem Zähler im injizierten `readToasts` erkennen). Eine Änderung an `wpndatabase.db-shm` löst nichts aus.
- **GOTCHA:** Der Watch-Test braucht echte Timer. Die Debounce-Zeit (500 ms) abwarten, mit `vi.waitFor` und Timeout 3 s.
- **VALIDATE:** `npx vitest run widgets/messenger/collector`

### Task 10 – CREATE `widgets/messenger/Widget.tsx` + `Widget.test.tsx`

- **IMPLEMENT:** Design 10. Lokaler State: `expanded: string | null`, `error`.
  - `useNow()` wie in `widgets/mail/Widget.tsx`
  - App-Farben kommen aus `state.data.apps`, sind im Schema als `#rrggbb` geprüft und dürfen deshalb in `style={{ backgroundColor }}`
- **PATTERN:** `widgets/mail/Widget.tsx` (Liste), `widgets/notes/Widget.tsx` Z. 253–290 (`runAction`, Fehler-Timer)
- **TEST** (jsdom, `vi.mock` von `useDashboard` wie `widgets/notes/Widget.test.tsx` Z. 1–30, Daten aus `fixtures/messenger.json`):
  - Titel und Text `<b>x</b>` erscheinen als Text, `container.querySelector("b")` ist `null`
  - Ungelesen-Badge und Summe im Kopf
  - Klick auf einen Chat mit `unread > 0` → Verlauf sichtbar, `runAction("…", "markRead", { key })`
  - „Chat ausblenden“ → `dismiss`
  - `undo` in den Daten → „Rückgängig“ ruft `undo` auf
  - „App ausblenden“ → `mute` mit der App-ID; Chip einer stummen App → `unmute`
  - leere Daten → Hinweis zu Windows-Benachrichtigungen
  - `runAction` liefert `{ ok: false, error }` → Fehlertext sichtbar
- **VALIDATE:** `npx vitest run widgets/messenger/Widget`

### Task 11 – CREATE `widgets/messenger/README.md` (deutsch)

- **Inhalt:**
  - Quelle und die Grenze „nur, was als Toast ankommt“: Fokus-Assistent, Benachrichtigungen pro App, Vorschau in WhatsApp
  - kumulierte Chats, eigener Speicher `data/messages/<instanz>.json` (löschen = alles zurücksetzen)
  - Config-Felder mit Beispiel, `DEFAULT_APPS`-Tabelle mit den in Task 0 bestätigten IDs und `chatKey`
  - neue Fixtures aufzeichnen: `npx tsx scripts/record-wpn.ts`
  - kein Antworten bzw. Öffnen und warum
- **VALIDATE:** `npx vitest run widgets/contract`

### Task 12 – UPDATE `dashboard.config.example.json`, `README.md`, `PRD.md`, `.agents/reference/widgets.md`, `CLAUDE.md`

- **`dashboard.config.example.json`:** `{ "instance": "nachrichten", "type": "messenger", "x": 6, "y": 6, "config": {} }`
- **`README.md`:** Zeile `messenger` in der Widget-Tabelle: „Chats von WhatsApp, Teams, Discord, Slack, Lark, kumuliert, Ungelesen-Zähler“, Quelle `wpndatabase.db` (nur lesend)
- **`PRD.md`:**
  - Phase 5 als umgesetzt markieren
  - in Abschnitt 4 und bei den Collector-Details „kumuliert pro Chat, eigener Speicher `data/messages/`“ ergänzen
  - Prinzip 1: Messenger-Feed als eigene Daten ergänzen
  - „Antworten“ ausdrücklich als Nicht-Ziel nennen
  - die Collector-Details um die Kopie inklusive `-wal` und den Watch-Trigger ergänzen
- **`.agents/reference/widgets.md`:** neue Regel 14 „Fremde SQLite-Datenbanken“:
  - `readOnly`
  - `setReadBigInts` bei 64-bit-Zeiten
  - bei Sperre `db` + `-wal` + `-shm` kopieren
  - nie loggen, was drinsteht
  - beim Watch nicht auf `-shm` reagieren (Rückkopplung)
- **`CLAUDE.md`:** „phases 1–3 of 7 are done“ → aktueller Stand (1–5)
- **VALIDATE:** `npx vitest run widgets/contract`

### Task 13 – Volle Validierung und manuelle Prüfung

- **VALIDATE:** `npm run check`
- Danach die manuelle Prüfung (Level 4) durchführen.

---

## TESTING STRATEGY

### Unit Tests
- Die reinen Module `toast.ts`, `apps.ts` und `feed.ts` werden gegen aufgezeichnete, anonymisierte Toasts (`wpn-rows.json`) und gegen konstruierte Fälle getestet. `feed.test.ts` ist die Spezifikation der Kumulierung; sie deckt die Android-Semantik Fall für Fall ab.

### Integration Tests
- `wpn.test.ts` und `collect.test.ts` laufen gegen eine **echte** SQLite-Datei im Temp-Ordner, gebaut aus dem echten Schema.
- `collector.test.ts` lässt die Aktionen und den Watch über den echten Scheduler und Cache laufen (wie Notes).
- Keine Mocks von `node:sqlite` oder `fs`.

### Edge Cases
- Toast wird aus der DB gelöscht → Chat bleibt
- derselbe Toast in jedem Poll → keine Änderung, kein Schreiben
- gesperrte DB → Kopie inklusive `-wal`; fehlende DB → `stale`/`error` mit Pfad, ohne Inhalte
- FILETIME-Präzision (BigInt)
- 51. Chat, 11. Zeile, 201. `dismissed`-Marke
- Re-Post einer ausgeblendeten Nachricht; neue Nachricht im ausgeblendeten Chat
- `undo` nach Ablauf, `undo` ohne Slot, zweimaliges `undo`
- stummgeschaltete App plus neue Toasts; `unmute`
- Statustexte mit „…“ bzw. „...“ am Ende
- HTML bzw. Entities in Nachrichten → nur Text
- kaputte Feed-Datei → nie überschreiben
- Aktions-Input mit zusätzlichen Feldern → 400
- Ungültige Instanz-ID als Pfad → wirft

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style
```bash
npm run typecheck
npm run lint
```

### Level 2: Unit Tests
```bash
npx vitest run widgets/messenger/toast widgets/messenger/apps widgets/messenger/feed
```

### Level 3: Integration Tests
```bash
npx vitest run widgets/messenger widgets/notes widgets/contract server
npm run check
```

### Level 4: Manual Validation
1. `npm run build && npm start`
2. Eine WhatsApp-Desktop-Nachricht an sich selbst schicken. Sie erscheint innerhalb weniger Sekunden im Widget (Watch), spätestens nach 30 s.
3. Den Toast im Windows-Info-Center wegklicken → die Nachricht bleibt im Widget.
4. Zweite Nachricht im selben Chat → derselbe Eintrag, Badge 2.
5. Chat aufklappen → Badge weg. „Chat ausblenden“ → weg, „Rückgängig“ → zurück.
6. WhatsApp stummschalten, neue Nachricht → erscheint nicht; Chip „WhatsApp“ → `unmute`.
7. Teams-Nachricht an sich selbst → eigener Chat mit Teams-Farbe.
8. Server-Log prüfen: keine Namen, keine Texte, nur Zähler.
9. UI mit den Chrome-Tools gegen `http://127.0.0.1:4700` prüfen (`/e2e-test` läuft unter nativem Windows nicht).

### Level 5: Fixture-Anonymisierung
```bash
grep -rnE "benja|192\.168\.|toolu_[A-Za-z0-9]{3}|\+49|@" widgets/messenger/fixtures
```
Darf nichts finden. Zusätzlich `wpn-rows.json` von Hand durchsehen.

---

## ACCEPTANCE CRITERIA

- [ ] Toasts von WhatsApp und Teams (selbst geschickt) erscheinen innerhalb von 30 s, mit funktionierendem Watch in wenigen Sekunden
- [ ] Ein Eintrag pro Chat mit Verlauf (≤ 10), höchstens 50 Chats, Ungelesen pro Chat und gesamt
- [ ] Im Info-Center weggeklickte Toasts bleiben im Widget
- [ ] Ausblenden, Leeren, Rückgängig (5 min), Stummschalten und Freigeben funktionieren und überleben einen Neustart
- [ ] Statuszeilen erscheinen nicht
- [ ] Die DB wird nur lesend geöffnet; bei Sperre wird die Kopie inklusive `-wal` gelesen, das Temp-Verzeichnis danach gelöscht
- [ ] Kein Nachrichtentext, Titel oder Chat-Schlüssel im Log
- [ ] Alle fremden Texte werden nur als Text gerendert
- [ ] `npm run check` grün; Fixtures anonymisiert
- [ ] README, PRD, `widgets.md` und CLAUDE.md aktualisiert

---

## COMPLETION CHECKLIST

- [ ] Task 0 mit Zustimmung des Nutzers ausgeführt, Entscheidungen festgehalten
- [ ] Alle Tasks in Reihenfolge erledigt, jede Validierung direkt danach grün
- [ ] `npm run check` grün
- [ ] Manuelle Prüfung (Level 4) bestanden
- [ ] Anonymisierungs-Grep leer

---

## NOTES

- **Warum eigener Speicher statt nur DB:** Windows behält Toasts nur bis zum Wegklicken bzw. Ablauf. Ohne eigenen Feed wäre „kumuliert“ nur das, was gerade im Info-Center steht.
- **Warum Server-Undo:** Die Android-App gibt die entfernten Items aus der UI zurück (`restore(items)`). Hier wären das komplette Chat-Daten als Browser-Input. Ein einzelner Undo-Slot auf dem Server ist sicherer und genügt für „Rückgängig“ direkt nach der Aktion.
- **Aufbewahrung:** Wie in der Android-App gibt es nur die Obergrenzen (50 Chats × 10 Zeilen). Ein Alterslimit (z. B. 14 Tage) ist eine mögliche Ergänzung, falls alte Chats stören.
- **Gruppenchats:** Ob WhatsApp bzw. Teams den Absender im Gruppenchat als eigenes `<text>` oder als „Name: Text“ liefern, zeigt erst Task 0. v1 zeigt den Text so, wie er im Toast steht; eine eigene `sender`-Spalte kommt erst, wenn die Aufzeichnung das klar hergibt.
- **Öffnen in der App** (`launch`-Attribut, Protokolle wie `whatsapp:`) bleibt draußen. Die Security-Regel erlaubt nur http(s), und eine Freigabe für App-Protokolle wäre eine eigene Entscheidung.
- **Phase 6 (KI-Snapshot):** Messenger-Texte gehen dort nur gekürzt auf 80 Zeichen hinein (PRD). Der Feed ist dafür schon pro Chat aufbereitet.
- **Risiko Schema-Änderung durch Windows-Updates:** Das aufgezeichnete Schema und die Fixture-Tests machen eine Änderung sichtbar. Die Kachel zeigt dann `stale` bzw. `error` statt einer leeren Liste.

**Confidence Score: 7/10.** Die Unsicherheit liegt fast ganz in Task 0: wie `Group`/`Tag` bei den einzelnen Apps belegt sind, die echte Lark-ID, das Encoding und eine mögliche Watch-Rückkopplung. Die übrige Logik ist eine Portierung bekannter Semantik auf bestehende Muster.
