import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, OFFER_POOL, QUESTS } from "../src/config";
import { advanceOffers, claimOffer, claimQuestReward, createGame, createNewGamePlus, loadGame, offerAvailable, offerMoneyBase, saveGame, startOffer, upgradeCostForLevel } from "../src/game";
import { isOfferState, offerLayout } from "../src/game/offers";
import type { GameState, RandomSource } from "../src/types";
import { fixedRandom } from "./support";

function rollFor(index: number, visualRoll = 0): RandomSource {
  const weight = OFFER_POOL.reduce((sum, item) => sum + item.weight, 0);
  const preceding = OFFER_POOL.slice(0, index).reduce((sum, item) => sum + item.weight, 0);
  let first = true;
  return () => {
    if (!first) return visualRoll;
    first = false;
    return (preceding + OFFER_POOL[index]!.weight / 2) / weight;
  };
}

function roundtrip(state: GameState): GameState {
  let raw = "";
  saveGame(state, { setItem: (_key, value) => { raw = value; } });
  return loadGame({ getItem: () => raw });
}

test("подарки закрыты до получения награды задания на Лагер", () => {
  const state = createGame();
  assert.equal(offerAvailable(state), false);
  assert.equal(startOffer(state), false);
  assert.equal(claimOffer(state), false);
  const index = QUESTS.findIndex((quest) => quest.id === "open-lager");
  const quest = QUESTS[index]!;
  assert.equal(quest.condition.kind, "drink-level");
  if (quest.condition.kind !== "drink-level") return;
  state.quests.currentIndex = index;
  state.drinkLevels[quest.condition.drinkId] = quest.target;
  assert.equal(offerAvailable(state), false);
  const result = claimQuestReward(state);
  assert.ok(result.unlocks.some((feature) => feature.id === "gift-offers"));
  assert.equal(offerAvailable(state), true);
});

test("Новая игра+ сразу разрешает розыгрыш", () => {
  assert.equal(offerAvailable(createNewGamePlus()), true);
  assert.equal(createGame().offers.pending, null);
  assert.equal(createGame().offers.cooldownRemaining, 0);
});

test("денежная база учитывает каждую постройку, закрытые тиры и максимальный уровень", () => {
  const state = createGame();
  state.cells.push(
    { id: "a", type: "counter", x: 1, y: 0, level: 4 },
    { id: "b", type: "taps", x: 2, y: 0, level: 8 },
    { id: "c", type: "table", x: 3, y: 0, level: CONFIG.maxCellLevel },
    { id: "d", type: "stairs", x: 4, y: 0, level: 1 },
  );
  assert.equal(offerMoneyBase(state), (upgradeCostForLevel(5) + upgradeCostForLevel(9) + upgradeCostForLevel(CONFIG.maxCellLevel)) / 3 * CONFIG.offerMoneyBaseMultiplier);
});

test("без улучшаемых ячеек коэффициент денежной базы применяется к цене первого уровня", () => {
  assert.equal(offerMoneyBase(createGame()), upgradeCostForLevel(1) * CONFIG.offerMoneyBaseMultiplier);
});

for (const [index, entry] of OFFER_POOL.entries()) {
  test(`пул ${entry.kind}/${index}: награда и раскладка соответствуют выбранному исходу`, () => {
    for (const visualRoll of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const state = createNewGamePlus();
      assert.equal(startOffer(state, rollFor(index, visualRoll)), true);
      const pending = state.offers.pending!;
      assert.equal(pending.reward.kind, entry.kind);
      if (entry.kind === "money" && pending.reward.kind === "money") {
        assert.equal(pending.reward.multiplier, entry.multiplier);
        assert.equal(pending.reward.amount, Math.floor(offerMoneyBase(state) * entry.multiplier));
      }
      assert.equal(isOfferState(state.offers), true);
      const total = pending.slots.reduce((sum, slot) => sum + (slot.color === entry.kind ? slot.count : 0), 0);
      assert.ok(total >= entry.circles[0] && total <= entry.circles[1]);
      const other = pending.slots.reduce((sum, slot) => sum + (slot.color !== entry.kind ? slot.count : 0), 0);
      assert.ok(total > other);
    }
  });
}

