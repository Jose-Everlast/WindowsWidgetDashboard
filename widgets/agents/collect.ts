import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgentSession, AgentsData } from "./manifest";
import { claudeSessionInfo, codexDateDirs, codexSessionInfo, projectName, type SessionInfo } from "./parse";

const TAIL_BYTES = 64 * 1024;
const HEAD_BYTES = 16 * 1024;

async function readRange(file: string, size: number, fromEnd: boolean, bytes: number): Promise<string> {
  const fh = await open(file, "r");
  try {
    const length = Math.min(bytes, size);
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, fromEnd ? size - length : 0);
    return buf.toString("utf8");
  } finally {
    await fh.close();
  }
}

type Log = (...args: unknown[]) => void;

/**
 * One broken entry must never fail the widget (widgets.md rule 5): a missing folder (Codex not
 * installed), a stray file (ENOTDIR) or a folder without permission is skipped.
 */
async function listDir(dir: string, log: Log): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") log(`übersprungen: ${dir} (${code ?? (err as Error).message})`);
    return [];
  }
}

interface Candidate {
  file: string;
  mtimeMs: number;
  size: number;
}

async function recentJsonl(dirs: string[], sinceMs: number, log: Log): Promise<Candidate[]> {
  const result: Candidate[] = [];
  for (const dir of dirs) {
    for (const name of await listDir(dir, log)) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join(dir, name);
      const s = await stat(file).catch(() => null);
      if (s?.isFile() && s.mtimeMs >= sinceMs) result.push({ file, mtimeMs: s.mtimeMs, size: s.size });
    }
  }
  return result;
}

/**
 * Claude logs: the newest line with cwd is in the tail. When a huge line (a large tool result) is
 * followed only by lines without cwd, the tail has none: fall back to the head of the file.
 */
async function claudeInfo(c: Candidate): Promise<SessionInfo | null> {
  const fromTail = claudeSessionInfo(await readRange(c.file, c.size, true, TAIL_BYTES));
  if (fromTail || c.size <= TAIL_BYTES) return fromTail;
  return claudeSessionInfo(await readRange(c.file, c.size, false, HEAD_BYTES));
}

export interface CollectAgentsOptions {
  claudeDir: string;
  codexDir: string;
  now: Date;
  idleMinutes: number;
  windowHours: number;
  maxSessions: number;
  /** null when tasklist failed: the counters are optional, the sessions are not. */
  processes: Map<number, string> | null;
  log?: Log;
}

export async function collectAgents(o: CollectAgentsOptions): Promise<AgentsData> {
  const log = o.log ?? (() => {});
  const sinceMs = o.now.getTime() - o.windowHours * 3_600_000;
  const idleMs = o.idleMinutes * 60_000;

  const claudeProjects = (await listDir(o.claudeDir, log)).map(p => join(o.claudeDir, p));
  const codexDays = codexDateDirs(o.now, o.windowHours).map(d => join(o.codexDir, ...d.split("/")));
  const [claudeFiles, codexFiles] = await Promise.all([
    recentJsonl(claudeProjects, sinceMs, log),
    recentJsonl(codexDays, sinceMs, log),
  ]);

  const toSession = async (
    agent: AgentSession["agent"],
    c: Candidate,
    read: (c: Candidate) => Promise<SessionInfo | null>,
  ): Promise<AgentSession | null> => {
    let info: SessionInfo | null;
    try {
      info = await read(c);
    } catch (err) {
      // Deleted between stat and open, locked, …: skip this file only.
      log(`übersprungen: ${c.file} (${(err as NodeJS.ErrnoException).code ?? (err as Error).message})`);
      return null;
    }
    return (
      info && {
        agent,
        project: projectName(info.cwd),
        cwd: info.cwd,
        sessionId: info.sessionId,
        lastActivity: new Date(c.mtimeMs).toISOString(),
        active: o.now.getTime() - c.mtimeMs < idleMs,
        ...(info.branch && { branch: info.branch }),
        ...(info.kind && { kind: info.kind }),
      }
    );
  };

  const sessions = (
    await Promise.all([
      ...claudeFiles.map(c => toSession("claude", c, claudeInfo)),
      ...codexFiles.map(c =>
        toSession("codex", c, async x => codexSessionInfo(await readRange(x.file, x.size, false, HEAD_BYTES))),
      ),
    ])
  ).filter((s): s is AgentSession => s !== null);

  sessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  const names = o.processes ? [...o.processes.values()].map(n => n.toLowerCase()) : null;
  return {
    processes: {
      claude: names ? names.filter(n => n === "claude.exe").length : null,
      // Not "codex-windows-sandbox-service.exe" and similar helpers.
      codex: names ? names.filter(n => /^codex(\.exe)?$/.test(n)).length : null,
    },
    sessions: sessions.slice(0, o.maxSessions),
  };
}
