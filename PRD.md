# PRD: windowsDashboard – Persönliches Desktop-Dashboard

## 1. Executive Summary

windowsDashboard ist ein persönliches Dashboard, das lokal auf einem Windows-11-Rechner läuft und dauerhaft als **interaktiver Desktop-Hintergrund** sichtbar ist. Es bündelt auf einer Fläche, was sonst über Browser-Tabs, Mail-Clients, Messenger und Terminals verstreut ist:
- Alltagsinfos: Wetter und News
- alle Mail-Postfächer
- Messenger-Nachrichten
- den Status laufender Projekte, z. B. relaunch-radar
- technische Systeminfos: belegte Ports und laufende Claude-Agents
- KI-Funktionen:
  - ein Tages-Briefing, das Claude über die lokale Claude-Code-CLI schreibt
  - ein Chat-Widget mit GPT über die OpenAI-API
  - eine Anzeige von Verbrauch und Limits für Claude Code, Codex und die OpenAI-API

Technisch ist es eine **lokale Web-App**. Ein Node-Server (Hono) sammelt alle Daten und liefert eine React-Oberfläche aus. [Lively Wallpaper](https://www.rocksdanister.com/lively/) zeigt diese Oberfläche als Desktop-Hintergrund an. Dadurch braucht es keinen eigenen Fenster- oder Shell-Code. Server und UI bleiben trotzdem so getrennt, dass später ein Electron-Overlay ergänzt werden kann, ohne sie umzubauen.

**MVP-Ziel:** Nach dem Login sind ohne Zutun alle elf Widgets sichtbar. Mit `Win+D` erfasst der Nutzer in wenigen Sekunden den Stand von Mails, Nachrichten, Projekten und System, ohne eine App zu öffnen. Ein KI-Briefing fasst das Wichtigste in drei Sätzen zusammen.

## 2. Mission

**Mission:** Ein Blick auf den Desktop ersetzt das tägliche Durchklicken durch ein Dutzend Apps und Terminals.

**Kernprinzipien:**
1. **Nur lesen, nichts verändern.** Das Dashboard zeigt an und verlinkt. Es versendet nichts, löscht nichts und markiert nichts als gelesen in der MVP Version.
2. **Echte Daten oder ein sichtbarer Fehler.** Es gibt keine Mocks und keine stillen Fallbacks. Fehlt eine Konfiguration, zeigt das Widget genau das an.
3. **Lokal und privat.** Alles läuft auf `127.0.0.1`. Tokens und Daten verlassen den Rechner nur bei den direkten API-Aufrufen an die jeweiligen Dienste. An die KI (Anthropic über die Claude-CLI, OpenAI für den Chat) geht nur ein kompakter Daten-Snapshot, also Betreffzeilen, Absender, Zähler und Status, keine vollständigen Mail-Texte. Dieser Kontext lässt sich abschalten.
4. **Ein Widget ist ein Modul.** Jedes Widget ist ein Ordner unter `widgets/`, der den Widget-Vertrag erfüllt (siehe 6.1). Ein neues Widget heißt: Ordner anlegen und in die Konfiguration eintragen. Am Kern ändert sich nichts.


## 3. Zielnutzer

**Primäre Persona: Jose, Solo-Entwickler und Ein-Personen-Webagentur**
- **Technisches Niveau:** hoch. Er arbeitet täglich mit Node/TypeScript, mehreren lokalen Repos, Claude Code und Codex-Agents.
- **Kontext:**
  - mehrere parallele Projekte, z. B. relaunch-radar, app-generator-dashboard und msdf-*
  - mehrere Mail-Konten (Gmail, outlook.de, ein weiteres IMAP-Konto)
  - Kommunikation über WhatsApp, Slack, Teams und Discord, gelegentlich Lark
- **Pain Points:**
  - Wichtige Mails und Nachrichten verteilen sich auf zu viele Apps.
  - Er weiß oft nicht, welcher Prozess gerade Port 3000 oder 5173 belegt; das relaunch-radar-API und das app-generator-dashboard nutzen beide Port 3000.
  - Er verliert den Überblick, welche Claude-Agents in welchem Projekt laufen oder hängen.
  - Den Fortschritt des relaunch-radar-Autopiloten sieht er nur, wenn dessen UI offen ist.
  - Wie viel seiner Claude- und Codex-Limits er schon verbraucht hat, merkt er oft erst, wenn ein Agent ins Limit läuft.
  - Für schnelle Fragen muss er extra ChatGPT oder ein Terminal öffnen.

## 4. MVP-Umfang

### Kernfunktionen
- ✅ Wetter-Widget: aktuelle Werte plus Vorschau für die nächsten Stunden und Tage
- ✅ News-Widget aus konfigurierbaren RSS-Feeds
- ✅ System-Widget: CPU, RAM, Datenträger
- ✅ Ports-Widget: lauschende TCP-Ports → PID → Prozessname → Kommandozeile bzw. Projektordner
- ✅ Claude-Agents-Widget: laufende `claude`- und `codex`-Prozesse mit Projekt und letzter Aktivität
- ✅ relaunch-radar-Widget: Autopilot-Status, laufende Jobs, letzte Benachrichtigungen, live per SSE
- ✅ Mail-Widget: eine gemeinsame Inbox für Gmail, Outlook und IMAP mit Ungelesen-Zählern pro Konto
- ✅ Messenger-Widget: WhatsApp, Teams, Discord und Lark aus der Windows-Benachrichtigungsdatenbank
- ✅ Klick auf eine Mail, eine Nachricht oder eine News öffnet das Ziel im Standardbrowser bzw. in der App
- ✅ Briefing-Widget: Claude erstellt über `claude -p` aus dem Snapshot aller Widgets einen Tagesüberblick, morgens automatisch und per Knopf neu
- ✅ Chat-Widget: Fragen an GPT über die OpenAI-API mit gestreamter Antwort; der aktuelle Dashboard-Snapshot ist optional als Kontext dabei
- ✅ KI-Verbrauch-Widget:
  - Claude Code: Tokens heute, im aktuellen 5-h-Fenster und über 7 Tage
  - Codex: Auslastung des 5-h- und des Wochenlimits in % mit Reset-Zeit
  - OpenAI-API: Kosten im laufenden Monat

### Technik
- ✅ npm-Workspaces-Monorepo mit `server/`, `web/` und `shared/`
- ✅ Hono-Server auf `127.0.0.1:4700`, der im Produktivbetrieb auch das gebaute `web/dist` ausliefert
- ✅ Einheitliches Antwortformat für Widgets mit den Zuständen `ok`, `stale`, `unconfigured` und `error`
- ✅ Serverseitiger Cache pro Collector mit eigenem Poll-Intervall
- ✅ SSE-Stream `/api/stream` für Live-Updates an die UI
- ✅ Offline-Zustand der UI mit automatischem Reconnect
- ✅ Widget-Vertrag (siehe 6.1): ein Ordner pro Widget, automatische Erkennung, mehrere Instanzen pro Typ, generische Views, `external`-Widget ohne Code, Scaffolding-Skript

### Integration
- ✅ Gmail API (OAuth, `gmail.readonly`)
- ✅ Microsoft Graph (OAuth, `Mail.Read`, private Microsoft-Konten)
- ✅ IMAP über `imapflow` (App-Passwort)
- ✅ relaunch-radar-API (`127.0.0.1:3000`), mit Datei-Fallback auf `logs/notifications.json`
- ✅ Windows-Benachrichtigungsdatenbank (SQLite, nur lesend)
- ✅ Claude-Code-CLI (`claude -p --output-format json`) für das Briefing; nutzt das vorhandene Claude-Abo, kein API-Key nötig
- ✅ OpenAI-API (Responses API, Streaming) für den Chat
- ✅ Lokale Session-Logs als Verbrauchsquelle: `~/.claude/projects/**/*.jsonl` (Feld `usage`) und `~/.codex/sessions/**/*.jsonl` (Feld `rate_limits`)
- ✅ OpenAI-Costs-API (`/v1/organization/costs`, Admin-Key) für die API-Kosten; optional, sonst `unconfigured`

### Deployment
- ✅ Autostart des Servers beim Login über eine geplante Aufgabe (`scripts/install-autostart.ps1`)
- ✅ Anleitung zur Einrichtung von Lively Wallpaper mit `http://127.0.0.1:4700`

### Außerhalb des MVP
- ❌ Antworten, Versenden, Archivieren oder Als-gelesen-markieren von Mails und Nachrichten
- ❌ Slack Web API (nur falls die Benachrichtigungsdatenbank nicht reicht)
- ❌ Inoffizielle WhatsApp-Bridges (Baileys, whatsapp-web.js), wegen des Risikos einer Kontosperre
- ❌ Electron-Shell mit Overlay, globalem Hotkey und Tray
- ❌ Kalender, To-dos, weitere Projekt-Widgets (z. B. app-generator-dashboard)
- ❌ KI-Aktionen: Mails beantworten lassen, Agents starten, Tools mit Schreibrechten
- ❌ Chat-Verlauf über einen Neustart hinaus speichern; Chat mit Claude (Claude bleibt im MVP beim Briefing)
- ❌ Prozentanzeige der Claude-Abo-Limits; wird nachgerüstet, sobald es dafür eine verlässliche lokale Quelle gibt (siehe Risiken)
- ❌ Zugriff von anderen Geräten im Netzwerk
- ❌ Ein Mehrbenutzer-Modell

## 5. User Stories

1. **Morgenüberblick:** Als Nutzer will ich nach dem Login mit `Win+D` Wetter, News und ungelesene Mails sehen, damit ich ohne fünf geöffnete Apps in den Tag starte.
   *Beispiel:* „12 °C, Regen ab 15 Uhr · 3 ungelesen in Gmail, 1 in Outlook · tagesschau: …“
2. **Gemeinsame Inbox:** Als Nutzer will ich die neuesten Mails aller Konten in einer Liste sehen, damit mir in einem selten geprüften Postfach nichts entgeht.
   *Beispiel:* Eine Kundenanfrage im IMAP-Konto erscheint direkt neben Gmail-Mails. Ein Klick öffnet sie im Webmail.
3. **Messenger-Überblick:** Als Nutzer will ich die letzten WhatsApp-, Teams- und Discord-Nachrichten sehen, damit ich weiß, ob etwas Dringendes wartet.
   *Beispiel:* „WhatsApp · Anna: Kannst du heute noch …“ (vor 4 Min.)
4. **Port-Konflikt klären:** Als Entwickler will ich sehen, welcher Prozess welchen Port belegt, damit ich bei `EADDRINUSE` sofort weiß, was ich beenden muss.
   *Beispiel:* `:3000 → node.exe (PID 18432) → C:\_repos\relaunch-radar`
5. **Agents im Blick:** Als Entwickler will ich sehen, welche Claude- und Codex-Agents in welchem Projekt laufen und wann sie zuletzt aktiv waren, damit ich hängende oder vergessene Sessions erkenne.
   *Beispiel:* „claude · windowsDashboard · letzte Aktivität vor 20 s“, „claude · relaunch-radar · seit 2 h inaktiv“
6. **Projektfortschritt:** Als Agenturinhaber will ich den Autopiloten von relaunch-radar live verfolgen, damit ich Fortschritt und Fehler sehe, ohne dessen UI zu öffnen.
   *Beispiel:* „Autopilot aktiv · läuft: mockup für metallbau-agu-de · zuletzt: built faul-de (ETA 6 min)“
7. **Fehler sichtbar machen:** Als Nutzer will ich bei einem fehlerhaften oder unkonfigurierten Widget den Grund sehen, damit ich nicht veralteten oder erfundenen Daten vertraue.
   *Beispiel:* „Outlook: nicht verbunden → /auth/microsoft/start“
8. **Tages-Briefing:** Als Nutzer will ich morgens eine kurze KI-Zusammenfassung über alle Quellen sehen, damit ich sofort weiß, was heute zählt.
   *Beispiel:* „1) Kunde GmbH wartet auf das Relaunch-Angebot (Gmail, gestern 18:02). 2) Autopilot hat 3 Mockups gebaut, 1 Job fehlgeschlagen. 3) Ab 15 Uhr Regen.“
