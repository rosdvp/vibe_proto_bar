import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, CUSTOMER_TYPES } from "../src/config";
import { advanceGame, buildCell, cellCapacity, createGame, createNewGamePlus, takePaymentEvents, upgradeCell } from "../src/game";
import { customerPriceMultiplier } from "../src/game/economy";
import { cellBonusPercent, equipmentIssue, levelBonusPercent, workSpeedBonusPercent } from "../src/game/selectors";
import type { BuildableCellType, Customer, GameState } from "../src/types";
import { fixedRandom } from "./support";

function setup(...types: BuildableCellType[]): GameState {
  const state = createNewGamePlus();
  state.money = 10000;
  state.drinkLevels = { mash: 1, lager: 0, porter: 0, ale: 0, guinness: 0 };
  state.customerLevels = { sailors: 1, clerks: 0, irish: 0, cops: 0, mafia: 0 };
  state.quests.currentIndex = 2;
  state.customerArrivalsStarted = false;
  for (const [index, type] of ["counter", ...types].entries()) assert.equal(buildCell(state, index + 1, type as BuildableCellType), true);
  state.customerArrivalRemaining = 1_000_000;
  state.everUnlockedCustomerTypeIds = ["sailors", "clerks", "irish"];
  return state;
}

function drinkingCustomer(state: GameState, id = "test-customer"): Customer {
  const counter = state.cells.find((cell) => cell.type === "counter")!;
  const customer: Customer = {
    id, typeId: "sailors", x: counter.x, y: counter.y, phase: "drinking", phaseRemaining: .01,
    moveFromX: counter.x, moveFromY: counter.y, moveTargetX: counter.x, moveTargetY: counter.y,
    moveDuration: 0, movePath: [], localX: .5, activity: "counter", targetCellId: counter.id,
    slotIndex: 0, orderId: "mash", bartenderId: null, waiterId: null,
    waitingElapsed: 0, waitingDirection: 1, visitedExtras: [], repeatOrdered: false, toiletBonus: 0,
  };
  state.customers.push(customer);
  return customer;
}

test("новые ячейки доступны в новой игре+", () => {
  const regular = createGame();
  assert.equal(buildCell(regular, 1, "darts"), false);
  const state = setup("sink", "hand-dryer", "toilet-stall", "darts", "billiards");
  assert.equal(cellCapacity(state.cells.find((cell) => cell.type === "billiards")!), 2);
  assert.equal(cellCapacity(state.cells.find((cell) => cell.type === "toilet-stall")!), 1);
  const sink = state.cells.find((cell) => cell.type === "sink")!;
  assert.equal(equipmentIssue(state, sink), null);
});

test("раковина и сушилка предупреждают о кабинке только в своей комнате", () => {
  const state = setup("sink", "hand-dryer", "darts", "toilet-stall");
  assert.equal(equipmentIssue(state, state.cells.find((cell) => cell.type === "sink")!), "Не хватает кабинки с унитазом");
  assert.equal(equipmentIssue(state, state.cells.find((cell) => cell.type === "hand-dryer")!), "Не хватает кабинки с унитазом");
});

test("туалет пропускает отсутствующую раковину и переходит от кабинки к сушилке", () => {
  const state = setup("toilet-stall", "hand-dryer");
  const customer = drinkingCustomer(state);
  advanceGame(state, 1, fixedRandom(0));
  assert.equal(customer.activity, "toilet");
  assert.equal(state.cells.find((cell) => cell.id === customer.targetCellId)?.type, "toilet-stall");
  advanceGame(state, CONFIG.extraUseSeconds["toilet-stall"] + 1, fixedRandom(0));
  assert.equal(state.cells.find((cell) => cell.id === customer.targetCellId)?.type, "hand-dryer");
  advanceGame(state, CONFIG.extraUseSeconds["hand-dryer"] + 2, fixedRandom(0));
  assert.deepEqual(customer.visitedExtras, ["toilet"]);
  assert.equal(customer.phase, "exiting");
});

test("бонус туалета разыгрывается после этапов и создаёт единственный повторный заказ", () => {
  const state = setup("toilet-stall", "sink", "hand-dryer");
  for (const cell of state.cells.filter((item) => ["toilet-stall", "sink", "hand-dryer"].includes(item.type))) {
    assert.equal(upgradeCell(state, cell.id).success, true);
  }
  const customer = drinkingCustomer(state);
  const duration = ["toilet-stall", "sink", "hand-dryer"].reduce((sum, type) => sum + CONFIG.extraUseSeconds[type as keyof typeof CONFIG.extraUseSeconds] / (1 + workSpeedBonusPercent(2) / 100), 0);
  advanceGame(state, duration + 8, fixedRandom(0));
  assert.equal(customer.repeatOrdered, true);
  assert.equal(customer.toiletBonus, 3 * cellBonusPercent(2, "toilet-stall"));
  assert.equal(customer.activity, "counter");
  assert.deepEqual(customer.visitedExtras, ["toilet"]);
});

