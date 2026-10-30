// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetState } from "@shared/widget-contract";
import fixture from "./fixtures/ntfy.json";
import type { NtfyData, NtfyMessage } from "./manifest";
import NtfyWidget from "./Widget";

// The app's own link helper (POST /api/open) and context hook, not external services.
const openUrl = vi.fn(async (_url: string) => {});
vi.mock("../../web/src/lib/openUrl", () => ({ openUrl: (url: string) => openUrl(url) }));
const runAction = vi.fn();
vi.mock("../../web/src/hub/DashboardProvider", () => ({ useDashboard: () => ({ runAction }) }));

const data = fixture as NtfyData;
const state = (d: NtfyData): WidgetState<NtfyData> & { data: NtfyData } => ({
  instance: "ntfy",
  type: "ntfy",
  status: "ok",
  updatedAt: "2026-10-28T08:00:00.000Z",
  checkedAt: "2026-10-28T08:00:00.000Z",
  data: d,
});
const show = (d: NtfyData = data) => render(<NtfyWidget state={state(d)} config={{}} />);
const topic = (name: string, removable = false) => ({ name, removable });
const msg = (over: Partial<NtfyMessage>): NtfyMessage => ({
  id: "m",
  at: "2026-10-28T07:00:00.000Z",
  topic: "t",
  title: "Titel",
  text: "Text",
  priority: 3,
  tags: [],
  click: null,
  ...over,
});
const input = () => screen.getByLabelText("ntfy-Topic hinzufügen") as HTMLInputElement;

beforeEach(() => runAction.mockImplementation(async () => ({ ok: true, state: state(data) })));
afterEach(() => {
  cleanup();
  openUrl.mockClear();
  runAction.mockReset();
});

describe("NtfyWidget", () => {
  it("shows a hint and the input without topics", () => {
    show({ topics: [], messages: [], hidden: 0 });
    expect(screen.getByText(/Noch keine Topics/)).toBeTruthy();
    expect(input()).toBeTruthy();
  });

  it("renders the recorded messages and an empty state", () => {
    show();
    expect(screen.getAllByText("test").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(data.messages.length);
    cleanup();
    show({ topics: [topic("t")], messages: [], hidden: 0 });
    expect(screen.getByText("Keine Nachrichten")).toBeTruthy();
  });

  it("adds a topic from the input and clears it", async () => {
    show({ topics: [], messages: [], hidden: 0 });
    fireEvent.change(input(), { target: { value: " mein_topic-1 " } });
    await act(async () => fireEvent.submit(input().form!));
    expect(runAction).toHaveBeenCalledWith("ntfy", "addTopic", { topic: "mein_topic-1" });
    expect(input().value).toBe("");
  });

  it("rejects invalid names locally and shows server errors, keeping the draft", async () => {
    show({ topics: [], messages: [], hidden: 0 });
    fireEvent.change(input(), { target: { value: "a/b" } });
    await act(async () => fireEvent.submit(input().form!));
    expect(runAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Buchstaben/);

    runAction.mockResolvedValueOnce({ ok: false, error: 'Topic "ab" ist schon eingetragen' });
    fireEvent.change(input(), { target: { value: "ab" } });
    await act(async () => fireEvent.submit(input().form!));
    expect(screen.getByRole("alert").textContent).toMatch(/schon eingetragen/);
    expect(input().value).toBe("ab");
  });

  it("removes tile topics; config topics have no remove button", async () => {
    show({ topics: [topic("fixed"), topic("mine", true)], messages: [], hidden: 0 });
    expect(screen.queryByLabelText("Topic fixed entfernen")).toBeNull();
    await act(async () => fireEvent.click(screen.getByLabelText("Topic mine entfernen")));
    expect(runAction).toHaveBeenCalledWith("ntfy", "removeTopic", { topic: "mine" });
  });

  it("renders foreign text only as text and opens the click URL", () => {
    const { container } = show({
      topics: [topic("t")],
      messages: [msg({ title: "<b>x</b>", text: "<img src=x onerror=alert(1)>", tags: ["warning"], click: "https://example.com/" })],
      hidden: 0,
    });
    expect(screen.getByText("<b>x</b>")).toBeTruthy();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(screen.getByText("#warning")).toBeTruthy();
    expect(container.querySelector("b, img")).toBeNull();
    fireEvent.click(screen.getByText("<b>x</b>"));
    expect(openUrl).toHaveBeenCalledWith("https://example.com/");
  });

  it("falls back to the topic as title and labels topics when several are shown", () => {
    show({ topics: [topic("alpha"), topic("beta")], messages: [msg({ id: "1", topic: "alpha", title: null }), msg({ id: "2", topic: "beta" })], hidden: 0 });
    expect(screen.getAllByText("alpha").length).toBeGreaterThan(1);
    expect(screen.getAllByText("beta").length).toBeGreaterThan(1);
  });

  it("dismisses one message without opening its link", async () => {
    show({ topics: [topic("t")], messages: [msg({ id: "abc", click: "https://example.com/" })], hidden: 0 });
    await act(async () => fireEvent.click(screen.getByLabelText("Nachricht ausblenden")));
    expect(runAction).toHaveBeenCalledWith("ntfy", "dismiss", { id: "abc" });
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("dismisses all up to the newest shown message and restores hidden ones", async () => {
    const newest = msg({ id: "n", at: "2026-10-28T07:30:00.000Z" });
    show({ topics: [topic("t")], messages: [newest, msg({ id: "o" })], hidden: 2 });
    await act(async () => fireEvent.click(screen.getByText("Alle ausblenden")));
    expect(runAction).toHaveBeenCalledWith("ntfy", "dismissAll", { until: newest.at });
    await act(async () => fireEvent.click(screen.getByText("2 ausgeblendet · zurückholen")));
    expect(runAction).toHaveBeenCalledWith("ntfy", "restoreAll", {});
  });

  it("offers restore when everything is hidden, and no dismiss-all without messages", () => {
    show({ topics: [topic("t")], messages: [], hidden: 3 });
    expect(screen.getByText("3 ausgeblendet · zurückholen")).toBeTruthy();
    expect(screen.queryByText("Alle ausblenden")).toBeNull();
    cleanup();
    show({ topics: [topic("t")], messages: [], hidden: 0 });
    expect(screen.queryByText(/ausgeblendet/)).toBeNull();
  });
});
