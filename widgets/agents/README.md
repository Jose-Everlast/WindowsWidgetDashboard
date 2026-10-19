# agents – Claude- und Codex-Sessions

Zeigt, welche Claude-Code- und Codex-Sessions in welchem Projekt (inkl. Git-Branch) zuletzt aktiv waren, dazu die Zahl laufender `claude.exe`- bzw. `codex`-Prozesse. Eine Session gilt als **aktiv**, wenn ihr Log in den letzten `idleMinutes` geschrieben wurde. Eine offene, aber untätige Session erscheint also als inaktiv.

## Datenquellen

- **Claude Code:** `~/.claude/projects/<projekt>/<sessionId>.jsonl`. Gelesen werden die letzten 64 KB, daraus kommen `cwd`, `gitBranch` und `sessionId`.
- **Codex:** `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Gelesen wird die erste Zeile (`session_meta`), daraus kommen `cwd`, `source` (`exec` = automatischer Lauf) und der Git-Branch.
- **Prozesse:** `tasklist`, geteilt mit dem Ports-Widget. Es gibt bewusst kein WMI, siehe PRD Abschnitt 7.

Nachrichteninhalte werden nicht gelesen und nicht angezeigt. Fehlt ein Ordner (z. B. ohne Codex), bleibt die Liste einfach leer.

## Konfiguration

```json
{ "instance": "agents", "type": "agents", "x": 3, "y": 3,
  "config": { "idleMinutes": 15, "windowHours": 12, "maxSessions": 10 } }
```

`claudeDir` und `codexDir` sind optional; Standard ist jeweils der Ordner im Benutzerverzeichnis.

## Fixtures

`claude-tail.jsonl` und `codex-head.jsonl` sind echte Log-Zeilen vom 2026-10-19, in denen Nachrichteninhalte und die Repo-URL durch „…“ ersetzt sind. `agents.json` ist die Payload eines echten Laufs.
