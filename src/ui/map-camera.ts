import { CONFIG } from "../config";
import { cellLeft, cellWidth, floorOffsets } from "../geometry";
import type { GameState } from "../types";
import type { UiState } from "./types";
import { setStyle } from "./dom";

interface CameraGeometry {
  key: string;
  scene: HTMLElement;
  viewport: HTMLElement;
  width: number;
  height: number;
  sceneTop: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const geometries = new WeakMap<HTMLElement, CameraGeometry>();

export function frameInnerWidth(): number {
  const narrow = window.innerWidth <= 780;
  const gameWidth = narrow ? window.innerWidth : Math.min(430, window.innerWidth - 24);
  return narrow ? gameWidth : gameWidth - 8;
}

function geometry(root: HTMLElement, state: GameState, ui: UiState): CameraGeometry | null {
  if (ui.focusX !== null || state.cells.length === 0) {
    geometries.delete(root);
    return null;
  }
  const viewport = root.querySelector<HTMLElement>("[data-map]");
  const scene = viewport?.querySelector<HTMLElement>(".map-scene");
  if (!viewport || !scene) return null;
  const key = `${window.innerWidth}:${window.innerHeight}:${state.cells.map((cell) => `${cell.x},${cell.y},${cellWidth(cell)}`).join(";")}`;
  const cached = geometries.get(root);
  if (cached?.key === key && cached.scene === scene && cached.viewport === viewport) return cached;

  const offsets = floorOffsets(state);
  const maxY = Math.max(...state.cells.map((cell) => cell.y));
  const minY = Math.min(...state.cells.map((cell) => cell.y));
  // Read layout before writing camera styles, only when the map/window changes.
  const next: CameraGeometry = {
    key, scene, viewport, width: viewport.clientWidth, height: viewport.clientHeight, sceneTop: scene.offsetTop,
    left: Math.min(...state.cells.map((cell) => cellLeft(state, cell.x, cell.y, offsets))),
    right: Math.max(...state.cells.map((cell) => cellLeft(state, cell.x, cell.y, offsets) + cellWidth(cell) * CONFIG.baseCellWidth)),
    top: CONFIG.cellHeight + 25,
    bottom: (maxY + 2 - minY) * CONFIG.cellHeight + 25,
  };
  geometries.set(root, next);
  return next;
}

function clampShift(shift: number, start: number, end: number, size: number, scale: number, startMargin: number, endMargin: number): number {
  const minimum = size - (end + endMargin) * scale;
  const maximum = -(start - startMargin) * scale;
  return minimum > maximum ? (minimum + maximum) / 2 : Math.max(minimum, Math.min(maximum, shift));
}

function limitPan(view: CameraGeometry, ui: UiState): { x: number; y: number; scale: number } {
  const scale = CONFIG.distantMapScale * ui.mapZoom;
  const left = Number(view.scene.dataset.mapLeft);
  const right = Number(view.scene.dataset.mapRight);
  const shiftX = (frameInnerWidth() - (right - left) * scale) / 2 - left * scale + ui.panX;
  const shiftY = ui.panY - 54;
  const margin = CONFIG.distantMapPanMargin;
  const x = clampShift(shiftX, view.left, view.right, view.width, scale, margin.horizontal, margin.horizontal);
  const y = clampShift(view.sceneTop + shiftY, view.top, view.bottom, view.height, scale, margin.top, margin.bottom) - view.sceneTop;
  ui.panX += x - shiftX;
  ui.panY += y - shiftY;
  return { x, y, scale };
}

/** Clamp each input delta in state, including reversals at an edge within a frame. */
export function panMapCamera(root: HTMLElement, state: GameState, ui: UiState, dx: number, dy: number): void {
  const view = geometry(root, state, ui);
  if (!view) return;
  ui.panX += dx;
  ui.panY += dy;
  limitPan(view, ui);
}

/** Called by the frame loop: one final camera transform, no writes before reads. */
export function updateMapCamera(root: HTMLElement, state: GameState, ui: UiState): void {
  const view = geometry(root, state, ui);
  if (!view) return;
  const { x, y, scale } = limitPan(view, ui);
  if (view.scene.style.getPropertyValue("--scene-scale") !== String(scale)) {
    root.querySelectorAll<HTMLElement>(".cell-level").forEach((label) => setStyle(label, "--label-scale", String(1 / scale)));
  }
  setStyle(view.scene, "--scene-shift-x", `${x}px`);
  setStyle(view.scene, "--scene-shift-y", `${y}px`);
  setStyle(view.scene, "--scene-scale", String(scale));
}

export const constrainMapCamera = updateMapCamera;
