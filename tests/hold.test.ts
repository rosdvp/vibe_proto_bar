import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG } from "../src/config";
import { advanceHold, createGame } from "../src/game";

function closeTo(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}

function unlockHold(state: ReturnType<typeof createGame>): void {
  state.unlockedFeatureIds.push("other:hold");
}

test("холд не запускается до разблокировки", () => {
  const state = createGame();
  const result = advanceHold(state, 1, true);

  closeTo(result.boostedSeconds, 0);
  closeTo(state.hold.energy, CONFIG.holdEnergyCapacity);
});

test("активный холд расходует энергию и возвращает длительность ускорения", () => {
  const state = createGame();
  unlockHold(state);
  const result = advanceHold(state, 1, true);

  closeTo(result.boostedSeconds, 1);
  closeTo(state.hold.energy, CONFIG.holdEnergyCapacity - 1);
  closeTo(state.hold.heat, 1);
  assert.equal(result.depleted, false);
});

test("служебная скорость ускоряет все таймеры холда", () => {
  const state = createGame();
  unlockHold(state);
  state.speed = 5;

  const result = advanceHold(state, 1, true);

  closeTo(result.boostedSeconds, 5);
  closeTo(state.hold.energy, CONFIG.holdEnergyCapacity - 4);
  closeTo(state.hold.heat, 5);
});

test("задание ускорения считает реальные, а не ускоренные служебной скоростью секунды", () => {
  const state = createGame();
  unlockHold(state);
  state.quests.currentIndex = 5;
  state.speed = 5;

  advanceHold(state, 1, true);

  closeTo(state.quests.incrementalProgress, 1);
});

test("энергия восстанавливается единицами раз в пять секунд", () => {
  const state = createGame();
  state.hold.energy = 0;

  advanceHold(state, 4.9, false);
  assert.equal(state.hold.energy, 0);
  advanceHold(state, 0.1, false);
  assert.equal(state.hold.energy, 1);
});

test("через семь секунд начинается кулдаун без расхода энергии", () => {
  const state = createGame();
  unlockHold(state);
  advanceHold(state, CONFIG.holdOverheatDuration, true);
  const energyAtOverheat = state.hold.energy;

  closeTo(state.hold.cooldownRemaining, CONFIG.holdCooldownDuration);
  closeTo(state.hold.heat, CONFIG.holdOverheatDuration);

  const result = advanceHold(state, CONFIG.holdCooldownDuration, true);
  closeTo(result.boostedSeconds, 0);
  closeTo(state.hold.energy, energyAtOverheat + 1);
  closeTo(state.hold.heat, CONFIG.holdOverheatDuration - CONFIG.holdCooldownDuration);
  assert.equal(state.hold.cooldownRemaining, 0);
});

test("исчерпание энергии выключает ускорение и запускает охлаждение", () => {
  const state = createGame();
  unlockHold(state);
  state.hold.energy = CONFIG.holdEnergySpendTick;
  state.hold.heat = 1;

  const active = advanceHold(state, CONFIG.holdEnergySpendTick, true);
  assert.equal(active.depleted, true);
  assert.equal(state.hold.energy, 0);

  const cooling = advanceHold(state, 1, false);
  closeTo(cooling.boostedSeconds, 0);
  closeTo(state.hold.heat, CONFIG.holdEnergySpendTick);
});
