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

export interface HealthResponse {
  ok: true;
  uptimeS: number;
  instances: Array<{ instance: string; type: string; status: WidgetStatus; updatedAt: string | null }>;
}
