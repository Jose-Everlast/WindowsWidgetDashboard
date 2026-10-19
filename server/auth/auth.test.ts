import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPendingStore } from "./pending";
import { challengeOf, createState, createVerifier } from "./pkce";
import { OAuthError, ReauthRequiredError, authorizeUrl, exchangeCode, type OAuthEndpoints } from "./providers";
import { NotConnectedError, createTokenStore } from "./token-store";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

const ENV = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", MS_CLIENT_ID: "mid" };
const signal = () => AbortSignal.timeout(5000);

// A real local token endpoint. Each test sets the next answer; requests are recorded.
let server: Server | undefined;
let dir: string;
let requests: URLSearchParams[] = [];
let respond: () => { status: number; body: string } = () => ({ status: 200, body: fixture("token-google.json") });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-auth-"));
  requests = [];
  respond = () => ({ status: 200, body: fixture("token-google.json") });
});
afterEach(async () => {
  await new Promise<void>(r => (server ? server.close(() => r()) : r()));
  server = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function tokenServer(): Promise<Record<"google" | "microsoft", OAuthEndpoints>> {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => {
      requests.push(new URLSearchParams(raw));
      // Slow enough that two parallel callers would both reach the server without the lock.
      setTimeout(() => {
        const { status, body } = respond();
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body);
      }, 20);
    });
  });
  const base = await new Promise<string>(r =>
    server!.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`)),
  );
  const ep = { authorize: `${base}/authorize`, token: `${base}/token` };
  return { google: ep, microsoft: ep };
}

describe("pkce", () => {
  it("matches the RFC 7636 test vector", () => {
    expect(challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("creates verifiers of valid length and unique states", () => {
    const v = createVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createState()).not.toBe(createState());
  });
});

describe("pending store", () => {
  const entry = { provider: "google" as const, account: "gmail-privat", verifier: "v" };

  it("hands out a state only once", () => {
    const p = createPendingStore();
    p.put("s1", entry);
    expect(p.take("s1")).toMatchObject(entry);
    expect(p.take("s1")).toBeUndefined();
  });
  it("expires entries after the TTL", () => {
    let t = 0;
    const p = createPendingStore({ ttlMs: 1000, now: () => t });
    p.put("s1", entry);
    t = 1001;
    expect(p.take("s1")).toBeUndefined();
  });
  it("drops the oldest entry beyond max", () => {
    const p = createPendingStore({ max: 2 });
    p.put("a", entry);
    p.put("b", entry);
    p.put("c", entry);
    expect(p.take("a")).toBeUndefined();
    expect(p.take("b")).toBeDefined();
    expect(p.take("c")).toBeDefined();
  });
});

describe("authorizeUrl", () => {
  it("builds the Google consent URL with PKCE and offline access", () => {
    const url = new URL(authorizeUrl({ env: ENV, provider: "google", port: 4700, state: "st", challenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("redirect_uri")).toBe("http://127.0.0.1:4700/auth/google/callback");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toBe("ch");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(p.get("client_id")).toBe("gid");
  });
  it("uses the consumers tenant and a localhost redirect for Microsoft", () => {
    const url = new URL(authorizeUrl({ env: ENV, provider: "microsoft", port: 4700, state: "st", challenge: "ch" }));
    expect(url.pathname).toBe("/consumers/oauth2/v2.0/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:4700/auth/microsoft/callback");
    expect(url.searchParams.get("scope")).toBe("offline_access Mail.Read");
    const custom = new URL(authorizeUrl({ env: { ...ENV, MS_TENANT: "common" }, provider: "microsoft", port: 4700, state: "s", challenge: "c" }));
    expect(custom.pathname).toBe("/common/oauth2/v2.0/authorize");
  });
});

describe("exchangeCode", () => {
  it("sends client_secret and code_verifier to Google", async () => {
    const endpoints = await tokenServer();
    const t = await exchangeCode({ env: ENV, endpoints, provider: "google", port: 4700, code: "c0de", verifier: "ver", signal: signal(), now: () => 0 });
    expect(t.refreshToken).toBeTruthy();
    expect(t.expiresAt).toBe(3599_000);
    const body = requests[0]!;
    expect(body.get("client_secret")).toBe("gsecret");
    expect(body.get("code_verifier")).toBe("ver");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:4700/auth/google/callback");
  });
  it("sends no secret to Microsoft (public client)", async () => {
    const endpoints = await tokenServer();
    respond = () => ({ status: 200, body: fixture("token-microsoft.json") });
    await exchangeCode({ env: ENV, endpoints, provider: "microsoft", port: 4700, code: "c0de", verifier: "ver", signal: signal() });
    expect(requests[0]!.has("client_secret")).toBe(false);
    expect(requests[0]!.get("client_id")).toBe("mid");
  });
});

describe("token store", () => {
  const save = (store: ReturnType<typeof createTokenStore>, over: Partial<Parameters<typeof store.save>[1]> = {}) =>
    store.save("outlook", { provider: "microsoft", refreshToken: "old-refresh", accessToken: "old-access", expiresAt: 0, email: null, ...over });

  it("reuses a valid access token without a request", async () => {
    const endpoints = await tokenServer();
    const store = createTokenStore({ dir, endpoints, now: () => 1000 });
    await save(store, { expiresAt: 1000 + 3600_000 });
    expect(await store.accessToken("outlook", "microsoft", ENV, signal())).toBe("old-access");
    expect(requests).toHaveLength(0);
  });

  it("refreshes an expired token and persists the rotated refresh token", async () => {
    const endpoints = await tokenServer();
    respond = () => ({ status: 200, body: fixture("token-microsoft.json") });
    const store = createTokenStore({ dir, endpoints });
    await save(store);
    const access = await store.accessToken("outlook", "microsoft", ENV, signal());
    expect(access).not.toBe("old-access");
    expect(requests[0]!.get("grant_type")).toBe("refresh_token");
    expect(requests[0]!.get("refresh_token")).toBe("old-refresh");
    const onDisk = JSON.parse(readFileSync(join(dir, "outlook.json"), "utf8"));
    expect(onDisk.refreshToken).not.toBe("old-refresh");
    expect(onDisk.accessToken).toBe(access);
  });

  it("keeps the old refresh token when the answer has none (Google)", async () => {
    const endpoints = await tokenServer();
    respond = () => ({ status: 200, body: fixture("token-google-refresh.json") });
    const store = createTokenStore({ dir, endpoints });
    await store.save("gmail-privat", { provider: "google", refreshToken: "keep-me", accessToken: null, expiresAt: null, email: "a@example.com" });
    await store.accessToken("gmail-privat", "google", ENV, signal());
    expect((await store.read("gmail-privat"))!.refreshToken).toBe("keep-me");
  });

  it("serializes parallel refreshes of one account into one request", async () => {
    const endpoints = await tokenServer();
    respond = () => ({ status: 200, body: fixture("token-microsoft.json") });
    const store = createTokenStore({ dir, endpoints });
    await save(store);
    const [a, b] = await Promise.all([
      store.accessToken("outlook", "microsoft", ENV, signal()),
      store.accessToken("outlook", "microsoft", ENV, signal()),
    ]);
    expect(a).toBe(b);
    expect(requests).toHaveLength(1);
  });

  it("maps invalid_grant to ReauthRequiredError and 5xx to OAuthError", async () => {
    const endpoints = await tokenServer();
    const store = createTokenStore({ dir, endpoints });
    await save(store);
    respond = () => ({ status: 400, body: JSON.stringify({ error: "invalid_grant", error_description: "AADSTS70008: expired" }) });
    await expect(store.accessToken("outlook", "microsoft", ENV, signal())).rejects.toBeInstanceOf(ReauthRequiredError);
    respond = () => ({ status: 503, body: "upstream down" });
    const err = await store.accessToken("outlook", "microsoft", ENV, signal()).catch(e => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect(err).not.toBeInstanceOf(ReauthRequiredError);
    expect(String(err.message)).not.toContain("old-refresh");
  });

  it("reports a missing file as not connected and rejects path traversal", async () => {
    const store = createTokenStore({ dir });
    await expect(store.accessToken("gmail-privat", "google", ENV, signal())).rejects.toBeInstanceOf(NotConnectedError);
    await expect(store.read("../x")).rejects.toThrow(/Ungültige Konto-ID/);
  });

  it("treats a token of another provider as not connected and hides file contents on bad JSON", async () => {
    const store = createTokenStore({ dir });
    await save(store);
    await expect(store.accessToken("outlook", "google", ENV, signal())).rejects.toBeInstanceOf(NotConnectedError);
    writeFileSync(join(dir, "broken.json"), '{"refreshToken":"secret-value"');
    const err = await store.read("broken").catch(e => e);
    expect(err.message).toMatch(/kein gültiges JSON/);
    expect(err.message).not.toContain("secret-value");
  });
});
