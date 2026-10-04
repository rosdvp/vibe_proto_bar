import type {
  BuildableCellType,
  DecorCellType,
  DecorId,
  CustomerTypeDefinition,
  DrinkDefinition,
  QuestDefinition,
} from "./types";
import balance from "./balance.json";

export const CONFIG = {
  saveVersion: 19,
  offerCooldown: 60,
  offerAdMultiplier: 5,
  offerMoneyBaseMultiplier: 0.5,
  offerCustomerCount: 2,
  offerSlotDurations: [0.3, 0.5, 0.7],
  offerRevealDuration: 0.3,
  offerSpinSymbolDuration: 0.06,
  extraUseSeconds: { "toilet-stall": 20, sink: 10, "hand-dryer": 10, darts: 30, billiards: 30 },
  extraPrice: { darts: 10, billiards: 20 },
  extraChanceFree: 0.5,
  saveKey: "speakeasy-cellar-save",
  paymentPopupDuration: 1.1,
  paymentPopupFadeDuration: 0.3,
  paymentPopupRise: 30,
  baseCellWidth: 150,
  distantMapScale: 0.7,
  distantMapMinZoom: 0.5,
  distantMapZoomStep: 0.1,
  distantMapPanMargin: { horizontal: 300, top: 500, bottom: 600 },
  mapArt: {
    surfaceWidth: 600, surfaceHeight: 400, groundTileSize: 300,
    cellSurfaces: { ceilingHeight: 70 * 300 / 1620, floorHeight: 130 * 300 / 1620 },
    brickWall: {
      tileWidth: 198, tileHeight: 1530 * 300 / 1620,
    },
    tapBarrelLocalX: .44,
    furniture: {
      cloche: { width: 44, height: 30 },
      table: { width: 72, height: 68.4278129587956 },
      chairBack: { width: 50, height: 68 },
      chairFront: { width: 50, height: 42.256451172002016 },
      stallBack: { width: 72 * 1.1, height: 146, bottom: 0 },
      stallFront: { width: 72 * 1.1, height: 45, bottom: 0 },
      sinkBack: { width: 58, height: 65 * 1.2 * 1.1, bottom: 0 },
      sinkFront: { width: 58, height: 27 * 1.2 * 1.1, bottom: 14 * 1.2 * 1.1 },
      dryer: { width: 40, height: 57, bottom: 23 + 57 * .45 },
      dartBoard: { width: 68, height: 68, bottom: 95, localX: .4 },
      billiardTable: { width: 148, height: 74, bottom: 0 },
      cueRack: { width: 66, height: 124, bottom: 82 },
    },
    taps: {
      barrelWidth: 68, barrelHeight: 86, nozzleY: 84,
      pouringMugTop: 40, pouringMugRight: 22, pouringGap: 4,
      pouringHandRise: 20,
    },
    counter: {
      customerOffsetY: 15, bartenderRise: 15, bodyHeight: 68.42781295879557,
      bodyWidth: 193.63866877971475, edgeWidth: 110 * 0.15768621236133123,
      seamOverlap: 1,
      props: {
        tabletopInset: 4,
        cabaret: { width: 12, height: 19, positions: [.25, .75] },
        techno: { width: 21, height: 20, positions: [.72] },
        japan: { width: 15, height: 20, positions: [.25] },
      },
    },
    decorAccents: {
      taps: { width: 22, height: 24, bottom: 64.42781295879557, localX: .85, layer: "countertop-prop" },
      "waiter-station": { width: 18, height: 20, bottom: 64.42781295879557, localX: .12, layer: "countertop-prop" },
      table: { width: 24, height: 26, bottom: 64.4278129587956, localX: .5, layer: "furniture-middle" },
      "toilet-stall": { width: 18, height: 26, bottom: 108, localX: .78, layer: "furniture-back" },
      sink: { width: 36, height: 32, bottom: 96, localX: .5, layer: "furniture-back" },
      "hand-dryer": { width: 20, height: 30, bottom: 89, localX: .72, layer: "furniture-back" },
      darts: { width: 40, height: 30, bottom: 95, localX: .78, layer: "furniture-back" },
      billiards: { width: 44, height: 30, bottom: 218, localX: .5, layer: "furniture-back" },
    },
    // Attachment points in scene pixels; each SVG uses its bottom center as the anchor.
    customer: {
      body: { x: 25.5, y: 117 },
      head: { x: 25, y: 46 },
      hands: {
        side: { left: { x: 7, y: 96.5 }, right: { x: 43, y: 94.5 } },
        back: { left: { x: -2, y: 96.5 }, right: { x: 53, y: 96.5 } },
      },
    },
    bartender: {
      body: { x: 25.5, y: 117 },
      head: { x: 25, y: 46 },
      hands: {
        side: { left: { x: 7, y: 96.5 }, right: { x: 43, y: 94.5 } },
        front: { left: { x: -2, y: 96.5 }, right: { x: 53, y: 96.5 } },
      },
    },
    waiter: {
      body: { x: 25.5, y: 117 },
      head: { x: 25, y: 46 },
      hands: {
        side: { left: { x: 7, y: 96.5 }, right: { x: 43, y: 94.5 } },
        back: { left: { x: -2, y: 96.5 }, right: { x: 53, y: 96.5 } },
      },
    },
  },
  initialFloorWidthLimit: 880,
  floorWidthResearchLimits: [1100, 1300, 1500],
  initialFloorCountLimit: 2,
  floorCountResearchLimits: [3, 4, 5],
  cellHeight: 250,
  cellLevelBottomOffset: 0,
  customerPathTop: 107,
  ...balance.parameters,
} as const;

