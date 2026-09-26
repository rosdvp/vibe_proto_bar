import { CONFIG } from "../config";
import { barRating, customerArrivalInterval, customersPerMinute, isFeatureUnlocked } from "../game";
import type { GameState } from "../types";
import { renderMap } from "./map";
import { lockIcon } from "./icons";
import { renderBuildPanel, renderFocusHud, renderPanel, renderRemoveConfirmation, renderUnlockPanel } from "./panels";
import { previewState, type UiState } from "./types";
import { renderQuestChain } from "./quests";
import { attentionIndicator, attentionOnCustomersButton, attentionOnMenuButton, attentionOnResearchButton } from "./attention";

function renderBottomNav(state: GameState, ui: UiState): string {
  if (ui.focusX !== null) return "";
  const menuUnlocked = isFeatureUnlocked(state, "menu-screen");
  const customersUnlocked = isFeatureUnlocked(state, "customers-screen");
  const researchUnlocked = isFeatureUnlocked(state, "research-screen");
  return `<nav class="bottom-nav">
    <button ${menuUnlocked ? 'data-action="toggle-panel" data-panel="menu"' : "disabled"} class="${menuUnlocked ? "menu-nav" : "locked-nav"} ${ui.panel === "menu" ? "active close-nav" : ""}" aria-label="${menuUnlocked ? "Меню" : "Меню заблокировано"}">${menuUnlocked ? `<i>${ui.panel === "menu" ? "×" : ""}</i>` : lockIcon()}${menuUnlocked && attentionOnMenuButton(state) ? attentionIndicator() : ""}</button>
    <button ${customersUnlocked ? 'data-action="toggle-panel" data-panel="customers"' : "disabled"} class="${customersUnlocked ? "customers-nav" : "locked-nav"} ${ui.panel === "customers" ? "active close-nav" : ""}" aria-label="${customersUnlocked ? "Клиенты" : "Клиенты заблокированы"}">${customersUnlocked ? `<i>${ui.panel === "customers" ? "×" : ""}</i>` : lockIcon()}${customersUnlocked && attentionOnCustomersButton(state) ? attentionIndicator() : ""}</button>
    <button ${researchUnlocked ? 'data-action="toggle-panel" data-panel="research"' : "disabled"} class="${researchUnlocked ? "research-nav" : "locked-nav"} ${ui.panel === "research" ? "active close-nav" : ""}" aria-label="${researchUnlocked ? "Исследования" : "Исследования заблокированы"}">${researchUnlocked ? `<i>${ui.panel === "research" ? "×" : ""}</i>` : lockIcon()}${researchUnlocked && attentionOnResearchButton(state) ? attentionIndicator() : ""}</button>
    <button disabled class="locked-nav" aria-label="Заблокировано">${lockIcon()}</button>
  </nav>`;
}

function renderHoldControls(state: GameState, ui: UiState): string {
  if (!isFeatureUnlocked(state, "hold") || ui.focusX !== null || ui.panel !== null || ui.buildOpen || ui.removeConfirmCellId !== null || ui.unlockQueue.length > 0) return "";
  const energyProgress = Math.max(0, Math.min(100, state.hold.energy / CONFIG.holdEnergyCapacity * 100));
  const heatProgress = Math.max(0, Math.min(100, state.hold.heat / CONFIG.holdOverheatDuration * 100));
  const energyLabel = Math.round(energyProgress);
  const disabled = state.hold.energy <= 0;
  return `<div class="hold-controls">
    ${ui.holdPressed ? `<svg class="hold-overheat ${state.hold.cooldownRemaining > 0 ? "cooldown" : ""}" viewBox="0 0 320 132" style="--heat-progress:${heatProgress}" role="progressbar" aria-label="Перегрев" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(heatProgress)}">
      <path class="hold-overheat-outline" d="M 18 116 Q 160 -18 302 116" pathLength="100"></path>
      <path class="hold-overheat-empty" d="M 18 116 Q 160 -18 302 116" pathLength="100"></path>
      <path class="hold-overheat-fill" d="M 18 116 Q 160 -18 302 116" pathLength="100"></path>
    </svg>` : ""}
    <div class="hold-energy" style="--energy-progress:${energyProgress}%" role="progressbar" aria-label="Запас ускорения" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${energyLabel}"><i></i><strong>${energyLabel}%</strong></div>
    <button data-action="hold" class="hold-button ${ui.holdPressed ? "pressed" : ""}" ${disabled ? "disabled" : ""} aria-label="Удерживать для ускорения времени в десять раз">Ускорение<strong>×10</strong></button>
  </div>`;
}

export function renderApp(root: HTMLElement, state: GameState, ui: UiState): void {
  root.style.setProperty("--attention-pulse-delay", `${-(performance.now() % 1500) / 1000}s`);
  const displayState = previewState(state, ui);
  const arrivalInterval = customerArrivalInterval(barRating(state));
  const customerRate = customersPerMinute(barRating(state));
  const arrivalProgress = Math.max(0, Math.min(1, 1 - state.customerArrivalRemaining / arrivalInterval));
  const customersPerMinuteLabel = String(Math.floor(customerRate));
  const mainScreen = ui.focusX === null && ui.panel === null && !ui.buildOpen && ui.removeConfirmCellId === null && ui.unlockQueue.length === 0;
  const scrollPositions = new Map<string, number>();
  root.querySelectorAll<HTMLElement>("[data-scroll-key]").forEach((element) => {
    const key = element.dataset.scrollKey;
    if (key) scrollPositions.set(key, element.scrollTop);
  });
  root.innerHTML = `<div class="prototype-shell">
    <section class="game-frame">
      <header class="topbar">
        <div class="resource money"><i></i><strong>${Math.floor(state.money)}</strong></div>
        <div class="resource rating"><i></i><strong>${barRating(state)}</strong></div>
        <div class="resource arrivals" style="--arrival-progress:${arrivalProgress * 100}%"><i></i><strong>${customersPerMinuteLabel}/мин</strong></div>
      </header>
      ${mainScreen ? renderQuestChain(state) : ""}
      ${renderMap(displayState, ui)}
      ${renderPanel(state, ui)}
      ${renderBuildPanel(state, ui)}
      ${renderFocusHud(displayState, ui)}
      ${renderRemoveConfirmation(state, ui)}
      ${renderUnlockPanel(ui)}
      ${renderHoldControls(state, ui)}
      ${renderBottomNav(state, ui)}
      ${isFeatureUnlocked(state, "hold") && ui.holdPressed && state.hold.cooldownRemaining <= 0 && state.hold.energy > 0 ? '<div class="hold-vignette" aria-hidden="true"></div>' : ""}
    </section>
    <aside class="service-panel">
      <button data-action="new-game">Новая игра</button>
      <button data-action="new-game-plus">Новая игра+</button>
      <button data-action="grant-money">+${CONFIG.serviceMoneyGrant} денег</button>
      <div class="speed-control">${([1, 5, 10] as const).map((speed) => `<button data-action="speed" data-speed="${speed}" class="${state.speed === speed ? "active" : ""}">×${speed}</button>`).join("")}</div>
    </aside>
  </div>`;
  root.querySelectorAll<HTMLElement>("[data-scroll-key]").forEach((element) => {
    const key = element.dataset.scrollKey;
    if (key) element.scrollTop = scrollPositions.get(key) ?? 0;
  });
}
