# ntfy – Push-Nachrichten aus ntfy-Topics

Zeigt die neuesten Nachrichten aus einem oder mehreren [ntfy](https://ntfy.sh)-Topics, die neuesten zuerst. Ein Klick auf eine Nachricht mit `click`-URL öffnet sie im Standardbrowser. Die Farbe am Rand zeigt die Priorität (4 gelb, 5 rot, 1–2 blass). Das Widget liest nur, es sendet nie etwas.

## Konfiguration

```json
{ "instance": "ntfy", "type": "ntfy", "x": 9, "y": 9,
  "config": {
    "server": "https://ntfy.sh",
    "topics": ["mein-geheimes-topic"],
    "since": "12h",
    "max": 20
  } }
```

- `server`: Standard `https://ntfy.sh`; eigene Instanz hier eintragen.
- `topics`: feste Topics (optional). Auf ntfy.sh ist der Topic-Name das einzige Geheimnis: Wer ihn kennt, liest mit. Deshalb lange, zufällige Namen wählen. `dashboard.config.json` ist gitignored.
- `since`: Zeitraum, z. B. `12h` oder `2d`. ntfy.sh hält Nachrichten nur 12 Stunden vor.
- `max`: höchstens so viele Nachrichten (1–50).
- Geschützte Topics oder eigene Server mit Login: Access-Token als `NTFY_TOKEN` in `.env`. Öffentliche Topics brauchen keinen.

## Topics in der Kachel

Über das Eingabefeld in der Kachel kommen weitere Topics dazu (Enter oder `+`), das `×` am Topic entfernt es wieder. Diese Topics liegen in `data/ntfy/<instance>.json` (gitignored), zusammen höchstens 20. Topics aus `dashboard.config.json` sind fest und haben kein `×`. Topic-Namen werden nicht geloggt.

Aktionen (`POST /api/widgets/<instance>/actions/…`, Eingabe streng geprüft):

| Aktion | Eingabe | Fehler |
|---|---|---|
| `addTopic` | `{ "topic": "name" }` | 400 ungültiger Name, 409 schon vorhanden oder Limit erreicht |
| `removeTopic` | `{ "topic": "name" }` | 400 ungültiger Name, 409 Topic aus der Config, 404 unbekannt |
| `dismiss` | `{ "id": "ntfy-id" }` | 400 ungültige ID |
| `dismissAll` | `{ "until": "ISO-Zeit" }` | 400 keine ISO-Zeit |
| `restoreAll` | `{}` | – |

## Nachrichten ausblenden

- Das `×` an einer Nachricht (erscheint beim Darüberfahren) blendet sie aus.
- „Alle ausblenden“ blendet alles bis zur neuesten angezeigten Nachricht aus. Was danach eintrifft, bleibt sichtbar, auch wenn es zwischen Anzeige und Klick ankam.
- „N ausgeblendet · zurückholen“ holt alles wieder; das ist zugleich das Rückgängig.
- Ausgeblendet wird nur im Dashboard. ntfy und andere Abonnenten (z. B. die Handy-App) behalten die Nachricht.
- Gespeichert in `data/ntfy/<instance>.json`. Einzelne IDs werden nach 7 Tagen verworfen; ntfy.sh hält Nachrichten ohnehin nur 12 Stunden.
- Ausgeblendete Nachrichten zählen nicht gegen `max`; dafür rücken ältere nach.

## Aktualisierung

Das Widget hält eine SSE-Verbindung zu `/<topics>/sse`. Jede neue Nachricht löst sofort ein neues Abholen über `/<topics>/json?poll=1` aus. Ändert sich die Topic-Liste, verbindet sich das Widget sofort mit der neuen Liste. Zusätzlich wird alle 5 Minuten abgefragt, als Sicherheitsnetz.

## Fixtures

`poll.ndjson` ist eine echte, auf 5 Zeilen gekürzte Poll-Antwort des öffentlichen Topics `test` vom 2026-10-28; Texte, Titel und URLs sind anonymisiert. `ntfy.json` ist die daraus erzeugte Payload. Neu erzeugen mit `UPDATE_FIXTURES=1 npx vitest run widgets/ntfy`.
