import "./styles.css";
import {
  acknowledgeResearchScreenUnlock,
  selectDecor,
  unlockAllDecor,
  advanceHold,
  refillEnergy,
  advanceResearch,
  advanceGame,
  advanceOffers,
  claimOffer,
  offerAvailable,
  startOffer,
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
  skipResearch,
  takePaymentEvents,
  upgradeDrink,
  upgradeCustomerType,
  syncCustomerUnlocks,
  upgradeCell,
} from "./game";
import { CONFIG } from "./config";
import type { BuildableCellType, GameState } from "./types";
import { openDecorPanel, closeDecorPanel } from "./ui/decor";
import { renderApp } from "./ui/app";
import { panMapCamera, updateCharacterPositions, updateMapCamera, updatePaymentPopups } from "./ui/map";
import { createUiState, type BottomPanel } from "./ui/types";
import { offerAnimationDuration } from "./ui/offers";
import { updateUiAnimations } from "./ui/animation";

const rootElement = document.querySelector<HTMLElement>("#app");
if (!rootElement) throw new Error("App root is missing");
const root: HTMLElement = rootElement;

let state: GameState = loadGame();
const ui = createUiState();
let lastFrame = performance.now();
let lastRender = 0;
let lastSave = 0;
let drag: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
let cameraDirty = false;
let scrollDrag: { pointerId: number; startY: number; initialScrollTop: number; element: HTMLElement; moved: boolean } | null = null;
let suppressClickUntil = 0;
let pointerIsDown = false;
let touchScrollActive = false;
let holdPointerId: number | null = null;

function commit(): void {
  ui.unlockQueue.push(...syncCustomerUnlocks(state));
  saveGame(state);
  renderApp(root, state, ui);
}

root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || button.disabled) return;
  if (performance.now() < suppressClickUntil) return;
  const action = button.dataset.action;
  if (ui.energyOpen && !["close-energy", "refill-energy-ad", "new-game", "new-game-plus", "speed", "grant-money", "refill-energy", "unlock-all-decor"].includes(action ?? "")) return;
  if (ui.offerOpen && !["spin-offer", "claim-offer", "claim-offer-ad", "new-game", "new-game-plus", "speed", "grant-money", "refill-energy", "unlock-all-decor"].includes(action ?? "")) return;
  if (ui.decorCellId !== null && !["select-decor", "close-decor", "new-game", "new-game-plus", "speed", "grant-money", "refill-energy", "unlock-all-decor"].includes(action ?? "")) return;
  let researchCardTarget: string | null = null;
  if (action === "open-energy") {
    if (!isFeatureUnlocked(state, "hold")) return;
    ui.energyOpen = true;
    ui.holdPressed = false;
    holdPointerId = null;
  } else if (action === "close-energy") {
    ui.energyOpen = false;
  } else if (action === "refill-energy-ad") {
    if (!ui.energyOpen || state.hold.energy >= CONFIG.holdEnergyCapacity) return;
    refillEnergy(state);
  } else if (action === "open-offer") {
    if (!offerAvailable(state) || ui.unlockQueue.length > 0 || ui.removeConfirmCellId !== null || ui.movePreview) return;
    ui.offerOpen = true;
    ui.offerElapsed = null;
    ui.holdPressed = false;
    holdPointerId = null;
  } else if (action === "spin-offer") {
    if (!ui.offerOpen || !startOffer(state)) return;
    ui.offerElapsed = 0;
  } else if (action === "claim-offer" || action === "claim-offer-ad") {
    if (!ui.offerOpen || (ui.offerElapsed !== null && ui.offerElapsed < offerAnimationDuration)) return;
    if (!claimOffer(state, action === "claim-offer-ad")) return;
    ui.offerOpen = false;
    ui.offerElapsed = null;
  } else if (action === "focus-cell") {
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
    ui.unlockQueue.push(...upgradeCell(state, button.dataset.id ?? "").unlocks);
  } else if (action === "open-decor") {
    openDecorPanel(state, ui, button.dataset.id ?? "");
  } else if (action === "close-decor") {
    closeDecorPanel(state, ui);
  } else if (action === "select-decor" && ui.decorCellId !== null) {
    selectDecor(state, ui.decorCellId, button.dataset.decorId ?? "");
  } else if (action === "show-tier-research") {
    if (!isFeatureUnlocked(state, "research-screen")) return;
    ui.focusX = null;
    ui.focusY = null;
    ui.panel = "research";
    acknowledgeResearchScreenUnlock(state);
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
    ui.panel = ui.panel === panel ? null : panel;
    if (ui.panel === "research") acknowledgeResearchScreenUnlock(state);
    if (ui.panel === "customers") recordScreenOpen(state, "customers");
  } else if (action === "start-research") {
    startResearch(state, button.dataset.id ?? "");
  } else if (action === "skip-research-ad") {
    skipResearch(state, button.dataset.id ?? "");
  } else if (action === "claim-research") {
    const unlocks = claimResearch(state, button.dataset.id ?? "");
    if (unlocks?.length) {
      ui.panel = null;
      ui.unlockQueue.push(...unlocks);
    }
  } else if (action === "upgrade-drink") {
    upgradeDrink(state, button.dataset.id ?? "");
  } else if (action === "upgrade-customer") {
    upgradeCustomerType(state, button.dataset.id ?? "");
  } else if (action === "speed") {
    state.speed = Number(button.dataset.speed) as 1 | 5 | 10;
  } else if (action === "grant-money") {
    state.money += CONFIG.serviceMoneyGrant;
  } else if (action === "refill-energy") {
    refillEnergy(state);
  } else if (action === "new-game") {
    state = createGame();
    Object.assign(ui, createUiState());
  } else if (action === "new-game-plus") {
    state = createNewGamePlus();
    Object.assign(ui, createUiState());
  } else if (action === "claim-quest") {
    const result = claimQuestReward(state);
    ui.unlockQueue.push(...result.unlocks);
  } else if (action === "unlock-all-decor") {
    unlockAllDecor(state);
  } else if (action === "close-unlock") {
    ui.unlockQueue.shift();
  }
  commit();
  if (researchCardTarget) {
    const list = root.querySelector<HTMLElement>(".research-content");
    const card = root.querySelector<HTMLElement>(`[data-research-id="${researchCardTarget}"]`);
    if (list && card) list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
  }
});

