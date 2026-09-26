import { BUILDABLE_CELL_TYPES, CELL_DEFINITIONS, CONFIG, CUSTOMER_TYPES, DRINKS } from "../config";
import { barRating, cellBonusPercent, cellQuality, cellRefund, customerArrivalChances, isCellTypeUnlocked, isCellUpgradeTierUnlocked, isDrinkUnlocked, isFeatureUnlocked, menuCapacity, nextCustomerRateMilestone, requiredTierResearchId, tierProgressPercent, unlockedByType, upgradeCostForLevel, workSpeedBonusPercent } from "../game";
import { equipmentIssue, extraUsePrice } from "../game/selectors";
import type { BuildableCellType, Cell, GameState } from "../types";
import { lockIcon } from "./icons";
import type { UiState } from "./types";
import { renderResearch } from "./research";
import { attentionIndicator, attentionOnBuiltCell, attentionOnMashAddButton } from "./attention";
import { isFloorWidthBlocked, isNewFloorBlocked, nextDepthResearchId, nextWidthResearchId } from "../game/infrastructure";

function colorDot(kind: "money" | "rating" | "people" | "drink" | "cell"): string {
  return `<i class="color-dot ${kind}" aria-hidden="true"></i>`;
}

function stars(rating: number): string {
  return `<span class="stars" aria-label="Рейтинг ${rating} из 3">${"★".repeat(rating)}</span>`;
}

function renderMenu(state: GameState, ui: UiState): string {
  const selected = state.menu.filter((id) => {
    const drink = DRINKS.find((candidate) => candidate.id === id);
    return drink?.category === ui.menuCategory && isDrinkUnlocked(state, drink.id);
  }).length;
  const drinks = DRINKS.filter((drink) => drink.category === ui.menuCategory);
  return `<section class="panel split-panel menu-panel">
    <div class="panel-title"><h2>Меню</h2><b>${selected}/${menuCapacity(state, ui.menuCategory)}</b></div>
    <div class="category-tabs" aria-label="Категории меню">
      <button data-action="menu-category" data-category="keg" class="active" aria-label="Пиво">${colorDot("drink")}</button>
    </div>
    <div class="panel-content">
      <section class="menu-category"><h3>Пиво</h3>
        <div class="item-list" data-scroll-key="menu-items">${drinks.map((drink) => {
          const locked = !isDrinkUnlocked(state, drink.id);
          const active = !locked && state.menu.includes(drink.id);
          const full = !active && selected >= menuCapacity(state, ui.menuCategory);
          return `<article class="menu-item ${locked ? "locked" : ""} ${active ? "selected" : ""}">${state.unseenUnlockIds.includes(`menu-item:${drink.id}`) ? attentionIndicator() : ""}
            <div class="drink-image">${locked ? lockIcon() : colorDot("drink")}</div>
            <div class="item-copy"><strong>${drink.name}</strong>${stars(drink.rating)}<span><b class="price-plus">+</b>${colorDot("money")} ${drink.price}</span></div>
            ${locked ? `<span class="menu-locked-note">ЕЩЕ НЕ ОТКРЫТО</span>` : `<button class="toggle-item ${active ? "remove" : "add"}" data-action="toggle-drink" data-id="${drink.id}" ${full ? "disabled" : ""}>${active ? "Убрать" : "Добавить"}${drink.id === "mash" && !active && attentionOnMashAddButton(state) ? attentionIndicator() : ""}</button>`}
          </article>`;
        }).join("")}</div>
      </section>
    </div>
  </section>`;
}

