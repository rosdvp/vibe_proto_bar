import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, DECOR_CELL_TYPES, DECOR_STYLES } from "../src/config";
import { acknowledgeDecorButton, acknowledgeDecorItems, buildCell, createGame, createNewGamePlus, loadGame, removeCell, reorderFloorCells, saveGame, selectDecor, unlockAllDecor, unlockRandomDecor, upgradeCell, upgradeCostForLevel } from "../src/game";
import { RESEARCHES } from "../src/game/research";
import { requiredTierResearchId } from "../src/game/tiers";
import type { DecorCellType } from "../src/types";
import { fixedRandom } from "./support";

function prepared(type: DecorCellType = "counter") {
  const state = createNewGamePlus();
  state.money = 1_000_000;
  state.research.completedIds = RESEARCHES.map((research) => research.id);
  assert.equal(buildCell(state, 1, type), true);
  assert.equal(buildCell(state, 2, type), true);
  return { state, first: state.cells[1]!, second: state.cells[2]! };
}

function roundTrip(state: ReturnType<typeof createGame>) {
  let saved = "";
  saveGame(state, { setItem: (_key, value) => { saved = value; } });
  return loadGame({ getItem: () => saved });
}

test("служебная разблокировка открывает декор всех типов и сохраняется", () => {
  const state = createGame();
  unlockAllDecor(state);
  const loaded = roundTrip(state);
  for (const type of DECOR_CELL_TYPES) {
    for (const style of DECOR_STYLES) {
      assert.ok(loaded.decor[type].unlockedIds.includes(style.id));
      if (style.id !== "classic") assert.ok(loaded.decor[type].unseenIds.includes(style.id));
    }
    assert.equal(loaded.decor[type].buttonUnseen, true);
    assert.equal(unlockRandomDecor(loaded, type), null);
  }
});

test("служебная разблокировка сохраняет выбор и остальное состояние, повторное нажатие ничего не меняет", () => {
  const { state, first } = prepared();
  const unlock = unlockRandomDecor(state, "counter", fixedRandom())!;
  selectDecor(state, first.id, unlock.id);
  acknowledgeDecorButton(state, "counter");
  acknowledgeDecorItems(state, "counter");
  const { decor: _decor, ...before } = structuredClone(state);
  unlockAllDecor(state);
  const { decor: _updatedDecor, ...after } = state;
  assert.deepEqual(after, before);
  assert.equal(state.decor.counter.unseenIds.includes(first.decorId!), false);
  const allUnlocked = structuredClone(state);
  unlockAllDecor(state);
  assert.deepEqual(state, allUnlocked);
});

test("новая игра и новая игра+ начинают с классики без уведомлений", () => {
  for (const state of [createGame(), createNewGamePlus()]) {
    for (const type of DECOR_CELL_TYPES) {
      assert.deepEqual(state.decor[type], { unlockedIds: ["classic"], unseenIds: [], buttonUnseen: false });
    }
  }
});

for (const type of DECOR_CELL_TYPES) {
  test(`${type}: переходы тира разных ячеек открывают стили без повторов`, () => {
    const { state, first, second } = prepared(type);
    const before = state.decor[type].unlockedIds.length;
    first.level = 8;
    assert.deepEqual(upgradeCell(state, first.id, fixedRandom()), { success: true, unlocks: [] });
    assert.equal(state.decor[type].unlockedIds.length, before);
    for (const [cell, level] of [[first, 9], [first, 19], [second, 9]] as const) {
      cell.level = level;
      const previous = [...state.decor[type].unlockedIds];
      const result = upgradeCell(state, cell.id, fixedRandom(.99));
      assert.equal(result.success, true);
      assert.equal(result.unlocks.length, 1);
      const feature = result.unlocks[0]!;
      assert.equal(feature.kind, "decor");
      assert.equal(previous.includes(feature.id as typeof previous[number]), false);
      assert.ok(state.decor[type].unlockedIds.includes(feature.id as typeof previous[number]));
      assert.ok(state.decor[type].buttonUnseen);
      assert.equal(state.decor[type].unseenIds.at(-1), feature.id);
      if (feature.kind === "decor") assert.equal(feature.cellType, type);
    }
    assert.equal(state.decor[type].unlockedIds.length, DECOR_STYLES.length);
    second.level = 19;
    assert.deepEqual(upgradeCell(state, second.id, fixedRandom()), { success: true, unlocks: [] });
  });
}

test("случайный выбор использует весь список закрытых стилей", () => {
  const locked = DECOR_STYLES.filter((style) => style.id !== "classic");
  locked.forEach((style, index) => {
    const state = createGame();
    const result = unlockRandomDecor(state, "counter", fixedRandom((index + .5) / locked.length));
    assert.equal(result?.id, style.id);
  });
});

