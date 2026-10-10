import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { Window } from "happy-dom";
import { createServer, type ViteDevServer } from "vite";
import { selectDecor, unlockRandomDecor } from "../src/game/decor";
import { fixedRandom } from "./support";
import { createGame } from "../src/game/state";
import { createUiState } from "../src/ui/types";
import { CONFIG, CUSTOMER_TYPES, DRINKS, DECOR_CELL_TYPES, DECOR_STYLES } from "../src/config";
import { patchHtml, setStyle } from "../src/ui/dom";
import type { Customer } from "../src/types";

const domWindow = new Window({ url: "http://localhost/" });
Object.assign(globalThis, {
  window: domWindow, document: domWindow.document,
  Element: domWindow.Element, HTMLElement: domWindow.HTMLElement, SVGElement: domWindow.SVGElement,
});
let server: ViteDevServer;
let fixtures: typeof import("../src/ui/map-fixtures");
let decorUi: typeof import("../src/ui/decor");
let app: typeof import("../src/ui/app");
let map: typeof import("../src/ui/map");
let animation: typeof import("../src/ui/animation");

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  fixtures = await server.ssrLoadModule("/src/ui/map-fixtures.ts") as typeof fixtures;
  decorUi = await server.ssrLoadModule("/src/ui/decor.ts") as typeof decorUi;
  app = await server.ssrLoadModule("/src/ui/app.ts") as typeof app;
  map = await server.ssrLoadModule("/src/ui/map.ts") as typeof map;
  animation = await server.ssrLoadModule("/src/ui/animation.ts") as typeof animation;
});
after(async () => {
  await server?.close();
  await domWindow.happyDOM.close();
});

function root(): HTMLElement {
  return document.createElement("div");
}

test("DOM patch preserves keyed nodes across insertions, removal and reordering", () => {
  const element = root();
  patchHtml(element, '<div data-person-id="a"><img src="a.svg"></div><div data-person-id="b"><img src="b.svg"></div>');
  const a = element.firstChild;
  const b = element.lastChild;
  const image = element.querySelector('img[src="b.svg"]');
  patchHtml(element, '<div data-person-id="b"><img src="b.svg"></div><div data-person-id="c">C</div><div data-person-id="a"><img src="a.svg"></div>');
  assert.equal(element.firstChild, b);
  assert.equal(element.lastChild, a);
  assert.equal(element.querySelector('img[src="b.svg"]'), image);
  patchHtml(element, '<div data-person-id="b"><img src="b.svg"></div>');
  assert.equal(element.children.length, 1);
  assert.equal(element.firstChild, b);
});

test("DOM patch retains frame-managed styles while updating other properties", () => {
  const element = root();
  patchHtml(element, '<span style="--person-x:1px;color:red">A</span>');
  const span = element.firstElementChild as HTMLElement;
  setStyle(span, "--person-x", "2px");
  patchHtml(element, '<span style="--person-x:1px;color:blue">B</span>');
  assert.equal(span.style.getPropertyValue("--person-x"), "2px");
  assert.equal(span.style.color, "blue");
  assert.equal(span.textContent, "B");
  patchHtml(element, '<span style="--person-x:3px">B</span>');
  assert.equal(span.style.getPropertyValue("--person-x"), "3px");
  assert.equal(span.style.color, "");
});

test("resource updates retain the scene and furniture images", () => {
  const element = root();
  const state = createGame();
  const ui = createUiState();
  app.renderApp(element, state, ui);
  const scene = element.querySelector(".map-scene");
  const images = Array.from(element.querySelectorAll(".map-scene img"));
  state.money += 123;
  app.renderApp(element, state, ui);
  assert.equal(element.querySelector(".map-scene"), scene);
  assert.deepEqual(Array.from(element.querySelectorAll(".map-scene img")), images);
  assert.equal(element.querySelector(".resource.money strong")?.textContent, String(Math.floor(state.money)));
});

