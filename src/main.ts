import "./styles.css";
import {
  acknowledgeMenuUnlocks,
  acknowledgeResearchScreenUnlock,
  advanceHold,
  advanceResearch,
  advanceGame,
  buildCell,
  claimQuestReward,
  claimResearch,
  createGame,
  createNewGamePlus,
  loadGame,
  isFeatureUnlocked,
  removeCell,
  recordScreenOpen,
  reorderFloorCells,
  saveGame,
  startResearch,
  takePaymentEvents,
  toggleMenuItem,
  upgradeCell,
} from "./game";
import { CONFIG } from "./config";
import type { BuildableCellType, DrinkCategory, GameState } from "./types";
import { renderApp } from "./ui/app";
import { updateCharacterPositions, updatePaymentPopups } from "./ui/map";
import { createUiState, type BottomPanel } from "./ui/types";
import type { ResearchCategory } from "./game/research";

const rootElement = document.querySelector<HTMLElement>("#app");
if (!rootElement) throw new Error("App root is missing");
const root: HTMLElement = rootElement;

let state: GameState = loadGame();
const ui = createUiState();
let lastFrame = performance.now();
let lastRender = 0;
let lastSave = 0;
let drag: { pointerId: number; startX: number; startY: number; initialPanX: number; initialPanY: number; moved: boolean } | null = null;
let scrollDrag: { pointerId: number; startY: number; initialScrollTop: number; element: HTMLElement; moved: boolean } | null = null;
let suppressClickUntil = 0;
let pointerIsDown = false;
let touchScrollActive = false;
let holdPointerId: number | null = null;

function commit(): void {
  saveGame(state);
  renderApp(root, state, ui);
}

