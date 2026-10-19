# system – CPU, RAM, Laufwerke

Zeigt die CPU-Last, den belegten Arbeitsspeicher (ohne Datei-Cache), den Füllstand der Laufwerke und die Uptime. Die Werte kommen aus [systeminformation](https://systeminformation.io/). Keys braucht es keine.

## Konfiguration

```json
{ "instance": "system", "type": "system", "x": 9, "y": 0, "config": { "drives": ["C:"] } }
```

- `drives` ist optional; ohne Angabe werden alle Laufwerke angezeigt.
- Abgefragt wird alle 5 s. Die Laufwerke werden höchstens einmal pro Minute neu gelesen, weil das auf Windows langsam ist.

## Fixtures

`system.json` ist die Ausgabe eines echten Laufs auf dem Entwicklungsrechner vom 2026-10-19.
