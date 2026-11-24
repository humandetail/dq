import "./style.css";
import { containmentPoints, enqueue, enterEndless, newMatch, running, type Hit } from "./game/battle.ts";
import { creditTime, drainFrames, newClock } from "./game/clock.ts";
import { contentVersion, economy, frameMs, items, mainline, map, overcharge, recipes, shop, towers, type SiteId } from "./game/content.ts";
import { createSaveStore } from "./game/save.ts";
import { saveFormatVersion, type PlayerAction, type SaveSnapshot } from "./game/state.ts";
import { createScene, type Pick } from "./scene.ts";

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => element<HTMLButtonElement>(id);
const status = element("app-status");
const feedback = element("feedback");
const labels: Record<SiteId, string> = { west: "西侧", east: "东侧", north: "北侧", south: "南侧" };
const rejections = {
  gold: "金币不足", missing: "对象已失效或不可用", occupied: "阵位已占用", phase: "当前阶段无法执行",
  capacity: "没有空余位置", stock: "商品售罄", materials: "合成材料不匹配", "max-level": "已达最高等级",
  range: "目标超出射程", cooldown: "冷却中",
} as const;
const actionNames: Record<PlayerAction["type"], string> = {
  build: "建造", upgrade: "升级", draw: "抽卡", buy: "购买", craft: "合成", equip: "装备",
  attack: "指定攻击", overcharge: overcharge.name, "enter-endless": "进入无尽", restart: "重开",
};

const store = createSaveStore();
let snapshot: SaveSnapshot;
let lastTime = 0;
let lastSave = 0;
let lastDraw = 0;
let site: SiteId = "west";
let panelKey = "";
let saveNeeded = false;
let needsSceneSync = false;
const sentActions = new Map<string, PlayerAction["type"]>();

function makeSnapshot(): SaveSnapshot {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  return {
    formatVersion: saveFormatVersion, contentVersion, revision: 0,
    state: newMatch(crypto.randomUUID(), seed), clock: newClock(),
  };
}

let scene: Awaited<ReturnType<typeof createScene>> | undefined;
function select(pick: Pick) {
  if ("site" in pick) {
    site = pick.site;
    render(true);
    return;
  }
  const tower = snapshot.state.towers.find(entry => entry.site === site);
  if (tower) send({ type: "attack", towerId: tower.id, targetId: pick.enemyId });
  else feedback.textContent = "先选择一座塔，再指定攻击目标。";
}

function save(now: number) {
  saveNeeded = false;
  lastSave = now;
  const revision = ++snapshot.revision;
  const matchId = snapshot.state.matchId;
  status.textContent = "正在保存…";
  void store.save(snapshot).then(result => {
    if (result === "saved" && snapshot.state.matchId === matchId && snapshot.revision === revision) {
      status.textContent = "已保存到此浏览器";
    }
  }).catch(() => {
    if (snapshot.state.matchId === matchId && snapshot.revision === revision) {
      status.textContent = "保存失败，下次自动重试";
      if (!running(snapshot.state)) status.textContent = "保存失败，点击此处重试";
      status.onclick = () => save(performance.now());
    }
  });
}

function account(now: number) {
  creditTime(snapshot, now - lastTime);
  lastTime = now;
}

function send(action: PlayerAction) {
  const now = performance.now();
  account(now);
  const id = crypto.randomUUID();
  const command = enqueue(snapshot.state, { id, matchId: snapshot.state.matchId, action }, snapshot.clock.pendingFrames);
  if (command.status === "queued") {
    sentActions.set(id, action.type);
    feedback.textContent = `已接收：${actionNames[action.type]}`;
    saveNeeded = true;
  }
}

function makeAction(label: string, enabled: boolean, action: () => void) {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = label;
  control.disabled = !enabled;
  control.onclick = action;
  return control;
}

