import { createCommandUI } from "./m2-command.ts";
import { isDivineBook } from "./game/m2/divine.ts";
import { appearanceChoice, appearanceChoices, appearanceSlots, appearanceUnlocked, type Appearance, type AppearanceSlot } from "./game/m2/appearance.ts";
import { configuration, cardTemplates, directBuilds, firelordSkin, itemFields, items, openingChoices, ordinaryGoods, prayerBooks, qualificationChains, towerLevels, waveRewards, workerTowers } from "./game/m2/content.ts";
import { weapons } from "./game/m2/combat.ts";
import { artilleryItems, canChooseOpening, canMoveItem, circleId, containmentPoints, controlEquipmentTargets, flameArrowTargets, heroSpellTargets, inspectBuildPlacement, isActiveTowerEquipment, isKnowledgeBook, isTargetedEquipment, creditTime, drain, enqueue, newMatch, purgeTargets, qualified, restoreHeroState, transmuteTargets, usableWorkerItem, wolfTargets, type Action, type Match } from "./game/m2/match.ts";
import { createM2SaveStore, StaleM2Checkpoint, type Checkpoint } from "./game/m2/save.ts";
import { learnableSkills, learningLevel } from "./game/m2/hero.ts";
import { talentChoices, talentRules } from "./game/m2/talents.ts";
import { challengeTemplates } from "./game/m2/shops.ts";
import { emptySeasons, seasonDefinitions, seasonNames, startSeasons, type Seasons } from "./game/m2/seasons.ts";
import { towerSpells } from "./game/m2/tower-spells.ts";
import { heroSpellTargetMode, isCastableHeroSkill, type HeroSpell } from "./game/m2/hero-spells.ts";
import { waves } from "./game/m2/waves.ts";
import { mapVersion } from "./game/m2/map.ts";
import { createM2Scene } from "./m2-scene.ts";
import "./m2.css";

