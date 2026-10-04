import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG } from "../src/config";
import { advanceResearch, claimResearch, createGame, isCellTypeUnlocked, researchStatus, startResearch, upgradeCell, upgradeCostForLevel, requiredTierResearchId, tierProgressPercent } from "../src/game";
import { RESEARCHES, researchCost, researchDuration, skipResearch, visibleResearches } from "../src/game/research";
import type { BuildableCellType } from "../src/types";

const tables = RESEARCHES.find((research) => research.id === "tables")!;

function researchGame() {
  const state = createGame();
  state.unlockedFeatureIds.push("other:research-screen");
  return state;
}

test("исследование требует оплаты и запускается только одно за раз", () => {
  const state = researchGame();
  assert.equal(startResearch(state, "tables"), false);
  state.money = CONFIG.researchCost + 10;
  assert.equal(startResearch(state, "tables"), true);
  assert.equal(state.money, 10);
  assert.equal(state.research.active?.remaining, CONFIG.researchDuration);
  assert.equal(startResearch(state, "tables"), false);
  assert.equal(startResearch(state, "darts"), false);
  assert.equal(state.money, 10);
});

test("исследования новых построек доступны без Столиков I и открывают постройку", () => {
  const state = researchGame();
  for (const research of RESEARCHES.filter((item) => item.unlocks?.some((feature) => feature.kind === "cell-type"))) {
    state.research.completedIds = [];
    state.money = researchCost(research);
    assert.equal(researchStatus(state, research), "available");
    assert.equal(startResearch(state, research.id), true);
    advanceResearch(state, researchDuration(research));
    assert.deepEqual(claimResearch(state, research.id), research.unlocks);
    for (const feature of research.unlocks ?? []) {
      assert.ok(state.unlockedFeatureIds.includes(`${feature.kind}:${feature.id}`));
    }
  }
});

test("Бильярд доступен как апгрейд и открывает постройку", () => {
  const state = researchGame();
  state.money = 1000;
  const billiards = RESEARCHES.find((item) => item.id === "billiards")!;
  assert.equal(researchStatus(state, billiards), "available");
  assert.equal(startResearch(state, "billiards"), true);
  advanceResearch(state, researchDuration(billiards));
  assert.deepEqual(claimResearch(state, "billiards"), billiards.unlocks);
});

test("служебный переключатель ускоряет исследование и отсчёт останавливается на нуле", () => {
  const state = researchGame();
  state.money = CONFIG.researchCost;
  startResearch(state, "tables");
  state.speed = 10;
  const elapsed = researchDuration(tables) / (state.speed * 2);
  advanceResearch(state, elapsed);
  assert.equal(state.research.active?.remaining, researchDuration(tables) / 2);
  assert.equal(researchStatus(state, tables), "running");
  assert.equal(claimResearch(state, "tables"), null);
  advanceResearch(state, researchDuration(tables));
  assert.equal(state.research.active?.remaining, 0);
  assert.equal(researchStatus(state, tables), "ready");
  assert.equal(isCellTypeUnlocked(state, "table"), false);
});

test("пропуск доводит апгрейд до готовности без оплаты и выдачи результата", () => {
  const state = researchGame();
  state.money = researchCost(tables);
  startResearch(state, tables.id);
  const money = state.money;
  const unlocks = [...state.unlockedFeatureIds];
  assert.equal(skipResearch(state, tables.id), true);
  assert.equal(state.research.active?.remaining, 0);
  assert.equal(researchStatus(state, tables), "ready");
  assert.equal(state.money, money);
  assert.deepEqual(state.unlockedFeatureIds, unlocks);
  assert.equal(state.research.completedIds.includes(tables.id), false);
  assert.deepEqual(claimResearch(state, tables.id), tables.unlocks);
  assert.equal(researchStatus(state, tables), "completed");
});

test("пропуск без активного апгрейда отклоняется", () => {
  assert.equal(skipResearch(researchGame(), tables.id), false);
});

test("пропуск другого апгрейда не изменяет активный таймер", () => {
  const state = researchGame();
  state.money = researchCost(tables);
  startResearch(state, tables.id);
  assert.equal(skipResearch(state, "darts"), false);
  assert.equal(state.research.active?.remaining, researchDuration(tables));
});

test("повторный пропуск готового апгрейда отклоняется", () => {
  const state = researchGame();
  state.money = researchCost(tables);
  startResearch(state, tables.id);
  skipResearch(state, tables.id);
  assert.equal(skipResearch(state, tables.id), false);
  assert.equal(researchStatus(state, tables), "ready");
});

test("подтверждение готового исследования открывает обе ячейки один раз", () => {
  const state = researchGame();
  state.money = CONFIG.researchCost;
  startResearch(state, "tables");
  advanceResearch(state, CONFIG.researchDuration);
  const unlocks = claimResearch(state, "tables");
  assert.deepEqual(unlocks, tables.unlocks);
  for (const feature of tables.unlocks ?? []) assert.ok(state.unlockedFeatureIds.includes(`${feature.kind}:${feature.id}`));
  assert.equal(researchStatus(state, tables), "completed");
  assert.equal(claimResearch(state, "tables"), null);
  assert.equal(startResearch(state, "tables"), false);
});

test("исследования недоступны до открытия экрана заданием", () => {
  const state = createGame();
  state.money = CONFIG.researchCost;
  assert.equal(startResearch(state, "tables"), false);
});

