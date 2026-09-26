import type { BuildableCellType, DrinkCategory, GameState, UnlockFeature } from "../types";
import type { PaymentEvent } from "../game/simulation";
import type { ResearchCategory } from "../game/research";

export type BottomPanel = "menu" | "customers" | "research" | null;

export interface MovePreview {
  cellId: string;
  floorY: number;
  cellOrder: string[];
}

export interface UiState {
  focusX: number | null;
  focusY: number | null;
  panel: BottomPanel;
  buildOpen: boolean;
  removeConfirmCellId: string | null;
  movePreview: MovePreview | null;
  selectedBuild: BuildableCellType | null;
  menuCategory: DrinkCategory;
  researchCategory: ResearchCategory;
  panX: number;
  panY: number;
  holdPressed: boolean;
  unlockQueue: UnlockFeature[];
  paymentPopups: Array<PaymentEvent & { elapsed: number }>;
}

export function createUiState(): UiState {
  return {
    focusX: null,
    focusY: null,
    panel: null,
    buildOpen: false,
    removeConfirmCellId: null,
    movePreview: null,
    selectedBuild: null,
    menuCategory: "keg",
    researchCategory: "bar",
    panX: 0,
    panY: 0,
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
