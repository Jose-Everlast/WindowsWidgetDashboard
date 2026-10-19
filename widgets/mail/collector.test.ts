import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer, type AddressInfo, type Server as TcpServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTokenStore, type TokenStore } from "../../server/auth/token-store";
import { collectMail, type MailAdapters } from "./collect";
import { MailConfig, MailData } from "./manifest";

// Real local servers replay the recorded (anonymized) Gmail, Graph and IMAP answers.
const raw = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const gmailMessages = JSON.parse(raw("gmail-message-metadata.json")) as Array<{ id: string }>;
const authFixture = (f: string) => readFileSync(new URL(`../../server/auth/fixtures/${f}`, import.meta.url), "utf8");

const ENV = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", MS_CLIENT_ID: "mid", IMAP_PASSWORD: "app-pass" };
const FUTURE = Date.now() + 3600_000;

let http: Server | undefined;
let imap: TcpServer | undefined;
let sockets: Socket[] = [];
let dir: string;
let base: string;
let tokens: TokenStore;
let httpLog: string[];
let accepted: Set<string>;
let tokenAnswer: { status: number; body: string };
let graphStatus: number;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "wd-mail-"));
  httpLog = [];
  accepted = new Set(["access-gmail", "access-outlook", "EwB4REDACTED"]);
  tokenAnswer = { status: 200, body: authFixture("token-microsoft.json") };
  graphStatus = 200;
  base = await listenHttp();
  const ep = { authorize: `${base}/authorize`, token: `${base}/token` };
  tokens = createTokenStore({ dir, endpoints: { google: ep, microsoft: ep } });
});
afterEach(async () => {
  for (const s of sockets) s.destroy();
  sockets = [];
  await new Promise<void>(r => (http ? http.close(() => r()) : r()));
  await new Promise<void>(r => (imap ? imap.close(() => r()) : r()));
  http = imap = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function listenHttp(): Promise<string> {
  http = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    httpLog.push(`${req.method} ${url.pathname}${url.search}`);
    const send = (status: number, body: string) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body);
    };
    if (url.pathname === "/token") {
      req.resume();
      return req.on("end", () => send(tokenAnswer.status, tokenAnswer.body));
    }
    const bearer = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (!accepted.has(bearer)) return send(401, '{"error":{"code":401}}');
    const p = url.pathname;
    if (p === "/gmail/labels/INBOX") return send(200, raw("gmail-label-inbox.json"));
    if (p === "/gmail/messages") return send(200, raw("gmail-messages-list.json"));
    if (p.startsWith("/gmail/messages/")) {
      const m = gmailMessages.find(x => x.id === decodeURIComponent(p.split("/").pop()!));
      return m ? send(200, JSON.stringify(m)) : send(404, "{}");
    }
    if (graphStatus !== 200) return send(graphStatus, '{"error":{"code":"ServiceUnavailable"}}');
    if (p === "/graph/mailFolders/inbox") return send(200, raw("graph-inbox.json"));
    if (p === "/graph/mailFolders/inbox/messages") return send(200, raw("graph-messages.json"));
    send(404, "{}");
  });
  return new Promise(r => http!.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(http!.address() as AddressInfo).port}`)));
}

interface ImapOptions {
  password?: string;
  exists?: number;
  /** Command that never gets an answer. */
  hangOn?: string;
}

/** A minimal IMAP4rev1 server: enough for imapflow's login, STATUS, EXAMINE, FETCH, LOGOUT. Records every command. */
function listenImap(o: ImapOptions = {}): Promise<{ port: number; commands: string[] }> {
  const commands: string[] = [];
  const fetchLines = raw("imap-fetch.txt").trimEnd();
  imap = createTcpServer(sock => {
    sockets.push(sock);
    sock.on("error", () => {});
    const out = (...lines: string[]) => sock.write(lines.map(l => `${l}\r\n`).join(""));
    out("* OK [CAPABILITY IMAP4rev1] test server ready");
    let buf = "";
    sock.on("data", chunk => {
      buf += chunk.toString("utf8");
      for (let i = buf.indexOf("\r\n"); i >= 0; i = buf.indexOf("\r\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        handle(line);
      }
    });
    function handle(line: string) {
      const [tag, first = "", ...rest] = line.split(" ");
      let cmd = first.toUpperCase();
      if (cmd === "UID") cmd = `UID ${rest.shift()?.toUpperCase()}`;
      commands.push(cmd === "LOGIN" ? "LOGIN ***" : `${cmd} ${rest.join(" ")}`.trim());
      if (o.hangOn && cmd === o.hangOn) return;
      switch (cmd) {
        case "CAPABILITY":
          return out("* CAPABILITY IMAP4rev1", `${tag} OK done`);
        case "LOGIN": {
          const pass = rest.at(-1)?.replace(/^"|"$/g, "");
          return pass === (o.password ?? "app-pass")
            ? out(`${tag} OK [CAPABILITY IMAP4rev1] logged in`)
            : out(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials`);
        }
        case "STATUS":
          return out("* STATUS INBOX (UNSEEN 1)", `${tag} OK STATUS completed`);
        case "EXAMINE":
          return out(
            "* FLAGS (\\Seen \\Answered)",
            "* OK [PERMANENTFLAGS ()] read-only",
            `* ${o.exists ?? 3} EXISTS`,
            "* 0 RECENT",
            "* OK [UIDVALIDITY 1] ok",
            "* OK [UIDNEXT 104] ok",
            `${tag} OK [READ-ONLY] EXAMINE completed`,
          );
        case "SELECT":
          return out(`${tag} NO select is not allowed in this test`);
        case "FETCH":
        case "UID FETCH":
          return out(fetchLines, `${tag} OK FETCH completed`);
        case "LOGOUT":
          out("* BYE logging out", `${tag} OK LOGOUT completed`);
          return sock.end();
        default:
          return out(`${tag} OK done`);
      }
    }
  });
  return new Promise(r => imap!.listen(0, "127.0.0.1", () => r({ port: (imap!.address() as AddressInfo).port, commands })));
}