9. **Schnelle Frage an GPT:** Als Nutzer will ich direkt im Dashboard eine Frage an GPT stellen, auf Wunsch mit den Dashboard-Daten als Kontext, damit ich kein extra Fenster öffnen muss.
   *Beispiel:* „Welche meiner ungelesenen Mails sind Kundenanfragen?“ → GPT antwortet anhand von Absendern und Betreffzeilen.
10. **Limits im Blick:** Als Entwickler will ich sehen, wie viel meines Claude- und Codex-Kontingents verbraucht ist und wann es zurückgesetzt wird, damit ich lange Agent-Läufe passend plane.
    *Beispiel:* „Codex: 5 h 9 % · Woche 2 % · Reset 14:39“, „Claude Code: 1,2 Mio. Tokens im aktuellen 5-h-Fenster“
11. **(Technisch) Neues Widget:** Als Entwickler will ich mit `npm run new-widget <id>` ein Widget anlegen und es über `dashboard.config.json` einhängen, ohne Kerncode zu ändern, damit das Dashboard mit meinen Projekten wächst.
    *Beispiel:* `npm run new-widget git-status` → Collector ausfüllen → Instanz eintragen → das Widget erscheint nach einem Server-Neustart.
12. **(Technisch) Projekt ohne Code einhängen:** Als Entwickler will ich, dass ein anderes lokales Projekt ein `WidgetView`-JSON bereitstellt und ich es nur per Konfiguration einbinde, damit neue Projekte sofort sichtbar sind.
    *Beispiel:* app-generator-dashboard liefert `{ "view": "status", "items": [...] }`, eingehängt als `external`-Instanz.

