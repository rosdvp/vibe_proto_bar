import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, CUSTOMER_TYPES } from "../src/config";
import {
  acknowledgeResearchScreenUnlock,
  isCustomerTypeUnlocked,
  buildCell,
  cellCapacity,
  cellBonusPercent,
  createGame as createBaseGame,
  removeCell,
  reorderFloorCells,
  unlockFeature,
  unlockRandomLockedCellType,
  upgradeCell,
  upgradeCostForLevel,
} from "../src/game";
import { equipmentIssue, workSpeedBonusPercent } from "../src/game/selectors";
import { floorWidth, floorWidthLimit, floorCountLimit } from "../src/game/infrastructure";

function createGame(): ReturnType<typeof createBaseGame> {
  const state = createBaseGame();
  state.money = 1000;
  state.unlockedFeatureIds.push("cell-type:taps", "cell-type:stairs", "cell-type:waiter-station", "cell-type:table");
  return state;
}

test("разблокировки применяются сразу и повторно не срабатывают", () => {
  const state = createBaseGame();
  const table = { kind: "cell-type", id: "table", name: "Столик" } as const;

  assert.equal(state.unlockedFeatureIds.includes("cell-type:table"), false);
  assert.equal(unlockFeature(state, table), true);
  assert.equal(state.unlockedFeatureIds.includes("cell-type:table"), true);
  assert.equal(unlockFeature(state, table), false);
});

test("служебная разблокировка выбирает только заблокированные типы ячеек", () => {
  const state = createBaseGame();
  const seen = new Set(state.unlockedFeatureIds);
  while (true) {
    const feature = unlockRandomLockedCellType(state, () => 0);
    if (!feature) break;
    const key = `${feature.kind}:${feature.id}`;
    assert.equal(seen.has(key), false);
    assert.ok(state.unlockedFeatureIds.includes(key));
    seen.add(key);
  }
  assert.equal(unlockRandomLockedCellType(state, () => 0), null);
});

test("оборудование сообщает о недостающей зависимости только внутри своей комнаты", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "table");
  const counter = state.cells.find((cell) => cell.type === "counter");
  const table = state.cells.find((cell) => cell.type === "table");
  assert.ok(counter && table);

  assert.equal(equipmentIssue(state, counter), "Не хватает крана");
  assert.equal(equipmentIssue(state, table), "Не хватает стойки официанта");

  buildCell(state, 3, "waiter-station");
  const station = state.cells.find((cell) => cell.type === "waiter-station");
  assert.ok(station);
  assert.equal(equipmentIssue(state, station), "Не хватает крана");
  assert.equal(equipmentIssue(state, table), null);

  buildCell(state, 4, "taps");
  assert.equal(equipmentIssue(state, counter), null);
  assert.equal(equipmentIssue(state, station), null);
});

test("перемещение применяет итоговый порядок ячеек и не сдвигает вход", () => {
  const state = createGame();
  state.money = 1000;
  buildCell(state, 1, "counter");
  buildCell(state, 2, "table");
  buildCell(state, 3, "taps");
  const [entrance, counter, table, taps] = state.cells;
  assert.ok(entrance && counter && table && taps);

  assert.equal(reorderFloorCells(state, 0, [entrance.id, taps.id, counter.id, table.id]), true);
  assert.deepEqual(state.cells.filter((cell) => cell.y === 0).map((cell) => cell.id), [entrance.id, taps.id, counter.id, table.id]);
  assert.equal(reorderFloorCells(state, 0, [counter.id, entrance.id, taps.id, table.id]), false);
  assert.equal(entrance.x, 0);
});

test("активные персонажи перемещаются с ячейками, а движущиеся только перестраивают маршрут", () => {
  const state = createGame();
  state.money = 1000;
  buildCell(state, 1, "counter");
  buildCell(state, 2, "table");
  buildCell(state, 3, "taps");
  buildCell(state, 4, "waiter-station");
  const entrance = state.cells.find((cell) => cell.type === "entrance");
  const counter = state.cells.find((cell) => cell.type === "counter");
  const table = state.cells.find((cell) => cell.type === "table");
  const taps = state.cells.find((cell) => cell.type === "taps");
  const station = state.cells.find((cell) => cell.type === "waiter-station");
  const bartender = state.bartenders[0];
  const waiter = state.waiters[0];
  assert.ok(entrance && counter && table && taps && station && bartender && waiter);
  state.customers.push({
    id: "seated", typeId: "clerks", x: table.x, y: 0, phase: "drinking", phaseRemaining: 5,
    moveFromX: table.x, moveFromY: 0, moveTargetX: table.x, moveTargetY: 0, moveDuration: 0, movePath: [], localX: .2,
    activity: "table", targetCellId: table.id, slotIndex: 0, orderId: "lager",
    bartenderId: null, waiterId: waiter.id, waitingElapsed: 0, waitingDirection: 1,
  });
  state.customers.push({
    id: "passing", typeId: "clerks", x: 1, y: 0, phase: "moving-table", phaseRemaining: 1,
    moveFromX: 1, moveFromY: 0, moveTargetX: 2, moveTargetY: 0, moveDuration: 2, movePath: [{ x: 3, y: 0 }], localX: .5,
    moveFromLocalX: .5, moveTargetLocalX: .5, moveEndLocalX: .8,
    activity: "table", targetCellId: table.id, slotIndex: 1, orderId: "lager",
    bartenderId: null, waiterId: null, waitingElapsed: 0, waitingDirection: 1,
  });
  Object.assign(bartender, { phase: "pouring", x: taps.x, y: 0, localX: .74, customerId: "seated", tapCellId: taps.id, tapSlot: 0 });
  Object.assign(waiter, { phase: "listening", x: table.x, y: 0, localX: .4, customerId: "seated" });

  assert.equal(reorderFloorCells(state, 0, [entrance.id, table.id, taps.id, station.id, counter.id]), true);
  assert.equal(state.customers[0]?.x, table.x);
  assert.equal(state.customers[0]?.localX, .2);
  assert.equal(bartender.x, taps.x);
  assert.equal(bartender.localX, .74);
  assert.equal(waiter.x, table.x);
  assert.equal(waiter.localX, .4);
  assert.equal(state.customers[1]?.x, 2);
  assert.ok(state.customers[1]?.movePath.every((point) => point.x !== 3));
});