export const CELL_DEFINITIONS: Record<
  BuildableCellType,
  { room: string; name: string; glyph: string; width: number; hasLevel: boolean; locked?: true }
> = {
  taps: { room: "Бар", name: "Кран", glyph: "⚑", width: 0.75, hasLevel: true, locked: true },
  counter: { room: "Бар", name: "Стойка со стульями", glyph: "▰", width: 1.32, hasLevel: true },
  "waiter-station": { room: "Бар", name: "Стойка официанта", glyph: "⌒", width: 0.54, hasLevel: true, locked: true },
  table: { room: "Бар", name: "Столик", glyph: "◆", width: 1, hasLevel: true, locked: true },
  "toilet-stall": { room: "Туалет", name: "Кабинка с унитазом", glyph: "▣", width: 0.54 * 1.1, hasLevel: true, locked: true },
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

export const OFFER_POOL = [
  { kind: "money", multiplier: 1, weight: 6, circles: [1, 2] },
  { kind: "money", multiplier: 2, weight: 5, circles: [3, 4] },
  { kind: "money", multiplier: 3, weight: 3, circles: [5, 6] },
  { kind: "money", multiplier: 4, weight: 2, circles: [7, 8] },
  { kind: "money", multiplier: 5, weight: 1, circles: [9, 9] },
] as const;

// Only for restoring previously selected customer prizes, never for new rolls.
export const LEGACY_CUSTOMER_OFFER_REWARDS = [
  { typeId: "sailors", circles: [1, 2] },
  { typeId: "clerks", circles: [3, 4] },
  { typeId: "irish", circles: [5, 6] },
  { typeId: "cops", circles: [7, 8] },
  { typeId: "mafia", circles: [8, 9] },
] as const;

export const DECOR_STYLES = [
  { id: "classic", name: "Вечная классика" },
  { id: "cabaret", name: "Кабаре" },
  { id: "techno", name: "Стимпанк" },
  { id: "japan", name: "Япония" },
] as const satisfies readonly { id: DecorId; name: string }[];
export const DECOR_CELL_TYPES = BUILDABLE_CELL_TYPES.filter((type): type is DecorCellType => type !== "stairs");
