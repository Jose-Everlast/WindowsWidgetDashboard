// Response shapes of /api/*, shared by server and web.
import type { DashboardConfig, InstanceConfig, WidgetCategory, WidgetManifest, WidgetStatus, WidgetViewType } from "./widget-contract";

export interface LayoutWidget extends InstanceConfig {
  w: number;
  h: number;
  title: string;
  view?: WidgetViewType;
  /** true: widgets/<type>/Widget.tsx exists; false: render generically. */
  hasComponent: boolean;
  /** true: no tile, rendered above the grid (manifest.overlay). */
  overlay: boolean;
  /** true: grid place without frame and title bar (manifest.frameless). */
  frameless: boolean;
}

export interface LayoutResponse {
  grid: DashboardConfig["grid"];
  widgets: LayoutWidget[];
}

export type TypesResponse = Array<{
  id: string;
  title: string;
  version: number;
  category: WidgetCategory;
  defaultSize: WidgetManifest["defaultSize"];
  capabilities: WidgetManifest["capabilities"];
  env: string[];
  view?: WidgetViewType;
  configSchema: unknown;
}>;

/** Look of all tiles, set in the settings panel; GET/PUT /api/settings, SSE event "settings". */
export interface UiSettings {
  tileBackground: boolean;
  tileBorder: boolean;
  gameOfLife: boolean;
}

/** Marks a /api/health answer as ours, so `npm run status` and the start check ignore other servers. */
export const SERVER_APP_ID = "windowsDashboard";
export type ServerMode = "dev" | "prod" | "unknown";

/** Who is running: in /api/health and in data/server.json. */
export interface ServerInfo {
  app: typeof SERVER_APP_ID;
  pid: number;
  port: number;
  mode: ServerMode;
  /** ISO time */
  startedAt: string;
  version: string;
}

export interface HealthResponse {
  ok: true;
  server: ServerInfo;
  uptimeS: number;
  instances: Array<{ instance: string; type: string; status: WidgetStatus; updatedAt: string | null }>;
}
