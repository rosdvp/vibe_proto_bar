import assert from "node:assert/strict";
import test from "node:test";
import { CELL_DEFINITIONS, CONFIG, CUSTOMER_TYPES, DRINKS } from "../src/config";
import { advanceGame, buildCell, createGame as createBaseGame, syncPersonnel, takePaymentEvents } from "../src/game";
import { movementDuration } from "../src/geometry";
import { fixedRandom } from "./support";
import { orderPrice, totalCustomerRate } from "../src/game/economy";
import { cellBonusPercent, workSpeedBonusPercent } from "../src/game/selectors";

function createGame(): ReturnType<typeof createBaseGame> {
  const state = createBaseGame();
  state.money = 1000;
  state.unlockedFeatureIds.push("cell-type:taps", "cell-type:stairs", "cell-type:waiter-station", "cell-type:table");
  return state;
}

function counterServiceState() {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  state.drinkLevels.mash = 1;
  return state;
}

function triggerArrivals(state: ReturnType<typeof createGame>, count = 1, randomValue = 0.9): void {
  state.quests.currentIndex = 3;
  state.customerArrivalsStarted = true;
  for (let index = 0; index < count; index += 1) {
    const typeId = state.cells.some((cell) => cell.type === "table") && !state.cells.some((cell) => cell.type === "counter") ? "clerks" : "sailors";
    state.customerLevels[typeId] = 1;
    state.customerArrivalRate = totalCustomerRate(state);
    state.arrivalTypeBag = [typeId];
    state.customerArrivalRemaining = 0;
    advanceGame(state, 0.01, fixedRandom(randomValue));
  }
}

test("кран автоматически предоставляет бармена", () => {
  const state = counterServiceState();
  assert.equal(state.bartenders.length, 1);
  assert.equal(state.bartenders[0]?.homeTapCellId, state.cells.find((cell) => cell.type === "taps")?.id);
});

test("бармен принимает заказ, наливает напиток и приносит доход", () => {
  const state = counterServiceState();
  const moneyBeforeService = state.money;

  triggerArrivals(state);
  advanceGame(state, 30, fixedRandom(0.9));

  assert.ok(state.money > moneyBeforeService);
  const price = orderPrice(state, DRINKS.find((drink) => drink.id === "mash")!, CUSTOMER_TYPES.find((type) => type.id === "sailors")!, 0, 0);
  assert.deepEqual(takePaymentEvents(state).map((event) => event.amount), [price]);
  assert.deepEqual(takePaymentEvents(state), []);
});

test("оплата заказа засчитывает обслуживание активному заданию", () => {
  const state = counterServiceState();
  triggerArrivals(state);
  state.quests.currentIndex = 3;
  advanceGame(state, 30, fixedRandom(0.9));
  assert.equal(state.quests.incrementalProgress, 1);
});

test("дробная оплата у стойки полностью начисляется и передаётся в частицу", () => {
  const state = counterServiceState();
  const counter = state.cells.find((cell) => cell.type === "counter")!;
  counter.level = 3;
  const moneyBefore = state.money;
  triggerArrivals(state);
  state.customerArrivalRemaining = 1_000_000;
  advanceGame(state, 30, fixedRandom(.9));
  const drink = DRINKS.find((item) => item.id === "mash")!;
  const type = CUSTOMER_TYPES.find((item) => item.id === "sailors")!;
  const price = orderPrice(state, drink, type, cellBonusPercent(counter.level, counter.type), 0);
  assert.notEqual(price, Math.floor(price));
  assert.equal(state.money, moneyBefore + price);
  assert.deepEqual(takePaymentEvents(state).map((event) => event.amount), [price]);
});

