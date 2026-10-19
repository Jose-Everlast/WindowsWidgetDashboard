/** Opens a link via the server in the default browser (inside Lively a link would navigate the wallpaper). */
export async function openUrl(url: string): Promise<void> {
  try {
    const res = await fetch("/api/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (res.ok) return;
  } catch {
    // fall through: server unreachable
  }
  // Plain browser fallback, so the UI still works outside Lively.
  window.open(url, "_blank", "noopener");
}
