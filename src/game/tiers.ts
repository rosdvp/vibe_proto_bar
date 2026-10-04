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
  if (nextLevel === 10) return TIER_RESEARCH_IDS[type][0];
  if (nextLevel === 20) return TIER_RESEARCH_IDS[type][1];
  return null;
}

export function isCellUpgradeTierUnlocked(state: GameState, type: BuildableCellType, nextLevel: number): boolean {
  const researchId = requiredTierResearchId(type, nextLevel);
  return researchId === null || state.research.completedIds.includes(researchId);
}

export function tierProgressPercent(level: number): number {
  const start = level < 10 ? 1 : level < 20 ? 10 : 20;
  const end = level < 10 ? 9 : level < 20 ? 19 : 30;
  return (level - start) / (end - start) * 100;
}
