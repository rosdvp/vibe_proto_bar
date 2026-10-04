import { CELL_DEFINITIONS, CONFIG } from "../config";
import { cellCenter, cellLeft, cellWidth, floorCells, floorOffsets, personPosition, pointPosition, SCENE_PADDING } from "../geometry";
import { equipmentIssue } from "../game/selectors";
import { extraDuration } from "../game/simulation";
import type { Bartender, Cell, Customer, GameState, Waiter } from "../types";
import type { UiState } from "./types";
import { attentionIndicator, attentionOnBuiltCell, attentionOnEmptyCell } from "./attention";
import { isFloorWidthBlocked, isNewFloorBlocked, nextDepthResearchId, nextWidthResearchId } from "../game/infrastructure";
import { lockIcon, resourceIcon, uiIcon } from "./icons";
import { formatOrderPrice } from "./format";
import { isCellTypeUnlocked, upgradeCostForLevel } from "../game/progression";
import { isCellUpgradeTierUnlocked } from "../game/tiers";
import { renderMapEnvironment } from "./map-art";
import { renderFixture } from "./map-fixtures";
import { patchHtml, setStyle } from "./dom";
import { frameInnerWidth } from "./map-camera";
export { constrainMapCamera, panMapCamera, updateMapCamera } from "./map-camera";
import { BARTENDER_ART, CUSTOMER_ART, MAP_ASSETS, SAILOR_ART, WAITER_ART } from "./map-assets";

const BASE_CELL_WIDTH = CONFIG.baseCellWidth;
const CELL_HEIGHT = CONFIG.cellHeight;

function renderCell(state: GameState, ui: UiState, cell: Cell): string {
  const issue = equipmentIssue(state, cell);
  const focused = ui.focusX === cell.x && ui.focusY === cell.y;
  const brick = CONFIG.mapArt.brickWall;
  const concrete = CONFIG.mapArt.cellSurfaces;
  const sharedStyle = `;--cell-ceiling-height:${concrete.ceilingHeight}px;--cell-floor-height:${concrete.floorHeight}px`;
  const artStyle = `${sharedStyle};--brick-wall-image:url('${MAP_ASSETS.shared.brick}');--brick-wall-width:${brick.tileWidth}px;--brick-wall-height:${brick.tileHeight}px`;
  const concreteSurfaces = `<img class="cell-concrete cell-concrete-ceiling" src="${MAP_ASSETS.shared.ceiling}" alt="" draggable="false"><img class="cell-concrete cell-concrete-floor" src="${MAP_ASSETS.shared.floor}" alt="" draggable="false">`;
  return `<button class="map-cell built type-${cell.type} ${focused ? "attention-focused" : ""}" style="--cell-span:${cellWidth(cell)};--cell-art-x:${-cellLeft(state, cell.x, cell.y)}px${artStyle}" data-cell-id="${cell.id}" data-action="focus-cell" data-x="${cell.x}" data-y="${cell.y}" aria-label="Ячейка ${cell.x}, ${cell.y}">
    ${renderFixture(state, cell)}${concreteSurfaces}${issue ? `<span class="equipment-warning" aria-label="${issue}">${uiIcon("warning")}</span>` : ""}${attentionOnBuiltCell(state, cell.type) ? attentionIndicator() : ""}
  </button>`;
}

function renderCandidate(state: GameState, x: number, y: number, vertical = false): string {
  const cellSpan = vertical ? CELL_DEFINITIONS.stairs.width : 1;
  const locked = vertical ? !isCellTypeUnlocked(state, "stairs") || isNewFloorBlocked(state, y) : isFloorWidthBlocked(state, y);
  const researchId = vertical ? nextDepthResearchId(state) : nextWidthResearchId(state);
  if (locked && !researchId) return "";
  return `<button class="map-cell empty candidate ${locked ? "research-locked" : ""}" style="--cell-span:${cellSpan}" data-action="focus-cell" data-x="${x}" data-y="${y}" data-vertical="${vertical}" aria-label="${locked ? "Заблокированная" : "Пустая"} ячейка ${x}, ${y}">
    <span class="build-plus"><span class="plus-mark">${locked ? lockIcon() : `${uiIcon("build-plus")}${attentionOnEmptyCell(state, vertical) ? attentionIndicator() : ""}`}</span></span>
  </button>`;
}

