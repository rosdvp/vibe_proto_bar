import { CONFIG } from "../config";
import { energyRecoverySeconds } from "../game/hold";
import type { GameState } from "../types";
import type { UiState } from "./types";
import { adIcon, uiIcon } from "./icons";

export function renderEnergyWindow(state: GameState, ui: UiState): string {
  if (!ui.energyOpen) return "";
  const progress = Math.max(0, Math.min(100, state.hold.energy / CONFIG.holdEnergyCapacity * 100));
  const seconds = Math.ceil(energyRecoverySeconds(state));
  const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const full = state.hold.energy >= CONFIG.holdEnergyCapacity;
  return `<div class="energy-shade" role="dialog" aria-modal="true" aria-labelledby="energy-title">
    <button class="energy-backdrop" data-action="close-energy" aria-label="Закрыть экран энергии"></button>
    <div class="energy-layout">
      <section class="energy-panel">
        <div class="panel-title energy-title"><h2 id="energy-title">Концентрация</h2></div>
        <div class="energy-progress" role="progressbar" aria-label="Энергия" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
          <i style="width:${progress}%"></i><strong>${Math.round(progress)}%</strong>
        </div>
        <p>${full ? "Энергия полностью восстановлена" : `Полное восстановление<br>через ${timer}`}</p>
      </section>
      <button class="energy-refill" data-action="refill-energy-ad" ${full ? "disabled" : ""} aria-label="Полностью восстановить энергию за рекламу">${adIcon()}Пополнить</button>
    </div>
    <button class="energy-close square-close" data-action="close-energy" aria-label="Закрыть экран энергии">${uiIcon("close")}</button>
  </div>`;
}