test("дартс и бильярд оплачиваются после использования, цена округляется вниз до целого", () => {
  const state = setup("darts", "billiards");
  const darts = state.cells.find((cell) => cell.type === "darts")!;
  const billiards = state.cells.find((cell) => cell.type === "billiards")!;
  assert.equal(upgradeCell(state, darts.id).success, true);
  assert.equal(upgradeCell(state, billiards.id).success, true);
  assert.equal(upgradeCell(state, billiards.id).success, true);
  const customer = drinkingCustomer(state);
  const money = state.money;
  advanceGame(state, CONFIG.extraUseSeconds.darts + CONFIG.extraUseSeconds.billiards + 10, fixedRandom(0));
  assert.deepEqual(customer.visitedExtras, ["darts", "billiards"]);
  const prices = [darts, billiards].map((cell) => Math.floor(levelBonusPercent(cell.level, CONFIG.extraIncomeRanges[cell.type as "darts" | "billiards"]) * (1 + customerPriceMultiplier(state, CUSTOMER_TYPES.find((type) => type.id === customer.typeId)!) / 100) + 1e-9));
  assert.deepEqual(takePaymentEvents(state).map((event) => event.amount), prices);
  assert.equal(state.money - money, prices.reduce((sum, price) => sum + price, 0));
});

for (const type of ["toilet-stall", "darts", "billiards"] as const) {
  for (const freePlace of [false, true]) {
    test(`${type}: выбор дополнительной активности при свободном месте ${freePlace}`, () => {
      const state = setup(type);
      const equipment = state.cells.find((cell) => cell.type === type)!;
      const activity = type === "toilet-stall" ? "toilet" : type;
      const occupiedCount = cellCapacity(equipment) - (freePlace ? 1 : 0);
      for (let slot = 0; slot < occupiedCount; slot++) {
        const occupied = drinkingCustomer(state, `occupied-${slot}`);
        Object.assign(occupied, { x: equipment.x, phase: "using-extra", phaseRemaining: 1000, activity, targetCellId: equipment.id, slotIndex: slot });
      }
      const customer = drinkingCustomer(state);
      advanceGame(state, 1, fixedRandom(0));
      assert.deepEqual(customer.visitedExtras, freePlace ? [activity] : []);
      if (freePlace) assert.equal(customer.activity, activity);
      else assert.equal(customer.phase, "exiting");
    });
  }
}

for (const activity of ["darts", "billiards"] as const) {
  for (const isPrize of [false, true]) {
    test(`${activity}: оплата учитывает клиента и не зависит от напитка и других ячеек (призовой: ${isPrize})`, () => {
      const state = setup(activity);
      const type = CUSTOMER_TYPES[0]!;
      state.customerLevels[type.id] = isPrize ? 0 : type.maxLevel;
      const equipment = state.cells.find((cell) => cell.type === activity)!;
      equipment.level = 7;
      const customer = drinkingCustomer(state);
      Object.assign(customer, {
        typeId: type.id, isPrize, phase: "using-extra", phaseRemaining: .01,
        activity, targetCellId: equipment.id, visitedExtras: [activity],
      });
      const bonus = customerPriceMultiplier(state, type, isPrize ? 1 : type.maxLevel);
      const expected = Math.floor(levelBonusPercent(equipment.level, CONFIG.extraIncomeRanges[activity]) * (1 + bonus / 100) + 1e-9);
      const payments: number[] = [];
      for (const unrelatedLevel of [1, CONFIG.maxCellLevel]) {
        const scenario = structuredClone(state);
        scenario.drinkLevels.mash = unrelatedLevel;
        for (const cell of scenario.cells) if (cell.id !== equipment.id) cell.level = unrelatedLevel;
        const before = scenario.money;
        advanceGame(scenario, .02, fixedRandom(1));
        const events = takePaymentEvents(scenario);
        assert.deepEqual(events.map((event) => event.amount), [expected]);
        payments.push(scenario.money - before);
      }
      assert.deepEqual(payments, [expected, expected]);
    });
  }
}
