import { Hono } from "hono";
import { z } from "zod";
import type { HealthResponse, LayoutResponse, TypesResponse } from "@shared/api";
import type { Cache } from "../cache";
import { notFound, parseJson } from "../http";
import type { Scheduler } from "../scheduler";
import { UiSettingsPatch, type SettingsStore } from "../settings";

const OpenBody = z.object({ url: z.url({ protocol: /^https?$/ }) });

export interface ApiDeps {
  cache: Cache;
  scheduler: Pick<Scheduler, "refresh" | "action">;
  layout: LayoutResponse;
  types: TypesResponse;
  /** Receives the normalized href (new URL(..).href): quotes and spaces are percent-encoded. */
  openUrl: (url: string) => Promise<void>;
  startedAt: number;
  settings: SettingsStore;
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

  // Content type and Origin are enforced by localGuard like for every state-changing call.
  app.get("/settings", c => c.json(deps.settings.get()));
  app.put("/settings", async c => c.json(await deps.settings.update(await parseJson(c, UiSettingsPatch))));
  app.get("/layout", c => c.json(deps.layout));
  app.get("/widgets", c => c.json(deps.cache.all()));

  app.get("/widgets/:instance", c => {
    const state = deps.cache.get(c.req.param("instance"));
    if (!state) throw notFound(`instance "${c.req.param("instance")}"`);
    return c.json(state);
  });

  // Collector actions ("refresh" built in). The body is the action input; each action validates it.
  app.post("/widgets/:instance/actions/:action", async c => {
    const input = await parseJson(c, z.unknown());
    return c.json(await deps.scheduler.action(c.req.param("instance"), c.req.param("action"), input));
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