function render(syncScene = false) {
  const { state, clock } = snapshot;
  const active = running(state);
  element("phase").textContent = state.mode === "mainline" ? "标准难度 · 主线" : "标准难度 · 无尽";
  element("wave").textContent = `${state.currentWave} / ${state.mode === "mainline" ? mainline.waves.length : "∞"}`;
  element("containment").textContent = `${containmentPoints(state)} / ${map.containment.limit}`;
  element("gold").textContent = String(state.gold);
  const seconds = Math.floor(state.frame * frameMs / 1000);
  element("time").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const next = state.events.find(event => event.type === "spawn" && event.batchIndex === 0);
  element("next-wave").textContent = active && next?.type === "spawn"
    ? `第 ${next.wave} 波将在 ${Math.ceil((next.targetFrame - state.frame) * frameMs / 1000)} 秒后到达`
    : "";
  button("pause").disabled = !active;
  button("pause").textContent = clock.paused ? "继续" : "暂停";
  button("speed").disabled = !active;
  button("speed").textContent = `${clock.speed}×`;
  const settlement = element("settlement");
  settlement.hidden = active;
  if (!active) {
    const failed = state.phase === "failed";
    element("settlement-title").textContent = failed ? "防线失守" : "主线完成";
    element("settlement-detail").textContent = failed
      ? `第 ${state.currentWave} 波达到 ${state.containmentPoints} 容怪点，已完成第 ${state.lastCompletedWave} 波。`
      : `${mainline.waves.length} 波全部清场。进入无尽后继承当前阵容、装备和金币。`;
    button("endless").hidden = failed;
    button("restart").hidden = !failed;
  }
  if (syncScene) scene?.sync(state, site);

  const selectedTower = state.towers.find(entry => entry.site === site);
  const skill = button("overcharge");
  skill.hidden = !selectedTower;
  const skillRemaining = Math.ceil(Math.max(0, (selectedTower?.skillReadyFrames.overcharge ?? 0) - state.frame) * frameMs / 1000);
  skill.disabled = !active || skillRemaining > 0;
  skill.textContent = skillRemaining ? `${overcharge.name}（${skillRemaining} 秒）` : overcharge.name;

  const key = JSON.stringify([state.matchId, site, active, state.gold, state.cards,
    state.towers.map(tower => [tower.id, tower.level]), state.stock, state.items]);
  if (key === panelKey) return;
  panelKey = key;

  for (const control of element("sites").querySelectorAll("button")) {
    control.setAttribute("aria-pressed", String(control.dataset.site === site));
  }
  const tower = selectedTower;
  skill.onclick = tower ? () => send({ type: "overcharge", towerId: tower.id }) : null;
  const equipped = state.items.find(item => item.owner.type === "tower" && item.owner.id === tower?.id);
  element("selected-site").textContent = tower
    ? `${labels[site]} · ${towers[tower.type].name} Lv.${tower.level}${equipped ? ` · ${items[equipped.type].name}` : ""}`
    : `${labels[site]} · 空阵位`;
  element("build-options").replaceChildren(...(tower ? [] : state.cards.map(card => {
    const config = towers[card.tower];
    return makeAction(`建造 ${config.name} · ${config.buildGold} 金`, active && state.gold >= config.buildGold,
      () => send({ type: "build", site, cardId: card.id }));
  })));
  const upgrade = button("upgrade");
  const nextLevel = tower && towers[tower.type].levels[tower.level];
  upgrade.hidden = !tower;
  upgrade.disabled = !active || !nextLevel || !("upgradeGold" in nextLevel) || state.gold < nextLevel.upgradeGold;
  upgrade.textContent = nextLevel && "upgradeGold" in nextLevel ? `升级 · ${nextLevel.upgradeGold} 金` : "已满级";
  upgrade.onclick = tower ? () => send({ type: "upgrade", towerId: tower.id }) : null;
  button("draw").disabled = !active || state.gold < economy.drawGold || state.cards.length >= economy.cardCapacity;
  button("draw").textContent = `抽卡 · ${economy.drawGold} 金（${state.cards.length}/${economy.cardCapacity}）`;

  const backpack = state.items.filter(item => item.owner.type === "backpack");
  element("shop").replaceChildren(...(Object.keys(shop) as (keyof typeof shop)[]).map(item =>
    makeAction(`购买 ${items[item].name} · ${shop[item].gold} 金（剩 ${state.stock[item]}）`,
      active && state.stock[item] > 0 && state.gold >= shop[item].gold && backpack.length < economy.backpackCapacity,
      () => send({ type: "buy", item }))));
  element("backpack").textContent = backpack.length
    ? backpack.map(item => items[item.type].name).join("、")
    : "背包为空";
  const materials = recipes.amplifier.ingredients.map(type => backpack.find(item => item.type === type));
  const amplifier = backpack.find(item => item.type === "amplifier");
  element("crafting").replaceChildren(makeAction(
    `合成 聚光环 · ${recipes.amplifier.gold} 金`,
    active && materials.every(Boolean) && state.gold >= recipes.amplifier.gold,
    () => send({ type: "craft", recipe: "amplifier", materialIds: materials.map(item => item!.id) }),
  ));
  if (amplifier) element("crafting").append(makeAction(`装备 聚光环至${labels[site]}`,
    active && !!tower, () => send({ type: "equip", towerId: tower!.id, itemId: amplifier.id })));
}

