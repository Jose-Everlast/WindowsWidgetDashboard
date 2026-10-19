# Code Review: Phase 2 – Ports & Agents

**Date:** 2026-10-19
**Scope:** uncommitted Phase 2 changes: `server/lib/win.ts` (+ tests and fixtures), `widgets/ports/**`, `widgets/agents/**`, `README.md`, `dashboard.config.example.json`. Reviewed against `.agents/plans/phase-2-ports-and-agents.md`, `.agents/reference/widgets.md` and `security.md`.
**Method:** independent reviewer (subagent, read only). Each finding is backed by a script against real data (864 Claude logs, `TZ=Europe/Berlin`) or by reading the code. Tests in scope: 36 green.

## Stats
- Files modified: 2 (`README.md`, `dashboard.config.example.json`)
- Files added: 21 (`server/lib/` 5, `widgets/ports/` 7, `widgets/agents/` 9)
- Files deleted: 0
- Lines added / removed: ~+990 / -6

## Findings

### 1. Sessions disappear when the last 64 KB contain no line with `cwd`
- **Severity:** medium
- **File:** widgets/agents/collect.ts:82, widgets/agents/parse.ts:24
- **Issue:** `claudeSessionInfo` only sees the last 64 KB. If a line over 64 KB (a large tool result) is followed only by short lines without `cwd`, the result is null and the session is dropped.
- **Why it matters:** 10 of 864 real logs (1.2 %) are affected. The active session can be among them, and it then wrongly shows up as "not running".
- **Suggestion:** if the tail yields null, also read the first 16 KB of the file (the early lines contain `cwd` and `sessionId`).
- **Verified:** yes (script over the real tails, only line lengths were measured)

### 2. `codexDateDirs` skips a date folder on the DST day
- **Severity:** medium
- **File:** widgets/agents/parse.ts:53-59
- **Issue:** It steps back in fixed 24-hour blocks. `codexDateDirs(new Date(2026,2,30,0,30), 12)` returns `["2026/03/30","2026/03/28"]`, so 03/29 is missing. In autumn the same folder appears twice.
- **Why it matters:** On the day after the switch to summer time, the Codex sessions of the previous afternoon/evening are missing.
- **Suggestion:** step in calendar days with `new Date(y, m, d - i)` until the local date of `now - windowHours` is reached.
- **Verified:** yes (tsx with `TZ=Europe/Berlin`)

### 3. One bad folder, one bad file or a failed `tasklist` breaks the whole Agents widget
- **Severity:** medium
- **File:** widgets/agents/collect.ts:22-28, 66, 82-84; widgets/agents/collector.ts:17
- **Issue:** Each of these causes the whole collect to fail:
  - `listDir` only tolerates ENOENT, not ENOTDIR (a file inside `claudeDir`) or EACCES/EPERM.
  - `readRange` fails on a file that was deleted between `stat` and `open`.
  - `tasklist` fails, although it only provides the process counter.
- **Why it matters:** It breaks rule 5 in `widgets.md` (tolerate partial failures). One broken folder stops the widget from showing any session at all.
- **Suggestion:** skip and log per folder and per file; use `Promise.allSettled` for the Claude logs, the Codex logs and the processes. If `tasklist` fails, show the counter as unknown, not a widget error.
- **Verified:** yes (ENOTDIR for `readdir` on a file confirmed in a temp folder); the rest from reading the code

### 4. Which address wins in the Ports merge depends on input order, so LAN exposure gets lost
- **Severity:** low
- **File:** widgets/ports/parse.ts:27
- **Issue:** `[127.0.0.1:3000, 192.168.1.5:3000]` for the same PID keeps only `127.0.0.1`, so the "Netz" badge disappears. netstat lists loopback addresses before LAN addresses.
- **Suggestion:** rank addresses: wildcard > LAN > loopback.
- **Verified:** yes (tsx)

### 5. The `tasklist` cache shares the first caller's AbortSignal
- **Severity:** low
- **File:** server/lib/win.ts:73-76
- **Issue:** If the Ports run is aborted, Agents gets the same rejection. Process names can also be up to 5 s older than netstat.
- **Suggestion:** start the shared call without the caller's signal; each caller applies its own signal via `Promise.race`.
- **Verified:** code reading plus the scheduler's abort behaviour

### 6. Personal data in the fixtures
- **Severity:** low (privacy, not security: no secrets, tokens or email)
- **File:**
  - widgets/agents/fixtures/claude-tail.jsonl: `slug` taken from the first prompt, a `toolu_…` id
  - codex-head.jsonl: `commit_hash`
  - agents.json: Windows username, private repo paths, real session UUIDs
- **Suggestion:** replace the slug and tool id with "…" and anonymise usernames and paths in `agents.json`.
- **Verified:** yes (grep)

### 7. Tests and fixtures are narrower than the plan
- **Severity:** low
- **Issue:**
  - The tasklist fixture has 15 lines (plan: about 40), and the netstat fixture has no `HERGESTELLT` line.
  - Tests are missing for: tails over 64 KB, DST date folders, ENOTDIR/EACCES, cache eviction in `listProcesses`, and the order-dependent IPv4/IPv6 merge.
  - The existing tests make real assertions.
- **Suggestion:** for every fix from 1 to 5, add the test that would have caught it.
- **Verified:** yes (test review)

### 8. `latin1` decoding garbles non-ASCII process names
- **Severity:** low
- **File:** server/lib/win.ts:22
- **Issue:** `tasklist` outputs in the OEM codepage (cp850). Only the display and the `excludeProcesses` match would be affected.
- **Verified:** unverified (no process with umlauts available)

### Checked and fine
- **netstat parsing:**
  - CRLF, IPv6 brackets, zone-ids
  - the garbled status column is not read
  - short lines, UDP, TIME_WAIT and duplicates are handled
- **tasklist parsing:** commas inside image names are fine.
- **Command execution:**
  - `execFile` without a shell, `windowsHide`, 10-s timeout
  - error message when the command is missing
  - non-Windows guard
- **Cache:** a failed call is evicted.
- **Logs:**
  - a UTF-8 split at the 64 KB edge only touches the discarded first line
  - sorting, `maxSessions` and the active/idle calculation work
  - sessionIds are unique
- **Speed:** the Agents collect takes 40–60 ms on 864 real files, even with 168 h; the limit is 3 s.
- **No content leaks:** only `cwd`, branch and `sessionId` go into the payload.
- **Core unchanged:** `git diff` is empty for `server/*.ts`, `web/src/hub` and `shared`.

## Rule Violations
- **Finding 3** breaks `.agents/reference/widgets.md` rule 5 ("tolerate partial failures"). The rule is clear but too narrow: it only names "several sources", not "many files or folders of one source". Suggested addition: "Iterate per entry (folder, file, feed) with `allSettled` or try/catch; one broken entry must never fail the whole widget. Auxiliary data (e.g. counters) is optional."
- **Finding 6** touches the fixture rule ("anonymised"): `widgets.md` only demands "real", not explicitly "without personal data". Suggested addition: "Replace usernames, private paths, prompt-derived slugs and IDs in fixtures."
- **Finding 2** is not a rule violation, but worth a rule: "Never compute local date folders in 24-hour steps (DST), always in calendar days."

## Summary
Overall: NEEDS FIXES. 3 medium findings (1–3) affect correctness on real data. Findings 4–8 are low.
