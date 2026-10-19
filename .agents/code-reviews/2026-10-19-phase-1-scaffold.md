# Code Review: Phase 1 – Gerüst, Widget-Vertrag & Basis-Widgets

**Datum:** 2026-10-19
**Umfang:** alle nicht committeten Änderungen (Phase 1) gegen `.agents/plans/phase-1-scaffold-widget-contract.md` und PRD
**Vorgehen:** unabhängiger Reviewer (Subagent, nur lesend), jeder Befund per Skript oder Testlauf geprüft

## Stats
- Geänderte Dateien: 3 (`.env.example`, `.gitignore`, `README.md`)
- Neue Dateien: ~60 (`server/`, `shared/`, `web/`, `widgets/`, `scripts/`, Root-Configs)
- Gelöschte Dateien: 0

## Findings

### 1. DNS-Rebinding: fremde Webseiten können alle Widget-Daten lesen
- **Severity:** high
- **File:** server/app.ts:12-17
- **Issue:** Der `Host`-Header wird nicht geprüft. Eine Seite auf `evil.example`, deren DNS auf 127.0.0.1 umgebogen wird, ruft `/api/widgets` same-origin ab.
- **Why it matters:** Ab Phase 4/5 liegen dort Mails und Nachrichten.
- **Suggestion:** Middleware, die nur `Host` = `127.0.0.1:<port>`/`localhost:<port>` (plus `:5174` für den Vite-Proxy) zulässt, sonst 403.
- **Verified:** yes (`app.request` mit `Host: evil.example:4700` → 200 mit Daten)

### 2. Hängender Collector wird bei jedem Intervall erneut gestartet
- **Severity:** high
- **File:** server/scheduler.ts:67-120
- **Issue:** Nach einem Timeout wird der Lauf als beendet behandelt. Ein Collector, der `signal` ignoriert (rss-parser, systeminformation), läuft aber weiter, und der nächste Lauf startet parallel. Der Plan verlangt „kein zweiter paralleler Lauf“.
- **Why it matters:** Hängende WMI- oder PowerShell-Aufrufe im System-Widget (5-s-Intervall) stapeln sich.
- **Suggestion:** Die Instanz bleibt blockiert, bis der ursprüngliche `collect()`-Promise erledigt ist. Bis dahin wird mit „läuft noch“ übersprungen.
- **Verified:** yes (Skript: 4 parallel aktive Läufe nach 4,5 s)

### 3. Abgestürzte Widget-Kachel erholt sich nie
- **Severity:** medium
- **File:** web/src/hub/WidgetFrame.tsx:18-27
- **Issue:** `ErrorBoundary` setzt den Fehlerzustand nie zurück. Neue, gültige Daten zeigen weiter „Darstellungsfehler“ bis zu einem Seiten-Reload.
- **Suggestion:** Reset beim Wechsel eines `resetKey` (`state.updatedAt`).
- **Verified:** Code-Analyse plus React-Semantik (`getDerivedStateFromError` wird nie zurückgesetzt)

### 4. URLs aus Feeds gehen unnormalisiert an `explorer.exe`
- **Severity:** medium
- **File:** server/index.ts:13-15, server/routes/api.ts:8,57
- **Issue:** `z.url()` gibt die Rohform zurück. URLs mit `"` oder `,` bestehen die Prüfung, und `explorer.exe` hat eigene Parse-Regeln für Kommas und Switches. Feed-Links sind fremd kontrolliert.
- **Suggestion:** `new URL(url).href` weitergeben und `rundll32 url.dll,FileProtocolHandler` statt `explorer.exe` nutzen.
- **Verified:** dass zod solche Strings akzeptiert: yes. Tatsächliche Ausnutzung über explorer: unverified

### 5. Nicht serialisierbare Payload bringt den Server zum Absturz
- **Severity:** medium
- **File:** server/scheduler.ts:105-120, server/cache.ts:13
- **Issue:** Wirft `JSON.stringify` (BigInt, Zyklus), wird `run()` abgelehnt. `void p.finally(...)` macht daraus eine unhandled rejection, und Node 24 beendet sich.
- **Suggestion:** Serialisierbarkeit im Collect-Pfad prüfen (→ `error`-Outcome) und die Loop-Promises mit `.catch` absichern.
- **Verified:** yes (Skript: „UNHANDLED REJECTION: Do not know how to serialize a BigInt“)

### 6. Refresh-Action ohne CSRF-Schutz
- **Severity:** low
- **File:** server/routes/api.ts:42-46
- **Issue:** Ein Body-loser Cross-Site-POST ist ein „simple request“. Jede Webseite kann so Collectors in Schleife auslösen (Rate-Limits von Open-Meteo, PowerShell-Spawns).
- **Suggestion:** Für alle ändernden `/api`-Requests denselben Content-Type- und Origin-Schutz wie bei `/api/open`.
- **Verified:** yes (POST mit `Origin: https://evil.example` → 200)

### 7. Refresh im Offline-Zustand erzeugt eine unhandled rejection im Browser
- **Severity:** low
- **File:** web/src/hub/DashboardProvider.tsx:120-125, WidgetFrame.tsx:81-88
- **Verified:** Code-Analyse

### 8. Timeout-Meldung „nach 0 s“ bei Timeouts unter 500 ms
- **Severity:** low
- **File:** server/scheduler.ts:70
- **Verified:** yes (Skript)

### 9. Plan-Edge-Cases ohne Test
- **Severity:** low
- **Issue:**
  - News: „ein Feed fällt aus bzw. alle fallen aus“ ist nicht getestet.
  - `refresh` → 409 ist nicht getestet.
  - Das Log beim Erzeugen der Config aus dem Beispiel wird nicht geprüft.
  - Kleine Abweichungen vom Plan: die Views sind in `GenericView.tsx` zusammengefasst, `lastEventAt` steht nicht im Context. Beides ist harmlos.
- **Verified:** yes (Durchsicht der Tests)

### Geprüft und in Ordnung
- SSE-Schreiben nach Client-Abbruch (Hono fängt Schreibfehler ab)
- Path Traversal in `static.ts`
- kein XSS in `GenericView`
- `/api/open`: 415, 403 und 400
- Statustabelle
- Watchdog und Reconnect

## Rule Violations
Es gibt keine projektspezifischen Regeln (`CLAUDE.md` ist noch Boilerplate, `.agents/reference/` ist leer). Die Befunde 1, 2, 4 und 6 zeigen fehlende Regeln: Sicherheitsregeln für einen lokalen Server und Regeln für Collectors. Diese sollten in `.agents/reference/` festgehalten werden.

## Summary
Overall: NEEDS FIXES
