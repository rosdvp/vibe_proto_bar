import { CONFIG, CUSTOMER_TYPES, DRINKS } from "../config";
import { cellWidth, movementDuration } from "../geometry";
import type {
  ActivityType,
  ExtraActivity,
  Bartender,
  Cell,
  Customer,
  CustomerPhase,
  GameState,
  RandomSource,
  Waiter,
} from "../types";
import { findRoute } from "./navigation";
import { chooseOrderId, isCustomerTypeUnlocked, reconcileStaffRooms, resetBartender, resetWaiter } from "./progression";
import { recordCustomerPayment, recordActivityIncome } from "./quests";
import {
  cellCapacity,
  cellBonusPercent,
  workSpeedBonusPercent,
  getCell,
  getCustomerType,
  getDrink,
  barRating,
  customersPerMinute,
  cellsShareRoom,
  cellsInRoom,
  tapCapacity,
  equipmentIssue,
  extraUsePrice,
} from "./selectors";

const MOVING_CUSTOMER_PHASES = new Set<CustomerPhase>([
  "moving-counter",
  "moving-table",
  "moving-extra",
  "exiting",
]);

interface TapAssignment {
  cell: Cell;
  slot: number;
  drinkId: string;
}

function occupiedSlots(state: GameState, cellId: string, phases: CustomerPhase[]): Set<number> {
  return new Set(
    state.customers
      .filter(
        (customer) =>
          customer.targetCellId === cellId &&
          customer.slotIndex !== null &&
          phases.includes(customer.phase),
      )
      .map((customer) => customer.slotIndex as number),
  );
}

function firstFreeSlot(capacity: number, occupied: Set<number>): number | null {
  for (let index = 0; index < capacity; index += 1) {
    if (!occupied.has(index)) return index;
  }
  return null;
}

function chooseCell(
  state: GameState,
  type: "counter" | "table" | "toilet-stall" | "sink" | "hand-dryer" | "darts" | "billiards",
  fromX: number,
  fromY: number,
  random: RandomSource = Math.random,
  roomOrigin?: Cell,
): { cell: Cell; slot: number | null } | null {
  const cells = state.cells.filter((cell) => cell.type === type && (!roomOrigin || cellsShareRoom(state, cell, roomOrigin)));
  const phases: CustomerPhase[] = type === "counter"
    ? ["moving-counter", "waiting-bartender", "waiting-drink", "drinking"]
    : type === "table" ? ["moving-table", "waiting-waiter", "waiting-drink", "waiting-delivery", "drinking"]
    : ["moving-extra", "using-extra"];
  const ranked = cells.map((cell) => {
    const capacity = cellCapacity(cell);
    const occupied = occupiedSlots(state, cell.id, phases);
    const slot = firstFreeSlot(capacity, occupied);
    const waiting = state.customers.filter(
      (customer) =>
        customer.targetCellId === cell.id &&
        (customer.phase === "waiting-extra" || customer.phase === `waiting-${type}` ||
          (type === "counter" && customer.phase === "waiting-counter")),
    ).length;
    return { cell, slot, waiting, distance: routeDistance(state, fromX, fromY, cell.x, cell.y), capacity };
  }).filter((item) => item.capacity > 0);
  ranked.sort(
    (a, b) =>
      Number(a.slot === null) - Number(b.slot === null) ||
      (a.slot === null ? a.waiting - b.waiting : 0) ||
      a.distance - b.distance ||
      a.cell.y - b.cell.y || a.cell.x - b.cell.x,
  );
  const first = ranked[0];
  if (!first) return null;
  const tied = ranked.filter(
    (item) =>
      (item.slot === null) === (first.slot === null) &&
      (item.slot !== null || item.waiting === first.waiting) &&
      item.distance === first.distance,
  );
  const selected = tied[Math.floor(random() * tied.length)] ?? first;
  return selected ? { cell: selected.cell, slot: selected.slot } : null;
}

function tapAssignments(state: GameState): TapAssignment[] {
  const assignments: TapAssignment[] = [];
  const taps = state.cells.filter((cell) => cell.type === "taps").sort((a, b) => a.y - b.y || a.x - b.x);
  for (const category of ["keg", "bottle"] as const) {
    const drinks = state.menu.filter((id) => getDrink(id)?.category === category);
    let drinkIndex = 0;
    for (const cell of taps) {
      const count = tapCapacity(cell, category);
      for (let slot = 0; slot < count && drinkIndex < drinks.length; slot += 1) {
        const drinkId = drinks[drinkIndex++];
        if (drinkId) assignments.push({ cell, slot: category === "keg" ? slot : tapCapacity(cell, "keg") + slot, drinkId });
      }
    }
  }
  return assignments;
}

function tapBusy(state: GameState, cellId: string): boolean {
  return state.bartenders.some(
    (bartender) =>
      bartender.tapCellId === cellId &&
      (bartender.phase === "moving-taps" || bartender.phase === "pouring"),
  );
}

function serviceLocalX(cell: Cell, slot: number | null): number {
  return seatLocalX(cell, slot);
}

function routeDistance(state: GameState, fromX: number, fromY: number, targetX: number, targetY: number): number {
  const route = findRoute(state, fromX, fromY, targetX, targetY);
  return route.length > 0 ? route.length - 1 : Number.POSITIVE_INFINITY;
}

