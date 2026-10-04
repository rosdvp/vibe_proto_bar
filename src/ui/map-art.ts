import { CONFIG } from "../config";
import { cellLeft, cellWidth, floorOffsets } from "../geometry";
import type { GameState } from "../types";

/** Cover the union of allowed camera views, including centering at minimum zoom.
 * Repeated tiles supply the area; no giant raster for the entire excavatable map.
 */
export function renderMapEnvironment(state: GameState, viewportWidth: number, focused: boolean, shiftX: number, shiftY: number, scale: number): string {
  const offsets = floorOffsets(state);
  const maxY = Math.max(...state.cells.map((cell) => cell.y));
  const minY = Math.min(...state.cells.map((cell) => cell.y));
  const mapLeft = Math.min(...state.cells.map((cell) => cellLeft(state, cell.x, cell.y, offsets)));
  const mapRight = Math.max(...state.cells.map((cell) => cellLeft(state, cell.x, cell.y, offsets) + cellWidth(cell) * CONFIG.baseCellWidth));
  const groundTop = CONFIG.cellHeight + 25;
  const mapBottom = (maxY + 2 - minY) * CONFIG.cellHeight + 25;
  const margin = CONFIG.distantMapPanMargin;
  // Full window height is a conservative bound for the map viewport (also on mobile).
  const viewportHeight = Math.max(window.innerHeight, 620);
  const minScale = CONFIG.distantMapScale * CONFIG.distantMapMinZoom;
  const width = Math.max(mapRight - mapLeft + margin.horizontal * 2, viewportWidth / minScale);
  const height = Math.max(mapBottom - groundTop + margin.top + margin.bottom, viewportHeight / minScale);
  const centerX = (mapLeft + mapRight) / 2;
  const centerY = (groundTop - margin.top + mapBottom + margin.bottom) / 2;
  let left = centerX - width / 2;
  let right = centerX + width / 2;
  let top = centerY - height / 2;
  let bottom = centerY + height / 2;
  if (focused) {
    left = Math.min(left, -shiftX / scale);
    right = Math.max(right, (viewportWidth - shiftX) / scale);
    top = Math.min(top, -shiftY / scale);
    bottom = Math.max(bottom, (viewportHeight - shiftY) / scale);
  }
  const entrance = state.cells.find((cell) => cell.type === "entrance");
  const entranceCenter = entrance ? cellLeft(state, entrance.x, entrance.y, offsets) + cellWidth(entrance) * CONFIG.baseCellWidth / 2 : 0;
  const art = CONFIG.mapArt;
  return `<div class="scene-environment" aria-hidden="true" style="left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;--ground-top:${groundTop - top}px;--surface-position:${entranceCenter - left - art.surfaceWidth / 2}px;--surface-width:${art.surfaceWidth}px;--surface-height:${art.surfaceHeight}px;--ground-tile:${art.groundTileSize}px">
    <div class="scene-sky"></div><div class="scene-surface"></div><div class="scene-ground" style="background-position:${-left}px 0"></div>
  </div>`;
}
