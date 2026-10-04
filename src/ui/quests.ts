import { QUESTS } from "../config";
import { currentQuestProgress } from "../game";
import type { GameState } from "../types";
import { uiIcon } from "./icons";

interface VisiblePoint {
  index: number;
  kind: "quest" | "past-stack" | "future-stack";
}

function visiblePoints(currentIndex: number): VisiblePoint[] {
  if (QUESTS.length <= 8) return QUESTS.map((_quest, index) => ({ index, kind: "quest" }));
  const activeIndex = Math.min(currentIndex, QUESTS.length - 1);
  const start = Math.min(Math.max(activeIndex - 2, 0), QUESTS.length - 6);
  const end = start + 6;
  const points: VisiblePoint[] = [];
  if (start > 0) points.push({ index: start - 1, kind: "past-stack" });
  for (let index = start; index < end; index += 1) points.push({ index, kind: "quest" });
  if (end < QUESTS.length) points.push({ index: end, kind: "future-stack" });
  return points;
}

export function renderQuestChain(state: GameState): string {
  const progress = currentQuestProgress(state);
  const finished = state.quests.currentIndex >= QUESTS.length;
  const points = visiblePoints(state.quests.currentIndex);
  const pointMarkup = points.map((point, position) => {
    let className = point.kind;
    if (point.kind === "past-stack") className += ` claimed stack-${Math.min(3, point.index + 1)}`;
    if (point.kind === "future-stack") className += ` future stack-${Math.min(3, QUESTS.length - point.index)}`;
    if (point.kind === "quest") {
      if (point.index < state.quests.currentIndex || finished) className += " claimed";
      else if (point.index === state.quests.currentIndex) className += progress?.complete ? " current complete" : " current";
      else className += " future";
    }
    const next = points[position + 1];
    const segmentComplete = next && (next.kind === "past-stack" || next.index < state.quests.currentIndex || (next.index === state.quests.currentIndex && progress?.complete));
    return `<span class="quest-point ${className}" aria-hidden="true"></span>${next ? `<i class="quest-segment ${segmentComplete ? "complete" : ""}" aria-hidden="true"></i>` : ""}`;
  }).join("");

  if (finished) {
    return `<section class="quest-chain completed-chain" aria-label="Все задания выполнены"><div class="quest-track">${pointMarkup}</div></section>`;
  }
  if (!progress) return "";
  const current = Math.min(progress.quest.target, progress.current);
  const percent = progress.quest.target > 0 ? current / progress.quest.target * 100 : 100;
  const currentLabel = Number.isInteger(current) ? String(current) : current.toFixed(1);
  const card = progress.complete
    ? `<button class="quest-claim" data-action="claim-quest" aria-label="Собрать награду ${progress.quest.reward}"><span>+</span><i>${uiIcon("money")}</i><strong>${progress.quest.reward}</strong></button>`
    : `<div class="quest-card"><strong>${progress.quest.title}</strong><div class="quest-progress" style="--quest-progress:${percent}%" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.quest.target}" aria-valuenow="${current}"><span>${currentLabel} / ${progress.quest.target}</span></div></div>`;
  return `<section class="quest-chain"><div class="quest-track">${pointMarkup}</div>${card}</section>`;
}