function moveDuration(
  state: GameState,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  fromLocalX: number,
  targetLocalX: number,
): number {
  return movementDuration(state, fromX, fromY, targetX, targetY, fromLocalX, targetLocalX);
}

function seatLocalX(cell: Cell, slot: number | null): number {
  if (cell.type === "table" && slot !== null) return (slot * 2 + .5) / 3;
  if (cell.type === "billiards" && slot !== null) return slot === 0 ? .12 : .88;
  const capacity = cellCapacity(cell);
  return slot === null || capacity === 0 ? .5 : (slot + .5) / capacity;
}

function startCustomerMove(
  state: GameState,
  customer: Customer,
  targetX: number,
  targetY: number,
  phase: CustomerPhase,
  targetLocalX = .5,
): void {
  const fromLocalX = customer.localX ?? .5;
  customer.phase = phase;
  customer.moveFromX = customer.x;
  customer.moveFromY = customer.y;
  customer.movePath = findRoute(state, customer.x, customer.y, targetX, targetY).slice(1).map(({ x, y }) => ({ x, y }));
  const next = customer.movePath.shift() ?? { x: targetX, y: targetY };
  customer.moveTargetX = next.x;
  customer.moveTargetY = next.y;
  customer.moveFromLocalX = fromLocalX;
  customer.moveEndLocalX = targetLocalX;
  customer.moveTargetLocalX = customer.movePath.length === 0 ? targetLocalX : .5;
  customer.moveDuration = moveDuration(state, customer.x, customer.y, next.x, next.y, fromLocalX, customer.moveTargetLocalX);
  customer.phaseRemaining = customer.moveDuration;
}

function startBartenderMove(
  state: GameState,
  bartender: Bartender,
  targetX: number,
  targetY: number,
  phase: Bartender["phase"],
  targetLocalX = .5,
): void {
  const fromLocalX = bartender.localX ?? .5;
  bartender.phase = phase;
  bartender.moveFromX = bartender.x;
  bartender.moveFromY = bartender.y;
  bartender.movePath = findRoute(state, bartender.x, bartender.y, targetX, targetY).slice(1).map(({ x, y }) => ({ x, y }));
  const next = bartender.movePath.shift() ?? { x: targetX, y: targetY };
  bartender.moveTargetX = next.x;
  bartender.moveTargetY = next.y;
  bartender.moveFromLocalX = fromLocalX;
  bartender.moveEndLocalX = targetLocalX;
  bartender.moveTargetLocalX = bartender.movePath.length === 0 ? targetLocalX : .5;
  bartender.moveDuration = moveDuration(state, bartender.x, bartender.y, next.x, next.y, fromLocalX, bartender.moveTargetLocalX) * bartender.speedFactor;
  bartender.phaseRemaining = bartender.moveDuration;
}

function startWaiterMove(
  state: GameState,
  waiter: Waiter,
  targetX: number,
  targetY: number,
  phase: Waiter["phase"],
  targetLocalX = .5,
): void {
  const fromLocalX = waiter.localX ?? .5;
  waiter.phase = phase;
  waiter.moveFromX = waiter.x;
  waiter.moveFromY = waiter.y;
  waiter.movePath = findRoute(state, waiter.x, waiter.y, targetX, targetY).slice(1).map(({ x, y }) => ({ x, y }));
  const next = waiter.movePath.shift() ?? { x: targetX, y: targetY };
  waiter.moveTargetX = next.x;
  waiter.moveTargetY = next.y;
  waiter.moveFromLocalX = fromLocalX;
  waiter.moveEndLocalX = targetLocalX;
  waiter.moveTargetLocalX = waiter.movePath.length === 0 ? targetLocalX : .5;
  waiter.moveDuration = moveDuration(state, waiter.x, waiter.y, next.x, next.y, fromLocalX, waiter.moveTargetLocalX) * waiter.speedFactor;
  waiter.phaseRemaining = waiter.moveDuration;
}

function activityWaiting(state: GameState, activity: ActivityType): number {
  return state.customers.filter(
    (customer) =>
      customer.activity === activity &&
      ["waiting-counter", "waiting-bartender", "waiting-waiter", "waiting-table"].includes(customer.phase),
  ).length;
}

function activityHasFreePlace(state: GameState, activity: ActivityType): boolean {
  if (activity === "toilet" || activity === "darts" || activity === "billiards") {
    const type = activity === "toilet" ? "toilet-stall" : activity;
    return state.cells.some((cell) => cell.type === type && occupiedSlots(state, cell.id, ["moving-extra", "using-extra"]).size < cellCapacity(cell));
  }
  if (activity === "table") {
    return state.cells.some((cell) => cell.type === "table" && occupiedSlots(state, cell.id, ["moving-table", "waiting-waiter", "waiting-drink", "waiting-delivery", "drinking"]).size < cellCapacity(cell));
  }
  const type = "counter";
  return state.cells.some((cell) => {
    if (cell.type !== type) return false;
    const phases: CustomerPhase[] = activity === "counter"
      ? ["moving-counter", "waiting-bartender", "waiting-drink", "drinking"]
      : ["moving-table", "drinking"];
    return occupiedSlots(state, cell.id, phases).size < cellCapacity(cell);
  });
}

