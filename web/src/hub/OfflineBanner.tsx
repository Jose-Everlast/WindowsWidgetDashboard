import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  return (
    <div className="fixed top-3 right-3 z-10 flex items-center gap-2 rounded-full border border-warn/40 bg-surface/90 px-3 py-1.5 text-sm text-warn">
      <WifiOff className="size-4" />
      Server nicht erreichbar – verbinde neu …
    </div>
  );
}
