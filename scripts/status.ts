// npm run status: is the dashboard running, where, in which mode? Fast: one HTTP call per port plus netstat, no WMI.
import { config } from "../server/env";
import { describeServer, findRunning, instanceFile, readInstance } from "../server/instance";
import { listListeners } from "../server/lib/win";

const VITE_PORT = 5174;

async function viteRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${VITE_PORT}/@vite/client`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const file = instanceFile(config.dataDir);
  const [server, recorded, vite, listeners] = await Promise.all([
    findRunning({ file, ports: [config.port], confirmAttempts: 1 }),
    readInstance(file),
    viteRunning(),
    listListeners().catch(() => []),
  ]);
  const pidOn = (port: number) => listeners.find(l => l.port === port)?.pid;
  const lines: string[] = [];

  if (server) {
    // Older servers do not report their PID: netstat knows it.
    const pid = server.pid || pidOn(server.port) || 0;
    lines.push(`Dashboard läuft · ${describeServer({ ...server, pid })}`);
  } else {
    lines.push(`Dashboard läuft nicht. Starten: npm start (oder npm run dev)`);
    const blocker = pidOn(config.port);
    if (blocker) lines.push(`  Port ${config.port} ist von einem anderen Programm belegt (PID ${blocker}).`);
    if (recorded) lines.push(`  data/server.json ist veraltet (PID ${recorded.pid}, Port ${recorded.port}); wird beim nächsten Start ersetzt.`);
  }
  if (vite) lines.push(`Vite (dev-UI) läuft · http://127.0.0.1:${VITE_PORT}${pidOn(VITE_PORT) ? ` · PID ${pidOn(VITE_PORT)}` : ""}`);

  console.log(lines.join("\n"));
  process.exitCode = server ? 0 : 1;
}

void main();