root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || button.disabled) return;
  if (performance.now() < suppressClickUntil) return;
  const action = button.dataset.action;
  let researchScrollTarget: ResearchCategory | null = null;
  let researchCardTarget: string | null = null;
  if (action === "focus-cell") {
    if (ui.movePreview) return;
    ui.focusX = Number(button.dataset.x);
    ui.focusY = Number(button.dataset.y);
    ui.panel = null;
  } else if (action === "close-focus") {
    ui.focusX = null;
    ui.focusY = null;
    ui.buildOpen = false;
  } else if (action === "focus-step") {
    ui.focusX = (ui.focusX ?? 0) + Number(button.dataset.dx);
    ui.focusY = (ui.focusY ?? 0) + Number(button.dataset.dy);
    ui.buildOpen = false;
  } else if (action === "open-build") {
    ui.buildOpen = true;
    ui.selectedBuild = null;
  } else if (action === "close-build") {
    ui.buildOpen = false;
    ui.selectedBuild = null;
  } else if (action === "select-build") {
    ui.selectedBuild = button.dataset.type as BuildableCellType;
  } else if (action === "build-stairs" && ui.focusX !== null && ui.focusY !== null) {
    buildCell(state, ui.focusX, "stairs", ui.focusY);
  } else if (action === "confirm-build" && ui.focusX !== null && ui.focusY !== null && ui.selectedBuild) {
    if (buildCell(state, ui.focusX, ui.selectedBuild, ui.focusY)) {
      ui.buildOpen = false;
      ui.selectedBuild = null;
    }
  } else if (action === "upgrade") {
    upgradeCell(state, button.dataset.id ?? "");
  } else if (action === "show-tier-research") {
    if (!isFeatureUnlocked(state, "research-screen")) return;
    ui.focusX = null;
    ui.focusY = null;
    ui.panel = "research";
    acknowledgeResearchScreenUnlock(state);
    ui.researchCategory = button.dataset.researchId?.startsWith("dig-") ? "infrastructure" : "bar";
    researchCardTarget = button.dataset.researchId ?? null;
  } else if (action === "open-move-preview") {
    const cell = state.cells.find((candidate) => candidate.id === button.dataset.id);
    if (cell && cell.type !== "entrance" && cell.type !== "stairs") {
      ui.movePreview = {
        cellId: cell.id,
        floorY: cell.y,
        cellOrder: state.cells.filter((candidate) => candidate.y === cell.y).sort((a, b) => a.x - b.x).map((candidate) => candidate.id),
      };
      ui.focusX = cell.x;
      ui.focusY = cell.y;
    }
  } else if (action === "move-preview-step" && ui.movePreview) {
    const index = ui.movePreview.cellOrder.indexOf(ui.movePreview.cellId);
    const nextIndex = index + Number(button.dataset.dx);
    const neighbor = state.cells.find((candidate) => candidate.id === ui.movePreview?.cellOrder[nextIndex]);
    if (index >= 0 && nextIndex >= 0 && nextIndex < ui.movePreview.cellOrder.length && neighbor?.type !== "entrance" && neighbor?.type !== "stairs") {
      [ui.movePreview.cellOrder[index], ui.movePreview.cellOrder[nextIndex]] = [ui.movePreview.cellOrder[nextIndex]!, ui.movePreview.cellOrder[index]!];
      ui.focusX = nextIndex;
    }
  } else if (action === "confirm-move-preview" && ui.movePreview) {
    const { cellId, floorY, cellOrder } = ui.movePreview;
    reorderFloorCells(state, floorY, cellOrder);
    const cell = state.cells.find((candidate) => candidate.id === cellId);
    ui.movePreview = null;
    ui.focusX = cell?.x ?? null;
    ui.focusY = cell?.y ?? null;
  } else if (action === "cancel-move-preview" && ui.movePreview) {
    const cell = state.cells.find((candidate) => candidate.id === ui.movePreview?.cellId);
    ui.movePreview = null;
    ui.focusX = cell?.x ?? null;
    ui.focusY = cell?.y ?? null;
  } else if (action === "open-remove-confirm") {
    ui.removeConfirmCellId = button.dataset.id ?? null;
  } else if (action === "close-remove-confirm") {
    ui.removeConfirmCellId = null;
  } else if (action === "confirm-remove" && ui.removeConfirmCellId) {
    removeCell(state, ui.removeConfirmCellId);
    ui.removeConfirmCellId = null;
  } else if (action === "toggle-panel") {
    const panel = button.dataset.panel as Exclude<BottomPanel, null>;
    if (panel === "menu" && !isFeatureUnlocked(state, "menu-screen")) return;
    if (panel === "customers" && !isFeatureUnlocked(state, "customers-screen")) return;
    if (panel === "research" && !isFeatureUnlocked(state, "research-screen")) return;
    const wasMenuOpen = ui.panel === "menu";
    ui.panel = ui.panel === panel ? null : panel;
    if (wasMenuOpen && ui.panel !== "menu") acknowledgeMenuUnlocks(state);
    if (ui.panel === "research") acknowledgeResearchScreenUnlock(state);
    if (ui.panel === "customers") recordScreenOpen(state, "customers");
  } else if (action === "menu-category") {
    ui.menuCategory = button.dataset.category as DrinkCategory;
  } else if (action === "research-category") {
    ui.researchCategory = button.dataset.category as ResearchCategory;
    researchScrollTarget = ui.researchCategory;
  } else if (action === "start-research") {
    startResearch(state, button.dataset.id ?? "");
  } else if (action === "claim-research") {
    const unlocks = claimResearch(state, button.dataset.id ?? "");
    if (unlocks?.length) {
      ui.panel = null;
      ui.unlockQueue.push(...unlocks);
    }
  } else if (action === "toggle-drink") {
    toggleMenuItem(state, button.dataset.id ?? "");
  } else if (action === "speed") {
    state.speed = Number(button.dataset.speed) as 1 | 5 | 10;
  } else if (action === "grant-money") {
    state.money += CONFIG.serviceMoneyGrant;
  } else if (action === "new-game") {
    state = createGame();
    Object.assign(ui, createUiState());
  } else if (action === "new-game-plus") {
    state = createNewGamePlus();
    Object.assign(ui, createUiState());
  } else if (action === "claim-quest") {
    const result = claimQuestReward(state);
    ui.unlockQueue.push(...result.unlocks);
  } else if (action === "close-unlock") {
    ui.unlockQueue.shift();
  }
  commit();
  if (researchScrollTarget) {
    const list = root.querySelector<HTMLElement>(".research-content");
    const section = root.querySelector<HTMLElement>(`[data-research-section="${researchScrollTarget}"]`);
    if (list && section) list.scrollTop += section.getBoundingClientRect().top - list.getBoundingClientRect().top;
  }
  if (researchCardTarget) {
    const list = root.querySelector<HTMLElement>(".research-content");
    const card = root.querySelector<HTMLElement>(`[data-research-id="${researchCardTarget}"]`);
    if (list && card) list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
  }
});

root.addEventListener("pointerdown", (event) => {
  const holdButton = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="hold"]');
  if (holdButton && !holdButton.disabled && holdPointerId === null) {
    event.preventDefault();
    holdPointerId = event.pointerId;
    ui.holdPressed = true;
    root.setPointerCapture(event.pointerId);
    renderApp(root, state, ui);
    return;
  }
  pointerIsDown = true;
  const scrollable = (event.target as HTMLElement).closest<HTMLElement>(".item-list, .customer-list, .build-list, .research-content, .cell-card");
  if (event.pointerType === "touch" && scrollable) {
    touchScrollActive = true;
    return;
  }
  if (event.pointerType === "mouse" && event.button === 0 && scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
    scrollDrag = { pointerId: event.pointerId, startY: event.clientY, initialScrollTop: scrollable.scrollTop, element: scrollable, moved: false };
    return;
  }
  if (ui.focusX !== null || !(event.target as HTMLElement).closest("[data-map]")) return;
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, initialPanX: ui.panX, initialPanY: ui.panY, moved: false };
});

