import { Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UiSettings } from "@shared/api";
import { useDashboard } from "./DashboardProvider";

const OPTIONS: Array<{ key: keyof UiSettings; label: string; hint: string }> = [
  { key: "tileBackground", label: "Kachel-Hintergrund", hint: "Aus: Inhalte stehen direkt auf dem Hintergrund" },
  { key: "tileBorder", label: "Kachel-Rahmen", hint: "Rahmen und leuchtende Ecken" },
];

function Switch({ on, label, hint, onChange }: { on: boolean; label: string; hint: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left hover:bg-accent/10"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-fg">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${on ? "border-accent bg-accent/30" : "border-line bg-page"}`}>
        <span
          className={`absolute top-0.5 size-3.5 rounded-full transition-[left,background-color] ${on ? "left-[18px] bg-glow" : "left-0.5 bg-muted"}`}
        />
      </span>
    </button>
  );
}

/** Gear in the top right corner: look of all tiles, stored on the server for every view. */
export function SettingsPanel() {
  const { settings, updateSettings } = useDashboard();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="fixed top-2 right-2 z-[70] flex flex-col items-end gap-2">
      <button
        type="button"
        aria-label="Einstellungen"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`grid size-7 place-items-center rounded-sm transition-opacity hover:text-glow ${open ? "text-glow opacity-100" : "text-muted opacity-40 hover:opacity-100"}`}
      >
        <Settings2 className="size-4" />
      </button>
      {open && (
        <div role="dialog" aria-label="Darstellung" className="hud-panel w-72 p-3">
          <h2 className="hud-title mb-2 px-2">Darstellung</h2>
          {settings ? (
            OPTIONS.map(o => (
              <Switch key={o.key} on={settings[o.key]} label={o.label} hint={o.hint} onChange={on => void updateSettings({ [o.key]: on })} />
            ))
          ) : (
            <p className="px-2 text-sm text-muted">Verbinde …</p>
          )}
        </div>
      )}
    </div>
  );
}
