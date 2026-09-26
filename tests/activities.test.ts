import assert from "node:assert/strict";
import test from "node:test";
import { advanceGame, barRating, buildCell, cellCapacity, createGame, createNewGamePlus, takePaymentEvents, upgradeCell } from "../src/game";
import { equipmentIssue } from "../src/game/selectors";
import type { BuildableCellType, Customer, GameState } from "../src/types";
import { fixedRandom } from "./support";

function setup(...types: BuildableCellType[]): GameState {
  const state = createNewGamePlus();
  state.money = 10000;
  state.menu = ["mash"];
  for (const [index, type] of ["counter", ...types].entries()) assert.equal(buildCell(state, index + 1, type as BuildableCellType), true);
  state.customerArrivalRemaining = 1_000_000;
  state.customerArrivalRating = barRating(state);
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

test("новые ячейки доступны только в новой игре+ и дают рейтинг с первого уровня", () => {
  const regular = createGame();
  assert.equal(buildCell(regular, 1, "darts"), false);
  const state = setup("sink", "hand-dryer", "toilet-stall", "darts", "billiards");
  assert.equal(barRating(state), 5);
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
  advanceGame(state, 21, fixedRandom(0));
  assert.equal(state.cells.find((cell) => cell.id === customer.targetCellId)?.type, "hand-dryer");
  advanceGame(state, 12, fixedRandom(0));
  assert.deepEqual(customer.visitedExtras, ["toilet"]);
  assert.equal(customer.phase, "exiting");
});

test("бонус туалета разыгрывается после этапов и создаёт единственный повторный заказ", () => {
  const state = setup("toilet-stall", "sink", "hand-dryer");
  for (const cell of state.cells.filter((item) => ["toilet-stall", "sink", "hand-dryer"].includes(item.type))) {
    assert.equal(upgradeCell(state, cell.id), true);
  }
  const customer = drinkingCustomer(state);
  advanceGame(state, 47, fixedRandom(0));
  assert.equal(customer.repeatOrdered, true);
  assert.equal(customer.toiletBonus, 6);
  assert.equal(customer.activity, "counter");
  assert.deepEqual(customer.visitedExtras, ["toilet"]);
});

test("дартс и бильярд оплачиваются после использования, цена округляется вниз до десятых", () => {
  const state = setup("darts", "billiards");
  const darts = state.cells.find((cell) => cell.type === "darts")!;
  const billiards = state.cells.find((cell) => cell.type === "billiards")!;
  assert.equal(upgradeCell(state, darts.id), true);
  assert.equal(upgradeCell(state, billiards.id), true);
  assert.equal(upgradeCell(state, billiards.id), true);
  const customer = drinkingCustomer(state);
  const money = state.money;
  advanceGame(state, 70, fixedRandom(0));
  assert.deepEqual(customer.visitedExtras, ["darts", "billiards"]);
  assert.deepEqual(takePaymentEvents(state).map((event) => event.amount), [10.5, 22]);
  assert.equal(state.money - money, 32.5);
});

test("занятая дополнительная активность выбирается с шансом 10% и ставит клиента в очередь", () => {
  const state = setup("darts");
  const darts = state.cells.find((cell) => cell.type === "darts")!;
  const occupied = drinkingCustomer(state, "occupied");
  Object.assign(occupied, { x: darts.x, phase: "using-extra", phaseRemaining: 1000, activity: "darts", targetCellId: darts.id, slotIndex: 0 });
  const waiting = drinkingCustomer(state, "waiting");
  advanceGame(state, 3, fixedRandom(.05));
  assert.equal(waiting.phase, "waiting-extra");
  assert.equal(waiting.slotIndex, null);
});