for (const color of ["money", "customers"] as const) {
  test(`круги ${color} строго преобладают при любой сумме и заполнении остальных слотов`, () => {
    const totals = new Set(OFFER_POOL.flatMap((entry) =>
      Array.from({ length: entry.circles[1] - entry.circles[0] + 1 }, (_, index) => entry.circles[0] + index)));
    for (const total of totals) {
      for (let layoutRoll = 0; layoutRoll <= 100; layoutRoll++) {
        for (const fillerRoll of [0, 0.34, 0.67, 0.999999]) {
          let first = true;
          const slots = offerLayout(color, total, () => {
            if (!first) return fillerRoll;
            first = false;
            return Math.min(0.999999, layoutRoll / 100);
          });
          const winning = slots.reduce((sum, slot) => sum + (slot.color === color ? slot.count : 0), 0);
          const other = slots.reduce((sum, slot) => sum + (slot.color !== color ? slot.count : 0), 0);
          assert.equal(winning, total);
          assert.ok(winning > other);
          assert.ok(slots.every((slot) => slot.count >= 0 && slot.count <= 3));
        }
      }
    }
  });
}

test("границы весов переключают выбранную награду", () => {
  const total = OFFER_POOL.reduce((sum, entry) => sum + entry.weight, 0);
  let preceding = 0;
  for (const [index, entry] of OFFER_POOL.entries()) {
    for (const roll of [(preceding + 0.000001) / total, (preceding + entry.weight - 0.000001) / total]) {
      const state = createNewGamePlus();
      startOffer(state, fixedRandom(roll));
      const expected = createNewGamePlus();
      startOffer(expected, rollFor(index));
      assert.deepEqual(state.offers.pending!.reward, expected.offers.pending!.reward);
    }
    preceding += entry.weight;
  }
});

test("новые розыгрыши всегда выдают деньги", () => {
  for (let index = 0; index <= 100; index++) {
    const state = createNewGamePlus();
    assert.equal(startOffer(state, fixedRandom(index / 100)), true);
    assert.equal(state.offers.pending!.reward.kind, "money");
  }
});

for (const advertised of [false, true]) {
  test(`денежная награда: рекламное увеличение ${advertised}`, () => {
    const state = createNewGamePlus();
    const index = OFFER_POOL.findIndex((entry) => entry.kind === "money");
    startOffer(state, rollFor(index));
    const reward = state.offers.pending!.reward;
    assert.equal(reward.kind, "money");
    if (reward.kind !== "money") return;
    const money = state.money;
    // A later upgrade cannot change the already selected prize.
    state.cells.push({ id: "max", type: "counter", x: 1, y: 0, level: CONFIG.maxCellLevel });
    assert.equal(startOffer(state), false);
    assert.equal(claimOffer(state, advertised), true);
    assert.equal(state.money, money + reward.amount * (advertised ? CONFIG.offerAdMultiplier : 1));
    assert.equal(state.offers.pending, null);
    assert.equal(state.offers.cooldownRemaining, CONFIG.offerCooldown);
    assert.equal(claimOffer(state, advertised), false);
    assert.equal(startOffer(state), false);
  });
}

for (const speed of [1, 5, 10] as const) {
  test(`кулдаун идет по времени страницы со служебной скоростью ${speed}`, () => {
    const state = createNewGamePlus();
    state.speed = speed;
    startOffer(state, fixedRandom());
    claimOffer(state);
    advanceOffers(state, 0);
    assert.equal(state.offers.cooldownRemaining, CONFIG.offerCooldown);
    advanceOffers(state, CONFIG.offerCooldown / speed / 2);
    assert.equal(state.offers.cooldownRemaining, CONFIG.offerCooldown / 2);
    advanceOffers(state, CONFIG.offerCooldown / speed);
    assert.equal(offerAvailable(state), true);
  });
}

test("зафиксированный результат и кулдаун сохраняются без офлайн-прогресса", () => {
  const state = createNewGamePlus();
  startOffer(state, fixedRandom());
  const restored = roundtrip(state);
  assert.deepEqual(restored.offers, state.offers);
  assert.equal(startOffer(restored), false);
  claimOffer(restored);
  assert.deepEqual(roundtrip(restored).offers, restored.offers);
});

for (const scenario of ["before", "after", "plus"] as const) {
  test(`старое сохранение: доступность подарка ${scenario}`, () => {
    const state = scenario === "plus" ? createNewGamePlus() : createGame();
    if (scenario === "after") state.quests.currentIndex = QUESTS.findIndex((quest) => quest.id === "open-lager") + 1;
    const old = JSON.parse(JSON.stringify(state));
    delete old.offers;
    old.unlockedFeatureIds = old.unlockedFeatureIds.filter((id: string) => id !== "other:gift-offers");
    old.money = 1234;
    const loaded = loadGame({ getItem: () => JSON.stringify(old) });
    assert.equal(loaded.money, old.money);
    assert.equal(offerAvailable(loaded), scenario !== "before");
  });
}

test("поврежденная награда не принимается при загрузке", () => {
  const state = createNewGamePlus();
  startOffer(state, fixedRandom());
  state.offers.pending!.slots[0]!.count = 100;
  assert.equal(isOfferState(state.offers), false);
  assert.deepEqual(roundtrip(state), createGame());
});
