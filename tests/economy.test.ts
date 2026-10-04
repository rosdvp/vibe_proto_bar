import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOMER_TYPES, DRINKS } from "../src/config";
import { advanceGame, buildCell, createGame, customerArrivalInterval, syncCustomerUnlocks, upgradeCustomerType, upgradeDrink } from "../src/game";
import { customerPriceMultiplier, customerRate, customerUpgradeCost, drinkChance, drinkPrice, drinkUpgradeCost, orderPrice, totalCustomerRate } from "../src/game/economy";
import { fixedRandom } from "./support";

test("напитки открываются покупкой уровня и автоматически участвуют в заказах", () => {
  const state = createGame();
  state.money = 10000;
  state.unlockedFeatureIds.push("other:menu-screen");
  const mash = DRINKS.find((drink) => drink.id === "mash")!;
  const lager = DRINKS.find((drink) => drink.id === "lager")!;
  assert.equal(drinkChance(state, mash), 0);
  assert.equal(drinkChance(state, lager), 0);
  const cost = drinkUpgradeCost(mash, 1);
  state.money = cost - 1;
  assert.equal(upgradeDrink(state, mash.id), false);
  state.money = cost;
  assert.equal(upgradeDrink(state, "mash"), true);
  assert.equal(drinkChance(state, mash), 100);
  assert.equal(state.money, 0);
  assert.equal(drinkPrice(state, mash), mash.priceA);
  state.money = drinkUpgradeCost(lager, 1);
  assert.equal(upgradeDrink(state, "lager"), true);
  assert.equal(drinkChance(state, lager), lager.chanceA ?? 0);
  assert.equal(drinkChance(state, mash) + drinkChance(state, lager), 100);
});

for (const drink of DRINKS) {
  test(`покупка уровня ${drink.name} требует округлённую вверх цену степени покупаемого уровня`, () => {
    const state = createGame();
    state.unlockedFeatureIds.push("other:menu-screen");
    for (let nextLevel = 1; nextLevel <= drink.maxLevel; nextLevel += 1) {
      const cost = Math.ceil(drink.costBase + nextLevel ** drink.costStep);
      assert.equal(drinkUpgradeCost(drink, nextLevel), cost);
      state.money = cost - 1;
      assert.equal(upgradeDrink(state, drink.id), false);
      assert.equal(state.money, cost - 1);
      assert.equal(state.drinkLevels[drink.id], nextLevel - 1);
      state.money = cost;
      assert.equal(upgradeDrink(state, drink.id), true);
      assert.equal(state.money, 0);
      assert.equal(state.drinkLevels[drink.id], nextLevel);
    }
  });
}

for (const drink of DRINKS.slice(1)) {
  test(`шанс ${drink.name} линейно растёт от минимума до максимума`, () => {
    const state = createGame();
    const min = drink.chanceA ?? 0;
    const max = drink.chanceB ?? 0;
    assert.equal(drinkChance(state, drink), 0);
    state.drinkLevels[drink.id] = 1;
    assert.equal(drinkChance(state, drink), min);
    const level = Math.ceil(drink.maxLevel / 2);
    state.drinkLevels[drink.id] = level;
    assert.ok(Math.abs(drinkChance(state, drink) - (min + (max - min) * (level - 1) / (drink.maxLevel - 1))) < 1e-9);
    state.drinkLevels[drink.id] = drink.maxLevel;
    assert.equal(drinkChance(state, drink), max);
  });
}

test("Бормотуха получает остаток шансов всех открытых напитков", () => {
  const state = createGame();
  for (const drink of DRINKS) state.drinkLevels[drink.id] = drink.maxLevel;
  const sum = DRINKS.slice(1).reduce((total, drink) => total + drinkChance(state, drink), 0);
  assert.equal(drinkChance(state, DRINKS[0]!), 100 - sum);
});

test("цены напитков и типы клиентов достигают заданных максимумов", () => {
  const state = createGame();
  state.money = 1_000_000_000;
  state.unlockedFeatureIds.push("other:menu-screen", "other:customers-screen");
  const mash = DRINKS[0]!;
  const sailors = CUSTOMER_TYPES[0]!;
  for (let level = 1; level <= mash.maxLevel; level += 1) assert.equal(upgradeDrink(state, mash.id), true);
  for (let level = 2; level <= sailors.maxLevel; level += 1) assert.equal(upgradeCustomerType(state, sailors.id), true);
  assert.equal(upgradeDrink(state, mash.id), false);
  assert.equal(upgradeCustomerType(state, sailors.id), false);
  assert.equal(drinkPrice(state, mash), mash.priceB);
  assert.equal(customerRate(state, sailors), sailors.rateB);
  assert.equal(customerPriceMultiplier(state, sailors), sailors.priceMultB);
});

