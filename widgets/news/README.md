# news – Schlagzeilen aus RSS/Atom

Holt die neuesten Einträge aus mehreren RSS- oder Atom-Feeds und zeigt sie zusammengeführt als Liste, die neuesten zuerst (höchstens 30). Ein Klick öffnet den Artikel im Standardbrowser. Die Darstellung übernimmt der generische `list`-View.

## Konfiguration

```json
{ "instance": "news", "type": "news", "x": 3, "y": 0,
  "config": {
    "feeds": [
      { "label": "tagesschau", "url": "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml" },
      { "label": "heise", "url": "https://www.heise.de/rss/heise-top-atom.xml" }
    ],
    "perFeed": 5
  } }
```

- Fällt ein Feed aus, werden die anderen trotzdem angezeigt; der Fehler steht im Server-Log.
- Fallen alle Feeds aus, geht die Kachel auf `stale` bzw. `error`.
- Abgefragt wird alle 15 Minuten.
- Keys werden nicht benötigt.

## Fixtures

`tagesschau.xml` und `heise.xml` sind echte, auf 5 Einträge gekürzte Feeds vom 2026-10-19. `news.json` ist die daraus erzeugte Payload. Neu erzeugen mit `UPDATE_FIXTURES=1 npx vitest run widgets/news`.
