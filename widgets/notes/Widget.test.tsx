// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetState } from "@shared/widget-contract";
import fixture from "./fixtures/notes.json";
import type { NotesData } from "./manifest";
import NotesWidget, { cascadePos, placeNotes } from "./Widget";

// The app's own context hook, not an external service.
const runAction = vi.fn();
vi.mock("../../web/src/hub/DashboardProvider", () => ({ useDashboard: () => ({ runAction }) }));

const data = fixture as NotesData;
const state = (d: NotesData): WidgetState<NotesData> & { data: NotesData } => ({
  instance: "notizen",
  type: "notes",
  status: "ok",
  updatedAt: "2026-10-19T09:00:00.000Z",
  checkedAt: "2026-10-19T09:00:00.000Z",
  data: d,
});

beforeEach(() => runAction.mockImplementation(async () => ({ ok: true, state: state(data) })));
afterEach(() => {
  cleanup();
  runAction.mockReset();
  vi.useRealTimers();
});

const first = data.notes[0]!;

describe("NotesWidget", () => {
  it("renders notes as text, without a tile", () => {
    render(<NotesWidget state={state({ notes: [{ ...first, text: "<b>fett</b>" }] })} config={{}} />);
    expect((screen.getByLabelText("Notiz") as HTMLTextAreaElement).value).toBe("<b>fett</b>");
    // The start pad only exists while there is no note.
    expect(screen.queryByLabelText("Neue Notiz")).toBeNull();
  });

  it("saves typed text on blur, and nothing when unchanged", async () => {
    render(<NotesWidget state={state(data)} config={{}} />);
    const box = screen.getAllByLabelText("Notiz")[0]!;
    fireEvent.focus(box);
    fireEvent.blur(box);
    expect(runAction).not.toHaveBeenCalled();
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "neu" } });
    await act(async () => fireEvent.blur(box));
    expect(runAction).toHaveBeenCalledWith("notizen", "update", { id: first.id, text: "neu" });
  });

  it("saves after a typing pause", async () => {
    vi.useFakeTimers();
    render(<NotesWidget state={state(data)} config={{}} />);
    fireEvent.change(screen.getAllByLabelText("Notiz")[0]!, { target: { value: "x" } });
    await act(async () => vi.advanceTimersByTime(900));
    expect(runAction).toHaveBeenCalledWith("notizen", "update", { id: first.id, text: "x" });
  });

  it("toggles done and changes the color", async () => {
    render(<NotesWidget state={state(data)} config={{}} />);
    await act(async () => fireEvent.click(screen.getAllByLabelText("als erledigt markieren")[0]!));
    expect(runAction).toHaveBeenCalledWith("notizen", "update", { id: first.id, done: true });
    await act(async () => fireEvent.click(screen.getAllByLabelText("Farbe rosa")[0]!));
    expect(runAction).toHaveBeenCalledWith("notizen", "update", { id: first.id, color: "pink" });
  });

  it("adds a note and offers undo after deleting one", async () => {
    render(<NotesWidget state={state(data)} config={{}} />);
    // Next to the note, in its color; if that spot is taken, on the next free one.
    const near = placeNotes(data.notes).positions.get(first.id)!;
    const beside = { x: near.x + 0.04, y: near.y + 0.06 };
    const taken = [...placeNotes(data.notes).positions.values()].some(p => Math.abs(p.x - beside.x) < 0.02 && Math.abs(p.y - beside.y) < 0.02);
    await act(async () => fireEvent.click(screen.getAllByLabelText("Neues Post-it daneben")[0]!));
    expect(runAction).toHaveBeenCalledWith("notizen", "add", { ...(taken ? placeNotes(data.notes).next : beside), color: first.color });
    cleanup();
    render(<NotesWidget state={state({ notes: [{ ...first, x: 0.5, y: 0.5 }] })} config={{}} />);
    await act(async () => fireEvent.click(screen.getByLabelText("Neues Post-it daneben")));
    expect(runAction).toHaveBeenLastCalledWith("notizen", "add", { x: 0.54, y: 0.56, color: first.color });
    cleanup();
    render(<NotesWidget state={state(data)} config={{}} />);
    await act(async () => fireEvent.click(screen.getAllByLabelText("Notiz löschen")[0]!));
    expect(runAction).toHaveBeenCalledWith("notizen", "remove", { id: first.id });
    await act(async () => fireEvent.click(screen.getByText("Rückgängig")));
    expect(runAction).toHaveBeenLastCalledWith("notizen", "add", { text: first.text, color: first.color });

    // A placed note comes back at its place.
    cleanup();
    const placed = { ...first, x: 0.2, y: 0.3 };
    render(<NotesWidget state={state({ notes: [placed] })} config={{}} />);
    await act(async () => fireEvent.click(screen.getByLabelText("Notiz löschen")));
    await act(async () => fireEvent.click(screen.getByText("Rückgängig")));
    expect(runAction).toHaveBeenLastCalledWith("notizen", "add", { text: first.text, color: first.color, x: 0.2, y: 0.3 });
  });

  it("focuses the new note once the server state contains it", async () => {
    // Like the real app: the context renders the new note before runAction resolves.
    const { rerender } = render(<NotesWidget state={state({ notes: [] })} config={{}} />);
    runAction.mockImplementation(async () => {
      rerender(<NotesWidget state={state({ notes: [first] })} config={{}} />);
      return { ok: true, state: state({ notes: [first] }) };
    });
    await act(async () => fireEvent.click(screen.getByLabelText("Neue Notiz")));
    expect(document.activeElement).toBe(screen.getByLabelText("Notiz"));
  });

  it("shows a failed action next to the note", async () => {
    runAction.mockImplementation(async () => ({ ok: false, error: "Server nicht erreichbar" }));
    render(<NotesWidget state={state(data)} config={{}} />);
    await act(async () => fireEvent.click(screen.getAllByLabelText("als erledigt markieren")[0]!));
    expect(screen.getByText("Server nicht erreichbar")).toBeTruthy();
  });

  it("never stacks an unplaced or new note exactly on another one", () => {
    const placed = { ...first, id: "a", ...cascadePos(0) };
    const unplaced = { ...first, id: "b", x: null, y: null };
    const { positions, next } = placeNotes([placed, unplaced]);
    expect(positions.get("a")).toEqual(cascadePos(0));
    expect(positions.get("b")).toEqual(cascadePos(1));
    expect(next).toEqual(cascadePos(2));
  });

  it("places notes on the screen at their saved position", () => {
    render(<NotesWidget state={state({ notes: [{ ...first, x: 0.25, y: 0.5 }] })} config={{}} />);
    const card = document.querySelector<HTMLElement>(`[data-note="${first.id}"]`)!;
    expect(card.style.left).toBe("25%");
    expect(card.style.top).toBe("50%");
  });

  it("moves a note with the arrow keys and saves the position", async () => {
    vi.useFakeTimers();
    render(<NotesWidget state={state({ notes: [{ ...first, x: 0.25, y: 0.5 }] })} config={{}} />);
    const grip = screen.getByLabelText(/Notiz verschieben/);
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    fireEvent.keyDown(grip, { key: "ArrowDown", shiftKey: true });
    await act(async () => vi.advanceTimersByTime(600));
    expect(runAction).toHaveBeenCalledWith("notizen", "update", { id: first.id, x: 0.26, y: 0.55 });
  });

  it("drags a note with the pointer and saves where it was dropped", async () => {
    render(<NotesWidget state={state({ notes: [{ ...first, x: 0, y: 0 }] })} config={{}} />);
    const grip = screen.getByLabelText(/Notiz verschieben/);
    // jsdom: window 1024×768, card rect at 0,0
    fireEvent.pointerDown(grip, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    // Move and release in one go, before React re-renders: like a fast real drag.
    await act(async () => {
      fireEvent.pointerMove(grip, { clientX: 522, clientY: 394, pointerId: 1 });
      fireEvent.pointerUp(grip, { pointerId: 1 });
    });
    expect(runAction).toHaveBeenCalledWith("notizen", "update", { id: first.id, x: 0.5, y: 0.5 });
  });

  it("does not start a drag from a button in the strip", async () => {
    render(<NotesWidget state={state({ notes: [{ ...first, x: 0, y: 0 }] })} config={{}} />);
    const grip = screen.getByLabelText(/Notiz verschieben/);
    fireEvent.pointerDown(screen.getByLabelText("Notiz löschen"), { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 522, clientY: 394, pointerId: 1 });
    await act(async () => fireEvent.pointerUp(grip, { pointerId: 1 }));
    expect(runAction).not.toHaveBeenCalled();
  });

  it("shows the empty state", () => {
    render(<NotesWidget state={state({ notes: [] })} config={{}} />);
    fireEvent.click(screen.getByLabelText("Neue Notiz"));
    expect(runAction).toHaveBeenCalledWith("notizen", "add", cascadePos(0));
  });
});
