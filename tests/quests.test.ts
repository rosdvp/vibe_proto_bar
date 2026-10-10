import assert from "node:assert/strict";
import test from "node:test";
import { DECOR_STYLES, DRINKS, QUESTS } from "../src/config";
import { claimQuestReward, createGame, currentQuestProgress, recordCustomerPayment, recordHoldSeconds, selectDecor, unlockAllDecor } from "../src/game";
import { customerRate } from "../src/game/economy";
import { CUSTOMER_TYPES } from "../src/config";
import type { Cell } from "../src/types";

function cell(type: Cell["type"], level: number, index = 0): Cell {
  return { id: String(index), x: index, y: 0, type, level };
}

for (const [index, quest] of QUESTS.entries()) {
  const condition = quest.condition;
  if (condition.kind !== "cell-count" || condition.minLevel === undefined) continue;
  test(`${quest.id}: учитывает количество и минимальный уровень подходящих построек`, () => {
    const state = createGame();
    state.quests.currentIndex = index;
    const level = condition.minLevel!;
    const type = condition.cellType ?? "counter";
    state.cells = Array.from({ length: quest.target }, (_, i) => cell(type, level, i));
    state.cells[0]!.level = level - 1;
    state.cells.push(cell("entrance", level), cell("stairs", level));
    if (condition.cellType) state.cells.push(cell(type === "counter" ? "table" : "counter", level));
    assert.equal(currentQuestProgress(state)?.current, quest.target - 1);
    assert.equal(claimQuestReward(state).claimed, false);
    state.cells[0]!.level = level + 1;
    assert.equal(currentQuestProgress(state)?.complete, true);
    const money = state.money;
    assert.equal(claimQuestReward(state).claimed, true);
    assert.equal(state.money, money + quest.reward);
  });
}

test("уровень крана: учитывает любой кран и выдаёт награду после достижения цели", () => {
  const state = createGame();
  state.quests.currentIndex = questIndex("taps-five");
  const quest = QUESTS[state.quests.currentIndex]!;
  state.cells = [cell("taps", quest.target - 1, 0), cell("taps", 1, 1), cell("counter", quest.target, 2)];
  assert.equal(currentQuestProgress(state)?.complete, false);
  assert.equal(claimQuestReward(state).claimed, false);
  state.cells[1]!.level = quest.target;
  assert.equal(currentQuestProgress(state)?.complete, true);
  const money = state.money;
  assert.equal(claimQuestReward(state).claimed, true);
  assert.equal(state.money, money + quest.reward);
});

test("любая ячейка: вход и лестницы не учитываются", () => {
  const state = createGame();
  state.quests.currentIndex = questIndex("any-cell-twenty");
  const target = QUESTS[state.quests.currentIndex]!.target;
  state.cells = [cell("entrance", target), cell("stairs", target), cell("table", target - 1)];
  assert.equal(currentQuestProgress(state)?.complete, false);
  state.cells[2]!.level = target;
  assert.equal(currentQuestProgress(state)?.complete, true);
});

test("общий приток складывает открытые типы и не учитывает закрытые", () => {
  const state = createGame();
  state.quests.currentIndex = questIndex("total-rate-twelve");
  state.customerLevels = {};
  assert.equal(currentQuestProgress(state)?.current, 0);
  for (const type of CUSTOMER_TYPES.slice(0, 2)) state.customerLevels[type.id] = 1;
  const expected = CUSTOMER_TYPES.slice(0, 2).reduce((sum, type) => sum + customerRate(state, type), 0);
  assert.equal(currentQuestProgress(state)?.current, Math.min(expected, QUESTS[state.quests.currentIndex]!.target));
  for (const type of CUSTOMER_TYPES) state.customerLevels[type.id] = type.maxLevel;
  assert.equal(currentQuestProgress(state)?.complete, true);
});

for (const [id, definitions, field] of [
  ["all-drinks-max", DRINKS, "drinkLevels"],
  ["all-customers-max", CUSTOMER_TYPES, "customerLevels"],
] as const) {
  test(`${id}: требует максимум всех сущностей, включая закрытые`, () => {
    const state = createGame();
    state.quests.currentIndex = questIndex(id);
    state[field] = {};
    for (const definition of definitions) state[field][definition.id] = definition.maxLevel;
    for (const definition of definitions) {
      for (const level of [0, definition.maxLevel - 1]) {
        state[field][definition.id] = level;
        assert.equal(currentQuestProgress(state)?.complete, false);
      }
      state[field][definition.id] = definition.maxLevel;
    }
    assert.equal(currentQuestProgress(state)?.complete, true);
  });
}

function questIndex(id: string): number {
  const index = QUESTS.findIndex((quest) => quest.id === id);
  assert.ok(index >= 0);
  return index;
}

test("декор крана: открытые варианты, классика и декор других ячеек не выполняют задание", () => {
  const state = createGame();
  state.quests.currentIndex = questIndex("decorate-taps");
  state.cells = [cell("taps", 1, 0), cell("taps", 1, 1), cell("counter", 1, 2)];
  unlockAllDecor(state);
  const style = DECOR_STYLES.find((candidate) => candidate.id !== "classic")!;
  selectDecor(state, "1", "classic");
  selectDecor(state, "2", style.id);
  assert.equal(currentQuestProgress(state)?.current, 0);
  assert.equal(claimQuestReward(state).claimed, false);
});

