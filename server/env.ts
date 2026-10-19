import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

const envFile = join(ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export const config = {
  root: ROOT,
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4700),
  distDir: join(ROOT, "dist", "web"),
  widgetsDir: join(ROOT, "widgets"),
  dashboardConfigPath: join(ROOT, "dashboard.config.json"),
  dashboardExamplePath: join(ROOT, "dashboard.config.example.json"),
};

/** The dashboard exposes mail, messages and system data: never bind beyond localhost. */
export function assertLocalHost(host: string): void {
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`HOST=${host} ist nicht erlaubt – nur 127.0.0.1 oder localhost (siehe PRD Abschnitt 9)`);
  }
}
