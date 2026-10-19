// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetState } from "@shared/widget-contract";
import fixture from "./fixtures/mail.json";
import type { MailData } from "./manifest";
import MailWidget from "./Widget";

// UI-internal helper (it calls our own /api/open), not an external service.
vi.mock("../../web/src/lib/openUrl", () => ({ openUrl: vi.fn(async () => {}) }));
const { openUrl } = await import("../../web/src/lib/openUrl");

afterEach(() => {
  cleanup();
  vi.mocked(openUrl).mockClear();
});

const state = (data: MailData): WidgetState<MailData> & { data: MailData } => ({
  instance: "mail",
  type: "mail",
  status: "ok",
  updatedAt: "2026-10-19T09:00:00.000Z",
  checkedAt: "2026-10-19T09:00:00.000Z",
  data,
});
const data = fixture as MailData;

describe("MailWidget", () => {
  it("shows the unread count per account", () => {
    render(<MailWidget state={state(data)} config={{}} />);
    expect(screen.getByText("Gmail privat").textContent).toContain("2");
    expect(screen.getByText("Outlook").textContent).toContain("1");
  });

  it("opens a mail in the browser on click", () => {
    render(<MailWidget state={state(data)} config={{}} />);
    const first = data.messages[0]!;
    fireEvent.click(screen.getByTitle(first.subject));
    expect(openUrl).toHaveBeenCalledWith(first.url);
  });

  it("offers the login for an unconnected account as an absolute URL", () => {
    const accounts = data.accounts.map((a, i) =>
      i === 0 ? { ...a, status: "unconfigured" as const, unread: null, error: "Nicht verbunden", action: "/auth/google/start?account=gmail-privat" } : a,
    );
    render(<MailWidget state={state({ ...data, accounts })} config={{}} />);
    fireEvent.click(screen.getByText(/verbinden/));
    expect(openUrl).toHaveBeenCalledWith(`${window.location.origin}/auth/google/start?account=gmail-privat`);
  });

  it("renders subjects as text and handles an empty inbox", () => {
    const msg = { ...data.messages[0]!, subject: "<b>fett</b>" };
    const { unmount } = render(<MailWidget state={state({ ...data, messages: [msg] })} config={{}} />);
    expect(screen.getByText("<b>fett</b>")).toBeTruthy();
    unmount();
    render(<MailWidget state={state({ ...data, messages: [] })} config={{}} />);
    expect(screen.getByText("Keine Mails in der Inbox")).toBeTruthy();
  });
});
