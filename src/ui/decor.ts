import { CONFIG, DECOR_STYLES } from "../config";
import { acknowledgeDecorButton, acknowledgeDecorItems, isDecorCellType } from "../game/decor";
import type { GameState } from "../types";
import type { UiState } from "./types";
import { attentionIndicator } from "./attention";
import { decorIcon, lockIcon, uiIcon } from "./icons";

export function openDecorPanel(state: GameState, ui: UiState, cellId: string): boolean {
  const cell = state.cells.find((candidate) => candidate.id === cellId);
  if (!cell || !isDecorCellType(cell.type) || state.decor[cell.type].unlockedIds.length <= 1 ||
      ui.decorCellId !== null || ui.movePreview || ui.buildOpen || ui.unlockQueue.length > 0 ||
      cell.x !== ui.focusX || cell.y !== ui.focusY) return false;
  ui.decorCellId = cellId;
  ui.decorScrollTarget = state.decor[cell.type].unseenIds.at(-1) ?? null;
  acknowledgeDecorButton(state, cell.type);
  return true;
}

export function closeDecorPanel(state: GameState, ui: UiState): void {
  const cell = state.cells.find((candidate) => candidate.id === ui.decorCellId);
  if (cell && isDecorCellType(cell.type)) acknowledgeDecorItems(state, cell.type);
  ui.decorCellId = null;
  ui.decorScrollTarget = null;
}

export function renderDecorPanel(state: GameState, ui: UiState): string {
  const cell = state.cells.find((candidate) => candidate.id === ui.decorCellId);
  if (!cell || !isDecorCellType(cell.type)) return "";
  const decor = state.decor[cell.type];
  const unlockedStyles = DECOR_STYLES.filter((style) => decor.unlockedIds.includes(style.id));
  const lockedStyles = DECOR_STYLES.filter((style) => !decor.unlockedIds.includes(style.id));
  const styles = [...unlockedStyles, ...lockedStyles];
  return `<div class="focus-hud decor-focus"><div class="focus-cell-frame"></div>
    <section class="decor-panel" aria-label="Декор">
      <div class="panel-title"><h2>Декор</h2></div>
      <button class="square-close decor-close" data-action="close-decor" aria-label="Закрыть декор">${uiIcon("close")}</button>
      <div class="decor-list" data-scroll-key="decor-${cell.id}">${styles.map((style, index) => {
        const unlocked = decor.unlockedIds.includes(style.id);
        const current = (cell.decorId ?? "classic") === style.id;
        return `<button class="decor-option ${current ? "decor-current" : ""}" data-action="select-decor" data-decor-id="${style.id}" ${unlocked ? `aria-pressed="${current}"` : "disabled"}>
          <span class="decor-avatar">${unlocked ? decorIcon(style.id) : lockIcon()}</span>
          <strong>${unlocked ? style.name : `Откроется на ур. ${CONFIG.decorUnlockLevels[index - 1]}`}</strong>
          ${decor.unseenIds.includes(style.id) ? attentionIndicator() : ""}
        </button>`;
      }).join("")}</div>
    </section></div>`;
}

export function scrollToNewDecor(root: HTMLElement, ui: UiState): void {
  if (!ui.decorScrollTarget) return;
  const list = root.querySelector<HTMLElement>(".decor-list");
  const card = list?.querySelector<HTMLElement>(`[data-decor-id="${ui.decorScrollTarget}"]`);
  if (list && card) list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top;
  ui.decorScrollTarget = null;
}
