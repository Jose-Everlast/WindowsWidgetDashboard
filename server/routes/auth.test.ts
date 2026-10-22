import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, type AppDeps } from "../app";
import { oauthAccounts } from "../auth/accounts";
import { createPendingStore } from "../auth/pending";
import { createTokenStore } from "../auth/token-store";
import { createCache } from "../cache";
import type { ResolvedInstance } from "../widgets/loader";
import type { AuthDeps } from "./auth";

const authFixture = (f: string) => readFileSync(new URL(`../auth/fixtures/${f}`, import.meta.url), "utf8");
const ENV = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", MS_CLIENT_ID: "mid" };

let server: Server | undefined;
let dir: string;
let distDir: string;
let tokenRequests: URLSearchParams[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-authr-"));
  distDir = mkdtempSync(join(tmpdir(), "wd-dist-"));
  writeFileSync(join(distDir, "index.html"), "<!doctype html><title>Dashboard</title>");
  mkdirSync(join(distDir, "assets"));
  tokenRequests = [];
});
afterEach(async () => {
  await new Promise<void>(r => (server ? server.close(() => r()) : r()));
  server = undefined;
  rmSync(dir, { recursive: true, force: true });
  rmSync(distDir, { recursive: true, force: true });
});

// A real local token endpoint.
function tokenServer(body = authFixture("token-google.json")): Promise<string> {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => {
      tokenRequests.push(new URLSearchParams(raw));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
    });
  });
  return new Promise(r => server!.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`)));
}

async function setup(over: Partial<AuthDeps> = {}, tokenBody?: string) {
  const base = await tokenServer(tokenBody);
  const ep = { authorize: "https://consent.example/authorize", token: `${base}/token` };
  const auth: AuthDeps = {
    port: 4700,
    env: ENV,
    accounts: [
      { id: "gmail-privat", provider: "google" },
      { id: "outlook", provider: "microsoft" },
    ],
    tokens: createTokenStore({ dir }),
    pending: createPendingStore(),
    onConnected: vi.fn(),
    lookupEmail: vi.fn(async () => "jose@example.com"),
    endpoints: { google: ep, microsoft: ep },
    ...over,
  };
  const deps: AppDeps = {
    cache: createCache(),
    scheduler: { refresh: vi.fn(), action: vi.fn() },
    layout: { grid: { columns: 12, rows: 8, gapPx: 12, reserveLeftPx: 0, reserveTopPx: 0 }, widgets: [] },
    types: [],
    openUrl: vi.fn(async () => {}),
    startedAt: Date.now(),
    allowedHosts: ["localhost", "127.0.0.1:4700", "localhost:4700"],
    allowedOrigins: ["http://127.0.0.1:4700"],
    distDir,
    auth,
  };
  return { app: createApp(deps), auth };
}

const startState = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("state")!;

describe("GET /auth/:provider/start", () => {
  it("rejects unknown providers and accounts", async () => {
    const { app } = await setup();
    expect((await app.request("/auth/yahoo/start?account=gmail-privat")).status).toBe(404);
    expect((await app.request("/auth/google/start")).status).toBe(404);
    expect((await app.request("/auth/google/start?account=nope")).status).toBe(404);
    // Configured, but for the other provider (or IMAP, which is never in the list).
    expect((await app.request("/auth/google/start?account=outlook")).status).toBe(404);
  });

  it("answers 409 when the client ID is missing", async () => {
    const { app } = await setup({ env: { ...ENV, GOOGLE_CLIENT_ID: "" } });
    const res = await app.request("/auth/google/start?account=gmail-privat");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("GOOGLE_CLIENT_ID");
  });

  it("redirects to the consent page with PKCE and a fresh state", async () => {
    const { app } = await setup();
    const res = await app.request("/auth/google/start?account=gmail-privat");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://consent.example/authorize");
    expect(loc.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:4700/auth/google/callback");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loc.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /auth/:provider/callback", () => {
  it("exchanges the code, stores the token and triggers a refresh", async () => {
    const { app, auth } = await setup();
    const state = startState(await app.request("/auth/google/start?account=gmail-privat"));
    const res = await app.request(`/auth/google/callback?state=${state}&code=c0de`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await res.text()).toContain("Verbunden: gmail-privat");
    expect(tokenRequests[0]!.get("code")).toBe("c0de");
    expect(tokenRequests[0]!.get("code_verifier")).toBeTruthy();
    const stored = JSON.parse(readFileSync(join(dir, "gmail-privat.json"), "utf8"));
    expect(stored).toMatchObject({ provider: "google", email: "jose@example.com", refreshToken: "1//REDACTED" });
    expect(auth.onConnected).toHaveBeenCalledWith("gmail-privat");
  });

  it("accepts a state only once and only for its provider", async () => {
    const { app } = await setup();
    const state = startState(await app.request("/auth/google/start?account=gmail-privat"));
    expect((await app.request(`/auth/google/callback?state=${state}&code=c`)).status).toBe(200);
    expect((await app.request(`/auth/google/callback?state=${state}&code=c`)).status).toBe(400);

    const other = startState(await app.request("/auth/google/start?account=gmail-privat"));
    expect((await app.request(`/auth/microsoft/callback?state=${other}&code=c`)).status).toBe(400);
    expect((await app.request("/auth/google/callback?state=forged&code=c")).status).toBe(400);
    expect(tokenRequests).toHaveLength(1);
  });

  it("answers a provider error as plain text", async () => {
    const { app } = await setup();
    const res = await app.request(`/auth/google/callback?error=${encodeURIComponent("<script>alert(1)</script>")}`);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect((await app.request("/auth/google/callback?error=access_denied")).status).toBe(400);
  });

  it("refuses a login without refresh token", async () => {
    const { app } = await setup({}, authFixture("token-google-refresh.json"));
    const state = startState(await app.request("/auth/google/start?account=gmail-privat"));
    const res = await app.request(`/auth/google/callback?state=${state}&code=c`);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Kein Refresh-Token");
  });

  it("still stores the token when the profile lookup fails", async () => {
    const { app } = await setup({ lookupEmail: vi.fn(async () => Promise.reject(new Error("HTTP 500"))) });
    const state = startState(await app.request("/auth/google/start?account=gmail-privat"));
    expect((await app.request(`/auth/google/callback?state=${state}&code=c`)).status).toBe(200);
    expect(JSON.parse(readFileSync(join(dir, "gmail-privat.json"), "utf8")).email).toBeNull();
  });
});

describe("/auth routing", () => {
  it("is behind the host guard", async () => {
    const { app } = await setup();
    const res = await app.request("http://evil.example/auth/google/start?account=gmail-privat", { headers: { host: "evil.example" } });
    expect(res.status).toBe(403);
  });

  it("is not swallowed by the SPA fallback", async () => {
    const { app } = await setup();
    const res = await app.request("/auth/unknown");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("oauthAccounts", () => {
  const inst = (instance: string, accounts: Array<{ id: string; provider: string }>) =>
    ({ instance, type: "mail", layout: {}, loaded: {}, parsedConfig: { accounts } }) as unknown as ResolvedInstance;

  it("maps gmail/outlook to their OAuth providers and skips IMAP", () => {
    expect(
      oauthAccounts([
        inst("mail", [
          { id: "g", provider: "gmail" },
          { id: "o", provider: "outlook" },
          { id: "i", provider: "imap" },
        ]),
      ]),
    ).toEqual([
      { id: "g", provider: "google" },
      { id: "o", provider: "microsoft" },
    ]);
  });

  it("rejects duplicate account IDs across instances", () => {
    expect(() => oauthAccounts([inst("a", [{ id: "g", provider: "gmail" }]), inst("b", [{ id: "g", provider: "gmail" }])])).toThrow(/doppelt/);
  });
});
