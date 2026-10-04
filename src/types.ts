export type CellType =
  | "entrance"
  | "counter"
  | "taps"
  | "waiter-station"
  | "table"
  | "toilet-stall"
  | "sink"
  | "hand-dryer"
  | "darts"
  | "billiards"
  | "stairs";

export type DecorId = "classic" | "cabaret" | "techno" | "japan";
export type DecorCellType = Exclude<CellType, "entrance" | "stairs">;
export interface DecorTypeState {
  unlockedIds: DecorId[];
  unseenIds: DecorId[];
  buttonUnseen: boolean;
}
export interface CellUpgradeResult { success: boolean; unlocks: UnlockFeature[] }

export type BuildableCellType = Exclude<CellType, "entrance">;
export type ExtraActivity = "toilet" | "darts" | "billiards";
export type ActivityType = "counter" | "table" | ExtraActivity;

export type QuestCondition =
  | { kind: "cell-count"; cellType?: BuildableCellType; floor?: number; minLevel?: number }
  | { kind: "cell-level"; cellType?: BuildableCellType }
  | { kind: "cell-decor"; cellType: DecorCellType }
  | { kind: "total-customer-rate" }
  | { kind: "all-drinks-max" }
  | { kind: "all-customers-max" }
  | { kind: "drink-level"; drinkId: string }
  | { kind: "customer-rate"; customerTypeId: string }
  | { kind: "served"; customerTypeId?: string }
  | { kind: "hold-seconds" }
  | { kind: "drink-sales"; drinkId: string }
  | { kind: "earned-money" }
  | { kind: "screen-open"; screenId: "customers" }
  | { kind: "research-completed"; researchId: string }
  | { kind: "customer-level"; customerTypeId: string };

export interface QuestDefinition {
  id: string;
  title: string;
  target: number;
  reward: number;
  condition: QuestCondition;
  unlocks?: UnlockFeature[];
}

export interface QuestState {
  currentIndex: number;
  incrementalProgress: number;
}

export type UnlockFeature =
  | { kind: "decor"; id: DecorId; cellType: DecorCellType; name: string }
  | { kind: "customer-type"; id: string; name: string }
  | { kind: "cell-type"; id: BuildableCellType; name: string }
  | { kind: "other"; id: string; name: string };

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: CellType;
  level: number;
  decorId?: DecorId;
}

export interface DrinkDefinition {
  id: string;
  name: string;
  maxLevel: number;
  chanceA?: number;
  chanceB?: number;
  priceA: number;
  priceB: number;
  costBase: number;
  costStep: number;
}

export interface CustomerTypeDefinition {
  id: string;
  name: string;
  maxLevel: number;
  rateA: number;
  rateB: number;
  priceMultA: number;
  priceMultB: number;
  costBase: number;
  costStep: number;
  requirement?: { kind: "cell"; cellType: BuildableCellType } | { kind: "drink-level"; drinkId: string; level: number } | { kind: "cells"; cellTypes: BuildableCellType[] };
}

export type CustomerPhase =
  | "waiting-activity"
  | "moving-counter"
  | "waiting-counter"
  | "waiting-bartender"
  | "waiting-waiter"
  | "waiting-drink"
  | "waiting-delivery"
  | "moving-table"
  | "waiting-table"
  | "drinking"
  | "moving-extra"
  | "waiting-extra"
  | "using-extra"
  | "exiting";

export interface Customer {
  id: string;
  typeId: string;
  x: number;
  y: number;
  phase: CustomerPhase;
  phaseRemaining: number;
  moveFromX: number;
  moveFromY: number;
  moveTargetX: number;
  moveTargetY: number;
  moveDuration: number;
  movePath: Array<{ x: number; y: number }>;
  localX?: number;
  moveFromLocalX?: number;
  moveTargetLocalX?: number;
  moveEndLocalX?: number;
  activity: ActivityType | null;
  targetCellId: string | null;
  slotIndex: number | null;
  orderId: string;
  orderTapCellId?: string | null;
  bartenderId: string | null;
  waiterId: string | null;
  waitingElapsed: number;
  isPrize?: boolean;
  waitingDirection: -1 | 1;
  visitedExtras?: ExtraActivity[];
  repeatOrdered?: boolean;
  toiletBonus?: number;
}

export type BartenderPhase =
  | "idle"
  | "moving-customer"
  | "listening"
  | "moving-taps"
  | "pouring"
  | "returning";

export interface Bartender {
  id: string;
  homeTapCellId: string;
  x: number;
  y: number;
  phase: BartenderPhase;
  phaseRemaining: number;
  moveFromX: number;
  moveFromY: number;
  moveTargetX: number;
  moveTargetY: number;
  moveDuration: number;
  movePath: Array<{ x: number; y: number }>;
  localX?: number;
  moveFromLocalX?: number;
  moveTargetLocalX?: number;
  moveEndLocalX?: number;
  customerId: string | null;
  tapCellId: string | null;
  tapSlot: number | null;
  speedFactor: number;
}

export type WaiterPhase =
  | "idle"
  | "moving-customer"
  | "listening"
  | "moving-station"
  | "waiting-drink"
  | "delivering"
  | "returning-station";

export interface Waiter {
  id: string;
  homeStationCellId: string;
  x: number;
  y: number;
  phase: WaiterPhase;
  phaseRemaining: number;
  moveFromX: number;
  moveFromY: number;
  moveTargetX: number;
  moveTargetY: number;
  moveDuration: number;
  movePath: Array<{ x: number; y: number }>;
  localX?: number;
  moveFromLocalX?: number;
  moveTargetLocalX?: number;
  moveEndLocalX?: number;
  customerId: string | null;
  speedFactor: number;
}

export interface HoldState {
  energy: number;
  heat: number;
  cooldownRemaining: number;
  rechargeElapsed: number;
  consumptionElapsed: number;
}

export interface ResearchState {
  active: { id: string; remaining: number } | null;
  completedIds: string[];
}

export interface GameState {
  decor: Record<DecorCellType, DecorTypeState>;
  offers: OfferState;
  saveVersion: number;
  money: number;
  speed: 1 | 5 | 10;
  cells: Cell[];
  drinkLevels: Record<string, number>;
  customerLevels: Record<string, number>;
  unlockedFeatureIds: string[];
  unseenUnlockIds: string[];
  bartenders: Bartender[];
  waiters: Waiter[];
  customers: Customer[];
  customerArrivalRemaining: number;
  customerArrivalsStarted: boolean;
  customerArrivalRate: number;
  arrivalTypeCarry: Record<string, number>;
  arrivalTypeBag: string[];
  arrivalMinuteRemaining: number;
  everUnlockedCustomerTypeIds: string[];
  nextEntityId: number;
  hold: HoldState;
  research: ResearchState;
  quests: QuestState;
}

export interface RandomSource {
  (): number;
}

export type OfferSymbol = { color: "money" | "customers" | "none"; count: number };
export type OfferReward =
  | { kind: "money"; multiplier: number; amount: number }
  | { kind: "customers"; typeId: string; count: number };
export interface OfferState {
  cooldownRemaining: number;
  pending: { reward: OfferReward; slots: OfferSymbol[] } | null;
}
