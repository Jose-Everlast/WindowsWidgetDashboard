import { spawn } from "node:child_process";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { gmailProfile } from "../widgets/mail/gmail";
import { createApp } from "./app";
import { oauthAccounts } from "./auth/accounts";
import { createPendingStore } from "./auth/pending";
import { tokenStoreFor } from "./auth/token-store";
import { createCache } from "./cache";
import { loadDashboardConfig } from "./config-file";
import { assertLocalHost, config } from "./env";
import { log, logError } from "./log";
import { createScheduler } from "./scheduler";
import { createSettingsStore } from "./settings";
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

  const settings = await createSettingsStore(join(config.dataDir, "ui-settings.json"), msg => logError("settings", msg));

  const app = createApp({
    cache,
    settings,
    scheduler,
    layout: buildLayout(dashboard, types),
    types: buildTypes(types),
    openUrl,
    startedAt: Date.now(),
    allowedHosts: [...localHosts],
    allowedOrigins: localHosts.map(h => `http://${h}`),
    distDir: config.distDir,
    auth: {
      port: config.port,
      env: process.env,
      accounts: oauthAccounts(instances),
      // Same store as the mail collector: shared per-account refresh locks.
      tokens: tokenStoreFor(join(config.dataDir, "tokens")),
      pending: createPendingStore(),
      lookupEmail: (provider, accessToken, signal) =>
        provider === "google" ? gmailProfile({ token: async () => accessToken, signal }) : Promise.resolve(null),
      onConnected: () => {
        for (const s of cache.all()) {
          if (s.type !== "mail") continue;
          scheduler.refresh(s.instance).catch(err => logError("auth", err instanceof Error ? err.message : String(err)));
        }
      },
    },
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
