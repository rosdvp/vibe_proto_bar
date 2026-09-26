import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, CUSTOMER_TYPES } from "../src/config";
import { advanceGame, barRating, buildCell, createGame as createBaseGame, customerArrivalChances, customerArrivalInterval, isCustomerTypeUnlocked, nextCustomerRateMilestone, syncPersonnel, takePaymentEvents, toggleMenuItem } from "../src/game";
import { movementDuration } from "../src/geometry";
import { fixedRandom } from "./support";

function createGame(): ReturnType<typeof createBaseGame> {
  const state = createBaseGame();
  state.money = 1000;
  state.unlockedFeatureIds.push("cell-type:taps", "cell-type:stairs", "cell-type:waiter-station", "cell-type:table", "menu-item:lager", "menu-item:red-ale");
  return state;
}

function counterServiceState() {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  toggleMenuItem(state, "mash");
  return state;
}

function triggerArrivals(state: ReturnType<typeof createGame>, count = 1, randomValue = 0.9): void {
  for (const type of CUSTOMER_TYPES) {
    if (isCustomerTypeUnlocked(state, type) && !state.everUnlockedCustomerTypeIds.includes(type.id)) {
      state.everUnlockedCustomerTypeIds.push(type.id);
    }
  }
  for (let index = 0; index < count; index += 1) {
    state.customerArrivalRating = barRating(state);
    state.customerArrivalRemaining = 0;
    advanceGame(state, 0.01, fixedRandom(randomValue));
  }
}

test("кран автоматически предоставляет бармена", () => {
  const state = counterServiceState();
  assert.equal(state.bartenders.length, 1);
  assert.equal(state.bartenders[0]?.homeTapCellId, state.cells.find((cell) => cell.type === "taps")?.id);
});

test("бармен принимает заказ, пять секунд наливает напиток и приносит доход", () => {
  const state = counterServiceState();
  const moneyBeforeService = state.money;

  triggerArrivals(state);
  advanceGame(state, 30, fixedRandom(0.9));

  assert.ok(state.money > moneyBeforeService);
  assert.deepEqual(takePaymentEvents(state).map((event) => event.amount), [5]);
  assert.deepEqual(takePaymentEvents(state), []);
});

test("оплата заказа засчитывает фактический доход активному заданию", () => {
  const state = counterServiceState();
  state.quests.currentIndex = 12;
  triggerArrivals(state);
  advanceGame(state, 30, fixedRandom(0.9));
  assert.equal(state.quests.incrementalProgress, 5);
});

test("бармен в стойке плавно идет к месту клиента", () => {
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
  assert.equal(bartender.moveTargetLocalX, 1 / 6);
  assert.ok(bartender.moveDuration > 0);

  advanceGame(state, bartender.moveDuration, fixedRandom(0.9));
  assert.equal(bartender.phase, "listening");
  assert.equal(bartender.localX, 1 / 6);
  assert.equal(bartender.phaseRemaining, 5);

  advanceGame(state, 5, fixedRandom(0.9));
  assert.equal(bartender.phase, "moving-taps");
  assert.equal(bartender.moveFromLocalX, 1 / 6);
  assert.equal(bartender.moveTargetLocalX, .74);

  advanceGame(state, bartender.moveDuration, fixedRandom(0.9));
  assert.equal(bartender.phase, "pouring");
  assert.equal(bartender.localX, .74);

  advanceGame(state, 5, fixedRandom(0.9));
  assert.equal(bartender.phase, "returning");
  assert.equal(bartender.moveFromLocalX, .74);
  assert.equal(bartender.moveTargetLocalX, 1 / 6);
});

test("каждый бармен использует только свой кран, и они наливают параллельно", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "taps");
  toggleMenuItem(state, "mash");
  toggleMenuItem(state, "lager");
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
  assert.ok(Math.abs(bartender.speedFactor - 1 / 1.1) < .0001);
  triggerArrivals(state);
  const customer = state.customers[0];
  assert.ok(customer);
  Object.assign(customer, { x: counter.x, y: counter.y, phase: "waiting-bartender", targetCellId: counter.id, slotIndex: 0, bartenderId: null });

  advanceGame(state, .01, fixedRandom(.9));

  const expectedMovement = movementDuration(state, tap.x, tap.y, counter.x, counter.y, .56, 1 / 6) * bartender.speedFactor;
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
  triggerArrivals(state, 4);
  assert.equal(state.customers.length, 4);
});

