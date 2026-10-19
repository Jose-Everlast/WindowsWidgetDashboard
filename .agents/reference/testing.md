# Testing

Load this before writing or fixing tests. The test framework is Vitest 5. Tests sit next to the code (`*.test.ts` / `*.test.tsx`). Test helpers are imported explicitly (`import { describe, expect, it, vi } from "vitest"`); globals are not used. The include globs are set in `vitest.config.ts`.

## Principles

- **No mocks of external services.** Network paths are tested against a **real local `node:http` server** on port 0, e.g. `widgets/external/collector.test.ts`, `widgets/news/collector.test.ts`, `widgets/relaunch-radar/collector.test.ts` and `server/lib/sse.test.ts`.
  - `vi.mock` is only allowed for the app's own UI helpers, e.g. `openUrl` in `web/src/views/GenericView.test.tsx`.
  - Test doubles for the widget contract itself are fine (the fake collectors in `server/scheduler.test.ts`).
- **Parsers are tested against recorded real output.** Examples: `server/lib/fixtures/netstat.txt`, `widgets/news/fixtures/*.xml`, `widgets/weather/fixtures/forecast.json`, `widgets/relaunch-radar/fixtures/*.json`. Every fixture is anonymized; see `widgets.md` → Tests.
- **Expected payloads** (`fixtures/<id>.json`) are generated from the recordings with `UPDATE_FIXTURES=1 npx vitest run widgets/<id>`. The contract test checks them against `manifest.data`.
- **Every bug fix gets the test that would have caught it.** That test must fail without the fix.

## Patterns

**Routes:** use `createApp(deps)` with injected cache/scheduler/openUrl and `app.request(...)`; no listening server is needed. Without a `Host` header the guard sees `localhost`, so tests put `"localhost"` in `allowedHosts` (see `server/app.test.ts`).

**Timing:** `vi.useFakeTimers()` together with `vi.advanceTimersByTimeAsync(ms)` and a `flush()` helper for microtasks, as in `server/scheduler.test.ts`. Use fake timers for scheduler logic. Real-socket tests use real timers plus `expect.poll(...)` (see the `subscribe` test in `widgets/relaunch-radar/collector.test.ts`).

**Files and folders:**
- Use `mkdtempSync(join(tmpdir(), "wd-…"))` and remove it in `afterEach`.
- Control mtime with `utimesSync` (see `widgets/agents/agents.test.ts`).
- Dynamically imported widgets need `zod` resolution, so they go under `node_modules/.tmp/` (see `server/widgets/loader.test.ts`).

**React components:** put `// @vitest-environment jsdom` on the first line and use Testing Library (`render`, `screen`, `fireEvent`); `cleanup` runs in `afterEach`.

**Unhandled rejections:** where a code path could crash Node, assert with `process.on("unhandledRejection", spy)` that nothing leaks (see `server/scheduler.test.ts`, BigInt case).

## Pitfalls (each has actually happened here)

- **SSE test servers:** call `res.flushHeaders()` when nothing is sent on connect. Otherwise Node holds the headers back and `fetch` waits forever.
- **Time zones and DST:** date logic must give the same result in Europe/Berlin and UTC. Check with `TZ=UTC npx vitest run <path>`. Pick test times that are unambiguous on DST days (the 25.10. has 25 hours).
- **PowerShell:** `npx vitest … | Select-Object` hangs after the run. Use the Bash tool.
- **Assertions:** check your own expectations. A failing new test may mean the expectation is wrong; prove which side is right before changing code.
- **Fixture trimming:** after cutting a fixture down, make sure every case the tests need is still in it (e.g. an ESTABLISHED line, each process type, `rate` and `failed` entries).

## Validation

```bash
npx vitest run <path>   # while working
npm run check           # before a commit: typecheck + lint + test + build
```
