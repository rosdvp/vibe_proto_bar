import { CONFIG, LEGACY_CUSTOMER_OFFER_REWARDS, OFFER_POOL } from "../config";
import type { GameState, OfferReward, OfferState, OfferSymbol, RandomSource } from "../types";
import { upgradeCostForLevel } from "./progression";
import { isFeatureUnlocked } from "./quests";
import { spawnPrizeCustomers } from "./simulation";

export function offerAvailable(state: GameState): boolean {
  return isFeatureUnlocked(state, "gift-offers") && state.offers.cooldownRemaining === 0;
}

export function advanceOffers(state: GameState, realSeconds: number): void {
  if (!isFeatureUnlocked(state, "gift-offers")) return;
  state.offers.cooldownRemaining = Math.max(0, state.offers.cooldownRemaining - Math.max(0, realSeconds) * state.speed);
}

export function offerMoneyBase(state: GameState): number {
  const cells = state.cells.filter((cell) => cell.type !== "entrance" && cell.type !== "stairs");
  const averageCost = cells.length === 0 ? upgradeCostForLevel(1)
    : cells.reduce((sum, cell) => sum + upgradeCostForLevel(Math.min(CONFIG.maxCellLevel, cell.level + 1)), 0) / cells.length;
  return averageCost * CONFIG.offerMoneyBaseMultiplier;
}

function randomIndex(length: number, random: RandomSource): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

export function offerLayout(color: "money" | "customers", total: number, random: RandomSource): OfferSymbol[] {
  const layouts: number[][] = [];
  for (let first = 0; first <= 3; first++) {
    for (let second = 0; second <= 3; second++) {
      const third = total - first - second;
      if (third >= 0 && third <= 3) layouts.push([first, second, third]);
    }
  }
  const counts = layouts[randomIndex(layouts.length, random)]!;
  let otherRemaining = total - 1;
  return counts.map((count) => {
    if (count > 0) return { color, count };
    const otherCount = randomIndex(Math.min(3, otherRemaining) + 1, random);
    otherRemaining -= otherCount;
    return otherCount === 0 ? { color: "none", count: 0 }
      : { color: color === "money" ? "customers" : "money", count: otherCount };
  });
}

export function startOffer(state: GameState, random: RandomSource = Math.random): boolean {
  if (!offerAvailable(state) || state.offers.pending) return false;
  const totalWeight = OFFER_POOL.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * totalWeight;
  const selected = OFFER_POOL.find((item) => (roll -= item.weight) < 0) ?? OFFER_POOL[OFFER_POOL.length - 1]!;
  const reward: OfferReward = { kind: "money", multiplier: selected.multiplier, amount: Math.floor(offerMoneyBase(state) * selected.multiplier) };
  const circles = selected.circles[0] + randomIndex(selected.circles[1] - selected.circles[0] + 1, random);
  state.offers.pending = { reward, slots: offerLayout(selected.kind, circles, random) };
  return true;
}

export function claimOffer(state: GameState, advertised = false, random: RandomSource = Math.random): boolean {
  if (!offerAvailable(state) || !state.offers.pending) return false;
  const { reward } = state.offers.pending;
  const multiplier = advertised ? CONFIG.offerAdMultiplier : 1;
  if (reward.kind === "money") state.money += reward.amount * multiplier;
  else spawnPrizeCustomers(state, reward.typeId, reward.count * multiplier, random);
  state.offers.pending = null;
  state.offers.cooldownRemaining = CONFIG.offerCooldown;
  return true;
}

// Validate persisted outcomes rather than re-rolling them on load.
export function isOfferState(value: unknown): value is OfferState {
  if (!value || typeof value !== "object") return false;
  const offers = value as OfferState;
  if (!Number.isFinite(offers.cooldownRemaining) || offers.cooldownRemaining < 0 || offers.cooldownRemaining > CONFIG.offerCooldown) return false;
  if (offers.pending === null) return true;
  if (!offers.pending || offers.cooldownRemaining !== 0) return false;
  const { reward, slots } = offers.pending;
  if (!reward || !Array.isArray(slots) || slots.length !== CONFIG.offerSlotDurations.length) return false;
  const definition = reward.kind === "money"
    ? OFFER_POOL.find((item) => item.multiplier === reward.multiplier)
    : reward.kind === "customers" ? LEGACY_CUSTOMER_OFFER_REWARDS.find((item) => item.typeId === reward.typeId) : undefined;
  if (!definition) return false;
  if (reward.kind === "money" ? !Number.isInteger(reward.amount) || reward.amount < 0 : reward.count !== CONFIG.offerCustomerCount) return false;
  if (!slots.every((slot) => slot && Number.isInteger(slot.count) &&
    (slot.color === "none" ? slot.count === 0 : ["money", "customers"].includes(slot.color) && slot.count >= 1 && slot.count <= 3))) return false;
  const total = slots.reduce((sum, slot) => sum + (slot.color === reward.kind ? slot.count : 0), 0);
  return total >= definition.circles[0] && total <= definition.circles[1];
}
