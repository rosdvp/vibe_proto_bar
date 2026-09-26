import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOMER_TYPES } from "../src/config";
import {
  acknowledgeMenuUnlocks,
  acknowledgeResearchScreenUnlock,
  isCustomerTypeUnlocked,
  buildCell,
  cellCapacity,
  cellBonusPercent,
  barRating,
  createGame as createBaseGame,
  menuCapacity,
  removeCell,
  reorderFloorCells,
  toggleMenuItem,
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
  state.unlockedFeatureIds.push("cell-type:taps", "cell-type:stairs", "cell-type:waiter-station", "cell-type:table", "menu-item:lager", "menu-item:red-ale");
  return state;
}

test("новые разблокировки меню и исследований отмечаются до просмотра", () => {
  const state = createBaseGame();
  assert.deepEqual(state.unseenUnlockIds, []);
  assert.equal(unlockFeature(state, { kind: "menu-item", id: "lager", name: "Лагер" }), true);
  assert.equal(unlockFeature(state, { kind: "menu-item", id: "lager", name: "Лагер" }), false);
  assert.equal(unlockFeature(state, { kind: "other", id: "research-screen", name: "Исследования" }), true);
  assert.deepEqual(state.unseenUnlockIds, ["menu-item:lager", "other:research-screen"]);
  acknowledgeMenuUnlocks(state);
  assert.deepEqual(state.unseenUnlockIds, ["other:research-screen"]);
  acknowledgeResearchScreenUnlock(state);
  assert.deepEqual(state.unseenUnlockIds, []);
});

test("разблокировки применяются сразу и повторно не срабатывают", () => {
  const state = createBaseGame();
  const table = { kind: "cell-type", id: "table", name: "Столик" } as const;

  assert.equal(state.unlockedFeatureIds.includes("cell-type:table"), false);
  assert.equal(unlockFeature(state, table), true);
  assert.equal(state.unlockedFeatureIds.includes("cell-type:table"), true);
  assert.equal(unlockFeature(state, table), false);
});

test("игровые действия не обходят блокировку контента", () => {
  const state = createBaseGame();

  assert.equal(buildCell(state, 1, "table"), false);
  assert.equal(toggleMenuItem(state, "lager"), false);
  assert.equal(state.money, 100);
  assert.deepEqual(state.menu, []);
});

