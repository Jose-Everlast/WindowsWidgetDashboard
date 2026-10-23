import { useEffect, useRef } from "react";
import { createLife, seed, step, type Life } from "../lib/life";

const CELL_PX = 14;
const STEP_MS = 250;
const DENSITY = 0.28;
/** No change in population for this many generations: the field has settled, so drop in fresh soup. */
const STALE_STEPS = 40;
const PATCH = 24;

/**
 * Game of Life behind the tiles: faint cyan cells, 4 generations per second. It draws on a timer, not on every
 * frame, and stops while the page is hidden, so the wallpaper stays cheap.
 */
export function GameOfLife() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    let life: Life = createLife(1, 1);
    let spare: Uint8Array<ArrayBufferLike> = new Uint8Array(1);
    let lastPopulation = -1;
    let sameFor = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(window.innerWidth * dpr);
      el.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      life = createLife(Math.ceil(window.innerWidth / CELL_PX), Math.ceil(window.innerHeight / CELL_PX));
      spare = new Uint8Array(life.cells.length);
      seed(life, DENSITY);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const { cols, rows, cells } = life;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const age = cells[y * cols + x]!;
          if (!age) continue;
          // Newborn cells glow a little brighter, old ones settle into the background.
          ctx.fillStyle = `rgb(34 211 238 / ${age < 3 ? 0.2 : age < 12 ? 0.13 : 0.08})`;
          ctx.fillRect(x * CELL_PX + 1, y * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);
        }
      }
    };

    const tick = () => {
      const old = life.cells;
      const { life: next, population } = step(life, spare);
      life = next;
      spare = old;
      sameFor = population === lastPopulation ? sameFor + 1 : 0;
      lastPopulation = population;
      if (sameFor >= STALE_STEPS || population < life.cells.length * 0.02) {
        const x = Math.floor(Math.random() * life.cols);
        const y = Math.floor(Math.random() * life.rows);
        seed(life, 0.4, Math.random, { x, y, w: PATCH, h: PATCH });
        sameFor = 0;
      }
      draw();
      schedule();
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = document.hidden ? undefined : setTimeout(tick, STEP_MS);
    };

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    };

    resize();
    schedule();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 -z-10 size-full" />;
}