function update(now: number, draw: boolean) {
  // A just-delivered input event can have a later timestamp than this RAF.
  now = Math.max(now, lastTime);
  account(now);
  const before = snapshot.state.frame;
  const beforeResults = snapshot.state.results.length;
  const hits = new Map<number, Hit>();
  const arrivals = new Set<number>();
  drainFrames(snapshot, 240, report => {
    saveNeeded ||= report.save;
    if (!draw) return;
    for (const hit of report.hits) hits.set(hit.towerId, hit);
    for (const id of report.arrivals) arrivals.add(id);
  });
  for (const result of snapshot.state.results.slice(beforeResults)) {
    const action = sentActions.get(result.id);
    if (!action) continue;
    feedback.textContent = result.ok ? `${actionNames[action]}成功` : `${actionNames[action]}失败：${rejections[result.reason]}`;
    sentActions.delete(result.id);
  }
  if (draw && (snapshot.state.frame !== before || needsSceneSync)) {
    render(true);
    needsSceneSync = false;
  } else if (!draw && snapshot.state.frame !== before) {
    needsSceneSync = true;
  }
  for (const hit of hits.values()) scene?.animate(hit, now);
  for (const id of arrivals) scene?.animateEnemy(id, now);
  if (draw && now - lastDraw >= 1000 / 30) {
    scene?.draw(now);
    lastDraw = now;
  }
  if (saveNeeded || (running(snapshot.state) && !snapshot.clock.paused && now - lastSave >= 5000)) save(now);
}

function tick(now: number) {
  if (!document.hidden) update(now, true);
  requestAnimationFrame(tick);
}

async function start() {
  const restored = await store.restore();
  snapshot = restored ?? makeSnapshot();
  const canvas = element<HTMLCanvasElement>("battlefield");
  try {
    scene = await createScene(canvas, select);
  } catch {
    const fallback = document.createElement("p");
    fallback.className = "no-scene";
    fallback.textContent = "三维战场无法加载。可以通过右侧阵位继续操作。";
    canvas.replaceWith(fallback);
  }

  for (const id of Object.keys(labels) as SiteId[]) {
    const control = makeAction(labels[id], true, () => select({ site: id }));
    control.dataset.site = id;
    element("sites").append(control);
  }
  button("draw").onclick = () => send({ type: "draw" });
  button("pause").onclick = () => {
    const now = performance.now();
    account(now);
    snapshot.clock.paused = !snapshot.clock.paused;
    render();
    save(now);
  };
  button("speed").onclick = () => {
    const now = performance.now();
    account(now);
    snapshot.clock.speed = snapshot.clock.speed === 1 ? 4 : 1;
    render();
    save(now);
  };
  button("endless").onclick = () => {
    if (!enterEndless(snapshot.state)) return;
    render(true);
    save(performance.now());
    lastTime = performance.now();
  };
  button("restart").onclick = () => {
    if (snapshot.state.phase !== "failed") return;
    snapshot = makeSnapshot();
    sentActions.clear();
    feedback.textContent = "";
    site = "west";
    render(true);
    save(performance.now());
    lastTime = performance.now();
  };

  const onLeave = (event: BeforeUnloadEvent) => {
    if (!running(snapshot.state)) return;
    event.preventDefault();
    event.returnValue = true;
  };
  window.addEventListener("beforeunload", onLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    const now = performance.now();
    update(now, false);
    if (now !== lastSave) save(now);
  });

  // A hidden page may still run timers while Chrome suspends animation frames.
  window.setInterval(() => {
    if (!document.hidden || !running(snapshot.state)) return;
    if (snapshot.clock.paused && snapshot.clock.pendingFrames === 0) return;
    const now = performance.now();
    update(now, false);
  }, 1000);

  document.querySelector(".layout")?.removeAttribute("inert");
  status.textContent = restored ? "已恢复上次存档" : "应用已启动";
  render(true);
  lastTime = lastSave = performance.now();
  if (!restored) save(lastTime);
  requestAnimationFrame(tick);
}

void start().catch((error: unknown) => {
  status.textContent = error instanceof Error && error.message.startsWith("存档")
    ? error.message : "无法读取本机存档。检查浏览器存储后刷新重试。";
});
