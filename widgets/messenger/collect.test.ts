import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectMessenger, dbPathOf } from "./collect";
import { MessengerConfig, MessengerData } from "./manifest";
import { deleteToasts, toastXml, writeToasts } from "./test-db";
import { readToasts } from "./wpn";

const WA = "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App";
const TEAMS = "MSTeams_8wekyb3d8bbwe!MSTeams";
const SLACK = "com.tinyspeck.slackdesktop_8yrtsj140pw4g!Slack";
const DOCKER = "Docker.DockerForWindows.Settings";
const T0 = Date.UTC(2026, 9, 22, 8, 0, 0);
const min = (n: number) => T0 + n * 60_000;

let dir: string;
let db: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-msg-"));
  db = join(dir, "wpndatabase.db");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const config = MessengerConfig.parse({});
const collect = (now = min(10)) =>
  collectMessenger({ dataDir: join(dir, "data"), readToasts, now: () => now }, { instance: "nachrichten", config: { ...config, dbPath: db }, env: {} });
const feedFile = () => join(dir, "data", "messages", "nachrichten.json");

describe("collectMessenger", () => {
  it("accumulates chats in its own file and keeps them after Windows dropped the toasts", async () => {
    writeToasts(db, [
      { id: 1, primaryId: WA, at: min(0), payload: toastXml("Chat 1", "Nachricht 1") },
      { id: 2, primaryId: WA, at: min(1), payload: toastXml("Chat 1", "Nachricht 2") },
      { id: 3, primaryId: TEAMS, at: min(2), payload: toastXml("Kontakt 1", "Nachricht 3") },
      { id: 4, primaryId: DOCKER, at: min(3), payload: toastXml("Docker", "nicht für dieses Widget") },
    ]);
    let data = await collect();
    expect(MessengerData.parse(data)).toEqual(data);
    expect(data.chats.map(c => [c.app, c.title, c.lines.length, c.unread])).toEqual([
      ["teams", "Kontakt 1", 1, 1],
      ["whatsapp", "Chat 1", 2, 2],
    ]);
    expect(data.source).toEqual({ toasts: 3, copied: false });

    deleteToasts(db, [1, 2, 3]);
    writeToasts(db, [{ id: 5, primaryId: WA, at: min(4), payload: toastXml("Chat 1", "Nachricht 4") }]);
    data = await collect();
    expect(data.chats.map(c => [c.title, c.lines.map(l => l.text)])).toEqual([
      ["Chat 1", ["Nachricht 1", "Nachricht 2", "Nachricht 4"]],
      ["Kontakt 1", ["Nachricht 3"]],
    ]);
    expect(data.unread).toBe(4);
  });

  it("writes the file only when something changed", async () => {
    writeToasts(db, [{ id: 1, primaryId: WA, at: min(0), payload: toastXml("Chat 1", "Nachricht 1") }]);
    await collect();
    const first = statSync(feedFile()).mtimeMs;
    const content = readFileSync(feedFile(), "utf8");
    await new Promise(r => setTimeout(r, 30));
    await collect(min(11));
    expect(statSync(feedFile()).mtimeMs).toBe(first);
    expect(readFileSync(feedFile(), "utf8")).toBe(content);
  });

  it("does not create a file while there is nothing to keep", async () => {
    writeToasts(db, [{ id: 1, primaryId: DOCKER, at: min(0), payload: toastXml("Docker", "x") }]);
    expect((await collect()).chats).toEqual([]);
    expect(() => statSync(feedFile())).toThrow();
  });

  it("throws on a broken feed file and leaves it untouched", async () => {
    writeToasts(db, [{ id: 1, primaryId: WA, at: min(0), payload: toastXml("Chat 1", "Nachricht 1") }]);
    mkdirSync(join(dir, "data", "messages"), { recursive: true });
    writeFileSync(feedFile(), "{kaputt");
    await expect(collect()).rejects.toThrow(/kein gültiges JSON/);
    expect(readFileSync(feedFile(), "utf8")).toBe("{kaputt");
  });

  it("skips toasts without a message text and keeps the rest", async () => {
    writeToasts(db, [
      { id: 1, primaryId: WA, at: min(0), payload: toastXml("Nur Titel") },
      { id: 2, primaryId: WA, at: min(1), payload: "<toast><visual>" },
      { id: 3, primaryId: WA, at: min(2), payload: toastXml("Chat 1", "Überprüfe auf neue Nachrichten…") },
      { id: 4, primaryId: WA, at: min(3), payload: toastXml("Chat 2", "Nachricht 1") },
    ]);
    expect((await collect()).chats.map(c => c.title)).toEqual(["Chat 2"]);
  });

  it("writes the expected payload fixture", async () => {
    writeToasts(db, [
      { id: 1, primaryId: WA, at: min(0), payload: toastXml("Chat 1", "Nachricht 1") },
      { id: 2, primaryId: WA, at: min(1), payload: toastXml("Chat 1", "Nachricht 2") },
      { id: 3, primaryId: TEAMS, at: min(2), payload: toastXml("Kontakt 1", "Nachricht 3") },
      { id: 4, primaryId: "com.squirrel.Discord.Discord", at: min(3), payload: toastXml("Kontakt 2", "Nachricht 4") },
    ]);
    const data = await collect();
    expect(data.chats).toHaveLength(3);
    if (process.env.UPDATE_FIXTURES) {
      writeFileSync(new URL("./fixtures/messenger.json", import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
    }
  });

  it("shows only the apps left by only/except, each instance in its own file", async () => {
    writeToasts(db, [
      { id: 1, primaryId: WA, at: min(0), payload: toastXml("Chat 1", "Nachricht 1") },
      { id: 2, primaryId: SLACK, at: min(1), payload: toastXml("Kanal 1", "Nachricht 2") },
    ]);
    const run = (instance: string, filter: object) =>
      collectMessenger(
        { dataDir: join(dir, "data"), readToasts, now: () => min(10) },
        { instance, config: { ...MessengerConfig.parse(filter), dbPath: db }, env: {} },
      );
    const slack = await run("slack", { only: ["slack"] });
    expect(slack.chats.map(c => c.title)).toEqual(["Kanal 1"]);
    expect(slack.apps.map(a => a.id)).toEqual(["slack"]);
    expect(slack.source.toasts).toBe(1);
    const rest = await run("nachrichten", { except: ["slack"] });
    expect(rest.chats.map(c => c.title)).toEqual(["Chat 1"]);
    expect(rest.apps.map(a => a.id)).not.toContain("slack");
  });

  it("finds the database under LOCALAPPDATA unless dbPath is set", () => {
    const c = MessengerConfig.parse({});
    expect(dbPathOf(c, { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" })).toBe(
      join("C:\\Users\\x\\AppData\\Local", "Microsoft", "Windows", "Notifications", "wpndatabase.db"),
    );
    expect(() => dbPathOf(c, {})).toThrow(/dbPath/);
  });
});