for (const cellType of ["table", "counter", "toilet-stall"] as const) {
  test(`этаж допускает одну ячейку ${cellType} сверх лимита и ждёт исследования для продолжения`, () => {
    const state = createGame();
    unlockFeature(state, { kind: "cell-type", id: cellType, name: cellType });
    state.money = 5000;

    assert.equal(buildCell(state, -1, "counter"), false);
    const researchIds = ["dig-wide", "dig-wide-ii", "dig-wide-iii"];
    let x = 1;
    for (const [index, limit] of [CONFIG.initialFloorWidthLimit, ...CONFIG.floorWidthResearchLimits].entries()) {
      if (index > 0) state.research.completedIds.push(researchIds[index - 1]!);
      assert.equal(floorWidthLimit(state), limit);
      while (floorWidth(state, 0) <= limit) {
        state.money = CONFIG.buildCost;
        assert.equal(buildCell(state, x++, cellType), true);
      }
      state.money = CONFIG.buildCost;
      const width = floorWidth(state, 0);
      assert.equal(buildCell(state, x, cellType), false);
      assert.equal(floorWidth(state, 0), width);
    }
  });
}

test("исследования глубины последовательно расширяют лимит этажей", () => {
  const state = createGame();
  state.money = 5000;
  const researchIds = ["dig-deep", "dig-deep-ii", "dig-deep-iii"];
  let depth = 1;
  for (const [index, limit] of [CONFIG.initialFloorCountLimit, ...CONFIG.floorCountResearchLimits].entries()) {
    if (index > 0) state.research.completedIds.push(researchIds[index - 1]!);
    assert.equal(floorCountLimit(state), limit);
    while (depth < limit) {
      state.money = CONFIG.buildCost;
      assert.equal(buildCell(state, 0, "stairs", -depth++), true);
    }
    assert.equal(buildCell(state, 0, "stairs", -depth), false);
  }
});

test("новый этаж начинается только лестницей над входом или лестницей", () => {
  const state = createGame();

  assert.equal(buildCell(state, 0, "counter", -1), false);
  assert.equal(buildCell(state, 0, "stairs", 1), false);
  assert.equal(buildCell(state, 0, "stairs", -1), true);
  assert.equal(buildCell(state, 1, "table", -1), true);
  assert.equal(buildCell(state, 1, "stairs", -2), false);
  assert.equal(buildCell(state, 0, "stairs", -2), false);
});

test("разблокировка лестницы разрешает её постройку только на втором этаже", () => {
  const state = createBaseGame();
  assert.equal(buildCell(state, 0, "stairs", -1), false);
  unlockFeature(state, { kind: "cell-type", id: "stairs", name: "Лестница" });
  assert.equal(buildCell(state, 0, "stairs", -1), true);
  assert.equal(buildCell(state, 0, "stairs", -2), false);
});

test("лестница не имеет уровня", () => {
  const state = createGame();
  buildCell(state, 0, "stairs", -1);
  const stairs = state.cells.find((cell) => cell.type === "stairs");
  assert.ok(stairs);
  assert.equal(upgradeCell(state, stairs.id).success, false);
});

test("уничтожение возвращает полную стоимость и сдвигает правые ячейки", () => {
  const state = createGame();
  state.money = 1000;
  buildCell(state, 1, "counter");
  buildCell(state, 2, "table");
  const counter = state.cells.find((cell) => cell.type === "counter");
  const table = state.cells.find((cell) => cell.type === "table");
  assert.ok(counter && table);
  upgradeCell(state, counter.id);
  upgradeCell(state, counter.id);

  const moneyBeforeRemoval = state.money;
  assert.equal(removeCell(state, counter.id), true);
  assert.equal(state.money, moneyBeforeRemoval + CONFIG.buildCost + upgradeCostForLevel(2) + upgradeCostForLevel(3));
  assert.equal(table.x, 1);
});

