# Security: lokaler Server

Gilt für alles unter `server/` und für jeden Widget-Collector. Das Dashboard läuft nur auf localhost. „Nur localhost“ allein schützt aber nicht vor fremden Webseiten im selben Browser oder in Lively. Ab Phase 4/5 liegen Mails und Nachrichten im Cache.

## Regeln

1. **Nur an localhost binden.** `server/env.ts` (`assertLocalHost`) verweigert jeden anderen `HOST`.
2. **Host-Header prüfen (DNS-Rebinding).** `server/guard.ts` (`localGuard`) beantwortet nur `127.0.0.1:<port>`/`localhost:<port>` und den Vite-Port 5174. Neue Routen hängen automatisch dahinter. Den Guard nie umgehen, auch nicht für „harmlose“ GET-Routen.
3. **Ändernde Requests nur mit JSON und erlaubter Origin.** Jede Route unter `/api`, die kein GET ist, braucht `content-type: application/json` (sonst 415). Das erzwingt einen CORS-Preflight, und den gewähren wir nie. Eine gesetzte `Origin` muss in der erlaubten Liste stehen (sonst 403). Die UI schickt deshalb auch bei Aktionen ohne Payload `body: "{}"` mit JSON-Header.
4. **Fremde URLs nie roh an das Betriebssystem geben.** Links aus Feeds, Mails oder Nachrichten sind Angreifer-Input:
   - mit zod auf http(s) prüfen
   - nur `new URL(url).href` weitergeben
   - öffnen über `rundll32 url.dll,FileProtocolHandler`, nie über `cmd /c start` (Injection mit `&`) oder `explorer.exe` (eigene Parse-Regeln für Kommas und Switches)
5. **Kein HTML aus fremden Daten rendern.** Views stellen Text dar (`whitespace-pre-wrap`), es gibt kein `dangerouslySetInnerHTML`.
6. **Secrets nur in `.env`**, nicht in `dashboard.config.json` (die ist zwar gitignored, wird aber per `/api/layout` ausgeliefert).
7. **OAuth** (`server/auth/`, `server/routes/auth.ts`):
   - Pflicht sind PKCE S256 und ein `state`, der nur einmal gilt und nach 10 Minuten abläuft. Ein unbekannter `state` bzw. einer vom falschen Provider wird abgelehnt.
   - Callback-Antworten gehen nur als `text/plain` mit `cache-control: no-store` und `referrer-policy: no-referrer` raus, denn Code und State stehen in der URL.
   - Tokens liegen nur in `data/tokens/<konto>.json`: atomar geschrieben, Konto-ID als kebab-case geprüft (kein Path Traversal), nie geloggt, nie über `/api` ausgeliefert. Fehlermeldungen enthalten keine Request-Parameter.
   - Es gibt nur Lese-Scopes. IMAP öffnet ausschließlich per `EXAMINE` und holt nie `BODY[]`; `widgets/mail/collector.test.ts` prüft das.
   - Microsoft: beim Token-Request keinen `Origin`-Header senden (sonst gilt er als SPA-Request, mit 24-h-Tokens). Den rotierten Refresh-Token immer persistieren.

## Tests

Aktions-Eingaben (`POST /api/widgets/:instance/actions/:action`) sind Browser-Input: jede Aktion prüft ihre Eingabe strikt und hat einen Test für 400 bei ungültiger Eingabe. Aktionsnamen werden mit `Object.hasOwn` nachgeschlagen, damit `constructor` o. ä. nicht auf Prototyp-Funktionen zeigt. Die OAuth-Routen haben eigene Tests in `server/routes/auth.test.ts` (state single use, Provider-Mismatch, Text-Antworten, Host-Guard, kein SPA-Fallback). Jede neue ändernde Route bekommt in `server/app.test.ts` zwei Tests: einen für fremden Host bzw. fremde Origin (403) und einen für fehlenden JSON-Content-Type (415).
