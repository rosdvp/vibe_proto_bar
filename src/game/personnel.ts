import type { Bartender, GameState, Waiter } from "../types";
import { workSpeedBonusPercent } from "./selectors";
export function maximumStaff(state: GameState): number {
  return state.cells.filter((cell) => cell.type === "taps" || cell.type === "waiter-station").length;
}

export function syncWaiters(state: GameState): void {
  const stations = state.cells.filter((cell) => cell.type === "waiter-station");
  state.waiters = state.waiters.filter((waiter) => stations.some((cell) => cell.id === waiter.homeStationCellId));
  for (const station of stations) {
    let waiter = state.waiters.find((item) => item.homeStationCellId === station.id);
    if (!waiter) {
      waiter = {
        id: `waiter-${state.nextEntityId++}`,
        homeStationCellId: station.id,
        x: station.x,
        y: station.y,
        phase: "idle",
        phaseRemaining: 0,
        moveFromX: station.x,
        moveFromY: station.y,
        moveTargetX: station.x,
        moveTargetY: station.y,
        moveDuration: 0,
        movePath: [],
        localX: .5,
        moveFromLocalX: .5,
        moveTargetLocalX: .5,
        moveEndLocalX: .5,
        customerId: null,
        speedFactor: 1,
      } satisfies Waiter;
      state.waiters.push(waiter);
    }
    waiter.speedFactor = 1 / (1 + workSpeedBonusPercent(station.level) / 100);
  }
}

export function syncPersonnel(state: GameState): void {
  syncBartenders(state);
  syncWaiters(state);
}

export function syncBartenders(state: GameState): void {
  const taps = state.cells.filter((cell) => cell.type === "taps");
  state.bartenders = state.bartenders.filter((bartender) => taps.some((cell) => cell.id === bartender.homeTapCellId));
  for (const tap of taps) {
    let bartender = state.bartenders.find((item) => item.homeTapCellId === tap.id);
    if (!bartender) {
      bartender = {
        id: `bartender-${state.nextEntityId++}`,
        homeTapCellId: tap.id,
        x: tap.x,
        y: tap.y,
        phase: "idle",
        phaseRemaining: 0,
        moveFromX: tap.x,
        moveFromY: tap.y,
        moveTargetX: tap.x,
        moveTargetY: tap.y,
        moveDuration: 0,
        movePath: [],
        localX: .56,
        moveFromLocalX: .56,
        moveTargetLocalX: .56,
        moveEndLocalX: .56,
        customerId: null,
        tapCellId: null,
        tapSlot: null,
        speedFactor: 1,
      };
      state.bartenders.push(bartender);
    }
    bartender.speedFactor = 1 / (1 + workSpeedBonusPercent(tap.level) / 100);
  }
}