function chooseActivity(
  state: GameState,
  mandatory: ActivityType | undefined,
  priority: ActivityType | undefined,
  random: RandomSource,
): ActivityType | null {
  const available: ActivityType[] = [];
  if (state.cells.some((cell) => cell.type === "counter")) available.push("counter");
  if (state.cells.some((cell) => cell.type === "table") && state.cells.some((cell) => cell.type === "waiter-station")) available.push("table");
  if (mandatory) return mandatory;
  if (priority && available.includes(priority) && activityHasFreePlace(state, priority)) return priority;
  const free = available.filter((activity) => activityHasFreePlace(state, activity));
  const alternatives = priority ? available.filter((activity) => activity !== priority) : available;
  const freeAlternatives = free.filter((activity) => activity !== priority);
  const choices = freeAlternatives.length > 0 ? freeAlternatives : alternatives.length > 0 ? alternatives : available;
  if (choices.length === 0) return null;
  const minimum = Math.min(...choices.map((activity) => activityWaiting(state, activity)));
  const leastBusy = choices.filter((activity) => activityWaiting(state, activity) === minimum);
  return leastBusy[Math.floor(random() * leastBusy.length)] ?? leastBusy[0] ?? null;
}

function spawnCustomer(state: GameState, typeId: string, random: RandomSource): boolean {
  const type = getCustomerType(typeId);
  if (!type) return false;
  const orderId = chooseOrderId(state, type, random);
  const activity = chooseActivity(state, type.mandatoryActivity, type.priorityActivity, random);
  if (!orderId) return false;
  const customer: Customer = {
    id: `customer-${state.nextEntityId++}`,
    typeId,
    x: 0,
    y: 0,
    phase: activity === null ? "waiting-activity" : activity === "counter" ? "moving-counter" : "moving-table",
    phaseRemaining: 0,
    moveFromX: 0,
    moveFromY: 0,
    moveTargetX: 0,
    moveTargetY: 0,
    moveDuration: 0,
    movePath: [],
    localX: .5,
    moveFromLocalX: .5,
    moveTargetLocalX: .5,
    moveEndLocalX: .5,
    activity,
    targetCellId: null,
    slotIndex: null,
    orderId,
    orderTapCellId: null,
    bartenderId: null,
    waiterId: null,
    waitingElapsed: 0,
    waitingDirection: 1,
    visitedExtras: [],
    repeatOrdered: false,
    toiletBonus: 0,
  };
  state.customers.push(customer);
  if (activity === null) {
    customer.targetCellId = "cell-0";
  } else if (activity === "counter") {
    const target = chooseCell(state, "counter", 0, 0, random);
    if (!target) {
      state.customers.pop();
      return false;
    }
    customer.targetCellId = target.cell.id;
    customer.slotIndex = target.slot;
    startCustomerMove(state, customer, target.cell.x, target.cell.y, "moving-counter", seatLocalX(target.cell, target.slot));
  } else {
    const table = chooseCell(state, "table", 0, 0, random);
    if (!table) {
      customer.targetCellId = "cell-0";
      customer.phase = "waiting-table";
      return true;
    }
    customer.targetCellId = table.cell.id;
    customer.slotIndex = table.slot;
    startCustomerMove(state, customer, table.cell.x, table.cell.y, "moving-table", seatLocalX(table.cell, table.slot));
  }
  return true;
}

export function customerArrivalInterval(rating: number): number {
  return 60 / customersPerMinute(rating);
}

export function nextCustomerRateMilestone(rating: number): { ratingRemaining: number; customersPerMinute: number; isMaximum: boolean } {
  const maximumRating = CONFIG.customerRatePoints[CONFIG.customerRatePoints.length - 1]!.rating;
  const boundedRating = Math.min(maximumRating, Math.max(0, rating));
  const currentRate = customersPerMinute(boundedRating);
  const maximumRate = customersPerMinute(maximumRating);
  if (currentRate >= maximumRate) {
    return { ratingRemaining: 0, customersPerMinute: Math.floor(maximumRate), isMaximum: true };
  }

  const nextRate = Math.floor(currentRate + Number.EPSILON) + 1;
  let ratingForNextRate: number = maximumRating;
  for (let candidate = Math.floor(boundedRating) + 1; candidate <= maximumRating; candidate += 1) {
    if (customersPerMinute(candidate) + Number.EPSILON >= nextRate) {
      ratingForNextRate = candidate;
      break;
    }
  }
  return {
    ratingRemaining: ratingForNextRate - boundedRating,
    customersPerMinute: nextRate,
    isMaximum: false,
  };
}

export function customerArrivalChances(state: GameState): Record<string, number> {
  const eligibleTypes = CUSTOMER_TYPES.filter((type) => isCustomerTypeUnlocked(state, type));
  const totalWeight = eligibleTypes.reduce((sum, type) => sum + type.arrivalWeight, 0);
  return Object.fromEntries(CUSTOMER_TYPES.map((type) => [
    type.id,
    totalWeight > 0 && eligibleTypes.includes(type) ? type.arrivalWeight / totalWeight : 0,
  ]));
}

function trySpawnArrivingCustomer(state: GameState, random: RandomSource): void {
  const eligibleTypes = CUSTOMER_TYPES.filter((type) => isCustomerTypeUnlocked(state, type));
  if (eligibleTypes.length === 0) return;
  const totalWeight = eligibleTypes.reduce((sum, type) => sum + type.arrivalWeight, 0);
  let roll = random() * totalWeight;
  const selected = eligibleTypes.find((type) => {
    roll -= type.arrivalWeight;
    return roll < 0;
  }) ?? eligibleTypes[eligibleTypes.length - 1];
  if (selected) spawnCustomer(state, selected.id, random);
}

