import { BUILDABLE_CELL_TYPES, CELL_DEFINITIONS, CONFIG, CUSTOMER_TYPES, DRINKS } from "../config";
import { cellBonusPercent, cellRefund, isCellTypeUnlocked, isCellUpgradeTierUnlocked, isFeatureUnlocked, requiredTierResearchId, tierProgressPercent, upgradeCostForLevel, workSpeedBonusPercent } from "../game";
import { isCustomerTypeUnlocked } from "../game/progression";
import { customerRate, customerUpgradeCost, customerPriceMultiplier, drinkChance, drinkPrice, drinkUpgradeCost } from "../game/economy";
import { equipmentIssue, extraUsePrice } from "../game/selectors";
import type { BuildableCellType, Cell, GameState } from "../types";
import { isDecorCellType } from "../game/decor";
import { entityIcon, lockIcon, resourceIcon, uiIcon, unlockIcon } from "./icons";
import { formatDecimalDown, formatOrderPrice } from "./format";
import type { UiState } from "./types";
import { renderResearch } from "./research";
import { attentionIndicator, attentionOnBuiltCell, attentionOnCustomerUpgradeButton, attentionOnMashAddButton } from "./attention";
import { isFloorWidthBlocked, isNewFloorBlocked, nextDepthResearchId, nextWidthResearchId } from "../game/infrastructure";

function colorDot(kind: "money" | "people" | "staff" | "drink" | "cell"): string {
  return resourceIcon(kind);
}

function levelBar(level: number, maxLevel: number): string {
  return `<div class="entity-level"><small>ур ${level}</small><span role="progressbar" aria-valuemin="0" aria-valuemax="${maxLevel}" aria-valuenow="${level}"><i style="width:${level / maxLevel * 100}%"></i></span></div>`;
}

function renderMenu(state: GameState): string {
  return `<section class="panel menu-panel">
    <div class="panel-title"><h2>Меню</h2></div>
    <div class="entity-list" data-scroll-key="entity-layouts">${DRINKS.map((drink) => {
      const level = state.drinkLevels[drink.id] ?? 0;
      const cost = drinkUpgradeCost(drink, level + 1);
      return `<article class="entity-card entity-layout ${level === 0 ? "entity-layout-locked" : ""}">
        <div class="entity-avatar drink-avatar">${level === 0 ? lockIcon() : entityIcon("drinks", drink.id)}</div>
        <strong>${drink.name}</strong>
        <div class="entity-details">${level > 0 ? `<span><b>${colorDot("money")}${formatOrderPrice(drinkPrice(state, drink))}</b> за заказ</span><span><b>${Number(drinkChance(state, drink).toFixed(1))}%</b> шанс заказа</span>` : `<b class="entity-locked">Не открыто</b>`}</div>
        ${level < drink.maxLevel ? `<button class="entity-upgrade" data-action="upgrade-drink" data-id="${drink.id}" ${state.money < cost ? "disabled" : ""}>${level === 0 ? "Открыть" : "Улучшить"}<span>${colorDot("money")}${cost}</span>${drink.id === "mash" && level === 0 && attentionOnMashAddButton(state) ? attentionIndicator() : ""}</button>` : `<span class="entity-max">Максимум</span>`}
        ${level > 0 ? levelBar(level, drink.maxLevel) : ""}
      </article>`;
    }).join("")}</div>
  </section>`;
}

function requirementData(state: GameState, type: (typeof CUSTOMER_TYPES)[number]): Array<{ kind: "drink" | "cell"; id: string; label: string; met: boolean; unlocked: boolean }> {
  const requirement = type.requirement;
  if (!requirement) return [];
  if (requirement.kind === "drink-level") {
    return [{ kind: "drink", id: requirement.drinkId, unlocked: (state.drinkLevels[requirement.drinkId] ?? 0) > 0, label: `${DRINKS.find((drink) => drink.id === requirement.drinkId)?.name ?? ""} ур. ${requirement.level}+`, met: (state.drinkLevels[requirement.drinkId] ?? 0) >= requirement.level }];
  }
  const cellTypes = requirement.kind === "cell" ? [requirement.cellType] : requirement.cellTypes;
  return cellTypes.map((cellType) => ({ kind: "cell", id: cellType, unlocked: isCellTypeUnlocked(state, cellType), label: CELL_DEFINITIONS[cellType].name, met: state.cells.some((cell) => cell.type === cellType) }));
}