test("служебная разблокировка выбирает только заблокированные типы ячеек", () => {
  const state = createBaseGame();
  const first = unlockRandomLockedCellType(state, () => 0);
  const second = unlockRandomLockedCellType(state, () => 0);

  assert.equal(first?.id, "taps");
  assert.equal(second?.id, "waiter-station");
  assert.equal(unlockRandomLockedCellType(state, () => 0)?.id, "table");
  assert.equal(unlockRandomLockedCellType(state, () => 0)?.id, "stairs");
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

test("этаж допускает одну ячейку сверх лимита и ждёт исследования для продолжения", () => {
  const state = createGame();
  state.money = 5000;

  assert.equal(buildCell(state, -1, "counter"), false);
  for (let x = 1; x <= 6; x += 1) assert.equal(buildCell(state, x, "table"), true);
  assert.equal(floorWidth(state, 0), 1020);
  assert.equal(floorWidthLimit(state), 1000);
  assert.equal(buildCell(state, 7, "table"), false);
  state.research.completedIds.push("dig-wide");
  assert.equal(floorWidthLimit(state), 1200);
  for (let x = 7; x <= 8; x += 1) assert.equal(buildCell(state, x, "table"), true);
  assert.equal(buildCell(state, 9, "table"), false);
  state.research.completedIds.push("dig-wide-ii");
  assert.equal(floorWidthLimit(state), 1400);
  assert.equal(buildCell(state, 9, "table"), true);
  assert.equal(buildCell(state, 10, "table"), false);
  state.research.completedIds.push("dig-wide-iii");
  assert.equal(floorWidthLimit(state), 1600);
  assert.equal(buildCell(state, 10, "table"), true);
  assert.equal(buildCell(state, 11, "table"), false);
});

test("исследования глубины последовательно открывают этажи до пятого", () => {
  const state = createGame();
  state.money = 5000;
  assert.equal(floorCountLimit(state), 2);
  assert.equal(buildCell(state, 0, "stairs", -1), true);
  assert.equal(buildCell(state, 0, "stairs", -2), false);
  for (const [id, y, limit] of [["dig-deep", -2, 3], ["dig-deep-ii", -3, 4], ["dig-deep-iii", -4, 5]] as const) {
    state.research.completedIds.push(id);
    assert.equal(floorCountLimit(state), limit);
    assert.equal(buildCell(state, 0, "stairs", y), true);
  }
  assert.equal(buildCell(state, 0, "stairs", -5), false);
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
  assert.equal(upgradeCell(state, stairs.id), false);
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
  assert.equal(state.money, moneyBeforeRemoval + 170);
  assert.equal(table.x, 1);
});

test("цена улучшения зависит от покупаемого уровня и доступных денег", () => {
  const state = createGame();
  const cell = { id: "counter", x: 1, y: 0, type: "counter", level: 1 } as const;
  state.cells.push({ ...cell });
  state.money = 29;

  assert.deepEqual([2, 3, 4].map(upgradeCostForLevel), [30, 40, 50]);
  assert.equal(upgradeCell(state, cell.id), false);
  state.money = 120;
  assert.equal(upgradeCell(state, cell.id), true);
  assert.equal(upgradeCell(state, cell.id), true);
  assert.equal(upgradeCell(state, cell.id), true);
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
  assert.equal(cellCapacity({ id: "counter", x: 1, y: 0, type: "counter", level: 1 }), 3);
  assert.equal(cellCapacity({ id: "table", x: 2, y: 0, type: "table", level: 15 }), 2);
});

test("ячейки первого уровня не дают бонусов, а третий уровень дает два шага бонуса", () => {
  const state = createGame();
  for (const [index, type] of (["counter", "taps", "waiter-station", "table"] as const).entries()) {
    state.cells.push({ id: type, x: index + 1, y: 0, type, level: 1 });
  }
  assert.equal(barRating(state), 0);
  assert.equal(cellBonusPercent(1), 0);
  state.cells.forEach((cell) => { if (cell.type !== "entrance") cell.level = 3; });
  assert.equal(barRating(state), 8);
  for (const cell of state.cells) if (cell.type !== "entrance") cell.level = 15;
  state.cells.push(...Array.from({ length: 2 }, (_, index) => ({ id: `extra-${index}`, x: index + 5, y: 0, type: "counter" as const, level: 15 })));
  assert.equal(barRating(state), 84);
  state.cells.push(...Array.from({ length: 2 }, (_, index) => ({ id: `more-${index}`, x: index + 7, y: 0, type: "counter" as const, level: 15 })));
  assert.equal(barRating(state), 112);
  assert.equal(cellBonusPercent(3), 4);
  assert.equal(workSpeedBonusPercent(3), 4);
});

test("каждый кран дает один слот пива и одного бармена", () => {
  const state = createGame();
  buildCell(state, 1, "taps");

  assert.equal(menuCapacity(state, "keg"), 1);
  assert.equal(state.bartenders.length, 1);
  assert.equal(toggleMenuItem(state, "mash"), true);
  assert.equal(toggleMenuItem(state, "lager"), false);
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
  assert.ok(Math.abs((state.waiters[0]?.speedFactor ?? 0) - 1 / 1.12) < 0.0001);
});

test("актуальные требования трех типов клиентов соответствуют GDD", () => {
  const state = createGame();
  const sailors = CUSTOMER_TYPES.find((type) => type.id === "sailors");
  const clerks = CUSTOMER_TYPES.find((type) => type.id === "clerks");
  const irish = CUSTOMER_TYPES.find((type) => type.id === "irish");
  assert.ok(sailors && clerks && irish);

  state.menu.push("mash");
  assert.equal(isCustomerTypeUnlocked(state, sailors), true);
  assert.equal(isCustomerTypeUnlocked(state, clerks), false);
  assert.equal(isCustomerTypeUnlocked(state, irish), false);

  state.cells.push({ id: "table", x: 1, y: 0, type: "table", level: 1 });
  state.menu.push("lager");
  assert.equal(isCustomerTypeUnlocked(state, clerks), true);

  state.cells.push({ id: "counter", x: 2, y: 0, type: "counter", level: 20 });
  state.menu.push("red-ale");
  assert.equal(isCustomerTypeUnlocked(state, irish), true);
});
