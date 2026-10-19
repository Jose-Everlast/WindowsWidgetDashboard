# Feature: Phase 2 – Ports & Claude-Agents

Vor der Umsetzung lesen: `.agents/reference/widgets.md` (Collector-Regeln) und `.agents/reference/security.md`. Phase 1 (Commit `2da717a`) liefert Vertrag, Loader, Scheduler und Hub. Diese Phase fügt **nur** zwei Widget-Ordner und einen kleinen Helfer hinzu. Am Server-Kern und am Hub ändert sich nichts.

## Feature Description

Zwei neue Widgets:
1. **`ports`:** Welcher Prozess lauscht auf welchem TCP-Port? Typische Fälle sind `EADDRINUSE` oder die Frage, was gerade auf :3000 läuft.
2. **`agents`:** Welche Claude-Code- und Codex-Sessions sind in welchem Projekt aktiv, und wann waren sie zuletzt aktiv? Dazu kommt die Anzahl laufender `claude.exe`- und `codex`-Prozesse.

## User Stories
- Als Entwickler will ich sehen, welcher Prozess welchen Port belegt, damit ich bei `EADDRINUSE` sofort weiß, was ich beenden muss. Beispiel: `:3000 · node.exe · PID 18432 · relaunch-radar API`
- Als Entwickler will ich sehen, welche Claude- und Codex-Sessions in welchem Projekt laufen und wann sie zuletzt aktiv waren, damit ich hängende oder vergessene Sessions erkenne. Beispiel: `claude · windowsDashboard (main) · vor 20 s`

## Feature Metadata
**Type:** New Capability · **Complexity:** Medium · **Systems:** `widgets/ports`, `widgets/agents`, `server/lib/win.ts` · **Dependencies:** keine neuen npm-Pakete

---

## CONTEXT REFERENCES – VOR DER UMSETZUNG LESEN

- `shared/widget-contract.ts`: `defineManifest`, `defineCollector`, `WidgetProps`, `StatusView`
- `widgets/system/collector.ts`: Muster für einen Systemaufruf mit Modul-Cache (`DISK_TTL_MS`)
- `widgets/system/Widget.tsx`: Muster für eine eigene Kachel-UI (Tailwind-Tokens `text-muted`, `bg-line`, `text-good` …)
- `widgets/news/parse.ts` + `parse.test.ts`: Muster „reine Parse-Funktion + Test gegen aufgezeichnete echte Ausgabe“
- `widgets/contract.test.ts`: Jedes Widget braucht `README.md` und `fixtures/<id>.json`
- `dashboard.config.example.json`: Hier kommen die neuen Instanzen hinein.
- `PRD.md` Abschnitt 7, Messung: `netstat` 0,4 s, `tasklist` 1 s, WMI/CIM 39–94 s. **Kein PowerShell und kein WMI.**

### Gemessene Ausgabeformate (Zielrechner, deutsches Windows 11)

`netstat -ano` (Status-Spalte lokalisiert, in der OEM-Codepage: „ABH�REN“, daher **nicht** auswerten):
```
  Proto  Lokale Adresse         Remoteadresse          Status           PID
  TCP    0.0.0.0:135            0.0.0.0:0              ABH�REN         2032
  TCP    127.0.0.1:4700         0.0.0.0:0              ABH�REN         13004
  TCP    127.0.0.1:4700         127.0.0.1:61155        HERGESTELLT     13004
  TCP    [::]:135               [::]:0                 ABH�REN         2032
  UDP    0.0.0.0:5353           *:*                                    6816
```
**Regel:** Lauschend ist eine `TCP`-Zeile, deren Remoteadresse `0.0.0.0:0` oder `[::]:0` ist.

`tasklist /fo csv /nh` (Speicher lokalisiert, wird ignoriert):
```
"System","4","Services","0","17.568 K"
"claude.exe","40908","Console","1","541.856 K"
"codex-windows-sandbox-service.exe","39060","Services","0","7.264 K"
```

