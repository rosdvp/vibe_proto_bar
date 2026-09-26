import { CONFIG } from "../config";
import { cellWidth, floorCells } from "../geometry";
import type { GameState } from "../types";

const WIDTH_RESEARCH_IDS = ["dig-wide", "dig-wide-ii", "dig-wide-iii"] as const;
const DEPTH_RESEARCH_IDS = ["dig-deep", "dig-deep-ii", "dig-deep-iii"] as const;

export function floorWidth(state: GameState, y: number): number {
  return floorCells(state, y).reduce((sum, cell) => sum + cellWidth(cell) * CONFIG.baseCellWidth, 0);
}

export function floorWidthLimit(state: GameState): number {
  let limit: number = CONFIG.initialFloorWidthLimit;
  WIDTH_RESEARCH_IDS.forEach((id, index) => {
    if (state.research.completedIds.includes(id)) limit = CONFIG.floorWidthResearchLimits[index]!;
  });
  return limit;
}

export function floorCountLimit(state: GameState): number {
  let limit: number = CONFIG.initialFloorCountLimit;
  DEPTH_RESEARCH_IDS.forEach((id, index) => {
    if (state.research.completedIds.includes(id)) limit = CONFIG.floorCountResearchLimits[index]!;
  });
  return limit;
}

export function nextWidthResearchId(state: GameState): string | null {
  return WIDTH_RESEARCH_IDS.find((id) => !state.research.completedIds.includes(id)) ?? null;
}

export function nextDepthResearchId(state: GameState): string | null {
  return DEPTH_RESEARCH_IDS.find((id) => !state.research.completedIds.includes(id)) ?? null;
}

export function isFloorWidthBlocked(state: GameState, y: number): boolean {
  return floorWidth(state, y) > floorWidthLimit(state);
}

export function isNewFloorBlocked(state: GameState, y: number): boolean {
  return -y >= floorCountLimit(state);
}