root.addEventListener("pointermove", (event) => {
  if (scrollDrag?.pointerId === event.pointerId) {
    const deltaY = event.clientY - scrollDrag.startY;
    if (!scrollDrag.moved && Math.abs(deltaY) <= 5) return;
    if (!scrollDrag.moved) root.setPointerCapture(event.pointerId);
    scrollDrag.moved = true;
    scrollDrag.element.scrollTop = scrollDrag.initialScrollTop - deltaY;
    event.preventDefault();
    return;
  }
  if (!drag || drag.pointerId !== event.pointerId) return;
  const delta = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  if (Math.hypot(delta, deltaY) <= 5) return;
  if (!drag.moved) root.setPointerCapture(event.pointerId);
  drag.moved = true;
  ui.panX = drag.initialPanX + delta;
  ui.panY = drag.initialPanY + deltaY;
  renderApp(root, state, ui);
});

root.addEventListener("pointerup", (event) => {
  if (holdPointerId === event.pointerId) {
    holdPointerId = null;
    ui.holdPressed = false;
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    renderApp(root, state, ui);
    return;
  }
  setTimeout(() => { pointerIsDown = false; }, 0);
  if (scrollDrag?.pointerId === event.pointerId) {
    if (scrollDrag.moved) suppressClickUntil = performance.now() + 200;
    scrollDrag = null;
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    return;
  }
  if (drag && drag.pointerId === event.pointerId) {
    const wasMoved = drag.moved;
    drag = null;
    if (wasMoved) suppressClickUntil = performance.now() + 200;
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    if (wasMoved) setTimeout(() => renderApp(root, state, ui), 0);
  }
});

root.addEventListener("pointercancel", (event) => {
  if (holdPointerId === event.pointerId) {
    holdPointerId = null;
    ui.holdPressed = false;
    renderApp(root, state, ui);
  }
  if (!touchScrollActive) pointerIsDown = false;
  scrollDrag = null;
  drag = null;
});

for (const eventName of ["touchend", "touchcancel"]) {
  root.addEventListener(eventName, () => {
    touchScrollActive = false;
    pointerIsDown = false;
  });
}

function frame(now: number): void {
  const realElapsed = document.hidden ? 0 : Math.max(0, (now - lastFrame) / 1000);
  const elapsed = Math.min(0.25, realElapsed);
  lastFrame = now;
  advanceResearch(state, realElapsed);
  const holdVisible = isFeatureUnlocked(state, "hold") && ui.focusX === null && ui.panel === null && !ui.buildOpen && ui.removeConfirmCellId === null && ui.unlockQueue.length === 0;
  if (ui.holdPressed && !holdVisible) ui.holdPressed = false;
  const holdResult = advanceHold(state, elapsed, ui.holdPressed && holdVisible);
  if (holdResult.depleted) ui.holdPressed = false;
  if (!ui.movePreview) {
    const extraRealSeconds = holdResult.boostedSeconds * (CONFIG.holdTimeMultiplier - 1) / state.speed;
    advanceGame(state, elapsed + extraRealSeconds);
  }
  const previousPaymentCount = ui.paymentPopups.length;
  ui.paymentPopups = ui.paymentPopups
    .map((popup) => ({ ...popup, elapsed: popup.elapsed + elapsed }))
    .filter((popup) => popup.elapsed < CONFIG.paymentPopupDuration);
  const newPayments = takePaymentEvents(state);
  ui.paymentPopups.push(...newPayments.map((event) => ({ ...event, elapsed: 0 })));
  const renderInterval = ui.holdPressed ? 1000 / 30 : 100;
  if (!scrollDrag && !touchScrollActive && ((now - lastRender >= renderInterval && !pointerIsDown) || newPayments.length > 0 || ui.paymentPopups.length !== previousPaymentCount)) {
    renderApp(root, state, ui);
    lastRender = now;
  }
  updateCharacterPositions(root, state);
  updatePaymentPopups(root, ui);
  if (now - lastSave >= 1000) {
    saveGame(state);
    lastSave = now;
  }
  requestAnimationFrame(frame);
}

renderApp(root, state, ui);
document.addEventListener("visibilitychange", () => { lastFrame = performance.now(); });
requestAnimationFrame(frame);