Claude-Session-Log `~/.claude/projects/<kodierter-pfad>/<sessionId>.jsonl`: Jede Nachrichtenzeile enthält u. a. `"cwd":"C:\\_repos\\windowsDashboard"`, `"gitBranch":"main"`, `"sessionId":"…"`, `"timestamp":"…"`. Die erste Zeile kann ein Eintrag ohne `cwd` sein (z. B. `summary`). Auf dem Rechner liegen 864 Dateien.

Codex-Session-Log `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl`, Datumsordner in **lokaler** Zeit. Die erste Zeile sieht so aus:
```json
{"timestamp":"…","type":"session_meta","payload":{"id":"…","cwd":"C:\\_repos\\relaunch-radar","originator":"codex_exec","source":"exec",…}}
```

---

## STEP-BY-STEP TASKS

### 1. CREATE `server/lib/win.ts` + `server/lib/win.test.ts`
- **IMPLEMENT** `run(cmd, args, { timeoutMs = 10_000, signal })`: `execFile` mit `windowsHide: true`, `encoding: "latin1"` und `maxBuffer: 8 MB`. Gibt stdout zurück; bei Exit-Code ≠ 0 oder Timeout wird geworfen. Läuft der Prozess nicht unter Windows (`process.platform !== "win32"`), mit `nur unter Windows verfügbar` werfen.
- **IMPLEMENT** `parseNetstatListeners(text): Array<{ port, address, pid }>`:
  - nur `TCP`-Zeilen mit Remote `0.0.0.0:0` oder `[::]:0` auswerten
  - Adresse und Port aus dem letzten `:` der lokalen Adresse lesen (IPv6 `[::1]:4700`)
  - nach `port + pid + address` deduplizieren
- **IMPLEMENT** `parseTasklist(text): Map<number, string>`: CSV mit Anführungszeichen. Nur Spalte 1 (Name) und Spalte 2 (PID) werden gelesen, Zeilen mit anderer Form werden übersprungen.
- **IMPLEMENT** `listListeners(signal)` und `listProcesses(signal)`. `listProcesses` cacht 5 s im Modul-Scope, weil Ports und Agents im selben Takt `tasklist` brauchen.
- **FIXTURES:** `server/lib/fixtures/netstat.txt` und `tasklist.csv` als **echte** Ausgaben per `netstat -ano > …` bzw. `tasklist /fo csv /nh > …` aufnehmen. Die tasklist-Datei auf etwa 40 Zeilen kürzen, darunter `System`, `node.exe` und `claude.exe`.
- **TESTS:**
  - Fixture-Parse liefert ≥ 1 Listener; jeder hat `port > 0` und `pid ≥ 0`; keine `HERGESTELLT`- und keine UDP-Einträge.
  - Zeile `[::1]:4700` → address `::1`, port 4700.
  - tasklist-Map enthält `4 → System`.
  - Kaputte Zeilen werden übersprungen.
- **GOTCHA:** Kein `shell: true`. Die Argumente sind fest, es gibt keine Nutzereingaben.
- **VALIDATE:** `npx vitest run server/lib`

### 2. CREATE `widgets/ports/*`
- **manifest:**
  - `id "ports"`, `title "Ports"`, `category "system"`, `defaultSize { w: 3, h: 3 }`, `intervalMs 10_000`, `timeoutMs 15_000`, `capabilities ["process"]`
  - `config`:
    ```ts
    z.object({
      minPort: z.number().int().min(0).default(1024),
      excludeProcesses: z.array(z.string()).default(["svchost.exe","lsass.exe","wininit.exe","services.exe","spoolsv.exe","System"]),
      labels: z.record(z.string().regex(/^\d+$/), z.string()).default({}),
    })
    ```
  - `data`: `{ listeners: [{ port, address, pid, process: string | null, label?: string }] }`
- **collector:**
  - `Promise.all([listListeners, listProcesses])`, danach filtern (`port >= minPort`, Prozess nicht in `excludeProcesses`, ohne Groß-/Kleinschreibung)
  - IPv4 und IPv6 desselben `port + pid` werden zu **einem** Eintrag zusammengeführt; als Adresse zählt die „offenste“ (`0.0.0.0` bzw. `::` vor `127.0.0.1`)
  - `label` kommt aus `config.labels[port]`
  - Sortierung nach Port