root.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).closest(".offer-shade, .energy-shade")) {
    pointerIsDown = true;
    return;
  }
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
  const scrollable = (event.target as HTMLElement).closest<HTMLElement>(".item-list, .customer-list, .build-list, .research-content, .cell-card, .decor-list");
  if (event.pointerType === "touch" && scrollable) {
    touchScrollActive = true;
    return;
  }
  if (event.pointerType === "mouse" && event.button === 0 && scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
    scrollDrag = { pointerId: event.pointerId, startY: event.clientY, initialScrollTop: scrollable.scrollTop, element: scrollable, moved: false };
    return;
  }
  if (ui.focusX !== null || !(event.target as HTMLElement).closest("[data-map]")) return;
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
});

root.addEventListener("wheel", (event) => {
  if (ui.energyOpen || ui.offerOpen || ui.focusX !== null || ui.panel !== null || ui.buildOpen || ui.removeConfirmCellId !== null || ui.unlockQueue.length > 0 || !(event.target as HTMLElement).closest("[data-map]")) return;
  if (event.deltaY === 0) return;
  event.preventDefault();
  const zoom = Math.max(CONFIG.distantMapMinZoom, Math.min(1, ui.mapZoom - Math.sign(event.deltaY) * CONFIG.distantMapZoomStep));
  if (zoom === ui.mapZoom) return;
  ui.mapZoom = zoom;
  panMapCamera(root, state, ui, 0, 0);
  cameraDirty = true;
}, { passive: false });

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
  if (!drag.moved && Math.hypot(delta, deltaY) <= 5) return;
  if (!drag.moved) root.setPointerCapture(event.pointerId);
  drag.moved = true;
  panMapCamera(root, state, ui, delta, deltaY);
  cameraDirty = true;
  drag.startX = event.clientX;
  drag.startY = event.clientY;
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
  advanceOffers(state, realElapsed);
  if (ui.offerOpen && ui.offerElapsed !== null) ui.offerElapsed = Math.min(offerAnimationDuration, ui.offerElapsed + realElapsed);
  const holdVisible = !ui.energyOpen && !ui.offerOpen && isFeatureUnlocked(state, "hold") && ui.focusX === null && ui.panel === null && !ui.buildOpen && ui.removeConfirmCellId === null && ui.unlockQueue.length === 0;
  if (ui.holdPressed && !holdVisible) ui.holdPressed = false;
  const holdResult = advanceHold(state, elapsed, ui.holdPressed && holdVisible);
  if (holdResult.depleted) ui.holdPressed = false;
  if (!ui.movePreview) {
    const extraRealSeconds = holdResult.boostedSeconds * (CONFIG.holdTimeMultiplier - 1) / state.speed;
    advanceGame(state, elapsed + extraRealSeconds);
  }
  const previousPaymentCount = ui.paymentPopups.length;
  for (const popup of ui.paymentPopups) popup.elapsed += elapsed;
  ui.paymentPopups = ui.paymentPopups.filter((popup) => popup.elapsed < CONFIG.paymentPopupDuration);
  const newPayments = takePaymentEvents(state);
  ui.paymentPopups.push(...newPayments.map((event) => ({ ...event, elapsed: 0 })));
  const renderInterval = 100;
  if (cameraDirty) {
    updateMapCamera(root, state, ui);
    cameraDirty = false;
  }
  if (!drag?.moved && !scrollDrag && !touchScrollActive && ((now - lastRender >= renderInterval && !pointerIsDown) || newPayments.length > 0 || ui.paymentPopups.length !== previousPaymentCount)) {
    renderApp(root, state, ui);
    lastRender = now;
  }
  updateCharacterPositions(root, state);
  updatePaymentPopups(root, state, ui);
  updateUiAnimations(root, state, ui);
  if (now - lastSave >= 1000) {
    saveGame(state);
    lastSave = now;
  }
  requestAnimationFrame(frame);
}

renderApp(root, state, ui);
document.addEventListener("visibilitychange", () => { lastFrame = performance.now(); });
requestAnimationFrame(frame);
