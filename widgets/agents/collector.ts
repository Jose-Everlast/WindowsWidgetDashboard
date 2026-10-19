import { homedir } from "node:os";
import { join } from "node:path";
import { defineCollector } from "@shared/widget-contract";
import { listProcesses } from "../../server/lib/win";
import { collectAgents } from "./collect";
import { manifest } from "./manifest";

export const collector = defineCollector(manifest, {
  async collect({ config, signal, log }) {
    // The process counters are auxiliary: a failed tasklist must not hide the sessions.
    const processes = await listProcesses(signal).catch(err => {
      log("tasklist fehlgeschlagen:", err instanceof Error ? err.message : String(err));
      return null;
    });
    return collectAgents({
      claudeDir: config.claudeDir ?? join(homedir(), ".claude", "projects"),
      codexDir: config.codexDir ?? join(homedir(), ".codex", "sessions"),
      now: new Date(),
      idleMinutes: config.idleMinutes,
      windowHours: config.windowHours,
      maxSessions: config.maxSessions,
      processes,
      log,
    });
  },
});
