/** German relative time: "gerade eben", "vor 3 Min.", "vor 2 Std.", "gestern", "vor 4 Tagen". */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const diffS = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diffS < 60) return "gerade eben";
  const min = Math.floor(diffS / 60);
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return d === 1 ? "gestern" : `vor ${d} Tagen`;
}
