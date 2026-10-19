# external – Widgets ohne Code

Zeigt beliebige Daten an, die ein anderes lokales Projekt als **WidgetView-JSON** bereitstellt, entweder über HTTP oder als Datei. Im Dashboard selbst ist dafür kein Code nötig, nur ein Eintrag in `dashboard.config.json`.

## Einbinden

```json
{ "instance": "factory", "type": "external", "x": 6, "y": 0, "w": 3, "h": 2,
  "title": "App Factory", "intervalMs": 30000,
  "config": { "url": "http://127.0.0.1:3001/dashboard-widget.json" } }
```

Statt `url` geht auch `"file": "C:\\_repos\\mein-projekt\\status.json"`. Relative Pfade gelten ab dem Dashboard-Repo.

Ungültiges JSON zeigt die Kachel als Fehler mit Begründung an. Die übrigen Widgets laufen weiter.

## Format (`WidgetView`, siehe `shared/widget-contract.ts`)

```json
{ "view": "stat", "items": [{ "label": "Leads", "value": 178, "unit": "", "trend": "up", "tone": "good" }] }
{ "view": "list", "items": [{ "title": "Mockup gebaut", "subtitle": "faul-de", "meta": "08:15", "url": "https://..." }] }
{ "view": "progress", "items": [{ "label": "Queue", "percent": 40, "caption": "2 von 5" }] }
{ "view": "status", "items": [{ "label": "Autopilot", "state": "ok", "detail": "läuft" }] }
{ "view": "markdown", "text": "Freitext, wird als Text mit Zeilenumbrüchen angezeigt" }
```

Für `tone` gilt `neutral | good | warn | bad`, für `state` gilt `ok | warn | error | idle`. URLs müssen mit http(s) beginnen.