for (const type of CUSTOMER_TYPES) {
test(`улучшение клиента ${type.name} требует цену степени уровня и списывает её один раз`, () => {
  const state = createGame();
  state.unlockedFeatureIds.push("other:customers-screen");
  state.everUnlockedCustomerTypeIds.push(type.id);
  state.customerLevels[type.id] = 3;
  const level = state.customerLevels[type.id]!;
  const cost = Math.floor(type.costBase + (level + 1) ** type.costStep);
  assert.equal(customerUpgradeCost(type, level + 1), cost);
  state.money = cost - 1;
  assert.equal(upgradeCustomerType(state, type.id), false);
  assert.equal(state.customerLevels[type.id], level);
  state.money = cost;
  assert.equal(upgradeCustomerType(state, type.id), true);
  assert.equal(state.money, 0);
  assert.equal(state.customerLevels[type.id], level + 1);
});
}

test("цена заказа сохраняет дробную базовую цену и перемножает бонусы без округления", () => {
  const state = createGame();
  const lager = DRINKS.find((drink) => drink.id === "lager")!;
  const clerks = CUSTOMER_TYPES.find((type) => type.id === "clerks")!;
  state.drinkLevels.lager = 2;
  state.customerLevels.clerks = 1;
  const basePrice = lager.priceA + (lager.priceB - lager.priceA) / (lager.maxLevel - 1);
  assert.equal(drinkPrice(state, lager), basePrice);
  assert.equal(orderPrice(state, lager, clerks, 2, 2), basePrice * (1 + clerks.priceMultA / 100) * 1.02 * 1.02);
});

test("клиент остается заблокированным до условий, затем покупается отдельно", () => {
  const state = createGame();
  state.money = 10000;
  state.unlockedFeatureIds.push("other:customers-screen", "cell-type:table");
  assert.equal(upgradeCustomerType(state, "clerks"), false);
  assert.equal(buildCell(state, 1, "table"), true);
  assert.deepEqual(syncCustomerUnlocks(state).map((feature) => feature.id), ["clerks"]);
  assert.equal(state.customerLevels.clerks, 0);
  assert.equal(upgradeCustomerType(state, "clerks"), true);
  const clerks = CUSTOMER_TYPES.find((type) => type.id === "clerks")!;
  assert.equal(customerRate(state, clerks), clerks.rateA);
});

test("клиенты запускаются после третьего задания, первый матрос приходит сразу", () => {
  const state = createGame();
  state.money = 1000;
  buildCell(state, 1, "counter");
  state.drinkLevels.mash = 1;
  state.quests.currentIndex = 2;
  advanceGame(state, 90, fixedRandom(.5));
  assert.equal(state.customers.length, 0);
  state.quests.currentIndex = 3;
  advanceGame(state, .1, fixedRandom(.5));
  assert.equal(state.customers[0]?.typeId, "sailors");
  assert.equal(state.customerArrivalsStarted, true);
  const interval = customerArrivalInterval(state);
  assert.ok(Math.abs(state.customerArrivalRemaining - (interval / 2 - .1)) < .001);
  const nextEntityId = state.nextEntityId;
  advanceGame(state, interval / 2 - .2, fixedRandom(.5));
  assert.equal(state.nextEntityId, nextEntityId);
  advanceGame(state, .2, fixedRandom(.5));
  assert.equal(state.nextEntityId, nextEntityId + 1);
  assert.ok(Math.abs(state.customerArrivalRemaining - (interval - .1)) < .001);
});

test("суммарная скорость и квота типов согласованы при целых значениях", () => {
  const state = createGame();
  state.money = 1000;
  buildCell(state, 1, "counter");
  state.drinkLevels.mash = 1;
  state.customerLevels.sailors = 3;
  state.customerLevels.clerks = 1;
  state.quests.currentIndex = 3;
  const expectedRate = CUSTOMER_TYPES.reduce((sum, type) => sum + customerRate(state, type), 0);
  assert.equal(totalCustomerRate(state), expectedRate);
  assert.equal(customerArrivalInterval(state), 60 / expectedRate);
  advanceGame(state, 59.9, fixedRandom(.4));
  const clerks = CUSTOMER_TYPES.find((type) => type.id === "clerks")!;
  assert.equal(state.customers.filter((customer) => customer.typeId === "clerks").length, Math.floor(customerRate(state, clerks)));
});

test("при нескольких дробных скоростях каждое событие создаёт клиента", () => {
  const state = createGame();
  state.money = 1000;
  buildCell(state, 1, "counter");
  state.drinkLevels.mash = 1;
  state.customerLevels.clerks = 2;
  state.customerLevels.irish = 2;
  state.quests.currentIndex = 3;
  const before = state.nextEntityId;
  advanceGame(state, 120, fixedRandom(.4));
  assert.equal(state.nextEntityId - before, 1 + Math.floor(totalCustomerRate(state) * 2 + .5));
});

