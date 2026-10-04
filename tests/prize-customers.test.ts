import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, CUSTOMER_TYPES, DRINKS, LEGACY_CUSTOMER_OFFER_REWARDS } from "../src/config";
import { advanceGame, buildCell, claimOffer, createGame, createNewGamePlus, loadGame, saveGame, takePaymentEvents } from "../src/game";
import { offerLayout } from "../src/game/offers";
import { orderPrice } from "../src/game/economy";
import { spawnPrizeCustomers } from "../src/game/simulation";
import { cellBonusPercent } from "../src/game/selectors";
import { fixedRandom } from "./support";

for (const advertised of [false, true]) {
  test(`сохраненный клиентский выигрыш восстанавливается и выдается, увеличение ${advertised}`, () => {
    const state = createNewGamePlus();
    const selected = LEGACY_CUSTOMER_OFFER_REWARDS.find((entry) => state.customerLevels[entry.typeId] === 0)!;
    const before = { ...state.customerLevels };
    state.offers.pending = {
      reward: { kind: "customers", typeId: selected.typeId, count: CONFIG.offerCustomerCount },
      slots: offerLayout("customers", selected.circles[0], fixedRandom()),
    };
    const restored = loadGame({ getItem: () => JSON.stringify(state) });
    assert.deepEqual(restored.offers, state.offers);
    const reward = state.offers.pending!.reward;
    assert.equal(reward.kind, "customers");
    if (reward.kind !== "customers") return;
    claimOffer(restored, advertised);
    assert.equal(restored.customers.length, reward.count * (advertised ? CONFIG.offerAdMultiplier : 1));
    assert.ok(restored.customers.every((customer) => customer.typeId === reward.typeId && customer.isPrize));
    assert.deepEqual(restored.customerLevels, before);
    assert.equal(restored.customerArrivalsStarted, false);
  });
}

test("призовой посетитель ждет заказа и свободного места дольше обычного таймаута", () => {
  const state = createGame();
  const type = CUSTOMER_TYPES.find((entry) => state.customerLevels[entry.id] === 0)!;
  spawnPrizeCustomers(state, type.id, 1, fixedRandom());
  const id = state.customers[0]!.id;
  advanceGame(state, CONFIG.customerWaitingTimeout * 2, fixedRandom());
  assert.equal(state.customers[0]!.id, id);
  assert.equal(state.customers[0]!.phase, "waiting-activity");
  state.drinkLevels[DRINKS[0]!.id] = 1;
  advanceGame(state, CONFIG.customerWaitingTimeout * 2, fixedRandom());
  assert.equal(state.customers[0]!.id, id);
  assert.equal(state.customers[0]!.orderId, DRINKS[0]!.id);
});

for (const activity of ["counter", "table"] as const) {
  test(`призовой закрытый тип обслуживается с ценой уровня 1 у ${activity}`, () => {
    const state = createNewGamePlus();
    state.money = Number.MAX_SAFE_INTEGER;
    buildCell(state, 1, activity);
    buildCell(state, 2, "taps");
    if (activity === "table") buildCell(state, 3, "waiter-station");
    const type = CUSTOMER_TYPES.find((entry) => state.customerLevels[entry.id] === 0)!;
    const drink = DRINKS[0]!;
    state.drinkLevels[drink.id] = 1;
    spawnPrizeCustomers(state, type.id, 1, fixedRandom(0.9));
    advanceGame(state, 100, fixedRandom(0.9));
    const payments = takePaymentEvents(state);
    assert.equal(payments.length, 1);
    const seat = state.cells.find((cell) => cell.type === activity)!;
    const tap = state.cells.find((cell) => cell.type === "taps")!;
    assert.equal(payments[0]!.amount, orderPrice(state, drink, type, cellBonusPercent(seat.level, seat.type), cellBonusPercent(tap.level, tap.type), 1));
    assert.equal(state.customerLevels[type.id], 0);
    assert.equal(state.customers.length, 0);
  });
}

test("призовые признаки и ожидание сохраняются", () => {
  const state = createGame();
  spawnPrizeCustomers(state, CUSTOMER_TYPES[0]!.id, 1, fixedRandom());
  advanceGame(state, CONFIG.customerWaitingTimeout, fixedRandom());
  let raw = "";
  saveGame(state, { setItem: (_key, value) => { raw = value; } });
  const loaded = loadGame({ getItem: () => raw });
  assert.deepEqual(loaded.customers, state.customers);
  advanceGame(loaded, CONFIG.customerWaitingTimeout, fixedRandom());
  assert.equal(loaded.customers[0]!.isPrize, true);
});

test("обычный посетитель по-прежнему уходит по таймауту", () => {
  const state = createGame();
  spawnPrizeCustomers(state, CUSTOMER_TYPES[0]!.id, 1, fixedRandom());
  delete state.customers[0]!.isPrize;
  advanceGame(state, CONFIG.customerWaitingTimeout * 2, fixedRandom());
  assert.equal(state.customers.length, 0);
});