## 6. Architektur & Patterns

### Überblick

```
┌──────────────── Lively Wallpaper (Desktop-Ebene) ────────────────┐
│  lädt http://127.0.0.1:4700                                      │
│  ┌──────────── web/ (React, Vite-Build) ───────────┐             │
│  │ Hub-Grid → WidgetFrame → DashboardProvider ← SSE /api/stream  │
│  └─────────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────────┘
                 │ REST + SSE
┌──────────────── server/ (Node + Hono, 127.0.0.1:4700) ───────────┐
│  Scheduler → Collector[] → Cache → Routen /api/* + /api/stream   │
│  Collectors: weather, news, system, ports, agents, relaunchRadar,│
│              mail(gmail|outlook|imap), messages(wpn), aiUsage    │
│  AI: briefing (Snapshot → claude -p), chat (Snapshot → OpenAI)   │
└──────────────────────────────────────────────────────────────────┘
      │ HTTPS/IMAP          │ child_process / fs / node:sqlite │ child_process
  Open-Meteo, RSS,     netstat -ano, tasklist /fo csv,       claude -p
  Gmail, Graph, IMAP,  ~/.claude/projects, ~/.codex/sessions,
  OpenAI API           wpndatabase.db, relaunch-radar/logs
  relaunch-radar API
```

### Verzeichnisstruktur

```
server/
  index.ts            # Bootstrap: Config → Loader → Scheduler → serve(); openUrl über rundll32
  app.ts              # createApp(deps): Guard, Routen, Static, Fehlerbehandlung
  env.ts              # .env laden (process.loadEnvFile), nur localhost als HOST
  guard.ts            # Host-Check (DNS-Rebinding), JSON + Origin für ändernde Requests
  config-file.ts      # dashboard.config.json laden/prüfen, beim ersten Start aus dem Beispiel
  cache.ts            # In-Memory-Cache + Event-Emitter für SSE
  scheduler.ts        # Pollt Instanzen: Timeout, kein Overlap, Statuslogik
  widgets/loader.ts   # findet widgets/*/ und importiert manifest.ts + collector.ts
  lib/win.ts          # schnelle Windows-Kommandos (netstat, tasklist) – kein WMI/CIM, siehe Risiken
  auth/google.ts, auth/microsoft.ts
  ai/snapshot.ts      # baut aus dem Cache einen kompakten Kontext-Snapshot (ohne Mail-Texte)
  ai/briefing.ts      # ruft `claude -p` auf, speichert das Ergebnis in data/briefing.json
  ai/chat.ts          # OpenAI-Streaming, Verlauf nur im Speicher
web/
  src/hub/            # DashboardProvider (Layout, SSE, Watchdog), Hub-Grid, WidgetFrame, Offline-Banner
  src/hub/registry.ts # import.meta.glob('../../../widgets/*/Widget.tsx')
  src/views/          # generische Renderer (stat, list, progress, status, markdown)
shared/
  widget-contract.ts  # defineManifest/defineCollector, WidgetManifest, WidgetState, WidgetView
  api.ts              # Response-Typen von /api/*
widgets/              # EIN Ordner pro Widget, siehe 6.1
  weather/ news/ system/ ports/ agents/ relaunch-radar/ mail/ messages/
  ai-usage/ briefing/ chat/ external/
dashboard.config.json # welche Widget-Instanzen, wo, mit welcher Konfiguration (gitignored;
                      # dashboard.config.example.json ist die getrackte Vorlage)
scripts/
  new-widget.ts       # npm run new-widget <id>: legt das Grundgerüst an
  install-autostart.ps1
data/                 # gitignored: tokens/, Laufzeitdaten
```

### 6.1 Widget-Vertrag (Plugin-Schema)

Jedes Widget, auch jedes der elf MVP-Widgets, ist ein in sich geschlossener Ordner unter `widgets/<id>/`. Es erfüllt einen gemeinsamen Vertrag aus `shared/widget-contract.ts`. Ein neues Widget einzuhängen heißt: Ordner anlegen und in `dashboard.config.json` eintragen. Server-Kern und Hub bleiben unverändert.

**Ordneraufbau:**
```
widgets/<id>/
  manifest.ts        # Metadaten, Config- und Payload-Schema (Pflicht; rein, auch im Browser importiert)
  collector.ts       # Server: holt die Daten (Pflicht)
  Widget.tsx         # UI: rendert die Payload (optional, sonst generischer View)
  parse.ts           # optional: reine Helfer, die Collector und Widget.tsx teilen
  *.test.ts          # Tests gegen fixtures/
  fixtures/<id>.json # Pflicht: echte Beispiel-Payload, geprüft vom Vertragstest
  README.md          # Einrichtung: Keys, OAuth, Voraussetzungen
```

Manifest und Collector liegen bewusst in getrennten Dateien. Die UI importiert nie den Collector, so landen Server-Bibliotheken wie `systeminformation` nicht im Browser-Bundle.

**Manifest und Collector** (verbindlich ist `shared/widget-contract.ts`):
```ts
export interface WidgetManifest<C extends z.ZodType, T extends z.ZodType> {
  id: string;                         // "weather" – eindeutig, = Ordnername
  title: string;                      // Standard-Titel im Rahmen
  version: number;                    // erhöhen bei inkompatibler Payload
  category: "daily" | "comms" | "projects" | "system" | "ai";
  defaultSize: { w: 1..6; h: 1..4 };  // Grid-Einheiten
  intervalMs: number;                 // Poll-Intervall; eine Instanz kann es überschreiben
  timeoutMs?: number;                 // Default 20 s
  config: C;                          // zod-Schema der Instanz-Konfiguration
  data: T;                            // zod-Schema der Payload
  env?: string[];                     // benötigte .env-Variablen → sonst "unconfigured"
  capabilities: Array<"network" | "fs" | "powershell" | "process" | "ai">;
  view?: WidgetViewType;              // Hinweis: Payload ist eine generische WidgetView
}

export interface WidgetCollector<C, T> {
  collect(ctx: { config: C; env; signal: AbortSignal; log }): Promise<T>;
  actions?: Record<string, (ctx, input: unknown) => Promise<unknown>>; // "refresh" ist eingebaut
}

// manifest.ts:  export const manifest = defineManifest({ ... });
// collector.ts: export const collector = defineCollector(manifest, { async collect(ctx) { ... } });
```