const ADAPTERS = (): MailAdapters => ({ gmailBase: `${base}/gmail`, graphBase: `${base}/graph`, imapTransport: { secure: false } });

const config = (imapPort: number, only?: string[]) => {
  const all = [
    { id: "gmail-privat", provider: "gmail", label: "Gmail privat" },
    { id: "gmail-agentur", provider: "gmail", label: "Gmail Agentur", color: "#ff0000" },
    { id: "outlook", provider: "outlook", label: "Outlook" },
    { id: "imap", provider: "imap", label: "IMAP", host: "127.0.0.1", port: imapPort, user: "jose@example.com", webmailUrl: "https://webmail.example.com" },
  ];
  return MailConfig.parse({ accounts: only ? all.filter(a => only.includes(a.id)) : all });
};

const connect = async (over: { gmailExpired?: boolean; outlookExpired?: boolean } = {}) => {
  for (const id of ["gmail-privat", "gmail-agentur"]) {
    await tokens.save(id, {
      provider: "google",
      refreshToken: "refresh-gmail",
      accessToken: "access-gmail",
      expiresAt: over.gmailExpired ? 0 : FUTURE,
      email: id === "gmail-privat" ? "jose@example.com" : "agentur@example.com",
    });
  }
  await tokens.save("outlook", {
    provider: "microsoft",
    refreshToken: "refresh-outlook",
    accessToken: "access-outlook",
    expiresAt: over.outlookExpired ? 0 : FUTURE,
    email: null,
  });
};

const run = (cfg: MailConfig, env: Record<string, string | undefined> = ENV, signal = AbortSignal.timeout(10_000)) =>
  collectMail({ config: cfg, env, signal, tokens, log: () => {}, adapters: ADAPTERS() });

