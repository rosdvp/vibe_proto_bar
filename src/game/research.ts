import { CONFIG } from "../config";
import type { GameState, UnlockFeature } from "../types";
import { unlockFeature } from "./progression";

export const RESEARCH_CATEGORIES = [
  { id: "bar", name: "Бар" },
  { id: "entertainment", name: "Развлечения" },
  { id: "restroom", name: "Туалет" },
  { id: "infrastructure", name: "Инфраструктура" },
] as const;

export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number]["id"];

export interface ResearchDefinition {
  id: string;
  name: string;
  category: ResearchCategory;
  unlocks?: UnlockFeature[];
  prerequisiteId?: string;
  visibleAfterId?: string;
  lockedUntilProgress?: boolean;
  level?: 1 | 2 | 3;
}

export const RESEARCHES: ResearchDefinition[] = [
  {
    id: "tables",
    name: "Столики",
    category: "bar",
    unlocks: [
      { kind: "cell-type", id: "table", name: "Столик" },
      { kind: "cell-type", id: "waiter-station", name: "Стойка официанта" },
    ],
  },
  { id: "tables-ii", name: "Столики II", category: "bar", prerequisiteId: "tables", visibleAfterId: "tables", unlocks: [{ kind: "other", id: "table-tier-2", name: "Тир 2 столиков" }] },
  { id: "tables-iii", name: "Столики III", category: "bar", prerequisiteId: "tables-ii", visibleAfterId: "tables-ii", unlocks: [{ kind: "other", id: "table-tier-3", name: "Тир 3 столиков" }] },
  { id: "waiters-ii", name: "Официанты II", category: "bar", prerequisiteId: "tables", visibleAfterId: "tables", unlocks: [{ kind: "other", id: "waiter-station-tier-2", name: "Тир 2 стойки официанта" }] },
  { id: "waiters-iii", name: "Официанты III", category: "bar", prerequisiteId: "waiters-ii", visibleAfterId: "waiters-ii", unlocks: [{ kind: "other", id: "waiter-station-tier-3", name: "Тир 3 стойки официанта" }] },
  { id: "taps-ii", name: "Краны II", category: "bar", prerequisiteId: "tables", visibleAfterId: "tables", unlocks: [{ kind: "other", id: "taps-tier-2", name: "Тир 2 кранов" }] },
  { id: "taps-iii", name: "Краны III", category: "bar", prerequisiteId: "taps-ii", visibleAfterId: "taps-ii", unlocks: [{ kind: "other", id: "taps-tier-3", name: "Тир 3 кранов" }] },
  { id: "counter-ii", name: "Стойка со стульями II", category: "bar", prerequisiteId: "tables", visibleAfterId: "tables", unlocks: [{ kind: "other", id: "counter-tier-2", name: "Тир 2 стойки со стульями" }] },
  { id: "counter-iii", name: "Стойка со стульями III", category: "bar", prerequisiteId: "counter-ii", visibleAfterId: "counter-ii", unlocks: [{ kind: "other", id: "counter-tier-3", name: "Тир 3 стойки со стульями" }] },
  { id: "dig-wide", name: "Копай вширь", category: "infrastructure", level: 1, unlocks: [{ kind: "other", id: "floor-width-1200", name: "Ширина этажа до 1200" }] },
  { id: "dig-wide-ii", name: "Копай вширь II", category: "infrastructure", level: 2, prerequisiteId: "dig-wide", visibleAfterId: "dig-wide", unlocks: [{ kind: "other", id: "floor-width-1400", name: "Ширина этажа до 1400" }] },
  { id: "dig-wide-iii", name: "Копай вширь III", category: "infrastructure", level: 3, prerequisiteId: "dig-wide-ii", visibleAfterId: "dig-wide-ii", unlocks: [{ kind: "other", id: "floor-width-1600", name: "Ширина этажа до 1600" }] },
  { id: "dig-deep", name: "Копай вглубь", category: "infrastructure", level: 1, unlocks: [{ kind: "other", id: "floor-count-3", name: "Третий этаж" }] },
  { id: "dig-deep-ii", name: "Копай вглубь II", category: "infrastructure", level: 2, prerequisiteId: "dig-deep", visibleAfterId: "dig-deep", unlocks: [{ kind: "other", id: "floor-count-4", name: "Четвёртый этаж" }] },
  { id: "dig-deep-iii", name: "Копай вглубь III", category: "infrastructure", level: 3, prerequisiteId: "dig-deep-ii", visibleAfterId: "dig-deep-ii", unlocks: [{ kind: "other", id: "floor-count-5", name: "Пятый этаж" }] },
  { id: "darts", name: "Дартс", category: "entertainment", lockedUntilProgress: true },
  { id: "billiards", name: "Бильярд", category: "entertainment", lockedUntilProgress: true },
  { id: "toilet-stall", name: "Кабинка с унитазом", category: "restroom", lockedUntilProgress: true },
  { id: "sink", name: "Раковина", category: "restroom", lockedUntilProgress: true },
  { id: "hand-dryer", name: "Сушилка для рук", category: "restroom", lockedUntilProgress: true },
];

export type ResearchStatus = "available" | "locked" | "running" | "ready" | "completed";

export function researchLevel(research: ResearchDefinition): 1 | 2 | 3 {
  return research.level ?? (research.id.endsWith("-iii") ? 3 : research.id.endsWith("-ii") ? 2 : 1);
}

export function researchCost(research: ResearchDefinition): number {
  return research.id === "tables" ? CONFIG.researchCost : [0, 500, 1000, 5000][researchLevel(research)]!;
}

export function researchDuration(research: ResearchDefinition): number {
  return research.id === "tables" ? CONFIG.researchDuration : [0, 120, 300, 600][researchLevel(research)]!;
}

export function researchStatus(state: GameState, research: ResearchDefinition): ResearchStatus {
  if (state.research.completedIds.includes(research.id)) return "completed";
  if (state.research.active?.id === research.id) return state.research.active.remaining <= 0 ? "ready" : "running";
  if (research.lockedUntilProgress || (research.prerequisiteId && !state.research.completedIds.includes(research.prerequisiteId))) return "locked";
  return "available";
}

export function visibleResearches(state: GameState): ResearchDefinition[] {
  return RESEARCHES.filter((research) => !research.visibleAfterId || state.research.completedIds.includes(research.visibleAfterId));
}

export function startResearch(state: GameState, id: string): boolean {
  const research = RESEARCHES.find((item) => item.id === id);
  if (!state.unlockedFeatureIds.includes("other:research-screen") || !research || !visibleResearches(state).includes(research) || state.research.active || state.money < researchCost(research) || researchStatus(state, research) !== "available") return false;
  state.money -= researchCost(research);
  state.research.active = { id, remaining: researchDuration(research) };
  return true;
}

export function advanceResearch(state: GameState, realSeconds: number): void {
  const active = state.research.active;
  if (!active || !Number.isFinite(realSeconds) || realSeconds <= 0) return;
  active.remaining = Math.max(0, active.remaining - realSeconds * state.speed);
}

export function claimResearch(state: GameState, id: string): UnlockFeature[] | null {
  const active = state.research.active;
  if (!active || active.id !== id || active.remaining > 0) return null;
  const research = RESEARCHES.find((item) => item.id === id);
  if (!research) return null;
  state.research.active = null;
  state.research.completedIds.push(id);
  return (research.unlocks ?? []).filter((feature) => unlockFeature(state, feature));
}
