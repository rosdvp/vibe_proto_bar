import { RESEARCHES, researchCost, researchDuration, researchStatus, visibleResearches } from "../game/research";
import type { ResearchDefinition } from "../game/research";
import type { GameState } from "../types";
import { attentionIndicator } from "./attention";
import { adIcon, lockIcon, researchIcon, resourceIcon, uiIcon } from "./icons";

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
  const duration = `${Math.ceil(seconds / 60)} мин`;
  const progress = active ? Math.max(0, Math.min(100, (1 - state.research.active!.remaining / seconds) * 100)) : 0;
  return `<article class="research-card ${status}" data-research-id="${research.id}">
    <div class="research-picture">${locked ? lockIcon() : researchIcon(research.id)}</div>
    <div class="research-heading"><strong>${research.name}</strong>${locked || active ? "" : `<b>${uiIcon("hourglass")}${duration}</b>`}</div>
    <div class="research-description">${locked ? lockNote : (research.unlocks ?? []).map((feature) => feature.name).join(", ") || "Улучшение бара"}</div>
    ${status === "available" ? `<button class="research-action start" data-action="start-research" data-id="${research.id}" ${state.research.active || state.money < cost ? "disabled" : ""}>${state.research.active ? "Занято" : `Начать <span>${resourceIcon("money")}${cost}</span>`}</button>` : ""}
    ${status === "running" ? `<div class="research-timer"><div class="research-progress" role="progressbar" aria-label="${research.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress}%"></i></div><strong>${formatRemaining(state.research.active!.remaining)}</strong></div>` : ""}
    ${status === "running" ? `<button class="research-action skip" data-action="skip-research-ad" data-id="${research.id}" aria-label="Пропустить ожидание апгрейда за рекламу">${adIcon()}Пропуск</button>` : ""}
    ${status === "ready" ? `<button class="research-action ready" data-action="claim-research" data-id="${research.id}">Готово!${attentionIndicator()}</button>` : ""}
  </article>`;
}

export function renderResearch(state: GameState): string {
  const active = RESEARCHES.find((research) => research.id === state.research.active?.id);
  const items = visibleResearches(state).filter((research) => research.id !== active?.id && researchStatus(state, research) !== "completed");
  return `<section class="panel research-panel">
    <div class="panel-title"><h2>Апгрейды</h2></div>
    <div class="panel-content research-content" data-scroll-key="research-items">
      ${active ? renderResearchCard(state, active) : ""}
      ${items.map((research) => renderResearchCard(state, research)).join("")}
    </div>
  </section>`;
}
