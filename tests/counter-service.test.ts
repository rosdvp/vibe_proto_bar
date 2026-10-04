import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, CUSTOMER_TYPES, DRINKS } from "../src/config";
import { advanceGame, buildCell, createGame } from "../src/game";
import type { Customer } from "../src/types";
import { fixedRandom } from "./support";

function serviceState(slot: number) {
  const state = createGame();
  state.money = Number.MAX_SAFE_INTEGER;
  state.unlockedFeatureIds.push("cell-type:taps");
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  const counter = state.cells.find((cell) => cell.type === "counter")!;
  const tap = state.cells.find((cell) => cell.type === "taps")!;
  const bartender = state.bartenders[0]!;
  const drink = DRINKS[0]!;
  state.drinkLevels[drink.id] = 1;
  const customer: Customer = {
    id: "counter-service-customer", typeId: CUSTOMER_TYPES[0]!.id,
    x: counter.x, y: counter.y, phase: "waiting-bartender", phaseRemaining: 0,
    moveFromX: counter.x, moveFromY: counter.y, moveTargetX: counter.x, moveTargetY: counter.y,
    moveDuration: 0, movePath: [], localX: (slot + .5) / CONFIG.counterCapacity,
    activity: "counter", targetCellId: counter.id, slotIndex: slot, orderId: drink.id,
    bartenderId: null, waiterId: null, waitingElapsed: 0, waitingDirection: 1,
  };
  state.customers = [customer];
  return { state, counter, tap, bartender, customer };
}

for (let slot = 0; slot < CONFIG.counterCapacity; slot += 1) {
  for (const side of ["left", "right"] as const) {
    test(`место ${slot}: бармен подходит с ${side} к ближайшей точке между соседними стульями`, () => {
      const { state, counter, bartender, customer } = serviceState(slot);
      const from = side === "left" ? 0 : 1;
      Object.assign(bartender, { x: counter.x, y: counter.y, localX: from });

      advanceGame(state, .01, fixedRandom());

      const gap = side === "left" ? Math.max(1, slot) : Math.min(CONFIG.counterCapacity - 1, slot + 1);
      const expected = gap / CONFIG.counterCapacity;
      assert.equal(bartender.moveEndLocalX, expected);
      advanceGame(state, bartender.moveDuration, fixedRandom());
      assert.equal(bartender.phase, "listening");
      assert.equal(bartender.localX, expected);
      assert.equal(customer.localX, (slot + .5) / CONFIG.counterCapacity);
    });
  }

  test(`место ${slot}: бармен приносит напиток к точке между стульями`, () => {
    const { state, tap, bartender, customer } = serviceState(slot);
    Object.assign(customer, { phase: "waiting-drink", bartenderId: bartender.id });
    Object.assign(bartender, {
      x: tap.x, y: tap.y, localX: .8, phase: "pouring", phaseRemaining: 0,
      moveTargetX: tap.x, moveTargetY: tap.y, moveTargetLocalX: .8,
      customerId: customer.id, tapCellId: tap.id,
    });

    advanceGame(state, .01, fixedRandom());

    const expected = Math.min(CONFIG.counterCapacity - 1, slot + 1) / CONFIG.counterCapacity;
    assert.equal(bartender.phase, "returning");
    assert.equal(bartender.moveEndLocalX, expected);
    advanceGame(state, bartender.moveDuration, fixedRandom());
    assert.equal(customer.phase, "drinking");
    assert.equal(bartender.localX, expected);
  });
}

test("для центрального клиента при равном расстоянии выбирается левая точка", () => {
  const slot = Math.floor(CONFIG.counterCapacity / 2);
  const { state, counter, bartender } = serviceState(slot);
  Object.assign(bartender, { x: counter.x, y: counter.y, localX: (slot + .5) / CONFIG.counterCapacity });

  advanceGame(state, .01, fixedRandom());

  assert.equal(bartender.moveEndLocalX, slot / CONFIG.counterCapacity);
});