test("обслуживание столика требует стойку официанта", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "taps");
  toggleMenuItem(state, "lager");
  advanceGame(state, 0.01, fixedRandom(0.9));
  const clerk = state.customers.find((customer) => customer.typeId === "clerks");
  assert.ok(clerk);
  advanceGame(state, 2, fixedRandom(0.9));
  assert.equal(clerk.phase, "waiting-waiter");

  buildCell(state, 3, "waiter-station");
  advanceGame(state, 0.01, fixedRandom(0.9));
  assert.equal(state.waiters[0]?.customerId, clerk.id);
});

test("клиент движется к позиции стула столика", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "waiter-station");
  toggleMenuItem(state, "lager");
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
  toggleMenuItem(state, "mash");

  triggerArrivals(state);
  advanceGame(state, 3, fixedRandom(0.9));
  assert.ok(state.customers.some((customer) => customer.y < 0));
});

test("удаление заказанного напитка отправляет клиента к выходу", () => {
  const state = counterServiceState();
  triggerArrivals(state);
  advanceGame(state, 2, fixedRandom(0.9));
  toggleMenuItem(state, "mash");
  assert.ok(state.customers.every((customer) => customer.phase === "exiting"));
});

test("удаление напитка во время движения не меняет текущий сегмент клиента", () => {
  const state = counterServiceState();
  triggerArrivals(state);
  advanceGame(state, 0.4, fixedRandom(0.9));
  const customer = state.customers[0];
  assert.ok(customer);
  const segmentBefore = {
    moveFromX: customer.moveFromX,
    moveFromY: customer.moveFromY,
    moveTargetX: customer.moveTargetX,
    moveTargetY: customer.moveTargetY,
    moveDuration: customer.moveDuration,
    phaseRemaining: customer.phaseRemaining,
  };

  toggleMenuItem(state, "mash");

  assert.equal(customer.phase, "exiting");
  assert.deepEqual({
    moveFromX: customer.moveFromX,
    moveFromY: customer.moveFromY,
    moveTargetX: customer.moveTargetX,
    moveTargetY: customer.moveTargetY,
    moveDuration: customer.moveDuration,
    phaseRemaining: customer.phaseRemaining,
  }, segmentBefore);
});

test("клиент с другого этажа возвращается через лестницу после удаления напитка", () => {
  const state = createGame();
  buildCell(state, 0, "stairs", -1);
  buildCell(state, 1, "counter", -1);
  buildCell(state, 1, "taps", 0);
  toggleMenuItem(state, "mash");
  triggerArrivals(state);
  advanceGame(state, 2.5, fixedRandom(0.9));

  toggleMenuItem(state, "mash");
  const customer = state.customers[0];
  assert.ok(customer);
  assert.equal(customer.phase, "exiting");
  assert.ok(
    (customer.moveTargetX === 0 && customer.moveTargetY === -1) ||
    customer.movePath.some((point) => point.x === 0 && point.y === -1),
  );
});

test("официант принимает заказ, получает напиток у стойки и доставляет его к столику", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "waiter-station");
  toggleMenuItem(state, "lager");
  triggerArrivals(state, 1, 0.9);
  state.customerArrivalRemaining = 1_000_000;
  state.customerArrivalRating = barRating(state);
  const customer = state.customers.find((item) => item.typeId === "clerks");
  assert.ok(customer);
  const moneyBefore = state.money;
  for (let step = 0; step < 1000 && state.waiters[0]?.phase !== "listening"; step += 1) advanceGame(state, .1, fixedRandom(.9));
  assert.equal(state.waiters[0]?.phase, "listening");
  assert.ok(Math.abs((state.waiters[0]?.phaseRemaining ?? 0) - 5) < .1);
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
  assert.equal(state.money, moneyBefore + 7);
  assert.deepEqual(takePaymentEvents(state).map((event) => event.amount), [7]);
  assert.equal(customer.waiterId, null);
});

