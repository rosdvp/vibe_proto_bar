import { CUSTOMER_TYPES, QUESTS } from "../config";
import type { GameState, QuestDefinition, UnlockFeature } from "../types";
import { isCustomerTypeUnlocked, unlockFeature } from "./progression";
import { barRating } from "./selectors";

export interface QuestProgress {
  quest: QuestDefinition;
  current: number;
  complete: boolean;
}

export function activeQuest(state: GameState): QuestDefinition | null {
  return QUESTS[state.quests.currentIndex] ?? null;
}

export function currentQuestProgress(state: GameState): QuestProgress | null {
  const quest = activeQuest(state);
  if (!quest) return null;
  const condition = quest.condition;
  let current = 0;
  if (condition.kind === "cell-count") {
    current = state.cells.filter((cell) => cell.type === condition.cellType && (condition.floor === undefined || cell.y === condition.floor)).length;
  } else if (condition.kind === "cell-level") {
    current = Math.max(0, ...state.cells.filter((cell) => cell.type === condition.cellType).map((cell) => cell.level));
  } else if (condition.kind === "menu-item") {
    current = state.menu.includes(condition.drinkId) ? 1 : 0;
  } else if (condition.kind === "bar-rating") {
    current = barRating(state);
  } else if (condition.kind === "customer-unlocked") {
    const customerType = CUSTOMER_TYPES.find((type) => type.id === condition.customerTypeId);
    current = customerType && isCustomerTypeUnlocked(state, customerType) ? 1 : 0;
  } else if (condition.kind === "research-completed") {
    current = state.research.completedIds.includes(condition.researchId) ? 1 : 0;
  } else {
    current = state.quests.incrementalProgress;
  }
  current = Math.min(quest.target, Math.max(0, current));
  return { quest, current, complete: current + 1e-9 >= quest.target };
}

export function recordCustomerPayment(state: GameState, customerTypeId: string, drinkId = "", amount = 0): void {
  const quest = activeQuest(state);
  if (!quest) return;
  const condition = quest.condition;
  if (condition.kind === "served" && (!condition.customerTypeId || condition.customerTypeId === customerTypeId)) {
    state.quests.incrementalProgress = Math.min(quest.target, state.quests.incrementalProgress + 1);
  } else if (condition.kind === "drink-sales" && condition.drinkId === drinkId) {
    state.quests.incrementalProgress = Math.min(quest.target, state.quests.incrementalProgress + 1);
  } else if (condition.kind === "earned-money" && amount > 0) {
    state.quests.incrementalProgress = Math.min(quest.target, state.quests.incrementalProgress + amount);
  }
}

export function recordActivityIncome(state: GameState, amount: number): void {
  const quest = activeQuest(state);
  if (quest?.condition.kind === "earned-money") {
    state.quests.incrementalProgress = Math.min(quest.target, state.quests.incrementalProgress + amount);
  }
}

export function recordScreenOpen(state: GameState, screenId: "customers"): void {
  const quest = activeQuest(state);
  if (quest?.condition.kind === "screen-open" && quest.condition.screenId === screenId) {
    state.quests.incrementalProgress = quest.target;
  }
}

export function recordHoldSeconds(state: GameState, seconds: number): void {
  const quest = activeQuest(state);
  if (quest?.condition.kind !== "hold-seconds" || seconds <= 0) return;
  state.quests.incrementalProgress = Math.min(quest.target, state.quests.incrementalProgress + seconds);
}

export function claimQuestReward(state: GameState): { claimed: boolean; unlocks: UnlockFeature[] } {
  const progress = currentQuestProgress(state);
  if (!progress?.complete) return { claimed: false, unlocks: [] };
  state.money += progress.quest.reward;
  const unlocks = (progress.quest.unlocks ?? []).filter((feature) => unlockFeature(state, feature));
  state.quests.currentIndex += 1;
  state.quests.incrementalProgress = 0;
  return { claimed: true, unlocks };
}

export function isFeatureUnlocked(state: GameState, id: string): boolean {
  return state.unlockedFeatureIds.includes(`other:${id}`);
}
