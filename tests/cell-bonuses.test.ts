import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG } from "../src/config";
import { cellBonusPercent, extraUsePrice, levelBonusPercent, workSpeedBonusPercent } from "../src/game/selectors";

test("бонус уровня интерполирует произвольные границы", () => {
  const range = { min: 7, max: 93 };
  assert.equal(levelBonusPercent(1, range), range.min);
  assert.equal(levelBonusPercent(CONFIG.maxCellLevel, range), range.max);
  assert.ok(Math.abs(levelBonusPercent(1 + (CONFIG.maxCellLevel - 1) / 2, range) - (range.min + range.max) / 2) < 1e-9);
});

test("бонус цены столика использует собственный диапазон", () => {
  for (let level = 1; level <= CONFIG.maxCellLevel; level++) {
    assert.equal(cellBonusPercent(level, "table"), levelBonusPercent(level, CONFIG.tableOrderPriceBonusPercentRange));
    for (const type of ["counter", "taps", "toilet-stall", "sink", "hand-dryer"] as const) {
      assert.equal(cellBonusPercent(level, type), levelBonusPercent(level, CONFIG.cellBonusPercentRange));
    }
  }
});

test("скорость использует диапазон бонуса скорости", () => {
  for (let level = 1; level <= CONFIG.maxCellLevel; level++) {
    assert.equal(workSpeedBonusPercent(level), levelBonusPercent(level, CONFIG.workSpeedBonusPercentRange));
  }
});

for (const type of ["darts", "billiards"] as const) {
  test(`${type}: доход интерполируется без промежуточного округления`, () => {
    for (let level = 1; level <= CONFIG.maxCellLevel; level++) {
      const cell = { id: "extra", type, level, x: 0, y: 0 };
      const expected = levelBonusPercent(level, CONFIG.extraIncomeRanges[type]);
      assert.equal(extraUsePrice(cell), expected);
    }
  });
}
