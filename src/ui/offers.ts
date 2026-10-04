import { CONFIG, CUSTOMER_TYPES } from "../config";
import { isFeatureUnlocked } from "../game/quests";
import type { GameState, OfferSymbol } from "../types";
import { attentionIndicator } from "./attention";
import type { UiState } from "./types";
import { adIcon, entityIcon, uiIcon } from "./icons";
import { patchHtml, setStyle } from "./dom";

export const offerAnimationDuration = Math.max(...CONFIG.offerSlotDurations) + CONFIG.offerRevealDuration;

export function renderOfferIcon(state: GameState): string {
  if (!isFeatureUnlocked(state, "gift-offers")) return "";
  const seconds = Math.ceil(state.offers.cooldownRemaining);
  const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return `<button data-action="open-offer" class="offer-icon ${seconds > 0 ? "cooldown" : ""}" aria-label="${seconds > 0 ? `Подарок через ${timer}` : "Подарок: розыгрыш готов"}" ${seconds > 0 ? "disabled" : ""}>
    ${uiIcon("gift")}
    ${seconds > 0 ? `<small>${timer}</small>` : attentionIndicator()}
  </button>`;
}

function renderSymbol(symbol: OfferSymbol): string {
  if (symbol.color === "none") return `<span class="offer-cross">${uiIcon("close")}</span>`;
  return `<span class="offer-circles ${symbol.color} count-${symbol.count}">${"<i></i>".repeat(symbol.count)}</span>`;
}

const spinSymbols: OfferSymbol[] = [
  { color: "money", count: 1 }, { color: "customers", count: 2 }, { color: "money", count: 3 },
  { color: "none", count: 0 }, { color: "customers", count: 1 }, { color: "money", count: 2 }, { color: "customers", count: 3 },
];

const prizeTypeNames: Record<string, string> = {
  sailors: "матроса", clerks: "клерка", irish: "ирландца", cops: "копа", mafia: "мафии",
};

function renderSlots(state: GameState, elapsed: number): string {
  return CONFIG.offerSlotDurations.map((duration, index) => {
    const pending = state.offers.pending;
    if (!pending) return `<div class="offer-slot"><span class="offer-question">${uiIcon("unknown")}</span></div>`;
    if (elapsed >= duration) return `<div class="offer-slot">${renderSymbol(pending.slots[index]!)}</div>`;
    const position = elapsed / CONFIG.offerSpinSymbolDuration;
    const step = Math.floor(position);
    return `<div class="offer-slot spinning"><div class="offer-reel" style="transform:translateY(-${(position - step) * 50}%)">
      <div>${renderSymbol(spinSymbols[(step + index) % spinSymbols.length]!)}</div>
      <div>${renderSymbol(spinSymbols[(step + index + 1) % spinSymbols.length]!)}</div>
    </div></div>`;
  }).join("");
}

const slotFrames = new WeakMap<HTMLElement, string>();

export function updateOfferAnimation(root: HTMLElement, state: GameState, ui: UiState): void {
  if (!ui.offerOpen || ui.offerElapsed === null || !state.offers.pending) return;
  const elapsed = ui.offerElapsed;
  const slots = root.querySelector<HTMLElement>(".offer-slots");
  if (slots) {
    const key = CONFIG.offerSlotDurations.map((duration) => elapsed >= duration ? "stopped" : Math.floor(elapsed / CONFIG.offerSpinSymbolDuration)).join(":");
    if (slotFrames.get(slots) !== key) {
      patchHtml(slots, renderSlots(state, elapsed));
      slotFrames.set(slots, key);
    }
    slots.querySelectorAll<HTMLElement>(".offer-reel").forEach((reel) => {
      const position = elapsed / CONFIG.offerSpinSymbolDuration;
      setStyle(reel, "transform", `translateY(-${(position - Math.floor(position)) * 50}%)`);
    });
  }
  const reveal = Math.max(0, Math.min(1, (elapsed - Math.max(...CONFIG.offerSlotDurations)) / CONFIG.offerRevealDuration));
  root.querySelectorAll<HTMLElement>(".offer-result, .offer-actions").forEach((element) => {
    setStyle(element, "opacity", String(reveal));
    setStyle(element, "transform", `translateY(${(1 - reveal) * 12}px)`);
  });
  root.querySelectorAll<HTMLButtonElement>(".offer-actions button").forEach((button) => {
    if (button.disabled !== (reveal < 1)) button.disabled = reveal < 1;
  });
}

export function renderOfferWindow(state: GameState, ui: UiState): string {
  if (!ui.offerOpen) return "";
  const pending = state.offers.pending;
  const elapsed = ui.offerElapsed ?? offerAnimationDuration;
  const lastStop = Math.max(...CONFIG.offerSlotDurations);
  const reveal = pending ? Math.max(0, Math.min(1, (elapsed - lastStop) / CONFIG.offerRevealDuration)) : 0;
  const ready = reveal >= 1;
  const slots = renderSlots(state, elapsed);
  const reward = pending?.reward;
  const rewardLabel = reward?.kind === "money"
    ? `<i class="offer-reward-dot money">${uiIcon("money")}</i><strong>${reward.amount}</strong>`
    : reward ? `<i class="offer-reward-dot customers">${entityIcon("customers", reward.typeId)}</i><strong>${reward.count} ${prizeTypeNames[reward.typeId] ?? CUSTOMER_TYPES.find((type) => type.id === reward.typeId)?.name ?? ""}</strong>` : "";
  return `<div class="offer-shade"><div class="offer-layout ${pending ? "has-result" : ""}">
    <section class="offer-panel" role="dialog" aria-modal="true" aria-labelledby="offer-title">
      <div class="panel-title offer-title"><h2 id="offer-title">Подарок!</h2></div>
      <div class="offer-slots">${slots}</div>
      ${pending ? `<div class="offer-result" aria-live="polite" style="opacity:${reveal};transform:translateY(${(1 - reveal) * 12}px)"><h3>Выигрыш:</h3><div>${rewardLabel}</div></div>` : ""}
    </section>
    ${pending ? `<div class="offer-actions" style="opacity:${reveal};transform:translateY(${(1 - reveal) * 12}px)">
      <button data-action="claim-offer-ad" ${ready ? "" : "disabled"} class="offer-ad" aria-label="Получить награду за рекламу, увеличение в ${CONFIG.offerAdMultiplier} раз">${adIcon()}×${CONFIG.offerAdMultiplier}</button>
      <button data-action="claim-offer" ${ready ? "" : "disabled"} class="offer-claim">Ок</button>
    </div>` : '<button data-action="spin-offer" class="offer-start">Раскрутить</button>'}
  </div></div>`;
}
