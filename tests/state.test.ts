import assert from "node:assert/strict";
import test from "node:test";
import { BUILDABLE_CELL_TYPES, CONFIG, DRINKS, QUESTS } from "../src/config";
import { buildCell, createGame, createNewGamePlus, loadGame, saveGame, syncPersonnel, unlockFeature } from "../src/game";

test("новая игра+ разблокирует все фичи при обычном стартовом состоянии", () => {
  const state = createNewGamePlus();
  assert.equal(state.money, createGame().money);
  assert.deepEqual(state.cells, createGame().cells);
  assert.deepEqual(state.menu, []);
  assert.equal(state.quests.currentIndex, 0);
  const expected = [
    ...DRINKS.map((drink) => `menu-item:${drink.id}`),
    ...BUILDABLE_CELL_TYPES.map((type) => `cell-type:${type}`),
    ...QUESTS.flatMap((quest) => (quest.unlocks ?? []).map((feature) => `${feature.kind}:${feature.id}`)),
  ];
  for (const id of expected) assert.ok(state.unlockedFeatureIds.includes(id), id);
  assert.deepEqual(state.unseenUnlockIds, []);
  assert.equal(new Set(state.unlockedFeatureIds).size, state.unlockedFeatureIds.length);
});

test("состояние сохраняется и восстанавливается без офлайн-прогресса", () => {
  let value: string | null = null;
  const state = createGame();
  state.money = 123;
  state.customerArrivalRemaining = 12.5;
  state.customerArrivalRating = 7;
  state.hold.energy = 123.4;
  state.hold.heat = 2.5;
  state.hold.cooldownRemaining = 1.5;
  state.quests.currentIndex = 4;
  state.quests.incrementalProgress = 1;
  state.research.active = { id: "tables", remaining: 12.5 };
  state.unlockedFeatureIds.push("cell-type:table");
  unlockFeature(state, { kind: "menu-item", id: "lager", name: "Лагер" });
  saveGame(state, { setItem: (_key, next) => { value = next; } });

  const loaded = loadGame({ getItem: () => value });
  assert.equal(loaded.money, 123);
  assert.equal(loaded.customerArrivalRemaining, 12.5);
  assert.equal(loaded.customerArrivalRating, 7);
  assert.equal(loaded.hold.energy, 123.4);
  assert.equal(loaded.hold.heat, 2.5);
  assert.equal(loaded.hold.cooldownRemaining, 1.5);
  assert.equal(loaded.quests.currentIndex, 4);
  assert.equal(loaded.quests.incrementalProgress, 1);
  assert.deepEqual(loaded.research.active, { id: "tables", remaining: 12.5 });
  assert.equal(loaded.unlockedFeatureIds.includes("cell-type:table"), true);
  assert.deepEqual(loaded.unseenUnlockIds, ["menu-item:lager"]);
});

test("длительное исследование инфраструктуры переживает сохранение", () => {
  let value: string | null = null;
  const state = createGame();
  state.research.active = { id: "dig-wide-iii", remaining: 590 };
  saveGame(state, { setItem: (_key, next) => { value = next; } });
  assert.deepEqual(loadGame({ getItem: () => value }).research.active, { id: "dig-wide-iii", remaining: 590 });
});

test("при загрузке пересчитывается бонус скорости сотрудников из текущего баланса", () => {
  let value: string | null = null;
  const state = createGame();
  state.money = 1000;
  unlockFeature(state, { kind: "cell-type", id: "taps", name: "Кран" });
  unlockFeature(state, { kind: "cell-type", id: "waiter-station", name: "Стойка официанта" });
  buildCell(state, 1, "taps");
  buildCell(state, 2, "waiter-station");
  state.cells.find((cell) => cell.type === "taps")!.level = 6;
  state.cells.find((cell) => cell.type === "waiter-station")!.level = 6;
  syncPersonnel(state);
  state.bartenders[0]!.speedFactor = 1 / 1.1;
  state.waiters[0]!.speedFactor = 1 / 1.1;
  saveGame(state, { setItem: (_key, next) => { value = next; } });

  const loaded = loadGame({ getItem: () => value });
  assert.ok(Math.abs(loaded.bartenders[0]!.speedFactor - 1 / 1.1) < 0.0001);
  assert.ok(Math.abs(loaded.waiters[0]!.speedFactor - 1 / 1.1) < 0.0001);
});

test("несовместимая версия сохранения сбрасывается", () => {
  const loaded = loadGame({
    getItem: () => JSON.stringify({ ...createGame(), saveVersion: CONFIG.saveVersion + 1, money: 1 }),
  });

  assert.equal(loaded.money, CONFIG.startingMoney);
});

test("сохранение прежней версии сбрасывается после изменения цепочки заданий", () => {
  const previous = { ...createGame(), saveVersion: CONFIG.saveVersion - 1, money: 777 };
  const loaded = loadGame({ getItem: () => JSON.stringify(previous) });
  assert.equal(loaded.money, CONFIG.startingMoney);
  assert.equal(loaded.quests.currentIndex, 0);
});

test("поврежденное сохранение текущей версии сбрасывается", () => {
  const loaded = loadGame({
    getItem: () => JSON.stringify({ saveVersion: CONFIG.saveVersion, cells: [] }),
  });

  assert.equal(loaded.cells[0]?.type, "entrance");
  assert.equal(loaded.money, CONFIG.startingMoney);
});

test("сохранение с неполным клиентом сбрасывается", () => {
  const broken = { ...createGame(), customers: [{ id: "broken", phase: "drinking", x: 1, phaseRemaining: 1 }] };
  const loaded = loadGame({ getItem: () => JSON.stringify(broken) });

  assert.equal(loaded.customers.length, 0);
  assert.equal(loaded.money, CONFIG.startingMoney);
});