function advanceCustomerArrivals(state: GameState, seconds: number, random: RandomSource): void {
  const newlyUnlocked = CUSTOMER_TYPES.filter(
    (type) => isCustomerTypeUnlocked(state, type) && !state.everUnlockedCustomerTypeIds.includes(type.id),
  );
  for (const type of newlyUnlocked) {
    state.everUnlockedCustomerTypeIds.push(type.id);
    spawnCustomer(state, type.id, random);
  }
  const rating = barRating(state);
  const interval = customerArrivalInterval(rating);
  if (state.customerArrivalRating !== rating) {
    state.customerArrivalRating = rating;
    state.customerArrivalRemaining = interval;
  }
  state.customerArrivalRemaining -= seconds;
  while (state.customerArrivalRemaining <= 0) {
    trySpawnArrivingCustomer(state, random);
    state.customerArrivalRemaining += interval;
  }
}

function chooseExtraActivity(state: GameState, customer: Customer, random: RandomSource): ExtraActivity | null {
  const choices: ExtraActivity[] = [];
  for (const activity of ["toilet", "darts", "billiards"] as const) {
    if (customer.visitedExtras?.includes(activity)) continue;
    const type = activity === "toilet" ? "toilet-stall" : activity;
    if (!state.cells.some((cell) => cell.type === type)) continue;
    if (random() < (activityHasFreePlace(state, activity) ? CONFIG.extraChanceFree : CONFIG.extraChanceBusy)) choices.push(activity);
  }
  return choices.length ? choices[Math.floor(random() * choices.length)] ?? null : null;
}

function startExtraStage(state: GameState, customer: Customer, type: "toilet-stall" | "sink" | "hand-dryer" | "darts" | "billiards", random: RandomSource, roomOrigin?: Cell): boolean {
  const target = chooseCell(state, type, customer.x, customer.y, random, roomOrigin);
  if (!target) return false;
  customer.targetCellId = target.cell.id;
  customer.slotIndex = target.slot;
  customer.waitingElapsed = 0;
  startCustomerMove(state, customer, target.cell.x, target.cell.y, "moving-extra", seatLocalX(target.cell, target.slot));
  return true;
}

function startPrimaryAgain(state: GameState, customer: Customer, random: RandomSource): boolean {
  const type = getCustomerType(customer.typeId);
  const orderId = type && chooseOrderId(state, type, random);
  const activity = chooseActivity(state, type?.mandatoryActivity, type?.priorityActivity, random);
  if (!orderId || (activity !== "counter" && activity !== "table")) return false;
  const target = chooseCell(state, activity, customer.x, customer.y, random);
  if (!target) return false;
  customer.activity = activity;
  customer.orderId = orderId;
  customer.targetCellId = target.cell.id;
  customer.slotIndex = target.slot;
  customer.waitingElapsed = 0;
  startCustomerMove(state, customer, target.cell.x, target.cell.y, activity === "counter" ? "moving-counter" : "moving-table", seatLocalX(target.cell, target.slot));
  return true;
}

function finishPrimary(state: GameState, customer: Customer, random: RandomSource): void {
  customer.slotIndex = null;
  customer.targetCellId = null;
  const extra = chooseExtraActivity(state, customer, random);
  if (extra) {
    customer.activity = extra;
    customer.visitedExtras = [...(customer.visitedExtras ?? []), extra];
    if (startExtraStage(state, customer, extra === "toilet" ? "toilet-stall" : extra, random)) return;
  }
  customer.targetCellId = "cell-0";
  startCustomerMove(state, customer, 0, 0, "exiting");
}

function finishExtraStage(state: GameState, customer: Customer, random: RandomSource): void {
  const cell = getCell(state, customer.targetCellId);
  customer.slotIndex = null;
  if (customer.activity === "toilet" && cell) {
    customer.toiletBonus = (customer.toiletBonus ?? 0) + cellBonusPercent(cell.level);
    const room = cellsInRoom(state, cell);
    const nextTypes = cell.type === "toilet-stall" ? ["sink", "hand-dryer"] as const : cell.type === "sink" ? ["hand-dryer"] as const : [];
    for (const type of nextTypes) {
      if (room.some((item) => item.type === type) && startExtraStage(state, customer, type, random, cell)) return;
    }
    if (!(customer.repeatOrdered ?? false) && random() < Math.min(1, (customer.toiletBonus ?? 0) / 100)) {
      customer.repeatOrdered = true;
      if (startPrimaryAgain(state, customer, random)) return;
    }
  } else if ((cell?.type === "darts" || cell?.type === "billiards") && customer.activity === cell.type) {
    const amount = extraUsePrice(cell);
    state.money += amount;
    recordActivityIncome(state, amount);
    const events = paymentEvents.get(state) ?? [];
    events.push({ amount, x: customer.x, y: customer.y, localX: customer.localX ?? .5 });
    paymentEvents.set(state, events);
  }
  finishPrimary(state, customer, random);
}

const PLACE_WAITING_PHASES = new Set<CustomerPhase>(["waiting-activity", "waiting-counter", "waiting-table", "waiting-extra"]);