function requirementData(state: GameState, type: (typeof CUSTOMER_TYPES)[number]): Array<{ kind: "drink" | "cell"; label: string; met: boolean }> {
  const cellRequirements = type.qualityRequirements.map((requirement) => {
    const definition = CELL_DEFINITIONS[requirement.cellType];
    const level = Math.ceil(1 + requirement.minimum * (CONFIG.maxCellLevel - 1) / 100 - Number.EPSILON);
    return {
      kind: "cell" as const,
      label: `${definition.room}. ${definition.name} ур. ${level}+`,
      met: state.cells.some((cell) => cell.type === requirement.cellType && cellQuality(cell.level) + Number.EPSILON >= requirement.minimum),
    };
  });
  const drinkRequirements = type.drinkRequirements.map((requirement) => {
    if (requirement.kind === "specific") {
      return { kind: "drink" as const, label: DRINKS.find((drink) => drink.id === requirement.drinkId)?.name ?? "", met: state.menu.includes(requirement.drinkId) };
    }
    const label = `Пиво уровня ${requirement.min}${requirement.max !== requirement.min ? `-${requirement.max}` : ""}`;
    const met = DRINKS.some((drink) => state.menu.includes(drink.id) && drink.category === requirement.category && drink.rating >= requirement.min && drink.rating <= requirement.max);
    return { kind: "drink" as const, label, met };
  });
  return [...drinkRequirements, ...cellRequirements];
}

function renderCustomers(state: GameState): string {
  const unlocked = unlockedByType(state);
  const chances = customerArrivalChances(state);
  const milestone = nextCustomerRateMilestone(barRating(state));
  const rateHint = milestone.isMaximum
    ? `Максимум ${milestone.customersPerMinute} клиентов / мин`
    : `Еще <b>${milestone.ratingRemaining}</b>${colorDot("rating")} рейтинга до <b>${milestone.customersPerMinute}</b> клиентов / мин`;
  return `<section class="panel customers-panel">
    <div class="panel-title"><h2>Клиенты</h2></div>
    <div class="customer-rate-hint">${rateHint}</div>
    <div class="customer-list" data-scroll-key="customer-types">${CUSTOMER_TYPES.map((type) => {
      const chance = Math.round((chances[type.id] ?? 0) * 100);
      return `<article class="customer-type ${unlocked[type.id] ? "unlocked" : ""}">
        <div class="customer-avatar">${colorDot("people")}</div>
        <strong>${type.name}</strong><b>шанс ${chance}%</b>
        <div class="requirements">${requirementData(state, type).map((item) => `<span class="requirement ${item.met ? "met" : "missing"}">${colorDot(item.kind)}<em>${item.label}</em><i class="status-mark">${item.met ? "✓" : "×"}</i></span>`).join("")}</div>
        <span class="allowed-note" aria-label="Статус типа">${unlocked[type.id] ? "Доступен" : "Закрыт"}</span>
      </article>`;
    }).join("")}</div>
  </section>`;
}

export function renderPanel(state: GameState, ui: UiState): string {
  if (!ui.panel) return "";
  return `<div class="modal-shade"><div class="modal-panel">${ui.panel === "menu" ? renderMenu(state, ui) : ui.panel === "research" ? renderResearch(state, ui) : renderCustomers(state)}</div></div>`;
}

function buildBadges(type: BuildableCellType): string {
  if (type === "taps") return `<span>${colorDot("drink")}1 напиток</span><span>${colorDot("rating")}1 бармен</span>`;
  if (type === "counter") return `<span>${colorDot("people")}3 места</span>`;
  if (type === "waiter-station") return `<span>${colorDot("rating")}1 официант</span>`;
  if (type === "table") return `<span>${colorDot("people")}2 места</span>`;
  if (type === "billiards") return `<span>${colorDot("people")}2 места</span>`;
  if (["toilet-stall", "sink", "hand-dryer", "darts"].includes(type)) return `<span>${colorDot("people")}1 место</span>`;
  return `<span>Без уровня</span>`;
}

