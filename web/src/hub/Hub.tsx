import { useDashboard } from "./DashboardProvider";
import { OfflineBanner } from "./OfflineBanner";
import { WidgetFrame } from "./WidgetFrame";

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
        {layout.widgets.map(w => (
          <WidgetFrame key={w.instance} widget={w} />
        ))}
      </main>
    </>
  );
}
