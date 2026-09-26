import { BUILDABLE_CELL_TYPES, CELL_DEFINITIONS, CONFIG, CUSTOMER_TYPES, DRINKS } from "../config";
import type {
  BuildableCellType,
  CustomerTypeDefinition,
  GameState,
  RandomSource,
  UnlockFeature,
} from "../types";
import { cellQuality, cellsShareRoom, getCell, getDrink, menuCapacity } from "./selectors";
import { syncPersonnel } from "./personnel";
import { findRoute } from "./navigation";
import { movementDuration } from "../geometry";
import { isCellUpgradeTierUnlocked } from "./tiers";
import { isFloorWidthBlocked, isNewFloorBlocked } from "./infrastructure";

export function isCustomerTypeUnlocked(state: GameState, type: CustomerTypeDefinition): boolean {
  const menu = new Set(state.menu);
  const drinksSatisfied = type.drinkRequirements.every((requirement) => {
    if (requirement.kind === "specific") return menu.has(requirement.drinkId);
    return DRINKS.some(
      (drink) =>
        menu.has(drink.id) &&
        drink.category === requirement.category &&
        drink.rating >= requirement.min &&
        drink.rating <= requirement.max,
    );
  });
  if (!drinksSatisfied) return false;

  for (const requirement of type.qualityRequirements) {
    const cells = state.cells.filter((cell) => cell.type === requirement.cellType);
    if (cells.length === 0) return false;
    const averageQuality = cells.reduce((sum, cell) => sum + cellQuality(cell.level), 0) / cells.length;
    if (averageQuality + Number.EPSILON < requirement.minimum) return false;
  }
  return true;
}

export function unlockedByType(state: GameState): Record<string, boolean> {
  return Object.fromEntries(CUSTOMER_TYPES.map((type) => [type.id, isCustomerTypeUnlocked(state, type)]));
}

export function isDrinkUnlocked(state: GameState, drinkId: string): boolean {
  return state.unlockedFeatureIds.includes(`menu-item:${drinkId}`);
}

export function isCellTypeUnlocked(state: GameState, type: BuildableCellType): boolean {
  return state.unlockedFeatureIds.includes(`cell-type:${type}`);
}

export function unlockFeature(state: GameState, feature: UnlockFeature): boolean {
  const featureId = `${feature.kind}:${feature.id}`;
  if (state.unlockedFeatureIds.includes(featureId)) return false;
  if (feature.kind === "menu-item") {
    if (!DRINKS.some((drink) => drink.id === feature.id)) return false;
  }
  if (feature.kind === "cell-type") {
    if (!BUILDABLE_CELL_TYPES.includes(feature.id)) return false;
  }
  state.unlockedFeatureIds.push(featureId);
  if (feature.kind === "menu-item" || (feature.kind === "other" && feature.id === "research-screen")) {
    state.unseenUnlockIds.push(featureId);
  }
  return true;
}

export function acknowledgeMenuUnlocks(state: GameState): void {
  state.unseenUnlockIds = state.unseenUnlockIds.filter((id) => !id.startsWith("menu-item:"));
}

export function acknowledgeResearchScreenUnlock(state: GameState): void {
  state.unseenUnlockIds = state.unseenUnlockIds.filter((id) => id !== "other:research-screen");
}

export function unlockRandomLockedCellType(state: GameState, random: RandomSource = Math.random): UnlockFeature | null {
  const locked = BUILDABLE_CELL_TYPES.filter((type) => !["toilet-stall", "sink", "hand-dryer", "darts", "billiards"].includes(type) && !isCellTypeUnlocked(state, type));
  const type = locked[Math.floor(random() * locked.length)];
  if (!type) return null;
  const feature: UnlockFeature = { kind: "cell-type", id: type, name: CELL_DEFINITIONS[type].name };
  unlockFeature(state, feature);
  return feature;
}

export function eligibleOrderIds(state: GameState, type: CustomerTypeDefinition): string[] {
  const ids = new Set<string>();
  for (const requirement of type.drinkRequirements) {
    if (requirement.kind === "specific") {
      if (state.menu.includes(requirement.drinkId)) ids.add(requirement.drinkId);
      continue;
    }
    for (const drink of DRINKS) {
      if (
        state.menu.includes(drink.id) &&
        drink.category === requirement.category &&
        drink.rating >= requirement.min &&
        drink.rating <= requirement.max
      ) {
        ids.add(drink.id);
      }
    }
  }
  return [...ids];
}

export function chooseOrderId(
  state: GameState,
  type: CustomerTypeDefinition,
  random: RandomSource,
): string | null {
  const ids = eligibleOrderIds(state, type);
  return ids.length > 0 ? ids[Math.floor(random() * ids.length)] ?? ids[0] ?? null : null;
}