function startExiting(state: GameState, customer: Customer): void {
  if (customer.bartenderId) {
    const bartender = state.bartenders.find((item) => item.id === customer.bartenderId);
    if (bartender) resetBartender(bartender);
  }
  if (customer.waiterId) {
    const waiter = state.waiters.find((item) => item.id === customer.waiterId);
    if (waiter) resetWaiter(waiter);
  }
  customer.bartenderId = null;
  customer.waiterId = null;
  customer.slotIndex = null;
  customer.targetCellId = "cell-0";
  customer.waitingElapsed = 0;
  startCustomerMove(state, customer, 0, 0, "exiting");
}

function updateWaitingCustomer(state: GameState, customer: Customer, dt: number): void {
  customer.waitingElapsed += dt;
  if (customer.waitingElapsed >= CONFIG.customerWaitingTimeout) {
    startExiting(state, customer);
    return;
  }
  const target = getCell(state, customer.targetCellId);
  if (!target) return;
  const width = cellWidth(target) * CONFIG.baseCellWidth;
  const edge = Math.min(.5, 25 / width);
  let localX = (customer.localX ?? .5) + customer.waitingDirection * CONFIG.customerWaitingMoveSpeed * dt / width;
  if (localX >= 1 - edge) {
    localX = 1 - edge;
    customer.waitingDirection = -1;
  } else if (localX <= edge) {
    localX = edge;
    customer.waitingDirection = 1;
  }
  customer.localX = localX;
}

function updateCustomer(state: GameState, customer: Customer, dt: number, random: RandomSource): boolean {
  if (["moving-extra", "waiting-extra", "using-extra"].includes(customer.phase)) {
    const target = getCell(state, customer.targetCellId);
    if (!target || (customer.phase !== "moving-extra" && equipmentIssue(state, target))) { startExiting(state, customer); return true; }
  }
  if (MOVING_CUSTOMER_PHASES.has(customer.phase)) {
    customer.phaseRemaining = Math.max(0, customer.phaseRemaining - dt);
    const progress = customer.moveDuration === 0 ? 1 : 1 - customer.phaseRemaining / customer.moveDuration;
    customer.x = customer.moveFromX + (customer.moveTargetX - customer.moveFromX) * progress;
    customer.y = customer.moveFromY + (customer.moveTargetY - customer.moveFromY) * progress;
    if (customer.phaseRemaining > 0) return true;
    customer.x = customer.moveTargetX;
    customer.y = customer.moveTargetY;
    customer.localX = customer.moveTargetLocalX ?? .5;
    const next = customer.movePath.shift();
    if (next) {
      customer.moveFromX = customer.x;
      customer.moveFromY = customer.y;
      customer.moveTargetX = next.x;
    customer.moveTargetY = next.y;
      customer.moveFromLocalX = customer.localX;
      customer.moveTargetLocalX = customer.movePath.length === 0 ? customer.moveEndLocalX ?? .5 : .5;
      customer.moveDuration = moveDuration(state, customer.x, customer.y, next.x, next.y, customer.moveFromLocalX, customer.moveTargetLocalX);
      customer.phaseRemaining = customer.moveDuration;
      return true;
    }
    switch (customer.phase) {
      case "moving-counter":
        customer.phase = customer.slotIndex === null ? "waiting-counter" : "waiting-bartender";
        customer.waitingElapsed = 0;
        break;
      case "moving-table": customer.phase = customer.slotIndex === null ? "waiting-table" : "waiting-waiter"; customer.phaseRemaining = 0; customer.waitingElapsed = 0; break;
      case "moving-extra": customer.phase = customer.slotIndex === null ? "waiting-extra" : "using-extra"; customer.phaseRemaining = customer.slotIndex === null ? 0 : extraDuration(state, customer); customer.waitingElapsed = 0; break;
      case "exiting": return false;
    }
    return true;
  }

  if (PLACE_WAITING_PHASES.has(customer.phase) && customer.slotIndex === null) {
    updateWaitingCustomer(state, customer, dt);
    return true;
  }

  if (["waiting-bartender", "waiting-waiter", "waiting-drink"].includes(customer.phase)) {
    customer.waitingElapsed += dt;
  }

  if (customer.phase === "drinking") {
    customer.phaseRemaining = Math.max(0, customer.phaseRemaining - dt);
    if (customer.phaseRemaining > 0) return true;
    finishPrimary(state, customer, random);
  }
  if (customer.phase === "using-extra") {
    customer.phaseRemaining = Math.max(0, customer.phaseRemaining - dt);
    if (customer.phaseRemaining <= 0) finishExtraStage(state, customer, random);
  }
  return true;
}

