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
5. **Teilausfälle tolerieren**, wenn es mehrere Quellen gibt: `Promise.allSettled`, Fehler loggen, erst werfen, wenn alles fehlschlägt (siehe `widgets/news/collector.ts`).

## Tests

- `fixtures/<id>.json` ist Pflicht und wird von `widgets/contract.test.ts` gegen `manifest.data` geprüft.
- Parser werden gegen **aufgezeichnete echte** Antworten getestet (`fixtures/*.xml`, `forecast.json`). Aktualisieren mit `UPDATE_FIXTURES=1 npx vitest run widgets/<id>`.
- Netzwerkpfade testest du gegen einen echten lokalen `node:http`-Server, nicht gegen gemockte Module (siehe `widgets/external/collector.test.ts`, `widgets/news/collector.test.ts`).