export function buildCell(state: GameState, x: number, type: BuildableCellType, y = 0): boolean {
  if (!isCellTypeUnlocked(state, type)) return false;
  if (type === "stairs" ? isNewFloorBlocked(state, y) : isFloorWidthBlocked(state, y)) return false;
  if (state.cells.some((cell) => cell.x === x && cell.y === y)) return false;
  const horizontalNeighbor = state.cells.some((cell) => cell.y === y && Math.abs(cell.x - x) === 1);
  const stairSupport = state.cells.some(
    (cell) => cell.x === 0 && cell.y === y + 1 && (cell.type === "entrance" || cell.type === "stairs"),
  );
  if (type === "stairs" ? x !== 0 || y >= 0 || !stairSupport : x <= 0 || !horizontalNeighbor) return false;
  if (state.money < CONFIG.buildCost) return false;
  state.money -= CONFIG.buildCost;
  state.cells.push({ id: `cell-${state.nextEntityId++}`, x, y, type, level: 1 });
  state.cells.sort((a, b) => a.y - b.y || a.x - b.x);
  syncPersonnel(state);
  return true;
}

function shiftX(value: number, removedX: number): number {
  return value > removedX ? value - 1 : value;
}

type MovingCharacter = GameState["customers"][number] | GameState["bartenders"][number] | GameState["waiters"][number];

function placeCharacter(character: MovingCharacter, x: number, y: number): void {
  character.x = x;
  character.y = y;
  character.moveFromX = x;
  character.moveFromY = y;
  character.moveTargetX = x;
  character.moveTargetY = y;
  character.moveFromLocalX = character.localX ?? .5;
  character.moveTargetLocalX = character.localX ?? .5;
  character.moveEndLocalX = character.localX ?? .5;
  character.moveDuration = 0;
  character.movePath = [];
}

function restartRoute(
  state: GameState,
  character: MovingCharacter,
  destination: { x: number; y: number } | undefined,
  durationFactor = 1,
): void {
  const moving = character.moveFromX !== character.moveTargetX || character.moveFromY !== character.moveTargetY || character.movePath.length > 0;
  if (!moving || !destination) {
    character.movePath = [];
    return;
  }
  const progress = character.moveDuration > 0 ? 1 - character.phaseRemaining / character.moveDuration : 1;
  const anchor = progress < .5
    ? { x: character.moveFromX, y: character.moveFromY, localX: character.moveFromLocalX ?? .5 }
    : { x: character.moveTargetX, y: character.moveTargetY, localX: character.moveTargetLocalX ?? .5 };
  const route = findRoute(state, anchor.x, anchor.y, destination.x, destination.y).slice(1).map(({ x, y }) => ({ x, y }));
  character.x = anchor.x;
  character.y = anchor.y;
  character.localX = anchor.localX;
  character.moveFromX = anchor.x;
  character.moveFromY = anchor.y;
  character.moveFromLocalX = anchor.localX;
  const next = route.shift() ?? destination;
  character.moveTargetX = next.x;
  character.moveTargetY = next.y;
  character.moveTargetLocalX = route.length === 0 ? character.moveEndLocalX ?? .5 : .5;
  character.movePath = route;
  character.moveDuration = movementDuration(state, anchor.x, anchor.y, next.x, next.y, anchor.localX, character.moveTargetLocalX) * durationFactor;
  character.phaseRemaining = character.moveDuration;
}