test("бармен в стойке плавно идет к точке обслуживания между стульями", () => {
  const state = counterServiceState();
  triggerArrivals(state);
  const counter = state.cells.find((cell) => cell.type === "counter");
  const bartender = state.bartenders[0];
  const customer = state.customers[0];
  assert.ok(counter && bartender && customer);

  state.customers = [customer];
  Object.assign(customer, {
    x: counter.x,
    y: counter.y,
    phase: "waiting-bartender",
    targetCellId: counter.id,
    slotIndex: 0,
    bartenderId: null,
  });
  Object.assign(bartender, {
    x: counter.x,
    y: counter.y,
    phase: "idle",
    customerId: null,
    movePath: [],
  });

  advanceGame(state, 0.01, fixedRandom(0.9));

  assert.equal(bartender.phase, "moving-customer");
  assert.equal(bartender.moveTargetLocalX, 1 / CONFIG.counterCapacity);
  assert.ok(bartender.moveDuration > 0);

  advanceGame(state, bartender.moveDuration, fixedRandom(0.9));
  assert.equal(bartender.phase, "listening");
  assert.equal(bartender.localX, 1 / CONFIG.counterCapacity);
  assert.equal(bartender.phaseRemaining, CONFIG.listenDuration * bartender.speedFactor);

  advanceGame(state, CONFIG.listenDuration * bartender.speedFactor, fixedRandom(0.9));
  assert.equal(bartender.phase, "moving-taps");
  assert.equal(bartender.moveFromLocalX, 1 / CONFIG.counterCapacity);
  assert.equal(bartender.moveTargetLocalX, .74);

  advanceGame(state, bartender.moveDuration, fixedRandom(0.9));
  assert.equal(bartender.phase, "pouring");
  assert.equal(bartender.localX, .74);

  advanceGame(state, CONFIG.pourDuration * bartender.speedFactor, fixedRandom(0.9));
  assert.equal(bartender.phase, "returning");
  assert.equal(bartender.moveFromLocalX, .74);
  assert.equal(bartender.moveTargetLocalX, 1 / CONFIG.counterCapacity);
});

test("каждый бармен использует только свой кран, и они наливают параллельно", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "taps");
  state.drinkLevels.mash = 1;
  state.drinkLevels.lager = 1;
  triggerArrivals(state, 2);

  const counter = state.cells.find((cell) => cell.type === "counter");
  const [firstTap, secondTap] = state.cells.filter((cell) => cell.type === "taps");
  const [firstCustomer, secondCustomer] = state.customers;
  const [firstBartender, secondBartender] = state.bartenders;
  assert.ok(counter && firstTap && secondTap && firstCustomer && secondCustomer && firstBartender && secondBartender);

  for (const [customer, bartender] of [
    [firstCustomer, firstBartender],
    [secondCustomer, secondBartender],
  ] as const) {
    Object.assign(customer, {
      x: counter.x,
      y: counter.y,
      phase: "waiting-drink",
      orderId: "mash",
      bartenderId: bartender.id,
    });
    Object.assign(bartender, {
      x: counter.x,
      y: counter.y,
      phase: "listening",
      phaseRemaining: 0,
      customerId: customer.id,
      movePath: [],
      tapCellId: null,
      tapSlot: null,
    });
  }

  advanceGame(state, 0.01, fixedRandom(0.9));

  assert.equal(firstBartender.phase, "moving-taps");
  assert.equal(secondBartender.phase, "moving-taps");
  assert.equal(firstBartender.tapCellId, firstTap.id);
  assert.equal(secondBartender.tapCellId, secondTap.id);

  for (let step = 0; step < 100 && state.bartenders.filter((bartender) => bartender.phase === "pouring").length < 2; step += 1) {
    advanceGame(state, 0.1, fixedRandom(0.9));
  }

  assert.equal(firstBartender.phase, "pouring");
  assert.equal(secondBartender.phase, "pouring");
});

test("уровень крана ускоряет перемещение и принятие заказа его бармена", () => {
  const state = counterServiceState();
  const counter = state.cells.find((cell) => cell.type === "counter");
  const tap = state.cells.find((cell) => cell.type === "taps");
  const bartender = state.bartenders[0];
  assert.ok(counter && tap && bartender);
  tap.level = 6;
  syncPersonnel(state);
  assert.ok(Math.abs(bartender.speedFactor - 1 / (1 + workSpeedBonusPercent(tap.level) / 100)) < .0001);
  triggerArrivals(state);
  const customer = state.customers[0];
  assert.ok(customer);
  Object.assign(customer, { x: counter.x, y: counter.y, phase: "waiting-bartender", targetCellId: counter.id, slotIndex: 0, bartenderId: null });

  advanceGame(state, .01, fixedRandom(.9));

  const expectedMovement = movementDuration(state, tap.x, tap.y, counter.x, counter.y, bartender.moveFromLocalX ?? .5, 1 / CONFIG.counterCapacity) * bartender.speedFactor;
  assert.ok(Math.abs(bartender.moveDuration - expectedMovement) < .001);
  advanceGame(state, bartender.moveDuration, fixedRandom(.9));
  assert.equal(bartender.phase, "listening");
  assert.ok(Math.abs(bartender.phaseRemaining - CONFIG.listenDuration * bartender.speedFactor) < .001);
});

