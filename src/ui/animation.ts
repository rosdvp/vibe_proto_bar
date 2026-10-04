import { CONFIG } from "../config";
import { customerArrivalInterval } from "../game/simulation";
import { RESEARCHES, researchDuration } from "../game/research";
import { currentQuestProgress } from "../game/quests";
import type { GameState } from "../types";
import type { UiState } from "./types";
import { setStyle } from "./dom";
import { updateOfferAnimation } from "./offers";

/** Continuous indicators share the same frame clock as character movement. */
export function updateUiAnimations(root: HTMLElement, state: GameState, ui: UiState): void {
  const arrival = root.querySelector<HTMLElement>(".resource.arrivals");
  const interval = customerArrivalInterval(state);
  const progress = state.customerArrivalsStarted && Number.isFinite(interval) ? Math.max(0, Math.min(1, 1 - state.customerArrivalRemaining / interval)) : 0;
  if (arrival) setStyle(arrival, "--arrival-progress", `${progress * 100}%`);
  const questBar = root.querySelector<HTMLElement>(".quest-progress");
  const quest = questBar ? currentQuestProgress(state) : null;
  if (questBar && quest) setStyle(questBar, "--quest-progress", `${quest.quest.target > 0 ? Math.min(quest.quest.target, quest.current) / quest.quest.target * 100 : 100}%`);

  const energy = Math.max(0, Math.min(100, state.hold.energy / CONFIG.holdEnergyCapacity * 100));
  const energyButton = root.querySelector<HTMLElement>(".hold-energy");
  if (energyButton) setStyle(energyButton, "--energy-progress", `${energy}%`);
  const heat = root.querySelector<SVGElement>(".hold-overheat");
  if (heat) setStyle(heat, "--heat-progress", `${Math.max(0, Math.min(100, state.hold.heat / CONFIG.holdOverheatDuration * 100))}`);
  const energyBar = root.querySelector<HTMLElement>(".energy-progress i");
  if (energyBar) setStyle(energyBar, "width", `${energy}%`);

  const researchBar = root.querySelector<HTMLElement>(".research-card.running .research-progress i");
  if (researchBar && state.research.active) {
    const research = RESEARCHES.find((item) => item.id === state.research.active?.id);
    if (research) setStyle(researchBar, "width", `${Math.max(0, Math.min(100, (1 - state.research.active.remaining / researchDuration(research)) * 100))}%`);
  }
  updateOfferAnimation(root, state, ui);
}