test("camera input preserves scene children", () => {
  const element = root();
  const state = createGame();
  const ui = createUiState();
  app.renderApp(element, state, ui);
  const scene = element.querySelector(".map-scene")!;
  const children = Array.from(scene.childNodes);
  ui.mapZoom = CONFIG.distantMapMinZoom;
  ui.panX += 20;
  map.updateMapCamera(element, state, ui);
  assert.equal(element.querySelector(".map-scene"), scene);
  assert.deepEqual(Array.from(scene.childNodes), children);
});

function measuredCamera() {
  const element = root();
  const state = createGame();
  const ui = createUiState();
  element.innerHTML = map.renderMap(state, ui);
  const viewport = element.querySelector<HTMLElement>("[data-map]")!;
  const scene = element.querySelector<HTMLElement>(".map-scene")!;
  let reads = 0;
  Object.defineProperties(viewport, {
    clientWidth: { get() { reads++; return 200; } },
    clientHeight: { get() { reads++; return 400; } },
  });
  Object.defineProperty(scene, "offsetTop", { get() { reads++; return 70; } });
  map.updateMapCamera(element, state, ui);
  return { element, state, ui, scene, reads: () => reads };
}

test("pan inputs defer DOM writes until the frame update and reuse measured geometry", () => {
  const camera = measuredCamera();
  const before = camera.scene.style.getPropertyValue("--scene-shift-x");
  const measured = camera.reads();
  map.panMapCamera(camera.element, camera.state, camera.ui, 10, 0);
  map.panMapCamera(camera.element, camera.state, camera.ui, 10, 0);
  assert.equal(camera.scene.style.getPropertyValue("--scene-shift-x"), before);
  map.updateMapCamera(camera.element, camera.state, camera.ui);
  assert.notEqual(camera.scene.style.getPropertyValue("--scene-shift-x"), before);
  assert.equal(camera.reads(), measured);
  camera.ui.mapZoom = CONFIG.distantMapMinZoom;
  map.updateMapCamera(camera.element, camera.state, camera.ui);
  assert.equal(camera.reads(), measured);
});

test("camera reverses from its boundary even when both inputs arrive before a frame", () => {
  const camera = measuredCamera();
  map.panMapCamera(camera.element, camera.state, camera.ui, 1e6, 0);
  const edge = camera.ui.panX;
  map.panMapCamera(camera.element, camera.state, camera.ui, 1e6, 0);
  assert.equal(camera.ui.panX, edge);
  map.panMapCamera(camera.element, camera.state, camera.ui, -10, 0);
  assert.ok(camera.ui.panX < edge);
  const reversed = camera.ui.panX;
  map.updateMapCamera(camera.element, camera.state, camera.ui);
  assert.ok(Math.abs(camera.ui.panX - reversed) < 1e-6);
});

test("camera refreshes measured geometry after window resizing", () => {
  const camera = measuredCamera();
  const measured = camera.reads();
  const width = domWindow.innerWidth;
  try {
    domWindow.innerWidth = width + 20;
    map.updateMapCamera(camera.element, camera.state, camera.ui);
    assert.ok(camera.reads() > measured);
  } finally {
    domWindow.innerWidth = width;
  }
});

test("payments appear and expire without app rendering or replacement of other popups", () => {
  const element = root();
  const state = createGame();
  const ui = createUiState();
  app.renderApp(element, state, ui);
  const scene = element.querySelector(".map-scene");
  ui.paymentPopups.push({ amount: 5, x: 0, y: 0, localX: .5, elapsed: 0 });
  map.updatePaymentPopups(element, state, ui);
  const first = element.querySelector(".payment-popup");
  assert.ok(first);
  ui.paymentPopups.push({ amount: 7, x: 0, y: 0, localX: .5, elapsed: 0 });
  map.updatePaymentPopups(element, state, ui);
  const second = element.querySelectorAll(".payment-popup")[1];
  assert.equal(element.querySelector(".payment-popup"), first);
  ui.paymentPopups.shift();
  map.updatePaymentPopups(element, state, ui);
  assert.equal(element.querySelector(".payment-popup"), second);
  ui.paymentPopups.length = 0;
  map.updatePaymentPopups(element, state, ui);
  assert.equal(element.querySelector(".payment-popup"), null);
  assert.equal(element.querySelector(".map-scene"), scene);
});