test("бармен и официант не берут клиентов из другой комнаты", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "table");
  buildCell(state, 3, "taps");
  buildCell(state, 0, "stairs", -1);
  buildCell(state, 1, "taps", -1);
  buildCell(state, 2, "waiter-station", -1);
  const counter = state.cells.find((cell) => cell.type === "counter");
  const table = state.cells.find((cell) => cell.type === "table");
  const lowerBartender = state.bartenders.find((item) => state.cells.find((cell) => cell.id === item.homeTapCellId)?.y === -1);
  const lowerWaiter = state.waiters[0];
  assert.ok(counter && table && lowerBartender && lowerWaiter);
  state.bartenders = [lowerBartender];
  state.customers.push({
    id: "room-customer", typeId: "sailors", x: counter.x, y: counter.y, phase: "waiting-bartender", phaseRemaining: 0,
    moveFromX: counter.x, moveFromY: counter.y, moveTargetX: counter.x, moveTargetY: counter.y, moveDuration: 0, movePath: [],
    activity: "counter", targetCellId: counter.id, slotIndex: 0, orderId: "mash", bartenderId: null, waiterId: null,
    waitingElapsed: 0, waitingDirection: 1,
  });
  state.customers.push({
    id: "room-table-customer", typeId: "clerks", x: table.x, y: table.y, phase: "waiting-waiter", phaseRemaining: 0,
    moveFromX: table.x, moveFromY: table.y, moveTargetX: table.x, moveTargetY: table.y, moveDuration: 0, movePath: [],
    activity: "table", targetCellId: table.id, slotIndex: 0, orderId: "lager", bartenderId: null, waiterId: null,
    waitingElapsed: 0, waitingDirection: 1,
  });

  advanceGame(state, .01, fixedRandom(.9));

  assert.equal(lowerBartender.phase, "idle");
  assert.equal(lowerWaiter.phase, "idle");
  assert.equal(state.customers[0]?.bartenderId, null);
  assert.equal(state.customers[1]?.waiterId, null);
});

test("бармен без заказа в своей комнате не блокирует следующего бармена", () => {
  const state = createGame();
  buildCell(state, 1, "taps");
  buildCell(state, 0, "stairs", -1);
  buildCell(state, 1, "counter", -1);
  buildCell(state, 2, "taps", -1);
  const counter = state.cells.find((cell) => cell.type === "counter");
  const upperBartender = state.bartenders.find((item) => state.cells.find((cell) => cell.id === item.homeTapCellId)?.y === 0);
  const lowerBartender = state.bartenders.find((item) => state.cells.find((cell) => cell.id === item.homeTapCellId)?.y === -1);
  assert.ok(counter && upperBartender && lowerBartender);
  state.customers.push({
    id: "lower-counter-customer", typeId: "sailors", x: counter.x, y: counter.y, phase: "waiting-bartender", phaseRemaining: 0,
    moveFromX: counter.x, moveFromY: counter.y, moveTargetX: counter.x, moveTargetY: counter.y, moveDuration: 0, movePath: [],
    activity: "counter", targetCellId: counter.id, slotIndex: 0, orderId: "mash", bartenderId: null, waiterId: null,
    waitingElapsed: 1, waitingDirection: 1,
  });

  advanceGame(state, .01, fixedRandom(.9));

  assert.equal(upperBartender.phase, "idle");
  assert.equal(lowerBartender.phase, "moving-customer");
  assert.equal(lowerBartender.customerId, "lower-counter-customer");
});

test("официант без заказа в своей комнате не блокирует следующего официанта", () => {
  const state = createGame();
  buildCell(state, 1, "waiter-station");
  buildCell(state, 0, "stairs", -1);
  buildCell(state, 1, "table", -1);
  buildCell(state, 2, "waiter-station", -1);
  const table = state.cells.find((cell) => cell.type === "table");
  const upperWaiter = state.waiters.find((item) => state.cells.find((cell) => cell.id === item.homeStationCellId)?.y === 0);
  const lowerWaiter = state.waiters.find((item) => state.cells.find((cell) => cell.id === item.homeStationCellId)?.y === -1);
  assert.ok(table && upperWaiter && lowerWaiter);
  state.customers.push({
    id: "lower-table-customer", typeId: "clerks", x: table.x, y: table.y, phase: "waiting-waiter", phaseRemaining: 0,
    moveFromX: table.x, moveFromY: table.y, moveTargetX: table.x, moveTargetY: table.y, moveDuration: 0, movePath: [],
    activity: "table", targetCellId: table.id, slotIndex: 0, orderId: "lager", bartenderId: null, waiterId: null,
    waitingElapsed: 1, waitingDirection: 1,
  });

  advanceGame(state, .01, fixedRandom(.9));

  assert.equal(upperWaiter.phase, "idle");
  assert.equal(lowerWaiter.phase, "moving-customer");
  assert.equal(lowerWaiter.customerId, "lower-table-customer");
});