function assignWaitingPlaces(state: GameState, random: RandomSource): void {
  const waiting = state.customers
    .filter((customer) => PLACE_WAITING_PHASES.has(customer.phase) && customer.slotIndex === null)
    .sort((a, b) => b.waitingElapsed - a.waitingElapsed);

  for (const customer of waiting) {
    if (customer.phase === "waiting-extra") {
      const cell = getCell(state, customer.targetCellId);
      if (!cell || !["toilet-stall", "sink", "hand-dryer", "darts", "billiards"].includes(cell.type)) { startExiting(state, customer); continue; }
      const slot = firstFreeSlot(cellCapacity(cell), occupiedSlots(state, cell.id, ["moving-extra", "using-extra"]));
      if (slot === null) continue;
      customer.slotIndex = slot;
      customer.waitingElapsed = 0;
      startCustomerMove(state, customer, cell.x, cell.y, "moving-extra", seatLocalX(cell, slot));
      continue;
    }
    if (customer.phase === "waiting-table") {
      const table = chooseCell(state, "table", customer.x, customer.y, random);
      if (!table || table.slot === null) continue;
      customer.targetCellId = table.cell.id;
      customer.slotIndex = table.slot;
      customer.waitingElapsed = 0;
      startCustomerMove(state, customer, table.cell.x, table.cell.y, "moving-table", seatLocalX(table.cell, table.slot));
      continue;
    }

    const type = getCustomerType(customer.typeId);
    if (!type) continue;
    const lockedActivity = type.mandatoryActivity;
    const activity = lockedActivity ?? chooseActivity(state, undefined, type.priorityActivity, random);
    if (!activity || !activityHasFreePlace(state, activity)) continue;

    if (activity === "counter") {
      const counter = chooseCell(state, "counter", customer.x, customer.y, random);
      if (!counter || counter.slot === null) continue;
      customer.activity = activity;
      customer.targetCellId = counter.cell.id;
      customer.slotIndex = counter.slot;
      customer.waitingElapsed = 0;
      startCustomerMove(state, customer, counter.cell.x, counter.cell.y, "moving-counter", seatLocalX(counter.cell, counter.slot));
    } else {
      const table = chooseCell(state, "table", customer.x, customer.y, random);
      if (!table || table.slot === null) continue;
      customer.activity = activity;
      customer.targetCellId = table.cell.id;
      customer.slotIndex = table.slot;
      customer.waitingElapsed = 0;
      startCustomerMove(state, customer, table.cell.x, table.cell.y, "moving-table", seatLocalX(table.cell, table.slot));
    }
  }
}

function assignBartenders(state: GameState, random: RandomSource): void {
  const waiting = state.customers.filter(
    (customer) =>
      (customer.phase === "waiting-bartender" ||
        (customer.phase === "waiting-drink" && customer.waiterId !== null)) &&
      customer.bartenderId === null,
  ).sort((a, b) => b.waitingElapsed - a.waitingElapsed);
  for (const bartender of state.bartenders.filter((item) => item.phase === "idle")) {
    const home = getCell(state, bartender.homeTapCellId);
    const index = waiting.findIndex((candidate) => cellsShareRoom(state, home, getCell(state, candidate.targetCellId)));
    const customer = index < 0 ? undefined : waiting.splice(index, 1)[0];
    if (!customer) continue;
    customer.bartenderId = bartender.id;
    bartender.customerId = customer.id;
    if (customer.activity === "table") {
      reserveTap(state, bartender, customer, random);
    } else {
      const target = getCell(state, customer.targetCellId);
      startBartenderMove(state, bartender, customer.x, customer.y, "moving-customer", target ? serviceLocalX(target, customer.slotIndex) : .5);
    }
  }
}

function reserveTap(
  state: GameState,
  bartender: Bartender,
  customer: Customer,
  random: RandomSource,
): boolean {
  if (!state.menu.includes(customer.orderId ?? "")) return false;
  const target = getCell(state, customer.targetCellId);
  const available = state.cells
    .filter((cell) => cell.id === bartender.homeTapCellId && !tapBusy(state, cell.id) && cellsShareRoom(state, cell, target))
    .map((cell) => ({
      cell,
      slot: 0,
      distance: routeDistance(state, bartender.x, bartender.y, cell.x, cell.y),
    }))
    .filter((item) => Number.isFinite(item.distance));
  const minimumDistance = Math.min(...available.map((item) => item.distance));
  const nearest = available.filter((item) => item.distance === minimumDistance);
  const tap = nearest[Math.floor(random() * nearest.length)];
  if (!tap) return false;
  bartender.tapCellId = tap.cell.id;
  customer.orderTapCellId = tap.cell.id;
  bartender.tapSlot = tap.slot;
  startBartenderMove(state, bartender, tap.cell.x, tap.cell.y, "moving-taps", .74);
  return true;
}

export interface PaymentEvent {
  amount: number;
  x: number;
  y: number;
  localX: number;
}

const paymentEvents = new WeakMap<GameState, PaymentEvent[]>();

function recordPayment(state: GameState, customer: Customer, amount: number): void {
  state.money += amount;
  recordCustomerPayment(state, customer.typeId, customer.orderId, amount);
  const events = paymentEvents.get(state) ?? [];
  events.push({ amount, x: customer.x, y: customer.y, localX: customer.localX ?? .5 });
  paymentEvents.set(state, events);
}

export function takePaymentEvents(state: GameState): PaymentEvent[] {
  const events = paymentEvents.get(state) ?? [];
  paymentEvents.delete(state);
  return events;
}

function consumptionDuration(cell: Cell | undefined): number {
  const speedBonus = cell?.type === "counter" || cell?.type === "table"
    ? workSpeedBonusPercent(cell.level)
    : 0;
  return CONFIG.drinkDuration / (1 + speedBonus / 100);
}

function extraDuration(state: GameState, customer: Customer): number {
  const cell = getCell(state, customer.targetCellId);
  if (!cell || !(cell.type in CONFIG.extraUseSeconds)) return 0;
  const type = cell.type as keyof typeof CONFIG.extraUseSeconds;
  return CONFIG.extraUseSeconds[type] / (1 + workSpeedBonusPercent(cell.level) / 100);
}