- **Widget.tsx:**
  - kompakte Tabelle aus Port (tabular-nums), Prozess und Label bzw. PID
  - Adressen auf `0.0.0.0` oder `::` bekommen einen kleinen Hinweis „Netzwerk“ in `text-warn`: Der Port ist im LAN erreichbar.
  - Bei mehr Zeilen als Platz wird gescrollt (`overflow-y-auto`).
- **fixtures/ports.json:** aus einem echten Collector-Lauf erzeugen (`UPDATE_FIXTURES`-Muster wie bei weather oder über ein tsx-Skript)
- **README.md:** Konfiguration, Beispiel `labels: { "3000": "relaunch-radar API", "4700": "Dashboard" }`
- **TESTS:** reine Funktion `buildListeners(listeners, processes, config)` gegen die Fixtures aus Task 1: Filter, Zusammenführen, Labels, Sortierung.
- **VALIDATE:** `npx vitest run widgets/ports`

### 3. CREATE `widgets/agents/*`
- **manifest:**
  - `id "agents"`, `title "Agents"`, `category "ai"`, `defaultSize { w: 3, h: 3 }`, `intervalMs 10_000`, `capabilities ["fs","process"]`
  - `config`:
    ```ts
    z.object({
      claudeDir: z.string().optional(),     // Default ~/.claude/projects
      codexDir: z.string().optional(),      // Default ~/.codex/sessions
      idleMinutes: z.number().min(1).default(15),
      windowHours: z.number().min(1).max(168).default(12),
      maxSessions: z.number().int().min(1).max(30).default(10),
    })
    ```
  - `data`:
    ```ts
    {
      processes: { claude: number, codex: number },
      sessions: [{ agent: "claude"|"codex", project: string, cwd: string, branch?: string, sessionId: string, lastActivity: string /*ISO*/, active: boolean, kind?: "interactive"|"exec" }],
    }
    ```
- **parse.ts:**
  - `claudeSessionInfo(tailText)`: Zeilen von hinten nach vorn per `JSON.parse` lesen; kaputte Zeilen und die angeschnittene erste Zeile werden übersprungen. Die erste Zeile mit `cwd` liefert `{ cwd, branch: gitBranch, sessionId }`.
  - `codexSessionInfo(headText)`: erste Zeile parsen; bei `type === "session_meta"` wird `{ cwd: payload.cwd, sessionId: payload.id, kind: payload.source === "exec" ? "exec" : "interactive" }` zurückgegeben.
  - `projectName(cwd)` liefert den letzten Pfadteil.
- **collector:**
  - **Claude:** Ordner unter `claudeDir` auflisten und darin die `*.jsonl` per `stat` prüfen. Dateien mit `mtime` älter als `windowHours` werden verworfen. Von den übrigen werden die letzten 64 KB gelesen (`fs.open` + `read` ab `size - 65536`).
  - **Codex:** Datumsordner für heute und die Vortage bis `windowHours` (lokale Zeit) prüfen. Von den Dateien werden die ersten 16 KB gelesen.
  - `lastActivity` ist die `mtime`, und `active = now - mtime < idleMinutes`.
  - Sortierung nach `lastActivity` absteigend, Begrenzung auf `maxSessions`.
  - Prozesse kommen aus `listProcesses()`: `claude.exe` wird gezählt; bei Codex zählt `^codex(\.exe)?$`, Dienste wie `codex-windows-sandbox-service.exe` zählen nicht.
  - Fehlende Ordner (z. B. kein Codex installiert) sind **kein** Fehler, sondern ergeben eine leere Liste. Liefern **beide** Quellen nichts und laufen keine Prozesse, ist das ein gültiger leerer Zustand.
- **Widget.tsx:**
  - Kopfzeile „6 Claude · 0 Codex Prozesse“
  - Liste: Punkt (aktiv `bg-good`, inaktiv `bg-muted`), Agent-Badge, Projekt plus `(branch)` sowie „exec“ bei Codex-Exec-Läufen; rechts die relative Zeit
  - `relativeTime` aus `web/src/lib/time.ts` importieren (relativer Import `../../web/src/lib/time`)
