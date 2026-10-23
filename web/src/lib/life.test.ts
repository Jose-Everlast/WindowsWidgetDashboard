import { describe, expect, it } from "vitest";
import { createLife, seed, step, type Life } from "./life";

const from = (rows: string[]): Life => {
  const life = createLife(rows[0]!.length, rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => c === "#" && (life.cells[y * life.cols + x] = 1)));
  return life;
};
const draw = (life: Life) =>
  Array.from({ length: life.rows }, (_, y) => [...life.cells.subarray(y * life.cols, (y + 1) * life.cols)].map(a => (a ? "#" : ".")).join(""));

describe("step", () => {
  it("lets a blinker oscillate and ages the cells that survive", () => {
    const { life, population } = step(from([".....", "..#..", "..#..", "..#..", "....."]));
    expect(draw(life)).toEqual([".....", ".....", ".###.", ".....", "....."]);
    expect(population).toBe(3);
    expect(life.cells[2 * 5 + 2]).toBe(2);
    expect(life.cells[2 * 5 + 1]).toBe(1);
  });

  it("wraps around the edges", () => {
    // A glider moves one cell diagonally every 4 generations; after 4 × 6 it is back on a 6×6 torus.
    const start = from([".#....", "..#...", "###...", "......", "......", "......"]);
    let life = start;
    for (let i = 0; i < 24; i++) life = step(life).life;
    expect(draw(life)).toEqual(draw(start));
  });

  it("lets a lonely cell die", () => {
    expect(step(from(["...", ".#.", "..."])).population).toBe(0);
  });
});

describe("seed", () => {
  it("fills only the given area, wrapping at the edges", () => {
    const life = createLife(4, 3);
    seed(life, 1, () => 0, { x: 3, y: 2, w: 2, h: 2 });
    expect(draw(life)).toEqual(["#..#", "....", "#..#"]);
  });
});
