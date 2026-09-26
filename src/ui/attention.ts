import { currentQuestProgress } from "../game/quests";
import type { CellType, GameState } from "../types";

export function attentionIndicator(): string {
  return '<span class="attention-indicator" aria-hidden="true"></span>';
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
  return activeQuestId(state) === "add-mash" || state.unseenUnlockIds.some((id) => id.startsWith("menu-item:"));
}

export function attentionOnMashAddButton(state: GameState): boolean {
  return activeQuestId(state) === "add-mash" && !state.menu.includes("mash");
}

export function attentionOnCustomersButton(state: GameState): boolean {
  return activeQuestId(state) === "explore-customers";
}

export function attentionOnResearchButton(state: GameState): boolean {
  return state.unseenUnlockIds.includes("other:research-screen") ||
    (state.research.active !== null && state.research.active.remaining <= 0);
}
