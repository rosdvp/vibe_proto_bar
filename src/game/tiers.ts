import { CONFIG } from "../config";
import type { BuildableCellType, GameState } from "../types";

const TIER_RESEARCH_IDS: Record<Exclude<BuildableCellType, "stairs">, readonly [string, string]> = {
  table: ["tables-ii", "tables-iii"],
  "waiter-station": ["waiters-ii", "waiters-iii"],
  taps: ["taps-ii", "taps-iii"],
  counter: ["counter-ii", "counter-iii"],
  darts: ["darts-ii", "darts-iii"],
  billiards: ["billiards-ii", "billiards-iii"],
  "toilet-stall": ["toilet-stall-ii", "toilet-stall-iii"],
  sink: ["sink-ii", "sink-iii"],
  "hand-dryer": ["hand-dryer-ii", "hand-dryer-iii"],
};

export function requiredTierResearchId(type: BuildableCellType, nextLevel: number): string | null {
  if (type === "stairs") return null;
  if (nextLevel === CONFIG.cellResearchLevelLimits[0] + 1) return TIER_RESEARCH_IDS[type][0];
  if (nextLevel === CONFIG.cellResearchLevelLimits[1] + 1) return TIER_RESEARCH_IDS[type][1];
  return null;
}

export function isCellUpgradeTierUnlocked(state: GameState, type: BuildableCellType, nextLevel: number): boolean {
  const researchId = type === "stairs" ? null : nextLevel > CONFIG.cellResearchLevelLimits[1]
    ? TIER_RESEARCH_IDS[type][1]
    : nextLevel > CONFIG.cellResearchLevelLimits[0] ? TIER_RESEARCH_IDS[type][0] : null;
  return researchId === null || state.research.completedIds.includes(researchId);
}

export function tierProgressPercent(level: number): number {
  const index = cellTierIndex(level);
  const start = CONFIG.cellTierStartLevels[index];
  const end = index === 2 ? CONFIG.maxCellLevel : CONFIG.cellTierStartLevels[index + 1]! - 1;
  return (level - start) / (end - start) * 100;
}

export function cellTierIndex(level: number): 0 | 1 | 2 {
  return level < CONFIG.cellTierStartLevels[1] ? 0 : level < CONFIG.cellTierStartLevels[2] ? 1 : 2;
}
