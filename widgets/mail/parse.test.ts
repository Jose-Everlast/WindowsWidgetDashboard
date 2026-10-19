import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GmailListIn,
  GmailMessageIn,
  GraphMessagesIn,
  cleanSubject,
  fromGmail,
  fromGraph,
  fromImap,
  gmailUrl,
  mergeMessages,
  parseFromHeader,
  safeOutlookLink,
} from "./parse";

const fixture = (f: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

describe("Gmail", () => {
  const [unread, read] = GmailMessageIn.array().parse(fixture("gmail-message-metadata.json"));

  it("maps metadata messages", () => {
    expect(fromGmail(unread!, "gmail-privat", "jose@example.com")).toEqual({
      id: "gmail-privat:18f0000000000002",
      account: "gmail-privat",
      from: "Absender 1",
      subject: "Betreff 1",
      receivedAt: "2026-10-19T06:55:00.000Z",
      unread: true,
      url: "https://mail.google.com/mail/u/jose%40example.com/#all/18f0000000000002",
    });
    const m = fromGmail(read!, "gmail-privat", null);
    expect(m.unread).toBe(false);
    expect(m.from).toBe("absender2@example.com");
    expect(m.subject).toBe("Betreff 2 – Grüße");
    expect(m.url).toBe("https://mail.google.com/mail/u/0/#all/18f00000000000a1");
  });

  it("accepts an empty inbox without the messages field", () => {
    expect(GmailListIn.parse({ resultSizeEstimate: 0 }).messages).toBeUndefined();
  });

  it("parses From headers", () => {
    expect(parseFromHeader('"Kunde GmbH" <a@b.de>')).toBe("Kunde GmbH");
    expect(parseFromHeader("Müller, Jörg <j@b.de>")).toBe("Müller, Jörg");
    expect(parseFromHeader("<a@b.de>")).toBe("a@b.de");
    expect(parseFromHeader("a@b.de")).toBe("a@b.de");
    expect(parseFromHeader(undefined)).toBe("(unbekannt)");
  });

  it("encodes the thread id in the deep link", () => {
    expect(gmailUrl("a+b@example.com", "x/y")).toBe("https://mail.google.com/mail/u/a%2Bb%40example.com/#all/x%2Fy");
  });
});

describe("Graph", () => {
  const { value } = GraphMessagesIn.parse(fixture("graph-messages.json"));

  it("maps messages and keeps the Outlook web link", () => {
    const m = fromGraph(value[0]!, "outlook");
    expect(m).toMatchObject({ id: `outlook:${value[0]!.id}`, from: "Absender 3", subject: "Betreff 3", unread: true });
    expect(m.receivedAt).toBe("2026-10-19T07:30:00.000Z");
    expect(m.url).toMatch(/^https:\/\/outlook\.live\.com\/owa\//);
    expect(fromGraph(value[1]!, "outlook")).toMatchObject({ subject: "(kein Betreff)", unread: false });
  });

  it("drops links that are not https Outlook on the web", () => {
    expect(safeOutlookLink("https://evil.example/owa")).toBeNull();
    expect(safeOutlookLink("http://outlook.live.com/owa")).toBeNull();
    expect(safeOutlookLink("javascript:alert(1)")).toBeNull();
    expect(safeOutlookLink("not a url")).toBeNull();
    expect(safeOutlookLink(null)).toBeNull();
    expect(safeOutlookLink("https://outlook.office.com/mail/x")).toBe("https://outlook.office.com/mail/x");
  });

  it("handles a missing sender", () => {
    expect(fromGraph({ ...value[0]!, from: null }, "outlook").from).toBe("(unbekannt)");
  });
});

describe("IMAP", () => {
  it("maps envelopes, unread from missing \\Seen", () => {
    const m = fromImap(
      {
        uid: 102,
        flags: [],
        envelope: { date: new Date("2026-10-19T06:12:00.000Z"), subject: "Betreff 6", from: [{ name: "Absender 6", address: "a6@example.com" }] },
      },
      "imap",
      "https://webmail.example.com",
    );
    expect(m).toEqual({
      id: "imap:102",
      account: "imap",
      from: "Absender 6",
      subject: "Betreff 6",
      receivedAt: "2026-10-19T06:12:00.000Z",
      unread: true,
      url: "https://webmail.example.com",
    });
    const read = fromImap({ uid: 1, flags: ["\\Seen"], internalDate: "2026-10-18T18:40:00.000Z", envelope: {} }, "imap", null);
    expect(read).toMatchObject({ unread: false, subject: "(kein Betreff)", from: "(unbekannt)", url: null, receivedAt: "2026-10-18T18:40:00.000Z" });
  });
});

describe("helpers", () => {
  it("cleans and truncates subjects", () => {
    expect(cleanSubject("  a \n b ")).toBe("a b");
    expect(cleanSubject(null)).toBe("(kein Betreff)");
    const long = cleanSubject("x".repeat(300));
    expect(long).toHaveLength(200);
    expect(long.endsWith("…")).toBe(true);
  });

  it("merges accounts newest first and applies the limit", () => {
    const m = (id: string, receivedAt: string) => ({ id, account: "a", from: "f", subject: "s", receivedAt, unread: false, url: null });
    const merged = mergeMessages(
      [
        [m("1", "2026-10-19T08:00:00.000Z"), m("2", "2026-10-17T08:00:00.000Z")],
        [m("3", "2026-10-18T08:00:00.000Z")],
      ],
      2,
    );
    expect(merged.map(x => x.id)).toEqual(["1", "3"]);
  });
});
