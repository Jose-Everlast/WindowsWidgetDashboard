import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

export const AgentsConfig = z.object({
  claudeDir: z.string().optional(), // default ~/.claude/projects
  codexDir: z.string().optional(), // default ~/.codex/sessions
  idleMinutes: z.number().min(1).default(15),
  windowHours: z.number().min(1).max(168).default(12),
  maxSessions: z.number().int().min(1).max(30).default(10),
});
export type AgentsConfig = z.infer<typeof AgentsConfig>;

export const AgentSession = z.object({
  agent: z.enum(["claude", "codex"]),
  project: z.string(),
  cwd: z.string(),
  branch: z.string().optional(),
  sessionId: z.string(),
  lastActivity: z.string(), // ISO, from the log file's mtime
  active: z.boolean(),
  kind: z.enum(["interactive", "exec"]).optional(),
});
export type AgentSession = z.infer<typeof AgentSession>;

export const AgentsData = z.object({
  // null: tasklist failed; the sessions are still shown.
  processes: z.object({ claude: z.number().int().nullable(), codex: z.number().int().nullable() }),
  sessions: z.array(AgentSession),
});
export type AgentsData = z.infer<typeof AgentsData>;

export const manifest = defineManifest({
  id: "agents",
  title: "Agents",
  version: 1,
  category: "ai",
  defaultSize: { w: 3, h: 3 },
  intervalMs: 10_000,
  capabilities: ["fs", "process"],
  config: AgentsConfig,
  data: AgentsData,
});
