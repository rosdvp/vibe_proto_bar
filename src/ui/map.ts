import { CELL_DEFINITIONS, CONFIG } from "../config";
import { cellCenter, cellLeft, cellWidth, floorCells, floorOffsets, personPosition, pointPosition, SCENE_PADDING } from "../geometry";
import { equipmentIssue } from "../game/selectors";
import type { Cell, GameState } from "../types";
import type { UiState } from "./types";
import { attentionIndicator, attentionOnBuiltCell, attentionOnEmptyCell } from "./attention";
import { isFloorWidthBlocked, isNewFloorBlocked, nextDepthResearchId, nextWidthResearchId } from "../game/infrastructure";
import { lockIcon } from "./icons";
import { isCellTypeUnlocked } from "../game/progression";

const BASE_CELL_WIDTH = CONFIG.baseCellWidth;
const CELL_HEIGHT = CONFIG.cellHeight;

function renderFixture(cell: Cell): string {
  if (cell.type === "entrance" || cell.type === "stairs") {
    return `<div class="fixture fixture-stairs"><span class="stair-flight"><i></i><i></i><i></i><i></i></span></div>`;
  }
  if (cell.type === "counter") {
    return `<div class="fixture fixture-counter"><span class="bar-surface"></span><span class="chair chair-1"></span><span class="chair chair-2"></span><span class="chair chair-3"></span></div>`;
  }
  if (cell.type === "taps") {
    return `<div class="tap-barrel"><span class="tap-handle"></span></div><div class="fixture fixture-taps"><span class="bar-surface"></span></div>`;
  }
  if (cell.type === "waiter-station") {
    return `<div class="fixture fixture-waiter-station"><span class="bar-surface"></span><span class="serving-dome"><i></i></span></div>`;
  }
  if (cell.type === "toilet-stall") return `<div class="fixture fixture-toilet-stall"><span class="stall-partition"></span><span class="toilet-tank"></span><span class="toilet-bowl"></span></div>`;
  if (cell.type === "sink") return `<div class="fixture fixture-sink"><span class="sink-faucet"></span><span class="sink-basin"></span><span class="sink-pedestal"></span></div>`;
  if (cell.type === "hand-dryer") return `<div class="fixture fixture-hand-dryer"><span class="dryer-body"></span><span class="dryer-nozzle"></span></div>`;
  if (cell.type === "darts") return `<div class="fixture fixture-darts"><span class="dart-board"><i></i></span></div>`;
  if (cell.type === "billiards") return `<div class="fixture fixture-billiards"><span class="billiard-ball ball-blue"></span><span class="billiard-ball ball-orange"></span><span class="billiard-ball ball-green"></span><span class="billiard-ball ball-black"></span><span class="billiard-ball ball-purple"></span><span class="billiard-ball ball-red"></span><span class="billiard-top"></span><span class="billiard-leg leg-left"></span><span class="billiard-leg leg-right"></span></div>`;
  return `<div class="fixture fixture-table"><span class="table-top"></span><span class="table-leg"></span><span class="chair chair-1"></span><span class="chair chair-2"></span></div>`;
}

function renderCell(state: GameState, ui: UiState, cell: Cell): string {
  const issue = equipmentIssue(state, cell);
  const focused = ui.focusX === cell.x && ui.focusY === cell.y;
  return `<button class="map-cell built type-${cell.type} ${focused ? "attention-focused" : ""}" style="--cell-span:${cellWidth(cell)}" data-action="focus-cell" data-x="${cell.x}" data-y="${cell.y}" aria-label="Ячейка ${cell.x}, ${cell.y}">
    <span class="back-wall"></span><span class="floor-plane"></span><span class="horizon"></span>${renderFixture(cell)}${issue ? `<span class="equipment-warning" aria-label="${issue}"></span>` : ""}${attentionOnBuiltCell(state, cell.type) ? attentionIndicator() : ""}
  </button>`;
}

