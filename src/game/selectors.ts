import { CELL_DEFINITIONS, CONFIG, CUSTOMER_TYPES, DRINKS } from "../config";
import type {
  Cell,
  CellType,
  CustomerTypeDefinition,
  DrinkDefinition,
  GameState,
} from "../types";

export function getCell(state: GameState, id: string | null): Cell | undefined {
  return id ? state.cells.find((cell) => cell.id === id) : undefined;
}

function roomName(cell: Cell): string | null {
  return cell.type === "entrance" || cell.type === "stairs" ? null : CELL_DEFINITIONS[cell.type].room;
}

export function cellsInRoom(state: GameState, origin: Cell): Cell[] {
  const name = roomName(origin);
  if (!name) return [origin];
  const room: Cell[] = [];
  const visited = new Set<string>();
  const queue = [origin];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    room.push(current);
    for (const candidate of state.cells) {
      if (visited.has(candidate.id) || roomName(candidate) !== name) continue;
      if (candidate.y === current.y && Math.abs(candidate.x - current.x) === 1) queue.push(candidate);
    }
  }
  return room;
}

export function cellsShareRoom(state: GameState, first: Cell | undefined, second: Cell | undefined): boolean {
  return Boolean(first && second && cellsInRoom(state, first).some((cell) => cell.id === second.id));
}

export function equipmentIssue(state: GameState, cell: Cell): string | null {
  const room = cellsInRoom(state, cell);
  if ((cell.type === "counter" || cell.type === "waiter-station") && !room.some((item) => item.type === "taps")) {
    return "Не хватает крана";
  }
  if (cell.type === "table" && !room.some((item) => item.type === "waiter-station")) {
    return "Не хватает стойки официанта";
  }
  if ((cell.type === "sink" || cell.type === "hand-dryer") && !room.some((item) => item.type === "toilet-stall")) {
    return "Не хватает кабинки с унитазом";
  }
  return null;
}

export function getDrink(id: string): DrinkDefinition | undefined {
  return DRINKS.find((drink) => drink.id === id);
}

export function getCustomerType(id: string): CustomerTypeDefinition | undefined {
  return CUSTOMER_TYPES.find((type) => type.id === id);
}

export function levelBonusPercent(level: number, range: { min: number; max: number }): number {
  return range.min + (range.max - range.min) * ((level - 1) / (CONFIG.maxCellLevel - 1));
}

export function cellBonusPercent(level: number, type: CellType): number {
  return levelBonusPercent(level, type === "table" ? CONFIG.tableOrderPriceBonusPercentRange : CONFIG.cellBonusPercentRange);
}

export function workSpeedBonusPercent(level: number): number {
  return levelBonusPercent(level, CONFIG.workSpeedBonusPercentRange);
}

export function extraUsePrice(cell: Cell): number {
  if (cell.type !== "darts" && cell.type !== "billiards") return 0;
  return levelBonusPercent(cell.level, CONFIG.extraIncomeRanges[cell.type]);
}

export function milestoneValue(level: number, values: readonly [number, number, number, number]): number {
  if (level >= 15) return values[3];
  if (level >= 10) return values[2];
  if (level >= 5) return values[1];
  return values[0];
}

export function cellCapacity(cell: Cell): number {
  switch (cell.type) {
    case "counter":
      return CONFIG.counterCapacity;
    case "table":
      return CONFIG.tableCapacity;
    case "toilet-stall":
    case "sink":
    case "hand-dryer":
    case "darts":
      return 1;
    case "billiards":
      return 2;
    default:
      return 0;
  }
}

export function dryerCapacity(cell: Cell): number {
  return 0;
}

export function maximumOccupancy(state: GameState): number {
  return state.cells
    .filter((cell) => cell.type === "counter" || cell.type === "table")
    .reduce((total, cell) => total + cellCapacity(cell), 0);
}

export function cellsOfType(state: GameState, type: CellType): Cell[] {
  return state.cells.filter((cell) => cell.type === type);
}
