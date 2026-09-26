import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, QUESTS } from "../src/config";
import {
  claimQuestReward,
  createGame,
  currentQuestProgress,
  recordCustomerPayment,
  recordHoldSeconds,
  recordScreenOpen,
  isCellTypeUnlocked,
} from "../src/game";

test("награда не собирается до выполнения, а после сбора открывает следующую фичу", () => {
  const state = createGame();
  assert.equal(claimQuestReward(state).claimed, false);
  state.cells.push({ id: "counter", x: 1, y: 0, type: "counter", level: 1 });
  const money = state.money;

  assert.equal(currentQuestProgress(state)?.complete, true);
  assert.equal(state.quests.currentIndex, 0);
  const result = claimQuestReward(state);
  assert.equal(result.claimed, true);
  assert.deepEqual(result.unlocks.map((feature) => feature.id), ["taps"]);
  assert.equal(state.money, money + CONFIG.buildCost);
  assert.equal(state.quests.currentIndex, 1);
  assert.equal(state.unlockedFeatureIds.includes("cell-type:taps"), true);
});

test("состояниевые задания учитывают уже достигнутое состояние", () => {
  const state = createGame();
  state.quests.currentIndex = 4;
  state.cells.push({ id: "counter", x: 1, y: 0, type: "counter", level: 2 });
  assert.deepEqual(currentQuestProgress(state), { quest: QUESTS[4], current: 2, complete: false });
  state.cells.find((cell) => cell.id === "counter")!.level = 3;
  assert.deepEqual(currentQuestProgress(state), { quest: QUESTS[4], current: 3, complete: true });

});

test("обслуживание считается только для активного задания и нужного типа клиента", () => {
  const state = createGame();
  recordCustomerPayment(state, "sailors");
  assert.equal(state.quests.incrementalProgress, 0);

  state.quests.currentIndex = 3;
  recordCustomerPayment(state, "clerks");
  recordCustomerPayment(state, "sailors");
  recordCustomerPayment(state, "sailors");
  recordCustomerPayment(state, "sailors");
  assert.equal(state.quests.incrementalProgress, 2);
  assert.equal(currentQuestProgress(state)?.complete, true);

  claimQuestReward(state);
  assert.equal(state.quests.incrementalProgress, 0);
});

test("ускорение считает только фактически работающие секунды активного задания", () => {
  const state = createGame();
  state.quests.currentIndex = 5;
  recordHoldSeconds(state, 3.25);
  recordHoldSeconds(state, 8);
  assert.equal(state.quests.incrementalProgress, 10);
  assert.equal(currentQuestProgress(state)?.complete, true);
});

test("седьмое задание не открывает лестницу, а восьмое считает ускорение заново", () => {
  const state = createGame();
  state.quests.currentIndex = 6;
  state.cells.push({ id: "taps", x: 1, y: 0, type: "taps", level: 3 });
  recordHoldSeconds(state, 10);
  assert.deepEqual(claimQuestReward(state).unlocks, []);
  assert.equal(state.unlockedFeatureIds.includes("cell-type:stairs"), false);
  assert.equal(state.quests.currentIndex, 7);
  assert.deepEqual(currentQuestProgress(state), { quest: QUESTS[7], current: 0, complete: false });
  recordHoldSeconds(state, 10);
  assert.equal(currentQuestProgress(state)?.complete, true);
  const money = state.money;
  assert.equal(claimQuestReward(state).claimed, true);
  assert.equal(state.money, money + 70);
  assert.equal(state.quests.currentIndex, 8);
});

test("новые задания проверяют рейтинг, число кранов и продажи Лагера", () => {
  const state = createGame();
  state.quests.currentIndex = 9;
  state.cells.push({ id: "counter", x: 1, y: 0, type: "counter", level: 8 });
  assert.equal(currentQuestProgress(state)?.complete, false);
  state.cells[1]!.level = 9;
  assert.equal(currentQuestProgress(state)?.complete, true);
  claimQuestReward(state);

  state.cells.push({ id: "tap-1", x: 2, y: 0, type: "taps", level: 1 });
  assert.equal(currentQuestProgress(state)?.complete, false);
  state.cells.push({ id: "tap-2", x: 3, y: 0, type: "taps", level: 1 });
  assert.deepEqual(claimQuestReward(state).unlocks.map((feature) => feature.id), ["lager"]);
  assert.equal(state.unlockedFeatureIds.includes("menu-item:lager"), true);

  recordCustomerPayment(state, "sailors", "mash", 5);
  for (let index = 0; index < 5; index += 1) recordCustomerPayment(state, "sailors", "lager", 10);
  assert.equal(currentQuestProgress(state)?.complete, true);
  claimQuestReward(state);
  assert.equal(state.quests.currentIndex, 12);
  assert.equal(state.quests.incrementalProgress, 0);
});

