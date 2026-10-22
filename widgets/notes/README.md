# notes – Post-its

Echte Zettel auf dem Desktop: Die Post-its liegen frei über dem ganzen Dashboard, nicht in einer Kachel.
- **+** in der Leiste jedes Zettels legt einen neuen daneben an (gleiche Farbe), der Cursor steht sofort darin. Ohne Zettel liegt unten rechts ein kleiner Post-it-Block zum Anklicken.
- **Verschieben:** am oberen Rand des Zettels greifen und irgendwohin ziehen. Ohne Maus geht es mit dem Griff im Fokus und den Pfeiltasten, mit Shift in großen Schritten. Die Position wird gespeichert und als Anteil der Bildschirmgröße abgelegt; bei anderer Auflösung landet der Zettel also an derselben relativen Stelle und bleibt immer ganz sichtbar.
- **Tippen:** Gespeichert wird beim Verlassen des Zettels, nach 0,8 s Tipp-Pause oder mit Strg+Enter.
- **Leiste am oberen Rand** (erscheint beim Darüberfahren): abhaken, Farbe (gelb, rosa, grün, blau), löschen.
- **Abhaken:** Der Text wird durchgestrichen und der Zettel blasser.
- **Löschen:** Es gibt keine Rückfrage, dafür 5 s lang „Rückgängig“ unten rechts; der Zettel kommt an seine alte Stelle zurück.
- Der zuletzt angefasste Zettel liegt oben.

Es gibt keine Kachel (Overlay-Widget); `x`/`y` der Instanz in der Konfiguration werden ignoriert. Höchstens 50 Zettel pro Instanz, 500 Zeichen pro Zettel.

## Speicherort

`data/notes/<instanz>.json` (gitignored). Die Datei überlebt Neustarts und wird atomar geschrieben, halbe Dateien gibt es also nicht.
- **Mehrere Instanzen** (z. B. „Heute“ und „Ideen“) haben je eine eigene Datei.
- **Kaputte Datei** (z. B. von Hand bearbeitet): Die Kachel zeigt einen Fehler, Änderungen werden abgelehnt, und die Datei wird **nicht** überschrieben. Datei reparieren oder löschen.

## Konfiguration

```json
{ "instance": "notizen", "type": "notes", "x": 0, "y": 6, "config": { "defaultColor": "yellow" } }
```

| Feld | Bedeutung |
|---|---|
| `defaultColor` | Farbe neuer Zettel: `yellow`, `pink`, `green`, `blue` (Standard `yellow`) |

## Lively

Damit man im Wallpaper tippen kann, muss Lively Tastatureingaben an das Wallpaper weiterleiten (Einstellung zur Wallpaper-Eingabe in Lively; die genaue Bezeichnung hängt von der Version ab). Geht das nicht, die Notizen im Browser unter `http://127.0.0.1:4700` bearbeiten. Das Wallpaper zeigt den Stand sofort per SSE.

## Technik

Änderungen laufen als Widget-Aktionen `add`, `update` und `remove` über `POST /api/widgets/<instanz>/actions/<aktion>`. Der Server prüft jede Eingabe strikt, schreibt die Datei und sammelt danach neu; alle offenen Ansichten erhalten den neuen Stand per SSE.
