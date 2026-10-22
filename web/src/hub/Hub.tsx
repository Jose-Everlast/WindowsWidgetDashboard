import { Suspense } from "react";
import type { LayoutWidget } from "@shared/api";
import type { WidgetState } from "@shared/widget-contract";
import { useDashboard } from "./DashboardProvider";
import { OfflineBanner } from "./OfflineBanner";
import { widgetComponents } from "./registry";
import { ErrorBoundary, ROW_UNIT_PX, WidgetFrame } from "./WidgetFrame";

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

  // Packed columns: each tile sits right under the one above it in its columns (DOM order = config y, then x),
  // its height measured from the content. "dense" places every tile in the first free rows of its columns.
  const tiles = layout.widgets.filter(w => !w.overlay).sort((a, b) => a.y - b.y || a.x - b.x);
  const padTop = grid.gapPx + grid.reserveTopPx;
  // A tile may grow to h grid rows, like before; the area of one row comes from the screen height.
  const rowCss = `((100dvh - ${padTop + grid.gapPx}px - ${(grid.rows - 1) * grid.gapPx}px) / ${grid.rows})`;

  return (
    <>
      {!online && <OfflineBanner />}
      <div aria-hidden className="hud-scanlines" />
      <main
        className="grid h-full content-start overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
          gridAutoRows: `${ROW_UNIT_PX}px`,
          gridAutoFlow: "row dense",
          columnGap: grid.gapPx,
          rowGap: 0,
          padding: grid.gapPx,
          paddingLeft: grid.gapPx + grid.reserveLeftPx,
          paddingTop: padTop,
        }}
      >
        {tiles.map(w => (
          <WidgetFrame
            key={w.instance}
            widget={w}
            gapPx={grid.gapPx}
            maxHeight={`calc(${rowCss} * ${w.h} + ${(w.h - 1) * grid.gapPx}px)`}
          />
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
