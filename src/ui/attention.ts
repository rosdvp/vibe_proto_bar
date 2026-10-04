import { currentQuestProgress } from "../game/quests";
import type { CellType, GameState } from "../types";
import { uiIcon } from "./icons";

export function attentionIndicator(): string {
  return `<span class="attention-indicator" aria-hidden="true">${uiIcon("attention")}</span>`;
}

function activeQuestId(state: GameState): string | undefined {
  const progress = currentQuestProgress(state);
  return progress?.complete ? undefined : progress?.quest.id;
}

export function attentionOnEmptyCell(state: GameState, vertical: boolean): boolean {
  const questId = activeQuestId(state);
  return vertical ? questId === "build-stairs" : questId === "build-counter" || questId === "build-taps";
}

export function attentionOnBuiltCell(state: GameState, type: CellType): boolean {
  const questId = activeQuestId(state);
  return (questId === "upgrade-counter" && type === "counter") || (questId === "upgrade-taps" && type === "taps");
}

export function attentionOnMenuButton(state: GameState): boolean {
  return activeQuestId(state) === "add-mash";
}

export function attentionOnMashAddButton(state: GameState): boolean {
  return activeQuestId(state) === "add-mash" && (state.drinkLevels.mash ?? 0) === 0;
}

export function attentionOnCustomersButton(state: GameState): boolean {
  return activeQuestId(state) === "sailors-rate-three";
}

export function attentionOnCustomerUpgradeButton(state: GameState, customerTypeId: string): boolean {
  return customerTypeId === "sailors" && attentionOnCustomersButton(state);
}

export function attentionOnResearchButton(state: GameState): boolean {
  return state.unseenUnlockIds.includes("other:research-screen") ||
    (state.research.active !== null && state.research.active.remaining <= 0);
}
