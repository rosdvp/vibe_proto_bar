import { CONFIG } from "../config";
import type { GameState } from "../types";
import { isFeatureUnlocked, recordHoldSeconds } from "./quests";

export interface HoldAdvanceResult {
  boostedSeconds: number;
  depleted: boolean;
}

export function advanceHold(
  state: GameState,
  realSeconds: number,
  holding: boolean,
): HoldAdvanceResult {
  let remaining = Math.max(0, realSeconds * state.speed);
  let boostedSeconds = 0;
  let depleted = false;
  let canActivate = holding && isFeatureUnlocked(state, "hold") && state.hold.energy > 0;

  while (remaining > 1e-9) {
    const dt = Math.min(CONFIG.holdEnergySpendTick, remaining);
    remaining -= dt;
    if (remaining < 1e-9) remaining = 0;

    state.hold.rechargeElapsed += dt;
    while (state.hold.rechargeElapsed + 1e-9 >= CONFIG.holdEnergyRechargeInterval) {
      state.hold.rechargeElapsed -= CONFIG.holdEnergyRechargeInterval;
      if (state.hold.rechargeElapsed < 0) state.hold.rechargeElapsed = 0;
      state.hold.energy = Math.min(
        CONFIG.holdEnergyCapacity,
        state.hold.energy + CONFIG.holdEnergyRechargeAmount,
      );
    }

    if (state.hold.cooldownRemaining > 0) {
      state.hold.cooldownRemaining = Math.max(0, state.hold.cooldownRemaining - dt);
      if (state.hold.cooldownRemaining < 1e-9) state.hold.cooldownRemaining = 0;
      state.hold.heat = Math.max(0, state.hold.heat - dt);
      state.hold.consumptionElapsed = 0;
      continue;
    }

    const active = canActivate && state.hold.energy > 0;
    if (!active) {
      state.hold.heat = Math.max(0, state.hold.heat - dt);
      state.hold.consumptionElapsed = 0;
      continue;
    }

    boostedSeconds += dt;
    state.hold.heat = Math.min(CONFIG.holdOverheatDuration, state.hold.heat + dt);
    state.hold.consumptionElapsed += dt;

    while (state.hold.consumptionElapsed + 1e-9 >= CONFIG.holdEnergySpendTick) {
      state.hold.consumptionElapsed -= CONFIG.holdEnergySpendTick;
      if (state.hold.consumptionElapsed < 0) state.hold.consumptionElapsed = 0;
      state.hold.energy = Math.max(0, state.hold.energy - CONFIG.holdEnergySpendTick);
      if (state.hold.energy === 0) {
        depleted = true;
        canActivate = false;
        state.hold.consumptionElapsed = 0;
        break;
      }
    }

    if (state.hold.heat + 1e-9 >= CONFIG.holdOverheatDuration) {
      state.hold.heat = CONFIG.holdOverheatDuration;
      state.hold.cooldownRemaining = CONFIG.holdCooldownDuration;
      state.hold.consumptionElapsed = 0;
    }
  }

  recordHoldSeconds(state, boostedSeconds / state.speed);
  return { boostedSeconds, depleted };
}