function renderCustomers(state: GameState): string {
  return `<section class="panel customers-panel">
    <div class="panel-title"><h2>Клиенты</h2></div>
    <div class="customer-list" data-scroll-key="customer-types">${CUSTOMER_TYPES.map((type) => {
      const unlocked = isCustomerTypeUnlocked(state, type);
      const level = state.customerLevels[type.id] ?? 0;
      const cost = customerUpgradeCost(type, level + 1);
      return `<article class="entity-card customer-type entity-layout ${level === 0 ? "entity-layout-locked" : ""} ${!unlocked ? "customer-requirements" : ""}">
        <div class="customer-avatar">${!unlocked || level === 0 ? lockIcon() : entityIcon("customers", type.id)}</div>
        <strong>${type.name}</strong>
        ${unlocked ? `<div class="entity-details">${level > 0 ? `<span><b>${Number(customerRate(state, type).toFixed(2))}</b> клиентов в минуту</span><span><b>+${Number(customerPriceMultiplier(state, type).toFixed(1))}%</b> цена заказа</span>` : `<b class="entity-locked">Не открыто</b>`}</div>
        ${level < type.maxLevel ? `<button class="entity-upgrade" data-action="upgrade-customer" data-id="${type.id}" ${state.money < cost ? "disabled" : ""}>${level === 0 ? "Открыть" : "Улучшить"}<span>${colorDot("money")}${cost}</span>${attentionOnCustomerUpgradeButton(state, type.id) ? attentionIndicator() : ""}</button>` : `<span class="entity-max">Максимум</span>`}
        ${level > 0 ? levelBar(level, type.maxLevel) : ""}` : `<div class="requirements">${requirementData(state, type).map((item) => `<span class="requirement ${item.met ? "met" : "missing"}">${item.unlocked ? entityIcon(item.kind === "drink" ? "drinks" : "cells", item.id) : lockIcon()}<em>${item.label}</em><i class="status-mark">${uiIcon(item.met ? "check" : "close")}</i></span>`).join("")}</div>`}
      </article>`;
    }).join("")}</div>
  </section>`;
}

export function renderPanel(state: GameState, ui: UiState): string {
  if (!ui.panel) return "";
  return `<div class="modal-shade"><div class="modal-panel">${ui.panel === "menu" ? renderMenu(state) : ui.panel === "research" ? renderResearch(state) : renderCustomers(state)}</div></div>`;
}

