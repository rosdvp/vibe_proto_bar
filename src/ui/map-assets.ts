import type { DecorCellType, DecorId } from "../types";
import { CONFIG, DECOR_CELL_TYPES } from "../config";

const artUrl = (path: string): string => `${import.meta.env.BASE_URL}art/${path}`;

/** Runtime assets only; editable sources and references live outside public/. */
export const MAP_ASSETS = {
  drinks: {
    mash: artUrl("drinks/mash.svg"),
    lager: artUrl("drinks/lager.svg"),
    porter: artUrl("drinks/porter.svg"),
    ale: artUrl("drinks/ale.svg"),
    guinness: artUrl("drinks/guinness.svg"),
  },
  shared: {
    brick: artUrl("shared/textures/brick.png"),
    floor: artUrl("shared/surfaces/floor.svg"),
    ceiling: artUrl("shared/surfaces/ceiling.svg"),
    wall: artUrl("shared/surfaces/wall.svg"),
  },
  counter: {
    middle: artUrl("cells/counter/tier-1/counter-middle.svg"),
    left: {
      end: artUrl("cells/counter/tier-1/counter-left-end.svg"),
      continuation: artUrl("cells/counter/tier-1/counter-left-continuation.svg"),
    },
    right: {
      end: artUrl("cells/counter/tier-1/counter-right-end.svg"),
      continuation: artUrl("cells/counter/tier-1/counter-right-continuation.svg"),
    },
    stool: artUrl("cells/counter/tier-1/stool.svg"),
  },
  taps: {
    barrel: artUrl("cells/taps/tier-1/barrel.svg"),
    middle: artUrl("cells/taps/tier-1/counter-middle.svg"),
  },
  waiterStation: {
    middle: artUrl("cells/waiter-station/tier-1/counter-middle.svg"),
    cloche: artUrl("cells/waiter-station/tier-1/cloche.svg"),
  },
  table: {
    table: artUrl("cells/table/tier-1/table.svg"),
    chairBack: artUrl("cells/table/tier-1/chair-back.svg"),
    chairFront: artUrl("cells/table/tier-1/chair-front.svg"),
  },
  toiletStall: {
    back: artUrl("cells/toilet-stall/tier-1/stall-back.svg"),
    front: artUrl("cells/toilet-stall/tier-1/stall-front.svg"),
  },
  sink: {
    back: artUrl("cells/sink/tier-1/sink-back.svg"),
    front: artUrl("cells/sink/tier-1/sink-front.svg"),
  },
  handDryer: artUrl("cells/hand-dryer/tier-1/dryer.svg"),
  darts: artUrl("cells/darts/tier-1/board.svg"),
  billiards: {
    table: artUrl("cells/billiards/tier-1/table.svg"),
    cueRack: artUrl("cells/billiards/tier-1/cue-rack.svg"),
  },
  entrance: {
    door: artUrl("cells/entrance/tier-1/door.svg"),
  },
  stairs: {
    flight: artUrl("cells/stairs/tier-1/stairs.svg"),
  },
} as const;

function characterParts(character: "sailors" | "clerks" | "irish" | "cops" | "mafia" | "bartender" | "waiter", view: "side" | "back" | "front") {
  const layout = character === "bartender" ? CONFIG.mapArt.bartender : character === "waiter" ? CONFIG.mapArt.waiter : CONFIG.mapArt.customer;
  const hands = view === "side" ? layout.hands.side : view === "front"
    ? CONFIG.mapArt.bartender.hands.front : character === "waiter"
      ? CONFIG.mapArt.waiter.hands.back : CONFIG.mapArt.customer.hands.back;
  return [
    { name: "body", anchor: layout.body, layer: view === "side" ? 1 : "auto" },
    { name: "head", anchor: layout.head, layer: 2 },
    { name: "hand-left", anchor: hands.left, layer: 3 },
    { name: "hand-right", anchor: hands.right, layer: view === "side" ? 0 : 3 },
  ].map((part) => ({ ...part, src: artUrl(`characters/${character}/${view}/${part.name}.svg`) }));
}

export const SAILOR_ART = {
  side: characterParts("sailors", "side"),
  back: characterParts("sailors", "back"),
} as const;

export const CUSTOMER_ART = {
  sailors: SAILOR_ART,
  clerks: { side: characterParts("clerks", "side"), back: characterParts("clerks", "back") },
  irish: { side: characterParts("irish", "side"), back: characterParts("irish", "back") },
  cops: { side: characterParts("cops", "side"), back: characterParts("cops", "back") },
  mafia: { side: characterParts("mafia", "side"), back: characterParts("mafia", "back") },
} as const;

export const BARTENDER_ART = {
  side: characterParts("bartender", "side"),
  front: characterParts("bartender", "front"),
} as const;

export const WAITER_ART = {
  side: characterParts("waiter", "side"),
  back: characterParts("waiter", "back"),
} as const;

const DECOR_FURNITURE = {
  classic: MAP_ASSETS,
  cabaret: themedFurniture("cabaret"),
  techno: themedFurniture("techno"),
  japan: themedFurniture("japan"),
};

function themedFurniture(style: Exclude<DecorId, "classic">): typeof MAP_ASSETS {
  // Only cell paths vary. Shared surfaces, characters and drinks retain their URLs.
  const replacePaths = (value: unknown): unknown => {
    if (typeof value === "string") return value.includes("art/cells/") && !value.includes("/entrance/") && !value.includes("/stairs/")
      ? value.replace("/tier-1/", `/decor/${style}/`).replace(/\/counter-(left|right)-(end|continuation)\.svg$/, "/styled-$1-$2.svg") : value;
    if (Array.isArray(value)) return value.map(replacePaths);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replacePaths(entry)]));
    return value;
  };
  return replacePaths(MAP_ASSETS) as typeof MAP_ASSETS;
}

export function furnitureAssets(decorId: DecorId = "classic"): typeof MAP_ASSETS {
  return DECOR_FURNITURE[decorId];
}

export const COUNTER_DECOR_PROPS = {
  cabaret: artUrl("cells/counter/decor/cabaret/countertop-prop.svg"),
  techno: artUrl("cells/counter/decor/techno/countertop-prop.svg"),
  japan: artUrl("cells/counter/decor/japan/countertop-prop.svg"),
} as const;

export const CELL_DECOR_ACCENTS = Object.fromEntries(
  DECOR_CELL_TYPES.filter((type) => type !== "counter").map((type) => [type,
    Object.fromEntries((["cabaret", "techno", "japan"] as const).map((style) => [style, artUrl(`cells/${type}/decor/${style}/accent.svg`)])),
  ]),
) as Record<Exclude<DecorCellType, "counter">, Record<Exclude<DecorId, "classic">, string>>;