export function reorderFloorCells(state: GameState, floorY: number, cellOrder: string[]): boolean {
  const floor = state.cells.filter((cell) => cell.y === floorY).sort((a, b) => a.x - b.x);
  if (floor.length !== cellOrder.length || new Set(cellOrder).size !== floor.length) return false;
  const floorIds = new Set(floor.map((cell) => cell.id));
  if (cellOrder.some((id) => !floorIds.has(id))) return false;
  const positions = new Map(cellOrder.map((id, x) => [id, x]));
  if (floor.some((cell) => (cell.type === "entrance" || cell.type === "stairs") && positions.get(cell.id) !== cell.x)) return false;
  const movedIds = new Set(floor.filter((cell) => positions.get(cell.id) !== cell.x).map((cell) => cell.id));
  if (movedIds.size === 0) return true;

  for (const cell of floor) cell.x = positions.get(cell.id) ?? cell.x;
  const cellById = new Map(state.cells.map((cell) => [cell.id, cell]));

  for (const customer of state.customers) {
    const target = customer.targetCellId ? cellById.get(customer.targetCellId) : undefined;
    const isMoving = customer.phase.startsWith("moving-") || customer.phase === "exiting";
    if (!isMoving && target && movedIds.has(target.id)) placeCharacter(customer, target.x, target.y);
  }
  for (const bartender of state.bartenders) {
    const customer = state.customers.find((item) => item.id === bartender.customerId);
    const activityCell = bartender.phase === "pouring"
      ? cellById.get(bartender.tapCellId ?? "")
      : bartender.phase === "listening" && customer?.targetCellId
        ? cellById.get(customer.targetCellId)
        : undefined;
    if (activityCell && movedIds.has(activityCell.id)) placeCharacter(bartender, activityCell.x, activityCell.y);
  }
  for (const waiter of state.waiters) {
    const customer = state.customers.find((item) => item.id === waiter.customerId);
    const activityCell = waiter.phase === "waiting-drink"
      ? cellById.get(waiter.homeStationCellId)
      : waiter.phase === "listening" && customer?.targetCellId
        ? cellById.get(customer.targetCellId)
        : undefined;
    if (activityCell && movedIds.has(activityCell.id)) placeCharacter(waiter, activityCell.x, activityCell.y);
  }

  for (const customer of state.customers) {
    const target = customer.targetCellId ? cellById.get(customer.targetCellId) : undefined;
    restartRoute(state, customer, target);
  }
  for (const bartender of state.bartenders) {
    const customer = state.customers.find((item) => item.id === bartender.customerId);
    const target = bartender.phase === "moving-taps"
      ? cellById.get(bartender.tapCellId ?? "")
      : bartender.phase === "moving-customer" && customer?.targetCellId
        ? cellById.get(customer.targetCellId)
        : bartender.phase === "returning" && customer?.activity === "table"
          ? cellById.get(state.waiters.find((item) => item.id === customer.waiterId)?.homeStationCellId ?? "")
          : bartender.phase === "returning" && customer?.targetCellId
            ? cellById.get(customer.targetCellId)
            : undefined;
    restartRoute(state, bartender, target, bartender.speedFactor);
  }
  for (const waiter of state.waiters) {
    const customer = state.customers.find((item) => item.id === waiter.customerId);
    const target = waiter.phase === "moving-customer" || waiter.phase === "delivering"
      ? cellById.get(customer?.targetCellId ?? "")
      : waiter.phase === "moving-station" || waiter.phase === "returning-station"
        ? cellById.get(waiter.homeStationCellId)
        : undefined;
    restartRoute(state, waiter, target, waiter.speedFactor);
  }
  state.cells.sort((a, b) => a.y - b.y || a.x - b.x);
  reconcileStaffRooms(state);
  return true;
}

function compactCharacterRoute(
  state: GameState,
  character: MovingCharacter,
  floorY: number,
  removedX: number,
  durationFactor = 1,
): void {
  const wasMoving = character.phaseRemaining > 0 && (
    character.moveFromX !== character.moveTargetX ||
    character.moveFromY !== character.moveTargetY ||
    character.movePath.length > 0
  );
  const progress = character.moveDuration > 0 ? 1 - character.phaseRemaining / character.moveDuration : 1;
  if (character.moveFromY === floorY) character.moveFromX = shiftX(character.moveFromX, removedX);
  if (character.moveTargetY === floorY) character.moveTargetX = shiftX(character.moveTargetX, removedX);
  character.movePath = character.movePath
    .map((point) => point.y === floorY ? { ...point, x: shiftX(point.x, removedX) } : point)
    .filter((point, index, points) => index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y);
  if (!wasMoving) {
    if (character.y === floorY) character.x = shiftX(character.x, removedX);
    return;
  }

  const destination = character.movePath.at(-1) ?? { x: character.moveTargetX, y: character.moveTargetY };
  const preferredAnchor = progress >= .5
    ? { x: character.moveTargetX, y: character.moveTargetY, localX: character.moveTargetLocalX ?? .5 }
    : { x: character.moveFromX, y: character.moveFromY, localX: character.moveFromLocalX ?? .5 };
  const fallbackAnchor = progress >= .5
    ? { x: character.moveFromX, y: character.moveFromY, localX: character.moveFromLocalX ?? .5 }
    : { x: character.moveTargetX, y: character.moveTargetY, localX: character.moveTargetLocalX ?? .5 };
  const anchor = state.cells.some((cell) => cell.x === preferredAnchor.x && cell.y === preferredAnchor.y)
    ? preferredAnchor
    : fallbackAnchor;
  const route = findRoute(state, anchor.x, anchor.y, destination.x, destination.y).slice(1).map(({ x, y }) => ({ x, y }));
  character.x = anchor.x;
  character.y = anchor.y;
  character.localX = anchor.localX;
  character.moveFromX = anchor.x;
  character.moveFromY = anchor.y;
  character.moveFromLocalX = anchor.localX;
  const next = route.shift() ?? destination;
  character.moveTargetX = next.x;
  character.moveTargetY = next.y;
  character.moveTargetLocalX = route.length === 0 ? character.moveEndLocalX ?? .5 : .5;
  character.movePath = route;
  character.moveDuration = movementDuration(
    state,
    character.moveFromX,
    character.moveFromY,
    character.moveTargetX,
    character.moveTargetY,
    character.moveFromLocalX,
    character.moveTargetLocalX,
  ) * durationFactor;
  character.phaseRemaining = character.moveDuration;
}

