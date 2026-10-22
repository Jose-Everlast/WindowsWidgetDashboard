# weather – Wetter oben links (Glas-Kreis)

Nach Mockup 1, ohne Rahmen (`manifest.frameless`) und in der linken oberen Ecke:

- **Kopf:** Ort mit Pin, darunter der Zustand, rechts „H Hoch° / T Tief°“ für heute.
- **Glas-Kreis:** dunkelblaues Glas mit Glanzlicht und leuchtendem Ring. Darin das Wetter-Icon (nachts mit Mond) und die Temperatur.
- **Werte rechts daneben:** Regenrisiko heute, Wind, Luftfeuchte.
- **Innerer Bogen:** die nächsten vier Tageszeiten (Morgens 5–11, Mittags 11–17, Abends 17–22, Nachts 22–5 Uhr). Tagsüber zählt die wärmste Stunde, nachts die kälteste, beim Wetter das schlechteste.
- **Äußerer Bogen:** 5 Tage mit Tief/Hoch und Regenrisiko ab 30 %.
- **Warnungen** darunter, nur wenn etwas droht:
  - Sturmböen ab 62 km/h (Beaufort 8), Orkanböen ab 89 km/h
  - Gewitter
  - Schnee
  - Glätte: gefrierender Regen bzw. Niesel, oder höchstens 1° bei mindestens 30 % Niederschlag; nach Tagen ab ≤ 0° und 40 %

  Die nächsten 36 Stunden werden stündlich geprüft, danach nach Tagen.

Die Icons sind [Meteocons](https://github.com/basmilius/weather-icons) von Bas Milius (MIT, `@bybas/weather-icons`, Variante „fill“). Sie werden mitgebündelt; es wird nichts aus dem Internet geladen.

## Daten

[Open-Meteo](https://open-meteo.com/en/docs), ohne API-Key, alle 10 Minuten: aktuelle Werte, aktuelle Luftfeuchte, 36 Stunden (Temperatur, Regenrisiko, Wettercode, Böen) und 6 Tage (Tief/Hoch, Regenrisiko, Sonnenauf- und -untergang, maximale Böen, Schneefall).

## Konfiguration

```json
{ "instance": "wetter", "type": "weather", "x": 0, "y": 0,
  "config": { "lat": 51.96, "lon": 7.63, "label": "Münster" } }
```

Ist Open-Meteo nicht erreichbar (z. B. HTTP 503), bleiben die letzten Daten stehen.

## Fixtures

`forecast.json` ist eine echte Antwort für Münster vom 2026-10-19 (mit echten Sturmböen von 72 km/h am Freitag). `weather.json` ist die daraus erzeugte Payload. Neu erzeugen mit `UPDATE_FIXTURES=1 npx vitest run widgets/weather`.