test("цена улучшения зависит от покупаемого уровня и доступных денег", () => {
  const state = createGame();
  const cell = { id: "counter", x: 1, y: 0, type: "counter", level: 1 } as const;
  state.cells.push({ ...cell });
  state.money = upgradeCostForLevel(2) - 1;

  assert.equal(upgradeCell(state, cell.id).success, false);
  state.money = [2, 3, 4].reduce((sum, level) => sum + upgradeCostForLevel(level), 0);
  assert.equal(upgradeCell(state, cell.id).success, true);
  assert.equal(upgradeCell(state, cell.id).success, true);
  assert.equal(upgradeCell(state, cell.id).success, true);
  assert.equal(state.money, 0);
});

test("вход и лестницу уничтожить нельзя", () => {
  const state = createGame();
  buildCell(state, 0, "stairs", -1);
  const stairs = state.cells.find((cell) => cell.type === "stairs");
  assert.ok(stairs);

  assert.equal(removeCell(state, "cell-0"), false);
  assert.equal(removeCell(state, stairs.id), false);
});

test("удаление официанта убирает его клиента и освобождает готовящего напиток бармена", () => {
  const state = createGame();
  buildCell(state, 1, "table");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "waiter-station");
  const table = state.cells.find((cell) => cell.type === "table");
  const station = state.cells.find((cell) => cell.type === "waiter-station");
  const bartender = state.bartenders[0];
  const waiter = state.waiters[0];
  assert.ok(table && station && bartender && waiter);
  state.customers.push({
    id: "customer-test", typeId: "clerks", x: 1, y: 0, phase: "waiting-drink", phaseRemaining: 0,
    moveFromX: 1, moveFromY: 0, moveTargetX: 1, moveTargetY: 0, moveDuration: 0, movePath: [],
    activity: "table", targetCellId: table.id, slotIndex: 0, orderId: "lager",
    bartenderId: bartender.id, waiterId: waiter.id, waitingElapsed: 0, waitingDirection: 1,
  });
  Object.assign(waiter, { phase: "waiting-drink", customerId: "customer-test" });
  Object.assign(bartender, { phase: "pouring", customerId: "customer-test", tapCellId: bartender.homeTapCellId, tapSlot: 0 });

  assert.equal(removeCell(state, station.id), true);
  assert.equal(state.customers.length, 0);
  assert.equal(state.waiters.length, 0);
  assert.equal(bartender.phase, "idle");
  assert.equal(bartender.customerId, null);
});

test("удаление крана прерывает бармена из другой ячейки, который им пользуется", () => {
  const state = createGame();
  buildCell(state, 1, "counter");
  buildCell(state, 2, "taps");
  buildCell(state, 3, "taps");
  const counter = state.cells.find((cell) => cell.type === "counter");
  const taps = state.cells.filter((cell) => cell.type === "taps");
  const bartender = state.bartenders[0];
  assert.ok(counter && taps[1] && bartender);
  state.customers.push({
    id: "customer-tap", typeId: "sailors", x: 1, y: 0, phase: "waiting-drink", phaseRemaining: 0,
    moveFromX: 1, moveFromY: 0, moveTargetX: 1, moveTargetY: 0, moveDuration: 0, movePath: [],
    activity: "counter", targetCellId: counter.id, slotIndex: 0, orderId: "mash",
    bartenderId: bartender.id, waiterId: null, waitingElapsed: 0, waitingDirection: 1,
  });
  Object.assign(bartender, { phase: "pouring", customerId: "customer-tap", tapCellId: taps[1].id, tapSlot: 0 });

  assert.equal(removeCell(state, taps[1].id), true);
  assert.equal(state.customers.length, 0);
  assert.equal(bartender.phase, "idle");
  assert.equal(bartender.tapCellId, null);
});

test("стойка и стол имеют постоянное количество мест", () => {
  assert.equal(cellCapacity({ id: "counter", x: 1, y: 0, type: "counter", level: 1 }), CONFIG.counterCapacity);
  assert.equal(cellCapacity({ id: "table", x: 2, y: 0, type: "table", level: 15 }), CONFIG.tableCapacity);
});

test("каждая стойка официанта дает одного привязанного официанта", () => {
  const state = createGame();
  buildCell(state, 1, "waiter-station");
  const station = state.cells.find((cell) => cell.type === "waiter-station");

  assert.ok(station);
  assert.equal(state.waiters.length, 1);
  assert.equal(state.waiters[0]?.homeStationCellId, station.id);
  station.level = 6;
  upgradeCell(state, station.id);
  assert.ok(Math.abs((state.waiters[0]?.speedFactor ?? 0) - 1 / (1 + workSpeedBonusPercent(station.level) / 100)) < 0.0001);
});
