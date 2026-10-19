import { spawn } from "node:child_process";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createCache } from "./cache";
import { loadDashboardConfig } from "./config-file";
import { assertLocalHost, config } from "./env";
import { log, logError } from "./log";
import { createScheduler } from "./scheduler";
import { buildLayout, buildTypes, loadWidgetTypes, resolveInstances } from "./widgets/loader";

// Opens an already validated and normalized http(s) href in the default browser. Not "cmd /c start"
// (an "&" would be command injection) and not explorer.exe (own comma/switch parsing):
// FileProtocolHandler hands the URL straight to the protocol handler.
async function openUrl(href: string): Promise<void> {
  spawn("rundll32.exe", ["url.dll,FileProtocolHandler", href], { detached: true, stdio: "ignore" }).unref();
}

async function main() {
  assertLocalHost(config.host);

  const { config: dashboard } = loadDashboardConfig({
    configPath: config.dashboardConfigPath,
    examplePath: config.dashboardExamplePath,
  });
  const types = await loadWidgetTypes(config.widgetsDir);
  const instances = resolveInstances(dashboard, types, process.env);
  log("server", `${types.size} Widget-Typen, ${instances.length} Instanzen`);

  // Own server plus the Vite dev server, whose proxy keeps the Host header (changeOrigin: false).
  const localHosts = [config.port, 5174].flatMap(port => [`127.0.0.1:${port}`, `localhost:${port}`]);

  const cache = createCache(instances.map(i => i.instance));
  const scheduler = createScheduler({ cache, instances, env: process.env });

  const app = createApp({
    cache,
    scheduler,
    layout: buildLayout(dashboard, types),
    types: buildTypes(types),
    openUrl,
    startedAt: Date.now(),
    allowedHosts: [...localHosts],
    allowedOrigins: localHosts.map(h => `http://${h}`),
    distDir: config.distDir,
  });

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, info => {
    log("server", `listening on http://${config.host}:${info.port}`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logError("server", `Port ${config.port} belegt – PORT in .env ändern oder den Prozess beenden`);
    } else {
      logError("server", err.message);
    }
    process.exit(1);
  });

  scheduler.start();

  const shutdown = () => {
    scheduler.stop();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(err => {
  logError("server", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