function renderFloors(state: GameState, ui: UiState): { html: string; minLeft: number; maxRight: number; maxY: number } {
  const ys = state.cells.map((cell) => cell.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sceneMaxY = maxY + 1;
  const offsets = floorOffsets(state);
  let minLeft: number = 0;
  let maxRight: number = BASE_CELL_WIDTH;
  const rows: string[] = [];
  for (let y = maxY; y >= minY; y -= 1) {
    const cells = floorCells(state, y);
    if (cells.length === 0) continue;
    const maxX = cells.at(-1)?.x ?? 0;
    const body = [...cells.map((cell) => renderCell(state, ui, cell)), renderCandidate(state, maxX + 1, y)];
    const builtWidth = cells.reduce((sum, cell) => sum + cellWidth(cell), 0) * BASE_CELL_WIDTH;
    const wallWidth = CONFIG.mapArt.cellSurfaces.floorHeight;
    const width = builtWidth + wallWidth + (body.at(-1) ? BASE_CELL_WIDTH : 0);
    const left = offsets.get(y) ?? 0;
    minLeft = Math.min(minLeft, left - wallWidth);
    maxRight = Math.max(maxRight, left + width);
    const walls = `<img class="bar-concrete-wall bar-concrete-wall-left" src="${MAP_ASSETS.shared.wall}" alt="" draggable="false"><img class="bar-concrete-wall bar-concrete-wall-right" src="${MAP_ASSETS.shared.wall}" alt="" draggable="false">`;
    rows.push(`<div class="cells-row" data-render-key="floor-${y}" style="--floor-index:${sceneMaxY - y};--bar-wall-width:${wallWidth}px;--floor-built-width:${builtWidth}px;left:${left}px">${body.join("")}${walls}</div>`);
  }
  for (const cell of state.cells.filter((item) => item.type === "entrance" || item.type === "stairs")) {
    const y = cell.y - 1;
    if (y < -4) continue;
    if (state.cells.some((item) => item.x === 0 && item.y === y)) continue;
    const top = (sceneMaxY - y) * CELL_HEIGHT + 25;
    rows.push(`<div class="vertical-candidate" data-render-key="vertical-${y}" style="left:${cellLeft(state, 0, cell.y, offsets)}px;top:${top}px">${renderCandidate(state, 0, y, true)}</div>`);
  }
  return { html: rows.join(""), minLeft, maxRight, maxY };
}

function movingPersonPosition(
  state: GameState,
  person: {
    moveFromX: number;
    moveFromY: number;
    moveTargetX: number;
    moveTargetY: number;
    moveFromLocalX?: number;
    moveTargetLocalX?: number;
    moveDuration: number;
    phaseRemaining: number;
  },
  offsets: Map<number, number>,
): { left: number; top: number } {
  const progress = person.moveDuration <= 0 ? 1 : Math.max(0, Math.min(1, 1 - person.phaseRemaining / person.moveDuration));
  const from = pointPosition(state, person.moveFromX, person.moveFromY, person.moveFromLocalX ?? .5, offsets);
  const target = pointPosition(state, person.moveTargetX, person.moveTargetY, person.moveTargetLocalX ?? .5, offsets);
  return {
    left: from.left + (target.left - from.left) * progress,
    top: from.top + (target.top - from.top) * progress,
  };
}

function renderCharacterArt(parts: typeof SAILOR_ART.side): string {
  return parts.map(({ name, src, anchor, layer }) => `<img data-render-key="${name}" class="character-part character-${name}" src="${src}" style="left:${anchor.x}px;top:${anchor.y}px;z-index:${layer}" alt="" draggable="false">`).join("");
}

function characterFacing(state: GameState, person: Customer | Bartender | Waiter, offsets: Map<number, number>): number {
  if (person.phase === "pouring" && "homeTapCellId" in person) {
    const tap = state.cells.find((cell) => cell.id === (person.tapCellId ?? person.homeTapCellId));
    if (tap) {
      const position = pointPosition(state, person.x, person.y, person.localX ?? .5, offsets);
      const barrel = pointPosition(state, tap.x, tap.y, CONFIG.mapArt.tapBarrelLocalX, offsets);
      return barrel.left < position.left ? -1 : 1;
    }
  }
  if (person.phase.startsWith("moving-") || person.phase === "exiting" || person.phase === "returning" || person.phase === "delivering" || person.phase === "returning-station") {
    const from = pointPosition(state, person.moveFromX, person.moveFromY, person.moveFromLocalX ?? .5, offsets);
    const target = pointPosition(state, person.moveTargetX, person.moveTargetY, person.moveTargetLocalX ?? .5, offsets);
    return target.left < from.left ? -1 : 1;
  }
  return "waitingDirection" in person && person.phase.startsWith("waiting-") ? person.waitingDirection ?? 1 : 1;
}

function renderDrink(orderId: string | undefined, classes = ""): string {
  const src = orderId && Object.prototype.hasOwnProperty.call(MAP_ASSETS.drinks, orderId)
    ? MAP_ASSETS.drinks[orderId as keyof typeof MAP_ASSETS.drinks] : undefined;
  return `<span class="drink-mug ${classes}${src ? " svg-drink" : ""}">${src ? `<img src="${src}" alt="" aria-hidden="true" draggable="false">` : ""}</span>`;
}

function waiterView(state: GameState, waiter: Waiter): "side" | "back" {
  const station = state.cells.find((cell) => cell.id === waiter.homeStationCellId);
  const atStation = station && waiter.x === station.x && waiter.y === station.y && ["idle", "waiting-drink"].includes(waiter.phase);
  return waiter.phase === "listening" || atStation ? "back" : "side";
}

function isBathroomInteraction(customer: Customer, target: Cell | undefined): boolean {
  return customer.phase === "using-extra" && !!target && ["toilet-stall", "sink", "hand-dryer"].includes(target.type);
}

function customerView(customer: Customer, target: Cell | undefined): "side" | "back" {
  return isBathroomInteraction(customer, target)
    || (target?.type === "darts" && customer.phase === "using-extra")
    || (target?.type === "counter" && ["waiting-bartender", "waiting-drink", "drinking"].includes(customer.phase)) ? "back" : "side";
}

function customerFacing(state: GameState, customer: Customer, target: Cell | undefined, offsets: Map<number, number>): number {
  if (customerView(customer, target) === "back") return 1;
  const atTable = target?.type === "table" && ["waiting-waiter", "waiting-drink", "waiting-delivery", "drinking"].includes(customer.phase);
  if (atTable || (target?.type === "billiards" && customer.phase === "using-extra")) {
    return (customer.localX ?? .5) < .5 ? 1 : -1;
  }
  return characterFacing(state, customer, offsets);
}

function customerActionProgress(state: GameState, customer: Customer): number | null {
  if (customer.phase !== "using-extra") return null;
  const duration = extraDuration(state, customer);
  return duration > 0 ? Math.max(0, Math.min(1, 1 - customer.phaseRemaining / duration)) : null;
}

function renderCharacters(state: GameState): string {
  const offsets = floorOffsets(state);
  const customers = state.customers.map((customer) => {
    const moving = customer.phase.startsWith("moving-") || customer.phase === "exiting";
    const waiting = ["waiting-activity", "waiting-counter", "waiting-table", "waiting-extra"].includes(customer.phase);
    const target = state.cells.find((cell) => cell.id === customer.targetCellId);
    const atCounter = target?.type === "counter" && ["waiting-bartender", "waiting-drink", "drinking"].includes(customer.phase);
    const atActivity = customer.phase === "using-extra";
    const actionProgress = customerActionProgress(state, customer);
    const atBathroom = isBathroomInteraction(customer, target);
    const atTable = target?.type === "table" && ["waiting-waiter", "waiting-drink", "waiting-delivery", "drinking"].includes(customer.phase);
    let position = moving
      ? movingPersonPosition(state, customer, offsets)
      : pointPosition(state, customer.x, customer.y, customer.localX ?? .5, offsets);
    const hasDrink = customer.phase === "drinking";
    const tableDrinkSide = atTable ? (customer.slotIndex === 0 ? "table-drink-right" : "table-drink-left") : "";
    const art = Object.prototype.hasOwnProperty.call(CUSTOMER_ART, customer.typeId)
      ? CUSTOMER_ART[customer.typeId as keyof typeof CUSTOMER_ART] : undefined;
    const view = customerView(customer, target);
    const progressMarkup = actionProgress === null ? "" : `<span class="action-progress" style="--action-progress:${actionProgress * 360}deg"></span>`;
    const appearance = progressMarkup + (art
      ? `<span class="character-art" style="--character-facing:${customerFacing(state, customer, target, offsets)}">${renderCharacterArt(art[view])}</span>`
      : `<span class="person-head"></span><span class="person-body"></span>`);
    return `<div class="person customer ${art ? `svg-customer customer-${view}` : ""} ${moving ? "moving-person" : ""} ${waiting ? "waiting-customer" : ""} ${atCounter ? "counter-customer" : ""} ${atTable ? "table-customer" : ""} ${atActivity ? "activity-customer" : ""} ${atBathroom ? "bathroom-customer" : ""} ${tableDrinkSide}" data-person-id="${customer.id}" style="transform:translate(${position.left}px, ${position.top}px) translateY(var(--person-offset-y, 0px))">${waiting ? `<span class="waiting-indicator"><i>${uiIcon("hourglass")}</i></span>` : ""}${appearance}${hasDrink ? renderDrink(customer.orderId, target?.type === "counter" ? "counter-drink" : "") : ""}</div>`;
  }).join("");
  const bartenders = state.bartenders.map((bartender) => {
    const serviceCell = state.cells.find((cell) => (cell.type === "counter" || cell.type === "taps" || cell.type === "waiter-station") && cell.x === Math.round(bartender.x) && cell.y === Math.round(bartender.y));
    const actionDuration = bartender.phase === "listening" ? CONFIG.listenDuration * bartender.speedFactor : bartender.phase === "pouring" ? CONFIG.pourDuration * bartender.speedFactor : null;
    const actionProgress = actionDuration === null ? null : Math.max(0, Math.min(1, 1 - bartender.phaseRemaining / actionDuration));
    const moving = bartender.phase === "moving-customer" || bartender.phase === "moving-taps" || bartender.phase === "returning";
    const view = moving || bartender.phase === "pouring" ? "side" : "front";
    const position = moving
      ? movingPersonPosition(state, bartender, offsets)
      : pointPosition(state, bartender.x, bartender.y, bartender.localX ?? .5, offsets);
    const hasDrink = bartender.phase === "pouring" || bartender.phase === "returning";
    const drinkClass = bartender.phase === "pouring" ? "pouring-drink" : bartender.phase === "returning" ? "carrying-drink" : "";
    return `<div class="person bartender ${serviceCell ? `${serviceCell.type}-bartender` : ""} ${drinkClass}" data-person-id="${bartender.id}" style="transform:translate(${position.left}px, ${position.top}px) translateY(var(--person-offset-y, 0px))">${actionProgress === null ? "" : `<span class="action-progress" style="--action-progress:${actionProgress * 360}deg"></span>`}<span class="character-art" style="--character-facing:${view === "side" ? characterFacing(state, bartender, offsets) : 1}">${renderCharacterArt(BARTENDER_ART[view])}${hasDrink ? renderDrink(state.customers.find((customer) => customer.id === bartender.customerId)?.orderId, "bartender-mug") : ""}</span></div>`;
  }).join("");
  const waiters = state.waiters.map((waiter) => {
    const moving = ["moving-customer", "moving-station", "delivering", "returning-station"].includes(waiter.phase);
    const station = state.cells.find((cell) => cell.id === waiter.homeStationCellId);
    const atStation = station && waiter.x === station.x && waiter.y === station.y && ["idle", "waiting-drink"].includes(waiter.phase);
    const position = moving ? movingPersonPosition(state, waiter, offsets) : pointPosition(state, waiter.x, waiter.y, waiter.localX ?? .5, offsets);
    const actionProgress = waiter.phase === "listening" ? Math.max(0, Math.min(1, 1 - waiter.phaseRemaining / (CONFIG.listenDuration * waiter.speedFactor))) : null;
    const hasDrink = waiter.phase === "delivering";
    const view = waiterView(state, waiter);
    return `<div class="person waiter ${moving ? "moving-person" : ""} ${atStation ? "station-waiter" : ""} ${waiter.phase === "listening" ? "table-service-waiter" : ""}" data-person-id="${waiter.id}" style="transform:translate(${position.left}px, ${position.top}px) translateY(var(--person-offset-y, 0px))">${actionProgress === null ? "" : `<span class="action-progress" style="--action-progress:${actionProgress * 360}deg"></span>`}<span class="character-art" style="--character-facing:${view === "side" ? characterFacing(state, waiter, offsets) : 1}">${renderCharacterArt(WAITER_ART[view])}${hasDrink ? renderDrink(state.customers.find((customer) => customer.id === waiter.customerId)?.orderId, "waiter-mug") : ""}</span></div>`;
  }).join("");
  return customers + bartenders + waiters;
}

const paymentIds = new WeakMap<object, number>();
let nextPaymentId = 0;
function paymentId(popup: object): number {
  let id = paymentIds.get(popup);
  if (id === undefined) {
    id = nextPaymentId++;
    paymentIds.set(popup, id);
  }
  return id;
}

function renderPaymentPopups(state: GameState, ui: UiState): string {
  const offsets = floorOffsets(state);
  return ui.paymentPopups.map((popup, index) => {
    const position = pointPosition(state, popup.x, popup.y, popup.localX, offsets);
    const progress = popup.elapsed / CONFIG.paymentPopupDuration;
    const opacity = Math.min(1, popup.elapsed / CONFIG.paymentPopupFadeDuration, (CONFIG.paymentPopupDuration - popup.elapsed) / CONFIG.paymentPopupFadeDuration);
    const amount = formatOrderPrice(popup.amount);
    return `<span class="payment-popup" data-render-key="payment-${paymentId(popup)}" data-payment-index="${index}" style="left:${position.left + 25}px;top:${position.top - 38}px;opacity:${Math.max(0, opacity)};transform:translate(-50%, ${-CONFIG.paymentPopupRise * progress}px)">+${resourceIcon("money")}${amount}</span>`;
  }).join("");
}

const paymentFrames = new WeakMap<HTMLElement, string>();

export function updatePaymentPopups(root: HTMLElement, state: GameState, ui: UiState): void {
  if (root.querySelector<HTMLElement>(".persons-layer")?.dataset.charactersHidden === "true") return;
  const layer = root.querySelector<HTMLElement>(".payments-layer");
  if (layer) {
    const key = `${ui.paymentPopups.map(paymentId).join(",")}:${state.cells.map((cell) => `${cell.id},${cell.x},${cell.y},${cellWidth(cell)}`).join(";")}`;
    if (paymentFrames.get(layer) !== key) {
      patchHtml(layer, renderPaymentPopups(state, ui));
      paymentFrames.set(layer, key);
    }
  }
  root.querySelectorAll<HTMLElement>(".payment-popup[data-payment-index]").forEach((element) => {
    const popup = ui.paymentPopups[Number(element.dataset.paymentIndex)];
    if (!popup) {
      element.remove();
      return;
    }
    const progress = popup.elapsed / CONFIG.paymentPopupDuration;
    setStyle(element, "opacity", String(Math.max(0, Math.min(1, popup.elapsed / CONFIG.paymentPopupFadeDuration, (CONFIG.paymentPopupDuration - popup.elapsed) / CONFIG.paymentPopupFadeDuration))));
    setStyle(element, "transform", `translate(-50%, ${-CONFIG.paymentPopupRise * progress}px)`);
  });
}

const characterFrames = new WeakMap<HTMLElement, string>();

export function updateCharacterPositions(root: HTMLElement, state: GameState): void {
  const layer = root.querySelector<HTMLElement>(".persons-layer");
  if (layer?.dataset.charactersHidden === "true") return;
  if (layer) {
    const appearanceKey = JSON.stringify([
      state.cells.map(({ id, type, x, y }) => [id, type, x, y]),
      state.customers.map(({ id, typeId, phase, targetCellId, slotIndex, orderId }) => [id, typeId, phase, targetCellId, slotIndex, orderId]),
      state.bartenders.map(({ id, phase, customerId, x, y }) => [id, phase, customerId, x, y]),
      state.waiters.map(({ id, phase, customerId, x, y, homeStationCellId }) => [id, phase, customerId, x, y, homeStationCellId]),
    ]);
    if (characterFrames.get(layer) !== appearanceKey) {
      patchHtml(layer, renderCharacters(state));
      characterFrames.set(layer, appearanceKey);
    }
  }
  const offsets = floorOffsets(state);
  const positions = new Map<string, { left: number; top: number }>();
  const facings = new Map<string, number>();
  const progresses = new Map<string, number>();

  for (const customer of state.customers) {
    const progress = customerActionProgress(state, customer);
    if (progress !== null) progresses.set(customer.id, progress);
    const target = state.cells.find((cell) => cell.id === customer.targetCellId);
    facings.set(customer.id, customerFacing(state, customer, target, offsets));
    const moving = customer.phase.startsWith("moving-") || customer.phase === "exiting";
    positions.set(customer.id, moving
      ? movingPersonPosition(state, customer, offsets)
      : pointPosition(state, customer.x, customer.y, customer.localX ?? .5, offsets));
  }
  for (const bartender of state.bartenders) {
    const duration = bartender.phase === "listening" ? CONFIG.listenDuration * bartender.speedFactor
      : bartender.phase === "pouring" ? CONFIG.pourDuration * bartender.speedFactor : null;
    if (duration !== null) progresses.set(bartender.id, Math.max(0, Math.min(1, 1 - bartender.phaseRemaining / duration)));
    const moving = ["moving-customer", "moving-taps", "returning"].includes(bartender.phase);
    facings.set(bartender.id, moving || bartender.phase === "pouring" ? characterFacing(state, bartender, offsets) : 1);
    positions.set(bartender.id, moving
      ? movingPersonPosition(state, bartender, offsets)
      : pointPosition(state, bartender.x, bartender.y, bartender.localX ?? .5, offsets));
  }
  for (const waiter of state.waiters) {
    if (waiter.phase === "listening") progresses.set(waiter.id, Math.max(0, Math.min(1, 1 - waiter.phaseRemaining / (CONFIG.listenDuration * waiter.speedFactor))));
    const moving = ["moving-customer", "moving-station", "delivering", "returning-station"].includes(waiter.phase);
    facings.set(waiter.id, waiterView(state, waiter) === "side" ? characterFacing(state, waiter, offsets) : 1);
    positions.set(waiter.id, moving
      ? movingPersonPosition(state, waiter, offsets)
      : pointPosition(state, waiter.x, waiter.y, waiter.localX ?? .5, offsets));
  }

  root.querySelectorAll<HTMLElement>(".person[data-person-id]").forEach((element) => {
    const position = positions.get(element.dataset.personId ?? "");
    if (!position) return;
    setStyle(element, "transform", `translate(${position.left}px, ${position.top}px) translateY(var(--person-offset-y, 0px))`);
    const art = element.querySelector<HTMLElement>(".character-art");
    if (art) setStyle(art, "--character-facing", `${facings.get(element.dataset.personId ?? "") ?? 1}`);
    const progress = element.querySelector<HTMLElement>(".action-progress");
    const value = progresses.get(element.dataset.personId ?? "");
    if (progress && value !== undefined) setStyle(progress, "--action-progress", `${value * 360}deg`);
  });
}

export function renderMap(state: GameState, ui: UiState): string {
  const focused = ui.focusX !== null && ui.focusY !== null;
  const focusedCell = focused ? state.cells.find((cell) => cell.x === ui.focusX && cell.y === ui.focusY) : undefined;
  const floors = renderFloors(state, ui);
  const frameWidth = frameInnerWidth();
  const focusedEmptyIsVertical = focused && !focusedCell && ui.focusX === 0 && ui.focusY! < 0 && state.cells.some((cell) => cell.x === 0 && cell.y === ui.focusY! + 1 && (cell.type === "entrance" || cell.type === "stairs"));
  const selectedWidth = (focusedCell ? cellWidth(focusedCell) : focusedEmptyIsVertical ? CELL_DEFINITIONS.stairs.width : 1) * BASE_CELL_WIDTH;
  const focusTop = 14;
  const focusHeight = window.innerHeight <= 760 ? 360 : 470;
  const scale = focused ? (ui.movePreview ? CONFIG.distantMapScale : 1) : CONFIG.distantMapScale * ui.mapZoom;
  const focusedLeft = cellLeft(state, ui.focusX ?? 0, ui.focusY ?? 0)
    + (focused && !focusedCell && !focusedEmptyIsVertical ? CONFIG.mapArt.cellSurfaces.floorHeight : 0);
  const shiftX = focused ? (frameWidth - selectedWidth * scale) / 2 - focusedLeft * scale : (frameWidth - (floors.maxRight - floors.minLeft) * scale) / 2 - floors.minLeft * scale + ui.panX;
  const focusedTop = (floors.maxY + 1 - (ui.focusY ?? 0)) * CELL_HEIGHT + 25;
  const shiftY = focused ? focusTop + (focusHeight - CELL_HEIGHT * scale) / 2 - focusedTop * scale : ui.panY - 54;
  const levels = state.cells.filter((cell) => cell.type !== "entrance" && CELL_DEFINITIONS[cell.type].hasLevel).map((cell) => {
    const affordable = cell.type !== "entrance" && cell.level < CONFIG.maxCellLevel
      && isCellUpgradeTierUnlocked(state, cell.type, cell.level + 1)
      && state.money >= upgradeCostForLevel(cell.level + 1);
    const left = cellLeft(state, cell.x, cell.y) + cellWidth(cell) * BASE_CELL_WIDTH / 2;
    const top = (floors.maxY + 1 - cell.y) * CELL_HEIGHT + 25 + CELL_HEIGHT - CONFIG.cellLevelBottomOffset;
    return `<span class="cell-level ${affordable ? "affordable" : ""}" style="left:${left}px;top:${top}px;--label-scale:${1 / scale}">ур.${cell.level}</span>`;
  }).join("");
  const taps = CONFIG.mapArt.taps;
  const barrelTop = CONFIG.customerPathTop - 25 + CONFIG.mapArt.counter.customerOffsetY - CONFIG.mapArt.counter.bartenderRise + taps.pouringMugTop - taps.pouringGap - taps.nozzleY;
  const tapStyle = `--tap-barrel-top:${barrelTop}px;--tap-barrel-width:${taps.barrelWidth}px;--tap-barrel-height:${taps.barrelHeight}px;--pouring-mug-top:${taps.pouringMugTop}px;--pouring-mug-right:${taps.pouringMugRight}px;--pouring-hand-rise:${taps.pouringHandRise}px;--counter-side-gap:${CELL_DEFINITIONS.counter.width * BASE_CELL_WIDTH - CONFIG.mapArt.counter.bodyWidth}px`;
  const walkingOffsetY = CELL_HEIGHT - CONFIG.mapArt.cellSurfaces.floorHeight - (CONFIG.customerPathTop - 25) - CONFIG.mapArt.customer.body.y;
  return `<main class="map-viewport ${focused ? "is-focused" : ""}" data-map style="${tapStyle}">
    <div class="map-scene" data-map-left="${floors.minLeft}" data-map-right="${floors.maxRight}" style="--scene-shift-x:${shiftX}px;--scene-shift-y:${shiftY}px;--scene-scale:${scale};--scene-width:${Math.max(900, floors.maxRight + SCENE_PADDING)}px;--counter-body-height:${CONFIG.mapArt.counter.bodyHeight}px;--counter-body-width:${CONFIG.mapArt.counter.bodyWidth}px;--counter-edge-width:${CONFIG.mapArt.counter.edgeWidth}px;--counter-seam-overlap:${CONFIG.mapArt.counter.seamOverlap}px;--walking-y:${walkingOffsetY}px;--counter-drink-bottom:${25 + CELL_HEIGHT - CONFIG.mapArt.cellSurfaces.floorHeight - CONFIG.mapArt.counter.bodyHeight - CONFIG.customerPathTop - CONFIG.mapArt.counter.customerOffsetY}px;--counter-customer-y:${CONFIG.mapArt.counter.customerOffsetY}px;--counter-bartender-rise:${CONFIG.mapArt.counter.bartenderRise}px">
      ${renderMapEnvironment(state, frameWidth, focused, shiftX, shiftY, scale)}${floors.html}<div class="characters-layer"><div class="persons-layer" data-characters-hidden="${Boolean(ui.movePreview)}">${ui.movePreview ? "" : renderCharacters(state)}</div><div class="payments-layer">${ui.movePreview ? "" : renderPaymentPopups(state, ui)}</div></div>
      <div class="cell-levels-layer">${levels}</div>
    </div></main>`;
}
