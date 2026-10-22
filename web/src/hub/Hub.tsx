import { Suspense } from "react";
import type { LayoutWidget } from "@shared/api";
import type { WidgetState } from "@shared/widget-contract";
import { useDashboard } from "./DashboardProvider";
import { OfflineBanner } from "./OfflineBanner";
import { widgetComponents } from "./registry";
import { ErrorBoundary, WidgetFrame } from "./WidgetFrame";

/** Overlay widgets (manifest.overlay) render without a tile, above the grid. */
function Overlay({ widget }: { widget: LayoutWidget }) {
  const { states } = useDashboard();
  const state = states[widget.instance];
  const Custom = widgetComponents[widget.type];
  if (!Custom || !state || state.data === null) return null;
  return (
    <ErrorBoundary resetKey={state.updatedAt}>
      <Suspense fallback={null}>
        <Custom state={state as WidgetState<unknown> & { data: unknown }} config={widget.config} />
      </Suspense>
    </ErrorBoundary>
  );
}

export function Hub() {
  const { layout, online } = useDashboard();
  if (!layout) return <OfflineBanner />;
  const { grid } = layout;

  return (
    <>
      {!online && <OfflineBanner />}
      <main
        className="grid h-full"
        style={{
          gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
          gap: grid.gapPx,
          padding: grid.gapPx,
          paddingLeft: grid.gapPx + grid.reserveLeftPx,
          paddingTop: grid.gapPx + grid.reserveTopPx,
        }}
      >
        {layout.widgets
          .filter(w => !w.overlay)
          .map(w => (
            <WidgetFrame key={w.instance} widget={w} />
          ))}
      </main>
      {layout.widgets
        .filter(w => w.overlay)
        .map(w => (
          <Overlay key={w.instance} widget={w} />
        ))}
    </>
  );
}
