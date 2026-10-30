# core – Uhr und Systemkern im HUD-Stil

Das Herzstück des Dashboards:
- **Ring:** langsam drehende Ringe; der innere Bogen zeigt die CPU-Last (cyan), der zweite den RAM (gelb). In der Mitte stehen ein frei wählbarer Name und die CPU-Last.
- **Uhr:** groß, mit Datum. Sie tickt im Browser jede Sekunde.
- **Werte:** CPU, RAM, Kerne, Uptime, Rechnername

Die Daten kommen alle 3 s aus den Node-`os`-APIs (gemessen ≈ 0,2 ms pro Aufruf, kein WMI). Die CPU-Last ist die Differenz zweier Messungen; direkt nach dem Start steht deshalb kurz „--“.

## Konfiguration

```json
{ "instance": "core", "type": "core", "x": 3, "y": 6, "config": {} }
```

| Feld | Bedeutung |
|---|---|
| `label` | optionaler Name in der Ringmitte, höchstens 24 Zeichen; ohne Angabe steht dort nur die CPU-Last |

## Leistung

Das Wallpaper läuft rund um die Uhr. Animiert werden nur zwei Ringe per CSS-`transform` (60 s bzw. 90 s pro Umdrehung) sowie die Scan-Linie über dem ganzen Bild. Mit „Animationen reduzieren“ in Windows (`prefers-reduced-motion`) steht alles still.
