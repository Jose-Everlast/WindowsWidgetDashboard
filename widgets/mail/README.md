# mail – gemeinsame Inbox aller Konten

Zeigt in einer Kachel:
- **Konto-Chips** mit Farbe und Ungelesen-Zähler. Nicht verbundene Konten zeigen „verbinden“, fehlerhafte „Fehler“ (Grund im Tooltip).
- **Die letzten Mails aller Konten gemischt** (Standard 15): Absender, Betreff, Zeit, Kontofarbe. Ungelesene sind fett.

Ein Klick öffnet die Mail im Webmail des Kontos im Standardbrowser:
- **Gmail:** die Konversation (`mail.google.com/mail/u/<adresse>/#all/<thread>`)
- **Outlook:** der `webLink` aus Graph (`outlook.live.com`)
- **IMAP:** die `webmailUrl` aus der Konfiguration

Abgefragt wird alle 2 Minuten; die Konten laufen parallel. Ein kaputtes oder nicht verbundenes Konto beeinträchtigt die anderen nicht. Nur wenn **alle** eingerichteten Konten scheitern, wird die Kachel „veraltet“ bzw. rot.

## Nur lesen, keine Mail-Texte

- **Gmail:** Scope `gmail.readonly`, nur Kopfzeilen (`format=metadata`: From, Subject, Date)
- **Outlook:** Scope `Mail.Read`, nur `from`, `subject`, `receivedDateTime`, `isRead`, `webLink`
- **IMAP:** Die Inbox wird mit `EXAMINE` geöffnet (read-only), geholt werden nur Umschlag und Flags. Nichts wird als gelesen markiert.
- **Mail-Texte** werden weder abgerufen noch gespeichert.
- **OAuth-Tokens** liegen in `data/tokens/<konto-id>.json` (gitignored). Sie werden nie geloggt und nie über `/api` ausgeliefert.

**Zähler:**
- **Gmail:** ungelesene **Konversationen** in der Inbox, wie das Webmail in der Konversationsansicht
- **Outlook:** ungelesene Mails der Inbox (`unreadItemCount`)
- **IMAP:** `UNSEEN` der Inbox

## Konfiguration

```json
{
  "instance": "mail",
  "type": "mail",
  "x": 9,
  "y": 3,
  "config": {
    "accounts": [
      { "id": "gmail-privat", "provider": "gmail", "label": "Gmail privat" },
      { "id": "gmail-agentur", "provider": "gmail", "label": "Gmail Agentur", "color": "#f472b6" },
      { "id": "outlook", "provider": "outlook", "label": "Outlook" },
      {
        "id": "imap", "provider": "imap", "label": "IMAP",
        "host": "imap.example.com", "port": 993, "user": "jose@example.com",
        "passwordEnv": "IMAP_PASSWORD", "webmailUrl": "https://webmail.example.com"
      }
    ],
    "limit": 15,
    "perAccount": 10
  }
}
```

| Feld | Bedeutung |
|---|---|
| `id` | kebab-case, eindeutig über alle Mail-Instanzen (ist der Name der Token-Datei) |
| `provider` | `gmail`, `outlook` oder `imap` |
| `color` | optional, `#rrggbb`; ohne Angabe gilt eine feste Palette |
| `host`, `port`, `user` | nur IMAP. Der Port ist standardmäßig 993 und nutzt immer TLS. |
| `passwordEnv` | nur IMAP: Name der `.env`-Variable mit dem App-Passwort (Standard `IMAP_PASSWORD`) |
| `webmailUrl` | nur IMAP, optional, `https://…`, Ziel beim Klick |
| `limit` / `perAccount` | Mails insgesamt (Standard 15) bzw. je Konto (Standard 10) |

## Einrichtung

### 1. Google (für alle Gmail-Konten zusammen)

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen, z. B. `windows-dashboard`.
2. Unter **APIs & Dienste → Bibliothek** die **Gmail API** aktivieren.
3. Den **OAuth-Zustimmungsbildschirm** (Google Auth Platform) einrichten:
   - Zielgruppe „Extern“
   - App-Name und eigene Adresse eintragen
   - unter „Datenzugriff“ den Scope `…/auth/gmail.readonly` hinzufügen