test("недостаток денег не меняет уровень и не выдаёт декор", () => {
  const { state, first } = prepared();
  first.level = 9;
  state.money = upgradeCostForLevel(first.level + 1) - 1;
  const before = structuredClone(state);
  assert.deepEqual(upgradeCell(state, first.id), { success: false, unlocks: [] });
  assert.deepEqual(state, before);
});

test("без исследования перехода тира декор не выдаётся", () => {
  const { state, first } = prepared();
  first.level = 9;
  state.research.completedIds = state.research.completedIds.filter((id) => id !== requiredTierResearchId(first.type as DecorCellType, first.level + 1));
  const before = structuredClone(state);
  assert.deepEqual(upgradeCell(state, first.id), { success: false, unlocks: [] });
  assert.deepEqual(state, before);
});

test("декор нельзя выдать улучшением входа, лестницы или отсутствующей ячейки", () => {
  const state = createNewGamePlus();
  assert.equal(buildCell(state, 0, "stairs", -1), true);
  for (const id of [state.cells[0]!.id, state.cells[1]!.id, "missing"]) {
    assert.deepEqual(upgradeCell(state, id), { success: false, unlocks: [] });
  }
});

test("разблокировка общая для типа, а выбор индивидуальный и бесплатный", () => {
  const { state, first, second } = prepared();
  const unlocked = unlockRandomDecor(state, "counter", fixedRandom())!;
  const money = state.money;
  assert.equal(selectDecor(state, first.id, unlocked.id), true);
  assert.equal(first.decorId, unlocked.id);
  assert.equal(second.decorId, "classic");
  assert.equal(state.money, money);
  assert.equal(selectDecor(state, second.id, unlocked.id), true);
});

test("закрытый, неизвестный и чужой стиль выбрать нельзя", () => {
  const { state, first } = prepared();
  const locked = DECOR_STYLES.find((style) => style.id !== "classic")!;
  unlockRandomDecor(state, "table", fixedRandom());
  for (const [id, style] of [[first.id, locked.id], [first.id, "missing"], ["missing", "classic"], [state.cells[0]!.id, "classic"]]) {
    assert.equal(selectDecor(state, id!, style!), false);
  }
  assert.equal(first.decorId, "classic");
});

test("просмотр кнопки и строк подтверждается отдельно", () => {
  const state = createGame();
  unlockRandomDecor(state, "counter", fixedRandom());
  const unseen = [...state.decor.counter.unseenIds];
  acknowledgeDecorButton(state, "counter");
  assert.equal(state.decor.counter.buttonUnseen, false);
  assert.deepEqual(state.decor.counter.unseenIds, unseen);
  assert.deepEqual(roundTrip(state).decor, state.decor);
  acknowledgeDecorItems(state, "counter");
  assert.deepEqual(state.decor.counter.unseenIds, []);
});

test("выбор и уведомления сохраняются, несовместимое состояние сбрасывается", () => {
  const { state, first } = prepared();
  const unlock = unlockRandomDecor(state, "counter", fixedRandom())!;
  selectDecor(state, first.id, unlock.id);
  const loaded = roundTrip(state);
  assert.equal(loaded.cells.find((cell) => cell.id === first.id)?.decorId, unlock.id);
  assert.deepEqual(loaded.decor, state.decor);
  const invalid = structuredClone(state);
  invalid.decor.counter.unlockedIds = ["classic"];
  assert.deepEqual(roundTrip(invalid), createGame());
});

test("перемещение сохраняет выбор, удаление сохраняет разблокировку, новая ячейка классическая", () => {
  const { state, first, second } = prepared();
  const unlock = unlockRandomDecor(state, "counter", fixedRandom())!;
  selectDecor(state, first.id, unlock.id);
  assert.equal(reorderFloorCells(state, 0, [state.cells[0]!.id, second.id, first.id]), true);
  assert.equal(first.decorId, unlock.id);
  assert.equal(removeCell(state, first.id), true);
  assert.ok(state.decor.counter.unlockedIds.some((id) => id === unlock.id));
  assert.equal(buildCell(state, 2, "counter"), true);
  assert.equal(state.cells.find((cell) => cell.x === 2 && cell.y === 0)?.decorId, "classic");
});


test("максимальный уровень не выдаёт новые варианты", () => {
  const { state, first } = prepared();
  first.level = CONFIG.maxCellLevel;
  const before = structuredClone(state);
  assert.deepEqual(upgradeCell(state, first.id), { success: false, unlocks: [] });
  assert.deepEqual(state, before);
});
