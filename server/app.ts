import { Hono } from "hono";
import { localGuard, type GuardOptions } from "./guard";
import { HttpError } from "./http";
import { logError } from "./log";
import { apiRoutes, type ApiDeps } from "./routes/api";
import { authRoutes, type AuthDeps } from "./routes/auth";
import { streamRoutes } from "./routes/stream";
import { dashboardRoutes } from "./static";

export interface AppDeps extends ApiDeps, GuardOptions {
  distDir: string;
  /** OAuth login for mail accounts; absent in tests that do not need it. */
  auth?: AuthDeps;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use("*", localGuard(deps));
  app.route("/api/stream", streamRoutes(deps.cache, deps.settings));
  app.route("/api", apiRoutes(deps));
  if (deps.auth) app.route("/auth", authRoutes(deps.auth));
  app.route("/", dashboardRoutes(deps.distDir)); // last: SPA fallback

  app.notFound(c => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, details: err.details }, err.status);
    logError("server", err.message);
    return c.json({ error: err.message }, 500);
  });

  return app;
}
