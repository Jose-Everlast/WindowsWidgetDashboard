# Widgets & Collectors

Laden, wenn ein Widget angelegt oder geändert wird. Den Vertrag selbst definiert `shared/widget-contract.ts`, das Anlegen übernimmt `npm run new-widget <id> [--view …]`.

## Aufbau

- `widgets/<id>/`: `manifest.ts` (rein, auch im Browser importiert), `collector.ts` (nur Server), optional `Widget.tsx` (nur Web), `README.md`, `fixtures/<id>.json`
- `manifest.ts` und `Widget.tsx` importieren **keine** Node-APIs und keine Server-Bibliotheken. Gemeinsame reine Helfer liegen in einer eigenen Datei, z. B. `parse.ts`.
- Ohne `Widget.tsx` muss die Payload eine `WidgetView` sein; der Hub rendert sie generisch.

## Collector-Regeln

1. **Echte Daten oder werfen.** Keine Platzhalter- oder Mock-Daten im Laufzeitcode. Fehlt eine Konfiguration, gehört die Variable in `manifest.env`, dann zeigt die Kachel `unconfigured`.
2. **`signal` weiterreichen** (`fetch(url, { signal })`), wo die Bibliothek es kann. Bibliotheken ohne Signal (rss-parser, systeminformation) sind erlaubt: Der Scheduler bricht nach `timeoutMs` ab und startet keinen neuen Lauf, solange der alte noch hängt.
3. **Jeden Systemaufruf vor der Nutzung messen.** Auf dem Zielrechner brauchen WMI- bzw. CIM-Aufrufe teils über 90 s: `si.mem()`, `Get-NetTCPConnection`. Bevorzugt werden Node-`os`-APIs und schnelle Kommandos wie `netstat -ano` oder `tasklist /fo csv`. Langsames (> 1 s) wird im Modul gecacht, so wie `fsSize` in `widgets/system/collector.ts`.
4. **Nur JSON-serialisierbare Payloads** (kein BigInt, keine Zyklen, kein `Date`, sondern ISO-Strings). Der Scheduler lehnt anderes mit `error` ab.
5. **Teilausfälle tolerieren.** Das gilt für mehrere Quellen (`Promise.allSettled`, siehe `widgets/news/collector.ts`) **und** für viele Einträge einer Quelle: Ordner, Dateien, Feeds werden einzeln mit try/catch bzw. `allSettled` verarbeitet. Ein kaputter Eintrag (ENOTDIR, EACCES, Datei zwischen `stat` und `open` gelöscht) wird übersprungen und geloggt, er bringt nie das ganze Widget zum Scheitern. Hilfsdaten wie Zähler sind optional (`null`), wenn ihre Quelle ausfällt (siehe `widgets/agents/collect.ts`). Geworfen wird erst, wenn die Kernaussage des Widgets nicht mehr möglich ist.
6. **Datumsangaben in lokaler Zeit nie in 24-h-Schritten berechnen**, immer in Kalendertagen (`new Date(y, m, d - i)`). Wegen der Zeitumstellung haben Tage 23 oder 25 Stunden (siehe `codexDateDirs` in `widgets/agents/parse.ts`).
7. **Geteilte Systemaufrufe** (z. B. `tasklist` für mehrere Widgets) laufen über `sharedCall` aus `server/lib/win.ts`. So bricht der Abbruch eines Aufrufers nicht die anderen ab, und Fehler werden nicht gecacht.
8. **Push nur als Auslöser.** Wer Live-Updates braucht, implementiert `subscribe(ctx)` und ruft bei Änderungen nur `ctx.refresh()` auf. Daten werden nie per Push übergeben, sie kommen immer über `collect()`, damit Prüfung, Timeout und Statuslogik nur einmal existieren. Ein sinnvolles `intervalMs` bleibt als Sicherheitsnetz. SSE-Quellen nutzen `subscribeSSE` aus `server/lib/sse.ts` (wirft nie, verbindet sich selbst neu). Fehler werden nur beim ersten Auftreten nach einer funktionierenden Verbindung geloggt, nicht bei jedem Retry. Testserver für SSE müssen `res.flushHeaders()` aufrufen, wenn sie beim Verbinden nichts senden, sonst wartet `fetch` ewig auf die Header.
9. **Mehrere Konten bzw. Teilquellen in einer Instanz** (Muster `widgets/mail/collect.ts`):
   - Jede Teilquelle bekommt ihren eigenen Status in der Payload (`ok | unconfigured | error`, mit Grund und optional einem Login-Link).
   - `manifest.env` nur für Variablen, ohne die **gar nichts** geht; sonst würde ein fehlendes Konto die ganze Kachel lahmlegen.
   - Geworfen wird erst, wenn alle eingerichteten Teilquellen scheitern.
10. **Netzwerk-Clients ohne `AbortSignal`** (z. B. imapflow): bei `signal.abort` die Verbindung hart schließen, einen `error`-Listener registrieren (ein unbehandeltes `error`-Event beendet den Prozess) und knappe eigene Timeouts setzen statt der Bibliotheks-Defaults.
11. **Aktionen** (`collector.actions`, Muster `widgets/notes/collector.ts`):
   - Die Eingabe kommt aus dem Browser: mit `z.strictObject` prüfen, Fehler als `HttpError(400, z.prettifyError(...))`.
   - Schreiben nur atomar und unter einem Lock pro Datei (`server/lib/json-file.ts`: `writeJsonFileAtomic`, `withLock`). Eine kaputte Datei wird nie überschrieben.
   - Die Aktion liefert keine Daten an die UI; der Scheduler sammelt danach neu (`scheduler.action`), so laufen Prüfung, Cache und SSE wie bei jedem Poll.
   - Pro Instanz eigene Dateien über `ctx.instance` (z. B. `data/notes/<instance>.json`).
12. **Overlay-Widgets** (`manifest.overlay: true`, z. B. `widgets/notes`): kein Rahmen, kein Rasterplatz; `Widget.tsx` ist Pflicht (Vertragstest) und rendert selbst eine `fixed`-Ebene mit `pointer-events-none`, nur die eigenen Elemente bekommen `pointer-events-auto`.

## Tests

- `fixtures/<id>.json` ist Pflicht und wird von `widgets/contract.test.ts` gegen `manifest.data` geprüft.
- Parser werden gegen **aufgezeichnete echte** Antworten getestet (`fixtures/*.xml`, `forecast.json`). Aktualisieren mit `UPDATE_FIXTURES=1 npx vitest run widgets/<id>`.
- **Fixtures sind echt, aber anonymisiert.** Die Struktur bleibt, persönliche Werte werden ersetzt:
  - Benutzernamen, private Pfade und Repo-URLs
  - Namen, die aus Prompts abgeleitet sind (z. B. `slug`), Session-, Tool- und Commit-IDs (Platzhalter `00000000-…`)
  - LAN-IPs (Dokumentationsbereich `192.0.2.x`)
  - Nachrichteninhalte (`"…"`)

  Prüfung vor dem Commit: `grep -rnE "<username>|192\.168\.|toolu_[A-Za-z0-9]{3}" widgets/*/fixtures server/lib/fixtures` darf nichts finden.
- Netzwerkpfade testest du gegen einen echten lokalen `node:http`-Server, nicht gegen gemockte Module (siehe `widgets/external/collector.test.ts`, `widgets/news/collector.test.ts`).