test("opening and updating a panel preserves the map and panel scroll position", () => {
  const element = root();
  const state = createGame();
  const ui = createUiState();
  app.renderApp(element, state, ui);
  const scene = element.querySelector(".map-scene");
  ui.panel = "menu";
  app.renderApp(element, state, ui);
  const list = element.querySelector<HTMLElement>("[data-scroll-key]")!;
  list.scrollTop = 75;
  state.money += 123;
  app.renderApp(element, state, ui);
  assert.equal(element.querySelector("[data-scroll-key]"), list);
  assert.equal(list.scrollTop, 75);
  assert.equal(element.querySelector(".map-scene"), scene);
  ui.panel = null;
  app.renderApp(element, state, ui);
  assert.equal(element.querySelector(".modal-shade"), null);
  assert.equal(element.querySelector(".map-scene"), scene);
});

function customer(): Customer {
  return {
    id: "test-person", typeId: CUSTOMER_TYPES[0]!.id, orderId: DRINKS[0]!.id,
    phase: "moving-counter", x: 0, y: 0, localX: .25,
    phaseRemaining: 1, moveDuration: 1, moveFromX: 0, moveFromY: 0,
    moveTargetX: 0, moveTargetY: 0, moveFromLocalX: .25, moveTargetLocalX: .75,
    targetCellId: "test-counter", slotIndex: 0, isPrize: false,
    movePath: [], activity: null, bartenderId: null, waiterId: null, waitingElapsed: 0, waitingDirection: 1,
  };
}

for (const type of ["toilet-stall", "sink", "hand-dryer", "darts", "billiards"] as const) {
  test(`${type}: индикатор клиента обновляется во время использования и скрыт при ожидании и движении`, () => {
    const element = root();
    const state = createGame();
    state.cells.push({ id: "extra", type, x: 1, y: 0, level: 1 });
    const person = customer();
    Object.assign(person, { targetCellId: "extra", phase: "using-extra", phaseRemaining: CONFIG.extraUseSeconds[type], x: 1 });
    state.customers.push(person);
    element.innerHTML = map.renderMap(state, createUiState());
    map.updateCharacterPositions(element, state);
    const progress = () => element.querySelector<HTMLElement>('[data-person-id="test-person"] .action-progress');
    assert.ok(progress());
    person.phaseRemaining /= 2;
    map.updateCharacterPositions(element, state);
    assert.equal(progress()?.style.getPropertyValue("--action-progress"), "180deg");
    for (const phase of ["moving-extra", "waiting-extra", "exiting"] as const) {
      person.phase = phase;
      map.updateCharacterPositions(element, state);
      assert.equal(progress(), null);
    }
  });
}

test("movement and phase changes update between app renders without replacing character images", () => {
  const element = root();
  const state = createGame();
  const ui = createUiState();
  state.cells.push({ id: "test-counter", type: "counter", x: 1, y: 0, level: 1 });
  const person = customer();
  state.customers.push(person);
  app.renderApp(element, state, ui);
  const node = element.querySelector<HTMLElement>('[data-person-id="test-person"]')!;
  const images = Array.from(node.querySelectorAll("img"));
  map.updateCharacterPositions(element, state);
  const initial = node.style.transform;
  person.phaseRemaining -= 1 / 60;
  map.updateCharacterPositions(element, state);
  assert.notEqual(node.style.transform, initial);
  assert.equal(node.style.left, "");
  assert.deepEqual(Array.from(node.querySelectorAll("img")), images);
  person.phase = "waiting-counter";
  map.updateCharacterPositions(element, state);
  assert.ok(node.classList.contains("waiting-customer"));
  assert.deepEqual(Array.from(node.querySelectorAll(".character-art img")), images);
});