test("недоступная из комнаты активная задача отменяется вместе с клиентом", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  buildCell(state, 0, "stairs", -1);
  buildCell(state, 1, "taps", -1);
  const counter = state.cells.find((cell) => cell.type === "counter");
  const lowerBartender = state.bartenders.find((item) => state.cells.find((cell) => cell.id === item.homeTapCellId)?.y === -1);
  assert.ok(counter && lowerBartender);
  state.bartenders = [lowerBartender];
  state.customers.push({
    id: "invalid-room-customer", typeId: "sailors", x: counter.x, y: counter.y, phase: "waiting-drink", phaseRemaining: 0,
    moveFromX: counter.x, moveFromY: counter.y, moveTargetX: counter.x, moveTargetY: counter.y, moveDuration: 0, movePath: [],
    activity: "counter", targetCellId: counter.id, slotIndex: 0, orderId: "mash", bartenderId: lowerBartender.id, waiterId: null,
    waitingElapsed: 0, waitingDirection: 1,
  });
  Object.assign(lowerBartender, { phase: "moving-customer", customerId: "invalid-room-customer" });

  advanceGame(state, .01, fixedRandom(.9));

  assert.equal(state.customers.length, 0);
  assert.equal(lowerBartender.phase, "idle");
});

test("количество клиентов не ограничено количеством мест", () => {
  const state = counterServiceState();
  const count = CONFIG.counterCapacity + 1;
  triggerArrivals(state, count);
  assert.equal(state.customers.length, count);
});

test("обслуживание столика требует стойку официанта", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "taps");
  state.drinkLevels.lager = 1;
  triggerArrivals(state);
  const clerk = state.customers.find((customer) => customer.typeId === "clerks");
  assert.ok(clerk);
  assert.equal(clerk.phase, "waiting-activity");

  buildCell(state, 3, "waiter-station");
  for (let step = 0; step < 40 && state.waiters[0]?.customerId !== clerk.id; step += 1) advanceGame(state, .1, fixedRandom(.9));
  assert.equal(state.waiters[0]?.customerId, clerk.id);
});

test("клиент движется к позиции стула столика", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "waiter-station");
  state.drinkLevels.lager = 1;
  triggerArrivals(state);
  const table = state.cells.find((cell) => cell.type === "table");
  const customer = state.customers.find((item) => item.typeId === "clerks");
  assert.ok(table && customer);

  state.customers = [customer];
  Object.assign(customer, {
    x: table.x,
    y: table.y,
    phase: "waiting-table",
    targetCellId: null,
    slotIndex: null,
    localX: .5,
    movePath: [],
    phaseRemaining: 0,
  });

  advanceGame(state, 0.01, fixedRandom(0.9));

  assert.equal(customer.phase, "moving-table");
  assert.equal(customer.moveTargetLocalX, 1 / 6);
  advanceGame(state, customer.moveDuration, fixedRandom(0.9));
  assert.equal(customer.phase, "waiting-waiter");
  assert.equal(customer.localX, 1 / 6);
});

test("клиенты могут обслуживаться на этаже, соединенном лестницами", () => {
  const state = createGame();
  buildCell(state, 0, "stairs", -1);
  buildCell(state, 1, "counter", -1);
  buildCell(state, 1, "taps", 0);
  state.drinkLevels.mash = 1;

  triggerArrivals(state);
  advanceGame(state, 3, fixedRandom(0.9));
  assert.ok(state.customers.some((customer) => customer.y < 0));
});

