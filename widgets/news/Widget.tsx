import type { WidgetProps } from "@shared/widget-contract";
import type { ListView } from "@shared/widget-contract";
import type { z } from "zod";
import { openUrl } from "../../web/src/lib/openUrl";

type News = z.infer<typeof ListView>;

// Reading speed: seconds a headline needs to pass by.
const SECONDS_PER_ITEM = 7;

function Item({ item }: { item: News["items"][number] }) {
  return (
    <button
      type="button"
      onClick={() => item.url && void openUrl(item.url)}
      disabled={!item.url}
      className="flex shrink-0 items-baseline gap-2 whitespace-nowrap enabled:hover:text-glow"
    >
      {item.subtitle && <span className="font-display text-[0.62rem] tracking-[0.14em] text-accent uppercase">{item.subtitle}</span>}
      <span className="text-[0.95rem]">{item.title}</span>
      {item.meta && <span className="font-mono text-xs text-muted">{item.meta}</span>}
      <span aria-hidden className="pl-4 text-accent/50">◆</span>
    </button>
  );
}

/** Headlines as a ticker in one line. It stops on hover; with reduced motion it scrolls by hand. */
export default function NewsWidget({ state }: WidgetProps<News>) {
  const { items } = state.data;
  if (!items.length) return <p className="text-sm text-muted">Keine Meldungen</p>;
  return (
    <div className="hud-ticker group relative overflow-hidden" aria-label="Schlagzeilen">
      {/* Two copies back to back: moving by -50% loops without a jump. The copy is hidden from screen readers. */}
      <div className="hud-ticker-track flex w-max gap-4 pr-4" style={{ animationDuration: `${items.length * SECONDS_PER_ITEM}s` }}>
        {items.map((it, i) => (
          <Item key={`a${i}`} item={it} />
        ))}
        <div aria-hidden className="flex gap-4" inert>
          {items.map((it, i) => (
            <Item key={`b${i}`} item={it} />
          ))}
        </div>
      </div>
    </div>
  );
}