test("исследования тиров появляются по цепочке и требуют предшествующие", () => {
  const state = researchGame();
  state.money = 10_000;
  const visible = () => visibleResearches(state).map((research) => research.id);
  for (const id of ["waiters-ii", "taps-ii", "counter-ii"]) {
    const research = RESEARCHES.find((item) => item.id === id)!;
    assert.equal(visible().includes(id), true);
    assert.equal(startResearch(state, id), true);
    advanceResearch(state, researchDuration(research));
    claimResearch(state, id);
    assert.equal(visible().includes(id.replace("-ii", "-iii")), true);
  }
  state.research.completedIds = [];
  assert.equal(startResearch(state, "tables"), true);
  advanceResearch(state, CONFIG.researchDuration);
  claimResearch(state, "tables");
  assert.equal(visible().includes("tables-ii"), true);
  assert.equal(visible().includes("waiters-ii"), true);
  assert.equal(visible().includes("taps-ii"), true);
  assert.equal(visible().includes("tables-iii"), false);
  assert.equal(startResearch(state, "tables-ii"), true);
  advanceResearch(state, researchDuration(RESEARCHES.find((item) => item.id === "tables-ii")!));
  claimResearch(state, "tables-ii");
  assert.equal(visible().includes("tables-iii"), true);
  assert.equal(visible().includes("tables-ii"), true);
  assert.equal(researchStatus(state, RESEARCHES.find((research) => research.id === "tables-ii")!), "completed");
});

test("Столики II появляются и доступны только после получения результата Столиков I", () => {
  const state = researchGame();
  const second = RESEARCHES.find((item) => item.id === "tables-ii")!;
  state.money = researchCost(tables) + researchCost(second);
  const assertHidden = () => {
    assert.equal(visibleResearches(state).includes(second), false);
    assert.equal(researchStatus(state, second), "locked");
    assert.equal(startResearch(state, second.id), false);
  };
  assertHidden();
  assert.equal(startResearch(state, tables.id), true);
  assertHidden();
  advanceResearch(state, researchDuration(tables));
  assertHidden();
  claimResearch(state, tables.id);
  assert.equal(visibleResearches(state).includes(second), true);
  assert.equal(researchStatus(state, second), "available");
  assert.equal(startResearch(state, second.id), true);
});

test("исследования инфраструктуры списывают цену, запускают таймер и открывают следующий уровень", () => {
  const state = researchGame();
  state.money = 20_000;
  const visible = () => visibleResearches(state).map((item) => item.id);
  for (const stem of ["dig-wide", "dig-deep"]) {
    assert.equal(visible().includes(stem), true);
    assert.equal(visible().includes(`${stem}-ii`), false);
    for (const [id, next] of [[stem, `${stem}-ii`], [`${stem}-ii`, `${stem}-iii`], [`${stem}-iii`, ""]] as const) {
      const research = RESEARCHES.find((item) => item.id === id)!;
      const cost = researchCost(research);
      const duration = researchDuration(research);
      state.money = cost - 1;
      assert.equal(startResearch(state, id), false);
      state.money = cost;
      assert.equal(startResearch(state, id), true);
      assert.equal(state.money, 0);
      assert.equal(state.research.active?.remaining, duration);
      advanceResearch(state, duration);
      claimResearch(state, id);
      if (next) assert.equal(visible().includes(next), true);
    }
  }
});

test("каждый тип ячейки требует отдельные исследования для перехода во второй и третий тир", () => {
  const cases: BuildableCellType[] = ["counter", "taps", "table", "waiter-station", "darts", "billiards", "toilet-stall", "sink", "hand-dryer"];
  for (const type of cases) {
    const state = createGame();
    state.money = 10_000;
    const cell = { id: type, x: 1, y: 0, type, level: 9 };
    state.cells.push(cell);
    const second = requiredTierResearchId(type, 10);
    const third = requiredTierResearchId(type, 20);
    assert.ok(second && third);
    assert.equal(upgradeCell(state, cell.id).success, false, type);
    const secondResearch = RESEARCHES.find((item) => item.id === second)!;
    assert.ok(secondResearch);
    if (secondResearch.prerequisiteId) state.research.completedIds.push(secondResearch.prerequisiteId);
    state.unlockedFeatureIds.push("other:research-screen");
    assert.equal(startResearch(state, second), true, type);
    advanceResearch(state, researchDuration(secondResearch));
    claimResearch(state, second);
    assert.equal(upgradeCell(state, cell.id).success, true, type);
    cell.level = 19;
    assert.equal(upgradeCell(state, cell.id).success, false, type);
    const thirdResearch = RESEARCHES.find((item) => item.id === third)!;
    assert.ok(thirdResearch);
    assert.equal(visibleResearches(state).includes(thirdResearch), true, type);
    state.money = researchCost(thirdResearch);
    assert.equal(startResearch(state, third), true, type);
    advanceResearch(state, researchDuration(thirdResearch));
    claimResearch(state, third);
    state.money = upgradeCostForLevel(cell.level + 1);
    assert.equal(upgradeCell(state, cell.id).success, true, type);
    cell.level = CONFIG.maxCellLevel;
    assert.equal(upgradeCell(state, cell.id).success, false, type);
  }
});

test("прогресс уровня сбрасывается в начале каждого тира", () => {
  assert.deepEqual([1, 9, 10, 19, 20, 30].map(tierProgressPercent), [0, 100, 0, 100, 0, 100]);
});
