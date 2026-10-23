import { describe, expect, it } from "vitest";
import { DEFAULT_APPS } from "./apps";
import {
  addToasts,
  clear,
  dismiss,
  emptyFeed,
  isStatusText,
  markAllRead,
  markRead,
  mute,
  toPayload,
  undo,
  unmute,
  unreadOf,
  type Feed,
  type FeedItem,
} from "./feed";
import { MAX_CHATS, MAX_DISMISSED, MAX_LINES, UNDO_MS } from "./manifest";

const T0 = Date.UTC(2026, 9, 22, 8, 0, 0);
const min = (n: number) => T0 + n * 60_000;
let ids = 0;
const toast = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: `wpn:${++ids}`,
  app: "whatsapp",
  key: "whatsapp:Chat 1",
  title: "Chat 1",
  text: "Nachricht",
  at: min(0),
  ...over,
});
const chatOf = (f: Feed, key = "whatsapp:Chat 1") => f.chats.find(c => c.key === key);

describe("addToasts", () => {
  it("collects the toasts of one chat into one entry, newest text last", () => {
    const f = addToasts(emptyFeed(), [toast({ text: "Hallo", at: min(0) }), toast({ text: "Bist du da?", at: min(1) })]);
    expect(f.chats).toHaveLength(1);
    expect(chatOf(f)!.lines.map(l => l.text)).toEqual(["Hallo", "Bist du da?"]);
  });

  it("is idempotent: the same toasts again change nothing", () => {
    const items = [toast({ text: "a", at: min(0) }), toast({ text: "b", at: min(1) }), toast({ key: "teams:X", app: "teams", title: "X", at: min(2) })];
    const once = addToasts(emptyFeed(), items);
    expect(JSON.stringify(addToasts(once, items))).toBe(JSON.stringify(once));
  });

  it("treats the same text within two minutes as one message, later as a new one", () => {
    let f = addToasts(emptyFeed(), [toast({ text: "ok", at: min(0) })]);
    f = addToasts(f, [toast({ text: "ok", at: min(0.5) })]);
    expect(chatOf(f)!.lines).toHaveLength(1);
    f = addToasts(f, [toast({ text: "ok", at: min(5) })]);
    expect(chatOf(f)!.lines).toHaveLength(2);
  });

  it(`keeps the newest ${MAX_LINES} lines per chat`, () => {
    const f = addToasts(
      emptyFeed(),
      Array.from({ length: MAX_LINES + 2 }, (_, i) => toast({ text: `n${i}`, at: min(i) })),
    );
    expect(chatOf(f)!.lines.map(l => l.text)).toEqual(Array.from({ length: MAX_LINES }, (_, i) => `n${i + 2}`));
  });

  it(`keeps the newest ${MAX_CHATS} chats, and an old toast of a dropped chat stays out`, () => {
    const items = Array.from({ length: MAX_CHATS + 1 }, (_, i) => toast({ key: `whatsapp:c${i}`, title: `c${i}`, at: min(i) }));
    const f = addToasts(emptyFeed(), items);
    expect(f.chats).toHaveLength(MAX_CHATS);
    expect(chatOf(f, "whatsapp:c0")).toBeUndefined();
    expect(f.chats[0]!.key).toBe(`whatsapp:c${MAX_CHATS}`);
    expect(JSON.stringify(addToasts(f, [items[0]!]))).toBe(JSON.stringify(f));
  });

  it("drops status texts, empty texts and texts from ignoreTexts", () => {
    const f = addToasts(
      emptyFeed(),
      [toast({ text: "Überprüfe auf neue Nachrichten…" }), toast({ text: "  " }), toast({ text: "Läuft im Hintergrund" })],
      ["läuft im hintergrund"],
    );
    expect(f.chats).toEqual([]);
    expect(isStatusText("Checking for new messages...")).toBe(true);
    expect(isStatusText("Überprüfe auf neue Nachrichten von Anna")).toBe(false);
  });

  it("takes the title of the newest toast", () => {
    const f = addToasts(emptyFeed(), [toast({ title: "Alt", at: min(0) }), toast({ title: "Neu", at: min(1) })]);
    expect(chatOf(f)!.title).toBe("Neu");
  });
});

