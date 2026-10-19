# relaunch-radar – Autopilot, Jobs und was auf dich wartet

Zeigt den Stand des lokalen Sales-Tools [relaunch-radar](../../../relaunch-radar):
- Autopilot-Status und nächster Schritt
- laufende Jobs mit ETA
- „Wartet auf dich“: Mockups bewerten, fehlgeschlagene Läufe, Limits
- die letzten Ereignisse

Ein Klick auf einen Lead oder ein Ereignis öffnet `/lead/<slug>/uebersicht` in der relaunch-radar-Oberfläche im Standardbrowser.

## Live-Modus (API erreichbar)

- **Daten:** `GET /api/overview` (nur `autopilot` und `attention`; die Lead-Liste wird nicht übertragen), `GET /api/jobs/running` und `GET /api/notifications`.
- **Live-Updates:** Das Widget abonniert `/api/notifications/stream` (Events `notify`, `autopilot`) und `/api/jobs/stream` (`start`, `end`, `queue`). Jedes dieser Ereignisse löst einen sofortigen Abruf aus; der Scheduler bündelt Ereignisse, die innerhalb von 500 ms kommen. Die vielen Log-Zeilen (`line`) lösen nichts aus.
- **Sicherheitsnetz:** Zusätzlich wird alle 30 s abgefragt.

## Dateimodus (API nicht erreichbar)

Läuft der relaunch-radar-Server nicht, liest das Widget `<dir>/logs/notifications.json` direkt und zeigt „API offline – Dateimodus“; der Grund steht im Tooltip. Autopilot, Jobs und „Wartet auf dich“ gibt es nur live. Sobald der Server wieder läuft, verbindet sich der Stream neu und das Widget wechselt innerhalb weniger Sekunden zurück in den Live-Modus.

## Konfiguration

```json
{ "instance": "relaunch-radar", "type": "relaunch-radar", "x": 6, "y": 3,
  "config": { "url": "http://127.0.0.1:3000", "dir": "C:\\_repos\\relaunch-radar",
              "attentionLimit": 5, "notificationLimit": 5 } }
```

Alle Felder sind optional, die Standardwerte stehen oben. Ein API-Key wird nicht benötigt, weil die API von relaunch-radar nur lokal läuft.

## Fixtures

Echte Antworten von relaunch-radar vom 2026-10-19, gekürzt und **anonymisiert**: Firmennamen und Slugs sind Kundendaten und wurden durch „Firma A“ / `firma-a-de` ersetzt, auch in Titeln und Pfaden.

- `jobs-running.json`: An diesem Tag lief kein Job, und die Job-Historie der API war leer. Der Eintrag ist deshalb aus einer echten Job-Logdatei (`logs/jobs/20261018-100204-mockup-create-…log`: Typ, Slug, Startzeit) gebaut, im Format von `shared/schemas/job.ts`. Der passende `autopilot.running`-Eintrag in `overview.json` ist ergänzt, damit die Zuordnung über die `jobId` getestet wird.
- `relaunch-radar.json`: die erwartete Payload, erzeugt mit `UPDATE_FIXTURES=1 npx vitest run widgets/relaunch-radar`.
