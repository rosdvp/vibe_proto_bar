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

export type BuildableCellType = Exclude<CellType, "entrance">;
export type DrinkCategory = "keg" | "bottle";
export type ExtraActivity = "toilet" | "darts" | "billiards";
export type ActivityType = "counter" | "table" | ExtraActivity;

export type QuestCondition =
  | { kind: "cell-count"; cellType: BuildableCellType; floor?: number }
  | { kind: "cell-level"; cellType: BuildableCellType }
  | { kind: "menu-item"; drinkId: string }
  | { kind: "served"; customerTypeId?: string }
  | { kind: "hold-seconds" }
  | { kind: "bar-rating" }
  | { kind: "drink-sales"; drinkId: string }
  | { kind: "earned-money" }
  | { kind: "screen-open"; screenId: "customers" }
  | { kind: "research-completed"; researchId: string }
  | { kind: "customer-unlocked"; customerTypeId: string };

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
  | { kind: "menu-item"; id: string; name: string }
  | { kind: "cell-type"; id: BuildableCellType; name: string }
  | { kind: "other"; id: string; name: string };

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: CellType;
  level: number;
}

export interface DrinkDefinition {
  id: string;
  name: string;
  category: DrinkCategory;
  rating: 1 | 2 | 3;
  price: number;
  locked?: true;
}

export interface QualityRequirement {
  cellType: BuildableCellType;
  minimum: number;
}

export type DrinkRequirement =
  | { kind: "specific"; drinkId: string }
  | { kind: "rating"; category: DrinkCategory; min: number; max: number };

export interface CustomerTypeDefinition {
  id: string;
  name: string;
  arrivalWeight: number;
  qualityRequirements: QualityRequirement[];
  drinkRequirements: DrinkRequirement[];
  mandatoryActivity?: ActivityType;
  priorityActivity?: ActivityType;
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
  saveVersion: number;
  money: number;
  speed: 1 | 5 | 10;
  cells: Cell[];
  menu: string[];
  unlockedFeatureIds: string[];
  unseenUnlockIds: string[];
  bartenders: Bartender[];
  waiters: Waiter[];
  customers: Customer[];
  customerArrivalRemaining: number;
  customerArrivalRating: number;
  everUnlockedCustomerTypeIds: string[];
  nextEntityId: number;
  hold: HoldState;
  research: ResearchState;
  quests: QuestState;
}

export interface RandomSource {
  (): number;
}
