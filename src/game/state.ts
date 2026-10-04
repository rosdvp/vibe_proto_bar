import { BUILDABLE_CELL_TYPES, CELL_DEFINITIONS, CONFIG, CUSTOMER_TYPES, DRINKS, QUESTS } from "../config";
import type { GameState } from "../types";
import { syncPersonnel } from "./personnel";
import { RESEARCHES, researchDuration } from "./research";
import { isOfferState } from "./offers";
import { createDecorState, isDecorState } from "./decor";

const CELL_TYPES = new Set(["entrance", "counter", "taps", "waiter-station", "table", "stairs", "toilet-stall", "sink", "hand-dryer", "darts", "billiards"]);
const CUSTOMER_PHASES = new Set([
  "waiting-activity", "moving-counter", "waiting-counter", "waiting-bartender", "waiting-waiter",
  "waiting-drink", "waiting-delivery", "moving-table", "waiting-table", "drinking", "moving-extra", "waiting-extra", "using-extra", "exiting",
]);
const BARTENDER_PHASES = new Set([
  "idle", "moving-customer", "listening", "moving-taps", "pouring", "returning",
]);
const WAITER_PHASES = new Set([
  "idle", "moving-customer", "listening", "moving-station", "waiting-drink", "delivering", "returning-station",
]);

