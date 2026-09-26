import { CELL_DEFINITIONS, CONFIG } from "./config";
import type { Cell, GameState } from "./types";

export const SCENE_PADDING = CONFIG.baseCellWidth;

export function cellWidth(cell: Cell): number {
  return cell.type === "entrance" ? 0.8 : CELL_DEFINITIONS[cell.type].width;
}

export function floorCells(state: GameState, y: number): Cell[] {
  return state.cells.filter((cell) => cell.y === y).sort((a, b) => a.x - b.x);
}

function localCellLeft(state: GameState, x: number, y: number): number {
  let left = 0;
  for (const cell of floorCells(state, y)) {
    if (cell.x >= x) break;
    left += cellWidth(cell) * CONFIG.baseCellWidth;
  }
  return left;
}

export function floorOffsets(state: GameState): Map<number, number> {
  const floors = [...new Set(state.cells.map((cell) => cell.y))];
  const offsets = new Map<number, number>([[0, 0]]);
  while (offsets.size < floors.length) {
    let changed = false;
    for (const y of floors) {
      if (offsets.has(y)) continue;
      for (const adjacent of [y - 1, y + 1]) {
        const adjacentOffset = offsets.get(adjacent);
        if (adjacentOffset === undefined) continue;
        const connector = state.cells.find((cell) =>
          cell.y === y && (cell.type === "entrance" || cell.type === "stairs") &&
          state.cells.some((other) => other.y === adjacent && other.x === cell.x && (other.type === "entrance" || other.type === "stairs")),
        );
        if (!connector) continue;
        offsets.set(y, adjacentOffset + localCellLeft(state, connector.x, adjacent) - localCellLeft(state, connector.x, y));
        changed = true;
        break;
      }
    }
    if (!changed) {
      const unresolved = floors.find((y) => !offsets.has(y));
      if (unresolved === undefined) break;
      offsets.set(unresolved, 0);
    }
  }
  return offsets;
}

export function cellLeft(state: GameState, x: number, y: number, offsets = floorOffsets(state)): number {
  return localCellLeft(state, x, y) + (offsets.get(y) ?? 0);
}

export function cellCenter(state: GameState, cell: Cell, offsets: Map<number, number>): number {
  return cellLeft(state, cell.x, cell.y, offsets) + cellWidth(cell) * CONFIG.baseCellWidth / 2;
}

export function personPosition(state: GameState, x: number, y: number): { left: number; top: number } {
  const offsets = floorOffsets(state);
  const floorY = Math.round(y);
  const cells = floorCells(state, floorY);
  const exact = cells.find((cell) => cell.x === Math.round(x));
  let center = exact ? cellCenter(state, exact, offsets) : cellLeft(state, Math.round(x), floorY, offsets) + CONFIG.baseCellWidth / 2;
  if (!Number.isInteger(x)) {
    const from = cells.find((cell) => cell.x === Math.floor(x));
    const to = cells.find((cell) => cell.x === Math.ceil(x));
    if (from && to) center = cellCenter(state, from, offsets) + (cellCenter(state, to, offsets) - cellCenter(state, from, offsets)) * (x - Math.floor(x));
  }
  const maxY = Math.max(...state.cells.map((cell) => cell.y)) + 1;
  return { left: center - 25, top: (maxY - y) * CONFIG.cellHeight + CONFIG.customerPathTop };
}

export function pointPosition(
  state: GameState,
  x: number,
  y: number,
  localX: number,
  offsets = floorOffsets(state),
): { left: number; top: number } {
  const cell = state.cells.find((item) => item.x === x && item.y === y);
  if (!cell) return personPosition(state, x, y);
  return {
    left: cellLeft(state, x, y, offsets) + localX * cellWidth(cell) * CONFIG.baseCellWidth - 25,
    top: personPosition(state, x, y).top,
  };
}

export function movementDuration(
  state: GameState,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  fromLocalX: number,
  targetLocalX: number,
): number {
  const offsets = floorOffsets(state);
  const from = pointPosition(state, fromX, fromY, fromLocalX, offsets);
  const target = pointPosition(state, targetX, targetY, targetLocalX, offsets);
  return Math.hypot(target.left - from.left, target.top - from.top) / CONFIG.characterMoveSpeed;
}
