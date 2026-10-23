// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetState } from "@shared/widget-contract";
import fixture from "./fixtures/messenger.json";
import type { MessengerData } from "./manifest";
import MessengerWidget from "./Widget";

// The app's own context hook, not an external service.
const runAction = vi.fn();
vi.mock("../../web/src/hub/DashboardProvider", () => ({ useDashboard: () => ({ runAction }) }));

const data = fixture as MessengerData;
const state = (d: MessengerData): WidgetState<MessengerData> & { data: MessengerData } => ({
  instance: "nachrichten",
  type: "messenger",
  status: "ok",
  updatedAt: "2026-10-22T08:10:00.000Z",
  checkedAt: "2026-10-22T08:10:00.000Z",
  data: d,
});
const show = (d: MessengerData = data) => render(<MessengerWidget state={state(d)} config={{}} />);
const whatsapp = data.chats.find(c => c.app === "whatsapp")!;

beforeEach(() => runAction.mockImplementation(async () => ({ ok: true, state: state(data) })));
afterEach(() => {
  cleanup();
  runAction.mockReset();
});

describe("MessengerWidget", () => {
  it("renders chats with unread counts, foreign text only as text", () => {
    const { container } = show({ ...data, chats: [{ ...whatsapp, title: "<b>Chat</b>", text: "<img src=x onerror=alert(1)>" }] });
    expect(screen.getByText("<b>Chat</b>")).toBeTruthy();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(container.querySelector("b, img")).toBeNull();
    cleanup();
    show();
    expect(screen.getByText(`${data.unread} ungelesen`)).toBeTruthy();
    expect(screen.getByLabelText(`${whatsapp.unread} ungelesen`)).toBeTruthy();
  });

  it("opening a chat shows its history and marks it read", async () => {
    show();
    await act(async () => fireEvent.click(screen.getByText(whatsapp.title)));
    for (const l of whatsapp.lines) expect(screen.getByText(l.text)).toBeTruthy();
    expect(runAction).toHaveBeenCalledWith("nachrichten", "markRead", { key: whatsapp.key });
  });

  it("dismisses a chat, hides an app, marks all read and clears", async () => {
    show({ ...data, chats: [whatsapp] });
    await act(async () => fireEvent.click(screen.getByLabelText("Chat ausblenden")));
    expect(runAction).toHaveBeenLastCalledWith("nachrichten", "dismiss", { key: whatsapp.key });
    await act(async () => fireEvent.click(screen.getByLabelText("WhatsApp ausblenden")));
    expect(runAction).toHaveBeenLastCalledWith("nachrichten", "mute", { app: "whatsapp" });
    await act(async () => fireEvent.click(screen.getByText("Alle gelesen")));
    expect(runAction).toHaveBeenLastCalledWith("nachrichten", "markAllRead", {});
    await act(async () => fireEvent.click(screen.getByText("Leeren")));
    expect(runAction).toHaveBeenLastCalledWith("nachrichten", "clear", {});
  });

  it("offers undo and unmute from the payload", async () => {
    show({
      ...data,
      undo: { kind: "mute", count: 1, app: "WhatsApp" },
      apps: data.apps.map(a => (a.id === "whatsapp" ? { ...a, muted: true } : a)),
    });
    expect(screen.getByText("WhatsApp ausgeblendet")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText("Rückgängig")));
    expect(runAction).toHaveBeenLastCalledWith("nachrichten", "undo", {});
    await act(async () => fireEvent.click(screen.getByLabelText("WhatsApp wieder einblenden")));
    expect(runAction).toHaveBeenLastCalledWith("nachrichten", "unmute", { app: "whatsapp" });
  });

  it("explains the empty state and shows action errors", async () => {
    runAction.mockImplementation(async () => ({ ok: false, error: "Nichts rückgängig zu machen" }));
    show({ ...data, chats: [], unread: 0, undo: { kind: "clear", count: 2 } });
    expect(screen.getByText(/Windows-Benachrichtigung/)).toBeTruthy();
    expect((screen.getByText("Leeren").closest("button") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent.click(screen.getByText("Rückgängig")));
    expect(screen.getByText("Nichts rückgängig zu machen")).toBeTruthy();
  });
});
