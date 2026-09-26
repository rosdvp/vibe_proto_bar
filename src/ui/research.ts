import { RESEARCH_CATEGORIES, RESEARCHES, researchCost, researchDuration, researchStatus, visibleResearches } from "../game/research";
import type { ResearchDefinition } from "../game/research";
import type { GameState } from "../types";
import { lockIcon } from "./icons";
import type { UiState } from "./types";

function formatRemaining(seconds: number): string {
  const whole = Math.ceil(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function renderResearchCard(state: GameState, research: ResearchDefinition): string {
  const status = researchStatus(state, research);
  const locked = status === "locked";
  const active = status === "running" || status === "ready";
  const prerequisite = RESEARCHES.find((item) => item.id === research.prerequisiteId);
  const lockNote = prerequisite ? `Необходимо «${prerequisite.name}»` : "Откроется позже";
  const seconds = researchDuration(research);
  const cost = researchCost(research);
  const duration = `${Math.floor(seconds / 60)} мин ${seconds % 60 ? `${seconds % 60} сек` : ""}`;
  const progress = active ? Math.max(0, Math.min(100, (1 - state.research.active!.remaining / seconds) * 100)) : 0;
  return `<article class="research-card ${locked ? "locked" : ""} ${active ? "active" : ""}" data-research-id="${research.id}">
    <div class="research-picture">${locked ? lockIcon() : ""}</div>
    <div class="research-heading"><strong>${research.name}</strong>${locked ? "" : `<b>${duration}</b>`}</div>
    ${locked ? `<p class="research-lock-note">${lockNote}</p>` : `<div class="research-effects"><span>Дает:</span>${(research.unlocks ?? []).map((feature) => `<div class="research-effect"><i class="color-dot cell" aria-hidden="true"></i>${feature.name}</div>`).join("")}</div>`}
    ${status === "available" ? `<button class="research-action start" data-action="start-research" data-id="${research.id}" ${state.research.active || state.money < cost ? "disabled" : ""}>${state.research.active ? "Исследуется другое" : `<i class="color-dot money" aria-hidden="true"></i>${cost}`}</button>` : ""}
    ${status === "running" ? `<div class="research-progress" role="progressbar" aria-label="${research.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress}%"></i><strong>${formatRemaining(state.research.active!.remaining)}</strong></div>` : ""}
    ${status === "ready" ? `<button class="research-action ready" data-action="claim-research" data-id="${research.id}">Готово</button>` : ""}
  </article>`;
}

export function renderResearch(state: GameState, ui: UiState): string {
  const active = RESEARCHES.find((research) => research.id === state.research.active?.id);
  return `<section class="panel split-panel research-panel">
    <div class="panel-title"><h2>Исследования</h2></div>
    <div class="category-tabs research-tabs" aria-label="Категории исследований">
      ${RESEARCH_CATEGORIES.map((category) => `<button data-action="research-category" data-category="${category.id}" class="${ui.researchCategory === category.id ? "active" : ""}" aria-label="${category.name}"><i class="research-category-dot ${category.id}" aria-hidden="true"></i></button>`).join("")}
    </div>
    <div class="panel-content research-content" data-scroll-key="research-items">
      ${active ? `<section class="research-group"><h3>Текущие</h3>${renderResearchCard(state, active)}</section>` : ""}
      ${RESEARCH_CATEGORIES.map((category) => {
        const items = visibleResearches(state).filter((research) => research.category === category.id && research.id !== active?.id && researchStatus(state, research) !== "completed");
        return `<section class="research-group" data-research-section="${category.id}"><h3>${category.name}</h3>${items.length ? items.map((research) => renderResearchCard(state, research)).join("") : `<p class="research-empty">Исследования завершены</p>`}</section>`;
      }).join("")}
    </div>
  </section>`;
}
