// FILE: snakeLogic.test.ts
// Purpose: Verify snake grid logic (move, eat/grow, wrap, self-collision).

import { describe, expect, it } from "vitest";

import { stepSnake } from "./snakeLogic";

describe("stepSnake", () => {
  it("moves the head without growing when no food is eaten", () => {
    const res = stepSnake(
      [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    );
    expect(res.cells).toEqual([
      { x: 6, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(res.ate).toBe(false);
    expect(res.alive).toBe(true);
  });

  it("grows and relocates food when eating", () => {
    const res = stepSnake(
      [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      { x: 1, y: 0 },
      { x: 6, y: 5 },
    );
    expect(res.ate).toBe(true);
    expect(res.cells).toHaveLength(3);
    expect(res.cells[0]).toEqual({ x: 6, y: 5 });
    expect(res.alive).toBe(true);
  });

  it("wraps around board edges", () => {
    const res = stepSnake([{ x: 17, y: 0 }], { x: 1, y: 0 }, { x: 0, y: 0 }, 18);
    expect(res.cells[0]).toEqual({ x: 0, y: 0 });
    expect(res.alive).toBe(true);
  });

  it("dies on self collision", () => {
    const res = stepSnake(
      [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 },
      ],
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    );
    expect(res.alive).toBe(false);
  });
});
