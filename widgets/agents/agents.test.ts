import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectAgents } from "./collect";
import { AgentsData } from "./manifest";
import { claudeSessionInfo, codexDateDirs, codexSessionInfo, projectName } from "./parse";

// Real log lines with message contents replaced by "…"; the first Claude line is cut like a mid-file tail.
const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const claudeTail = readFileSync(fixture("claude-tail.jsonl"), "utf8");
const codexHead = readFileSync(fixture("codex-head.jsonl"), "utf8");

describe("session log parsing", () => {
  it("reads cwd, branch and session id from a real Claude tail", () => {
    expect(claudeSessionInfo(claudeTail)).toEqual({
      cwd: "C:\\_repos\\windowsDashboard",
      sessionId: "00000000-0000-4000-8000-0000000000c1",
      branch: "main",
    });
    expect(claudeSessionInfo("kaputt\n{}")).toBeNull();
    // Folders without a branch: Claude writes "HEAD", which is no useful label.
    expect(claudeSessionInfo('{"cwd":"C:\\\\x","sessionId":"s","gitBranch":"HEAD"}')).toEqual({ cwd: "C:\\x", sessionId: "s" });
  });

  it("reads cwd and exec kind from a real Codex session_meta line", () => {
    expect(codexSessionInfo(codexHead)).toEqual({
      cwd: "C:\\_repos\\relaunch-radar",
      sessionId: "00000000-0000-4000-8000-0000000000d1",
      kind: "exec",
      branch: "master",
    });
    expect(codexSessionInfo('{"type":"response_item"}')).toBeNull();
  });

  it("derives project names and local date folders", () => {
    expect(projectName("C:\\_repos\\windowsDashboard")).toBe("windowsDashboard");
    expect(projectName("/home/x/proj/")).toBe("proj");
    expect(codexDateDirs(new Date(2026, 9, 19, 10), 12)).toEqual(["2026/10/19", "2026/10/18"]);
    expect(codexDateDirs(new Date(2026, 9, 19, 14), 12)).toEqual(["2026/10/19"]);
  });

  it("steps in calendar days across DST changes", () => {
    // Day after the spring change (23-hour 29th): the 29th must not be skipped.
    expect(codexDateDirs(new Date(2026, 2, 30, 0, 30), 12)).toEqual(["2026/03/30", "2026/03/29"]);
    // Autumn change (25-hour 25th): no duplicate folder (the old 24 h stepping returned the 25th twice).
    expect(codexDateDirs(new Date(2026, 9, 25, 23, 30), 26)).toEqual(["2026/10/25", "2026/10/24"]);
    expect(codexDateDirs(new Date(2026, 9, 3, 12), 72)).toEqual(["2026/10/03", "2026/10/02", "2026/10/01", "2026/09/30"]);
  });
});

describe("collectAgents", () => {
  let root: string;
  const now = new Date("2026-10-19T12:00:00Z");
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wd-agents-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function place(src: string, ...parts: string[]) {
    const file = join(root, ...parts);
    mkdirSync(join(file, ".."), { recursive: true });
    copyFileSync(fixture(src), file);
    return file;
  }

  const base = (overrides: Partial<Parameters<typeof collectAgents>[0]> = {}) => ({
    claudeDir: join(root, "claude"),
    codexDir: join(root, "codex"),
    now,
    idleMinutes: 15,
    windowHours: 12,
    maxSessions: 10,
    processes: new Map([
      [1, "claude.exe"],
      [2, "Claude.exe"],
      [3, "codex.exe"],
      [4, "codex-windows-sandbox-service.exe"],
      [5, "node.exe"],
    ]),
    ...overrides,
  });

  it("lists active and idle sessions newest first and skips old ones", async () => {
    utimesSync(place("claude-tail.jsonl", "claude", "C---repos-windowsDashboard", "a.jsonl"), at(1), at(1));
    utimesSync(place("claude-tail.jsonl", "claude", "C---repos-windowsDashboard", "old.jsonl"), at(24 * 60), at(24 * 60));
    const [y, m, d] = codexDateDirs(now, 12)[0]!.split("/");
    utimesSync(place("codex-head.jsonl", "codex", y!, m!, d!, "rollout-x.jsonl"), at(60), at(60));
    place("claude-tail.jsonl", "claude", "C---repos-windowsDashboard", "notes.txt");

    const data = await collectAgents(base());
    expect(AgentsData.safeParse(data).success).toBe(true);
    expect(data.processes).toEqual({ claude: 2, codex: 1 });
    expect(data.sessions.map(s => [s.agent, s.project, s.active])).toEqual([
      ["claude", "windowsDashboard", true],
      ["codex", "relaunch-radar", false],
    ]);
    expect(data.sessions[1]?.kind).toBe("exec");
  });

  it("finds the session when a huge last line pushes every cwd out of the 64 KB tail", async () => {
    // Shape seen in 10 of 864 real logs: an early line with cwd, a > 64 KB tool result, then short lines without cwd.
    const file = join(root, "claude", "p", "big.jsonl");
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(
      file,
      [
        JSON.stringify({ type: "user", cwd: "C:\\_repos\\big", sessionId: "s-big", gitBranch: "main" }),
        JSON.stringify({ type: "user", toolUseResult: "x".repeat(70_000) }),
        JSON.stringify({ type: "atis-latch", sessionId: "s-big" }),
        JSON.stringify({ type: "last-prompt" }),
      ].join("\n") + "\n",
    );
    utimesSync(file, at(1), at(1));
    const data = await collectAgents(base());
    expect(data.sessions).toEqual([expect.objectContaining({ project: "big", sessionId: "s-big", branch: "main", active: true })]);
  });

  it("skips broken entries instead of failing the widget", async () => {
    const logs: unknown[][] = [];
    utimesSync(place("claude-tail.jsonl", "claude", "C---repos-windowsDashboard", "a.jsonl"), at(1), at(1));
    // A stray file directly in claudeDir (ENOTDIR) and a session file that is a directory (read fails).
    writeFileSync(join(root, "claude", "stray.txt"), "x");
    mkdirSync(join(root, "claude", "p", "weird.jsonl"), { recursive: true });
    // tasklist failed: counters unknown, sessions still listed.
    const data = await collectAgents(base({ processes: null, log: (...a) => logs.push(a) }));
    expect(data.processes).toEqual({ claude: null, codex: null });
    expect(data.sessions.map(s => s.project)).toEqual(["windowsDashboard"]);
    expect(AgentsData.safeParse(data).success).toBe(true);
  });

  it("treats missing folders as no sessions and honours maxSessions", async () => {
    expect((await collectAgents(base())).sessions).toEqual([]);
    for (const n of [1, 2, 3]) utimesSync(place("claude-tail.jsonl", "claude", "p", `${n}.jsonl`), at(n), at(n));
    expect((await collectAgents(base({ maxSessions: 2 }))).sessions).toHaveLength(2);
  });
});
