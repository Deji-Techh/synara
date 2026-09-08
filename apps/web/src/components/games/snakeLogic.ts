// FILE: snakeLogic.ts
// Purpose: Pure Snake grid logic (testable, no React).
// Layer: UI game logic

export interface SnakePoint {
  x: number;
  y: number;
}

export interface SnakeStepResult {
  cells: SnakePoint[];
  food: SnakePoint;
  alive: boolean;
  ate: boolean;
}

export const SNAKE_SIZE = 18;

export function randomFood(cells: SnakePoint[], size = SNAKE_SIZE): SnakePoint {
  const taken = new Set(cells.map((c) => c.y * size + c.x));
  const free: number[] = [];
  for (let i = 0; i < size * size; i++) if (!taken.has(i)) free.push(i);
  const pick = free[Math.floor(Math.random() * free.length)] ?? 0;
  return { x: pick % size, y: Math.floor(pick / size) };
}

export function stepSnake(
  cells: SnakePoint[],
  dir: SnakePoint,
  food: SnakePoint,
  size = SNAKE_SIZE,
): SnakeStepResult {
  const head = cells[0] ?? { x: 8, y: 8 };
  const next = { x: (head.x + dir.x + size) % size, y: (head.y + dir.y + size) % size };
  const ate = next.x === food.x && next.y === food.y;
  const body = ate ? cells : cells.slice(0, -1);
  const alive = !body.some((c) => c.x === next.x && c.y === next.y);
  const nextCells = alive ? [next, ...body] : cells;
  return { cells: nextCells, food: ate ? randomFood(nextCells, size) : food, alive, ate };
}