type Profile = { score: number; claims: string[]; seasons?: Seasons; enabledSkins?: string[]; appearance?: Appearance };
type Saved = Checkpoint<Profile, Match>;
type Head = Pick<Saved, "revision" | "activeMatchId">;
type Placement = Extract<Action, { type: "build-worker-tower" | "build-card" }>;
type Build = { key: string; label: string; action: Omit<Extract<Placement, { type: "build-worker-tower" }>, "point"> |
  Omit<Extract<Placement, { type: "build-card" }>, "point"> };

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const drawNames = { i001: "蓝卡", i002: "橙卡", i003: "红卡", i005: "黑卡" };
const rejection = {
  opening: "请先使用特制橙色卡片，或检查开局卡是否已选", placement: "此处不可建造", resources: "资源或人口不足",
  missing: "对象已变化或操作不可用", learning: "技能点不足或尚未满足学习条件", range: "工人距离目标过远", stock: "当前无库存", cooldown: "操作仍在冷却", equipment: "目标无法携带，物品留在其位置", full: "背包已满", materials: "材料不符合操作条件", closed: "商店尚未开放",
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const nonnegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const point = (value: unknown) => record(value) && finite(value.x) && finite(value.y);

function validSeasons(value: unknown) {
  return value === undefined || record(value) && seasonNames.every(name => {
    const progress = value[name];
    return record(progress) && nonnegativeInteger(progress.points) && Number(progress.points) <= 300 &&
      record(progress.counts) && Object.entries(progress.counts).every(([id, count]) =>
        /^[1-9]$/.test(id) && nonnegativeInteger(count)) &&
      Array.isArray(progress.nodes) && progress.nodes.every(node => nonnegativeInteger(node) && node >= 1 && node <= 30) &&
      Array.isArray(progress.unlocks) && progress.unlocks.every(unlock => typeof unlock === "string");
  });
}

function validAppearance(value: unknown): value is Appearance | undefined {
  if (value === undefined) return true;
  return record(value) && Object.entries(value).every(([slot, choice]) =>
    appearanceSlots.includes(slot as AppearanceSlot) && typeof choice === "string" && !!appearanceChoice(slot as AppearanceSlot, choice));
}

function validProfile(value: unknown): value is Profile {
  return record(value) && nonnegativeInteger(value.score) && validAppearance(value.appearance) &&
    Array.isArray(value.claims) && value.claims.every(claim => typeof claim === "string") && validSeasons(value.seasons) && (value.enabledSkins === undefined ||
      Array.isArray(value.enabledSkins) && value.enabledSkins.every(id => typeof id === "string"));
}

function validHero(value: unknown) {
  return record(value) && nonnegativeInteger(value.level) && Number(value.level) >= 1 && Number(value.level) <= 30 &&
    nonnegativeInteger(value.xp) && nonnegativeInteger(value.points) &&
    (value.talentAttributes === undefined || nonnegativeInteger(value.talentAttributes)) &&
    (value.divineForm === undefined || record(value.divineForm) && typeof value.divineForm.id === "string" &&
      (value.divineForm.id === "P200" ? value.divineForm.stars === 1 :
        /^P2(?:0[1-9]|1[0-9]|2[0-2])$/.test(value.divineForm.id) && nonnegativeInteger(value.divineForm.stars) &&
        Number(value.divineForm.stars) >= 1 && Number(value.divineForm.stars) <= 10)) &&
    (value.growthBonus === undefined || record(value.growthBonus) && nonnegativeInteger(value.growthBonus.attack) &&
      finite(value.growthBonus.modelScale) && Number(value.growthBonus.modelScale) > 0 &&
      (value.growthBonus.learnedIn === undefined || ["H021", "G059"].includes(String(value.growthBonus.learnedIn)))) &&
    record(value.ranks) && Object.values(value.ranks).every(nonnegativeInteger) &&
    Array.isArray(value.paid) && value.paid.every(id => typeof id === "string") &&
    record(value.natural) && [value.natural.STR, value.natural.AGI, value.natural.INT].every(finite);
}

function validArtilleryTarget(value: unknown) {
  return value === undefined || record(value) && (point(value.point) || nonnegativeInteger(value.objectId));
}

function validWeaponTiming(attack: unknown) {
  if (attack === undefined) return true;
  if (!record(attack)) return false;
  const { timing } = attack;
  return validArtilleryTarget(attack.artillery) && (timing === undefined || record(timing) && timing.version === 1 &&
    (timing.slot === 1 || timing.slot === 2) && finite(timing.rawRate) &&
    [timing.cycleUs, timing.pointUs, timing.recoveryUs, attack.startedUs, attack.readyUs].every(nonnegativeInteger) &&
    Number(timing.cycleUs) > 0 && typeof attack.winding === "boolean" &&
    [timing.cooldown, timing.windup, timing.backswing].every(phase => phase === undefined ||
      record(phase) && finite(phase.workUs) && Number(phase.workUs) >= 0 &&
      [phase.recordedUs, phase.dueUs, phase.timerId].every(nonnegativeInteger) &&
      Number(phase.dueUs) >= Number(phase.recordedUs)));
}

function validRun(value: unknown): value is Match {
  if (!record(value) || typeof value.matchId !== "string" || !record(value.queue) || !record(value.clock)) return false;
  const { queue, clock } = value;
  const eventTypes = new Set([
    "movement", "worker-benefit", "start-wave", "spawn", "stop-wave", "welfare-spawn", "welfare-end",
    "divine-effect-end", "hero-spell-end", "weapon-backswing-end", "weapon-rate-end", "equipment-volley", "ice-path-impact", "auto-control-equipment", "equipment-hex-end",
    "boss-timeout", "command", "finish-construction", "commit-talent", "challenge-spawn", "weapon-fire", "weapon-ready", "weapon-impact", "spawn-rune", "demonflame", "scepter-swap", "hero-spell", "tower-spell", "sword-rain-emit", "sword-rain-travel", "spell-sweep", "contract-expire", "magic-arrow", "magic-arrow-restore", "hero-leash", "summon-expire", "detector-expire", "mana-debt", "spell-zones", "equipment-snow", "equipment-seal-end", "equipment-doom-impact", "equipment-hex-damage", "equipment-frost", "equipment-lightning", "equipment-burn", "immolation", "frost-expire", "avalanche", "stun-expire", "tree-grab-expire", "enemy-cast", "enemy-speed-expire", "enemy-summon-expire", "enemy-form-end", "enemy-egg-end",
  ]);
  const validStock = (stock: unknown) => stock === undefined || record(stock) &&
    Object.entries(stock).every(([id, count]) => items.has(id) && nonnegativeInteger(count) && Number(count) <= 4);
  return validSeasons(value.seasons) && validAppearance(value.appearance) &&
    [value.seasonScore, value.seasonRevision, value.seasonalChallengeUnlocks, value.transmuteReadyUs].every(entry => entry === undefined || nonnegativeInteger(entry)) &&
    [value.seasonalFourHeroes, value.seasonalOverdraftSurvival].every(entry => entry === undefined || entry === true) &&
    validStock(value.mysteryStock) && validStock(value.challengeStock) &&
    (value.waveRewardSlots === undefined || Array.isArray(value.waveRewardSlots) &&
      value.waveRewardSlots.length === waveRewards.length && value.waveRewardSlots.every(status => nonnegativeInteger(status) && status <= 3)) &&
    (value.mysteryRefreshed === undefined || typeof value.mysteryRefreshed === "boolean") &&
    (value.challengeScore === undefined || nonnegativeInteger(value.challengeScore)) &&
    (value.killScore === undefined || nonnegativeInteger(value.killScore)) &&
    (value.kills === undefined || nonnegativeInteger(value.kills)) &&
    (value.battleAnimations === undefined || Array.isArray(value.battleAnimations) && value.battleAnimations.length <= 64 &&
      value.battleAnimations.every(effect => record(effect) && point(effect) && nonnegativeInteger(effect.atUs) &&
        typeof effect.unitId === "string" && (effect.kind === "death" || effect.kind === "revive" || effect.kind === "artillery-impact" ||
          (effect.kind === "heal-link" || effect.kind === "weapon-link" || effect.kind === "spell-link") && point(effect.target)))) &&
    (value.damageEvents === undefined || Array.isArray(value.damageEvents) && value.damageEvents.every(hit =>
      record(hit) && point(hit) && finite(hit.amount) && nonnegativeInteger(hit.atUs))) &&
    (value.recentHits === undefined || Array.isArray(value.recentHits) && value.recentHits.length <= 64 &&
      value.recentHits.every(hit => record(hit) && point(hit) && finite(hit.amount) &&
        [hit.atUs, hit.targetId].every(nonnegativeInteger) && Number.isSafeInteger(hit.casterId))) &&
    (value.swordRainImpacts === undefined || Array.isArray(value.swordRainImpacts) && value.swordRainImpacts.every(entry =>
      record(entry) && point(entry) && nonnegativeInteger(entry.atUs))) &&
    (value.challengeReadyUs === undefined || nonnegativeInteger(value.challengeReadyUs)) &&
    (value.challengeStages === undefined || Array.isArray(value.challengeStages) && value.challengeStages.length === 8 &&
      value.challengeStages.every(stage => nonnegativeInteger(stage) && stage <= 3)) &&
    (value.challenges === undefined || record(value.challenges) && Object.values(value.challenges).every(entry =>
      record(entry) && challengeTemplates.some(template => template.unitId === entry.unitId) &&
      nonnegativeInteger(entry.remaining) && nonnegativeInteger(entry.timer))) &&
    (value.talent === undefined || record(value.talent) && typeof value.talent.id === "string" && talentRules.has(value.talent.id) &&
      [value.talent.rank, value.talent.readyUs, value.talent.busyUntilUs].every(nonnegativeInteger) &&
      Number(value.talent.rank) >= 1 && Number(value.talent.rank) <= 5) &&
    typeof queue.nowUs === "number" && nonnegativeInteger(queue.nowUs) &&
    nonnegativeInteger(queue.nextSequence) && Array.isArray(queue.pending) &&
    queue.pending.every(event => record(event) && typeof event.dueUs === "number" &&
      nonnegativeInteger(event.dueUs) && event.dueUs >= (queue.nowUs as number) &&
      [event.sequence, event.timerId, event.periodUs].every(nonnegativeInteger) &&
      record(event.payload) && typeof event.payload.type === "string" && eventTypes.has(event.payload.type)) &&
    typeof clock.targetUs === "number" && nonnegativeInteger(clock.targetUs) && clock.targetUs >= queue.nowUs &&
    typeof clock.fractionUs === "number" && clock.fractionUs >= 0 && clock.fractionUs < 1 &&
    (clock.speed === 1 || clock.speed === 4) && typeof clock.paused === "boolean" &&
    [value.seed, value.randomState, value.wave, value.batch, value.totalArrivals, value.nextId,
      value.gold, value.lumber, value.population, value.populationLimit, value.luckLevel].every(nonnegativeInteger) &&
    (value.openingCard === null || typeof value.openingCard === "string" && openingChoices.includes(value.openingCard)) &&
    Array.isArray(value.enemies) && value.enemies.every(enemy => record(enemy) && point(enemy) &&
      nonnegativeInteger(enemy.id) && finite(enemy.speed) && finite(enemy.radius) && Array.isArray(enemy.initialOverlaps)) &&
    Array.isArray(value.structures) && value.structures.every(tower => record(tower) && point(tower) &&
      nonnegativeInteger(tower.id) && typeof tower.templateId === "string" && towerLevels.has(tower.templateId) &&
      (tower.autoModes === undefined || record(tower.autoModes) && Object.values(tower.autoModes).every(value => typeof value === "boolean")) &&
      (tower.focusTarget === undefined || nonnegativeInteger(tower.focusTarget)) &&
      validWeaponTiming(tower.attack) && validArtilleryTarget(tower.artilleryOrder) &&
      (tower.scepterWard === undefined || typeof tower.scepterWard === "boolean") &&
      (tower.hero === undefined || validHero(tower.hero)) &&
      (tower.life === undefined || record(tower.life) &&
        [tower.life.hp, tower.life.maximum, tower.life.staticMaximum, tower.life.regen].every(finite) &&
        nonnegativeInteger(tower.life.lastUs)) &&
      [tower.flameTarget, tower.swordRainToken].every(entry => entry === undefined || nonnegativeInteger(entry)) &&
      (tower.pending === null || record(tower.pending) && nonnegativeInteger(tower.pending.timer))) &&
    (value.summons === undefined || Array.isArray(value.summons) && value.summons.every(summon =>
      record(summon) && point(summon) && nonnegativeInteger(summon.id) && summon.pending === null &&
      validWeaponTiming(summon.attack) &&
      typeof summon.templateId === "string" && record(summon.summon) &&
      (/^(?:b10[3-9]|b110|b12[2-7]|b13[2-7])$/.test(summon.templateId) ||
        summon.summon.illusion === true && !!towerLevels.get(summon.templateId)?.growth) && nonnegativeInteger(summon.summon.ownerId) &&
      (summon.summon.independent === undefined || summon.summon.independent === true && /^b10[3-6]$/.test(summon.templateId)) &&
      (summon.wolfOrder === undefined || summon.summon.independent === true && record(summon.wolfOrder) &&
        Array.isArray(summon.wolfOrder.path) && summon.wolfOrder.path.every(point) &&
        (summon.wolfOrder.type === "move" && point(summon.wolfOrder.point) ||
          summon.wolfOrder.type === "attack" && nonnegativeInteger(summon.wolfOrder.targetId))) &&
      (summon.walkDirection === undefined || point(summon.walkDirection)) &&
      (summon.spawnOverlaps === undefined || Array.isArray(summon.spawnOverlaps) && summon.spawnOverlaps.every(nonnegativeInteger)) &&
      [summon.summon.attack, summon.summon.speed, summon.summon.green, summon.summon.blue].every(finite))) &&
    (value.detectors === undefined || Array.isArray(value.detectors) && value.detectors.every(detector =>
      record(detector) && point(detector) && nonnegativeInteger(detector.id) && nonnegativeInteger(detector.ownerId) &&
      (detector.hp === undefined || finite(detector.hp) && Number(detector.hp) > 0))) &&
    Array.isArray(value.cards) && value.cards.every(card => record(card) && nonnegativeInteger(card.id) &&
      typeof card.card === "string" && cardTemplates.has(card.card) && point(card.point) &&
      finite(card.hp) && (card.invulnerable === undefined || card.invulnerable === true) &&
      nonnegativeInteger(card.charges) && Number(card.charges) > 0) &&
    (value.openingChoicesUnlocked === undefined || typeof value.openingChoicesUnlocked === "boolean") &&
    (value.chestReadyUs === undefined || nonnegativeInteger(value.chestReadyUs)) &&
    (value.openedChests === undefined || nonnegativeInteger(value.openedChests)) &&
    (value.inventory === undefined || Array.isArray(value.inventory) && value.inventory.every(item =>
      record(item) && nonnegativeInteger(item.id) && typeof item.itemId === "string" && items.has(item.itemId) &&
      (item.slot === null || nonnegativeInteger(item.slot) && Number(item.slot) < 6) &&
      (item.towerId === undefined || item.slot !== null && (item.towerId === circleId ||
        (value.structures as Array<{ id: number }>).some(tower => tower.id === item.towerId))) &&
      (item.invulnerable === undefined || item.invulnerable === true) &&
      (item.hp === undefined || finite(item.hp) && Number(item.hp) > 0) &&
      nonnegativeInteger(item.charges) && point(item.point))) &&
    (value.books === undefined || Array.isArray(value.books) && value.books.every(book =>
      record(book) && nonnegativeInteger(book.id) && nonnegativeInteger(book.slot) && Number(book.slot) < 6 &&
      nonnegativeInteger(book.charges) && Number(book.charges) > 0 && prayerBooks.some(entry => entry.id === book.bookId))) &&
    (value.bookRestock === undefined || record(value.bookRestock) && Object.entries(value.bookRestock).every(([id, due]) =>
      prayerBooks.some(book => book.id === id) && Array.isArray(due) && due.every(nonnegativeInteger))) &&
    (value.shopRestock === undefined || record(value.shopRestock) && Object.entries(value.shopRestock).every(([id, due]) =>
      ordinaryGoods.has(id) && Array.isArray(due) && due.every(nonnegativeInteger))) &&
    point(value.worker) && (value.approach === null || record(value.approach)) &&
    record(value.commandResults) && record(value.blackWeights) &&
    ["running", "failed", "won"].includes(String(value.phase));
}

const store = createM2SaveStore(validProfile, validRun);
let run: Match | undefined;
let profile: Profile = { score: 0, claims: [] };
let head: Head | undefined;
let writer: Pick<Parameters<Parameters<typeof store.withWriter>[0]>[0], "commit" | "restart"> | undefined;
let build: Build | undefined;
let busy = false;
let previousTime = performance.now();
let lastSave = previousTime;
let jobs: Promise<unknown> = Promise.resolve();
let lastControls = "";
let pendingCommand: string | undefined;
let pendingBuild: { commandId: string; key: string } | undefined;
let scoutWard: { itemId: number; towerId: number; mode: "scout" | "snow" } | undefined;
let pointSpell: { towerId: number; skillId: HeroSpell; label: string } | undefined;
let artilleryTowerId: number | undefined;
let wolfMoveId: number | undefined;
const compatibleMap = () => !!run && run.mapVersion === mapVersion;
let releaseWriter: (() => void) | undefined;

function writable() {
  return !!writer && !busy && compatibleMap() && run?.phase === "running";
}

function send(action: Action) {
  if (!writable() || !run) return;
  tickClock();
  const id = crypto.randomUUID();
  if (enqueue(run, { id, matchId: run.matchId, action })) {
    pendingCommand = id;
    el("feedback").textContent = run.clock.paused ? "指令已排队，继续后执行。" : "指令已排队。";
    return id;
  }
}

function addButton(parent: HTMLElement, label: string, action: () => void, disabled = !writable()) {
  const button = document.createElement("button");
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", action);
  parent.append(button);
  return button;
}

function cardName(id: string) {
  const card = cardTemplates.get(id);
  return card ? `${card.name} · ${card.rarity}` : id;
}

function structureName(id: string) {
  return towerLevels.get(id)?.name ?? id;
}

let recycleConfirmation: { matchId: string; towerId: number; time: number } | undefined;

let lastSeasonView = "";
function showSeasonTasks() {
  const seasons = run?.seasons ?? profile.seasons;
  const key = JSON.stringify(seasons);
  if (lastSeasonView === key) return;
  lastSeasonView = key;
  const container = el("season-tasks");
  container.replaceChildren();
  for (const name of seasonNames) {
    const definition = seasonDefinitions[name];
    const progress = seasons?.[name];
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = `${name === "spring" ? "春节" : "夏季"} · ${progress?.points ?? 0}/300`;
    section.append(heading);
    const tasks = document.createElement("ul");
    for (const [id, task] of Object.entries(definition.tasks)) {
      const row = document.createElement("li");
      row.textContent = task["1"].slice(1, -1) + (configuration.deferredSeasonTasks[name].includes(Number(id))
        ? " · 后续开放" : ` · ${progress?.counts[Number(id)] ?? 0}/${task["4"]}`);
      tasks.append(row);
    }
    section.append(tasks);
    for (const [node, reward] of Object.entries(definition.rewards)) {
      if (reward["1"] !== 2 || !("3" in reward) || !progress?.unlocks.includes(String(reward["3"]))) continue;
      const entry = document.createElement("p");
      entry.textContent = `已解锁 ${reward["2"].slice(1, -1)}` + (Number(node) === 25 && name === "summer" ? " · 对应英雄后续开放" : "");
      section.append(entry);
    }
    container.append(section);
  }
}

function showControls() {
  showSeasonTasks();
  const wolves = run?.summons?.filter(unit => unit.summon?.independent) ?? [];
  const availableWolfTargets = wolves.map(unit => wolfTargets(run!, unit.id));
  const arrowTargets = new Map(run?.structures.flatMap(tower => {
    const targets = flameArrowTargets(run!, tower.id);
    return targets ? [[tower.id, targets] as const] : [];
  }));
  const goldTargets = run?.inventory?.some(item => item.itemId === "i256" && item.slot !== null && item.towerId === undefined)
    ? transmuteTargets(run) : undefined;
  const goldReady = !!run && run.queue.nowUs >= (run.transmuteReadyUs ?? 0);
  const challengeWait = Math.max(0, Math.ceil(((run?.challengeReadyUs ?? 0) - (run?.queue.nowUs ?? 0)) / 1_000_000));
  el("challenge-status").textContent = challengeWait > 0 ? `下次预约还需 ${challengeWait} 秒` : "";
  const challengeReady = challengeWait === 0;
  const talentReady = !!run?.talent && run.queue.nowUs >= Math.max(run.talent.readyUs, run.talent.busyUntilUs);
  const aimedSpells = new Map<string, ReturnType<typeof heroSpellTargets>>();
  if (run) {
    for (const tower of run.structures) {
      for (const [id, rank] of Object.entries(tower.hero?.ranks ?? {})) {
        if (!rank || !isCastableHeroSkill(id) || heroSpellTargetMode(id) !== "unit") continue;
        aimedSpells.set(`${tower.id}/${id}`, heroSpellTargets(run, tower.id, id as HeroSpell));
      }
    }
  }
  const equipmentTargets = new Map<number, ReturnType<typeof controlEquipmentTargets>>();
  if (run) {
    for (const item of run.inventory ?? []) {
      if (item.towerId !== undefined && item.slot !== null && isTargetedEquipment(item.itemId)) {
        equipmentTargets.set(item.id, controlEquipmentTargets(run, item.towerId, item.itemId));
      }
    }
  }
  const key = JSON.stringify([
    goldTargets?.map(enemy => enemy.id), goldReady, run?.talent, talentReady, challengeReady, run?.challengeShopOpen, run?.challengeStages, run?.challengeStock,
    run?.waveRewardSlots, run?.overdraftOpen, run?.overdraftPoints, run?.mysteryShopOpen, run?.mysteryRefreshed, run?.mysteryStock, run?.matchId, run?.phase, run?.openingCard, run?.openingChoicesUnlocked, run?.inventory, run?.qualificationShopOpen, run?.cards, run?.books, run?.structures.map(({ id, x, y, templateId, pending, qualification, hero, flameArrows, swordRainToken, snow, scepterSwap, scepterWard }) =>
      [id, x, y, templateId, pending, qualification, hero, flameArrows, swordRainToken, snow?.token, scepterSwap?.grant, scepterWard, arrowTargets.get(id)?.map(enemy => enemy.id)]),
    wolves.map((unit, index) => [unit.id, unit.wolfOrder?.type, availableWolfTargets[index].map(enemy => enemy.id)]),
    run?.workerSharing, run && run.queue.nowUs >= (run.workerBenefitReadyUs ?? 0),
    run?.snowDuration, run?.appearance, run?.seasons?.spring.unlocks, run?.seasons?.summer.unlocks,
    writer !== undefined, busy, build?.key, wolfMoveId, scoutWard, pointSpell, artilleryTowerId,
    [...aimedSpells].map(([id, enemies]) => [id, enemies.map(enemy => enemy.id)]),
    [...equipmentTargets].map(([id, enemies]) => [id, enemies.map(enemy => enemy.id)]),
  ]);
  if (lastControls === key) return;
  lastControls = key;
  const locked = !writable();
  el<HTMLButtonElement>("pause").disabled = locked;
  el<HTMLButtonElement>("speed").disabled = locked;
  el<HTMLButtonElement>("restart").disabled = !writer || busy;
  el("opening").hidden = !run || !canChooseOpening(run);
  el("exchanges").hidden = !run?.qualificationShopOpen;
  el<HTMLButtonElement>("exchange").disabled = locked;
  el<HTMLButtonElement>("buy-ordinary").disabled = locked;
  el<HTMLSelectElement>("ordinary-goods").disabled = locked;

  const rewards = el("wave-rewards");
  rewards.replaceChildren();
  for (const [slot, reward] of waveRewards.entries()) {
    const status = run?.waveRewardSlots?.[slot] ?? 0;
    if (status === 1 || status === 2) {
      addButton(rewards, `第 ${reward.claimable} 波奖励 · ${items.get(reward.itemId)!.name}`,
        () => send({ type: "claim-wave", slot }), locked || status !== 2);
    }
  }
  const overdraft = el<HTMLButtonElement>("overdraft");
  overdraft.hidden = !run?.overdraftOpen;
  overdraft.disabled = locked || (run?.overdraftPoints ?? 0) >= 20;
  overdraft.textContent = `透支 ${run?.overdraftPoints ?? 0}/20`;
  overdraft.onclick = () => send({ type: "overdraft" });
  el("mystery-shop").hidden = !run?.mysteryShopOpen;
  el("challenge-shop").hidden = !run?.challengeShopOpen;
  const mystery = el("mystery-stock");
  const challenge = el("challenge-stock");
  mystery.replaceChildren();
  challenge.replaceChildren();
  for (const [shop, panel, stock] of [
    ["mystery", mystery, run?.mysteryStock], ["challenge", challenge, run?.challengeStock],
  ] as const) {
    for (const [itemId, count] of Object.entries(stock ?? {})) {
      if (!count) continue;
      const fields = itemFields.get(itemId)!;
      const price = [fields.goldcost && `${fields.goldcost} 金`, fields.lumbercost && `${fields.lumbercost} 木`].filter(Boolean).join("、");
      addButton(panel, `${items.get(itemId)!.name} ×${count}${price ? " · " + price : ""}`, () => send({ type: "buy-special", shop, itemId }));
    }
  }
  if (run?.mysteryShopOpen && !run.mysteryRefreshed) {
    addButton(mystery, items.get("i399")!.name, () => send({ type: "buy-special", shop: "mystery", itemId: "i399" }));
  }
  for (const template of challengeTemplates.filter(entry => entry.stage === (run?.challengeStages?.[entry.family] ?? 0))) {
    addButton(challenge, `预约${template.name} ${template.stage + 1} 阶`, () =>
      send({ type: "reserve-challenge", unitId: template.unitId }), locked || !challengeReady);
  }
  const talents = el("talents");
  talents.replaceChildren();
  const talent = run?.talent;
  if (talent) {
    const name = talentChoices.find(entry => entry.id === talent.id)!.name;
    const status = document.createElement("span");
    status.textContent = `${name} Lv${talent.rank}`;
    talents.append(status);
    if (talentRules.get(talent.id)?.cooldown && talent.id !== "W018") {
      addButton(talents, "施放", () => send({ type: "cast-talent" }), locked || !talentReady);
    }
  } else {
    for (const { choice, name } of talentChoices) {
      addButton(talents, name, () => send({ type: "choose-talent", choice }));
    }
  }

  const choices = el("choices");
  choices.replaceChildren();
  for (const card of openingChoices) addButton(choices, cardName(card), () => send({ type: "choose-opening", card }));

  const builds = el("builds");
  builds.replaceChildren();
  for (const tower of Object.keys(directBuilds) as Array<keyof typeof directBuilds>) {
    addButton(builds, `${workerTowers.get(tower)!.name} · ${directBuilds[tower].gold} 金`, () => {
      clearPlacement();
      build = { key: tower, label: workerTowers.get(tower)!.name, action: { type: "build-worker-tower", tower } };
      el("feedback").textContent = "建造区已高亮。移动鼠标查看落点，左键放置，Esc 取消。";
    }).setAttribute("aria-pressed", String(build?.key === tower));
  }

  const draws = el("draws");
  draws.replaceChildren();
  for (const draw of Object.keys(drawNames) as Array<keyof typeof drawNames>) {
    addButton(draws, `${drawNames[draw]} · ${configuration.cardRolls[draw].gold} 金`, () => send({ type: "draw", draw }));
  }

  const prayer = el("prayer");
  prayer.replaceChildren();
  for (const book of prayerBooks) {
    addButton(prayer, `${book.name} · ${book.gold} 金`, () => send({ type: "buy-book", bookId: book.id }));
  }

  const pack = el("books");
  pack.textContent = run?.books?.map(book =>
    `${prayerBooks.find(entry => entry.id === book.bookId)!.name} ×${book.charges}`).join(" · ") || "工人未持有经验道具。";

  function addItemTransfer(row: HTMLElement, itemId: number, name: string, from?: number) {
    const targets = document.createElement("select");
    targets.setAttribute("aria-label", `${name}的转交目标`);
    if (from !== undefined) targets.append(new Option("工人", ""));
    if (from !== circleId) targets.append(new Option("能量圈", String(circleId)));
    for (const tower of run?.structures.filter(entry => entry.id !== from && !entry.pending) ?? []) {
      targets.append(new Option(`${structureName(tower.templateId)} #${tower.id}`, String(tower.id)));
    }
    row.append(targets);
    addButton(row, "转交", () => send({
      type: "transfer-item", itemId, towerId: targets.value === "" ? undefined : Number(targets.value),
    }));
  }

  const benefits = el("worker-benefits");
  benefits.replaceChildren();
  if (run) {
    addButton(benefits, "领取福利", () => send({ type: "claim-worker-benefit" }),
      locked || run.queue.nowUs < (run.workerBenefitReadyUs ?? 0));
    const share = addButton(benefits, run.workerSharing ? "关闭助手加成分享" : "开启助手加成分享",
      () => send({ type: "toggle-worker-sharing" }), locked);
    share.setAttribute("aria-pressed", String(Boolean(run.workerSharing)));
  }
  const appearance = el("worker-appearance");
  appearance.replaceChildren();
  if (run) {
    const labels = { worker: "工人外观", circle: "能量圈外观", aura: "工人光环", wings: "工人羽翼", title: "工人称号", accent: "工人装饰" } as const;
    for (const [slot, name] of Object.entries(labels) as [keyof typeof labels, string][]) {
      const label = document.createElement("label");
      label.textContent = name;
      const choices = document.createElement("select");
      choices.setAttribute("aria-label", name);
      choices.append(new Option("默认", ""));
      for (const choice of appearanceChoices.filter(choice => choice.slot === slot)) {
        const option = new Option(choice.name, choice.id);
        option.disabled = !appearanceUnlocked(choice, run.seasons);
        choices.append(option);
      }
      choices.value = run.appearance?.[slot] ?? "";
      choices.disabled = locked;
      choices.onchange = () => send({ type: "choose-appearance", slot, choice: choices.value || undefined });
      label.append(choices);
      appearance.append(label);
    }
  }

  const inventory = el("worker-items");
  inventory.replaceChildren();
  for (const item of run?.inventory?.filter(entry => entry.towerId === undefined) ?? []) {
    const name = items.get(item.itemId)!.name + (item.charges > 1 ? ` ×${item.charges}` : "");
    const row = document.createElement("div");
    row.className = "controls";
    if (item.slot === null) {
      addButton(row, `拾取${name}`, () => send({ type: "pick-up-item", itemId: item.id }));
    } else {
      if (item.itemId === "i256") {
        const targets = document.createElement("select");
        targets.setAttribute("aria-label", "点金目标");
        for (const enemy of goldTargets ?? []) targets.append(new Option(`${enemy.unitId} #${enemy.id}`, String(enemy.id)));
        row.append(targets);
        addButton(row, "使用点金手", () => send({ type: "use-item", itemId: item.id, targetId: Number(targets.value) }),
          locked || !goldReady || !goldTargets?.length).setAttribute("data-item-id", item.itemId);
      } else if (usableWorkerItem(item.itemId)) {
        addButton(row, `使用${name}`, () => send({ type: "use-item", itemId: item.id }))
          .setAttribute("data-item-id", item.itemId);
      } else {
        const label = document.createElement("span");
        label.textContent = name;
        row.append(label);
      }
      if (canMoveItem(item.itemId)) {
        addButton(row, `丢下${name}`, () => send({ type: "drop-item", itemId: item.id }));
        addItemTransfer(row, item.id, name);
      }
    }
    inventory.append(row);
  }

  const cards = el("cards");
  cards.replaceChildren();
  for (const card of [...run?.cards ?? []].sort((a, b) => (a.slot ?? 6) - (b.slot ?? 6))) {
    addButton(cards, card.slot === null ? `拾取 ${cardName(card.card)}` : cardName(card.card), () => {
      if (card.slot === null) send({ type: "pick-up-card", cardId: card.id });
      else {
        clearPlacement();
        build = { key: String(card.id), label: cardName(card.card), action: { type: "build-card", cardId: card.id } };
        el("feedback").textContent = "建造区已高亮。移动鼠标查看落点，左键放置，Esc 取消。";
      }
    }).setAttribute("aria-pressed", String(build?.key === String(card.id)));
    if (card.slot !== null) {
      addButton(cards, `丢下 ${cardName(card.card)}`, () => send({ type: "drop-card", cardId: card.id }));
      if (talent?.id === "W012" && card.slot !== 0) {
        addButton(cards, `${cardName(card.card)}放入第一格`, () => send({ type: "swap-worker-slots", from: card.slot!, to: 0 }));
      }
    }
  }

  function showEquipment(container: HTMLElement, towerId: number) {
    const entries = run?.inventory?.filter(item => item.towerId === towerId) ?? [];
    for (const item of entries) {
      const gear = document.createElement("div");
      const name = items.get(item.itemId)!.name;
      gear.textContent = `${name}${item.charges > 1 ? " ×" + item.charges : ""} `;
      if (towerId !== circleId && isActiveTowerEquipment(item.itemId) && item.slot !== null) {
        const label = item.itemId === "i330" ? "熄灭魔焰" : item.itemId === "i332" ? "点燃魔焰" : "施放" + name;
        addButton(gear, label, () => send({ type: "cast-equipment", itemId: item.id, towerId }), locked);
      }
      const eligible = equipmentTargets.get(item.id);
      if (eligible) {
        const targets = document.createElement("select");
        targets.setAttribute("aria-label", name + "目标");
        for (const enemy of eligible) targets.append(new Option(`${enemy.unitId} #${enemy.id}`, String(enemy.id)));
        gear.append(targets);
        addButton(gear, "施放" + name, () => send({ type: "cast-equipment", towerId, itemId: item.id, targetId: Number(targets.value) }),
          locked || !targets.options.length);
      }
      if (item.itemId === "i325" && towerId !== circleId) {
        const duration = document.createElement("select");
        duration.setAttribute("aria-label", "落雪引导时长");
        for (let seconds = 1; seconds <= 4; seconds++) duration.append(new Option(`${seconds}秒`, String(seconds)));
        duration.value = String(run?.snowDuration ?? 4);
        duration.onchange = () => send({ type: "set-snow-duration", seconds: Number(duration.value) });
        gear.append(duration);
        addButton(gear, "施放落雪", () => {
          clearPlacement();
          scoutWard = { itemId: item.id, towerId, mode: "snow" };
        }, locked);
      }
      if (item.itemId === "i235" && run?.structures.some(tower => tower.id === towerId && tower.hero && !tower.pending)) {
        addButton(gear, "放置侦查守卫", () => {
          clearPlacement();
          scoutWard = { itemId: item.id, towerId, mode: "scout" };
        }, locked);
      }
      if (canMoveItem(item.itemId)) {
        addItemTransfer(gear, item.id, name, towerId);
        addButton(gear, "丢下", () => send({ type: "drop-item", itemId: item.id }));
      }
      container.append(gear);
    }
  }
  const circleItems = el("circle-items");
  circleItems.replaceChildren();
  if (run) {
    const title = document.createElement("h3");
    title.textContent = "能量圈背包";
    circleItems.append(title);
    showEquipment(circleItems, circleId);
  }

  const structures = el("structures");
  structures.replaceChildren();
  for (const tower of run?.structures ?? []) {
    const row = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = `${structureName(tower.templateId)} · ${tower.templateId}${tower.qualification ? " · " + tower.qualification : ""}`;
    row.append(label);
    if (tower.pending) {
      addButton(row, "取消", () => send({ type: "cancel-construction", towerId: tower.id }));
    } else {
      showEquipment(row, tower.id);
      if (weapons[tower.templateId]?.some(weapon => weapon.kind === "artillery")) {
        addButton(row, "炮击地面", () => {
          clearPlacement();
          artilleryTowerId = tower.id;
          el("feedback").textContent = "左键选择炮击落点，Esc 取消。";
        }, locked).setAttribute("aria-pressed", String(artilleryTowerId === tower.id));
        const targets = artilleryItems(run!, tower.id);
        if (targets.length) {
          const select = document.createElement("select");
          select.setAttribute("aria-label", "炮击物品目标");
          for (const target of targets) {
            const name = "card" in target ? cardName(target.card) : items.get(target.itemId)!.name;
            select.append(new Option(`${name} #${target.id}`, String(target.id)));
          }
          row.append(select);
          addButton(row, "炮击物品", () => {
            clearPlacement();
            send({ type: "attack-ground-item", towerId: tower.id, objectId: Number(select.value) });
          }, locked);
        }
      }
      if (talent?.id === "W018") {
        addButton(row, "神兵天降", () => send({ type: "cast-talent", towerId: tower.id }), locked || !talentReady);
      }
      const upgrade = towerLevels.get(tower.templateId)?.upgrade;
      if (upgrade) addButton(row, `升级 · ${upgrade.gold} 金`, () => send({ type: "upgrade-tower", towerId: tower.id }));
      const activeMatch = run!;
      const hero = tower.hero;
      if (hero) {
        const stat = document.createElement("p");
        stat.textContent = `等级 ${hero.level} · 经验 ${hero.xp} · 技能点 ${hero.points}${hero.talentAttributes ? " · 天赋三围 +" + hero.talentAttributes : ""}${qualified(activeMatch, tower.id) ? " · 突破资格生效" : ""}`;
        if (hero.divineForm) stat.textContent += ` · 神能 ${hero.divineForm.id} · ${hero.divineForm.stars} 星`;
        row.append(stat);
        const skills = document.createElement("div");
        skills.className = "controls";
        for (const skill of learnableSkills(tower.templateId)) {
          const rank = hero.ranks[skill.skillId] ?? 0;
          const required = learningLevel(hero, tower.templateId, skill.skillId);
          const label = required === undefined ? `${skill.name} Lv${rank}` :
            `学习${skill.name} Lv${rank + 1}（需 ${required} 级）`;
          addButton(skills, label, () => send({ type: "learn-skill", towerId: tower.id, skillId: skill.skillId }),
            locked || hero.points < 1 || required === undefined || hero.level < required);
          const { skillId } = skill;
          if (rank && isCastableHeroSkill(skillId)) {
            const mode = heroSpellTargetMode(skillId);
            if (mode === "point") {
              const name = skillId === "A094" && tower.scepterWard ? "强化群蛇守卫" : skill.name;
              addButton(skills, `施放${name}`, () => {
                clearPlacement();
                pointSpell = { towerId: tower.id, skillId: skillId as HeroSpell, label: name };
              }, locked);
            } else if (mode === "unit") {
              const targets = document.createElement("select");
              targets.setAttribute("aria-label", skill.name + "目标");
              for (const enemy of aimedSpells.get(`${tower.id}/${skillId}`) ?? []) {
                targets.append(new Option(`${enemy.unitId} #${enemy.id}`, String(enemy.id)));
              }
              skills.append(targets);
              addButton(skills, `施放${skill.name}`, () => send({ type: "cast-hero", towerId: tower.id, skillId,
                targetId: Number(targets.value) }), locked || targets.options.length === 0);
            } else {
              addButton(skills, `施放${skill.name}`, () => send({ type: "cast-hero", towerId: tower.id, skillId }), locked);
            }
          }
        }
        if (tower.scepterSwap) {
          const target = document.createElement("select");
          target.setAttribute("aria-label", "移形换位目标");
          for (const ally of [...activeMatch.structures, ...(activeMatch.summons ?? [])]) {
            if (ally !== tower && !ally.pending) target.append(new Option(`${structureName(ally.templateId)} #${ally.id}`, String(ally.id)));
          }
          target.append(new Option("自身", String(tower.id)), new Option("工人（无法换位）", "-1"),
            new Option("能量圈（无法换位）", String(circleId)));
          skills.append(target);
          addButton(skills, "移形换位", () => send({ type: "cast-scepter-swap", towerId: tower.id, targetId: Number(target.value) }),
            locked || target.options.length === 0);
        }
        if (tower.templateId === firelordSkin.from) {
          addButton(skills, "切换火焰领主", () => send({ type: "choose-skin", towerId: tower.id, choice: firelordSkin.choice }), locked);
        }
        for (const book of activeMatch.books ?? []) {
          const name = prayerBooks.find(entry => entry.id === book.bookId)!.name;
          addButton(skills, `使用${name}`, () => send({ type: "use-book", itemId: book.id, towerId: tower.id }));
        }
        for (const book of activeMatch.inventory ?? []) {
          if (book.slot !== null && (isKnowledgeBook(book.itemId) || isDivineBook(book.itemId))) {
            addButton(skills, `使用${items.get(book.itemId)!.name} #${book.id}`,
              () => send({ type: "use-book", itemId: book.id, towerId: tower.id }), locked);
          }
        }
        row.append(skills);
      }
      const targets = arrowTargets.get(tower.id);
      if (targets) {
        const enabled = hero ? tower.flameArrows !== false : tower.flameArrows === true;
        addButton(row, enabled ? "关闭灼热之箭" : "开启灼热之箭", () => send({ type: "toggle-flame-arrows", towerId: tower.id }));
        const select = document.createElement("select");
        select.setAttribute("aria-label", "灼热之箭目标");
        for (const enemy of targets) select.append(new Option(`${enemy.unitId} #${enemy.id}`, String(enemy.id)));
        row.append(select);
        addButton(row, "手动发射灼热之箭", () => send({ type: "cast-flame-arrow", towerId: tower.id, targetId: Number(select.value) }),
          locked || targets.length === 0);
      }
      if (tower.snow) addButton(row, "停止落雪", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.spellWindup !== undefined) addButton(row, "取消施法", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.leashToken !== undefined) addButton(row, "停止枷锁", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.swordRainToken !== undefined) {
        addButton(row, "停止黑暗剑雨", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      }
      for (const spell of towerSpells.get(tower.templateId) ?? []) {
        const binding = towerLevels.get(tower.templateId)?.bindings.find(entry => entry.skillId === spell.id);
        if (!binding) continue;
        const cast = { type: "cast-tower" as const, towerId: tower.id, skillId: spell.id };
        if (spell.effect.kind !== "purge") {
          addButton(row, "施放" + binding.name, () => send(cast));
          continue;
        }
        const targets = document.createElement("select");
        targets.setAttribute("aria-label", binding.name + "目标");
        for (const enemy of purgeTargets(activeMatch, tower, spell.effect.range)) {
          targets.append(new Option(`${enemy.unitId} #${enemy.id}`, String(enemy.id)));
        }
        row.append(targets);
        addButton(row, "施放" + binding.name, () => send({ ...cast, targetId: Number(targets.value) }), locked || !targets.options.length);
      }
      addButton(row, "回收", () => {
        if (hero) {
          const now = performance.now();
          if (recycleConfirmation?.matchId !== activeMatch.matchId ||
            recycleConfirmation.towerId !== tower.id || now - recycleConfirmation.time > 500) {
            recycleConfirmation = { matchId: activeMatch.matchId, towerId: tower.id, time: now };
            el("feedback").textContent = "请在 0.5 秒内再次点击回收。";
            return;
          }
        }
        recycleConfirmation = undefined;
        send({ type: "recycle-tower", towerId: tower.id });
      });
    }
    structures.append(row);
  }
  for (const [index, wolf] of wolves.entries()) {
    const row = document.createElement("div");
    row.dataset.wolfId = String(wolf.id);
    const label = document.createElement("span");
    const order = wolf.wolfOrder?.type;
    label.textContent = `灵兽 Lv${Number(wolf.templateId.slice(1)) - 102} #${wolf.id} · ${order === "move" ? "移动" : order === "attack" ? "追击" : "待命"}`;
    row.append(label);
    addButton(row, wolfMoveId === wolf.id ? "选取目的地" : "移动灵兽", () => {
      clearPlacement();
      wolfMoveId = wolf.id;
    }, locked);
    const select = document.createElement("select");
    select.setAttribute("aria-label", "灵兽攻击目标");
    const targets = availableWolfTargets[index];
    for (const enemy of targets) select.append(new Option(`${enemy.unitId} #${enemy.id}`, String(enemy.id)));
    row.append(select);
    addButton(row, "攻击目标", () => {
      wolfMoveId = undefined;
      send({ type: "attack-with-wolf", unitId: wolf.id, targetId: Number(select.value) });
    }, locked || targets.length === 0);
    addButton(row, "停止灵兽", () => {
      wolfMoveId = undefined;
      send({ type: "stop-wolf", unitId: wolf.id });
    }, locked);
    structures.append(row);
  }
}

const goodsSelect = el<HTMLSelectElement>("ordinary-goods");
const shopGroups = new Map<string, HTMLOptGroupElement>();
for (const entry of ordinaryGoods.values()) {
  if (Object.hasOwn(configuration.cardRolls, entry.id) || prayerBooks.some(book => book.id === entry.id)) continue;
  let group = shopGroups.get(entry.shop);
  if (!group) {
    group = document.createElement("optgroup");
    group.label = entry.shop;
    shopGroups.set(entry.shop, group);
    goodsSelect.append(group);
  }
  const price = [entry.gold && `${entry.gold} 金`, entry.lumber && `${entry.lumber} 木`].filter(Boolean).join("、");
  group.append(new Option(`${entry.name} · ${price}`, entry.id));
}
el("buy-ordinary").onclick = () => send({ type: "buy-item", itemId: goodsSelect.value });

const select = el<HTMLSelectElement>("qualification");
for (const chain of qualificationChains.values()) {
  select.add(new Option(`${chain.id} · ${cardName(chain.card)}`, chain.id));
}
el("exchange").onclick = () => send({ type: "exchange", qualification: select.value });

let draw: Awaited<ReturnType<typeof createM2Scene>> | undefined;
function clearPlacement() {
  scoutWard = undefined;
  pointSpell = undefined;
  wolfMoveId = undefined;
  artilleryTowerId = undefined;
  build = undefined;
}
function cancelPlacement() {
  const choosingPoint = wolfMoveId !== undefined || scoutWard !== undefined || pointSpell !== undefined || artilleryTowerId !== undefined;
  clearPlacement();
  el("feedback").textContent = choosingPoint ? "已取消选择目的地。" : "已取消选塔。";
}
el("cancel-placement").onclick = cancelPlacement;
el("reset-view").onclick = () => draw?.resetView();
el("view-oblique").onclick = () => draw?.setView("oblique");
el("view-top").onclick = () => draw?.setView("top");
el("rotate-left").onclick = () => draw?.rotateView(-1);
el("rotate-right").onclick = () => draw?.rotateView(1);
el("zoom-in").onclick = () => draw?.zoomView(1.2);
el("zoom-out").onclick = () => draw?.zoomView(1 / 1.2);
const commandUI = createCommandUI({ match: () => compatibleMap() ? run : undefined, scene: () => draw, send, writable,
  cancel: clearPlacement, placing: () => !!build || !!pointSpell || !!scoutWard || wolfMoveId !== undefined || artilleryTowerId !== undefined });
void createM2Scene(el<HTMLCanvasElement>("field"), point => {
  if (artilleryTowerId !== undefined && writable()) {
    const towerId = artilleryTowerId;
    artilleryTowerId = undefined;
    send({ type: "attack-ground", towerId, point });
    return;
  }
  if (pointSpell && writable()) {
    const { towerId, skillId } = pointSpell;
    pointSpell = undefined;
    send({ type: "cast-hero", towerId, skillId, point });
    return;
  }
  if (scoutWard && writable()) {
    const { mode, itemId, towerId } = scoutWard;
    send({ type: mode === "scout" ? "place-scout-ward" : "cast-equipment", itemId, towerId, point });
    scoutWard = undefined;
    return;
  }
  if (wolfMoveId !== undefined && writable()) {
    const unitId = wolfMoveId;
    wolfMoveId = undefined;
    send({ type: "move-wolf", unitId, point });
    return;
  }
  if (!build || !run || !writable()) return;
  if (pendingBuild) { el("feedback").textContent = "工人正在执行建造指令，请稍候。"; return; }
  const result = inspectBuildPlacement(run, { ...build.action, point });
  if (!result.ok) { el("feedback").textContent = rejection[result.reason] + "，可移动鼠标重新选位置。"; return; }
  const commandId = send({ ...build.action, point });
  if (commandId) pendingBuild = { commandId, key: build.key };
}, message => {
  const approach = run?.approach?.command.action.type;
  const workerStatus = approach === "pick-up-card" ? "工人正在前往拾取塔卡。" :
    approach === "pick-up-item" ? "工人正在前往拾取物品。" :
    approach === "transfer-item" ? "工人正在前往交接物品。" :
    approach ? "工人正在前往建造位置，到达后开始施工。" : undefined;
  const status = !compatibleMap() && run ? "旧地图存档已保留，请点击重开进入新地图。" :
    workerStatus ?? message;
  if (el("placement-status").textContent !== status) el("placement-status").textContent = status;
}, view => {
  el("view-oblique").setAttribute("aria-pressed", String(view.preset === "oblique"));
  el("view-top").setAttribute("aria-pressed", String(view.preset === "top"));
  const label = { oblique: "斜俯视", top: "俯视", custom: "自由视角" }[view.preset];
  el("camera-status").textContent = `${label} · 朝向 ${view.yaw}° · ${Math.round(view.zoom * 100)}%`;
}).then(render => {
  draw = render;
  document.querySelectorAll<HTMLButtonElement>(".camera-panel button").forEach(button => { button.disabled = false; });
  el("field").dataset.ready = "true";
}).catch(error => {
  el("feedback").textContent = "三维战场加载失败。";
  console.error(error);
});

function tickClock() {
  const now = performance.now();
  if (run && writer && !busy && compatibleMap()) creditTime(run, now - previousTime);
  previousTime = now;
}

function createMatch() {
  const value = new URLSearchParams(location.search).get("seed");
  const requested = value === null || !/^\d+$/.test(value) ? NaN : Number(value);
  const seed = requested >= 0 && requested <= 0xffffffff ? requested : crypto.getRandomValues(new Uint32Array(1))[0];
  const match = newMatch(crypto.randomUUID(), seed, profile.seasons ?? emptySeasons());
  if (profile.appearance) match.appearance = { ...profile.appearance };
  return match;
}

function restore(checkpoint: Saved | undefined) {
  if (!checkpoint) return;
  head = { revision: checkpoint.revision, activeMatchId: checkpoint.activeMatchId };
  if (run?.matchId !== checkpoint.run.matchId) {
    pendingCommand = undefined;
    pendingBuild = undefined;
    pointSpell = undefined;
    scoutWard = undefined;
    artilleryTowerId = undefined;
  }
  run = checkpoint.run;
  profile = { ...checkpoint.profile, score: checkpoint.profile.score - matchScore(run) };
  run.seasons ??= structuredClone(profile.seasons ?? emptySeasons());
  if (compatibleMap()) restoreHeroState(run);
}

function matchScore(match: Match) {
  return (match.seasonScore ?? 0) + (match.challengeScore ?? 0) + (match.killScore ?? 0);
}

function checkpointProfile(match: Match): Profile {
  return { ...profile, seasons: match.seasons, appearance: match.appearance, score: profile.score + matchScore(match),
    enabledSkins: [...new Set([...(profile.enabledSkins ?? []), firelordSkin.unlock])] };
}

let queuedSave = false;
function save() {
  if (!writer || !run || queuedSave || !compatibleMap()) return;
  queuedSave = true;
  lastSave = performance.now();
  jobs = jobs.then(async () => {
    queuedSave = false;
    if (!writer || !run || busy || !compatibleMap()) return;
    head = await writer.commit(head, checkpointProfile(run), run);
    el("save").textContent = `已保存 · 修订 ${head.revision}`;
  }).catch(handleStorageError);
}

function handleStorageError(error: unknown) {
  el("save").textContent = error instanceof Error ? error.message : "存档失败，稍后可重试。";
  if (error instanceof StaleM2Checkpoint) releaseWriter?.();
}

el("pause").onclick = () => {
  if (!writable() || !run) return;
  tickClock();
  run.clock.paused = !run.clock.paused;
  save();
};
el("speed").onclick = () => {
  if (!writable() || !run) return;
  tickClock();
  run.clock.speed = run.clock.speed === 1 ? 4 : 1;
  save();
};
el("restart").onclick = () => {
  if (!writer || !head || busy || !confirm("重新开局会替换当前对局。确定重开？")) return;
  tickClock();
  busy = true;
  void jobs.then(async () => {
    if (!writer || !head || !run) return;
    const latestProfile = checkpointProfile(run);
    const fresh = createMatch();
    fresh.seasons = structuredClone(latestProfile.seasons ?? emptySeasons());
    if (latestProfile.appearance) fresh.appearance = { ...latestProfile.appearance };
    head = await writer.restart(head, latestProfile, fresh);
    profile = latestProfile;
    run = fresh;
    build = undefined;
    wolfMoveId = undefined;
    pointSpell = undefined;
    scoutWard = undefined;
    artilleryTowerId = undefined;
    pendingCommand = undefined;
    pendingBuild = undefined;
    recycleConfirmation = undefined;
    el("feedback").textContent = "已重开。";
    el("save").textContent = `已保存 · 修订 ${head.revision}`;
  }).catch(handleStorageError).finally(() => {
    previousTime = performance.now();
    busy = false;
  });
};

void (async () => {
  try {
    const snapshot = await store.read();
    restore(snapshot);
    el("save").textContent = "此对局已在另一个标签页打开。等待写入权限。";
    await store.withWriter(async session => {
      restore(session.checkpoint);
      if (!session.checkpoint) {
        profile = { claims: [], ...startSeasons() };
        run = createMatch();
        head = await session.commit(undefined, checkpointProfile(run), run);
      }
      writer = session;
      previousTime = performance.now();
      el("save").textContent = `已载入 · 修订 ${head!.revision}`;
      // Keep the exclusive lock for the lifetime of this active writer.
      await new Promise<void>(resolve => {
        releaseWriter = () => {
          writer = undefined;
          releaseWriter = undefined;
          resolve();
        };
        window.addEventListener("pagehide", releaseWriter, { once: true });
      });
    });
  } catch (error) {
    handleStorageError(error);
  }
})();
window.addEventListener("pageshow", event => {
  if (event.persisted) location.reload();
});

let animationFrame: number | undefined;
let backgroundTimer: number | undefined;

function scheduleFrame() {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  if (backgroundTimer !== undefined) window.clearTimeout(backgroundTimer);
  animationFrame = undefined;
  backgroundTimer = undefined;
  if (document.hidden) backgroundTimer = window.setTimeout(frame, 125);
  else animationFrame = requestAnimationFrame(frame);
}

function frame() {
  tickClock();
  if (writer && run && !busy && compatibleMap()) {
    const before = Object.keys(run.commandResults).length;
    const phase = run.phase;
    const wave = run.wave;
    const constructions = run.structures.filter(tower => tower.pending).length;
    const seasonRevision = run.seasonRevision;
    const workerCommand = run.approach?.command.id;
    const deadline = performance.now() + 7;
    drain(run, 32_000, () => performance.now() >= deadline);
    const results = run.commandResults;
    const completed = [...new Set([workerCommand, pendingBuild?.commandId, pendingCommand])].filter(
      (id): id is string => id !== undefined && Object.hasOwn(results, id));
    if (completed.length) {
      const outcomes = completed.map(id => results[id]);
      el("feedback").textContent = outcomes.map(outcome => {
        if (!outcome.ok) return rejection[outcome.reason];
        const result = outcome.divineBook;
        if (result === "ineligible") return "目标的神能形态不符合条件，道具已返还。";
        if (result === "max-stars") return "神能已达十星，道具已返还。";
        if (result === "failed") return "神能升星失败，已消耗充能。";
        return result ? `神能 ${result.id} · ${result.stars} 星` : "操作已执行。";
      }).join(" ");
      if (pendingBuild && completed.includes(pendingBuild.commandId)) {
        if (run.commandResults[pendingBuild.commandId].ok && pendingBuild.key === build?.key) build = undefined;
        pendingBuild = undefined;
      }
      if (pendingCommand && completed.includes(pendingCommand)) pendingCommand = undefined;
    }
    if (run.phase !== phase || run.wave !== wave || run.seasonRevision !== seasonRevision || Object.keys(run.commandResults).length !== before ||
      run.structures.filter(tower => tower.pending).length !== constructions ||
      (run.phase === "running" && performance.now() - lastSave >= configuration.persistence.autosaveRealSeconds * 1000)) save();
  }
  if (run) {
    const seconds = Math.floor(run.queue.nowUs / 1_000_000);
    const timer = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const result = run.phase === "failed" ? " · 容怪超限" : run.result?.reason === "boss-killed" ? " · 已击杀肉山" :
      run.phase === "won" ? " · 超时结算" : "";
    el("resources").textContent = `${run.gold} 金 · ${run.lumber} 木 · 人口 ${run.population}/${run.populationLimit} · 积分 ${profile.score + (run.seasonScore ?? 0) + (run.challengeScore ?? 0)}${run.killScore ? `（结算 +${run.killScore}）` : ""}`;
    el("wave").textContent = run.wave === 0
      ? `${timer} · 首波将在 ${Math.max(0, Math.ceil((waves[0].startUs - run.queue.nowUs) / 1_000_000))} 秒后出怪`
      : `${timer} · 第 ${run.wave}/55 波 · 容怪 ${containmentPoints(run)}/100 · 击杀 ${run.kills ?? 0}${result}`;
    const latestHit = run.recentHits?.at(-1);
    const hitStatus = el("last-hit");
    hitStatus.hidden = latestHit === undefined;
    if (latestHit) {
      const source = [...run.structures, ...(run.summons ?? [])].find(tower => tower.id === latestHit.casterId);
      hitStatus.textContent = `${source ? structureName(source.templateId) : latestHit.sourceTemplate ?? "己方塔"} 命中 · ${Math.round(latestHit.amount * 10) / 10} 伤害`;
    }
    const boss = run.enemies.find(enemy => enemy.unitId === "mBOS");
    el("boss").textContent = boss && run.bossDeadlineUs !== null
      ? `肉山 ${Math.ceil(boss.hp).toLocaleString("zh-CN")} 生命 · 剩余 ${Math.ceil((run.bossDeadlineUs - run.queue.nowUs) / 1_000_000)} 秒` : "";
    const benefit = run.lastWorkerBenefit;
    const label = el("worker-benefit-result");
    label.textContent = benefit && run.queue.nowUs - benefit.atUs < 8_000_000 ?
      `${benefit.source === "J006" ? "自动发放福利" : "领取福利"} · +${benefit.amount} 金` : "";
    el("pause").textContent = run.clock.paused ? "继续" : "暂停";
    el("speed").textContent = `${run.clock.speed}×`;
  }
  const selectedBuild = build?.action;
  if (selectedBuild?.type === "build-card" &&
      !run?.cards.some(card => card.id === selectedBuild.cardId && card.slot !== null)) build = undefined;
  if (pointSpell && !run?.structures.some(tower =>
    tower.id === pointSpell?.towerId && !tower.pending && tower.hero?.ranks[pointSpell.skillId])) pointSpell = undefined;
  if (scoutWard && (!run?.inventory?.some(item => item.id === scoutWard?.itemId && item.towerId === scoutWard?.towerId && item.slot !== null) ||
    !run.structures.some(tower => tower.id === scoutWard?.towerId && !tower.pending))) scoutWard = undefined;
  if (!writable() || !run?.summons?.some(unit => unit.id === wolfMoveId && unit.summon?.independent)) wolfMoveId = undefined;
  if (!writable() || !run?.structures.some(tower => tower.id === artilleryTowerId && !tower.pending)) artilleryTowerId = undefined;
  showControls();
  const choosingPoint = wolfMoveId !== undefined || Boolean(pointSpell) || Boolean(scoutWard) || artilleryTowerId !== undefined;
  el("cancel-placement").hidden = !build && !choosingPoint;
  el("cancel-placement").textContent = choosingPoint ? "取消选择" : "取消放置";
  el("field").classList.toggle("placing", !!build || choosingPoint);
  if (!document.hidden) draw?.(compatibleMap() ? run : undefined, writable() ? build : undefined, wolfMoveId,
    artilleryTowerId !== undefined ? "炮击地面 · 左键选择落点，Esc 取消" : pointSpell ? `${pointSpell.label} · 左键选择施法地点，Esc 取消` :
    scoutWard?.mode === "scout" ? "侦查守卫 · 左键选择英雄 500 范围内的位置，Esc 取消" :
    scoutWard?.mode === "snow" ? "落雪 · 左键选择施法地点，Esc 取消" : undefined);
  commandUI.update(compatibleMap() ? run : undefined);
  scheduleFrame();
}
document.addEventListener("visibilitychange", scheduleFrame);
document.addEventListener("resume", frame);
scheduleFrame();
