# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**windowsDashboard** is a personal dashboard for one Windows 11 machine. It is shown as an interactive desktop wallpaper through [Lively Wallpaper](https://www.rocksdanister.com/lively/). A local Node server collects data from widgets (weather, news, system, ports, Claude/Codex agents, relaunch-radar, …) and serves a React UI on `http://127.0.0.1:4700`. It reads data only. It never sends mail or messages and never changes foreign tools. `PRD.md` is the north star; phases 1–3 of 7 are done.

## Tech Stack

| Technology | Purpose |
|---|---|
| Node 24 + TypeScript ~5.9 (strict, ESM) | one npm package, no workspaces. **Not TS 7**: typescript-eslint needs < 6.1 |
| Hono 4 + @hono/node-server | API, SSE stream, serves the built UI |
| zod 4 | config, widget payloads, foreign API input (`z.url`, `z.prettifyError`, `z.toJSONSchema`) |
| React 19 + Vite 8 + Tailwind 4 | UI; dark theme only (it is a wallpaper) |
| Vitest 5 (+ jsdom, Testing Library) | unit and integration tests, colocated `*.test.ts(x)` |
| tsx | runs the server in dev **and** prod (the server is never compiled) |

## Commands

```bash
npm run dev          # API (tsx watch, :4700) + Vite (:5174, proxies /api)
npm run build        # UI → dist/web
npm start            # server, serves API + built UI on 127.0.0.1:4700
npm test             # vitest run
npx vitest run widgets/ports        # single folder or file
npm run lint / npm run typecheck
npm run check        # typecheck + lint + test + build: must be green before a commit
npm run new-widget <id> [--view list|stat|progress|status|markdown]
UPDATE_FIXTURES=1 npx vitest run widgets/<id>   # regenerate expected payload fixtures
```

On this machine, run test and npm commands through **Bash**, not PowerShell: piping `vitest` through PowerShell's `Select-Object` hangs after the tests have passed. A PostToolUse hook (`.claude/settings.json`) runs `typecheck` after every Edit/Write. Errors it reports in the middle of a multi-file change are usually just intermediate states.

Ports: 3000 = relaunch-radar API, 5173 = relaunch-radar Vite, 4700 = this server, 5174 = this Vite.

## Architecture

```
server/   index.ts (bootstrap) → app.ts (guard, routes, static) · scheduler.ts · cache.ts
          widgets/loader.ts (discovers widgets/*/) · guard.ts · lib/win.ts · lib/sse.ts
web/src/  hub/ (DashboardProvider: layout + SSE + watchdog; Hub grid; WidgetFrame + ErrorBoundary)
          views/ (generic WidgetView renderers) · lib/ (openUrl, time)
shared/   widget-contract.ts (THE contract) · api.ts (response types)
widgets/<id>/  manifest.ts · collector.ts · [Widget.tsx] · [parse.ts] · fixtures/<id>.json · README.md
dashboard.config.json   instances + grid (gitignored; dashboard.config.example.json is tracked)
```

- **Data flow:**
  1. The scheduler polls each instance (`intervalMs`, timeout, no overlap, no pile-up of hung runs). A collector may also `subscribe()` and call `ctx.refresh()` to request an immediate collect; push never carries data itself.
  2. The result is validated against `manifest.data` and goes into the cache.
  3. The cache emits a change, which `/api/stream` (SSE) sends as `snapshot` / `widget` / `ping`.
  4. The UI renders `Widget.tsx`, or `GenericView` when a widget has no `Widget.tsx`.
- **Status per instance:** `ok | stale | unconfigured | error`. A failure keeps the last data as `stale`. A broken instance never affects others or the server.
- **Adding a widget never touches the core:** create the folder (`npm run new-widget`), add an instance to `dashboard.config.json`, restart. `widgets/contract.test.ts` checks every folder.

## Code Patterns

- Relative imports without `.js`; `@shared/*` alias; `import type` (verbatimModuleSyntax).
- **Files:**
  - kebab-case files, PascalCase components, kebab-case widget and instance IDs (= folder name).
  - `manifest.ts`, `parse.ts` and `Widget.tsx` must not import Node APIs (they are bundled for the browser); Node code lives in `collector.ts` / `collect.ts`.
  - The testable core goes into a pure, injectable function (e.g. `collectAgents`, `collectRelaunchRadar`); `collector.ts` stays a thin wrapper.
- **Errors and logging:**
  - Routes throw `HttpError` (`server/http.ts`); `app.onError` maps it to JSON.
  - Collector errors never reach HTTP; the scheduler turns them into widget status.
  - Logging is `log(scope, …)` / `logError(scope, …)` from `server/log.ts`, scope e.g. `widget:ports/ports`. Repeated failures are logged only on a status change.
- **Domain wording:** code comments are in English; UI texts, READMEs, PRD and plans are in German.

## Hard Rules

- **No mocks or fake data in runtime code.** Missing config → `manifest.env` → `unconfigured`. Fixtures are real recordings, anonymized.
- **No WMI/CIM/PowerShell in collectors with short intervals.** Measured here: `Get-NetTCPConnection` 49 s, `Win32_Process` 39 s, `si.mem()` 94 s. Use `netstat`/`tasklist` via `server/lib/win.ts` and Node `os`, and measure any new system call first.
- **Security:**
  - Bind only to localhost.
  - Every request passes `localGuard` (Host check; state-changing `/api` calls need JSON + an allowed Origin).
  - Foreign URLs go out only as a normalized href via `rundll32` (`POST /api/open`).
  - Render foreign data as text only.
- **Hands off foreign tools:** never trigger jobs in relaunch-radar or stop its server without asking the user first.
- **Secrets only in `.env`** (`.env.example` stays complete). Non-secret widget settings belong in `dashboard.config.json`.

## Workflow

PIV loop with the commands in `.claude/commands/`:
1. `/prime`
2. `/plan-feature` (writes to `.agents/plans/`)
3. `/execute`
4. `/validate`
5. `/code-review` (report to `.agents/code-reviews/`) → `/code-review-fix`
6. `/commit` (one atomic Conventional Commit, never push)

When a review finds a mistake that a rule would have prevented, update the rule in `.agents/reference/` too. `/e2e-test` does not run on native Windows; check the UI with the Chrome tools against `http://127.0.0.1:4700` instead.

## On-Demand Context

Read these reference docs when working in the relevant area:

| When working on... | Read |
|---|---|
| A new or changed widget, collectors, fixtures, push/SSE sources, system calls | `.agents/reference/widgets.md` |
| Routes, the guard, links/URLs, rendering foreign data, anything reachable from the browser | `.agents/reference/security.md` |
| Writing or fixing tests: local HTTP servers, fake timers, jsdom, fixture recording | `.agents/reference/testing.md` |
| Scope, phases, data sources, API spec, risks | `PRD.md` |
| The current or next phase in detail | latest file in `.agents/plans/` |