for (const style of DECOR_STYLES.filter((candidate) => candidate.id !== "classic")) {
  test(`декор крана: ${style.id} на любом кране выполняет задание, включая выбор заранее`, () => {
    const state = createGame();
    state.cells = [cell("taps", 1, 0), cell("taps", 1, 1)];
    unlockAllDecor(state);
    assert.equal(selectDecor(state, "1", style.id), true);
    state.quests.currentIndex = questIndex("decorate-taps");
    assert.equal(currentQuestProgress(state)?.complete, true);
    selectDecor(state, "1", "classic");
    assert.equal(currentQuestProgress(state)?.complete, false);
    selectDecor(state, "1", style.id);
    const quest = QUESTS[state.quests.currentIndex]!;
    const money = state.money;
    assert.equal(claimQuestReward(state).claimed, true);
    assert.equal(state.money, money + quest.reward);
    assert.equal(state.quests.currentIndex, questIndex("decorate-taps") + 1);
  });
}

test("награда выдаёт сумму и разблокировки из конфига только после выполнения цели", () => {
  const state = createGame();
  state.quests.currentIndex = questIndex("use-hold");
  const quest = QUESTS[state.quests.currentIndex]!;
  const index = state.quests.currentIndex;
  const money = state.money;
  const unlocked = new Set(state.unlockedFeatureIds);
  assert.equal(claimQuestReward(state).claimed, false);
  assert.equal(state.money, money);
  recordHoldSeconds(state, quest.target);
  const result = claimQuestReward(state);
  assert.equal(result.claimed, true);
  assert.equal(state.money, money + quest.reward);
  const expected = (quest.unlocks ?? []).filter((feature) => !unlocked.has(`${feature.kind}:${feature.id}`));
  assert.deepEqual(result.unlocks, expected);
  for (const feature of expected) assert.ok(state.unlockedFeatureIds.includes(`${feature.kind}:${feature.id}`));
  assert.equal(state.quests.currentIndex, index + 1);
  assert.equal(state.quests.incrementalProgress, 0);
  assert.equal(claimQuestReward(state).claimed, false);
  assert.equal(state.money, money + quest.reward);
});

test("покупка Бормотухи завершает третье задание", () => {
  const state = createGame();
  state.quests.currentIndex = questIndex("add-mash");
  assert.equal(currentQuestProgress(state)?.complete, false);
  state.drinkLevels.mash = QUESTS[state.quests.currentIndex]!.target;
  assert.equal(currentQuestProgress(state)?.complete, true);
  assert.equal(claimQuestReward(state).claimed, true);
  assert.equal(state.quests.currentIndex, questIndex("add-mash") + 1);
});

test("цели притока матросов зависят от уровня типа", () => {
  const state = createGame();
  const sailors = CUSTOMER_TYPES.find((type) => type.id === "sailors")!;
  for (const [index, quest] of QUESTS.entries()) {
    if (quest.condition.kind !== "customer-rate" || quest.condition.customerTypeId !== sailors.id) continue;
    state.quests.currentIndex = index;
    state.customerLevels.sailors = 0;
    for (let level = 1; level <= sailors.maxLevel && customerRate(state, sailors) < quest.target; level++) {
      assert.equal(currentQuestProgress(state)?.complete, false);
      state.customerLevels.sailors = level;
    }
    assert.ok(customerRate(state, sailors) >= quest.target);
    assert.equal(currentQuestProgress(state)?.complete, true);
  }
});

test("Лагер открывается покупкой, а продажи считаются только после активации задания", () => {
  const state = createGame();
  state.quests.currentIndex = questIndex("open-lager");
  state.drinkLevels.lager = QUESTS[state.quests.currentIndex]!.target;
  assert.equal(claimQuestReward(state).claimed, true);
  recordCustomerPayment(state, "sailors", "mash", 5);
  const quest = QUESTS[state.quests.currentIndex]!;
  for (let index = 0; index < quest.target; index += 1) recordCustomerPayment(state, "sailors", "lager", 10);
  assert.equal(currentQuestProgress(state)?.complete, true);
  assert.deepEqual(claimQuestReward(state).unlocks, quest.unlocks ?? []);
});

test("ускорение учитывает только активное задание", () => {
  const state = createGame();
  const index = questIndex("use-hold");
  const target = QUESTS[index]!.target;
  recordHoldSeconds(state, target);
  state.quests.currentIndex = index;
  assert.equal(currentQuestProgress(state)?.current, 0);
  recordHoldSeconds(state, target);
  assert.equal(currentQuestProgress(state)?.complete, true);
});

test("покупка и обслуживание Клерков продвигают цепочку", () => {
  const state = createGame();
  state.quests.currentIndex = questIndex("open-clerks");
  state.customerLevels.clerks = QUESTS[state.quests.currentIndex]!.target;
  assert.equal(currentQuestProgress(state)?.complete, true);
  claimQuestReward(state);
  for (let index = 0; index < QUESTS[state.quests.currentIndex]!.target; index += 1) recordCustomerPayment(state, "clerks");
  assert.equal(currentQuestProgress(state)?.complete, true);
  claimQuestReward(state);
  assert.equal(state.quests.currentIndex, questIndex("serve-clerks") + 1);
});
