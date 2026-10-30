import { Check, GripHorizontal, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { WidgetProps } from "@shared/widget-contract";
import { useDashboard } from "../../web/src/hub/DashboardProvider";
import { MAX_NOTES, MAX_TEXT, NOTE_COLORS, type Note, type NoteColor, type NotesData } from "./manifest";

// Real paper colors with dark ink: they should look like notes stuck onto the screen, not like HUD panels.
const PAPER: Record<NoteColor, { paper: string; strip: string; dot: string; label: string }> = {
  yellow: { paper: "bg-[#ffe27a]", strip: "bg-[#f5d35c]", dot: "bg-[#ffe27a]", label: "gelb" },
  pink: { paper: "bg-[#ffa8d2]", strip: "bg-[#f792c2]", dot: "bg-[#ffa8d2]", label: "rosa" },
  green: { paper: "bg-[#a6eba9]", strip: "bg-[#8fdf93]", dot: "bg-[#a6eba9]", label: "grün" },
  blue: { paper: "bg-[#a3d4ff]", strip: "bg-[#8bc6fb]", dot: "bg-[#a3d4ff]", label: "blau" },
};

const SAVE_DELAY_MS = 800;
const UNDO_MS = 5_000;
const KEY_STEP = 0.01;

type Run = (action: string, input: unknown) => Promise<string | null>;
type Pos = { x: number; y: number };

const clamp = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));

/** A slight, stable tilt per note (from its id), like paper stuck on by hand. */
function tiltOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 50) - 25) / 10; // -2.5° … +2.4°
}

/** Slot i of a loose cascade in the middle of the screen, for notes that have no position yet. */
export const cascadePos = (i: number): Pos => ({
  x: 0.36 + (i % 5) * 0.035 + Math.floor(i / 5) * 0.12,
  y: 0.18 + (i % 5) * 0.06,
});

const near = (a: Pos, b: Pos) => Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02;

/** Positions for all notes: saved ones as they are, the others on cascade slots nobody covers yet. */
export function placeNotes(notes: Note[]): { positions: Map<string, Pos>; next: Pos } {
  const positions = new Map<string, Pos>();
  for (const n of notes) if (n.x !== null && n.y !== null) positions.set(n.id, { x: n.x, y: n.y });
  let slot = 0;
  const freeSlot = () => {
    let p = cascadePos(slot++);
    while ([...positions.values()].some(q => near(p, q))) p = cascadePos(slot++);
    return p;
  };
  for (const n of notes) if (!positions.has(n.id)) positions.set(n.id, freeSlot());
  return { positions, next: freeSlot() };
}