- **FIXTURES:**
  - `fixtures/claude-tail.jsonl` aus 3–4 **echten** Zeilen einer Session (Nachrichtentexte durch `"…"` ersetzen, Struktur und Felder beibehalten; die erste Zeile absichtlich angeschnitten)
  - `fixtures/codex-head.jsonl`: echte erste Zeile, `base_instructions` gekürzt
  - `fixtures/agents.json` aus einem echten Collector-Lauf
- **TESTS:**
  - `claudeSessionInfo` und `codexSessionInfo` gegen die Fixtures
  - Collector gegen ein tmp-Verzeichnis mit der Ordnerstruktur aus den Fixtures (`utimes` für aktiv bzw. inaktiv bzw. außerhalb des Fensters), `processes` injiziert. Dafür bekommt der Collector-Kern eine Funktion `collectAgents({ claudeDir, codexDir, now, processes, … })`. Der Collector ist nur ein dünner Wrapper.
  - fehlende Ordner ergeben eine leere Liste
- **VALIDATE:** `npx vitest run widgets/agents`

### 4. UPDATE `dashboard.config.example.json` und README
- **ADD** Instanzen:
  - `{ "instance": "ports", "type": "ports", "x": 0, "y": 3, "config": { "labels": { "3000": "relaunch-radar API", "4700": "Dashboard", "5173": "Vite (relaunch-radar)", "5174": "Vite (Dashboard)" } } }`
  - `{ "instance": "agents", "type": "agents", "x": 3, "y": 3 }`
- **GOTCHA:** Die lokale `dashboard.config.json` ist gitignored und existiert schon. Die beiden Einträge dort ebenfalls ergänzen und den Nutzer darauf hinweisen.
- README: Widget-Liste um Ports und Agents ergänzen.
- **VALIDATE:** `npx vitest run widgets/contract`

### 5. Gesamtvalidierung
- `npm run check`
- Smoke-Test:
  - `npm start`, dann `curl /api/widgets/ports`; die Ports müssen mit `netstat -ano | findstr 0.0.0.0:0` übereinstimmen und 4700 mit Label „Dashboard“ enthalten.
  - `curl /api/widgets/agents` muss diese Session (`windowsDashboard`, `main`, aktiv) enthalten.
- Laufzeit messen: Beide Collectors müssen in ≤ 3 s fertig sein (Server-Log oder Zeitmessung per tsx).

---

## ACCEPTANCE CRITERIA
- [ ] `npm run check` ist grün; der Vertragstest deckt `ports` und `agents` ab.
- [ ] Kein PowerShell, kein WMI/CIM; `server/lib/win.ts` nutzt nur `netstat` und `tasklist` per `execFile` ohne Shell.
- [ ] Ports stimmen mit `netstat -ano` überein; IPv4 und IPv6 werden zusammengeführt; Systemprozesse sind ausgeblendet; Labels wirken.
- [ ] Die aktuelle Claude-Session erscheint mit Projekt, Branch und „aktiv“. Codex-Sessions der letzten `windowHours` erscheinen mit Projekt.
- [ ] Fehlende Codex- oder Claude-Ordner führen nicht zu einem Fehler.
- [ ] Laufzeit je Collector ≤ 3 s auf dem Zielrechner.
- [ ] Am Server-Kern (`server/*.ts` außer `lib/win.ts`) und am Hub (`web/src/hub`) ist nichts geändert. Das belegt den Widget-Vertrag.

## NOTES
- **Kein PID → Projekt-Mapping für Ports:** Dafür bräuchte es die Kommandozeile, also WMI (39 s). Stattdessen gibt es `labels` in der Config. Mögliche spätere Option: CIM-Abfrage in einem separaten Collector mit Intervall ≥ 5 min.
- **Agents ohne PID-Zuordnung:** Sessions kommen aus den Logs, Prozesse werden nur gezählt. Eine Session gilt als „aktiv“, wenn ihr Log zuletzt geändert wurde. Das ist genauer als „Prozess läuft“, denn eine offene, aber untätige Session ist für den Nutzer „inaktiv“.
- **Confidence:** 9/10.