test("idle characters do not receive repeated DOM mutations", async () => {
  const element = root();
  const state = createGame();
  const person = customer();
  person.phase = "waiting-counter";
  state.customers.push(person);
  app.renderApp(element, state, createUiState());
  map.updateCharacterPositions(element, state);
  let mutations = 0;
  const observer = new domWindow.MutationObserver((records) => { mutations += records.length; });
  observer.observe(element as unknown as import("happy-dom").Node, { subtree: true, attributes: true, childList: true });
  map.updateCharacterPositions(element, state);
  await new Promise((resolve) => setTimeout(resolve, 0));
  observer.disconnect();
  assert.equal(mutations, 0);
});

test("offer reels move between app renders and finish without replacing the dialog", () => {
  const element = root();
  const state = createGame();
  const ui = createUiState();
  ui.offerOpen = true;
  ui.offerElapsed = 0;
  state.offers.pending = { slots: CONFIG.offerSlotDurations.map(() => ({ color: "money", count: 1 })), reward: { kind: "money", multiplier: 1, amount: 5 } };
  app.renderApp(element, state, ui);
  const dialog = element.querySelector(".offer-panel");
  animation.updateUiAnimations(element, state, ui);
  const reel = element.querySelector<HTMLElement>(".offer-reel")!;
  const initial = reel.style.transform;
  ui.offerElapsed = 1 / 60;
  animation.updateUiAnimations(element, state, ui);
  assert.equal(element.querySelector(".offer-reel"), reel);
  assert.notEqual(reel.style.transform, initial);
  ui.offerElapsed = Math.max(...CONFIG.offerSlotDurations) + CONFIG.offerRevealDuration;
  animation.updateUiAnimations(element, state, ui);
  assert.equal(element.querySelector(".offer-panel"), dialog);
  assert.equal(element.querySelector(".offer-reel"), null);
  assert.equal(element.querySelector<HTMLButtonElement>('[data-action="claim-offer"]')?.disabled, false);
});


for (const unlockedIds of [[], ["japan"], ["cabaret"], ["japan", "cabaret"],
  DECOR_STYLES.filter((style) => style.id !== "classic").map((style) => style.id).reverse()]) {
  test(`панель декора сортирует открытые стили и показывает оставшиеся пороги: ${unlockedIds.join(",") || "только классика"}`, () => {
    const state = createGame();
    state.cells.push({ id: "decor-cell", x: 1, y: 0, type: "counter", level: 1, decorId: "classic" });
    for (const id of unlockedIds) {
      const locked = DECOR_STYLES.filter((style) => !state.decor.counter.unlockedIds.includes(style.id));
      const index = locked.findIndex((style) => style.id === id);
      assert.equal(unlockRandomDecor(state, "counter", fixedRandom((index + .5) / locked.length))?.id, id);
    }
    const ui = createUiState();
    ui.decorCellId = "decor-cell";
    const element = root();
    patchHtml(element, decorUi.renderDecorPanel(state, ui));
    const opened = DECOR_STYLES.filter((style) => state.decor.counter.unlockedIds.includes(style.id));
    const locked = DECOR_STYLES.filter((style) => !state.decor.counter.unlockedIds.includes(style.id));
    const rows = [...element.querySelectorAll<HTMLButtonElement>(".decor-option")];
    assert.deepEqual(rows.map((row) => row.dataset.decorId), [...opened, ...locked].map((style) => style.id));
    assert.deepEqual(rows.filter((row) => !row.disabled).map((row) => row.querySelector("strong")?.textContent), opened.map((style) => style.name));
    assert.deepEqual(rows.filter((row) => row.disabled).map((row) => row.querySelector("strong")?.textContent),
      CONFIG.decorUnlockLevels.slice(opened.length - 1).map((level) => `Откроется на ур. ${level}`));
  });
}