export function removeCell(state: GameState, cellId: string): boolean {
  const cell = state.cells.find((candidate) => candidate.id === cellId);
  if (!cell || cell.type === "entrance" || cell.type === "stairs") return false;

  const removedBartenderIds = new Set(
    state.bartenders.filter((bartender) => bartender.homeTapCellId === cellId).map((bartender) => bartender.id),
  );
  const disruptedBartenderIds = new Set(
    state.bartenders.filter((bartender) => bartender.tapCellId === cellId).map((bartender) => bartender.id),
  );
  const removedWaiterIds = new Set(
    state.waiters.filter((waiter) => waiter.homeStationCellId === cellId).map((waiter) => waiter.id),
  );
  const removedCustomerIds = new Set(
    state.customers
      .filter((customer) =>
        customer.targetCellId === cellId ||
        (customer.bartenderId !== null && (removedBartenderIds.has(customer.bartenderId) || disruptedBartenderIds.has(customer.bartenderId))) ||
        (customer.waiterId !== null && removedWaiterIds.has(customer.waiterId)),
      )
      .map((customer) => customer.id),
  );
  for (const bartender of state.bartenders) {
    if (bartender.customerId && removedCustomerIds.has(bartender.customerId)) resetBartender(bartender);
  }
  for (const waiter of state.waiters) {
    if (waiter.customerId && removedCustomerIds.has(waiter.customerId)) resetWaiter(waiter);
  }

  state.customers = state.customers.filter((customer) => !removedCustomerIds.has(customer.id));
  state.bartenders = state.bartenders.filter((bartender) => !removedBartenderIds.has(bartender.id));
  state.waiters = state.waiters.filter((waiter) => !removedWaiterIds.has(waiter.id));
  state.cells = state.cells.filter((candidate) => candidate.id !== cellId);
  for (const shiftedCell of state.cells) {
    if (shiftedCell.y === cell.y && shiftedCell.x > cell.x) shiftedCell.x -= 1;
  }
  for (const customer of state.customers) compactCharacterRoute(state, customer, cell.y, cell.x);
  for (const bartender of state.bartenders) compactCharacterRoute(state, bartender, cell.y, cell.x, bartender.speedFactor);
  for (const waiter of state.waiters) compactCharacterRoute(state, waiter, cell.y, cell.x);
  state.cells.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const category of new Set(DRINKS.map((drink) => drink.category))) {
    while (state.menu.filter((id) => getDrink(id)?.category === category).length > menuCapacity(state, category)) {
      const lastSelected = [...state.menu].reverse().find((id) => getDrink(id)?.category === category);
      if (!lastSelected) break;
      toggleMenuItem(state, lastSelected);
    }
  }
  state.money += cellRefund(cell.level);
  syncPersonnel(state);
  reconcileStaffRooms(state);
  return true;
}

export function upgradeCell(state: GameState, cellId: string): boolean {
  const cell = state.cells.find((candidate) => candidate.id === cellId);
  if (!cell || cell.type === "entrance" || cell.type === "stairs" || cell.level >= CONFIG.maxCellLevel) return false;
  if (!isCellUpgradeTierUnlocked(state, cell.type, cell.level + 1)) return false;
  const cost = upgradeCostForLevel(cell.level + 1);
  if (state.money < cost) return false;
  state.money -= cost;
  cell.level += 1;
  syncPersonnel(state);
  return true;
}

export function upgradeCostForLevel(level: number): number {
  return CONFIG.upgradeCost + CONFIG.upgradeCostIncrease * (level - 1);
}

export function cellRefund(level: number): number {
  const upgrades = level - 1;
  return CONFIG.buildCost + upgrades * CONFIG.upgradeCost + CONFIG.upgradeCostIncrease * upgrades * (upgrades + 1) / 2;
}

