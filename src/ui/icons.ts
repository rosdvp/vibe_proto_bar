/// <reference types="vite/client" />
import type { CellType, DecorId, UnlockFeature } from "../types";
export const UI_ICON_IDS = ["money","people","staff","drink","cell","menu","research","energy","speed","gift","lock","hourglass","warning","attention","close","check","build-plus","chevron","unknown","dig-wide","dig-deep","ad"] as const;
export type UiIconId = (typeof UI_ICON_IDS)[number];
export const CUSTOMER_ICON_IDS = ["sailors", "clerks", "irish", "cops", "mafia"] as const;
export const DRINK_ICON_IDS = ["mash", "lager", "porter", "ale", "guinness"] as const;
export const CELL_ICON_IDS = ["entrance", "counter", "taps", "waiter-station", "table", "toilet-stall", "sink", "hand-dryer", "darts", "billiards", "stairs"] as const satisfies readonly CellType[];
export type EntityIconFamily = "customers" | "cells" | "drinks";
const entityIds: Record<EntityIconFamily, readonly string[]> = { customers: CUSTOMER_ICON_IDS, cells: CELL_ICON_IDS, drinks: DRINK_ICON_IDS };
function image(path: string, classes = ""): string {
  return `<img class="art-icon ${classes}" src="${import.meta.env.BASE_URL}art/icons/${path}" alt="" aria-hidden="true" draggable="false">`;
}
function roundImage(path: string, classes: string): string {
  return `<span class="art-icon entity-icon round-icon ${classes}" aria-hidden="true">${image(path, "entity-art")}</span>`;
}
export function uiIcon(id: UiIconId, classes = ""): string {
  if (id === "dig-wide" || id === "dig-deep") return roundImage(`ui/${id}.png`, `icon-family-cells ${classes}`);
  return image(`ui/${id}.${id === "ad" ? "png" : "svg"}`, classes);
}
export function entityIcon(family: EntityIconFamily, id: string): string {
  return entityIds[family].includes(id) ? roundImage(`${family}/${id}.png`, `icon-family-${family}`) : uiIcon("unknown", "round-icon");
}
export function resourceIcon(kind: "money" | "people" | "staff" | "drink" | "cell"): string {
  return `<i class="color-dot ${kind}" aria-hidden="true">${uiIcon(kind)}</i>`;
}
export function adIcon(): string { return `<span class="offer-ad-symbol" aria-hidden="true">${uiIcon("ad")}</span>`; }
export function lockIcon(): string { return `<i class="lock-icon" aria-hidden="true">${uiIcon("lock", "round-icon locked-icon")}</i>`; }
const researchCells: Record<string, CellType> = {
  tables: "table", waiters: "waiter-station", taps: "taps", counter: "counter", darts: "darts",
  billiards: "billiards", "toilet-stall": "toilet-stall", sink: "sink", "hand-dryer": "hand-dryer",
};
export function researchIcon(id: string): string {
  const base = id.replace(/-(ii|iii)$/, "");
  if (base === "dig-wide" || base === "dig-deep") return uiIcon(base);
  return researchCells[base] ? entityIcon("cells", researchCells[base]) : uiIcon("research", "round-icon icon-family-cells");
}
const featureIcons: Record<string, UiIconId> = {
  "menu-screen": "menu", "customers-screen": "people", "research-screen": "research", hold: "speed", "gift-offers": "gift",
};
export function decorIcon(id: DecorId): string { return roundImage(`decor/${id}.svg`, "icon-family-decor"); }

export function unlockIcon(feature: UnlockFeature): string {
  if (feature.kind === "decor") return decorIcon(feature.id);
  if (feature.kind === "customer-type") return entityIcon("customers", feature.id);
  if (feature.kind === "cell-type") return entityIcon("cells", feature.id);
  const tierType = feature.id.replace(/-tier-[23]$/, "");
  if (CELL_ICON_IDS.some((id) => id === tierType)) return entityIcon("cells", tierType);
  if (feature.id.startsWith("floor-width-")) return uiIcon("dig-wide");
  if (feature.id.startsWith("floor-count-")) return uiIcon("dig-deep");
  return uiIcon(featureIcons[feature.id] ?? "unknown");
}