test("официант принимает заказ, получает напиток у стойки и доставляет его к столику", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "waiter-station");
  state.drinkLevels.lager = 1;
  triggerArrivals(state, 1, 0.9);
  state.customerArrivalRemaining = 1_000_000;
  state.customerArrivalRate = 2;
  const customer = state.customers.find((item) => item.typeId === "clerks");
  assert.ok(customer);
  const moneyBefore = state.money;
  for (let step = 0; step < 1000 && state.waiters[0]?.phase !== "listening"; step += 1) advanceGame(state, .1, fixedRandom(.9));
  assert.equal(state.waiters[0]?.phase, "listening");
  assert.ok(Math.abs((state.waiters[0]?.phaseRemaining ?? 0) - CONFIG.listenDuration * state.waiters[0]!.speedFactor) < .1);
  for (let step = 0; step < 1000 && !state.waiters.some((waiter) => waiter.phase === "delivering"); step += 1) advanceGame(state, .1, fixedRandom(.9));
  const table = state.cells.find((cell) => cell.id === customer.targetCellId);
  const station = state.cells.find((cell) => cell.type === "waiter-station");
  assert.ok(table && station);
  assert.equal(state.waiters[0]?.phase, "delivering");
  assert.equal(state.waiters[0]?.moveEndLocalX, customer.localX);
  assert.equal(state.bartenders[0]?.phase, "idle");
  assert.equal(state.bartenders[0]?.x, station.x);
  assert.notEqual(state.bartenders[0]?.x, table.x);
  for (let step = 0; step < 1000 && customer.phase !== "drinking"; step += 1) advanceGame(state, .1, fixedRandom(.9));
  assert.equal(customer.phase, "drinking");
  const tap = state.cells.find((cell) => cell.type === "taps")!;
  const price = orderPrice(state, DRINKS.find((drink) => drink.id === customer.orderId)!, CUSTOMER_TYPES.find((type) => type.id === customer.typeId)!, cellBonusPercent(table.level, table.type), cellBonusPercent(tap.level, tap.type));
  assert.equal(state.money, moneyBefore + price);
  assert.deepEqual(takePaymentEvents(state).map((event) => event.amount), [price]);
  assert.equal(customer.waiterId, null);
});

test("персонажи двигаются с настроенной скоростью на любой геометрии", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  buildCell(state, 0, "stairs", -1);

  const scale = CONFIG.baseCellWidth / CONFIG.characterMoveSpeed;
  assert.ok(Math.abs(movementDuration(state, 0, 0, 1, 0, .5, .5) - (.8 + CELL_DEFINITIONS.counter.width) / 2 * scale) < 0.001);
  assert.ok(Math.abs(movementDuration(state, 1, 0, 2, 0, .5, .5) - (CELL_DEFINITIONS.counter.width + CELL_DEFINITIONS.taps.width) / 2 * scale) < 0.001);
  assert.ok(Math.abs(movementDuration(state, 1, 0, 1, 0, 0, 1) - CELL_DEFINITIONS.counter.width * scale) < 0.001);
  assert.ok(Math.abs(movementDuration(state, 0, 0, 0, -1, .5, .5) - CONFIG.cellHeight / CONFIG.characterMoveSpeed) < 0.001);
});

test("ожидающий необязательную стойку переходит к освободившейся альтернативе", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  state.drinkLevels.mash = 1;
  state.bartenders = [];
  triggerArrivals(state, 4, 0);
  advanceGame(state, 2, fixedRandom(0));
  const waiting = state.customers.find((customer) => customer.phase === "waiting-counter");
  assert.ok(waiting);

  buildCell(state, 3, "waiter-station");
  buildCell(state, 4, "table");
  advanceGame(state, 0.01, fixedRandom(0));

  assert.equal(waiting.activity, "table");
  assert.equal(waiting.phase, "moving-table");
});

test("ожидающий клиент движется со скоростью 25 px в секунду и уходит через 60 секунд", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  state.drinkLevels.mash = 1;
  state.bartenders = [];
  triggerArrivals(state, 4, 0);
  advanceGame(state, 2, fixedRandom(0));
  const waiting = state.customers.find((customer) => customer.phase === "waiting-counter");
  assert.ok(waiting);
  const counter = state.cells.find((cell) => cell.type === "counter");
  assert.ok(counter);
  const before = waiting.localX ?? .5;

  advanceGame(state, 1, fixedRandom(0));
  const movedPixels = Math.abs((waiting.localX ?? .5) - before) * CONFIG.baseCellWidth * CELL_DEFINITIONS.counter.width;
  assert.ok(Math.abs(movedPixels - CONFIG.customerWaitingMoveSpeed) < 0.001);

  advanceGame(state, CONFIG.customerWaitingTimeout, fixedRandom(0));
  assert.equal(waiting.phase, "exiting");
});

test("официант первым принимает заказ старейшего ожидающего клиента", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "table");
  buildCell(state, 3, "waiter-station");
  buildCell(state, 4, "taps");
  state.drinkLevels.lager = 1;
  triggerArrivals(state, 2, 0.9);
  advanceGame(state, 5, fixedRandom(0.9));
  const waiting = state.customers.filter((customer) => customer.phase === "waiting-waiter");
  assert.equal(waiting.length, 2);
  waiting[0]!.waitingElapsed = 1;
  waiting[1]!.waitingElapsed = 10;
  state.waiters[0]!.phase = "idle";
  state.waiters[0]!.customerId = null;
  for (const customer of waiting) customer.waiterId = null;
  advanceGame(state, 0.01, fixedRandom(0.9));
  assert.equal(state.waiters[0]?.customerId, waiting[1]?.id);
});