function buildBadges(type: BuildableCellType): string {
  if (type === "taps") return `<span>${colorDot("staff")}1 бармен</span>`;
  if (type === "counter") return `<span>${colorDot("people")}3 места</span>`;
  if (type === "waiter-station") return `<span>${colorDot("staff")}1 официант</span>`;
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
        <span class="build-picture">${locked ? lockIcon() : entityIcon("cells", type)}</span><strong>${definition.name}</strong>${locked
          ? `<span class="build-locked-note">ЕЩЕ НЕ ОТКРЫТО</span>`
          : `<em>${colorDot("money")}${CONFIG.buildCost}</em><span class="build-badges">${buildBadges(type)}</span>`}
      </button>`;
    }).join("")}</section>`).join("")}</div>
    <div class="build-actions"><button class="primary-button" data-action="confirm-build" ${!ui.selectedBuild || state.money < CONFIG.buildCost ? "disabled" : ""}>Построить <span>${colorDot("money")}${CONFIG.buildCost}</span></button><button class="square-close" data-action="close-build" aria-label="Закрыть">${uiIcon("close")}</button></div>
  </section></div>`;
}

export function renderUnlockPanel(ui: UiState): string {
  const feature = ui.unlockQueue[0];
  if (!feature) return "";
  const image = unlockIcon(feature);
  return `<div class="modal-shade unlock-shade"><div class="unlock-layout"><section class="unlock-panel" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
    <div class="panel-title unlock-title"><h2 id="unlock-title">РАЗБЛОКИРОВАНО</h2></div>
    <div class="unlock-feature-image">${image}</div>
    <strong>${feature.name}</strong>
  </section><button class="primary-button unlock-confirm" data-action="close-unlock">Ура</button></div></div>`;
}

function focusBadges(cell: Cell): string {
  if (cell.type === "taps") return `<span>${colorDot("staff")}1 бармен</span>`;
  if (cell.type === "counter") return `<span>${colorDot("people")}3 места</span>`;
  if (cell.type === "waiter-station") return `<span>${colorDot("staff")}1 официант</span>`;
  if (cell.type === "table") return `<span>${colorDot("people")}2 места</span>`;
  if (cell.type === "billiards") return `<span>${colorDot("people")}2 места</span>`;
  if (["toilet-stall", "sink", "hand-dryer", "darts"].includes(cell.type)) return `<span>${colorDot("people")}1 место</span>`;
  return "";
}

function levelEffects(cell: Cell): string {
  const price = `<span><b>+${formatDecimalDown(cellBonusPercent(cell.level, cell.type))}%</b> к цене заказа</span>`;
  const speed = formatDecimalDown(workSpeedBonusPercent(cell.level));
  if (cell.type === "counter" || cell.type === "table") return `${price}<span><b>+${speed}%</b> к скорости потребления</span>`;
  if (cell.type === "taps") return `${price}<span><b>+${speed}%</b> к скорости работы</span>`;
  if (cell.type === "waiter-station") return `<span><b>+${speed}%</b> к скорости официанта</span>`;
  if (cell.type === "toilet-stall" || cell.type === "sink" || cell.type === "hand-dryer") return `<span><b>+${formatDecimalDown(cellBonusPercent(cell.level, cell.type))}%</b> к шансу повторного заказа</span><span><b>+${speed}%</b> к скорости использования</span>`;
  if (cell.type === "darts" || cell.type === "billiards") {
    const amount = formatDecimalDown(extraUsePrice(cell));
    return `<span><b>${colorDot("money")}${amount}</b> с клиента</span><span><b>+${speed}%</b> к скорости использования</span>`;
  }
  return "";
}

export function renderFocusHud(state: GameState, ui: UiState): string {
  if (ui.decorCellId !== null || ui.buildOpen || ui.focusX === null || ui.focusY === null) return "";
  const cell = state.cells.find((candidate) => candidate.x === ui.focusX && candidate.y === ui.focusY);
  if (ui.movePreview) {
    const index = ui.movePreview.cellOrder.indexOf(ui.movePreview.cellId);
    const leftCell = state.cells.find((candidate) => candidate.id === ui.movePreview?.cellOrder[index - 1]);
    const rightCell = state.cells.find((candidate) => candidate.id === ui.movePreview?.cellOrder[index + 1]);
    const canMoveLeft = index > 0 && leftCell?.type !== "entrance" && leftCell?.type !== "stairs";
    const canMoveRight = index < ui.movePreview.cellOrder.length - 1 && rightCell?.type !== "entrance" && rightCell?.type !== "stairs";
    return `<div class="focus-hud move-preview">
      <div class="focus-cell-frame"></div>
      ${canMoveLeft ? `<button class="focus-arrow left" data-action="move-preview-step" data-dx="-1" aria-label="Передвинуть влево">${uiIcon("chevron", "mirror-icon")}</button>` : ""}
      ${canMoveRight ? `<button class="focus-arrow right" data-action="move-preview-step" data-dx="1" aria-label="Передвинуть вправо">${uiIcon("chevron")}</button>` : ""}
      <button class="move-confirm" data-action="confirm-move-preview">Подтвердить</button>
      <button class="square-close move-cancel" data-action="cancel-move-preview" aria-label="Отменить перемещение">${uiIcon("close")}</button>
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
  const arrows = `${canLeft ? `<button class="focus-arrow left" data-action="focus-step" data-dx="-1" data-dy="0" aria-label="Предыдущая ячейка">${uiIcon("chevron", "mirror-icon")}</button>` : ""}${canRight ? `<button class="focus-arrow right" data-action="focus-step" data-dx="1" data-dy="0" aria-label="Следующая ячейка">${uiIcon("chevron")}</button>` : ""}`;
  if (!cell) {
    const vertical = ui.focusX === 0 && ui.focusY < 0 && state.cells.some((candidate) => candidate.x === 0 && candidate.y === ui.focusY! + 1 && (candidate.type === "entrance" || candidate.type === "stairs"));
    const canBuildStairs = vertical;
    const researchId = vertical ? nextDepthResearchId(state) : nextWidthResearchId(state);
    const researchLocked = vertical ? isNewFloorBlocked(state, ui.focusY) : isFloorWidthBlocked(state, ui.focusY);
    const stairsLocked = vertical && !isCellTypeUnlocked(state, "stairs");
    const emptyCellWidth = (canBuildStairs ? CELL_DEFINITIONS.stairs.width : 1) * CONFIG.baseCellWidth;
    const buildAction = stairsLocked
      ? `<button class="build-cell-button tier-research-button" disabled>Еще не открыто</button>`
      : researchLocked
      ? `<button class="build-cell-button tier-research-button" ${isFeatureUnlocked(state, "research-screen") && researchId ? `data-action="show-tier-research" data-research-id="${researchId}" aria-disabled="true"` : "disabled"}>требуется<br>апгрейд</button>`
      : canBuildStairs
      ? `<button class="build-cell-button stair-build-button" data-action="build-stairs" ${state.money < CONFIG.buildCost || !isCellTypeUnlocked(state, "stairs") ? "disabled" : ""}>Построить лестницу <span>${colorDot("money")}${CONFIG.buildCost}</span></button>`
      : `<button class="build-cell-button" data-action="open-build">Построить</button>`;
    return `<div class="focus-hud empty-focus"><div class="focus-cell-frame" style="--empty-cell-width:${emptyCellWidth}px"><b>Пусто</b></div>${arrows}${buildAction}<button class="square-close focus-close" data-action="close-focus" aria-label="Закрыть">${uiIcon("close")}</button></div>`;
  }
  const title = cell.type === "entrance" ? "Вход" : cell.type === "stairs" ? "Лестница" : CELL_DEFINITIONS[cell.type].name;
  const levelled = cell.type !== "entrance" && cell.type !== "stairs";
  const progress = tierProgressPercent(cell.level);
  const issue = equipmentIssue(state, cell);
  const upgradeCost = upgradeCostForLevel(cell.level + 1);
  const tierResearchId = requiredTierResearchId(cell.type as BuildableCellType, cell.level + 1);
  const researchLocked = tierResearchId !== null && !isCellUpgradeTierUnlocked(state, cell.type as BuildableCellType, cell.level + 1);
  const researchNavigation = researchLocked && isFeatureUnlocked(state, "research-screen");
  const upgradeAttention = attentionOnBuiltCell(state, cell.type) ? attentionIndicator() : "";
  const upgradeButton = researchLocked
    ? `<button class="entity-upgrade tier-research-button" ${researchNavigation ? `data-action="show-tier-research" data-research-id="${tierResearchId}" aria-disabled="true"` : "disabled"}>требуется<br>апгрейд${upgradeAttention}</button>`
    : `<button class="entity-upgrade" data-action="upgrade" data-id="${cell.id}" ${cell.level >= CONFIG.maxCellLevel || state.money < upgradeCost ? "disabled" : ""}>Улучшить<span>${colorDot("money")}${upgradeCost}</span>${upgradeAttention}</button>`;
  return `<div class="focus-hud built-focus">
    <div class="focus-cell-frame"></div>${arrows}
    ${levelled ? `<section class="cell-card" data-scroll-key="cell-${cell.id}">${issue ? `<div class="cell-issue">${issue}</div>` : ""}<h2>${title}</h2><button class="square-close cell-close" data-action="close-focus" aria-label="Закрыть">${uiIcon("close")}</button><div class="cell-badges">${focusBadges(cell)}</div><div class="level-layout"><b>Ур. ${cell.level}</b><span class="level-progress"><i style="width:${progress}%"></i></span><div class="level-effects">${levelEffects(cell)}</div>${upgradeButton}</div><div class="cell-actions"><button data-action="open-remove-confirm" data-id="${cell.id}">Убрать</button><button data-action="open-move-preview" data-id="${cell.id}">Передвинуть</button><button data-action="open-decor" data-id="${cell.id}" ${!isDecorCellType(cell.type) || state.decor[cell.type].unlockedIds.length <= 1 ? "disabled" : ""}>Декор${isDecorCellType(cell.type) && state.decor[cell.type].buttonUnseen ? attentionIndicator() : ""}</button></div></section>` : `<h2 class="static-cell-title">${entityIcon("cells", cell.type)}${title}</h2>`}
    ${!levelled ? `<button class="square-close focus-close" data-action="close-focus" aria-label="Закрыть">${uiIcon("close")}</button>` : ""}
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
