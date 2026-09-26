import type {
  BuildableCellType,
  CustomerTypeDefinition,
  DrinkDefinition,
  QuestDefinition,
} from "./types";
import balance from "./balance.json";

export const CONFIG = {
  saveVersion: 17,
  extraUseSeconds: { "toilet-stall": 20, sink: 10, "hand-dryer": 10, darts: 30, billiards: 30 },
  extraPrice: { darts: 10, billiards: 20 },
  extraPriceBonusPercentPerLevel: 5,
  extraChanceFree: 0.5,
  extraChanceBusy: 0.1,
  saveKey: "speakeasy-cellar-save",
  paymentPopupDuration: 1.1,
  paymentPopupFadeDuration: 0.3,
  paymentPopupRise: 30,
  baseCellWidth: 150,
  initialFloorWidthLimit: 1000,
  floorWidthResearchLimits: [1200, 1400, 1600],
  initialFloorCountLimit: 2,
  floorCountResearchLimits: [3, 4, 5],
  cellHeight: 300,
  customerPathTop: 157,
  ...balance.parameters,
} as const;

export const CELL_DEFINITIONS: Record<
  BuildableCellType,
  { room: string; name: string; glyph: string; width: number; hasLevel: boolean; locked?: true }
> = {
  taps: { room: "Бар", name: "Кран", glyph: "⚑", width: 0.75, hasLevel: true, locked: true },
  counter: { room: "Бар", name: "Стойка со стульями", glyph: "▰", width: 1.2, hasLevel: true },
  "waiter-station": { room: "Бар", name: "Стойка официанта", glyph: "⌒", width: 0.54, hasLevel: true, locked: true },
  table: { room: "Бар", name: "Столик", glyph: "◆", width: 1, hasLevel: true, locked: true },
  "toilet-stall": { room: "Туалет", name: "Кабинка с унитазом", glyph: "▣", width: 0.54, hasLevel: true, locked: true },
  sink: { room: "Туалет", name: "Раковина", glyph: "◡", width: 0.54, hasLevel: true, locked: true },
  "hand-dryer": { room: "Туалет", name: "Сушилка для рук", glyph: "▯", width: 0.54, hasLevel: true, locked: true },
  darts: { room: "Бар", name: "Дартс", glyph: "◎", width: 0.75, hasLevel: true, locked: true },
  billiards: { room: "Бар", name: "Бильярд", glyph: "▰", width: 1.25, hasLevel: true, locked: true },
  stairs: { room: "Лестница", name: "Лестница", glyph: "▤", width: 0.8, hasLevel: false, locked: true },
};

export const BUILDABLE_CELL_TYPES = Object.keys(
  CELL_DEFINITIONS,
) as BuildableCellType[];

export const DRINKS: DrinkDefinition[] = balance.drinks as DrinkDefinition[];
export const CUSTOMER_TYPES: CustomerTypeDefinition[] = balance.customerTypes as CustomerTypeDefinition[];
export const QUESTS: QuestDefinition[] = balance.quests as QuestDefinition[];
