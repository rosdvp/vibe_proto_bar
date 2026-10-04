import { CELL_DEFINITIONS, DECOR_CELL_TYPES, DECOR_STYLES } from "../config";
import type { CellType, DecorCellType, DecorId, DecorTypeState, GameState, RandomSource, UnlockFeature } from "../types";

export function isDecorCellType(type: CellType): type is DecorCellType {
  return type !== "entrance" && type !== "stairs";
}

export function createDecorState(): Record<DecorCellType, DecorTypeState> {
  const result = {} as Record<DecorCellType, DecorTypeState>;
  for (const type of DECOR_CELL_TYPES) result[type] = { unlockedIds: ["classic"], unseenIds: [], buttonUnseen: false };
  return result;
}

export function unlockRandomDecor(state: GameState, type: DecorCellType, random: RandomSource = Math.random): UnlockFeature | null {
  const decor = state.decor[type];
  const locked = DECOR_STYLES.filter((style) => !decor.unlockedIds.includes(style.id));
  if (!locked.length) return null;
  const style = locked[Math.min(locked.length - 1, Math.max(0, Math.floor(random() * locked.length)))];
  if (!style) return null;
  decor.unlockedIds.push(style.id);
  decor.unseenIds.push(style.id);
  decor.buttonUnseen = true;
  return { kind: "decor", id: style.id, cellType: type, name: `${style.name} — ${CELL_DEFINITIONS[type].name}` };
}

export function selectDecor(state: GameState, cellId: string, decorId: string): boolean {
  const cell = state.cells.find((candidate) => candidate.id === cellId);
  if (!cell || !isDecorCellType(cell.type) || !state.decor[cell.type].unlockedIds.includes(decorId as DecorId)) return false;
  cell.decorId = decorId as DecorId;
  return true;
}

export function unlockAllDecor(state: GameState): void {
  for (const type of DECOR_CELL_TYPES) {
    const decor = state.decor[type];
    const lockedIds = DECOR_STYLES.filter((style) => !decor.unlockedIds.includes(style.id)).map((style) => style.id);
    if (!lockedIds.length) continue;
    decor.unlockedIds.push(...lockedIds);
    decor.unseenIds.push(...lockedIds);
    decor.buttonUnseen = true;
  }
}

export function acknowledgeDecorButton(state: GameState, type: DecorCellType): void {
  state.decor[type].buttonUnseen = false;
}

export function acknowledgeDecorItems(state: GameState, type: DecorCellType): void {
  state.decor[type].unseenIds = [];
}

export function isDecorState(value: unknown, cells: GameState["cells"]): boolean {
  if (!value || typeof value !== "object") return false;
  const records = value as Record<string, Partial<DecorTypeState>>;
  const valid = DECOR_CELL_TYPES.every((type) => {
    const entry = records[type];
    if (!entry || !Array.isArray(entry.unlockedIds) || !Array.isArray(entry.unseenIds)) return false;
    const unlocked = entry.unlockedIds;
    return unlocked.includes("classic") && new Set(unlocked).size === unlocked.length &&
      unlocked.every((id) => DECOR_STYLES.some((style) => style.id === id)) &&
      new Set(entry.unseenIds).size === entry.unseenIds.length &&
      entry.unseenIds.every((id) => id !== "classic" && unlocked.includes(id)) &&
      typeof entry.buttonUnseen === "boolean" && (!entry.buttonUnseen || entry.unseenIds.length > 0);
  });
  return valid && cells.every((cell) => isDecorCellType(cell.type)
    ? records[cell.type]!.unlockedIds!.includes(cell.decorId ?? "classic")
    : cell.decorId === undefined || cell.decorId === "classic");
}