function completeDelivery(
  state: GameState,
  bartender: Bartender,
  customer: Customer,
  random: RandomSource,
): void {
  const drink = getDrink(customer.orderId);
  const orderCell = getCell(state, customer.targetCellId);
  const tap = getCell(state, bartender.homeTapCellId);
  const priceBonus = (orderCell?.type === "counter" ? cellBonusPercent(orderCell.level) : 0)
    + (tap?.type === "taps" ? cellBonusPercent(tap.level) : 0);
  if (drink) {
    recordPayment(state, customer, drink.price * (1 + priceBonus / 100));
  }
  customer.bartenderId = null;
  customer.phase = "drinking";
  customer.phaseRemaining = consumptionDuration(orderCell);
  resetBartender(bartender);
}

function waiterServiceLocalX(customer: Customer): number {
  const seatX = customer.localX ?? .5;
  return (seatX + .5) / 2;
}

function assignWaiterToCustomer(state: GameState, waiter: Waiter, customer: Customer): void {
  customer.waiterId = waiter.id;
  waiter.customerId = customer.id;
  startWaiterMove(state, waiter, customer.x, customer.y, "moving-customer", waiterServiceLocalX(customer));
}

function assignWaiters(state: GameState): void {
  const waiting = state.customers
    .filter((customer) => customer.phase === "waiting-waiter" && customer.waiterId === null)
    .sort((a, b) => b.waitingElapsed - a.waitingElapsed);
  for (const waiter of state.waiters.filter((item) => item.phase === "idle")) {
    const home = getCell(state, waiter.homeStationCellId);
    const index = waiting.findIndex((candidate) => cellsShareRoom(state, home, getCell(state, candidate.targetCellId)));
    const customer = index < 0 ? undefined : waiting.splice(index, 1)[0];
    if (!customer) continue;
    assignWaiterToCustomer(state, waiter, customer);
  }
}

function finishWaiterDelivery(state: GameState, waiter: Waiter, customer: Customer): void {
  const drink = getDrink(customer.orderId);
  const table = getCell(state, customer.targetCellId);
  const tap = getCell(state, customer.orderTapCellId ?? null);
  if (drink) {
    const priceBonus = (table?.type === "table" ? cellBonusPercent(table.level) : 0)
      + (tap?.type === "taps" ? cellBonusPercent(tap.level) : 0);
    recordPayment(state, customer, drink.price * (1 + priceBonus / 100));
  }
  customer.phase = "drinking";
  customer.phaseRemaining = consumptionDuration(table);
  customer.waitingElapsed = 0;
  customer.bartenderId = null;
  customer.waiterId = null;
  resetWaiter(waiter);
  const next = state.customers
    .filter((item) => item.phase === "waiting-waiter" && item.waiterId === null && cellsShareRoom(state, getCell(state, waiter.homeStationCellId), getCell(state, item.targetCellId)))
    .sort((a, b) => b.waitingElapsed - a.waitingElapsed)[0];
  if (next) {
    assignWaiterToCustomer(state, waiter, next);
    return;
  }
  const home = getCell(state, waiter.homeStationCellId);
  if (home) startWaiterMove(state, waiter, home.x, home.y, "returning-station", .5);
}

function updateWaiter(state: GameState, waiter: Waiter, dt: number): void {
  if (waiter.phase === "idle" || waiter.phase === "waiting-drink") return;
  const customer = state.customers.find((item) => item.id === waiter.customerId);
  if (!customer && waiter.phase !== "returning-station") {
    resetWaiter(waiter);
    return;
  }
  waiter.phaseRemaining = Math.max(0, waiter.phaseRemaining - dt);
  if (["moving-customer", "moving-station", "delivering", "returning-station"].includes(waiter.phase)) {
    const progress = waiter.moveDuration === 0 ? 1 : 1 - waiter.phaseRemaining / waiter.moveDuration;
    waiter.x = waiter.moveFromX + (waiter.moveTargetX - waiter.moveFromX) * progress;
    waiter.y = waiter.moveFromY + (waiter.moveTargetY - waiter.moveFromY) * progress;
  }
  if (waiter.phaseRemaining > 0) return;
  waiter.x = waiter.moveTargetX;
  waiter.y = waiter.moveTargetY;
  waiter.localX = waiter.moveTargetLocalX ?? .5;
  const next = waiter.movePath.shift();
  if (next) {
    waiter.moveFromX = waiter.x;
    waiter.moveFromY = waiter.y;
    waiter.moveTargetX = next.x;
    waiter.moveTargetY = next.y;
    waiter.moveFromLocalX = waiter.localX;
    waiter.moveTargetLocalX = waiter.movePath.length === 0 ? waiter.moveEndLocalX ?? .5 : .5;
    waiter.moveDuration = moveDuration(state, waiter.x, waiter.y, next.x, next.y, waiter.moveFromLocalX, waiter.moveTargetLocalX) * waiter.speedFactor;
    waiter.phaseRemaining = waiter.moveDuration;
    return;
  }
  if (waiter.phase === "moving-customer" && customer) {
    waiter.phase = "listening";
    waiter.phaseRemaining = CONFIG.listenDuration * waiter.speedFactor;
  } else if (waiter.phase === "listening" && customer) {
    const home = getCell(state, waiter.homeStationCellId);
    if (home) startWaiterMove(state, waiter, home.x, home.y, "moving-station", .5);
  } else if (waiter.phase === "moving-station" && customer) {
    waiter.phase = "waiting-drink";
    customer.phase = "waiting-drink";
    customer.waitingElapsed = 0;
  } else if (waiter.phase === "delivering" && customer) {
    finishWaiterDelivery(state, waiter, customer);
  } else if (waiter.phase === "returning-station") {
    resetWaiter(waiter);
  }
}

