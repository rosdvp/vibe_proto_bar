import type { BuildableCellType, GameState, UnlockFeature } from "../types";
import type { PaymentEvent } from "../game/simulation";

export type BottomPanel = "menu" | "customers" | "research" | null;

export interface MovePreview {
  cellId: string;
  floorY: number;
  cellOrder: string[];
}

export interface UiState {
  decorCellId: string | null;
  decorScrollTarget: string | null;
  energyOpen: boolean;
  offerOpen: boolean;
  offerElapsed: number | null;
  focusX: number | null;
  focusY: number | null;
  panel: BottomPanel;
  buildOpen: boolean;
  removeConfirmCellId: string | null;
  movePreview: MovePreview | null;
  selectedBuild: BuildableCellType | null;
  panX: number;
  panY: number;
  mapZoom: number;
  holdPressed: boolean;
  unlockQueue: UnlockFeature[];
  paymentPopups: Array<PaymentEvent & { elapsed: number }>;
}

export function createUiState(): UiState {
  return {
    decorCellId: null,
    decorScrollTarget: null,
    energyOpen: false,
    offerOpen: false,
    offerElapsed: null,
    focusX: null,
    focusY: null,
    panel: null,
    buildOpen: false,
    removeConfirmCellId: null,
    movePreview: null,
    selectedBuild: null,
    panX: 0,
    panY: 0,
    mapZoom: 1,
    holdPressed: false,
    unlockQueue: [],
    paymentPopups: [],
  };
}

export function previewState(state: GameState, ui: UiState): GameState {
  if (!ui.movePreview) return state;
  const positions = new Map(ui.movePreview.cellOrder.map((id, x) => [id, x]));
  return {
    ...state,
    cells: state.cells.map((cell) => cell.y === ui.movePreview?.floorY
      ? { ...cell, x: positions.get(cell.id) ?? cell.x }
      : cell),
  };
}
