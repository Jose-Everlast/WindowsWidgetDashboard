// Pure helpers for the session logs of Claude Code and Codex.

export interface SessionInfo {
  cwd: string;
  sessionId: string;
  branch?: string;
  kind?: "interactive" | "exec";
}

const parseLine = (line: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(line);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null; // the cut-off first line of a tail, or a half-written last line
  }
};

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
// Claude writes gitBranch "HEAD" for folders without a checked-out branch (or no repo at all).
const branchOf = (v: unknown) => (str(v) === "HEAD" ? undefined : str(v));

/** Claude Code writes cwd/gitBranch/sessionId on (almost) every line: take the newest line that has a cwd. */
export function claudeSessionInfo(tail: string): SessionInfo | null {
  const lines = tail.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const o = parseLine(lines[i]!);
    const cwd = str(o?.cwd);
    const sessionId = str(o?.sessionId) ?? str(o?.session_id);
    const branch = branchOf(o?.gitBranch);
    if (cwd && sessionId) return { cwd, sessionId, ...(branch && { branch }) };
  }
  return null;
}

/** Codex starts every rollout file with a session_meta line. */
export function codexSessionInfo(head: string): SessionInfo | null {
  const o = parseLine(head.split(/\r?\n/)[0] ?? "");
  if (o?.type !== "session_meta" || !o.payload || typeof o.payload !== "object") return null;
  const p = o.payload as Record<string, unknown>;
  const cwd = str(p.cwd);
  const sessionId = str(p.id) ?? str(p.session_id);
  if (!cwd || !sessionId) return null;
  const git = p.git && typeof p.git === "object" ? (p.git as Record<string, unknown>) : {};
  const branch = branchOf(git.branch);
  return { cwd, sessionId, kind: p.source === "exec" ? "exec" : "interactive", ...(branch && { branch }) };
}

/** Last path segment, Windows or POSIX. */
export const projectName = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd;

/**
 * Local-date folders YYYY/MM/DD from today back to the local date of now - windowHours (Codex names
 * its folders in local time). Steps in calendar days, not 24 h: DST days have 23 or 25 hours.
 */
export function codexDateDirs(now: Date, windowHours: number): string[] {
  const start = new Date(now.getTime() - windowHours * 3_600_000);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  const dirs: string[] = [];
  for (let i = 0; ; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (d < startDay) break;
    dirs.push(`${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`);
  }
  return dirs;
}