Push-Collectors (`subscribe`) kommen erst mit Phase 3 (relaunch-radar-SSE) hinzu.

**Instanzen statt Singletons:** `dashboard.config.json` legt fest, welche Instanzen eines Widget-Typs es gibt, wo sie im Grid liegen und wie sie konfiguriert sind. Derselbe Typ lässt sich also mehrfach nutzen, z. B. Wetter für zwei Orte oder News mit unterschiedlichen Feeds:
```json
{
  "grid": { "columns": 12, "reserveLeftPx": 120 },
  "widgets": [
    { "instance": "wetter-muenster", "type": "weather", "x": 0, "y": 0, "w": 3, "h": 2,
      "config": { "lat": 51.96, "lon": 7.63, "label": "Münster" } },
    { "instance": "ports", "type": "ports", "x": 3, "y": 0, "w": 3, "h": 3, "config": {} },
    { "instance": "factory", "type": "external", "x": 6, "y": 0, "w": 3, "h": 2,
      "config": { "url": "http://127.0.0.1:3001/dashboard-widget.json", "intervalMs": 30000 } }
  ]
}
```
Beim Start prüft der Loader jede Instanz gegen `manifest.config`. Bei ungültiger Konfiguration landet genau diese Instanz in `error`, der Server startet trotzdem.

**Generische Views und externe Widgets ohne Code:** Für einfache Fälle braucht ein Widget kein eigenes `Widget.tsx`. Es liefert dann eine **`WidgetView`**-Payload, die der Hub mit eingebauten Renderern darstellt:
```ts
type WidgetView =
  | { view: "stat";     items: { label: string; value: string | number; unit?: string; trend?: "up"|"down"; tone?: Tone }[] }
  | { view: "list";     items: { title: string; subtitle?: string; meta?: string; url?: string; tone?: Tone }[] }
  | { view: "progress"; items: { label: string; percent: number; caption?: string }[] }
  | { view: "status";   items: { label: string; state: "ok"|"warn"|"error"|"idle"; detail?: string }[] }
  | { view: "markdown"; text: string };
type Tone = "neutral" | "good" | "warn" | "bad";
```
Darauf baut das eingebaute Widget **`external`** auf. Jedes lokale Projekt kann eine JSON-Datei oder einen HTTP-Endpunkt im `WidgetView`-Format bereitstellen. Ein Eintrag in `dashboard.config.json` hängt es dann ein, **ganz ohne Code im Dashboard**. Das ist der schnellste Weg für künftige Projekt-Widgets, z. B. app-generator-dashboard oder neue Agenten-Projekte.

**Werkzeug:** `npm run new-widget <id>` legt Ordner, Manifest, Schema, Collector-Gerüst, Test und README an. Ein Vertragstest (`widgets/contract.test.ts`) prüft automatisch für alle Widgets:
- Die Manifest-`id` entspricht dem Ordnernamen.
- Die Fixtures passen zum Schema.
- Es gibt entweder ein `Widget.tsx` oder einen `view`.

### Patterns
- **Scheduler:** Für jede Instanz ruft der Scheduler `collect()` im Intervall auf bzw. abonniert `subscribe()`. Er validiert das Ergebnis mit `schema`, legt es im Cache ab und sendet ein SSE-Event.
- **Envelope pro Widget-Instanz:**
  ```ts
  type WidgetState<T> = {
    instance: string;           // "wetter-muenster"
    type: string;               // "weather"
    status: "ok" | "stale" | "unconfigured" | "error";
    updatedAt: string | null;   // ISO
    data: T | null;             // letzte gute Daten bleiben bei "stale" erhalten
    error?: string;
  };
  ```
