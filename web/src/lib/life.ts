// Conway's Game of Life on a torus. Pure: the background canvas only draws what this computes.

/** cells[y * cols + x] = age of a live cell (1…255), 0 = dead. */
export interface Life {
  cols: number;
  rows: number;
  cells: Uint8Array<ArrayBufferLike>;
}

export function createLife(cols: number, rows: number): Life {
  return { cols, rows, cells: new Uint8Array(cols * rows) };
}

/** Fills a rectangle (wrapping at the edges) with live cells at the given density. */
export function seed(life: Life, density: number, random = Math.random, area = { x: 0, y: 0, w: life.cols, h: life.rows }) {
  const { cols, rows, cells } = life;
  for (let dy = 0; dy < area.h; dy++) {
    for (let dx = 0; dx < area.w; dx++) {
      if (random() < density) cells[((area.y + dy) % rows) * cols + ((area.x + dx) % cols)] = 1;
    }
  }
}

/** One generation (B3/S23). Survivors age, newborns start at 1. Returns the new population. */
export function step(life: Life, next: Uint8Array = new Uint8Array(life.cells.length)): { life: Life; population: number } {
  const { cols, rows, cells } = life;
  let population = 0;
  for (let y = 0; y < rows; y++) {
    const up = ((y + rows - 1) % rows) * cols;
    const row = y * cols;
    const down = ((y + 1) % rows) * cols;
    for (let x = 0; x < cols; x++) {
      const l = (x + cols - 1) % cols;
      const r = (x + 1) % cols;
      const n =
        +!!cells[up + l] + +!!cells[up + x] + +!!cells[up + r] +
        +!!cells[row + l] + +!!cells[row + r] +
        +!!cells[down + l] + +!!cells[down + x] + +!!cells[down + r];
      const age = cells[row + x]!;
      const alive = n === 3 || (n === 2 && age > 0);
      next[row + x] = alive ? Math.min(age + 1, 255) : 0;
      if (alive) population++;
    }
  }
  return { life: { cols, rows, cells: next }, population };
}