export function toggleMenuItem(state: GameState, drinkId: string): boolean {
  const drink = getDrink(drinkId);
  if (!drink) return false;
  const index = state.menu.indexOf(drinkId);
  if (index < 0 && !isDrinkUnlocked(state, drinkId)) return false;
  if (index >= 0) {
    state.menu.splice(index, 1);
    for (const customer of state.customers) {
      const orderCompleted = [
        "moving-table",
        "waiting-table",
        "drinking",
        "exiting",
      ].includes(customer.phase);
      if (customer.orderId === drinkId && !orderCompleted) {
        const wasMoving = customer.phase.startsWith("moving-");
        customer.phase = "exiting";
        customer.targetCellId = "cell-0";
        customer.slotIndex = null;
        customer.bartenderId = null;
        customer.waiterId = null;
        if (wasMoving) {
          customer.movePath = findRoute(state, customer.moveTargetX, customer.moveTargetY, 0, 0)
            .slice(1)
            .map(({ x, y }) => ({ x, y }));
          customer.moveEndLocalX = .5;
          continue;
        }
        const atCell = state.cells.some((cell) => cell.x === customer.x && cell.y === customer.y);
        const anchorX = atCell ? customer.x : customer.moveTargetX;
        const anchorY = atCell ? customer.y : customer.moveTargetY;
        const route = findRoute(state, anchorX, anchorY, 0, 0).map(({ x, y }) => ({ x, y }));
        if (atCell) route.shift();
        const next = route.shift() ?? { x: 0, y: 0 };
        customer.moveFromX = customer.x;
        customer.moveFromY = customer.y;
        customer.moveTargetX = next.x;
        customer.moveTargetY = next.y;
        customer.moveFromLocalX = customer.localX ?? .5;
        customer.moveTargetLocalX = .5;
        customer.moveEndLocalX = .5;
        customer.moveDuration = movementDuration(
          state,
          customer.x,
          customer.y,
          next.x,
          next.y,
          customer.moveFromLocalX,
          customer.moveTargetLocalX,
        );
        customer.movePath = route;
        customer.phaseRemaining = customer.moveDuration;
      }
    }
    for (const bartender of state.bartenders) {
      const customer = state.customers.find((item) => item.id === bartender.customerId);
      if (!customer || customer.phase === "exiting") resetBartender(bartender);
    }
    for (const waiter of state.waiters) {
      const customer = state.customers.find((item) => item.id === waiter.customerId);
      if (!customer || customer.phase === "exiting") resetWaiter(waiter);
    }
  } else {
    const selected = state.menu.filter((id) => getDrink(id)?.category === drink.category).length;
    if (selected >= menuCapacity(state, drink.category)) return false;
    state.menu.push(drinkId);
  }
  return true;
}

export function resetWaiter(waiter: GameState["waiters"][number]): void {
  waiter.phase = "idle";
  waiter.phaseRemaining = 0;
  waiter.customerId = null;
}

export function resetBartender(bartender: GameState["bartenders"][number]): void {
  bartender.phase = "idle";
  bartender.phaseRemaining = 0;
  bartender.customerId = null;
  bartender.tapCellId = null;
  bartender.tapSlot = null;
}

export function reconcileStaffRooms(state: GameState): void {
  const removedCustomerIds = new Set<string>();
  for (const bartender of state.bartenders) {
    if (!bartender.customerId) continue;
    const customer = state.customers.find((item) => item.id === bartender.customerId);
    const home = getCell(state, bartender.homeTapCellId);
    const target = getCell(state, customer?.targetCellId ?? null);
    if (!customer || !cellsShareRoom(state, home, target) || (bartender.tapCellId !== null && bartender.tapCellId !== bartender.homeTapCellId)) {
      if (customer) removedCustomerIds.add(customer.id);
      resetBartender(bartender);
    }
  }
  for (const waiter of state.waiters) {
    if (!waiter.customerId) continue;
    const customer = state.customers.find((item) => item.id === waiter.customerId);
    if (!customer || !cellsShareRoom(state, getCell(state, waiter.homeStationCellId), getCell(state, customer?.targetCellId ?? null))) {
      if (customer) removedCustomerIds.add(customer.id);
      resetWaiter(waiter);
    }
  }
  if (removedCustomerIds.size === 0) return;
  state.customers = state.customers.filter((customer) => !removedCustomerIds.has(customer.id));
  for (const bartender of state.bartenders) {
    if (bartender.customerId && removedCustomerIds.has(bartender.customerId)) resetBartender(bartender);
  }
  for (const waiter of state.waiters) {
    if (waiter.customerId && removedCustomerIds.has(waiter.customerId)) resetWaiter(waiter);
  }
}