describe("unread", () => {
  it("counts lines after the last read, per chat and for all", () => {
    let f = addToasts(emptyFeed(), [toast({ at: min(0), text: "a" }), toast({ at: min(1), text: "b" }), toast({ key: "teams:X", app: "teams", at: min(1) })]);
    expect(unreadOf(chatOf(f)!, f)).toBe(2);
    f = markRead(f, "whatsapp:Chat 1", min(2));
    expect(unreadOf(chatOf(f)!, f)).toBe(0);
    expect(unreadOf(chatOf(f, "teams:X")!, f)).toBe(1);
    f = addToasts(f, [toast({ at: min(3), text: "c" })]);
    expect(unreadOf(chatOf(f)!, f)).toBe(1);
    f = markAllRead(f, min(4));
    expect(f.chats.map(c => unreadOf(c, f))).toEqual([0, 0]);
  });

  it("markRead on an unknown chat is 404", () => {
    expect(() => markRead(emptyFeed(), "whatsapp:nope", min(0))).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe("dismiss, clear, mute and undo", () => {
  const two = () =>
    addToasts(emptyFeed(), [toast({ at: min(0), text: "alt" }), toast({ key: "teams:X", app: "teams", title: "X", at: min(1) })]);

  it("a dismissed chat stays away when Windows still has its toast, and comes back with a new message only", () => {
    const old = toast({ at: min(0), text: "alt" });
    let f = dismiss(addToasts(emptyFeed(), [old]), "whatsapp:Chat 1", min(1));
    expect(chatOf(f)).toBeUndefined();
    f = addToasts(f, [old]);
    expect(chatOf(f)).toBeUndefined();
    f = addToasts(f, [old, toast({ at: min(2), text: "neu" })]);
    expect(chatOf(f)!.lines.map(l => l.text)).toEqual(["neu"]);
  });

  it("clear removes all, undo brings them back merged with what arrived since", () => {
    let f = clear(two(), min(2));
    expect(f.chats).toEqual([]);
    f = addToasts(f, [toast({ at: min(3), text: "später" })]);
    f = undo(f, min(4));
    expect(chatOf(f)!.lines.map(l => l.text)).toEqual(["alt", "später"]);
    expect(chatOf(f, "teams:X")).toBeDefined();
    expect(f.dismissed).toEqual({});
    expect(f.undo).toBeNull();
  });

  it("undo is 409 without a step, after it expired and the second time", () => {
    expect(() => undo(emptyFeed(), min(0))).toThrow(expect.objectContaining({ status: 409 }));
    const f = clear(two(), min(2));
    expect(() => undo(f, min(2) + UNDO_MS + 1)).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => undo(undo(f, min(3)), min(3))).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("mute hides an app and ignores its new toasts; undo and unmute let it back in", () => {
    let f = mute(two(), "whatsapp", min(2));
    expect(f.chats.map(c => c.app)).toEqual(["teams"]);
    f = addToasts(f, [toast({ at: min(3), text: "neu" })]);
    expect(chatOf(f)).toBeUndefined();
    const undone = undo(f, min(4));
    expect(undone.mutedApps).toEqual([]);
    expect(chatOf(undone)!.lines.map(l => l.text)).toEqual(["alt"]);
    f = addToasts(unmute(f, "whatsapp"), [toast({ at: min(5), text: "wieder da" })]);
    expect(chatOf(f)!.lines.map(l => l.text)).toEqual(["wieder da"]);
  });

  it(`keeps at most ${MAX_DISMISSED} dismissed marks, the newest`, () => {
    // Only MAX_CHATS fit at once: add and clear in rounds until every chat was dismissed once.
    const items = Array.from({ length: MAX_DISMISSED + 5 }, (_, i) => toast({ key: `whatsapp:c${i}`, at: min(i) }));
    let f = emptyFeed();
    for (let i = 0; i < items.length; i += MAX_CHATS) f = clear(addToasts(f, items.slice(i, i + MAX_CHATS)), min(1000));
    expect(Object.keys(f.dismissed)).toHaveLength(MAX_DISMISSED);
    expect(f.dismissed["whatsapp:c0"]).toBeUndefined();
    expect(f.dismissed[`whatsapp:c${MAX_DISMISSED + 4}`]).toBe(min(MAX_DISMISSED + 4));
  });
});

describe("toPayload", () => {
  it("adds app label and color, unread counts, ISO times and the undo step", () => {
    const f = dismiss(addToasts(emptyFeed(), [toast({ at: min(0), text: "<b>x</b>" }), toast({ key: "teams:X", app: "teams", title: "X", at: min(1) })]), "teams:X", min(2));
    const p = toPayload(f, DEFAULT_APPS, { toasts: 2, copied: false }, min(3));
    expect(p.chats).toEqual([
      {
        key: "whatsapp:Chat 1",
        app: "whatsapp",
        appLabel: "WhatsApp",
        color: "#25d366",
        title: "Chat 1",
        text: "<b>x</b>",
        at: new Date(min(0)).toISOString(),
        unread: 1,
        lines: [{ id: expect.any(String), text: "<b>x</b>", at: new Date(min(0)).toISOString() }],
      },
    ]);
    expect(p.unread).toBe(1);
    expect(p.undo).toEqual({ kind: "dismiss", count: 1 });
    expect(toPayload(f, DEFAULT_APPS, { toasts: 2, copied: false }, min(2) + UNDO_MS + 1).undo).toBeNull();
    expect(p.apps.find(a => a.id === "whatsapp")).toEqual({ id: "whatsapp", label: "WhatsApp", color: "#25d366", muted: false });
  });

  it("names the app of a mute step and hides chats of apps no longer configured", () => {
    const f = mute(addToasts(emptyFeed(), [toast(), toast({ key: "teams:X", app: "teams" })]), "whatsapp", min(1));
    const p = toPayload(f, DEFAULT_APPS.filter(a => a.id !== "teams"), { toasts: 0, copied: false }, min(1));
    expect(p.undo).toEqual({ kind: "mute", count: 1, app: "WhatsApp" });
    expect(p.chats).toEqual([]);
  });
});
