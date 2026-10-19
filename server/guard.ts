import type { MiddlewareHandler } from "hono";
import { HttpError } from "./http";

export interface GuardOptions {
  /** Host header values we answer to, e.g. "127.0.0.1:4700". Blocks DNS rebinding. */
  allowedHosts: string[];
  /** Origins allowed to change state (own server + Vite dev server). */
  allowedOrigins: string[];
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Local-server hardening (see .agents/reference/security.md):
 * - every request: Host must be ours, so a rebound foreign domain cannot read widget data
 * - state-changing /api requests: JSON content type (forces a CORS preflight, which we never grant)
 *   and, when present, an allowed Origin
 */
export function localGuard({ allowedHosts, allowedOrigins }: GuardOptions): MiddlewareHandler {
  const hosts = new Set(allowedHosts.map(h => h.toLowerCase()));
  return async (c, next) => {
    const host = (c.req.header("host") ?? new URL(c.req.url).host).toLowerCase();
    if (!hosts.has(host)) throw new HttpError(403, "host not allowed");

    if (!SAFE_METHODS.has(c.req.method) && c.req.path.startsWith("/api/")) {
      if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
        throw new HttpError(415, "content-type application/json erwartet");
      }
      const origin = c.req.header("origin");
      if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, "origin not allowed");
    }
    await next();
  };
}