test("панель декора заменяет карточку и возвращается к ней с выбранной мебелью", () => {
  const element = root();
  const state = createGame();
  state.cells.push({ id: "decor-cell", x: 1, y: 0, type: "counter", level: 1, decorId: "classic" });
  const ui = createUiState();
  ui.focusX = 1; ui.focusY = 0;
  app.renderApp(element, state, ui);
  assert.equal(element.querySelector<HTMLButtonElement>('[data-action="open-decor"]')?.disabled, true);
  assert.equal(decorUi.openDecorPanel(state, ui, "decor-cell"), false);
  const unlock = unlockRandomDecor(state, "counter", fixedRandom())!;
  app.renderApp(element, state, ui);
  assert.ok(element.querySelector('[data-action="open-decor"] .attention-indicator'));
  assert.equal(decorUi.openDecorPanel(state, ui, "decor-cell"), true);
  app.renderApp(element, state, ui);
  assert.equal(element.querySelector(".cell-card"), null);
  assert.equal(element.querySelector(".focus-arrow"), null);
  assert.ok(element.querySelector(".decor-panel"));
  assert.ok(element.querySelector(`[data-decor-id="${unlock.id}"] .attention-indicator`));
  assert.ok(element.querySelector<HTMLButtonElement>('[data-decor-id="japan"]')?.disabled);
  assert.equal(ui.decorScrollTarget, null);
  const list = element.querySelector<HTMLElement>(".decor-list")!;
  list.scrollTop = 37;
  const oldImage = element.querySelector<HTMLImageElement>(".counter-middle")!.src;
  selectDecor(state, "decor-cell", unlock.id);
  app.renderApp(element, state, ui);
  assert.equal(element.querySelector<HTMLElement>(".decor-list")!.scrollTop, 37);
  assert.equal(element.querySelector(".decor-list"), list);
  assert.notEqual(element.querySelector<HTMLImageElement>(".counter-middle")!.src, oldImage);
  assert.equal(element.querySelector(".decor-current")?.getAttribute("data-decor-id"), unlock.id);
  assert.ok(element.querySelector(`[data-decor-id="${unlock.id}"] .attention-indicator`));
  decorUi.closeDecorPanel(state, ui);
  app.renderApp(element, state, ui);
  assert.ok(element.querySelector(".cell-card"));
  assert.equal(element.querySelector(".decor-panel"), null);
  assert.equal(state.cells[1]!.decorId, unlock.id);
  assert.equal(element.querySelector('[data-action="open-decor"] .attention-indicator'), null);
  assert.deepEqual(state.decor.counter.unseenIds, []);
  assert.equal(ui.focusX, 1);
});


test("все стили ячеек рендерят существующие SVG мебели и украшений", () => {
  const element = root();
  const state = createGame();
  for (const type of DECOR_CELL_TYPES) {
    for (const style of DECOR_STYLES) {
      const cell = { id: "art-cell", x: 1, y: 0, type, level: 1, decorId: style.id };
      state.cells = [cell];
      element.innerHTML = fixtures.renderFixture(state, cell);
      const images = element.querySelectorAll<HTMLImageElement>("img");
      assert.ok(images.length > 0, `${type}/${style.id}`);
      for (const image of images) {
        const path = decodeURIComponent(new URL(image.src).pathname);
        assert.ok(existsSync(resolve("public", path.slice(1))), path);
      }
      if (type !== "counter") assert.equal(element.querySelector(".decor-accent") !== null, style.id !== "classic");
      // Both free ends and continuing counter joints use the live asset catalog.
      if (type === "counter" || type === "taps" || type === "waiter-station") {
        state.cells.push({ ...cell, id: "neighbor", x: 2 });
        element.innerHTML = fixtures.renderFixture(state, cell);
        const edge = element.querySelector<HTMLImageElement>(".counter-right.counter-continuation");
        assert.ok(edge);
        assert.ok(existsSync(resolve("public", new URL(edge.src).pathname.slice(1))));
      }
    }
  }
});
