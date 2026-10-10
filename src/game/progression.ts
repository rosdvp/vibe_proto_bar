import { BUILDABLE_CELL_TYPES, CELL_DEFINITIONS, CONFIG, CUSTOMER_TYPES, DRINKS } from "../config";
import type {
  BuildableCellType,
  CellUpgradeResult,
  CustomerTypeDefinition,
  GameState,
  RandomSource,
  UnlockFeature,
} from "../types";
import { cellsShareRoom, getCell, getDrink } from "./selectors";
import { customerUpgradeCost, drinkChance, drinkUpgradeCost } from "./economy";
import { syncPersonnel } from "./personnel";
import { findRoute } from "./navigation";
import { movementDuration } from "../geometry";
import { cellTierIndex, isCellUpgradeTierUnlocked } from "./tiers";
import { unlockRandomDecor } from "./decor";
import { isFloorWidthBlocked, isNewFloorBlocked } from "./infrastructure";

export function isCustomerTypeUnlocked(state: GameState, type: CustomerTypeDefinition): boolean {
  if (type.id === "sailors" || state.everUnlockedCustomerTypeIds.includes(type.id)) return true;
  const requirement = type.requirement;
  if (!requirement) return true;
  if (requirement.kind === "drink-level") return (state.drinkLevels[requirement.drinkId] ?? 0) >= requirement.level;
  if (requirement.kind === "cell") return state.cells.some((cell) => cell.type === requirement.cellType);
  return requirement.cellTypes.every((cellType) => state.cells.some((cell) => cell.type === cellType));
}

export function unlockedByType(state: GameState): Record<string, boolean> {
  return Object.fromEntries(CUSTOMER_TYPES.map((type) => [type.id, isCustomerTypeUnlocked(state, type)]));
}

export function syncCustomerUnlocks(state: GameState): UnlockFeature[] {
  const unlocked: UnlockFeature[] = [];
  for (const type of CUSTOMER_TYPES) {
    if (state.everUnlockedCustomerTypeIds.includes(type.id) || !isCustomerTypeUnlocked(state, type)) continue;
    state.everUnlockedCustomerTypeIds.push(type.id);
    unlocked.push({ kind: "customer-type", id: type.id, name: type.name });
  }
  return unlocked;
}

export function isDrinkUnlocked(state: GameState, drinkId: string): boolean {
  return (state.drinkLevels[drinkId] ?? 0) > 0;
}

export function upgradeDrink(state: GameState, drinkId: string): boolean {
  const drink = getDrink(drinkId);
  if (!drink || !state.unlockedFeatureIds.includes("other:menu-screen")) return false;
  const nextLevel = (state.drinkLevels[drinkId] ?? 0) + 1;
  if (nextLevel > drink.maxLevel) return false;
  const cost = drinkUpgradeCost(drink, nextLevel);
  if (state.money < cost) return false;
  state.money -= cost;
  state.drinkLevels[drinkId] = nextLevel;
  return true;
}

export function upgradeCustomerType(state: GameState, typeId: string): boolean {
  const type = CUSTOMER_TYPES.find((item) => item.id === typeId);
  if (!type || !state.unlockedFeatureIds.includes("other:customers-screen") || !isCustomerTypeUnlocked(state, type)) return false;
  const nextLevel = (state.customerLevels[typeId] ?? 0) + 1;
  if (nextLevel > type.maxLevel) return false;
  const cost = customerUpgradeCost(type, nextLevel);
  if (state.money < cost) return false;
  state.money -= cost;
  state.customerLevels[typeId] = nextLevel;
  return true;
}

export function isCellTypeUnlocked(state: GameState, type: BuildableCellType): boolean {
  return state.unlockedFeatureIds.includes(`cell-type:${type}`);
}

export function unlockFeature(state: GameState, feature: UnlockFeature): boolean {
  const featureId = `${feature.kind}:${feature.id}`;
  if (state.unlockedFeatureIds.includes(featureId)) return false;
  if (feature.kind === "cell-type") {
    if (!BUILDABLE_CELL_TYPES.includes(feature.id)) return false;
  }
  state.unlockedFeatureIds.push(featureId);
  if (feature.kind === "other" && feature.id === "research-screen") {
    state.unseenUnlockIds.push(featureId);
  }
  return true;
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
  void type;
  return DRINKS.filter((drink) => isDrinkUnlocked(state, drink.id)).map((drink) => drink.id);
}

export function chooseOrderId(
  state: GameState,
  type: CustomerTypeDefinition,
  random: RandomSource,
): string | null {
  const ids = eligibleOrderIds(state, type);
  if (ids.length === 0) return null;
  let roll = random() * 100;
  for (const id of ids) {
    roll -= drinkChance(state, getDrink(id)!);
    if (roll < 0) return id;
  }
  return ids[ids.length - 1] ?? null;
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
  state.cells.push({ id: `cell-${state.nextEntityId++}`, x, y, type, level: 1, ...(type !== "stairs" ? { decorId: "classic" as const } : {}) });
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
  state.money += cellRefund(cell.level);
  syncPersonnel(state);
  reconcileStaffRooms(state);
  return true;
}

export function upgradeCell(state: GameState, cellId: string, random: RandomSource = Math.random): CellUpgradeResult {
  const failed: CellUpgradeResult = { success: false, unlocks: [] };
  const cell = state.cells.find((candidate) => candidate.id === cellId);
  if (!cell || cell.type === "entrance" || cell.type === "stairs" || cell.level >= CONFIG.maxCellLevel) return failed;
  if (!isCellUpgradeTierUnlocked(state, cell.type, cell.level + 1)) return failed;
  const cost = upgradeCostForLevel(cell.level + 1);
  if (state.money < cost) return failed;
  state.money -= cost;
  cell.level += 1;
  syncPersonnel(state);
  const nextDecorLevel = CONFIG.decorUnlockLevels[state.decor[cell.type].unlockedIds.length - 1];
  const unlock = cell.level === nextDecorLevel ? unlockRandomDecor(state, cell.type, random) : null;
  return { success: true, unlocks: unlock ? [unlock] : [] };
}

export function upgradeCostForLevel(level: number): number {
  const tierIndex = cellTierIndex(level);
  const tier = CONFIG.cellUpgradeTierMultipliers[tierIndex];
  return Math.ceil((CONFIG.cellUpgradeCostBase + level ** CONFIG.cellUpgradeCostStep) * tier);
}

export function cellRefund(level: number): number {
  let refund = CONFIG.buildCost;
  for (let purchasedLevel = 2; purchasedLevel <= level; purchasedLevel += 1) {
    refund += upgradeCostForLevel(purchasedLevel);
  }
  return refund;
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
