# weather – Wetter über Open-Meteo

Zeigt die aktuelle Temperatur (dazu gefühlt und Wind), einen 12-Stunden-Verlauf mit Regenwahrscheinlichkeit und eine 3-Tage-Vorschau. Die Daten kommen von [Open-Meteo](https://open-meteo.com/en/docs). Einen API-Key braucht es nicht.

## Konfiguration

```json
{ "instance": "wetter", "type": "weather", "x": 0, "y": 0,
  "config": { "lat": 51.96, "lon": 7.63, "label": "Münster" } }
```

- Für mehrere Orte legst du mehrere Instanzen mit unterschiedlichen `instance`-IDs an.
- Abgefragt wird alle 10 Minuten.
- Ist Open-Meteo nicht erreichbar (z. B. HTTP 503), zeigt die Kachel die letzten Daten als `stale` mit Fehlerhinweis an.

## Fixtures

`forecast.json` ist eine echte Antwort für Münster vom 2026-10-19. `weather.json` ist die daraus erzeugte Payload. Neu erzeugen mit `UPDATE_FIXTURES=1 npx vitest run widgets/weather`.
