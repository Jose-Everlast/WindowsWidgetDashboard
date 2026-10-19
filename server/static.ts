// Serves the built UI (vite build -> dist/web) so `npm start` is self-contained.
// Mirrors relaunch-radar/server/static.ts: hashed assets cached long, index.html as SPA fallback.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { Hono } from "hono";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const contentTypeOf = (path: string) => CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";

/** URL path → relative file path, or null on traversal / bad encoding. */
export function safeRelPath(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]!.split("#")[0]!);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split(/[\\/]/).includes("..")) return null;
  return decoded.replace(/\\/g, "/").replace(/^\/+/, "");
}

// API and OAuth routes keep their own JSON 404.
const RESERVED = /^\/(api|auth)(\/|$)/;

export function dashboardRoutes(distDir: string): Hono {
  const app = new Hono();
  const dir = normalize(distDir);
  const index = join(dir, "index.html");

  app.get("*", async (c, next) => {
    if (RESERVED.test(c.req.path)) return next();
    if (!existsSync(index)) return c.text("UI nicht gebaut – npm run build", 503);
    const rel = safeRelPath(c.req.path);
    if (rel === null) return c.text("bad request", 400);
    const file = normalize(join(dir, rel));
    if (rel && file.startsWith(dir + sep) && existsSync(file) && statSync(file).isFile()) {
      // Vite hashes everything under assets/.
      const cache = rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
      return c.body(readFileSync(file), 200, { "content-type": contentTypeOf(file), "cache-control": cache });
    }
    if (extname(rel)) return next(); // a missing file, not a route
    return c.body(readFileSync(index), 200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
  });

  return app;
}
