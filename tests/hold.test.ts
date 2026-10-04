import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG, QUESTS } from "../src/config";
import { advanceHold, createGame, energyRecoverySeconds, refillEnergy } from "../src/game";

function closeTo(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}

function unlockHold(state: ReturnType<typeof createGame>): void {
  state.unlockedFeatureIds.push("other:hold");
}

test("таймер полного восстановления учитывает неполную порцию и прогресс интервала", () => {
  const state = createGame();
  state.hold.energy = CONFIG.holdEnergyCapacity - CONFIG.holdEnergyRechargeAmount * 1.5;
  state.hold.rechargeElapsed = CONFIG.holdEnergyRechargeInterval / 2;
  const expected = CONFIG.holdEnergyRechargeInterval * 1.5;
  closeTo(energyRecoverySeconds(state), expected);
  advanceHold(state, expected - CONFIG.holdEnergyRechargeInterval / 4, false);
  assert.ok(state.hold.energy < CONFIG.holdEnergyCapacity);
  closeTo(energyRecoverySeconds(state), CONFIG.holdEnergyRechargeInterval / 4);
  advanceHold(state, CONFIG.holdEnergyRechargeInterval / 4, false);
  closeTo(state.hold.energy, CONFIG.holdEnergyCapacity);
  assert.equal(energyRecoverySeconds(state), 0);
});

for (const speed of [1, 5, 10] as const) {
  test(`таймер энергии показывает время восстановления при скорости x${speed}`, () => {
    const state = createGame();
    state.speed = speed;
    state.hold.energy = CONFIG.holdEnergyCapacity - CONFIG.holdEnergyRechargeAmount;
    state.hold.rechargeElapsed = CONFIG.holdEnergyRechargeInterval / 2;
    const seconds = CONFIG.holdEnergyRechargeInterval / 2 / speed;
    closeTo(energyRecoverySeconds(state), seconds);
    advanceHold(state, seconds, false);
    closeTo(state.hold.energy, CONFIG.holdEnergyCapacity);
    assert.equal(energyRecoverySeconds(state), 0);
  });
}

test("полное пополнение энергии сохраняет перегрев, кулдаун и прогресс интервалов", () => {
  const state = createGame();
  state.hold.energy = 0;
  state.hold.heat = CONFIG.holdOverheatDuration / 2;
  state.hold.cooldownRemaining = CONFIG.holdCooldownDuration / 2;
  state.hold.rechargeElapsed = CONFIG.holdEnergyRechargeInterval / 2;
  const expected = { ...state.hold, energy: CONFIG.holdEnergyCapacity };
  refillEnergy(state);
  assert.deepEqual(state.hold, expected);
  assert.equal(energyRecoverySeconds(state), 0);
  refillEnergy(state);
  assert.deepEqual(state.hold, expected);
});

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
  closeTo(state.hold.energy, CONFIG.holdEnergyCapacity - 5 + Math.floor(5 / CONFIG.holdEnergyRechargeInterval) * CONFIG.holdEnergyRechargeAmount);
  closeTo(state.hold.heat, 5);
});

for (const speed of [1, 5, 10] as const) {
  test(`задание ускорения учитывает активный холд со служебной скоростью x${speed}`, () => {
    const state = createGame();
    unlockHold(state);
    state.quests.currentIndex = QUESTS.findIndex((quest) => quest.id === "use-hold");
    assert.ok(state.quests.currentIndex >= 0);
    const quest = QUESTS[state.quests.currentIndex]!;
    state.speed = speed;
    const duration = Math.min(quest.target, CONFIG.holdOverheatDuration) / 2;

    advanceHold(state, duration / speed, true);

    closeTo(state.quests.incrementalProgress, duration);
  });
}

test("задание ускорения не засчитывает кулдаун и отпущенную кнопку", () => {
  const state = createGame();
  unlockHold(state);
  state.quests.currentIndex = QUESTS.findIndex((quest) => quest.id === "use-hold");
  assert.ok(state.quests.currentIndex >= 0);
  state.speed = 10;
  state.hold.cooldownRemaining = CONFIG.holdCooldownDuration;

  advanceHold(state, CONFIG.holdCooldownDuration / state.speed, true);
  advanceHold(state, 1, false);

  closeTo(state.quests.incrementalProgress, 0);
});

test("энергия восстанавливается порциями через настроенный интервал", () => {
  const state = createGame();
  state.hold.energy = 0;

  advanceHold(state, CONFIG.holdEnergyRechargeInterval / 2, false);
  assert.equal(state.hold.energy, 0);
  advanceHold(state, CONFIG.holdEnergyRechargeInterval / 2, false);
  assert.equal(state.hold.energy, CONFIG.holdEnergyRechargeAmount);
});

test("достижение порога перегрева запускает кулдаун без расхода энергии", () => {
  const state = createGame();
  unlockHold(state);
  advanceHold(state, CONFIG.holdOverheatDuration, true);
  const energyAtOverheat = state.hold.energy;

  closeTo(state.hold.cooldownRemaining, CONFIG.holdCooldownDuration);
  closeTo(state.hold.heat, CONFIG.holdOverheatDuration);

  const result = advanceHold(state, CONFIG.holdCooldownDuration, true);
  closeTo(result.boostedSeconds, 0);
  closeTo(state.hold.energy, energyAtOverheat + Math.floor((CONFIG.holdOverheatDuration + CONFIG.holdCooldownDuration) / CONFIG.holdEnergyRechargeInterval) * CONFIG.holdEnergyRechargeAmount - Math.floor(CONFIG.holdOverheatDuration / CONFIG.holdEnergyRechargeInterval) * CONFIG.holdEnergyRechargeAmount);
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
