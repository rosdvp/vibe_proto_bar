import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG } from "../src/config";
import { advanceResearch, claimResearch, createGame, isCellTypeUnlocked, researchStatus, startResearch, upgradeCell, requiredTierResearchId, tierProgressPercent } from "../src/game";
import { RESEARCHES, researchCost, researchDuration, visibleResearches } from "../src/game/research";
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

test("технические заглушки остаются заблокированными", () => {
  const state = researchGame();
  state.money = 1000;
  for (const research of RESEARCHES.filter((item) => item.lockedUntilProgress)) {
    assert.equal(researchStatus(state, research), "locked");
    assert.equal(startResearch(state, research.id), false);
  }
});

test("служебный переключатель ускоряет исследование и отсчёт останавливается на нуле", () => {
  const state = researchGame();
  state.money = CONFIG.researchCost;
  startResearch(state, "tables");
  state.speed = 10;
  advanceResearch(state, 1.25);
  assert.equal(state.research.active?.remaining, 17.5);
  assert.equal(researchStatus(state, tables), "running");
  assert.equal(claimResearch(state, "tables"), null);
  advanceResearch(state, 100);
  assert.equal(state.research.active?.remaining, 0);
  assert.equal(researchStatus(state, tables), "ready");
  assert.equal(isCellTypeUnlocked(state, "table"), false);
});

test("подтверждение готового исследования открывает обе ячейки один раз", () => {
  const state = researchGame();
  state.money = CONFIG.researchCost;
  startResearch(state, "tables");
  advanceResearch(state, CONFIG.researchDuration);
  const unlocks = claimResearch(state, "tables");
  assert.deepEqual(unlocks?.map((feature) => feature.id), ["table", "waiter-station"]);
  assert.equal(isCellTypeUnlocked(state, "table"), true);
  assert.equal(isCellTypeUnlocked(state, "waiter-station"), true);
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
  assert.equal(visible().includes("tables-ii"), false);
  assert.equal(visible().includes("taps-ii"), false);
  assert.equal(startResearch(state, "tables-ii"), false);
  assert.equal(startResearch(state, "taps-ii"), false);
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

test("исследования инфраструктуры появляются по уровням с нужной ценой и временем", () => {
  const state = researchGame();
  state.money = 20_000;
  const visible = () => visibleResearches(state).map((item) => item.id);
  for (const stem of ["dig-wide", "dig-deep"]) {
    assert.equal(visible().includes(stem), true);
    assert.equal(visible().includes(`${stem}-ii`), false);
    for (const [id, cost, duration, next] of [[stem, 500, 120, `${stem}-ii`], [`${stem}-ii`, 1000, 300, `${stem}-iii`], [`${stem}-iii`, 5000, 600, ""]] as const) {
      const research = RESEARCHES.find((item) => item.id === id)!;
      assert.equal(researchCost(research), cost);
      assert.equal(researchDuration(research), duration);
      assert.equal(startResearch(state, id), true);
      assert.equal(state.research.active?.remaining, duration);
      advanceResearch(state, duration);
      claimResearch(state, id);
      if (next) assert.equal(visible().includes(next), true);
    }
  }
});

test("каждый тип ячейки требует отдельные исследования для перехода во второй и третий тир", () => {
  const cases: BuildableCellType[] = ["counter", "taps", "table", "waiter-station"];
  for (const type of cases) {
    const state = createGame();
    state.money = 10_000;
    const cell = { id: type, x: 1, y: 0, type, level: 9 };
    state.cells.push(cell);
    const second = requiredTierResearchId(type, 10);
    const third = requiredTierResearchId(type, 20);
    assert.ok(second && third);
    assert.equal(upgradeCell(state, cell.id), false, type);
    state.research.completedIds.push(second);
    assert.equal(upgradeCell(state, cell.id), true, type);
    cell.level = 19;
    assert.equal(upgradeCell(state, cell.id), false, type);
    state.research.completedIds.push(third);
    assert.equal(upgradeCell(state, cell.id), true, type);
    cell.level = 30;
    assert.equal(upgradeCell(state, cell.id), false, type);
  }
});

test("прогресс уровня сбрасывается в начале каждого тира", () => {
  assert.deepEqual([1, 9, 10, 19, 20, 30].map(tierProgressPercent), [0, 100, 0, 100, 0, 100]);
});