4. Den **Veröffentlichungsstatus auf „In Produktion“** setzen.
   - Im Status „Test“ laufen die Refresh-Tokens nach **7 Tagen** ab.
   - Eine Überprüfung durch Google ist für eine Person nicht nötig. Beim Verbinden erscheint „Google hat diese App nicht überprüft“; dort auf *Erweitert → Weiter zu … (unsicher)* klicken.
5. Unter **Clients** (Anmeldedaten) einen **OAuth-Client vom Typ „Desktop-App“** anlegen.
   - Client-ID und Secret in `.env` als `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` eintragen.
   - Das Secret wird nur einmal angezeigt.
   - Desktop-Clients brauchen keine Redirect-URI. Das Dashboard nutzt `http://127.0.0.1:4700/auth/google/callback`.

### 2. Microsoft (outlook.de, privates Konto)

1. Ohne Verzeichnis lassen sich keine App-Registrierungen mehr anlegen. Falls noch keins existiert: mit dem privaten Microsoft-Konto ein **kostenloses Azure-Konto** anlegen; dabei entsteht das „Standardverzeichnis“.
2. Im [Azure-Portal](https://portal.azure.com/) **App-Registrierungen → Neue Registrierung** öffnen:
   - Name frei wählbar
   - unterstützte Kontotypen: **„Nur persönliche Microsoft-Konten“**
   - Umleitungs-URI: Plattform **„Öffentlicher Client/nativ (mobil und Desktop)“**, URI `http://localhost/auth/microsoft/callback`. Den Port ignoriert Microsoft bei `localhost`, der Pfad muss exakt passen.
3. Unter **API-Berechtigungen** sicherstellen, dass **Microsoft Graph → Delegiert → `Mail.Read`** eingetragen ist (`User.Read` darf bleiben).
4. Die **Anwendungs-ID (Client)** in `.env` als `MS_CLIENT_ID` eintragen. Ein Secret gibt es nicht; es ist ein öffentlicher Client mit PKCE. `MS_TENANT=consumers` bleibt so.

### 3. IMAP

1. Beim Anbieter ein **App-Passwort** erzeugen (nicht das normale Login-Passwort).
2. In `.env` als `IMAP_PASSWORD` eintragen.
3. `host` und `user` in die Kontokonfiguration schreiben, dazu optional `webmailUrl`.

### 4. Verbinden

1. `npm start` (bzw. `npm run dev`) und das Dashboard öffnen.
2. In der Mail-Kachel beim Konto auf **„verbinden“** klicken. Der Standardbrowser öffnet die Anmeldung.
3. Anmelden und zustimmen. Bei mehreren Gmail-Konten das **jeweils passende Konto** wählen.
4. Der Browser zeigt „Verbunden: <konto>“. Die Kachel aktualisiert sich sofort.

## Fehlerbilder

| Anzeige | Ursache | Lösung |
|---|---|---|
| „nicht eingerichtet“, Tooltip „Fehlt in .env: …“ | Client-ID bzw. Passwort fehlt | `.env` ergänzen, Server neu starten |
| „verbinden“, Tooltip „Nicht verbunden“ | noch kein Token | verbinden |
| „verbinden“, Tooltip „Anmeldung abgelaufen“ | Token widerrufen, Passwort geändert, 6 Monate ungenutzt oder App im Status „Test“ | neu verbinden; bei Google den Status „In Produktion“ prüfen |
| Browser: „Kein Refresh-Token erhalten“ | Google hat für eine frühere Zustimmung keinen neuen Token geschickt | unter [myaccount.google.com/permissions](https://myaccount.google.com/permissions) den Zugriff entfernen und neu verbinden |
| „Fehler“, Tooltip „IMAP-Anmeldung fehlgeschlagen“ | falsches App-Passwort bzw. falscher User | `.env` bzw. Konfiguration prüfen |
| Browser: „Ungültiger oder abgelaufener Anmeldeversuch“ | Anmeldung älter als 10 Minuten, Server zwischendurch neu gestartet oder Link doppelt benutzt | in der Kachel erneut „verbinden“ |
