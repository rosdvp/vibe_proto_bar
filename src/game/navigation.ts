import type { Cell, GameState } from "../types";

export function findRoute(
  state: GameState,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): Cell[] {
  const start = state.cells.find((cell) => cell.x === fromX && cell.y === fromY);
  const target = state.cells.find((cell) => cell.x === targetX && cell.y === targetY);
  if (!start || !target) return [];
  const previous = new Map<string, string | null>([[start.id, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.id === target.id) {
      const route: Cell[] = [];
      let id: string | null = target.id;
      while (id) {
        const cell = state.cells.find((item) => item.id === id);
        if (!cell) break;
        route.unshift(cell);
        id = previous.get(id) ?? null;
      }
      return route;
    }
    const neighbors = state.cells.filter((cell) => {
      if (cell.y === current.y && Math.abs(cell.x - current.x) === 1) return true;
      return cell.x === current.x && Math.abs(cell.y - current.y) === 1 &&
        (current.type === "entrance" || current.type === "stairs") &&
        (cell.type === "entrance" || cell.type === "stairs");
    });
    for (const neighbor of neighbors) {
      if (previous.has(neighbor.id)) continue;
      previous.set(neighbor.id, current.id);
      queue.push(neighbor);
    }
  }
  return [];
}
