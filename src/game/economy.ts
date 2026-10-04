import { CUSTOMER_TYPES, DRINKS } from "../config";
import type { CustomerTypeDefinition, DrinkDefinition, GameState } from "../types";

export function interpolate(a: number, b: number, level: number, maxLevel: number, startLevel = 1): number {
  return a + (b - a) * (level - startLevel) / (maxLevel - startLevel);
}

export function drinkUpgradeCost(drink: DrinkDefinition, nextLevel: number): number {
  return Math.ceil(drink.costBase + nextLevel ** drink.costStep);
}

export function customerUpgradeCost(type: CustomerTypeDefinition, nextLevel: number): number {
  return Math.floor(type.costBase + nextLevel ** type.costStep);
}

export function drinkPrice(state: GameState, drink: DrinkDefinition): number {
  const level = state.drinkLevels[drink.id] ?? 0;
  return level > 0 ? interpolate(drink.priceA, drink.priceB, level, drink.maxLevel) : 0;
}

export function drinkChance(state: GameState, drink: DrinkDefinition): number {
  if ((state.drinkLevels[drink.id] ?? 0) === 0) return 0;
  if (drink.id === DRINKS[0]?.id) {
    return 100 - DRINKS.slice(1).reduce((sum, item) => sum + drinkChance(state, item), 0);
  }
  return interpolate(drink.chanceA ?? 0, drink.chanceB ?? 0, state.drinkLevels[drink.id] ?? 0, drink.maxLevel);
}

export function customerRate(state: GameState, type: CustomerTypeDefinition): number {
  const level = state.customerLevels[type.id] ?? 0;
  return level > 0 ? interpolate(type.rateA, type.rateB, level, type.maxLevel) : 0;
}

export function totalCustomerRate(state: GameState): number {
  return CUSTOMER_TYPES.reduce((sum, type) => sum + customerRate(state, type), 0);
}

export function customerPriceMultiplier(state: GameState, type: CustomerTypeDefinition, level = state.customerLevels[type.id] ?? 0): number {
  return level > 0 ? interpolate(type.priceMultA, type.priceMultB, level, type.maxLevel) : 0;
}

export function orderPrice(state: GameState, drink: DrinkDefinition, type: CustomerTypeDefinition, cellBonus: number, tapBonus: number, customerLevel?: number): number {
  return drinkPrice(state, drink) * (1 + customerPriceMultiplier(state, type, customerLevel) / 100) * (1 + cellBonus / 100) * (1 + tapBonus / 100);
}