function hasNumber(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "number" && Number.isFinite(record[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isPath(value: unknown): boolean {
  return Array.isArray(value) && value.every((point) => isRecord(point) && hasNumber(point, "x") && hasNumber(point, "y"));
}

function isOptionalLocalX(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameState>;
  const holdValid = isRecord(state.hold) &&
    hasNumber(state.hold, "energy") && state.hold.energy >= 0 &&
    hasNumber(state.hold, "heat") && state.hold.heat >= 0 && state.hold.heat <= CONFIG.holdOverheatDuration &&
    hasNumber(state.hold, "cooldownRemaining") && state.hold.cooldownRemaining >= 0 &&
    hasNumber(state.hold, "rechargeElapsed") && state.hold.rechargeElapsed >= 0 && state.hold.rechargeElapsed < CONFIG.holdEnergyRechargeInterval &&
    hasNumber(state.hold, "consumptionElapsed") && state.hold.consumptionElapsed >= 0 && state.hold.consumptionElapsed < CONFIG.holdEnergySpendTick;
  const questsValid = isRecord(state.quests) &&
    hasNumber(state.quests, "currentIndex") && Number.isInteger(state.quests.currentIndex) && state.quests.currentIndex >= 0 && state.quests.currentIndex <= QUESTS.length &&
    hasNumber(state.quests, "incrementalProgress") && state.quests.incrementalProgress >= 0;
  const researchState = state.research;
  const researchValid = isRecord(researchState) &&
    (researchState.active === null || (isRecord(researchState.active) &&
      typeof researchState.active.id === "string" && RESEARCHES.some((item) => item.id === (researchState.active as Record<string, unknown>).id) &&
      hasNumber(researchState.active, "remaining") && researchState.active.remaining >= 0 &&
      researchState.active.remaining <= researchDuration(RESEARCHES.find((item) => item.id === researchState.active?.id)!))) &&
    Array.isArray(researchState.completedIds) && researchState.completedIds.every((id) => typeof id === "string" && RESEARCHES.some((item) => item.id === id));
  const cellsValid = Array.isArray(state.cells) && state.cells.every((cell) =>
    isRecord(cell) &&
    typeof cell.id === "string" &&
    hasNumber(cell, "x") &&
    hasNumber(cell, "y") &&
    typeof cell.type === "string" && CELL_TYPES.has(cell.type) &&
    hasNumber(cell, "level"),
  );
  const customersValid = Array.isArray(state.customers) && state.customers.every((customer) =>
    isRecord(customer) &&
    typeof customer.id === "string" &&
    typeof customer.typeId === "string" &&
    typeof customer.phase === "string" && CUSTOMER_PHASES.has(customer.phase) &&
    hasNumber(customer, "x") &&
    hasNumber(customer, "y") &&
    hasNumber(customer, "phaseRemaining") &&
    hasNumber(customer, "moveFromX") &&
    hasNumber(customer, "moveFromY") &&
    hasNumber(customer, "moveTargetX") &&
    hasNumber(customer, "moveTargetY") &&
    hasNumber(customer, "moveDuration") &&
    isPath(customer.movePath) &&
    isOptionalLocalX(customer, "localX") &&
    isOptionalLocalX(customer, "moveFromLocalX") &&
    isOptionalLocalX(customer, "moveTargetLocalX") &&
    isOptionalLocalX(customer, "moveEndLocalX") &&
    (customer.activity === null || ["counter", "table", "toilet", "darts", "billiards"].includes(customer.activity)) &&
    (customer.targetCellId === null || typeof customer.targetCellId === "string") &&
    (customer.slotIndex === null || hasNumber(customer, "slotIndex")) &&
    typeof customer.orderId === "string" &&
    (customer.orderTapCellId === undefined || customer.orderTapCellId === null || typeof customer.orderTapCellId === "string") &&
    (customer.bartenderId === null || typeof customer.bartenderId === "string") &&
    (customer.waiterId === null || typeof customer.waiterId === "string") &&
    hasNumber(customer, "waitingElapsed") &&
    (customer.isPrize === undefined || typeof customer.isPrize === "boolean") &&
    (customer.waitingDirection === -1 || customer.waitingDirection === 1) &&
    (customer.visitedExtras === undefined || (Array.isArray(customer.visitedExtras) && customer.visitedExtras.every((activity) => ["toilet", "darts", "billiards"].includes(activity)))) &&
    (customer.repeatOrdered === undefined || typeof customer.repeatOrdered === "boolean") &&
    (customer.toiletBonus === undefined || hasNumber(customer, "toiletBonus"))
  );
  const waitersValid = Array.isArray(state.waiters) && state.waiters.every((waiter) =>
    isRecord(waiter) &&
    typeof waiter.id === "string" &&
    typeof waiter.homeStationCellId === "string" &&
    typeof waiter.phase === "string" && WAITER_PHASES.has(waiter.phase) &&
    hasNumber(waiter, "x") && hasNumber(waiter, "y") && hasNumber(waiter, "phaseRemaining") &&
    hasNumber(waiter, "moveFromX") && hasNumber(waiter, "moveFromY") &&
    hasNumber(waiter, "moveTargetX") && hasNumber(waiter, "moveTargetY") && hasNumber(waiter, "moveDuration") &&
    isPath(waiter.movePath) &&
    isOptionalLocalX(waiter, "localX") && isOptionalLocalX(waiter, "moveFromLocalX") &&
    isOptionalLocalX(waiter, "moveTargetLocalX") && isOptionalLocalX(waiter, "moveEndLocalX") &&
    (waiter.customerId === null || typeof waiter.customerId === "string") && hasNumber(waiter, "speedFactor"),
  );
  const bartendersValid = Array.isArray(state.bartenders) && state.bartenders.every((bartender) =>
    isRecord(bartender) &&
    typeof bartender.id === "string" &&
    typeof bartender.homeTapCellId === "string" &&
    typeof bartender.phase === "string" && BARTENDER_PHASES.has(bartender.phase) &&
    hasNumber(bartender, "x") &&
    hasNumber(bartender, "y") &&
    hasNumber(bartender, "phaseRemaining") &&
    hasNumber(bartender, "moveFromX") &&
    hasNumber(bartender, "moveFromY") &&
    hasNumber(bartender, "moveTargetX") &&
    hasNumber(bartender, "moveTargetY") &&
    hasNumber(bartender, "moveDuration") &&
    isPath(bartender.movePath) &&
    isOptionalLocalX(bartender, "localX") &&
    isOptionalLocalX(bartender, "moveFromLocalX") &&
    isOptionalLocalX(bartender, "moveTargetLocalX") &&
    isOptionalLocalX(bartender, "moveEndLocalX") &&
    (bartender.customerId === null || typeof bartender.customerId === "string") &&
    (bartender.tapCellId === null || typeof bartender.tapCellId === "string") &&
    (bartender.tapSlot === null || hasNumber(bartender, "tapSlot")) &&
    hasNumber(bartender, "speedFactor"),
  );
  return (
    state.saveVersion === CONFIG.saveVersion &&
    Number.isFinite(state.money) &&
    (state.speed === 1 || state.speed === 5 || state.speed === 10) &&
    cellsValid && isDecorState(state.decor, state.cells!) &&
    isRecord(state.drinkLevels) && DRINKS.every((drink) => hasNumber(state.drinkLevels!, drink.id) && Number.isInteger(state.drinkLevels![drink.id]) && (state.drinkLevels![drink.id] as number) >= 0 && (state.drinkLevels![drink.id] as number) <= drink.maxLevel) &&
    isRecord(state.customerLevels) && CUSTOMER_TYPES.every((type) => hasNumber(state.customerLevels!, type.id) && Number.isInteger(state.customerLevels![type.id]) && (state.customerLevels![type.id] as number) >= 0 && (state.customerLevels![type.id] as number) <= type.maxLevel) &&
    Array.isArray(state.unlockedFeatureIds) && state.unlockedFeatureIds.every((id) => typeof id === "string") &&
    Array.isArray(state.unseenUnlockIds) && state.unseenUnlockIds.every((id) => typeof id === "string" && state.unlockedFeatureIds!.includes(id)) &&
    bartendersValid &&
    waitersValid &&
    customersValid &&
    typeof state.customerArrivalRemaining === "number" && Number.isFinite(state.customerArrivalRemaining) && state.customerArrivalRemaining >= 0 &&
    typeof state.customerArrivalsStarted === "boolean" &&
    typeof state.customerArrivalRate === "number" && Number.isFinite(state.customerArrivalRate) && state.customerArrivalRate >= 0 &&
    isRecord(state.arrivalTypeCarry) && CUSTOMER_TYPES.every((type) => hasNumber(state.arrivalTypeCarry!, type.id)) &&
    Array.isArray(state.arrivalTypeBag) && state.arrivalTypeBag.every((id) => CUSTOMER_TYPES.some((type) => type.id === id)) &&
    typeof state.arrivalMinuteRemaining === "number" && Number.isFinite(state.arrivalMinuteRemaining) && state.arrivalMinuteRemaining >= 0 &&
    Array.isArray(state.everUnlockedCustomerTypeIds) && state.everUnlockedCustomerTypeIds.every((id) => typeof id === "string") &&
    Number.isFinite(state.nextEntityId) &&
    holdValid &&
    questsValid &&
    researchValid &&
    (state.offers === undefined || isOfferState(state.offers))
  );
}

function defaultLocalX(state: GameState, x: number, y: number): number {
  return state.cells.find((cell) => cell.x === x && cell.y === y)?.type === "taps" ? .56 : .5;
}

function restoreMovementPoints(state: GameState): GameState {
  for (const customer of state.customers) {
    customer.localX ??= defaultLocalX(state, customer.x, customer.y);
    customer.moveFromLocalX ??= defaultLocalX(state, customer.moveFromX, customer.moveFromY);
    customer.moveTargetLocalX ??= defaultLocalX(state, customer.moveTargetX, customer.moveTargetY);
    customer.moveEndLocalX ??= customer.moveTargetLocalX;
  }
  for (const bartender of state.bartenders) {
    bartender.localX ??= defaultLocalX(state, bartender.x, bartender.y);
    bartender.moveFromLocalX ??= defaultLocalX(state, bartender.moveFromX, bartender.moveFromY);
    bartender.moveTargetLocalX ??= defaultLocalX(state, bartender.moveTargetX, bartender.moveTargetY);
    bartender.moveEndLocalX ??= bartender.moveTargetLocalX;
  }
  for (const waiter of state.waiters) {
    waiter.localX ??= defaultLocalX(state, waiter.x, waiter.y);
    waiter.moveFromLocalX ??= defaultLocalX(state, waiter.moveFromX, waiter.moveFromY);
    waiter.moveTargetLocalX ??= defaultLocalX(state, waiter.moveTargetX, waiter.moveTargetY);
    waiter.moveEndLocalX ??= waiter.moveTargetLocalX;
  }
  return state;
}

export function createGame(): GameState {
  return {
    decor: createDecorState(),
    offers: { cooldownRemaining: 0, pending: null },
    saveVersion: CONFIG.saveVersion,
    money: CONFIG.startingMoney,
    speed: 1,
    cells: [{ id: "cell-0", x: 0, y: 0, type: "entrance", level: 1 }],
    drinkLevels: Object.fromEntries(DRINKS.map((drink) => [drink.id, 0])),
    customerLevels: Object.fromEntries(CUSTOMER_TYPES.map((type) => [type.id, type.id === "sailors" ? 1 : 0])),
    unlockedFeatureIds: [
      ...BUILDABLE_CELL_TYPES.filter((type) => !CELL_DEFINITIONS[type].locked).map((type) => `cell-type:${type}`),
    ],
    unseenUnlockIds: [],
    bartenders: [],
    waiters: [],
    customers: [],
    customerArrivalRemaining: 30,
    customerArrivalsStarted: false,
    customerArrivalRate: 2,
    arrivalTypeCarry: Object.fromEntries(CUSTOMER_TYPES.map((type) => [type.id, 0])),
    arrivalTypeBag: [],
    arrivalMinuteRemaining: 60,
    everUnlockedCustomerTypeIds: ["sailors"],
    nextEntityId: 1,
    hold: {
      energy: CONFIG.holdEnergyCapacity,
      heat: 0,
      cooldownRemaining: 0,
      rechargeElapsed: 0,
      consumptionElapsed: 0,
    },
    research: { active: null, completedIds: [] },
    quests: {
      currentIndex: 0,
      incrementalProgress: 0,
    },
  };
}

export function createNewGamePlus(): GameState {
  const state = createGame();
  state.unlockedFeatureIds = [...new Set([
    ...state.unlockedFeatureIds,
    ...BUILDABLE_CELL_TYPES.map((type) => `cell-type:${type}`),
    ...QUESTS.flatMap((quest) => (quest.unlocks ?? []).map((feature) => `${feature.kind}:${feature.id}`)),
  ])];
  return state;
}

export function loadGame(storage: Pick<Storage, "getItem"> = localStorage): GameState {
  try {
    const raw = storage.getItem(CONFIG.saveKey);
    if (!raw) return createGame();
    const state: unknown = JSON.parse(raw);
    if (!isGameState(state)) return createGame();
    state.hold.energy = Math.min(state.hold.energy, CONFIG.holdEnergyCapacity);
    if (state.offers === undefined) {
      state.offers = { cooldownRemaining: 0, pending: null };
      const lagerQuestIndex = QUESTS.findIndex((quest) => quest.id === "open-lager");
      const previousFeatures = [
        ...BUILDABLE_CELL_TYPES.map((type) => `cell-type:${type}`),
        ...QUESTS.flatMap((quest) => (quest.unlocks ?? []).map((feature) => `${feature.kind}:${feature.id}`)),
      ].filter((id) => id !== "other:gift-offers");
      const wasNewGamePlus = previousFeatures.every((id) => state.unlockedFeatureIds.includes(id));
      if ((lagerQuestIndex >= 0 && state.quests.currentIndex > lagerQuestIndex) || wasNewGamePlus) {
        if (!state.unlockedFeatureIds.includes("other:gift-offers")) state.unlockedFeatureIds.push("other:gift-offers");
      }
    }
    restoreMovementPoints(state);
    syncPersonnel(state);
    return state;
  } catch {
    return createGame();
  }
}

export function saveGame(
  state: GameState,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(CONFIG.saveKey, JSON.stringify(state));
}