function StickyNote({
  note,
  place,
  z,
  run,
  autoFocus,
  onFront,
  onAdd,
}: {
  note: Note;
  place: Pos;
  z: number;
  run: Run;
  autoFocus: boolean;
  onFront: () => void;
  /** New note right next to this one. */
  onAdd: (near: Pos) => void;
}) {
  const [draft, setDraft] = useState(note.text);
  const [error, setError] = useState<string | null>(null);
  // Position while dragging or moving by keyboard; the saved one otherwise.
  const [moving, setMoving] = useState<Pos | null>(null);
  const focused = useRef(false);
  const saved = useRef(note.text);
  const textTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const card = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // The latest drag position lives in the ref: pointerup can fire before React rendered the last move.
  const grab = useRef<{ dx: number; dy: number; last: Pos | null } | null>(null);

  useEffect(() => {
    saved.current = note.text;
    if (!focused.current) setDraft(note.text);
  }, [note.text]);
  // The card usually mounts before the widget knows it is the new one, so autoFocus would come too late.
  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);
  useEffect(
    () => () => {
      clearTimeout(textTimer.current);
      clearTimeout(moveTimer.current);
    },
    [],
  );

  const act = async (action: string, input: unknown) => setError(await run(action, input));
  // The text is passed in: a debounced call must not read the draft of an older render.
  const save = (text: string) => {
    clearTimeout(textTimer.current);
    if (text === saved.current) return;
    saved.current = text;
    void act("update", { id: note.id, text });
  };

  const pos: Pos = moving ?? place;
  // Keep the whole note on screen.
  const limits = () => {
    const r = card.current?.getBoundingClientRect();
    return { maxX: 1 - (r?.width ?? 0) / window.innerWidth, maxY: 1 - (r?.height ?? 0) / window.innerHeight };
  };
  const savePos = async (p: Pos) => {
    await act("update", { id: note.id, x: Math.round(p.x * 10_000) / 10_000, y: Math.round(p.y * 10_000) / 10_000 });
    setMoving(null);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // The whole strip is the grip, except its buttons.
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    e.preventDefault();
    onFront();
    const r = card.current!.getBoundingClientRect();
    grab.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, last: null };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return;
    const { maxX, maxY } = limits();
    g.last = { x: clamp((e.clientX - g.dx) / window.innerWidth, maxX), y: clamp((e.clientY - g.dy) / window.innerHeight, maxY) };
    setMoving(g.last);
  };
  const onPointerUp = () => {
    const g = grab.current;
    grab.current = null;
    if (g?.last) void savePos(g.last);
  };
  // Keyboard alternative to dragging: arrow keys on the grip, Shift for bigger steps.
  const onGripKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    const { maxX, maxY } = limits();
    const next = { x: clamp(pos.x + d[0], maxX), y: clamp(pos.y + d[1], maxY) };
    setMoving(next);
    clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => void savePos(next), 500);
  };

  const lifted = moving !== null;
  return (
    <div
      ref={card}
      data-note={note.id}
      onPointerDownCapture={onFront}
      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, zIndex: z, rotate: lifted ? "0deg" : `${tiltOf(note.id)}deg` }}
      className={`group pointer-events-auto absolute w-52 text-[#2b2a26] transition-[rotate,scale,translate] duration-150 ${
        lifted ? "-translate-y-1.5 scale-[1.04]" : "hover:-translate-y-0.5"
      } ${note.done ? "opacity-70" : ""}`}
    >
      {/* 3D look from static layers only (rule: animate transform/opacity, never box-shadow):
          the two lower corners curl up and cast slanted shadows, a soft lift shadow fades in on hover/drag. */}
      <span aria-hidden className="pointer-events-none absolute bottom-3 left-2 h-1/4 w-1/2 origin-bottom-left -rotate-[4deg] bg-black/40 shadow-[0_12px_10px_rgb(0_0_0/0.6)]" />
      <span aria-hidden className="pointer-events-none absolute right-2 bottom-3 h-1/4 w-1/2 origin-bottom-right rotate-[4deg] bg-black/40 shadow-[0_12px_10px_rgb(0_0_0/0.6)]" />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-1 shadow-[0_24px_36px_rgb(0_0_0/0.55)] transition-opacity duration-150 ${
          lifted ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
      />
      <div
        className={`relative flex flex-col overflow-hidden rounded-br-[3rem_0.4rem] rounded-bl-[3rem_0.4rem] shadow-[0_1px_2px_rgb(0_0_0/0.35)] ${PAPER[note.color].paper}`}
      >
        {/* Paper shading: light from the top, the curled bottom edge a touch darker. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgb(255_255_255/0.28),transparent_35%,transparent_75%,rgb(0_0_0/0.09))]"
        />
        <div
          role="button"
          tabIndex={0}
          aria-label="Notiz verschieben (ziehen oder Pfeiltasten)"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onGripKey}
          className={`relative flex h-7 cursor-grab touch-none items-center gap-1 px-1.5 shadow-[inset_0_-1px_0_rgb(0_0_0/0.08)] active:cursor-grabbing ${PAPER[note.color].strip}`}
        >
          <GripHorizontal className="size-4 opacity-40" aria-hidden />
          <div
            className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          >
            <button
              type="button"
              aria-label="Neues Post-it daneben"
              onClick={() => onAdd(pos)}
              className="grid size-6 place-items-center rounded-sm hover:bg-black/10"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              aria-label={note.done ? "als offen markieren" : "als erledigt markieren"}
              aria-pressed={note.done}
              onClick={() => void act("update", { id: note.id, done: !note.done })}
              className={`grid size-6 place-items-center rounded-sm hover:bg-black/10 ${note.done ? "text-[#1f7a3a]" : ""}`}
            >
              <Check className="size-4" />
            </button>
            {NOTE_COLORS.map(c => (
              <button
                key={c}
                type="button"
                aria-label={`Farbe ${PAPER[c].label}`}
                aria-pressed={note.color === c}
                onClick={() => note.color !== c && void act("update", { id: note.id, color: c })}
                className="grid size-6 place-items-center rounded-sm hover:bg-black/10"
              >
                <span className={`size-3 rounded-full border border-black/30 ${PAPER[c].dot} ${note.color === c ? "ring-2 ring-black/50" : ""}`} />
              </button>
            ))}
            <button
              type="button"
              aria-label="Notiz löschen"
              onClick={() => void act("remove", { id: note.id })}
              className="grid size-6 place-items-center rounded-sm hover:bg-black/10 hover:text-[#b4232f]"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        <textarea
          ref={box}
          aria-label="Notiz"
          value={draft}
          maxLength={MAX_TEXT}
          rows={6}
          placeholder="Notiz …"
          spellCheck={false}
          onFocus={() => {
            focused.current = true;
            onFront();
          }}
          onBlur={e => {
            focused.current = false;
            save(e.currentTarget.value);
          }}
          onChange={e => {
            const text = e.target.value;
            setDraft(text);
            clearTimeout(textTimer.current);
            textTimer.current = setTimeout(() => save(text), SAVE_DELAY_MS);
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && e.ctrlKey) save(e.currentTarget.value);
          }}
          className={`relative w-full resize-none bg-transparent px-3 pt-2 pb-3 text-[15px] leading-relaxed font-medium outline-none placeholder:text-black/35 ${note.done ? "line-through decoration-black/50" : ""}`}
        />
        {error && <p className="relative px-3 pb-2 text-xs text-[#b4232f]">{error}</p>}
      </div>
    </div>
  );
}

export default function NotesWidget({ state }: WidgetProps<NotesData>) {
  const { runAction } = useDashboard();
  const { notes } = state.data;
  const [undo, setUndo] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Last touched note on top; client-side only.
  const [order, setOrder] = useState<string[]>([]);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const toFront = (id: string) => setOrder(o => (o.at(-1) === id ? o : [...o.filter(x => x !== id), id]));

  const run: Run = async (action, input) => {
    const before = new Set(notes.map(n => n.id));
    const r = await runAction(state.instance, action, input);
    if (!r.ok) return r.error;
    if (action === "add") {
      // The new note is the one the server added: focus it for typing.
      const added = (r.state.data as NotesData | null)?.notes.find(n => !before.has(n.id));
      if (added) {
        setFocusId(added.id);
        toFront(added.id);
      }
    }
    if (action === "remove") {
      const removed = notes.find(n => n.id === (input as { id: string }).id) ?? null;
      setUndo(removed);
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
    }
    return null;
  };
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(errorTimer.current), []);
  const showError = (e: string | null) => {
    setError(e);
    clearTimeout(errorTimer.current);
    if (e) errorTimer.current = setTimeout(() => setError(null), UNDO_MS);
  };
  const top = async (action: string, input: unknown) => showError(await run(action, input));
  const { positions, next } = placeNotes(notes);
  const full = notes.length >= MAX_NOTES;
  /** A new note: offset from the one whose "+" was clicked, else on the next free cascade slot. */
  const addNote = (color?: NoteColor, near?: Pos) => {
    if (full) return showError(`Höchstens ${MAX_NOTES} Post-its`);
    const beside = near && { x: Math.min(0.92, near.x + 0.04), y: Math.min(0.85, near.y + 0.06) };
    const taken = [...positions.values()];
    const pos = beside && !taken.some(p => Math.abs(p.x - beside.x) < 0.02 && Math.abs(p.y - beside.y) < 0.02) ? beside : next;
    void top("add", { ...pos, ...(color ? { color } : {}) });
  };

  return (
    // The notes float above the whole dashboard (manifest.overlay): no tile.
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {notes.map(n => (
        <StickyNote
          key={n.id}
          note={n}
          place={positions.get(n.id)!}
          z={10 + Math.max(0, order.indexOf(n.id) + 1)}
          run={run}
          autoFocus={n.id === focusId}
          onFront={() => toFront(n.id)}
          onAdd={near => addNote(n.color, near)}
        />
      ))}

      <div className="pointer-events-auto absolute right-4 bottom-4 flex flex-col items-end gap-2">
        {(error || undo) && (
          <div role="status" className="hud-panel flex items-center gap-3 px-3 py-2 text-sm">
            {error ? (
              <span className="text-bad">{error}</span>
            ) : (
              <>
                <span className="text-muted">Post-it gelöscht</span>
                <button
                  type="button"
                  onClick={() => {
                    const u = undo!;
                    setUndo(null);
                    void top("add", { text: u.text, color: u.color, ...(u.x !== null && u.y !== null ? { x: u.x, y: u.y } : {}) });
                  }}
                  className="text-accent hover:text-glow"
                >
                  Rückgängig
                </button>
              </>
            )}
          </div>
        )}
        {/* Always there: the "+" on a note only shows on hover, and with no note left there is none at all. */}
        <button
          type="button"
          aria-label="Neue Notiz"
          onClick={() => addNote()}
          className="relative grid size-14 rotate-[-4deg] place-items-center bg-[#ffe27a] text-[#2b2a26] shadow-[3px_3px_0_#f5d35c,6px_6px_0_#e9c54a,0_10px_20px_rgb(0_0_0/0.5)] transition-transform hover:rotate-0"
        >
          <Plus className="size-6" />
        </button>
      </div>
    </div>
  );
}