export function renderBuildPanel(state: GameState, ui: UiState): string {
  if (!ui.buildOpen || ui.focusX === null || ui.focusY === null) return "";
  const availableTypes = BUILDABLE_CELL_TYPES.filter((type) => type !== "stairs");
  const rooms = [...new Set(availableTypes.map((type) => CELL_DEFINITIONS[type].room))];
  return `<div class="modal-shade build-shade"><section class="build-panel">
    <div class="panel-title build-title"><h2>Что строим?</h2></div>
    <div class="build-list" data-scroll-key="build-types">${rooms.map((room) => `<section class="build-group"><h3>${room}</h3>${availableTypes.filter((type) => CELL_DEFINITIONS[type].room === room).map((type) => {
      const definition = CELL_DEFINITIONS[type];
      const locked = !isCellTypeUnlocked(state, type);
      return `<button ${locked ? "disabled" : `data-action="select-build" data-type="${type}"`} class="build-option ${locked ? "locked" : ""} ${ui.selectedBuild === type ? "selected" : ""}">
        <span class="build-picture">${locked ? lockIcon() : ""}</span><strong>${definition.name}</strong>${locked
          ? `<span class="build-locked-note">ЕЩЕ НЕ ОТКРЫТО</span>`
          : `<em>${colorDot("money")}${CONFIG.buildCost}</em><span class="build-badges">${buildBadges(type)}</span>`}
      </button>`;
    }).join("")}</section>`).join("")}</div>
    <div class="build-actions"><button class="primary-button" data-action="confirm-build" ${!ui.selectedBuild || state.money < CONFIG.buildCost ? "disabled" : ""}>Построить <span>${colorDot("money")}${CONFIG.buildCost}</span></button><button class="square-close" data-action="close-build" aria-label="Закрыть">×</button></div>
  </section></div>`;
}

export function renderUnlockPanel(ui: UiState): string {
  const feature = ui.unlockQueue[0];
  if (!feature) return "";
  const image = feature.kind === "menu-item"
    ? '<i class="unlock-feature-circle menu-feature" aria-hidden="true"></i>'
    : feature.kind === "cell-type"
      ? '<i class="unlock-feature-circle cell-feature" aria-hidden="true"></i>'
      : '<span class="unlock-feature-unknown" aria-hidden="true">?</span>';
  return `<div class="modal-shade unlock-shade"><div class="unlock-layout"><section class="unlock-panel" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
    <div class="panel-title unlock-title"><h2 id="unlock-title">РАЗБЛОКИРОВАНО</h2></div>
    <div class="unlock-feature-image">${image}</div>
    <strong>${feature.name}</strong>
  </section><button class="primary-button unlock-confirm" data-action="close-unlock">Ура</button></div></div>`;
}

function focusBadges(cell: Cell): string {
  if (cell.type === "taps") return `<span>${colorDot("drink")}1 напиток</span><span>${colorDot("rating")}1 бармен</span>`;
  if (cell.type === "counter") return `<span>${colorDot("people")}3 места</span>`;
  if (cell.type === "waiter-station") return `<span>${colorDot("rating")}1 официант</span>`;
  if (cell.type === "table") return `<span>${colorDot("people")}2 места</span>`;
  if (cell.type === "billiards") return `<span>${colorDot("people")}2 места</span>`;
  if (["toilet-stall", "sink", "hand-dryer", "darts"].includes(cell.type)) return `<span>${colorDot("people")}1 место</span>`;
  return "";
}

function levelEffects(cell: Cell): string {
  const extra = ["toilet-stall", "sink", "hand-dryer", "darts", "billiards"].includes(cell.type);
  const rating = cell.level - 1 + (extra ? 1 : 0);
  const price = `<span><b>+${cellBonusPercent(cell.level)}%</b> к цене заказа</span>`;
  const speed = workSpeedBonusPercent(cell.level);
  const ratingEffect = `<span><b>+${rating}</b> к рейтингу</span>`;
  if (cell.type === "counter" || cell.type === "table") return `${price}<span><b>+${speed}%</b> к скорости потребления</span>${ratingEffect}`;
  if (cell.type === "taps") return `${price}<span><b>+${speed}%</b> к скорости работы</span>${ratingEffect}`;
  if (cell.type === "waiter-station") return `<span><b>+${speed}%</b> к скорости официанта</span>${ratingEffect}`;
  if (cell.type === "toilet-stall" || cell.type === "sink" || cell.type === "hand-dryer") return `<span><b>+${cellBonusPercent(cell.level)}%</b> к шансу повторного заказа</span><span><b>+${speed}%</b> к скорости использования</span>${ratingEffect}`;
  if (cell.type === "darts" || cell.type === "billiards") {
    const amount = extraUsePrice(cell);
    return `<span><b>${amount}</b> ${colorDot("money")} с клиента</span><span><b>+${speed}%</b> к скорости использования</span>${ratingEffect}`;
  }
  return "";
}