describe("collectMail", () => {
  it("collects two Gmail accounts, Outlook and IMAP into one sorted inbox", async () => {
    const { port } = await listenImap();
    await connect();
    const data = await run(config(port));

    expect(MailData.safeParse(data).success).toBe(true);
    expect(data.accounts.map(a => [a.id, a.status, a.unread])).toEqual([
      ["gmail-privat", "ok", 2],
      ["gmail-agentur", "ok", 2],
      ["outlook", "ok", 1],
      ["imap", "ok", 1],
    ]);
    expect(data.accounts[1]!.color).toBe("#ff0000");
    expect(data.messages).toHaveLength(9);
    const times = data.messages.map(m => Date.parse(m.receivedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(data.messages.find(m => m.account === "gmail-agentur")!.url).toContain("/u/agentur%40example.com/");
    expect(data.messages.find(m => m.account === "outlook")!.url).toMatch(/^https:\/\/outlook\.live\.com\//);
    const imapMsgs = data.messages.filter(m => m.account === "imap");
    expect(imapMsgs.map(m => [m.subject, m.unread])).toEqual(
      expect.arrayContaining([
        ["Betreff 6 über", true],
        ["Betreff 5", false],
        ["(kein Betreff)", false],
      ]),
    );
    expect(httpLog.some(l => l.includes("metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date"))).toBe(true);
    expect(httpLog.some(l => l.includes("$select=id%2Cfrom"))).toBe(true);

    if (process.env.UPDATE_FIXTURES) {
      writeFileSync(new URL("./fixtures/mail.json", import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
    }
  });

  it("marks an account without token as unconfigured with a login link; others stay ok", async () => {
    const { port } = await listenImap();
    await connect();
    rmSync(join(dir, "gmail-privat.json"));
    const data = await run(config(port));
    expect(data.accounts[0]).toMatchObject({
      status: "unconfigured",
      error: "Nicht verbunden",
      action: "/auth/google/start?account=gmail-privat",
    });
    expect(data.accounts.slice(1).every(a => a.status === "ok")).toBe(true);
  });

  it("marks Gmail accounts unconfigured without a login link when the client ID is missing", async () => {
    await connect();
    const data = await run(config(1, ["gmail-privat", "outlook"]), { ...ENV, GOOGLE_CLIENT_ID: "" });
    expect(data.accounts[0]).toMatchObject({ status: "unconfigured", error: "Fehlt in .env: GOOGLE_CLIENT_ID" });
    expect(data.accounts[0]!.action).toBeUndefined();
    expect(data.accounts[1]!.status).toBe("ok");
  });

  it("refreshes an expired token once and persists Microsoft's rotated refresh token", async () => {
    await connect({ outlookExpired: true });
    const data = await run(config(1, ["outlook"]));
    expect(data.accounts[0]!.status).toBe("ok");
    expect(httpLog.filter(l => l.startsWith("POST /token"))).toHaveLength(1);
    const stored = JSON.parse(readFileSync(join(dir, "outlook.json"), "utf8"));
    expect(stored.refreshToken).toBe("M.C5_REDACTED-ROTATED");
  });

  it("asks for a new login when the refresh token is revoked", async () => {
    await connect({ outlookExpired: true });
    tokenAnswer = { status: 400, body: JSON.stringify({ error: "invalid_grant" }) };
    const data = await run(config(1, ["outlook", "gmail-privat"]));
    expect(data.accounts.find(a => a.id === "outlook")).toMatchObject({
      status: "unconfigured",
      error: "Anmeldung abgelaufen – neu verbinden",
      action: "/auth/microsoft/start?account=outlook",
    });
    expect(data.accounts.find(a => a.id === "gmail-privat")!.status).toBe("ok");
  });

  it("refreshes once on a 401 and then asks for a new login", async () => {
    await connect();
    accepted.delete("access-gmail");
    tokenAnswer = { status: 200, body: authFixture("token-google-refresh.json") };
    const data = await run(config(1, ["gmail-privat", "outlook"]));
    expect(data.accounts[0]).toMatchObject({ status: "unconfigured", error: "Anmeldung abgelaufen – neu verbinden" });
    expect(httpLog.filter(l => l.startsWith("POST /token"))).toHaveLength(1);
  });

  it("keeps the other accounts when Graph fails", async () => {
    await connect();
    graphStatus = 503;
    const data = await run(config(1, ["gmail-privat", "outlook"]));
    expect(data.accounts[1]).toMatchObject({ status: "error" });
    expect(data.accounts[1]!.error).toContain("HTTP 503");
    expect(data.accounts[0]!.status).toBe("ok");
  });

  it("throws when every configured account fails", async () => {
    await connect();
    graphStatus = 503;
    accepted.clear();
    tokenAnswer = { status: 500, body: "{}" };
    await expect(run(config(1, ["gmail-privat", "outlook"]))).rejects.toThrow(/Gmail privat: .*·.*Outlook: /);
  });
});

describe("IMAP", () => {
  it("opens the inbox read-only and never selects, stores or fetches a body", async () => {
    const { port, commands } = await listenImap();
    const data = await run(config(port, ["imap"]));
    expect(data.accounts[0]).toMatchObject({ status: "ok", unread: 1, email: "jose@example.com" });
    expect(commands.some(c => c.startsWith("EXAMINE"))).toBe(true);
    expect(commands.some(c => /^(SELECT|STORE|UID STORE|EXPUNGE|COPY|MOVE)\b/.test(c))).toBe(false);
    const fetches = commands.filter(c => c.includes("FETCH"));
    expect(fetches.length).toBeGreaterThan(0);
    expect(fetches.some(c => /BODY\[/.test(c))).toBe(false);
  });

  it("does not fetch from an empty inbox", async () => {
    const { port, commands } = await listenImap({ exists: 0 });
    const data = await run(config(port, ["imap"]));
    expect(data.messages).toEqual([]);
    expect(commands.some(c => c.includes("FETCH"))).toBe(false);
  });

  it("reports a failed login as an error and a missing password as unconfigured", async () => {
    const { port } = await listenImap({ password: "other" });
    await expect(run(config(port, ["imap"]))).rejects.toThrow(/IMAP-Anmeldung fehlgeschlagen/);
    const data = await run(config(port, ["imap"]), { ...ENV, IMAP_PASSWORD: "" });
    expect(data.accounts[0]).toMatchObject({ status: "unconfigured", error: "Fehlt in .env: IMAP_PASSWORD" });
  });

  it("settles quickly when aborted while the server hangs, without leaking rejections", async () => {
    const leaked: unknown[] = [];
    const onLeak = (e: unknown) => leaked.push(e);
    process.on("unhandledRejection", onLeak);
    try {
      const { port } = await listenImap({ hangOn: "STATUS" });
      const controller = new AbortController();
      const started = Date.now();
      setTimeout(() => controller.abort(new Error("Zeitüberschreitung")), 300);
      await expect(run(config(port, ["imap"]), ENV, controller.signal)).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(1500);
      await new Promise(r => setTimeout(r, 50));
      expect(leaked).toEqual([]);
    } finally {
      process.off("unhandledRejection", onLeak);
    }
  });
});
