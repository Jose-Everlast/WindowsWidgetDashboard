import { Hono } from "hono";
import { z } from "zod";
import type { HealthResponse, LayoutResponse, TypesResponse } from "@shared/api";
import type { Cache } from "../cache";
import { HttpError, notFound, parseJson } from "../http";
import type { Scheduler } from "../scheduler";

const OpenBody = z.object({ url: z.url({ protocol: /^https?$/ }) });

export interface ApiDeps {
  cache: Cache;
  scheduler: Pick<Scheduler, "refresh">;
  layout: LayoutResponse;
  types: TypesResponse;
  /** Receives the normalized href (new URL(..).href): quotes and spaces are percent-encoded. */
  openUrl: (url: string) => Promise<void>;
  startedAt: number;
}

export function apiRoutes(deps: ApiDeps): Hono {
  const app = new Hono();

  app.get("/health", c =>
    c.json<HealthResponse>({
      ok: true,
      uptimeS: Math.round((Date.now() - deps.startedAt) / 1000),
      instances: deps.cache.all().map(s => ({ instance: s.instance, type: s.type, status: s.status, updatedAt: s.updatedAt })),
    }),
  );

  app.get("/types", c => c.json(deps.types));
  app.get("/layout", c => c.json(deps.layout));
  app.get("/widgets", c => c.json(deps.cache.all()));

  app.get("/widgets/:instance", c => {
    const state = deps.cache.get(c.req.param("instance"));
    if (!state) throw notFound(`instance "${c.req.param("instance")}"`);
    return c.json(state);
  });

  app.post("/widgets/:instance/actions/:action", async c => {
    const action = c.req.param("action");
    if (action !== "refresh") throw new HttpError(404, "unknown action");
    return c.json(await deps.scheduler.refresh(c.req.param("instance")));
  });

  // Opens a link in the default browser: inside Lively a link would otherwise navigate the wallpaper.
  // Content type and Origin are enforced by localGuard. Feed links are foreign input: only the
  // normalized href leaves this process.
  app.post("/open", async c => {
    const { url } = await parseJson(c, OpenBody);
    await deps.openUrl(new URL(url).href);
    return c.body(null, 204);
  });

  return app;
}