export function renderFocusHud(state: GameState, ui: UiState): string {
  if (ui.buildOpen || ui.focusX === null || ui.focusY === null) return "";
  const cell = state.cells.find((candidate) => candidate.x === ui.focusX && candidate.y === ui.focusY);
  if (ui.movePreview) {
    const index = ui.movePreview.cellOrder.indexOf(ui.movePreview.cellId);
    const leftCell = state.cells.find((candidate) => candidate.id === ui.movePreview?.cellOrder[index - 1]);
    const rightCell = state.cells.find((candidate) => candidate.id === ui.movePreview?.cellOrder[index + 1]);
    const canMoveLeft = index > 0 && leftCell?.type !== "entrance" && leftCell?.type !== "stairs";
    const canMoveRight = index < ui.movePreview.cellOrder.length - 1 && rightCell?.type !== "entrance" && rightCell?.type !== "stairs";
    return `<div class="focus-hud move-preview">
      <div class="focus-cell-frame"></div>
      ${canMoveLeft ? `<button class="focus-arrow left" data-action="move-preview-step" data-dx="-1" aria-label="Передвинуть влево">‹</button>` : ""}
      ${canMoveRight ? `<button class="focus-arrow right" data-action="move-preview-step" data-dx="1" aria-label="Передвинуть вправо">›</button>` : ""}
      <button class="move-confirm" data-action="confirm-move-preview">Подтвердить</button>
      <button class="square-close move-cancel" data-action="cancel-move-preview" aria-label="Отменить перемещение">×</button>
    </div>`;
  }
  const floor = state.cells.filter((item) => item.y === ui.focusY);
  const minBuilt = Math.min(...floor.map((item) => item.x));
  const maxBuilt = Math.max(...floor.map((item) => item.x));
  const canNavigateFromCell = cell?.type !== "entrance" && cell?.type !== "stairs";
  const leftCell = floor.find((item) => item.x === ui.focusX! - 1);
  const rightCell = floor.find((item) => item.x === ui.focusX! + 1);
  const canLeft = canNavigateFromCell && ui.focusX > minBuilt && leftCell?.type !== "entrance" && leftCell?.type !== "stairs";
  const canRight = canNavigateFromCell && ui.focusX < maxBuilt + (isFloorWidthBlocked(state, ui.focusY) && !nextWidthResearchId(state) ? 0 : 1) && rightCell?.type !== "entrance" && rightCell?.type !== "stairs";
  const arrows = `${canLeft ? `<button class="focus-arrow left" data-action="focus-step" data-dx="-1" data-dy="0" aria-label="Предыдущая ячейка">‹</button>` : ""}${canRight ? `<button class="focus-arrow right" data-action="focus-step" data-dx="1" data-dy="0" aria-label="Следующая ячейка">›</button>` : ""}`;
  if (!cell) {
    const vertical = ui.focusX === 0 && ui.focusY < 0 && state.cells.some((candidate) => candidate.x === 0 && candidate.y === ui.focusY! + 1 && (candidate.type === "entrance" || candidate.type === "stairs"));
    const canBuildStairs = vertical;
    const researchId = vertical ? nextDepthResearchId(state) : nextWidthResearchId(state);
    const researchLocked = vertical ? isNewFloorBlocked(state, ui.focusY) : isFloorWidthBlocked(state, ui.focusY);
    const stairsLocked = vertical && !isCellTypeUnlocked(state, "stairs");
    const emptyCellWidth = (canBuildStairs ? CELL_DEFINITIONS.stairs.width : 1) * CONFIG.baseCellWidth;
    const buildAction = stairsLocked
      ? `<button class="build-cell-button tier-research-button" disabled>еще не открыто</button>`
      : researchLocked
      ? `<button class="build-cell-button tier-research-button" ${isFeatureUnlocked(state, "research-screen") && researchId ? `data-action="show-tier-research" data-research-id="${researchId}" aria-disabled="true"` : "disabled"}>требуется<br>исследование</button>`
      : canBuildStairs
      ? `<button class="build-cell-button stair-build-button" data-action="build-stairs" ${state.money < CONFIG.buildCost || !isCellTypeUnlocked(state, "stairs") ? "disabled" : ""}>Построить лестницу <span>${colorDot("money")}${CONFIG.buildCost}</span></button>`
      : `<button class="build-cell-button" data-action="open-build">Построить</button>`;
    return `<div class="focus-hud empty-focus"><div class="focus-cell-frame" style="--empty-cell-width:${emptyCellWidth}px"><b>Пусто</b></div>${arrows}${buildAction}<button class="square-close focus-close" data-action="close-focus" aria-label="Закрыть">×</button></div>`;
  }
  const title = cell.type === "entrance" ? "Вход" : cell.type === "stairs" ? "Лестница" : `${CELL_DEFINITIONS[cell.type].room}. ${CELL_DEFINITIONS[cell.type].name}`;
  const levelled = cell.type !== "entrance" && cell.type !== "stairs";
  const progress = tierProgressPercent(cell.level);
  const issue = equipmentIssue(state, cell);
  const upgradeCost = upgradeCostForLevel(cell.level + 1);
  const tierResearchId = requiredTierResearchId(cell.type as BuildableCellType, cell.level + 1);
  const researchLocked = tierResearchId !== null && !isCellUpgradeTierUnlocked(state, cell.type as BuildableCellType, cell.level + 1);
  const researchNavigation = researchLocked && isFeatureUnlocked(state, "research-screen");
  const upgradeAttention = attentionOnBuiltCell(state, cell.type) ? attentionIndicator() : "";
  const upgradeButton = researchLocked
    ? `<button class="tier-research-button" ${researchNavigation ? `data-action="show-tier-research" data-research-id="${tierResearchId}" aria-disabled="true"` : "disabled"}>требуется<br>исследование${upgradeAttention}</button>`
    : `<button data-action="upgrade" data-id="${cell.id}" ${cell.level >= CONFIG.maxCellLevel || state.money < upgradeCost ? "disabled" : ""}>Улучшить<br>${colorDot("money")}${upgradeCost}${upgradeAttention}</button>`;
  return `<div class="focus-hud built-focus">
    <div class="focus-cell-frame"></div>${arrows}
    ${levelled ? `<section class="cell-card" data-scroll-key="cell-${cell.id}">${issue ? `<div class="cell-issue">${issue}</div>` : ""}<h2>${title}</h2><div class="cell-badges">${focusBadges(cell)}</div><div class="level-layout"><b>Ур. ${cell.level}.</b><span class="level-progress"><i style="width:${progress}%"></i></span><div class="level-effects">${levelEffects(cell)}</div>${upgradeButton}</div><div class="cell-actions"><button data-action="open-remove-confirm" data-id="${cell.id}">Убрать</button><button data-action="open-move-preview" data-id="${cell.id}">Передвинуть</button><button disabled>Декор</button></div></section>` : `<h2 class="static-cell-title">${title}</h2>`}
    <button class="square-close focus-close" data-action="close-focus" aria-label="Закрыть">×</button>
  </div>`;
}

export function renderRemoveConfirmation(state: GameState, ui: UiState): string {
  const cell = state.cells.find((candidate) => candidate.id === ui.removeConfirmCellId);
  if (!cell || cell.type === "entrance" || cell.type === "stairs") return "";
  const refund = cellRefund(cell.level);
  return `<div class="remove-confirm-shade"><section class="remove-confirm" role="dialog" aria-modal="true" aria-labelledby="remove-confirm-title">
    <h2 id="remove-confirm-title">Убрать ячейку?</h2>
    <p>Ячейка будет уничтожена. Все затраченные средства вернутся.</p>
    <strong>Возврат: ${colorDot("money")}${refund}</strong>
    <div><button data-action="confirm-remove">Убрать</button><button data-action="close-remove-confirm">Отмена</button></div>
  </section></div>`;
}