test("заработок считается только после активации задания и открывает экран клиентов", () => {
  const state = createGame();
  recordCustomerPayment(state, "sailors", "mash", 100);
  state.quests.currentIndex = 12;
  state.money += 1000;
  assert.equal(currentQuestProgress(state)?.current, 0);
  recordCustomerPayment(state, "sailors", "mash", 120);
  recordCustomerPayment(state, "sailors", "mash", 80);
  assert.equal(currentQuestProgress(state)?.complete, true);
  assert.deepEqual(claimQuestReward(state).unlocks.map((feature) => feature.id), ["customers-screen"]);
  assert.equal(isCellTypeUnlocked(state, "stairs"), false);
});

test("посещение экрана клиентов открывает исследования", () => {
  const state = createGame();
  state.quests.currentIndex = 13;
  recordScreenOpen(state, "customers");
  assert.equal(currentQuestProgress(state)?.complete, true);
  assert.deepEqual(claimQuestReward(state).unlocks.map((feature) => feature.id), ["research-screen"]);
  assert.equal(state.unlockedFeatureIds.includes("other:research-screen"), true);
  assert.equal(currentQuestProgress(state)?.quest.id, "research-tables");
  assert.equal(currentQuestProgress(state)?.complete, false);
  assert.equal(isCellTypeUnlocked(state, "waiter-station"), false);
  assert.equal(isCellTypeUnlocked(state, "table"), false);
});

test("исследование столиков завершает новое задание с наградой 50", () => {
  const state = createGame();
  state.quests.currentIndex = 14;
  state.research.completedIds.push("tables");
  assert.equal(currentQuestProgress(state)?.complete, true);
  const money = state.money;
  assert.deepEqual(claimQuestReward(state).unlocks.map((feature) => feature.id), ["stairs"]);
  assert.equal(state.money, money + 50);
  assert.equal(isCellTypeUnlocked(state, "stairs"), true);
  assert.equal(currentQuestProgress(state)?.quest.id, "build-stairs");
});

test("задания на втором этаже проверяют тип постройки и этаж", () => {
  const state = createGame();
  state.quests.currentIndex = 15;
  state.cells.push({ id: "stairs", x: 0, y: -1, type: "stairs", level: 1 });
  assert.equal(claimQuestReward(state).claimed, true);
  for (const [type, id] of [["table", "build-second-floor-table"], ["waiter-station", "build-second-floor-waiter-station"], ["taps", "build-second-floor-taps"]] as const) {
    assert.equal(currentQuestProgress(state)?.quest.id, id);
    state.cells.push({ id: `${type}-first`, x: state.cells.length, y: 0, type, level: 1 });
    assert.equal(currentQuestProgress(state)?.complete, false);
    state.cells.push({ id: `${type}-second`, x: state.cells.length, y: -1, type, level: 1 });
    assert.equal(claimQuestReward(state).claimed, true);
  }
  assert.equal(currentQuestProgress(state)?.quest.id, "serve-clerks");
});

test("финальная награда завершает цепочку после обслуживания 10 клерков", () => {
  const state = createGame();
  state.quests.currentIndex = QUESTS.length - 1;
  assert.equal(currentQuestProgress(state)?.complete, false);
  recordCustomerPayment(state, "sailors");
  assert.equal(currentQuestProgress(state)?.current, 0);
  for (let index = 0; index < 10; index += 1) recordCustomerPayment(state, "clerks");
  assert.equal(currentQuestProgress(state)?.complete, true);
  assert.equal(claimQuestReward(state).claimed, true);
  assert.equal(state.quests.currentIndex, QUESTS.length);
  assert.equal(currentQuestProgress(state), null);
});
