import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { WidgetProps } from "@shared/widget-contract";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WidgetComponent = ComponentType<WidgetProps<any>>;

// Static glob: Vite resolves it at build time. Keys look like "../../../widgets/weather/Widget.tsx".
const modules = import.meta.glob<{ default: WidgetComponent }>("../../../widgets/*/Widget.tsx");

/**
 * Lazy component per widget type, created once at module load (lazy() loads nothing until rendered).
 * Types without Widget.tsx are absent and render generically.
 */
export const widgetComponents: Record<string, LazyExoticComponent<WidgetComponent>> = Object.fromEntries(
  Object.entries(modules).map(([path, loader]) => [path.split("/").at(-2)!, lazy(loader)]),
);
