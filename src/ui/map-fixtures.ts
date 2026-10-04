import { CONFIG } from "../config";
import type { Cell, GameState } from "../types";
import { CELL_DECOR_ACCENTS, COUNTER_DECOR_PROPS, furnitureAssets } from "./map-assets";

const image = (className: string, src: string, style = ""): string =>
  `<img class="${className}" src="${src}" style="${style}" alt="" draggable="false">`;

const isCounter = (cell: Cell): boolean =>
  cell.type === "counter" || cell.type === "taps" || cell.type === "waiter-station";

function renderCounterArt(state: GameState, cell: Cell): string {
  const assets = furnitureAssets(cell.decorId);
  const stools = cell.type === "counter" ? Array.from({ length: CONFIG.counterCapacity }, (_, index) =>
    image("counter-stool", assets.counter.stool, `left:${(index + .5) / CONFIG.counterCapacity * 100}%`)).join("") : "";
  const edgeAssets = assets.counter;
  const edges = (["left", "right"] as const).map((side) => {
    const neighborX = cell.x + (side === "left" ? -1 : 1);
    const continues = state.cells.some((neighbor) => neighbor.y === cell.y && neighbor.x === neighborX && isCounter(neighbor));
    const variant = continues ? "continuation" : "end";
    return image(`counter-edge counter-${side} counter-${variant}`, edgeAssets[side][variant]);
  }).join("");
  const barrel = cell.type === "taps" ? image("tap-barrel", assets.taps.barrel, `left:${CONFIG.mapArt.tapBarrelLocalX * 100}%`) : "";
  const middle = cell.type === "taps" ? assets.taps.middle : cell.type === "waiter-station" ? assets.waiterStation.middle : assets.counter.middle;
  const cloche = cell.type === "waiter-station" ? furniture("station-cloche", assets.waiterStation.cloche, CONFIG.mapArt.furniture.cloche, CONFIG.mapArt.counter.bodyHeight) : "";
  const style = cell.decorId;
  const props = cell.type === "counter" && style && style !== "classic"
    ? CONFIG.mapArt.counter.props[style].positions.map((localX) => furniture("countertop-prop", COUNTER_DECOR_PROPS[style],
      CONFIG.mapArt.counter.props[style], CONFIG.mapArt.counter.bodyHeight - CONFIG.mapArt.counter.props.tabletopInset, localX)).join("") : "";
  return `<div class="fixture fixture-counter-art"><span class="cell-brick-wall"></span>${barrel}${image("counter-middle", middle)}${edges}${cloche}${props}${renderDecorAccent(cell)}${stools}</div>`;
}

function furniture(className: string, src: string, size: { width: number; height: number }, bottom = 0, localX = .5, facing = 1): string {
  return image(`furniture-art ${className}`, src,
    `left:${localX * 100}%;width:${size.width}px;height:${size.height}px;bottom:calc(var(--cell-floor-height) + ${bottom}px);--furniture-facing:${facing}`);
}

export function renderFixture(state: GameState, cell: Cell): string {
  const assets = furnitureAssets(cell.decorId);
  if (isCounter(cell)) return renderCounterArt(state, cell);
  const f = CONFIG.mapArt.furniture;
  let items: string;
  switch (cell.type) {
    case "entrance":
      items = image("entrance-door", assets.entrance.door);
      break;
    case "stairs":
      items = image("stairs-flight", assets.stairs.flight);
      break;
    case "table": {
      const chairs = Array.from({ length: CONFIG.tableCapacity }, (_, slot) => {
        const localX = (slot * 2 + .5) / 3;
        const facing = localX < .5 ? 1 : -1;
        return furniture("furniture-back", assets.table.chairBack, f.chairBack, 0, localX, facing)
          + furniture("furniture-front", assets.table.chairFront, f.chairFront, 0, localX, facing);
      }).join("");
      items = furniture("furniture-middle", assets.table.table, f.table) + chairs;
      break;
    }
    case "toilet-stall":
      items = furniture("furniture-back", assets.toiletStall.back, f.stallBack, f.stallBack.bottom)
        + furniture("furniture-front", assets.toiletStall.front, f.stallFront, f.stallFront.bottom);
      break;
    case "sink":
      items = furniture("furniture-front", assets.sink.back, f.sinkBack, f.sinkBack.bottom)
        + furniture("furniture-front", assets.sink.front, f.sinkFront, f.sinkFront.bottom);
      break;
    case "hand-dryer":
      items = furniture("furniture-front", assets.handDryer, f.dryer, f.dryer.bottom);
      break;
    case "darts":
      items = furniture("furniture-back", assets.darts, f.dartBoard, f.dartBoard.bottom, f.dartBoard.localX);
      break;
    case "billiards":
      items = furniture("furniture-back", assets.billiards.cueRack, f.cueRack, f.cueRack.bottom)
        + furniture("furniture-front", assets.billiards.table, f.billiardTable, f.billiardTable.bottom);
      break;
    default:
      items = "";
  }
  return `<div class="fixture fixture-${cell.type}-art"><span class="cell-brick-wall"></span>${items}${renderDecorAccent(cell)}</div>`;
}

function renderDecorAccent(cell: Cell): string {
  if (cell.type === "entrance" || cell.type === "stairs" || cell.type === "counter" || !cell.decorId || cell.decorId === "classic") return "";
  const placement = CONFIG.mapArt.decorAccents[cell.type];
  return furniture(`decor-accent ${placement.layer}`, CELL_DECOR_ACCENTS[cell.type][cell.decorId], placement, placement.bottom, placement.localX);
}