test("стойка увеличивает цену заказа на два процента за каждый уровень после первого", () => {
  const state = counterServiceState();
  const counter = state.cells.find((cell) => cell.type === "counter");
  assert.ok(counter);
  counter.level = 10;
  const tap = state.cells.find((cell) => cell.type === "taps");
  assert.ok(tap);
  tap.level = 6;
  const moneyBefore = state.money;
  triggerArrivals(state);
  for (let step = 0; step < 300 && state.money === moneyBefore; step += 1) {
    advanceGame(state, 0.1, fixedRandom(0.9));
  }
  assert.ok(Math.abs(state.money - moneyBefore - 6.4) < 0.001);
  assert.ok(Math.abs((takePaymentEvents(state)[0]?.amount ?? 0) - 6.4) < 0.001);
  const customer = state.customers.find((item) => item.phase === "drinking");
  assert.ok(customer);
  assert.ok(Math.abs(customer.phaseRemaining - CONFIG.drinkDuration / 1.18) < 0.1);
});

test("столик и использованный кран увеличивают цену, а столик ускоряет потребление", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "waiter-station");
  const table = state.cells.find((cell) => cell.type === "table");
  const tap = state.cells.find((cell) => cell.type === "taps");
  assert.ok(table && tap);
  table.level = 6;
  tap.level = 4;
  toggleMenuItem(state, "lager");
  triggerArrivals(state, 1, 0.9);
  state.customerArrivalRemaining = 1_000_000;
  state.customerArrivalRating = barRating(state);
  const customer = state.customers.find((item) => item.typeId === "clerks");
  assert.ok(customer);
  const moneyBefore = state.money;
  for (let step = 0; step < 1000 && customer.phase !== "drinking"; step += 1) advanceGame(state, .1, fixedRandom(.9));
  assert.equal(customer.phase, "drinking");
  assert.ok(Math.abs(state.money - moneyBefore - 8.12) < .001);
  assert.ok(Math.abs(customer.phaseRemaining - CONFIG.drinkDuration / 1.1) < .1);
});

test("рейтинг задает интервал прихода между ключевыми точками", () => {
  assert.equal(customerArrivalInterval(0), 30);
  assert.equal(customerArrivalInterval(2), 60 / 3.5);
  assert.equal(customerArrivalInterval(4), 12);
  assert.equal(customerArrivalInterval(8), 10);
  assert.equal(customerArrivalInterval(17), 60 / (6 + 9 * 9 / 32));
  assert.equal(customerArrivalInterval(40), 4);
  assert.equal(customerArrivalInterval(100), 3);
  assert.equal(customerArrivalInterval(120), 3);
});

test("подсказка следующей скорости и шансы клиентов используют правила прихода", () => {
  assert.deepEqual(nextCustomerRateMilestone(0), { ratingRemaining: 2, customersPerMinute: 3, isMaximum: false });
  assert.deepEqual(nextCustomerRateMilestone(4), { ratingRemaining: 4, customersPerMinute: 6, isMaximum: false });
  assert.deepEqual(nextCustomerRateMilestone(8), { ratingRemaining: 4, customersPerMinute: 7, isMaximum: false });
  assert.deepEqual(nextCustomerRateMilestone(17), { ratingRemaining: 2, customersPerMinute: 9, isMaximum: false });
  assert.deepEqual(nextCustomerRateMilestone(40), { ratingRemaining: 12, customersPerMinute: 16, isMaximum: false });
  assert.deepEqual(nextCustomerRateMilestone(100), { ratingRemaining: 0, customersPerMinute: 20, isMaximum: true });

  const state = createGame();
  assert.deepEqual(customerArrivalChances(state), { sailors: 0, clerks: 0, irish: 0 });
  state.menu.push("mash", "lager");
  state.cells.push({ id: "table", x: 1, y: 0, type: "table", level: 1 });
  assert.deepEqual(customerArrivalChances(state), { sailors: .75, clerks: .25, irish: 0 });
});

test("персонажи двигаются со скоростью 150 пикселей в секунду на любой геометрии", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  buildCell(state, 0, "stairs", -1);

  assert.ok(Math.abs(movementDuration(state, 0, 0, 1, 0, .5, .5) - 1) < 0.001);
  assert.ok(Math.abs(movementDuration(state, 1, 0, 2, 0, .5, .5) - .975) < 0.001);
  assert.ok(Math.abs(movementDuration(state, 1, 0, 1, 0, 0, 1) - 1.2) < 0.001);
  assert.ok(Math.abs(movementDuration(state, 0, 0, 0, -1, .5, .5) - 2) < 0.001);
});