- **Fehler isolieren:** Ein fehlschlagender Collector setzt nur sein Widget auf `error` bzw. `stale`. Server und andere Widgets laufen weiter.
- **Widget-Registry:** Server und UI finden Widgets automatisch. Der Server durchsucht `widgets/*/` mit dynamischem Import, die UI nutzt `import.meta.glob`. Eine Liste von Hand muss niemand pflegen. Den Grid-Rahmen übernimmt der Hub, das Widget rendert nur den Inhalt. Vorlage für Grid und Registry ist `C:\_repos\widget_dashboard\web-mockup\src\widgets\registry.ts`.
- **Server-Stil:** Hono-Routen, zod und `tsx watch` für die Entwicklung, wie in `C:\_repos\relaunch-radar\server\`.
- **Parser sind reine Funktionen** (Port-Ausgabe, Benachrichtigungs-XML, RSS) und werden mit Vitest gegen echte Beispielausgaben getestet.

## 7. Features im Detail

| Widget | Quelle | Intervall | Inhalt |
|---|---|---|---|
| **Wetter** | Open-Meteo (`api.open-meteo.com`, kein Key) | 10 min | Temperatur, Zustand, Regenwahrscheinlichkeit, 12-h-Verlauf, 3-Tage-Vorschau |
| **News** | RSS/Atom über `rss-parser`, Feeds aus der Instanz-Config | 15 min | Top-Schlagzeilen je Feed, Quelle, Zeit, Link |
| **System** | `systeminformation` | 5 s | CPU-Last, RAM belegt/gesamt, Datenträger frei, Uptime |
| **Ports** | `netstat -ano` (LISTENING) + `tasklist /fo csv` (PID → Prozessname) | 10 s | Port, Adresse, PID, Prozessname; gruppiert nach Dev-Ports und System |
| **Claude-Agents** | Session-Logs `~/.claude/projects/**/*.jsonl` und `~/.codex/sessions/**/*.jsonl` (mtime + Feld `cwd`), dazu `tasklist` für die laufenden `claude`/`codex`-Prozesse | 10 s | Agent-Typ, Projekt (aus `cwd`), letzte Aktivität, aktiv/inaktiv ab einem Schwellwert, Anzahl laufender Prozesse |

**Gemessen am 2026-10-19 auf dem Zielrechner:** `netstat -ano` 0,4 s, `tasklist` 1 s, `Get-Process` 13 s, `Get-CimInstance Win32_Process` 39 s, `Get-NetTCPConnection` 49 s, `si.mem()` 94 s. WMI/CIM-basierte Abfragen scheiden für Intervalle von 5–10 s deshalb aus. Projektordner kommen aus dem `cwd` der Session-Logs statt aus Prozess-Kommandozeilen.
| **relaunch-radar** | `GET /api/overview`, `/api/jobs/running`, SSE `/api/notifications/stream`; Fallback `logs/notifications.json` | live / 30 s | Autopilot-Status, laufende Jobs, Warteschlangenlänge, letzte 5 Benachrichtigungen; Badge „API offline – Dateimodus“ |
| **Mail** | Gmail API, Microsoft Graph, `imapflow` | 2 min | Ungelesen-Zähler pro Konto, letzte ~15 Mails gemischt (Absender, Betreff, Zeit, Konto-Farbe), Link ins Webmail |
| **Messenger** | `%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db` | 30 s | letzte Benachrichtigungen von WhatsApp, Teams, Discord, Lark und Slack: App, Absender bzw. Titel, Text, Zeit |

| **KI-Verbrauch** | `~/.claude/projects/**/*.jsonl` (Feld `usage`), `~/.codex/sessions/**/*.jsonl` (letztes `rate_limits`), optional OpenAI-Costs-API | 60 s (Costs-API: 1 h) | Claude Code: Tokens (Input, Output, Cache) heute, im 5-h-Fenster und über 7 Tage, nach Projekt aufgeschlüsselt. Codex: `primary`/`secondary` `used_percent` und `resets_at`. OpenAI: Kosten im laufenden Monat |
| **Briefing** | `claude -p` mit einem Snapshot aller Widgets | täglich um `BRIEFING_TIME` + manuell | 3–5 priorisierte Punkte mit Quellenangabe, Erstellzeit |
| **Chat** | OpenAI Responses API (`OPENAI_MODEL`) | bei Bedarf | Eingabefeld, gestreamte Antwort, Schalter „Dashboard als Kontext“ |

**Details zum Briefing:**
- `server/ai/briefing.ts` startet `claude -p "<Prompt>" --output-format json` als Kindprozess. Der Snapshot geht per stdin hinein, als Arbeitsverzeichnis dient ein leerer Ordner `data/briefing-cwd/`, damit Claude keine Repo-Dateien liest. Es gibt keine Tool-Freigaben, das Timeout liegt bei 120 s.
- Das Ergebnis wird in `data/briefing.json` gespeichert und überlebt Neustarts. Schlägt ein Lauf fehl, bleibt das letzte Briefing mit dem Status `stale` sichtbar.
- Höchstens ein gleichzeitiger Lauf, und manuelle Läufe frühestens alle 5 Minuten, um das Abo-Kontingent zu schonen.
- Diese Läufe erscheinen selbst im Agents-Widget und im Verbrauch. Sie werden dort als „Dashboard-Briefing“ markiert, erkannt am Arbeitsverzeichnis `data/briefing-cwd`.

**Details zum Chat:**
- `POST /api/chat` streamt die Antwort per SSE an die UI. Der Verlauf liegt nur im Speicher und geht bei einem Neustart verloren.
- Der Snapshot ist derselbe wie beim Briefing (`ai/snapshot.ts`). Ist der Schalter aus, geht nur die Frage selbst an OpenAI.
- Ohne `OPENAI_API_KEY` ist das Widget `unconfigured`.

**Details zum Messenger-Collector:**
- Die Datenbank wird mit `node:sqlite` nur lesend geöffnet. Ist die Datei gesperrt, wird sie vorher in ein temporäres Verzeichnis kopiert.
- Die Tabellen `Notification` und `NotificationHandler` werden gejoint. Die App wird über die AppUserModelID/PrimaryId erkannt; die Zuordnung zu WhatsApp, Teams usw. ist konfigurierbar.
- Der Toast-XML-Payload wird geparst und `<text>`-Elemente werden zu Titel und Text.

**Details zum Ports-Collector:** Einziger PowerShell-Aufruf ist `runPs()`. Das Skript gibt JSON aus (`ConvertTo-Json`), damit Node nichts aus Textausgaben herausparsen muss.

## 8. Technologie-Stack

| Bereich | Technologie | Begründung |
|---|---|---|
| Runtime | Node.js 24 (installiert: v24.12.0) | auf dem Rechner vorhanden; enthält `node:sqlite` |
| Sprache | TypeScript (strict) | eine Sprache für Server und UI |
| Server | Hono + `@hono/node-server` | leichtgewichtig, SSE-Helper; schon in relaunch-radar bewährt |
| Validierung | zod | Konfiguration und Payload-Schemas, geteilt über `shared/` |
| UI | React 19 + Vite | Grid-Vorlage aus widget_dashboard/web-mockup |
| UI-Extras | lucide-react (Icons) | wie im web-mockup |
| Tests | Vitest | Parser- und Collector-Unit-Tests |
| Dev | `tsx watch`, `concurrently` | ein `npm run dev` startet Server und Vite |
| Anzeige | Lively Wallpaper (Microsoft Store) | Web-Seite als interaktiver Desktop-Hintergrund |

**Bibliotheken für die Datenquellen:**
- `systeminformation` – System
- `rss-parser` – News
- `googleapis` bzw. `@googleapis/gmail` – Gmail
- `@azure/msal-node` + `fetch` gegen Graph – Outlook
- `imapflow` – IMAP
- `fast-xml-parser` – Toast-XML
- `openai` (offizielles SDK) – Chat und Costs-API
- Claude Code CLI (`claude`, liegt unter `~/.local/bin`) – Briefing, keine npm-Abhängigkeit

Die genauen Versionen werden beim Setup in Phase 1 auf die aktuelle stabile Version festgelegt.

## 9. Sicherheit & Konfiguration

- **Netzwerk:** Der Server bindet ausschließlich an `127.0.0.1`. Ein Login-System gibt es im MVP nicht, weil nur der lokale Nutzer zugreifen kann.
- **Nur Lese-Scopes:** `gmail.readonly`, `Mail.Read` und `offline_access`. IMAP wird mit `readOnly` bzw. `EXAMINE` geöffnet, damit Mails nicht als gelesen markiert werden.
- **Tokens:** OAuth-Refresh-Tokens liegen in `data/tokens/*.json`. `data/` ist gitignored. Eine Verschlüsselung über die Windows-DPAPI ist eine spätere Option.
- **OAuth-Flow:** Loopback-Redirect auf `http://127.0.0.1:4700/auth/<provider>/callback`. Dafür braucht es:
  - ein Google-Cloud-Projekt mit OAuth-Client vom Typ „Desktop“
  - eine Azure-App-Registrierung für private Microsoft-Konten
- **Fremde Webseiten** (siehe `.agents/reference/security.md`):
  - `server/guard.ts` beantwortet nur Requests mit eigenem `Host`, das schützt gegen DNS-Rebinding.
  - Ändernde `/api`-Requests brauchen `content-type: application/json` und, falls gesetzt, eine erlaubte `Origin`.
  - Links aus Feeds und Mails öffnet `POST /api/open` nur normalisiert über `rundll32 url.dll,FileProtocolHandler`.
- **Konfiguration:**
  - Secrets und Server-Einstellungen stehen in `.env` (`server/env.ts`).
  - Nicht geheime Widget-Einstellungen wie Standort oder Feeds stehen in `dashboard.config.json` und werden pro Instanz gegen `manifest.config` geprüft.
  - Fehlen in `manifest.env` genannte Variablen, wird das Widget `unconfigured`. Ist die Config-Datei kaputt, bricht der Start mit einer klaren Meldung ab.
- **Neue Variablen in `.env.example`** (jeweils mit Kommentar, woher der Wert kommt):
  ```
  PORT=4700
  HOST=127.0.0.1
  GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=
  MS_CLIENT_ID= / MS_TENANT=consumers
  IMAP_HOST= / IMAP_PORT=993 / IMAP_USER= / IMAP_PASSWORD= / IMAP_WEBMAIL_URL=
  OPENAI_API_KEY= / OPENAI_MODEL=          # Chat; Modell frei wählbar
  OPENAI_ADMIN_KEY=                        # optional, nur für die Costs-API
  CLAUDE_BIN=claude / BRIEFING_TIME=07:30
  AI_CONTEXT_ENABLED=true                  # Dashboard-Snapshot an KI senden
  ```
  relaunch-radar-URL/-Pfad und der Agent-Inaktivitäts-Schwellwert sind keine Secrets und gehören in die Instanz-Config der jeweiligen Widgets.
- **KI-Datenschutz:** Der Snapshot enthält keine Mail- oder Nachrichtentexte, nur Absender, Betreff bzw. Titel, Zähler und Status. Messenger-Vorschautexte sind auf 80 Zeichen gekürzt. `AI_CONTEXT_ENABLED=false` schaltet den Kontext für Briefing und Chat ab.
  Die generischen Platzhalter aus dem Boilerplate (`DATABASE_URL`, `AUTH_SECRET`, `PORT=3000`) werden entfernt.
- **Außerhalb des MVP:** Zugriff aus dem LAN, Verschlüsselung der Tokens, CSRF-Schutz über den OAuth-`state` hinaus.

## 10. API-Spezifikation

Alle Endpunkte liegen auf `http://127.0.0.1:4700`. Es gibt keine Authentifizierung, weil der Server nur an localhost bindet. Alle Requests laufen durch `localGuard` (Host-Check; ändernde Requests nur mit JSON-Content-Type und erlaubter Origin).

| Methode | Pfad | Antwort |
|---|---|---|
| GET | `/api/health` | `{ ok: true, uptimeS, instances: [{ instance, type, status, updatedAt }] }` |
| POST | `/api/open` | Body `{ url }` (nur http/https); öffnet die normalisierte URL im Standardbrowser, `204` |
| GET | `/api/types` | alle gefundenen Widget-Manifeste (ohne zod, als JSON-Schema) |
| GET | `/api/layout` | Inhalt von `dashboard.config.json` (Instanzen und Grid) |
| GET | `/api/widgets` | `WidgetState[]` aller Instanzen (Initial-Load der UI) |
| POST | `/api/widgets/:instance/actions/:action` | führt eine im Collector deklarierte Aktion aus, z. B. `refresh` |
| GET | `/api/widgets/:instance` | `WidgetState` einer Instanz; Standard-Instanzen tragen den Typnamen als ID (`weather`, `news`, `system`, `ports`, `agents`, `relaunch-radar`, `mail`, `messages`, `ai-usage`, `briefing`) |
| POST | `/api/briefing/run` | startet einen Briefing-Lauf; `202`, oder `429` bei laufendem bzw. zu frühem Lauf. Das Ergebnis kommt über `/api/stream` |
| POST | `/api/chat` | Body `{ message, useContext }`; Antwort ist ein SSE-Stream aus `delta`-Events, am Ende `done` |
| DELETE | `/api/chat` | leert den Chat-Verlauf |
| GET | `/api/stream` | SSE; `snapshot` (alle `WidgetState`) beim Verbinden, `widget` bei jeder Änderung, `ping` alle 15 s |
| GET | `/auth/google/start`, `/auth/microsoft/start` | Redirect zum OAuth-Consent |
| GET | `/auth/google/callback`, `/auth/microsoft/callback` | speichert die Tokens und leitet auf `/` um |
| GET | `/*` | statisches `web/dist` (SPA-Fallback auf `index.html`) |

**Beispiel `GET /api/widgets/ports`:**
```json
{
  "id": "ports",
  "status": "ok",
  "updatedAt": "2026-10-19T09:12:04.120Z",
  "data": {
    "listeners": [
      { "port": 3000, "address": "127.0.0.1", "pid": 18432, "process": "node.exe" },
      { "port": 4700, "address": "127.0.0.1", "pid": 20110, "process": "node.exe" }
    ]
  }
}
```

**Beispiel `GET /api/widgets/mail`, Outlook nicht verbunden:**
```json
{
  "id": "mail",
  "status": "ok",
  "updatedAt": "2026-10-19T09:10:00.000Z",
  "data": {
    "accounts": [
      { "id": "gmail", "label": "Gmail", "status": "ok", "unread": 3 },
      { "id": "outlook", "label": "Outlook", "status": "unconfigured", "unread": null,
        "action": "/auth/microsoft/start" },
      { "id": "imap", "label": "IMAP", "status": "ok", "unread": 1 }
    ],
    "messages": [
      { "account": "gmail", "from": "Kunde GmbH", "subject": "Angebot Relaunch",
        "receivedAt": "2026-10-19T08:55:00Z", "unread": true,
        "url": "https://mail.google.com/mail/u/0/#inbox/18f…" }
    ]
  }
}
```

## 11. Erfolgskriterien

**Das MVP gilt als erfolgreich, wenn** das Dashboard nach einem Neustart ohne manuelles Zutun als Desktop-Hintergrund erscheint, alle elf Widgets echte Daten oder einen begründeten Zustand zeigen und es eine Woche lang im Alltag ohne Absturz läuft.

### Funktionale Anforderungen
- ✅ `/api/widgets/ports` liefert dieselben lauschenden Ports wie `netstat -ano` (Zustand LISTENING).
- ✅ `/api/widgets/agents` listet die gerade laufende Claude-Code-Session mit dem richtigen Projekt.
- ✅ Bei laufendem relaunch-radar stimmt das Widget mit dessen `/api/overview` überein. Ist es gestoppt, zeigt das Widget den Dateimodus mit Daten aus `notifications.json`.
- ✅ Die Ungelesen-Zähler von Gmail, Outlook und IMAP stimmen mit dem jeweiligen Webmail überein.
- ✅ Eine an sich selbst geschickte WhatsApp-Desktop-Nachricht erscheint innerhalb von 30 s im Messenger-Widget.
- ✅ Ein fehlender Credential führt zu `unconfigured` mit Handlungshinweis, nicht zu einem Absturz oder zu Fake-Daten.
- ✅ Wird der Server gestoppt, zeigt die UI den Offline-Zustand. Nach dem Neustart erholt sie sich ohne Neuladen.
- ✅ Das Briefing wird morgens automatisch erzeugt, nennt nur Fakten aus dem Snapshot und gibt bei jedem Punkt die Quelle an.
- ✅ Die Codex-Prozente im Verbrauchs-Widget stimmen mit dem letzten `rate_limits`-Eintrag überein. Die Claude-Token-Summen stimmen mit einer Kontrollrechnung über die jsonl-Dateien überein.
- ✅ Der Chat streamt die erste Antwort innerhalb weniger Sekunden. Ohne Key erscheint `unconfigured`.

### Qualität
- ✅ `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` laufen grün.
- ✅ Der Vertragstest ist für alle Widgets grün. Ein mit `npm run new-widget` angelegtes Widget läuft ohne Änderung an Server-Kern oder Hub.
- ✅ Eine `external`-Instanz auf eine lokale JSON-Datei erscheint allein durch einen Konfigurationseintrag.
- ✅ Parser-Tests gegen echte, anonymisierte Beispielausgaben (Ports-JSON, Toast-XML, RSS)
- ✅ Speicherbedarf des Servers stabil unter ~250 MB nach 24 h Laufzeit
- ✅ Gemittelt über alle Collectors unter 5 % CPU-Last im Leerlauf

### UX
- ✅ Lesbar auf Desktop-Hintergrund-Distanz: dunkles Theme, ausreichende Kontraste
- ✅ Bereich für Desktop-Icons bleibt frei (konfigurierbarer Rand)
- ✅ Jede Information ist höchstens einen Klick vom Ziel entfernt

## 12. Umsetzungsphasen

Jede Phase ist ein eigener Zyklus aus `/plan-feature` → `/execute` → `/validate` → `/commit`, jeweils in einer frischen Session. Die Zeitangaben sind grobe Schätzungen.

### Phase 1 – Gerüst & Basis-Widgets ✔ erledigt (Commit `2da717a`)
**Ziel:** Die laufende Pipeline vom Server über die UI bis zu Lively steht.
- ✅ Ein npm-Paket (keine Workspaces, weil ein Widget-Ordner Server- und UI-Code enthält), TypeScript, ESLint, Vitest, Skripte `dev`, `build`, `start`, `test`, `lint`, `typecheck`, `check`, `new-widget`
- ✅ **Widget-Vertrag** (`shared/widget-contract.ts`), Loader, `dashboard.config.json`, generische Views, `external`-Widget, `npm run new-widget`, Vertragstest
- ✅ Hono-Server mit Scheduler, Cache, `/api/types`, `/api/layout`, `/api/widgets`, `/api/stream`, `/api/open`, `localGuard` und Static-Serving
- ✅ React-Hub-Grid, `DashboardProvider` (SSE, Watchdog, Reload bei neuem Layout), Offline-Banner, dunkles Theme
- ✅ Widgets: Wetter, News, System, Extern
- ✅ `.env.example` bereinigt, README mit Lively-Anleitung
- ✅ Code-Review (9 Befunde behoben), Regeln in `.agents/reference/security.md` und `widgets.md`

**Validierung:** `npm run check` grün (91 Tests); `127.0.0.1:4700` zeigt vier Widgets mit echten Daten. Offen: Lively-Test durch den Nutzer.

### Phase 2 – System: Ports & Claude-Agents (≈ 1 Session)
- ✅ `server/lib/win.ts`: `netstat -ano` und `tasklist /fo csv` ausführen und parsen (kein PowerShell/WMI, siehe Messung in Abschnitt 7)
- ✅ Ports-Collector und -Widget
- ✅ Agents-Collector (Session-Logs von Claude und Codex mit `cwd` und mtime, dazu laufende Prozesse über `tasklist`) und -Widget

**Validierung:** Ports im Abgleich mit `netstat -ano`. Diese Claude-Session erscheint mit Projekt `windowsDashboard` als aktiv im Agents-Widget.

### Phase 3 – Projekte: relaunch-radar (≈ ½ Session)
- ✅ Collector mit API- und SSE-Anbindung und Datei-Fallback, dazu das Widget

**Validierung:** relaunch-radar starten und stoppen; beide Modi werden korrekt angezeigt.

### Phase 4 – Mail (≈ 1–2 Sessions)
- ✅ Gmail-OAuth und -Collector, Microsoft-OAuth und Graph-Collector, IMAP-Collector, gemeinsames Widget

**Validierung:** Ungelesen-Zähler im Abgleich mit dem Webmail. Ohne Credentials erscheint `unconfigured`.

### Phase 5 – Messenger (≈ 1 Session)
- ✅ Leser für `wpndatabase.db`, Toast-XML-Parser, App-Mapping, Widget

**Validierung:** Selbst geschickte Testnachrichten in WhatsApp und Teams erscheinen innerhalb von 30 s.

### Phase 6 – KI: Verbrauch, Briefing, Chat (≈ 1–2 Sessions)
- ✅ `ai-usage`-Collector (Claude-jsonl, Codex-`rate_limits`, optional Costs-API) und Widget
- ✅ `ai/snapshot.ts`, Briefing über `claude -p` mit Zeitplan, Persistenz und Sperre, Widget
- ✅ Chat über die OpenAI-API mit Streaming und Kontext-Schalter, Widget

**Validierung:**
- Ein manuell gestartetes Briefing erscheint, und jeder Punkt lässt sich einer Quelle zuordnen.
- Die Codex-Prozente stimmen mit der Logdatei überein.
- Eine Chat-Frage mit Kontext beantwortet „Wie viele ungelesene Mails habe ich?“ korrekt.

Das Verbrauchs-Widget hängt nicht von Mail und Messenger ab. Es kann schon nach Phase 2 gebaut werden, falls es früher gebraucht wird.

### Phase 7 – Feinschliff & Autostart (≈ 1 Session)
- ✅ `install-autostart.ps1` (geplante Aufgabe beim Login), Layout-Konfiguration, Fehlerzustände je Widget verfeinert

**Validierung:** Nach einem Neustart erscheint das Dashboard ohne manuelles Zutun.

## 13. Ausblick

- **Layout-Editor** in der UI (Drag & Drop, schreibt `dashboard.config.json`) und Hot-Reload neuer Widgets ohne Server-Neustart
- **Widgets aus eigenen npm-Paketen** oder Repos laden, mit derselben Vertragsprüfung
- **Electron-Shell** mit globalem Hotkey, Overlay „immer im Vordergrund“ und Tray, ohne Änderungen an Server und UI
- **Weitere Projekt-Widgets:** app-generator-dashboard (`data/factory.db`), Git-Status aller Repos unter `C:\_repos`
- **Aktionen:** Prozess hinter einem Port beenden, Claude-Session fokussieren, relaunch-radar-Autopilot starten und stoppen
- **Kalender** (Google/Outlook) und To-dos
- **Slack Web API** und **Lark Open API** für vollständige Verläufe statt nur Benachrichtigungen
- **Token-Verschlüsselung** über die Windows-DPAPI
- **Zugriff vom Handy** im LAN, mit Authentifizierung
- **Claude im Chat** (Modellwahl GPT/Claude pro Frage) und gespeicherter Chat-Verlauf
- **KI-Priorisierung** von Mails und Nachrichten (Dringlichkeit, Antwortvorschlag nur zur Anzeige)
- **Claude-Abo-Limits in %**, z. B. indem ein Statusline-Skript die von Claude Code gelieferten Limit-Daten in eine Datei schreibt, die das Dashboard liest

## 14. Risiken & Gegenmaßnahmen

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| Schema oder Speicherort von `wpndatabase.db` ändert sich mit Windows-Updates; die Datei ist gesperrt | Das Messenger-Widget fällt aus | Nur lesend öffnen, bei Sperre vorher kopieren; Parser mit Fixture-Tests; klarer `error`-Zustand statt leerer Liste; Slack- bzw. Graph-APIs als Ausweg |
| Messenger zeigen keine Toasts (Benachrichtigungen aus, Fokusmodus, App geschlossen) | Nachrichten fehlen | Grenze in der UI benennen („nur Nachrichten mit Benachrichtigung“); Benachrichtigungen für die relevanten Apps aktiviert lassen |
| OAuth-Einrichtung bei Google und Azure ist aufwendig, Tokens laufen ab | Mail-Widgets bleiben leer | Schritt-für-Schritt-Anleitung im README; Refresh-Tokens mit `offline_access`; abgelaufene Tokens zeigen `unconfigured` mit Re-Login-Link |
| WMI-/CIM-Abfragen sind auf dem Zielrechner extrem langsam (gemessen: `Get-NetTCPConnection` 49 s, `Win32_Process` 39 s, `si.mem()` 94 s) | Timeouts, gestapelte Prozesse, leere Widgets | Kein WMI/CIM in Collectors mit kurzem Intervall; `netstat`/`tasklist`/Node-`os`-APIs; jeden Systemaufruf vor der Nutzung messen; Scheduler startet keinen neuen Lauf, solange ein alter hängt |
| `claude -p` ist langsam (30–90 s), schlägt bei einem Login- oder Limit-Problem fehl oder ändert seine CLI-Flags | Kein bzw. veraltetes Briefing | Asynchroner Lauf mit Timeout; das letzte Briefing bleibt als `stale` sichtbar; Fehlertext aus stderr anzeigen; CLI-Aufruf gekapselt in `ai/briefing.ts` |
| Format der Session-Logs von Claude und Codex ist nicht offiziell dokumentiert und kann sich ändern | Verbrauchsanzeige falsch oder leer | Defensive zod-Parser, unbekannte Zeilen überspringen; Fixture-Tests mit echten Zeilen; bei Parse-Fehlern `error` statt falscher Zahlen |
| KI erfindet Inhalte im Briefing oder Chat | Falsche Prioritäten | Prompt verlangt ausschließlich Fakten aus dem Snapshot mit Quellenangabe; Briefing zeigt die Snapshot-Zeit; keine KI-Aktionen mit Wirkung |
| Kosten und Kontingent durch KI-Aufrufe | Unerwartete OpenAI-Kosten, weniger Claude-Kontingent für die eigentliche Arbeit | Briefing max. 1× automatisch pro Tag plus gedrosselte manuelle Läufe; Chat nur auf Anfrage; Kosten sichtbar im Verbrauchs-Widget |
| Lively startet nicht oder lädt die Seite bei Server-Neustarts nicht neu | Leerer Hintergrund | UI reconnectet selbst (SSE plus Retry); Autostart von Server und Lively in Phase 6 testen; die UI funktioniert auch im Browser als Ausweg |

## 15. Anhang

**Verwandte Dateien:**
- Plan: `C:\Users\benja\.claude\plans\ich-will-ein-dashboard-humming-comet.md`
- Server-Stil (Hono, zod, Repository): `C:\_repos\relaunch-radar\server\`
- relaunch-radar-Integrationspunkte: `/api/overview`, `/api/jobs/running`, `/api/notifications/stream`, `logs/notifications.json`
- UI-Vorlage (Grid, Registry): `C:\_repos\widget_dashboard\web-mockup\src\hub`, `src\widgets\registry.ts`

**Externe Abhängigkeiten:**
- Lively Wallpaper – https://www.rocksdanister.com/lively/
- Open-Meteo – https://open-meteo.com/en/docs
- Gmail API – https://developers.google.com/gmail/api
- Microsoft Graph Mail – https://learn.microsoft.com/graph/api/resources/mail-api-overview
- imapflow – https://imapflow.com
- Hono – https://hono.dev
- Claude Code CLI (headless mode) – https://docs.claude.com/en/docs/claude-code/sdk/sdk-headless
- OpenAI API (Responses, Costs) – https://platform.openai.com/docs/api-reference

**Port-Belegung auf dem Rechner (bekannt):**

| Port | Belegt durch |
|---|---|
| 3000 | relaunch-radar-API **und** app-generator-dashboard (Konflikt) |
| 5173 | Vite-Dev-Server (relaunch-radar, widget_dashboard) |
| 4700 | windowsDashboard (neu) |
| 5174 | Vite-Dev-Server von windowsDashboard (neu, nur in der Entwicklung) |
