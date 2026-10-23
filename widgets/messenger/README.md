# messenger – Nachrichten

Die Nachrichten von WhatsApp, Teams, Discord, Slack und Lark sowie die Mail-Benachrichtigungen von Outlook, **gesammelt pro Chat** bzw. pro Absender, wie im Nachrichten-Widget der Android-App:
- **Ein Eintrag pro Chat** mit den letzten 10 Nachrichten, höchstens 50 Chats, der neueste oben.
- **Ungelesen:** Zähler pro Chat und oben gesamt. Ein Chat gilt als gelesen, sobald man ihn aufklappt; „Alle gelesen“ setzt alle zurück.
- **Ausblenden:** „×“ blendet einen Chat aus, „Leeren“ alle, das Augen-Symbol eine ganze App. Danach ist 5 min lang „Rückgängig“ möglich. Stummgeschaltete Apps stehen unten und lassen sich dort wieder einblenden.
- Statuszeilen wie „Überprüfe auf neue Nachrichten…“ und Zähler wie „+1 neue E-Mail“ (Outlook) oder „✉ 1 ungelesene Nachricht“ (WhatsApp) erscheinen nicht.

Das gilt alles nur im Dashboard. Windows, das Info-Center und die Apps bleiben unberührt: Nichts wird in der App als gelesen markiert, und Antworten gibt es nicht.

## Quelle und Grenzen

Quelle ist die Windows-Benachrichtigungsdatenbank `%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db`. Sie wird nur lesend geöffnet; ist sie gesperrt, liest das Widget eine Kopie im Temp-Ordner, die es danach löscht.

Es erscheint nur, was als **Windows-Benachrichtigung** ankommt:
- Die Benachrichtigungen der App müssen an sein (Windows-Einstellungen → System → Benachrichtigungen), der Fokus-Assistent bzw. „Nicht stören“ aus.
- Die Desktop-App muss laufen bzw. im Hintergrund erlaubt sein.
- Zeigt eine App keine Vorschau (z. B. WhatsApp mit ausgeschalteter Nachrichtenvorschau), steht im Widget nur der Platzhaltertext der App.
- Eigene Antworten tauchen nicht auf, denn dafür gibt es keinen Toast.

Neue Nachrichten erscheinen nach wenigen Sekunden, weil das Widget den Ordner der Datenbank überwacht. Als Sicherheitsnetz liest es zusätzlich alle 30 s.

## Speicherort

`data/messages/<instanz>.json` (gitignored). Windows löscht einen Toast, sobald er im Info-Center weggeklickt wird oder abläuft; im Widget bleibt die Nachricht trotzdem, bis man sie hier ausblendet.
- **Alles zurücksetzen:** Server stoppen, Datei löschen.
- **Kaputte Datei:** Die Kachel zeigt einen Fehler, Aktionen werden abgelehnt, die Datei wird **nicht** überschrieben.

## Konfiguration

```json
{ "instance": "nachrichten", "type": "messenger", "x": 6, "y": 6, "config": {} }
```

| Feld | Bedeutung |
|---|---|
| `apps` | Welche Apps erscheinen (Standard: die Tabelle unten). Pro App `id`, `label`, `match` (Teilzeichenketten der App-ID), `color` (`#rrggbb`), `chatKey` |
| `ignoreTexts` | weitere Statustexte, die nicht erscheinen sollen (ganzer Text, Groß- und Kleinschreibung egal) |
| `dbPath` | anderer Pfad zur Datenbank (Standard unter `%LOCALAPPDATA%`) |

`chatKey` legt fest, woran zwei Toasts als derselbe Chat erkannt werden: `title` (Chat- bzw. Absendername, Standard), `group` oder `tag` (Felder des Toasts). Ist das Feld leer, gilt der Titel.

| `id` | App | `match` (in `NotificationHandler.PrimaryId`) | `chatKey` |
|---|---|---|---|
| `whatsapp` | WhatsApp Desktop | `whatsapp` | `title` |
| `teams` | Microsoft Teams (neu und classic) | `teams` | `title` |
| `discord` | Discord | `discord` | `title` |
| `slack` | Slack | `slack` | `title` |
| `lark` | Lark / Feishu | `lark`, `feishu` | `title` |
| `outlook` | Outlook (neu und classic); Titel = Absender, Text = Betreff und Vorschau | `outlookforwindows`, `microsoft.office.outlook` | `title` |

Welche App-ID eine App auf diesem Rechner hat, zeigt `npx tsx scripts/record-wpn.ts` (Liste „Toasts je PrimaryId“).

## Fixtures

`fixtures/wpn-schema.sql` ist das echte Schema der beiden Tabellen (ohne Daten); die Tests bauen daraus eine SQLite-Datei im Temp-Ordner. Neue Aufzeichnung echter Toasts, anonymisiert (Namen → „Chat N“/„Kontakt N“, Texte → „Nachricht N“, IDs und Attribute → Platzhalter):

```bash
npx tsx scripts/record-wpn.ts --out widgets/messenger/fixtures
```

Das Skript gibt nur Zählungen und Laufzeiten aus. Vor dem Commit `wpn-rows.json` trotzdem selbst durchsehen.