test("при изменении рейтинга интервал прихода пересчитывается сразу", () => {
  const state = counterServiceState();
  state.customerArrivalRemaining = 40;
  state.customerArrivalRating = barRating(state);
  const counter = state.cells.find((cell) => cell.type === "counter");
  assert.ok(counter);
  counter.level += 1;

  advanceGame(state, 0.1, fixedRandom(0));

  assert.equal(state.customerArrivalRating, barRating(state));
  assert.ok(Math.abs(state.customerArrivalRemaining - (customerArrivalInterval(barRating(state)) - 0.1)) < 0.001);
});

test("таймер прихода сохраняет дробный остаток шага симуляции", () => {
  const state = counterServiceState();
  const counter = state.cells.find((cell) => cell.type === "counter");
  assert.ok(counter);
  counter.level = 14;
  state.customerArrivalRating = barRating(state);
  const interval = customerArrivalInterval(barRating(state));
  state.customerArrivalRemaining = interval;

  advanceGame(state, interval + 0.05, fixedRandom(0));

  assert.ok(Math.abs(state.customerArrivalRemaining - (interval - 0.05)) < 0.001);
});

test("тип клиента выбирается по весам среди разблокированных типов", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "waiter-station");
  buildCell(state, 4, "table");
  buildCell(state, 5, "taps");
  toggleMenuItem(state, "mash");
  toggleMenuItem(state, "lager");

  triggerArrivals(state, 1, 0.74);
  triggerArrivals(state, 1, 0.76);

  assert.deepEqual(state.customers.map((customer) => customer.typeId), ["sailors", "clerks"]);
});

test("клиенты не приходят без разблокированных типов, а новый тип впервые приходит сразу", () => {
  const state = createGame();
  advanceGame(state, 120, fixedRandom(0));
  assert.equal(state.customers.length, 0);

  buildCell(state, 1, "taps");
  toggleMenuItem(state, "mash");
  advanceGame(state, 0.01, fixedRandom(0));
  assert.deepEqual(state.customers.map((customer) => customer.typeId), ["sailors"]);
  const nextEntityId = state.nextEntityId;

  toggleMenuItem(state, "mash");
  toggleMenuItem(state, "mash");
  advanceGame(state, 0.01, fixedRandom(0));
  assert.equal(state.nextEntityId, nextEntityId);
  assert.deepEqual(state.everUnlockedCustomerTypeIds, ["sailors"]);
});

test("ирландец при доступности выбирает приоритетную стойку", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "waiter-station");
  buildCell(state, 3, "table");
  buildCell(state, 4, "taps");
  const counter = state.cells.find((cell) => cell.type === "counter");
  assert.ok(counter);
  counter.level = 20;
  toggleMenuItem(state, "red-ale");

  advanceGame(state, 0.01, fixedRandom(0.9));

  const irish = state.customers.find((customer) => customer.typeId === "irish");
  assert.ok(irish);
  assert.equal(irish.activity, "counter");
});

test("матрос при доступности выбирает стойку со стульями", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "waiter-station");
  buildCell(state, 3, "table");
  buildCell(state, 4, "taps");
  toggleMenuItem(state, "mash");
  triggerArrivals(state, 1, 0);
  const sailor = state.customers.find((customer) => customer.typeId === "sailors");
  assert.equal(sailor?.activity, "counter");
});

test("ожидающий необязательную стойку переходит к освободившейся альтернативе", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  toggleMenuItem(state, "mash");
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
  toggleMenuItem(state, "mash");
  state.bartenders = [];
  triggerArrivals(state, 4, 0);
  advanceGame(state, 2, fixedRandom(0));
  const waiting = state.customers.find((customer) => customer.phase === "waiting-counter");
  assert.ok(waiting);
  const counter = state.cells.find((cell) => cell.type === "counter");
  assert.ok(counter);
  const before = waiting.localX ?? .5;

  advanceGame(state, 1, fixedRandom(0));
  const movedPixels = Math.abs((waiting.localX ?? .5) - before) * CONFIG.baseCellWidth * 1.2;
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
  toggleMenuItem(state, "lager");
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