function updateBartender(state: GameState, bartender: Bartender, dt: number, random: RandomSource): void {
  const customer = state.customers.find((item) => item.id === bartender.customerId);
  if (bartender.phase === "idle") return;
  if (!customer) {
    resetBartender(bartender);
    return;
  }
  if (bartender.phase === "listening" && bartender.phaseRemaining <= 0 && customer) {
    reserveTap(state, bartender, customer, random);
    return;
  }
  bartender.phaseRemaining = Math.max(0, bartender.phaseRemaining - dt);
  if (["moving-customer", "moving-taps", "returning"].includes(bartender.phase)) {
    const progress = bartender.moveDuration === 0 ? 1 : 1 - bartender.phaseRemaining / bartender.moveDuration;
    bartender.x = bartender.moveFromX + (bartender.moveTargetX - bartender.moveFromX) * progress;
    bartender.y = bartender.moveFromY + (bartender.moveTargetY - bartender.moveFromY) * progress;
  }
  if (bartender.phaseRemaining > 0) return;
  bartender.x = bartender.moveTargetX;
  bartender.y = bartender.moveTargetY;
  bartender.localX = bartender.moveTargetLocalX ?? .5;
  const next = bartender.movePath.shift();
  if (next) {
    bartender.moveFromX = bartender.x;
    bartender.moveFromY = bartender.y;
    bartender.moveTargetX = next.x;
    bartender.moveTargetY = next.y;
    bartender.moveFromLocalX = bartender.localX;
    bartender.moveTargetLocalX = bartender.movePath.length === 0 ? bartender.moveEndLocalX ?? .5 : .5;
    bartender.moveDuration = moveDuration(state, bartender.x, bartender.y, next.x, next.y, bartender.moveFromLocalX, bartender.moveTargetLocalX) * bartender.speedFactor;
    bartender.phaseRemaining = bartender.moveDuration;
    return;
  }
  if (bartender.phase === "moving-customer" && customer) {
    customer.phase = "waiting-drink";
    bartender.phase = "listening";
    bartender.phaseRemaining = CONFIG.listenDuration * bartender.speedFactor;
  } else if (bartender.phase === "listening" && customer) {
    reserveTap(state, bartender, customer, random);
  } else if (bartender.phase === "moving-taps") {
    bartender.phase = "pouring";
    bartender.phaseRemaining = CONFIG.pourDuration * bartender.speedFactor;
  } else if (bartender.phase === "pouring" && customer) {
    if (customer.activity === "table" && customer.waiterId) {
      const waiter = state.waiters.find((item) => item.id === customer.waiterId);
      const station = waiter ? getCell(state, waiter.homeStationCellId) : undefined;
      if (waiter && station) startBartenderMove(state, bartender, station.x, station.y, "returning", .5);
      else resetBartender(bartender);
    } else {
      const target = getCell(state, customer.targetCellId);
      startBartenderMove(state, bartender, customer.x, customer.y, "returning", target ? serviceLocalX(target, customer.slotIndex) : .5);
    }
  } else if (bartender.phase === "returning" && customer) {
    if (customer.activity === "table" && customer.waiterId) {
      const waiter = state.waiters.find((item) => item.id === customer.waiterId);
      resetBartender(bartender);
      customer.bartenderId = null;
      if (waiter) {
        customer.phase = "waiting-delivery";
        startWaiterMove(state, waiter, customer.x, customer.y, "delivering", seatLocalX(getCell(state, customer.targetCellId) ?? { id: "", x: 0, y: 0, type: "table", level: 1 }, customer.slotIndex));
      }
    } else {
      completeDelivery(state, bartender, customer, random);
    }
  }
}

function step(state: GameState, dt: number, random: RandomSource): void {
  reconcileStaffRooms(state);
  const remainingCustomers: Customer[] = [];
  for (const customer of state.customers) {
    if (updateCustomer(state, customer, dt, random)) {
      remainingCustomers.push(customer);
    } else {
    }
  }
  state.customers = remainingCustomers;
  assignWaitingPlaces(state, random);
  for (const bartender of state.bartenders) updateBartender(state, bartender, dt, random);
  for (const waiter of state.waiters) updateWaiter(state, waiter, dt);
  assignWaiters(state);
  assignBartenders(state, random);
  advanceCustomerArrivals(state, dt, random);
}

export function advanceGame(
  state: GameState,
  realSeconds: number,
  random: RandomSource = Math.random,
): void {
  let remaining = Math.max(0, realSeconds * state.speed);
  while (remaining > 0) {
    const dt = Math.min(0.1, remaining);
    step(state, dt, random);
    remaining -= dt;
  }
}

export function tapLayout(state: GameState): TapAssignment[] {
  return tapAssignments(state);
}