function renderCandidate(state: GameState, x: number, y: number, vertical = false): string {
  const cellSpan = vertical ? CELL_DEFINITIONS.stairs.width : 1;
  const locked = vertical ? !isCellTypeUnlocked(state, "stairs") || isNewFloorBlocked(state, y) : isFloorWidthBlocked(state, y);
  const researchId = vertical ? nextDepthResearchId(state) : nextWidthResearchId(state);
  if (locked && !researchId) return "";
  return `<button class="map-cell empty candidate ${locked ? "research-locked" : ""}" style="--cell-span:${cellSpan}" data-action="focus-cell" data-x="${x}" data-y="${y}" data-vertical="${vertical}" aria-label="${locked ? "Заблокированная" : "Пустая"} ячейка ${x}, ${y}">
    <span class="back-wall"></span><span class="floor-plane"></span><span class="build-plus"><span class="plus-mark">${locked ? lockIcon() : `+${attentionOnEmptyCell(state, vertical) ? attentionIndicator() : ""}`}</span></span>
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
    const width = (cells.reduce((sum, cell) => sum + cellWidth(cell), 0) + (body.at(-1) ? 1 : 0)) * BASE_CELL_WIDTH;
    const left = offsets.get(y) ?? 0;
    minLeft = Math.min(minLeft, left);
    maxRight = Math.max(maxRight, left + width);
    rows.push(`<div class="cells-row" style="--floor-index:${sceneMaxY - y};left:${left}px">${body.join("")}</div>`);
  }
  for (const cell of state.cells.filter((item) => item.type === "entrance" || item.type === "stairs")) {
    const y = cell.y - 1;
    if (y < -4) continue;
    if (state.cells.some((item) => item.x === 0 && item.y === y)) continue;
    const top = (sceneMaxY - y) * CELL_HEIGHT + 25;
    rows.push(`<div class="vertical-candidate" style="left:${cellLeft(state, 0, cell.y, offsets)}px;top:${top}px">${renderCandidate(state, 0, y, true)}</div>`);
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

function renderCharacters(state: GameState): string {
  const offsets = floorOffsets(state);
  const customers = state.customers.map((customer) => {
    const moving = customer.phase.startsWith("moving-") || customer.phase === "exiting";
    const waiting = ["waiting-activity", "waiting-counter", "waiting-table", "waiting-extra"].includes(customer.phase);
    const target = state.cells.find((cell) => cell.id === customer.targetCellId);
    const atCounter = (target?.type === "counter" && ["waiting-bartender", "waiting-drink", "drinking"].includes(customer.phase)) || customer.phase === "using-extra";
    const atTable = target?.type === "table" && ["waiting-waiter", "waiting-drink", "waiting-delivery", "drinking"].includes(customer.phase);
    let position = moving
      ? movingPersonPosition(state, customer, offsets)
      : pointPosition(state, customer.x, customer.y, customer.localX ?? .5, offsets);
    const hasDrink = customer.phase === "drinking";
    const tableDrinkSide = atTable ? (customer.slotIndex === 0 ? "table-drink-right" : "table-drink-left") : "";
    return `<div class="person customer ${moving ? "moving-person" : ""} ${waiting ? "waiting-customer" : ""} ${atCounter ? "counter-customer" : ""} ${atTable ? "table-customer" : ""} ${tableDrinkSide}" data-person-id="${customer.id}" style="left:${position.left}px;top:${position.top}px">${waiting ? `<span class="waiting-indicator"><i>⌛</i></span>` : ""}<span class="person-head"></span><span class="person-body"></span>${hasDrink ? `<span class="drink-mug"></span>` : ""}</div>`;
  }).join("");
  const bartenders = state.bartenders.map((bartender) => {
    const serviceCell = state.cells.find((cell) => (cell.type === "counter" || cell.type === "taps" || cell.type === "waiter-station") && cell.x === Math.round(bartender.x) && cell.y === Math.round(bartender.y));
    const actionDuration = bartender.phase === "listening" ? CONFIG.listenDuration * bartender.speedFactor : bartender.phase === "pouring" ? CONFIG.pourDuration * bartender.speedFactor : null;
    const actionProgress = actionDuration === null ? null : Math.max(0, Math.min(1, 1 - bartender.phaseRemaining / actionDuration));
    const position = bartender.phase === "moving-customer" || bartender.phase === "moving-taps" || bartender.phase === "returning"
      ? movingPersonPosition(state, bartender, offsets)
      : pointPosition(state, bartender.x, bartender.y, bartender.localX ?? .5, offsets);
    const hasDrink = bartender.phase === "pouring" || bartender.phase === "returning";
    const drinkClass = bartender.phase === "pouring" ? "pouring-drink" : bartender.phase === "returning" ? "carrying-drink" : "";
    return `<div class="person bartender ${serviceCell ? `${serviceCell.type}-bartender` : ""} ${drinkClass}" data-person-id="${bartender.id}" style="left:${position.left}px;top:${position.top}px">${actionProgress === null ? "" : `<span class="action-progress" style="--action-progress:${actionProgress * 360}deg"></span>`}<span class="person-head"></span><span class="person-body"></span>${hasDrink ? `<span class="drink-mug bartender-mug"></span>` : ""}</div>`;
  }).join("");
  const waiters = state.waiters.map((waiter) => {
    const moving = ["moving-customer", "moving-station", "delivering", "returning-station"].includes(waiter.phase);
    const station = state.cells.find((cell) => cell.id === waiter.homeStationCellId);
    const atStation = station && waiter.x === station.x && waiter.y === station.y && ["idle", "waiting-drink"].includes(waiter.phase);
    const position = moving ? movingPersonPosition(state, waiter, offsets) : pointPosition(state, waiter.x, waiter.y, waiter.localX ?? .5, offsets);
    const actionProgress = waiter.phase === "listening" ? Math.max(0, Math.min(1, 1 - waiter.phaseRemaining / (CONFIG.listenDuration * waiter.speedFactor))) : null;
    const hasDrink = waiter.phase === "delivering";
    return `<div class="person waiter ${moving ? "moving-person" : ""} ${atStation ? "station-waiter" : ""} ${waiter.phase === "listening" ? "table-service-waiter" : ""}" data-person-id="${waiter.id}" style="left:${position.left}px;top:${position.top}px">${actionProgress === null ? "" : `<span class="action-progress" style="--action-progress:${actionProgress * 360}deg"></span>`}<span class="person-head"></span><span class="person-body"></span>${hasDrink ? `<span class="drink-mug waiter-mug"></span>` : ""}</div>`;
  }).join("");
  return customers + bartenders + waiters;
}

function renderPaymentPopups(state: GameState, ui: UiState): string {
  const offsets = floorOffsets(state);
  return ui.paymentPopups.map((popup, index) => {
    const position = pointPosition(state, popup.x, popup.y, popup.localX, offsets);
    const progress = popup.elapsed / CONFIG.paymentPopupDuration;
    const opacity = Math.min(1, popup.elapsed / CONFIG.paymentPopupFadeDuration, (CONFIG.paymentPopupDuration - popup.elapsed) / CONFIG.paymentPopupFadeDuration);
    const amount = Number(popup.amount.toFixed(2));
    return `<span class="payment-popup" data-payment-index="${index}" style="left:${position.left + 25}px;top:${position.top - 38}px;opacity:${Math.max(0, opacity)};transform:translate(-50%, ${-CONFIG.paymentPopupRise * progress}px)">+<i class="color-dot money"></i>${amount}</span>`;
  }).join("");
}

export function updatePaymentPopups(root: HTMLElement, ui: UiState): void {
  root.querySelectorAll<HTMLElement>(".payment-popup[data-payment-index]").forEach((element) => {
    const popup = ui.paymentPopups[Number(element.dataset.paymentIndex)];
    if (!popup) {
      element.remove();
      return;
    }
    const progress = popup.elapsed / CONFIG.paymentPopupDuration;
    element.style.opacity = String(Math.max(0, Math.min(1, popup.elapsed / CONFIG.paymentPopupFadeDuration, (CONFIG.paymentPopupDuration - popup.elapsed) / CONFIG.paymentPopupFadeDuration)));
    element.style.transform = `translate(-50%, ${-CONFIG.paymentPopupRise * progress}px)`;
  });
}

export function updateCharacterPositions(root: HTMLElement, state: GameState): void {
  const offsets = floorOffsets(state);
  const positions = new Map<string, { left: number; top: number }>();

  for (const customer of state.customers) {
    const moving = customer.phase.startsWith("moving-") || customer.phase === "exiting";
    positions.set(customer.id, moving
      ? movingPersonPosition(state, customer, offsets)
      : pointPosition(state, customer.x, customer.y, customer.localX ?? .5, offsets));
  }
  for (const bartender of state.bartenders) {
    const moving = ["moving-customer", "moving-taps", "returning"].includes(bartender.phase);
    positions.set(bartender.id, moving
      ? movingPersonPosition(state, bartender, offsets)
      : pointPosition(state, bartender.x, bartender.y, bartender.localX ?? .5, offsets));
  }
  for (const waiter of state.waiters) {
    const moving = ["moving-customer", "moving-station", "delivering", "returning-station"].includes(waiter.phase);
    positions.set(waiter.id, moving
      ? movingPersonPosition(state, waiter, offsets)
      : pointPosition(state, waiter.x, waiter.y, waiter.localX ?? .5, offsets));
  }

  root.querySelectorAll<HTMLElement>(".person[data-person-id]").forEach((element) => {
    const position = positions.get(element.dataset.personId ?? "");
    if (!position) return;
    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;
  });
}

export function renderMap(state: GameState, ui: UiState): string {
  const focused = ui.focusX !== null && ui.focusY !== null;
  const focusedCell = focused ? state.cells.find((cell) => cell.x === ui.focusX && cell.y === ui.focusY) : undefined;
  const floors = renderFloors(state, ui);
  const narrow = window.innerWidth <= 780;
  const gameWidth = narrow ? window.innerWidth : Math.min(430, window.innerWidth - 24);
  const frameInnerWidth = narrow ? gameWidth : gameWidth - 8;
  const focusedEmptyIsVertical = focused && !focusedCell && ui.focusX === 0 && ui.focusY! < 0 && state.cells.some((cell) => cell.x === 0 && cell.y === ui.focusY! + 1 && (cell.type === "entrance" || cell.type === "stairs"));
  const selectedWidth = (focusedCell ? cellWidth(focusedCell) : focusedEmptyIsVertical ? CELL_DEFINITIONS.stairs.width : 1) * BASE_CELL_WIDTH;
  const focusTop = 14;
  const focusHeight = window.innerHeight <= 760 ? 360 : 470;
  const scale = focused && !ui.movePreview ? 1 : .7;
  const focusedLeft = cellLeft(state, ui.focusX ?? 0, ui.focusY ?? 0);
  const shiftX = focused ? (frameInnerWidth - selectedWidth * scale) / 2 - focusedLeft * scale : (frameInnerWidth - (floors.maxRight - floors.minLeft) * scale) / 2 - floors.minLeft * scale + ui.panX;
  const focusedTop = (floors.maxY + 1 - (ui.focusY ?? 0)) * CELL_HEIGHT + 25;
  const shiftY = focused ? focusTop + (focusHeight - CELL_HEIGHT * scale) / 2 - focusedTop * scale : ui.panY - 54;
  return `<main class="map-viewport ${focused ? "is-focused" : ""}" data-map>
    <div class="map-scene" style="--scene-shift-x:${shiftX}px;--scene-shift-y:${shiftY}px;--scene-scale:${scale};--scene-width:${Math.max(900, floors.maxRight + SCENE_PADDING)}px">
      ${floors.html}<div class="characters-layer">${ui.movePreview ? "" : renderCharacters(state) + renderPaymentPopups(state, ui)}</div>
    </div></main>`;
}
