import type { OverBudgetSlice, SimulationInput, SimulationOutput } from "./m2-simulation-protocol.ts";
import { createCommandUI } from "./m2-command.ts";
import { prependOriginalIcon, setCommandIcon } from "./m2-icons.ts";
import { isDivineBook } from "./game/m2/divine.ts";
import { appearanceChoice, appearanceChoices, appearanceSlots, appearanceUnlocked, type Appearance, type AppearanceSlot } from "./game/m2/appearance.ts";
import { configuration, cardTemplates, directBuilds, firelordSkin, itemFields, items, openingChoices, ordinaryGoods, prayerBooks, qualificationChains, towerLevels, waveRewards, workerTowers } from "./game/m2/content.ts";
import { alchemistForms, dragonForms, lycanFormRanks } from "./game/m2/content.ts";
import { weapons } from "./game/m2/combat.ts";
import { activeHeroSkill, artilleryItems, attackOrb, bearAbilities, bloodlustTargets, canChooseOpening, canMoveItem, circleId, containmentPoints, controlEquipmentTargets, flameArrowTargets, heroAllySpellTargets, heroSkins, heroSpellTargets, inspectBuildPlacement, isActiveTowerEquipment, isKnowledgeBook, isTargetedEquipment, creditTime, doomAbilities, drain, enqueue, eventInProgress, newMatch, purgeTargets, qualified, restoreHeroState, spendableScore, towerSpellTargets, transmuteTargets, usableWorkerItem, wolfTargets, type Action, type Match } from "./game/m2/match.ts";
import { createM3SaveStore, StaleM3Checkpoint, withM2Archive, type Checkpoint } from "./game/m2/save.ts";
import { learnableSkills, learningLevel } from "./game/m2/hero.ts";
import { talentChoices, talentRules } from "./game/m2/talents.ts";
import { challengeTemplates } from "./game/m2/shops.ts";
import { heroExchangeOffers, mallHeroLimit } from "./game/m2/hero-exchange.ts";
import { eventBoxes, eventBoxCost, eventBoxOffers } from "./game/m2/event-boxes.ts";
import { emptySeasons, seasonDefinitions, seasonNames, startSeasons, type Seasons } from "./game/m2/seasons.ts";
import { pointTowerSpell, towerSpells } from "./game/m2/tower-spells.ts";
import { heroAutoCastOrder, heroSpellTargetMode, isCastableHeroSkill, type HeroSpell } from "./game/m2/hero-spells.ts";
import { waves } from "./game/m2/waves.ts";
import { mapVersion } from "./game/m2/map.ts";
import { createM2Scene } from "./m2-scene.ts";
import "./m2.css";

type Profile = { score: number; claims: string[]; seasons?: Seasons; enabledSkins?: string[]; appearance?: Appearance; activityScore?: number; fragments?: number; openGiftNum?: number };
type Saved = Checkpoint<Profile, Match>;
type Head = Pick<Saved, "revision" | "activeMatchId">;
type Placement = Extract<Action, { type: "build-worker-tower" | "build-card" }>;
type Build = { key: string; label: string; action: Omit<Extract<Placement, { type: "build-worker-tower" }>, "point"> |
  Omit<Extract<Placement, { type: "build-card" }>, "point"> };

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function showText(element: HTMLElement, text: string) {
  if (element.textContent !== text) element.textContent = text;
}
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
    [value.activityScore, value.fragments, value.openGiftNum].every(amount => amount === undefined || nonnegativeInteger(amount)) &&
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
  return validArtilleryTarget(attack.artillery) && (attack.flakToken === undefined || nonnegativeInteger(attack.flakToken)) &&
    (timing === undefined || record(timing) && timing.version === 1 &&
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
    "untouchable-carrier-expire",
    "impale-lift", "lion-hex-tail", "lion-carrier-expire",
    "pit-pulse", "firestorm-impact", "firestorm-projectile", "firestorm-burn", "pit-net-end", "death-aura-end",
    "tide-wave-expire", "morph-shift", "morph-bolt",
    "wild-axes", "boar-venom-end", "world-night-change", "dark-ascension-end", "void-slow", "void-carrier-expire", "void-slow-end",
    "tide-projectile", "tide-carrier-expire", "tide-corrosion-end", "ravage-step", "vacuum-tick", "vacuum-carrier-expire", "ion-shell-tick", "replica-expire",
    "razor-plasma", "razor-static-tick", "razor-static-end", "razor-storm-shot", "razor-storm-impact",
    "magnus-push", "empower-end", "magnus-carrier-expire", "illuminate-timeout", "spirit-wave", "illuminate-blind-end",
    "searing-chains", "searing-chains-release", "flame-guard", "sleight-of-fist",
    "quill-layers-end", "bristle-goo-armor-end", "bristle-goo-slow-end", "bristle-goo-carrier-end", "bristle-goo-projectile",
    "fatal-bonds-expire", "fatal-bonds-carrier-expire", "upheaval-progress", "upheaval-expire", "infernal-land", "infernal-immolation",
    "oracle-flame-end", "oracle-edict-end", "oracle-promise", "oracle-purge-step", "oracle-pause-end", "oracle-carrier-expire",
    "alchemist-restore-range", "alchemist-end", "lycan-restore-range", "lycan-end", "acid-cloud-tick", "acid-cloud-end", "goblin-greed-end",
    "focus-restore", "focus-carrier-expire", "shackle-projectile", "phantom-spear", "phantom-slow-end", "phantom-illusion",
    "nether-blast", "decrepify-end", "life-drain-tick",
    "march-robot-launch", "rearm-finish",
    "bounty-projectile", "bounty-mark-end", "bounty-armor-end", "shadow-wind-boundary", "bounty-track-scan", "shadow-wind-expire",
    "cask-projectile", "witch-curse", "death-ward-area",
    "burning-spear", "berserker-blood", "inner-vitality", "life-break-slow-end",
    "dragon-restore-range", "dragon-end", "dragon-imprint", "dragon-imprint-end", "barrage-launch", "barrage-rocket", "flak-end",
    "calldown", "calldown-damage", "calldown-slow-end", "calldown-carrier-expire", "arcane-poison-end", "astral-intelligence-end",
    "duel-projectile", "duel-observe", "duel-unlock", "exorcism", "mana-counter-expire", "mana-void-projectile", "torrent-step", "tidebringer-ready", "fleet-release", "fleet-expire",
    "movement", "move-route", "worker-benefit", "start-wave", "spawn", "stop-wave", "welfare-spawn", "welfare-end",
    "divine-effect-end", "hero-spell-end", "spell-immunity-expire", "accuracy-expire", "jingu-expire", "jingu-hammer", "wraith-projectile", "native-slow-scan", "boulder-projectile", "bloodlust-scan", "ogre-repeat", "ogre-projectile", "nova-tick", "dark-pact-start", "dark-pact-tick", "essence-expire", "freezing-pulse", "freezing-end", "freezing-scepter", "storm-hammer", "requiem-carrier-expire", "wisp-link-tick", "wisp-overload-tick", "wisp-relocate", "zeus-cloud", "zeus-wrath-rebate", "spectre-refraction", "prophet-teleport", "death-pulse", "heartstopper-tick", "stone-gaze-end", "blade-storm-tick", "blade-storm-end", "eclipse-tick", "eclipse-end", "eclipse-hammer", "omnislash-tick", "omnislash-end", "bear-update", "bear-form-end", "bear-cast", "fury-swipes-end", "ursa-carrier-expire", "bear-frenzy-end", "doom-digest", "doom-retry", "doom-scorch", "doom-curse", "doom-blink", "doom-infernal", "coup-carrier-expire",
    "doom-projectile", "doom-poison-cast", "doom-poison", "doom-frost", "doom-frost-hit", "doom-drain", "doom-drain-end", "axe-bleed-impact", "axe-bleed-tick", "axe-cull-rebate", "soul-burn-end", "soul-burn-focus", "weapon-backswing-end", "weapon-rate-end", "equipment-volley", "ice-path-impact", "auto-control-equipment", "equipment-hex-end",
    "boss-timeout", "command", "finish-construction", "commit-talent", "challenge-spawn", "weapon-fire", "weapon-ready", "weapon-impact", "spawn-rune", "demonflame", "scepter-swap", "hero-spell", "tower-spell", "sword-rain-emit", "sword-rain-travel", "spell-sweep", "contract-expire", "magic-arrow", "magic-arrow-restore", "hero-leash", "summon-expire", "detector-expire", "mana-debt", "spell-zones", "equipment-snow", "equipment-seal-end", "equipment-doom-impact", "equipment-hex-damage", "equipment-frost", "equipment-lightning", "equipment-burn", "immolation", "disease-tick", "poison-tick", "equipment-teleport", "frost-expire", "avalanche", "stun-expire", "tree-grab-expire", "enemy-cast", "enemy-speed-expire", "enemy-summon-expire", "enemy-form-end", "enemy-egg-end",
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
    (value.scoreHeroClaimed === undefined || value.scoreHeroClaimed === true) &&
    (value.mallHeroClaims === undefined || Array.isArray(value.mallHeroClaims) && value.mallHeroClaims.length <= 2 &&
      new Set(value.mallHeroClaims).size === value.mallHeroClaims.length &&
      value.mallHeroClaims.every(id => typeof id === "string" && /^i54[5789]$/.test(id))) &&
    [value.activityScore, value.fragments, value.eventScore, value.startingScore, value.spentScore].every(amount => amount === undefined || nonnegativeInteger(amount)) &&
    (value.bladeStorms === undefined || record(value.bladeStorms) && Object.values(value.bladeStorms).every(storm =>
      record(storm) && point(storm) && [storm.towerId, storm.untilUs, storm.raw].every(nonnegativeInteger))) &&
    (value.movementAnchorUs === undefined || nonnegativeInteger(value.movementAnchorUs)) &&
    (value.worldNight === undefined || typeof value.worldNight === "boolean") &&
    (value.wildAxes === undefined || record(value.wildAxes) && Object.values(value.wildAxes).every(cast =>
      record(cast) && [cast.towerId, cast.step, cast.timerId].every(nonnegativeInteger) && point(cast.crossing) &&
      Array.isArray(cast.turns) && cast.turns.length === 2 && cast.turns.every(point) &&
      Array.isArray(cast.axes) && cast.axes.length === 2 && cast.axes.every(axe => record(axe) && point(axe) &&
        nonnegativeInteger(axe.id) && Array.isArray(axe.hit) && axe.hit.every(nonnegativeInteger)))) &&
    (value.ionShells === undefined || record(value.ionShells) && Object.values(value.ionShells).every(shell =>
      record(shell) && [shell.towerId, shell.timerId, shell.remaining].every(nonnegativeInteger) &&
      finite(shell.amount) && (shell.corpsePoint === undefined || point(shell.corpsePoint)))) &&
    (value.razorStorms === undefined || record(value.razorStorms) && Object.values(value.razorStorms).every(storm =>
      record(storm) && point(storm) && [storm.id, storm.towerId, storm.intervalUs, storm.untilUs, storm.inFlight].every(nonnegativeInteger) &&
      (storm.targetId === undefined || nonnegativeInteger(storm.targetId)))) &&
    (value.shadowWindAuras === undefined || record(value.shadowWindAuras) && Object.values(value.shadowWindAuras).every(aura =>
      point(aura) && record(aura) && nonnegativeInteger(aura.untilUs))) &&
    (value.fatalBonds === undefined || record(value.fatalBonds) && Object.values(value.fatalBonds).every(group =>
      record(group) && nonnegativeInteger(group.untilUs) && Array.isArray(group.members) && group.members.every(nonnegativeInteger))) &&
    (value.fatalBondsCarrier === undefined || record(value.fatalBondsCarrier) && point(value.fatalBondsCarrier) &&
      [value.fatalBondsCarrier.id, value.fatalBondsCarrier.untilUs].every(nonnegativeInteger)) &&
    (value.upheavalAuras === undefined || record(value.upheavalAuras) && Object.values(value.upheavalAuras).every(aura =>
      record(aura) && point(aura) && [aura.towerId, aura.untilUs, aura.rank, aura.stage].every(nonnegativeInteger) &&
      (aura.visual === "q040" || aura.visual === "q044") && (aura.progressTimer === undefined || nonnegativeInteger(aura.progressTimer)))) &&
    (value.witchCurses === undefined || record(value.witchCurses) && Object.values(value.witchCurses).every(curse =>
      record(curse) && nonnegativeInteger(curse.towerId) && finite(curse.rate) && Array.isArray(curse.targets) &&
      curse.targets.every(target => record(target) && nonnegativeInteger(target.id) && finite(target.hp)))) &&
    (value.lifeDrains === undefined || record(value.lifeDrains) && Object.values(value.lifeDrains).every(drain =>
      record(drain) && [drain.targetId, drain.timerId, drain.rank, drain.endUs].every(nonnegativeInteger) &&
      (drain.skillId === "A103" || drain.skillId === "A176") && (drain.carrier === undefined ||
        record(drain.carrier) && point(drain.carrier) && nonnegativeInteger(drain.carrier.id) && finite(drain.carrier.hp) &&
        typeof drain.carrier.active === "boolean"))) &&
    (value.dragonImprints === undefined || record(value.dragonImprints) && Object.values(value.dragonImprints).every(mark =>
      record(mark) && point(mark.point) && [mark.towerId, mark.untilUs, mark.period].every(nonnegativeInteger))) &&
    (value.acidClouds === undefined || record(value.acidClouds) && Object.values(value.acidClouds).every(cloud =>
      record(cloud) && point(cloud.point) && nonnegativeInteger(cloud.towerId) && nonnegativeInteger(cloud.rank) &&
      Number(cloud.rank) >= 1 && Number(cloud.rank) <= 6 && finite(cloud.amount))) &&
    (value.ghostFleets === undefined || record(value.ghostFleets) && Object.values(value.ghostFleets).every(fleet =>
      record(fleet) && point(fleet.source) && point(fleet.point) && nonnegativeInteger(fleet.towerId) && finite(fleet.amount) &&
      (fleet.visual === "T079" || fleet.visual === "T080") && Array.isArray(fleet.seen) && fleet.seen.every(nonnegativeInteger))) &&
    (value.freezingFields === undefined || record(value.freezingFields) &&
      Object.values(value.freezingFields).every(field => record(field) && point(field.point) &&
        [field.towerId, field.endsUs, field.rank].every(nonnegativeInteger) && Number(field.rank) >= 1 && Number(field.rank) <= 6 &&
        Array.isArray(field.carrierIds) && field.carrierIds.length === 3 && field.carrierIds.every(nonnegativeInteger))) &&
    (value.eventBoxReadyUs === undefined || record(value.eventBoxReadyUs) &&
      Object.entries(value.eventBoxReadyUs).every(([group, time]) => ["I007", "I009"].includes(group) && nonnegativeInteger(time))) &&
    (value.killScore === undefined || nonnegativeInteger(value.killScore)) &&
    (value.kills === undefined || nonnegativeInteger(value.kills)) &&
    (value.battleAnimations === undefined || Array.isArray(value.battleAnimations) && value.battleAnimations.length <= 64 &&
      value.battleAnimations.every(effect => record(effect) && point(effect) && nonnegativeInteger(effect.atUs) &&
        (effect.enemyId === undefined || nonnegativeInteger(effect.enemyId)) &&
        (effect.durationUs === undefined || nonnegativeInteger(effect.durationUs)) &&
        typeof effect.unitId === "string" && (effect.kind === "death" || effect.kind === "revive" || effect.kind === "artillery-impact" || effect.kind === "stomp-impact" ||
          effect.kind === "relocation-impact" || effect.kind === "model-effect" || effect.kind === "ice-shard" ||
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
      record(event.payload) && typeof event.payload.type === "string" && eventTypes.has(event.payload.type) &&
      (event.payload.type !== "untouchable-carrier-expire" || point(event.payload.point) &&
        [event.payload.ownerId, event.payload.targetId, event.payload.rank].every(nonnegativeInteger) &&
        Number(event.payload.rank) >= 1 && Number(event.payload.rank) <= 3 && event.periodUs === 0) &&
      (event.payload.type !== "nether-blast" || point(event.payload.point) && nonnegativeInteger(event.payload.towerId) && finite(event.payload.damage) &&
        (event.payload.visual === "WispExplode" || event.payload.visual === "PsiWave")) &&
      (event.payload.type !== "decrepify-end" || [event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "life-drain-tick" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "march-robot-launch" || point(event.payload.point) && point(event.payload.direction) &&
        [event.payload.towerId, event.payload.sourceId, event.payload.index].every(nonnegativeInteger) &&
        Number(event.payload.index) <= 143 && finite(event.payload.amount)) &&
      (event.payload.type !== "rearm-finish" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "bounty-projectile" || point(event.payload.position) && point(event.payload.source) && record(event.payload.source) &&
        [event.payload.source.id, event.payload.towerId, event.payload.targetId, event.payload.travelUs, event.payload.rank, event.payload.throwId].every(nonnegativeInteger) &&
        (event.payload.expiresUs === undefined || nonnegativeInteger(event.payload.expiresUs)) &&
        (event.payload.remaining === undefined || nonnegativeInteger(event.payload.remaining) && Number(event.payload.remaining) <= 6)) &&
      (!["bounty-mark-end", "bounty-armor-end", "shadow-wind-boundary"].includes(event.payload.type) || nonnegativeInteger(event.payload.enemyId)) &&
      (event.payload.type !== "bounty-track-scan" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "shadow-wind-expire" || nonnegativeInteger(event.payload.auraId)) &&
      (event.payload.type !== "cask-projectile" || point(event.payload.position) && point(event.payload.source) && record(event.payload.source) &&
        record(event.payload.source.cask) && [event.payload.source.id, event.payload.source.cask.castId, event.payload.source.cask.jumps,
          event.payload.towerId, event.payload.targetId, event.payload.expiresUs, event.payload.travelUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "witch-curse" || nonnegativeInteger(event.payload.curseId) && typeof event.payload.final === "boolean") &&
      (event.payload.type !== "death-ward-area" || nonnegativeInteger(event.payload.towerId) && point(event.payload.point) && finite(event.payload.amount)) &&
      (event.payload.type !== "burning-spear" || [event.payload.towerId, event.payload.targetId, event.payload.remaining].every(nonnegativeInteger) &&
        Number(event.payload.remaining) >= 1 && Number(event.payload.remaining) <= 6) &&
      (event.payload.type !== "berserker-blood" && event.payload.type !== "inner-vitality" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "life-break-slow-end" || [event.payload.targetId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (!["oracle-flame-end", "oracle-edict-end", "oracle-pause-end", "oracle-purge-step"].includes(event.payload.type) ||
        nonnegativeInteger(event.payload.enemyId)) &&
      (event.payload.type !== "oracle-pause-end" && event.payload.type !== "oracle-purge-step" || nonnegativeInteger(event.payload.untilUs)) &&
      (event.payload.type !== "oracle-purge-step" || finite(event.payload.factor)) &&
      (event.payload.type !== "oracle-promise" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "oracle-carrier-expire" ||
        [event.payload.towerId, event.payload.sourceId, event.payload.targetId, event.payload.mana].every(nonnegativeInteger)) &&
      (event.payload.type !== "quill-layers-end" && event.payload.type !== "bristle-goo-armor-end" ||
        [event.payload.enemyId, event.payload.towerId].every(nonnegativeInteger)) &&
      (event.payload.type !== "bristle-goo-slow-end" || [event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "bristle-goo-carrier-end" || point(event.payload.point) &&
        [event.payload.towerId, event.payload.sourceId, event.payload.targetId].every(nonnegativeInteger)) &&
      (event.payload.type !== "bristle-goo-projectile" || point(event.payload.position) &&
        [event.payload.sourceId, event.payload.targetId, event.payload.travelUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "bristle-goo-carrier-end" && event.payload.type !== "bristle-goo-projectile" ||
        nonnegativeInteger(event.payload.stacks) && Number(event.payload.stacks) >= 1 && Number(event.payload.stacks) <= 5) &&
      (event.payload.type !== "fatal-bonds-expire" || nonnegativeInteger(event.payload.groupId)) &&
      (event.payload.type !== "fatal-bonds-carrier-expire" || nonnegativeInteger(event.payload.carrierId)) &&
      (event.payload.type !== "upheaval-progress" && event.payload.type !== "upheaval-expire" || nonnegativeInteger(event.payload.auraId)) &&
      (event.payload.type !== "infernal-land" || [event.payload.towerId, event.payload.rank].every(nonnegativeInteger) &&
        record(event.payload.source) && point(event.payload.source) && nonnegativeInteger(event.payload.source.id)) &&
      (event.payload.type !== "infernal-immolation" || nonnegativeInteger(event.payload.unitId)) &&
      (event.payload.type !== "searing-chains" && event.payload.type !== "flame-guard" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "searing-chains-release" || [event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "sleight-of-fist" || [event.payload.towerId, event.payload.sequence].every(nonnegativeInteger)) &&
      (event.payload.type !== "magnus-push" || nonnegativeInteger(event.payload.enemyId)) &&
      (event.payload.type !== "empower-end" && event.payload.type !== "illuminate-timeout" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "magnus-carrier-expire" || [event.payload.towerId, event.payload.sourceId, event.payload.rank].every(nonnegativeInteger) &&
        (event.payload.skillId === "T205" || event.payload.skillId === "T199")) &&
      (event.payload.type !== "spirit-wave" || nonnegativeInteger(event.payload.towerId) && point(event.payload.aim)) &&
      (event.payload.type !== "illuminate-blind-end" || [event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "wild-axes" || nonnegativeInteger(event.payload.castId)) &&
      (event.payload.type !== "boar-venom-end" || [event.payload.sourceId, event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "dark-ascension-end" && event.payload.type !== "vacuum-tick" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "void-slow" || [event.payload.sourceId, event.payload.carrierTimer, event.payload.targetId].every(nonnegativeInteger)) &&
      (event.payload.type !== "void-carrier-expire" && event.payload.type !== "vacuum-carrier-expire" ||
        [event.payload.towerId, event.payload.sourceId, event.payload.targetId, event.payload.mana].every(nonnegativeInteger) && point(event.payload.point)) &&
      (event.payload.type !== "void-slow-end" && event.payload.type !== "tide-corrosion-end" ||
        [event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "morph-shift" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "morph-bolt" || record(event.payload.source) && point(event.payload.source) && point(event.payload.position) &&
        [event.payload.source.id, event.payload.towerId, event.payload.targetId, event.payload.travelUs, event.payload.expiresUs].every(nonnegativeInteger) &&
        finite(event.payload.stun)) &&
      (event.payload.type !== "tide-wave-expire" || [event.payload.sourceId, event.payload.towerId].every(nonnegativeInteger)) &&
      (event.payload.type !== "pit-pulse" || nonnegativeInteger(event.payload.towerId) &&
        (event.payload.skillId === "A233" || event.payload.skillId === "A234")) &&
      (event.payload.type !== "firestorm-impact" || point(event.payload.point) && point(event.payload.source) &&
        nonnegativeInteger(event.payload.towerId) && finite(event.payload.amount)) &&
      (event.payload.type !== "firestorm-projectile" || record(event.payload.source) && point(event.payload.source) && point(event.payload.position) &&
        [event.payload.source.id, event.payload.towerId, event.payload.targetId, event.payload.expiresUs, event.payload.travelUs, event.payload.rank].every(nonnegativeInteger)) &&
      (event.payload.type !== "firestorm-burn" || nonnegativeInteger(event.payload.enemyId)) &&
      (event.payload.type !== "pit-net-end" || [event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "death-aura-end" || [event.payload.towerId, event.payload.amount].every(nonnegativeInteger)) &&
      (event.payload.type !== "impale-lift" || [event.payload.token, event.payload.step].every(nonnegativeInteger) &&
        Array.isArray(event.payload.targets) && event.payload.targets.every(nonnegativeInteger)) &&
      (event.payload.type !== "lion-hex-tail" || nonnegativeInteger(event.payload.towerId) && point(event.payload.point)) &&
      (event.payload.type !== "lion-carrier-expire" || point(event.payload.point) &&
        [event.payload.towerId, event.payload.sourceId, event.payload.targetId, event.payload.mana].every(nonnegativeInteger) &&
        (event.payload.skillId === "T405" || event.payload.skillId === "T406")) &&
      (event.payload.type !== "replica-expire" || nonnegativeInteger(event.payload.enemyId)) &&
      (event.payload.type !== "ion-shell-tick" || nonnegativeInteger(event.payload.targetId)) &&
      (event.payload.type !== "tide-projectile" || record(event.payload.source) && point(event.payload.source) && point(event.payload.position) &&
        [event.payload.source.id, event.payload.targetId, event.payload.expiresUs, event.payload.travelUs, event.payload.rank].every(nonnegativeInteger)) &&
      (event.payload.type !== "tide-carrier-expire" || point(event.payload.point) && [event.payload.sourceId, event.payload.targetId].every(nonnegativeInteger)) &&
      (event.payload.type !== "tide-projectile" && event.payload.type !== "tide-carrier-expire" ||
        (event.payload.towerId === undefined || nonnegativeInteger(event.payload.towerId)) &&
        (event.payload.skillId === "T276" || event.payload.skillId === "T278")) &&
      (event.payload.type !== "ravage-step" || [event.payload.token, event.payload.step, event.payload.rank].every(nonnegativeInteger) &&
        Array.isArray(event.payload.targets) && event.payload.targets.every(nonnegativeInteger) &&
        Array.isArray(event.payload.stuns) && event.payload.stuns.every(nonnegativeInteger)) &&
      (event.payload.type !== "razor-plasma" || [event.payload.towerId, event.payload.tick].every(nonnegativeInteger) && finite(event.payload.amount) &&
        Array.isArray(event.payload.hit) && event.payload.hit.every(nonnegativeInteger)) &&
      (event.payload.type !== "razor-static-tick" || record(event.payload.source) && point(event.payload.source) &&
        [event.payload.source.id, event.payload.towerId, event.payload.targetId, event.payload.linkId, event.payload.remaining].every(nonnegativeInteger)) &&
      (event.payload.type !== "razor-static-end" || [event.payload.towerId, event.payload.linkId].every(nonnegativeInteger)) &&
      (event.payload.type !== "razor-storm-shot" && event.payload.type !== "razor-storm-impact" || nonnegativeInteger(event.payload.stormId)) &&
      (event.payload.type !== "razor-storm-impact" || [event.payload.targetId, event.payload.travelUs].every(nonnegativeInteger) && point(event.payload.position)) &&
      (event.payload.type !== "spell-sweep" || record(event.payload.sweep) &&
        (event.payload.sweep.lightCarrier === undefined || ["q001", "q062", "q064"].includes(String(event.payload.sweep.lightCarrier))) &&
        (event.payload.sweep.tide === undefined || record(event.payload.sweep.tide) && nonnegativeInteger(event.payload.sweep.tide.rank) &&
          (event.payload.sweep.tide.excludeId === undefined || nonnegativeInteger(event.payload.sweep.tide.excludeId)))) &&
      (!["dragon-restore-range", "dragon-end", "alchemist-restore-range", "alchemist-end", "lycan-restore-range", "lycan-end"].includes(event.payload.type) ||
        [event.payload.towerId, event.payload.formTimer].every(nonnegativeInteger)) &&
      (event.payload.type !== "acid-cloud-tick" && event.payload.type !== "acid-cloud-end" || nonnegativeInteger(event.payload.cloudId)) &&
      (event.payload.type !== "goblin-greed-end" && event.payload.type !== "focus-restore" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "focus-carrier-expire" || point(event.payload.point) &&
        [event.payload.towerId, event.payload.sourceId, event.payload.rank, event.payload.mana].every(nonnegativeInteger) &&
        ["T171", "T172", "T173", "T260", "T261"].includes(String(event.payload.skillId))) &&
      (event.payload.type !== "shackle-projectile" || point(event.payload.position) &&
        [event.payload.towerId, event.payload.targetId, event.payload.travelUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "phantom-spear" || point(event.payload.position) && point(event.payload.source) &&
        record(event.payload.source) && record(event.payload.source.spear) && [event.payload.source.id, event.payload.source.spear.castId,
          event.payload.source.spear.contacts, event.payload.towerId, event.payload.targetId, event.payload.rank,
          event.payload.expiresUs, event.payload.travelUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "phantom-slow-end" || [event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "phantom-illusion" || nonnegativeInteger(event.payload.towerId) &&
        (event.payload.kind === "spear" && nonnegativeInteger(event.payload.targetId) ||
          event.payload.kind === "parallel" && point(event.payload.point) && nonnegativeInteger(event.payload.actorId))) &&
      (event.payload.type !== "dragon-imprint" && event.payload.type !== "dragon-imprint-end" || nonnegativeInteger(event.payload.imprintId)) &&
      (event.payload.type !== "arcane-poison-end" && event.payload.type !== "calldown-slow-end" ||
        [event.payload.enemyId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "astral-intelligence-end" || [event.payload.towerId, event.payload.amount].every(nonnegativeInteger)) &&
      (event.payload.type !== "barrage-launch" || [event.payload.towerId, event.payload.remaining].every(nonnegativeInteger) && finite(event.payload.amount)) &&
      (event.payload.type !== "barrage-rocket" || point(event.payload.position) && finite(event.payload.amount) &&
        [event.payload.towerId, event.payload.targetId, event.payload.travelUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "flak-end" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "calldown" || point(event.payload.point) && nonnegativeInteger(event.payload.towerId) &&
        (event.payload.stage === "first" || event.payload.stage === "second")) &&
      (event.payload.type !== "calldown-damage" || point(event.payload.source) && record(event.payload.source) &&
        nonnegativeInteger(event.payload.source.id) && point(event.payload.point) && finite(event.payload.amount) &&
        (event.payload.sourceTemplate === "H051" || event.payload.sourceTemplate === "G080")) &&
      (event.payload.type !== "calldown-carrier-expire" ||
        [event.payload.sourceId, event.payload.towerId, event.payload.targetId, event.payload.mana].every(nonnegativeInteger) &&
        (event.payload.skillId === "T218" || event.payload.skillId === "T219")) &&
      (event.payload.type !== "exorcism" || nonnegativeInteger(event.payload.towerId) && nonnegativeInteger(event.payload.token) &&
        (event.payload.stage === "spawn" && nonnegativeInteger(event.payload.remaining) ||
          ["control", "return", "remove"].includes(String(event.payload.stage)))) &&
      (event.payload.type !== "duel-projectile" || point(event.payload.position) &&
        [event.payload.targetId, event.payload.travelUs, event.payload.expiresUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "duel-observe" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "duel-unlock" || [event.payload.targetId, event.payload.untilUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "mana-counter-expire" || [event.payload.towerId, event.payload.amount].every(nonnegativeInteger)) &&
      (event.payload.type !== "mana-void-projectile" || point(event.payload.position) &&
        [event.payload.towerId, event.payload.targetId, event.payload.travelUs].every(nonnegativeInteger)) &&
      (event.payload.type !== "torrent-step" || nonnegativeInteger(event.payload.token) &&
        nonnegativeInteger(event.payload.step) && Number(event.payload.step) <= 80 &&
        Array.isArray(event.payload.targets) && event.payload.targets.every(nonnegativeInteger)) &&
      (event.payload.type !== "tidebringer-ready" || nonnegativeInteger(event.payload.towerId)) &&
      (event.payload.type !== "fleet-release" && event.payload.type !== "fleet-expire" || nonnegativeInteger(event.payload.fleetId)) &&
      (event.payload.type !== "weapon-impact" || record(event.payload.shot) &&
        (event.payload.shot.arcaneOrbPaid === undefined || event.payload.shot.arcaneOrbPaid === true) &&
        [event.payload.shot.blademasterCritRank, event.payload.shot.coupCritRank, event.payload.shot.moonGlaiveRank].every(rank =>
          rank === undefined || nonnegativeInteger(rank) && Number(rank) <= 6) &&
        (event.payload.shot.doomCritRank === undefined || nonnegativeInteger(event.payload.shot.doomCritRank) &&
          Number(event.payload.shot.doomCritRank) <= 4) &&
        (event.payload.shot.bounce === undefined || record(event.payload.shot.bounce) &&
          nonnegativeInteger(event.payload.shot.bounce.remaining) && Number(event.payload.shot.bounce.remaining) <= 4 &&
          Array.isArray(event.payload.shot.bounce.visited) && event.payload.shot.bounce.visited.length >= 2 &&
          event.payload.shot.bounce.visited.length <= 6 && event.payload.shot.bounce.visited.every(nonnegativeInteger) &&
          new Set(event.payload.shot.bounce.visited).size === event.payload.shot.bounce.visited.length &&
          event.payload.shot.bounce.visited.includes(event.payload.shot.targetId)))) &&
    typeof clock.targetUs === "number" && nonnegativeInteger(clock.targetUs) && clock.targetUs >= queue.nowUs &&
    typeof clock.fractionUs === "number" && clock.fractionUs >= 0 && clock.fractionUs < 1 &&
    (clock.speed === 1 || clock.speed === 4) && typeof clock.paused === "boolean" &&
    [value.seed, value.randomState, value.wave, value.batch, value.totalArrivals, value.nextId,
      value.gold, value.lumber, value.population, value.populationLimit, value.luckLevel].every(nonnegativeInteger) &&
    Array.isArray(value.openingCandidates) && value.openingCandidates.length === 4 &&
    new Set(value.openingCandidates).size === 4 &&
    value.openingCandidates.every(card => typeof card === "string" && openingChoices.includes(card)) &&
    (value.openingCard === null || typeof value.openingCard === "string" && value.openingCandidates.includes(value.openingCard)) &&
    Array.isArray(value.enemies) && value.enemies.every(enemy => record(enemy) && point(enemy) &&
      nonnegativeInteger(enemy.id) &&
      (enemy.oracleFlame === undefined || record(enemy.oracleFlame) &&
        [enemy.oracleFlame.timerId, enemy.oracleFlame.stacks].every(nonnegativeInteger)) &&
      (enemy.oracleEdict === undefined || record(enemy.oracleEdict) && nonnegativeInteger(enemy.oracleEdict.timerId)) &&
      (enemy.oraclePauseUntilUs === undefined || nonnegativeInteger(enemy.oraclePauseUntilUs)) &&
      (enemy.searingChainsUntilUs === undefined || nonnegativeInteger(enemy.searingChainsUntilUs)) &&
      (enemy.voidSlowUntilUs === undefined || nonnegativeInteger(enemy.voidSlowUntilUs)) &&
      (enemy.pitNetUntilUs === undefined || nonnegativeInteger(enemy.pitNetUntilUs)) &&
      (enemy.firestormBurn === undefined || record(enemy.firestormBurn) && record(enemy.firestormBurn.source) && point(enemy.firestormBurn.source) &&
        [enemy.firestormBurn.source.id, enemy.firestormBurn.towerId, enemy.firestormBurn.rank, enemy.firestormBurn.untilUs,
          enemy.firestormBurn.nextUs, enemy.firestormBurn.timerId].every(nonnegativeInteger)) &&
      (enemy.replica === undefined || enemy.replica === true) && (enemy.overdraftLife === undefined || finite(enemy.overdraftLife)) &&
      (enemy.hexForm === undefined || ["nsno", "npig", "nsea", "ncrb", "nhmc", "nrat", "nfro", "necr", "nrac", "nsha", "nshw"].includes(String(enemy.hexForm))) &&
      (enemy.tideCorrosion === undefined || record(enemy.tideCorrosion) && finite(enemy.tideCorrosion.armor) && nonnegativeInteger(enemy.tideCorrosion.untilUs)) &&
      (enemy.ravageLift === undefined || record(enemy.ravageLift) && [enemy.ravageLift.token, enemy.ravageLift.height].every(nonnegativeInteger)) &&
      (enemy.impaleLift === undefined || record(enemy.impaleLift) && [enemy.impaleLift.token, enemy.impaleLift.height].every(nonnegativeInteger)) &&
      (enemy.boarVenom === undefined || record(enemy.boarVenom) && Object.values(enemy.boarVenom).every(mark =>
        record(mark) && nonnegativeInteger(mark.untilUs) && finite(mark.rate))) &&
      (enemy.illuminateBlindUntilUs === undefined || nonnegativeInteger(enemy.illuminateBlindUntilUs)) &&
      (enemy.magnusPush === undefined || record(enemy.magnusPush) && finite(enemy.magnusPush.dx) && finite(enemy.magnusPush.dy) &&
        [enemy.magnusPush.timerId, enemy.magnusPush.remaining].every(nonnegativeInteger)) &&
      (enemy.upheavalSlow === undefined || finite(enemy.upheavalSlow)) &&
      (enemy.quills === undefined || record(enemy.quills) && Object.values(enemy.quills).every(layer => record(layer) &&
        nonnegativeInteger(layer.timerId) && nonnegativeInteger(layer.stacks) && Number(layer.stacks) >= 1 && Number(layer.stacks) <= 12)) &&
      (enemy.bristleGoo === undefined || record(enemy.bristleGoo) && Object.entries(enemy.bristleGoo).every(([sourceId, mark]) =>
        /^\d+$/.test(sourceId) && nonnegativeInteger(Number(sourceId)) && record(mark) &&
        nonnegativeInteger(mark.timerId) && nonnegativeInteger(mark.stacks) && Number(mark.stacks) >= 1 && Number(mark.stacks) <= 5)) &&
      (enemy.bristleGooArmor === undefined || record(enemy.bristleGooArmor) &&
        [enemy.bristleGooArmor.level, enemy.bristleGooArmor.value].every(nonnegativeInteger) &&
        Number(enemy.bristleGooArmor.level) >= 1 && Number(enemy.bristleGooArmor.level) <= 26 &&
        Number(enemy.bristleGooArmor.value) >= 5 && Number(enemy.bristleGooArmor.value) <= 100) &&
      (enemy.bristleGooSlow === undefined || record(enemy.bristleGooSlow) &&
        nonnegativeInteger(enemy.bristleGooSlow.untilUs) && finite(enemy.bristleGooSlow.factor) &&
        [.60, .68, .76, .84, .92].includes(Number(enemy.bristleGooSlow.factor))) &&
      (enemy.phantomSlow === undefined || record(enemy.phantomSlow) &&
        nonnegativeInteger(enemy.phantomSlow.untilUs) && finite(enemy.phantomSlow.attackPenalty)) &&
      (enemy.decrepifyUntilUs === undefined || nonnegativeInteger(enemy.decrepifyUntilUs)) &&
      (enemy.bountyMark === undefined || record(enemy.bountyMark) && [enemy.bountyMark.towerId, enemy.bountyMark.timerId].every(nonnegativeInteger)) &&
      (enemy.bountyArmor === undefined || record(enemy.bountyArmor) && finite(enemy.bountyArmor.amount) &&
        [enemy.bountyArmor.untilUs, enemy.bountyArmor.timerId].every(nonnegativeInteger)) &&
      (enemy.shadowWindTimer === undefined || nonnegativeInteger(enemy.shadowWindTimer)) &&
      (enemy.shadowWindSlow === undefined || enemy.shadowWindSlow === true) &&
      (enemy.lifeBreakSlowUs === undefined || nonnegativeInteger(enemy.lifeBreakSlowUs)) &&
      (enemy.nativeSlow === undefined || record(enemy.nativeSlow) &&
        nonnegativeInteger(enemy.nativeSlow.untilUs) && finite(enemy.nativeSlow.factor) && finite(enemy.nativeSlow.attackPenalty)) &&
      (enemy.lichChainSlow === undefined || record(enemy.lichChainSlow) &&
        nonnegativeInteger(enemy.lichChainSlow.untilUs) && finite(enemy.lichChainSlow.factor) && finite(enemy.lichChainSlow.attackPenalty)) &&
      (enemy.arcanePoisonUntilUs === undefined || nonnegativeInteger(enemy.arcanePoisonUntilUs)) &&
      (enemy.calldownSlow === undefined || record(enemy.calldownSlow) && finite(enemy.calldownSlow.factor) && nonnegativeInteger(enemy.calldownSlow.untilUs)) &&
      (enemy.dragonFrost === undefined || record(enemy.dragonFrost) &&
        finite(enemy.dragonFrost.factor) && finite(enemy.dragonFrost.attackPenalty) && nonnegativeInteger(enemy.dragonFrost.expiresUs)) &&
      (enemy.torrentLift === undefined || record(enemy.torrentLift) &&
        [enemy.torrentLift.token, enemy.torrentLift.height].every(nonnegativeInteger)) &&
      (enemy.axeBleed === undefined || record(enemy.axeBleed) &&
        nonnegativeInteger(enemy.axeBleed.sourceId) && nonnegativeInteger(enemy.axeBleed.untilUs)) &&
      [enemy.bearRootUntilUs, enemy.bearRootLockUntilUs, enemy.bearRoarUntilUs, enemy.stormHammerMarkUntilUs].every(value => value === undefined || nonnegativeInteger(value)) &&
      [enemy.doomRoarUntilUs, enemy.doomFrostUntilUs, enemy.duelLockUntilUs].every(entry => entry === undefined || nonnegativeInteger(entry)) &&
      (enemy.routeSpan === undefined || record(enemy.routeSpan) && point(enemy.routeSpan.from) && point(enemy.routeSpan.to) &&
        [enemy.routeSpan.fromUs, enemy.routeSpan.untilUs].every(nonnegativeInteger) && finite(enemy.routeSpan.rate) &&
        (enemy.routeSpan.endsAt === undefined || enemy.routeSpan.endsAt === "corner" || nonnegativeInteger(enemy.routeSpan.endsAt)) &&
        (enemy.routeSpan.timerId === undefined || nonnegativeInteger(enemy.routeSpan.timerId)) &&
        (enemy.routeSpan.phased === undefined || enemy.routeSpan.phased === true)) &&
      (enemy.stoneGaze === undefined || record(enemy.stoneGaze) &&
        typeof enemy.stoneGaze.paused === "boolean" && record(enemy.stoneGaze.timers) &&
        Object.values(enemy.stoneGaze.timers).every(nonnegativeInteger) &&
        (enemy.stoneGaze.frozenFrameUs === undefined || nonnegativeInteger(enemy.stoneGaze.frozenFrameUs)) &&
        (enemy.stoneGaze.crystalline === undefined || typeof enemy.stoneGaze.crystalline === "boolean")) &&
      (enemy.doomPoison === undefined || record(enemy.doomPoison) && Object.values(enemy.doomPoison).every(nonnegativeInteger)) &&
      (enemy.doomWave === undefined || record(enemy.doomWave) && finite(enemy.doomWave.amount) && nonnegativeInteger(enemy.doomWave.untilUs)) &&
      (enemy.doomTrack === undefined || record(enemy.doomTrack) &&
        [enemy.doomTrack.casterId, enemy.doomTrack.amount, enemy.doomTrack.untilUs].every(nonnegativeInteger)) &&
      (enemy.doomWeave === undefined || record(enemy.doomWeave) &&
        nonnegativeInteger(enemy.doomWeave.untilUs) && finite(enemy.doomWeave.amount)) &&
      (enemy.doomCurse === undefined || record(enemy.doomCurse) &&
        [enemy.doomCurse.token, enemy.doomCurse.untilUs].every(nonnegativeInteger) && Array.isArray(enemy.doomCurse.suppressed) && enemy.doomCurse.suppressed.every(id => typeof id === "string")) &&
      (enemy.iceBindingUntilUs === undefined || nonnegativeInteger(enemy.iceBindingUntilUs)) &&
      (enemy.freezingFieldSlow === undefined || enemy.freezingFieldSlow === true) &&
      (enemy.wraithMarkUntilUs === undefined || nonnegativeInteger(enemy.wraithMarkUntilUs)) &&
      (enemy.soulBurn === undefined || record(enemy.soulBurn) &&
        [enemy.soulBurn.timerId, enemy.soulBurn.untilUs, enemy.soulBurn.casterId].every(nonnegativeInteger) &&
        typeof enemy.soulBurn.casterTemplate === "string" && point(enemy.soulBurn.casterPoint) &&
        (enemy.soulBurn.itemId === "i224" || enemy.soulBurn.itemId === "i226") && finite(enemy.soulBurn.total) &&
        (enemy.soulBurn.dispelled === undefined || enemy.soulBurn.dispelled === true)) &&
      (enemy.nativeCorrosion === undefined || record(enemy.nativeCorrosion) &&
        [10, 25, 40].includes(Number(enemy.nativeCorrosion.value)) && nonnegativeInteger(enemy.nativeCorrosion.untilUs)) &&
      (enemy.poisonAttackSlow === undefined || record(enemy.poisonAttackSlow) &&
        finite(enemy.poisonAttackSlow.amount) && nonnegativeInteger(enemy.poisonAttackSlow.expiresUs)) &&
      (enemy.poison === undefined || record(enemy.poison) &&
        Object.entries(enemy.poison).every(([source, poison]) => /^\d+$/.test(source) && record(poison) &&
          ["N093", "N095", "A011", "A012"].includes(String(poison.skillId)) &&
          nonnegativeInteger(poison.expiresUs) && nonnegativeInteger(poison.nextUs))) &&
      (enemy.diseaseClouds === undefined || record(enemy.diseaseClouds) &&
        Object.entries(enemy.diseaseClouds).every(([source, cloud]) => /^\d+$/.test(source) && record(cloud) &&
          nonnegativeInteger(cloud.expiresUs) && nonnegativeInteger(cloud.nextUs))) && finite(enemy.speed) && finite(enemy.radius) && Array.isArray(enemy.initialOverlaps)) &&
    Array.isArray(value.structures) && value.structures.every(tower => record(tower) && point(tower) &&
      nonnegativeInteger(tower.id) && typeof tower.templateId === "string" && towerLevels.has(tower.templateId) &&
      (tower.autoModes === undefined || record(tower.autoModes) && Object.values(tower.autoModes).every(value => typeof value === "boolean")) &&
      (tower.focusTarget === undefined || nonnegativeInteger(tower.focusTarget)) &&
      validWeaponTiming(tower.attack) && validArtilleryTarget(tower.artilleryOrder) &&
      (tower.scepterWard === undefined || typeof tower.scepterWard === "boolean") &&
      (tower.hero === undefined || validHero(tower.hero)) &&
      [tower.bountyTrackTimer, tower.bountyTrackingGold, tower.deathWardId, tower.rearmTimer].every(entry => entry === undefined || nonnegativeInteger(entry)) &&
      (tower.berserkerBlood === undefined || record(tower.berserkerBlood) &&
        [tower.berserkerBlood.timerId, tower.berserkerBlood.tier].every(nonnegativeInteger) && Number(tower.berserkerBlood.tier) <= 20) &&
      (tower.innerVitality === undefined || record(tower.innerVitality) &&
        [tower.innerVitality.timerId, tower.innerVitality.remaining].every(nonnegativeInteger) && Number(tower.innerVitality.remaining) <= 8) &&
      (tower.life === undefined || record(tower.life) &&
        [tower.life.hp, tower.life.maximum, tower.life.staticMaximum, tower.life.regen].every(finite) &&
        nonnegativeInteger(tower.life.lastUs)) &&
      (tower.enrageUntilUs === undefined || nonnegativeInteger(tower.enrageUntilUs)) &&
      (tower.overpower === undefined || record(tower.overpower) &&
        [tower.overpower.untilUs, tower.overpower.sourceId, tower.overpower.rank].every(nonnegativeInteger)) &&
      (tower.furySwipes === undefined || record(tower.furySwipes) &&
        [tower.furySwipes.count, tower.furySwipes.amount, tower.furySwipes.untilUs, tower.furySwipes.timerId].every(nonnegativeInteger)) &&
      (tower.slardarScepterAura === undefined || tower.slardarScepterAura === true) &&
      [tower.doomDigestTimer, tower.doomScorchToken, tower.doomInfernalToken, tower.doomChakraTargetId].every(value => value === undefined || nonnegativeInteger(value)) &&
      (tower.doomFrost === undefined || record(tower.doomFrost) && [tower.doomFrost.token, tower.doomFrost.targetId].every(nonnegativeInteger)) &&
      (tower.doomDrain === undefined || record(tower.doomDrain) && finite(tower.doomDrain.bonus) && nonnegativeInteger(tower.doomDrain.untilUs)) &&
      (tower.doomTotem === undefined || record(tower.doomTotem) && finite(tower.doomTotem.scale) && nonnegativeInteger(tower.doomTotem.untilUs)) &&
      (tower.doomBloodlust === undefined || record(tower.doomBloodlust) &&
        nonnegativeInteger(tower.doomBloodlust.untilUs) && finite(tower.doomBloodlust.amount)) &&
      (tower.attackSpeedTrainingRank === undefined || nonnegativeInteger(tower.attackSpeedTrainingRank) && Number(tower.attackSpeedTrainingRank) <= 6) &&
      (tower.doomBorrowed === undefined || record(tower.doomBorrowed) && typeof tower.doomBorrowed.id === "string" &&
        nonnegativeInteger(tower.doomBorrowed.rank) && Number(tower.doomBorrowed.rank) <= 6) &&
      (tower.spiritBear === undefined || record(tower.spiritBear) &&
        (tower.spiritBear.id === undefined || nonnegativeInteger(tower.spiritBear.id)) &&
        (tower.spiritBear.stored === undefined || Array.isArray(tower.spiritBear.stored) && tower.spiritBear.stored.length <= 6 &&
          tower.spiritBear.stored.every(nonnegativeInteger))) &&
      (tower.souls === undefined || nonnegativeInteger(tower.souls)) &&
      (tower.requiemFollowTimer === undefined || nonnegativeInteger(tower.requiemFollowTimer)) &&
      (tower.heartstopperTimer === undefined || nonnegativeInteger(tower.heartstopperTimer)) &&
      [tower.exorcismToken, tower.pressTheAttackTarget, tower.tidebringerTimer, tower.fleetFollowId, tower.barrageTimer].every(entry => entry === undefined || nonnegativeInteger(entry)) &&
      (tower.dragonShape === undefined || record(tower.dragonShape) && dragonForms.flat().some(id => id === tower.templateId) &&
        typeof tower.dragonShape.normal === "string" && towerLevels.has(tower.dragonShape.normal) &&
        (tower.dragonShape.rangeTimerId === undefined || nonnegativeInteger(tower.dragonShape.rangeTimerId)) &&
        nonnegativeInteger(tower.dragonShape.timerId) && typeof tower.dragonShape.lance === "boolean" && Number.isSafeInteger(tower.dragonShape.rangeDelta)) &&
      (tower.alchemistShape === undefined || record(tower.alchemistShape) && alchemistForms.some(id => id === tower.templateId) &&
        typeof tower.alchemistShape.normal === "string" && towerLevels.has(tower.alchemistShape.normal) &&
        (tower.alchemistShape.rangeTimerId === undefined || nonnegativeInteger(tower.alchemistShape.rangeTimerId)) &&
        [tower.alchemistShape.timerId, tower.alchemistShape.rank].every(nonnegativeInteger) &&
        Number(tower.alchemistShape.rank) >= 1 && Number(tower.alchemistShape.rank) <= 6 &&
        typeof tower.alchemistShape.lance === "boolean" && Number.isSafeInteger(tower.alchemistShape.rangeDelta)) &&
      (tower.lycanShape === undefined || record(tower.lycanShape) && lycanFormRanks.has(String(tower.templateId)) &&
        tower.lycanShape.normal === "H043" && nonnegativeInteger(tower.lycanShape.timerId) &&
        (tower.lycanShape.rangeTimerId === undefined || nonnegativeInteger(tower.lycanShape.rangeTimerId)) &&
        typeof tower.lycanShape.lance === "boolean" && Number.isSafeInteger(tower.lycanShape.rangeDelta)) &&
      [tower.goblinGreedGold, tower.focusCycleReductionUs, tower.focusRestoreTimer, tower.focusRecoveryUntilUs].every(entry => entry === undefined || nonnegativeInteger(entry)) &&
      (tower.goblinGreed === undefined || record(tower.goblinGreed) && [tower.goblinGreed.timerId, tower.goblinGreed.accumulated].every(nonnegativeInteger)) &&
      (tower.focusFire === undefined || record(tower.focusFire) && [tower.focusFire.untilUs, tower.focusFire.sourceId, tower.focusFire.rank].every(nonnegativeInteger)) &&
      (tower.oraclePromise === undefined || record(tower.oraclePromise) &&
        [tower.oraclePromise.targetId, tower.oraclePromise.timerId, tower.oraclePromise.remaining].every(nonnegativeInteger) &&
        finite(tower.oraclePromise.initialHp) && (tower.oraclePromise.dead === undefined || tower.oraclePromise.dead === true)) &&
      (tower.upheavalId === undefined || nonnegativeInteger(tower.upheavalId)) &&
      (tower.tideWaveScepter === undefined || tower.tideWaveScepter === true) &&
      (tower.morphShift === undefined || record(tower.morphShift) &&
        (tower.morphShift.attribute === "STR" || tower.morphShift.attribute === "AGI") && nonnegativeInteger(tower.morphShift.timerId)) &&
      [tower.pit, tower.firestorm].every(area => area === undefined || record(area) && point(area) && [area.timerId, area.remaining].every(nonnegativeInteger)) &&
      (tower.deathAuraCount === undefined || nonnegativeInteger(tower.deathAuraCount)) &&
      (tower.fingerStacks === undefined || nonnegativeInteger(tower.fingerStacks) && Number(tower.fingerStacks) <= 800) &&
      (tower.fingerDisplayUntilUs === undefined || nonnegativeInteger(tower.fingerDisplayUntilUs)) &&
      (tower.fingerDisplayPoint === undefined || point(tower.fingerDisplayPoint)) &&
      (tower.razorStormUntilUs === undefined || nonnegativeInteger(tower.razorStormUntilUs)) &&
      (tower.razorStatic === undefined || record(tower.razorStatic) && finite(tower.razorStatic.attack) &&
        [tower.razorStatic.id, tower.razorStatic.untilUs].every(nonnegativeInteger)) &&
      (tower.ionShellTarget === undefined || nonnegativeInteger(tower.ionShellTarget)) &&
      (tower.vacuum === undefined || record(tower.vacuum) && point(tower.vacuum.point) &&
        [tower.vacuum.timerId, tower.vacuum.step].every(nonnegativeInteger) &&
        Array.isArray(tower.vacuum.targets) && tower.vacuum.targets.every(nonnegativeInteger)) &&
      (tower.nightHunter === undefined || record(tower.nightHunter) &&
        (tower.nightHunter.registered === undefined || tower.nightHunter.registered === true) &&
        [tower.nightHunter.attackRank, tower.nightHunter.speedRank].every(nonnegativeInteger) &&
        (tower.nightHunter.personalTimer === undefined || nonnegativeInteger(tower.nightHunter.personalTimer)) &&
        Array.isArray(tower.nightHunter.marks) && tower.nightHunter.marks.every(mark => ["T214", "T215", "T255", "T256", "T257", "T258"].includes(mark))) &&
      [tower.empowerTarget, tower.chakraTargetId, tower.chakraHasteUntilUs].every(entry => entry === undefined || nonnegativeInteger(entry)) &&
      (tower.empower === undefined || record(tower.empower) && [tower.empower.rank, tower.empower.timerId].every(nonnegativeInteger) &&
        Number(tower.empower.rank) >= 1 && Number(tower.empower.rank) <= 6) &&
      (tower.chakraToken === undefined || record(tower.chakraToken) && [tower.chakraToken.id, tower.chakraToken.untilUs].every(nonnegativeInteger)) &&
      (tower.chakraUses === undefined || record(tower.chakraUses) && Object.values(tower.chakraUses).every(nonnegativeInteger)) &&
      (tower.illuminateCharge === undefined || record(tower.illuminateCharge) && point(tower.illuminateCharge.point) &&
        point(tower.illuminateCharge.orb) && [tower.illuminateCharge.startedUs, tower.illuminateCharge.maxUs, tower.illuminateCharge.timerId].every(nonnegativeInteger)) &&
      (tower.searingChains === undefined || record(tower.searingChains) &&
        [tower.searingChains.timerId, tower.searingChains.remaining].every(nonnegativeInteger) &&
        Array.isArray(tower.searingChains.targets) && tower.searingChains.targets.length <= 6 && tower.searingChains.targets.every(nonnegativeInteger)) &&
      (tower.flameGuard === undefined || record(tower.flameGuard) && [tower.flameGuard.timerId, tower.flameGuard.remaining].every(nonnegativeInteger)) &&
      (tower.sleight === undefined || record(tower.sleight) && point(tower.sleight) &&
        [tower.sleight.next, tower.sleight.timerId].every(nonnegativeInteger) && Number.isSafeInteger(tower.sleight.cycleDeltaUs) &&
        Array.isArray(tower.sleight.targets) && tower.sleight.targets.every(nonnegativeInteger) &&
        (tower.sleight.visual === "q036" || tower.sleight.visual === "q043")) &&
      (tower.flak === undefined || record(tower.flak) && [tower.flak.timerId, tower.flak.remaining].every(nonnegativeInteger)) &&
      (tower.calldown === undefined || record(tower.calldown) && Object.values(tower.calldown).every(nonnegativeInteger)) &&
      (tower.fleetAura === undefined || record(tower.fleetAura) &&
        [tower.fleetAura.layers, tower.fleetAura.untilUs].every(nonnegativeInteger)) &&
      (tower.pressTheAttack === undefined || record(tower.pressTheAttack) && nonnegativeInteger(tower.pressTheAttack.untilUs) &&
        nonnegativeInteger(tower.pressTheAttack.rank) && Number(tower.pressTheAttack.rank) >= 1 && Number(tower.pressTheAttack.rank) <= 6) &&
      (tower.duelWins === undefined || nonnegativeInteger(tower.duelWins) && Number(tower.duelWins) <= 150) &&
      (tower.duel === undefined || record(tower.duel) && point(tower.duel.point) && typeof tower.duel.skin === "boolean" &&
        [tower.duel.targetId, tower.duel.timerId, tower.duel.untilUs].every(nonnegativeInteger) &&
        (tower.duel.dead === undefined || tower.duel.dead === true)) &&
      (tower.sadist === undefined || record(tower.sadist) && typeof tower.sadist.half === "boolean" && nonnegativeInteger(tower.sadist.gained)) &&
      (tower.prophetTeleportTimer === undefined || nonnegativeInteger(tower.prophetTeleportTimer)) &&
      (tower.eclipse === undefined || record(tower.eclipse) &&
        [tower.eclipse.periodic, tower.eclipse.end].every(nonnegativeInteger)) &&
      (tower.godsStrength === undefined || record(tower.godsStrength) &&
        [tower.godsStrength.untilUs, tower.godsStrength.rank].every(nonnegativeInteger) &&
        (tower.godsStrength.variant === "A063" || tower.godsStrength.variant === "A118")) &&
      (tower.bladeStormHasteUs === undefined || nonnegativeInteger(tower.bladeStormHasteUs)) &&
      (tower.omnislash === undefined || record(tower.omnislash) && point(tower.omnislash) &&
        ["q002", "q020", "q021"].includes(String(tower.omnislash.templateId)) &&
        [tower.omnislash.id, tower.omnislash.facing, tower.omnislash.lastAttackUs, tower.omnislash.endTimer].every(nonnegativeInteger) &&
        (tower.omnislash.repeatTimer === undefined || nonnegativeInteger(tower.omnislash.repeatTimer))) &&
      (tower.bearFormInterval === undefined || record(tower.bearFormInterval) &&
        finite(tower.bearFormInterval.seconds) && nonnegativeInteger(tower.bearFormInterval.timerId)) &&
      (tower.bearFrenzy === undefined || record(tower.bearFrenzy) &&
        finite(tower.bearFrenzy.amount) && nonnegativeInteger(tower.bearFrenzy.timerId) &&
        (tower.bearFrenzy.unitId === null || nonnegativeInteger(tower.bearFrenzy.unitId))) &&
      (tower.spectreRefraction === undefined || record(tower.spectreRefraction) &&
        [tower.spectreRefraction.timerId, tower.spectreRefraction.untilUs].every(nonnegativeInteger) &&
        finite(tower.spectreRefraction.total)) &&
      (tower.spectreDesolateReadyUs === undefined || nonnegativeInteger(tower.spectreDesolateReadyUs)) &&
      (tower.bloodlust === undefined || record(tower.bloodlust) &&
        nonnegativeInteger(tower.bloodlust.untilUs) && finite(tower.bloodlust.amount)) &&
      (tower.ogreMulticast === undefined || record(tower.ogreMulticast) &&
        [tower.ogreMulticast.count, tower.ogreMulticast.atUs].every(nonnegativeInteger)) &&
      (tower.wispLink === undefined || record(tower.wispLink) && nonnegativeInteger(tower.wispLink.targetId) &&
        nonnegativeInteger(tower.wispLink.timer) && (tower.wispLink.shared === undefined || tower.wispLink.shared === true) &&
        (tower.wispLink.boost === undefined || record(tower.wispLink.boost) &&
          ["STR", "AGI", "INT"].includes(String(tower.wispLink.boost.stat)) && nonnegativeInteger(tower.wispLink.boost.amount))) &&
      (tower.wispLinked === undefined || tower.wispLinked === true) &&
      (tower.wispOverload === undefined || record(tower.wispOverload) &&
        ["A112", "A142", "A143"].includes(String(tower.wispOverload.buff)) && nonnegativeInteger(tower.wispOverload.timer)) &&
      [tower.wispOverloadReadyUs, tower.wispRelocateTimer, tower.novaTimer, tower.freezingFieldId].every(value => value === undefined || nonnegativeInteger(value)) &&
      (tower.jingu === undefined || record(tower.jingu) && nonnegativeInteger(tower.jingu.count) &&
        [tower.jingu.rank, tower.jingu.untilUs, tower.jingu.displayUntilUs].every(value => value === undefined || nonnegativeInteger(value))) &&
      (tower.accuracy === undefined || record(tower.accuracy) && typeof tower.accuracy.templateId === "string" &&
        [tower.accuracy.attack, tower.accuracy.agility, tower.accuracy.armor, tower.accuracy.untilUs].every(nonnegativeInteger)) &&
      (tower.spellImmunity === undefined || record(tower.spellImmunity) &&
        [tower.spellImmunity.sourceId, tower.spellImmunity.carrierUntilUs, tower.spellImmunity.untilUs].every(nonnegativeInteger)) &&
      (tower.teleportReadyUs === undefined || record(tower.teleportReadyUs) &&
        Object.entries(tower.teleportReadyUs).every(([key, due]) =>
          (key === "i207" || key === "i230") && nonnegativeInteger(due))) &&
      [tower.flameTarget, tower.swordRainToken, tower.blackKingBarReadyUs, tower.teleportTimer, tower.soulBurnReadyUs, tower.mirrorReadyUs, tower.accuracyReadyUs, tower.accuracySelfUntilUs, tower.axeBloodlustUntilUs, tower.axeHelixUntilUs, tower.axeFailures, tower.axeRebateTimer].every(entry => entry === undefined || nonnegativeInteger(entry)) &&
      (tower.pending === null || record(tower.pending) && nonnegativeInteger(tower.pending.timer))) &&
    (value.summons === undefined || Array.isArray(value.summons) && value.summons.every(summon =>
      record(summon) && point(summon) && nonnegativeInteger(summon.id) && summon.pending === null &&
      validWeaponTiming(summon.attack) &&
      typeof summon.templateId === "string" && record(summon.summon) &&
      (/^(?:b10[0-9]|b110|b11[7-9]|b12[0-7]|b13[2-79]|b140|b14[4-9]|b15[0-9]|b16[0-9]|b17[0-3])$/.test(summon.templateId) ||
        /^n26[1-6]$/.test(summon.templateId) && summon.summon.skillId === "A175" ||
        /^q01[12]$/.test(summon.templateId) && record(summon.spiritOrder) && point(summon.spiritOrder.birth) &&
          [summon.spiritOrder.token, summon.spiritOrder.nextRoamUs].every(nonnegativeInteger) && typeof summon.spiritOrder.sureHit === "boolean" &&
          (summon.spiritOrder.targetId === undefined || nonnegativeInteger(summon.spiritOrder.targetId)) &&
          (summon.spiritOrder.move === undefined || record(summon.spiritOrder.move) && point(summon.spiritOrder.move.point) &&
            ["roam", "return", "retire"].includes(String(summon.spiritOrder.move.kind))) ||
        /^n25[5-9]$|^n260$/.test(summon.templateId) && record(summon.bear) &&
          finite(summon.bear.inheritedAttack) && typeof summon.bear.scepter === "boolean" &&
          (summon.bear.timerId === undefined || nonnegativeInteger(summon.bear.timerId)) &&
          record(summon.bear.gear) && Object.values(summon.bear.gear).every(amount => amount === .2 || amount === .3 || amount === .5) ||
        summon.summon.illusion === true && !!weapons[summon.templateId]?.length) && nonnegativeInteger(summon.summon.ownerId) &&
      (summon.summon.independent === undefined || summon.summon.independent === true && /^b10[3-6]$/.test(summon.templateId)) &&
      (summon.wolfOrder === undefined || summon.summon.independent === true && record(summon.wolfOrder) &&
        Array.isArray(summon.wolfOrder.path) && summon.wolfOrder.path.every(point) &&
        (summon.wolfOrder.type === "move" && point(summon.wolfOrder.point) ||
          summon.wolfOrder.type === "attack" && nonnegativeInteger(summon.wolfOrder.targetId))) &&
      (summon.walkDirection === undefined || point(summon.walkDirection)) &&
      (summon.summon.phantom === undefined || record(summon.summon.phantom) &&
        [summon.summon.phantom.forkRank, summon.summon.phantom.edgeRank].every(nonnegativeInteger) &&
        finite(summon.summon.phantom.agility) && typeof summon.summon.phantom.counted === "boolean") &&
      (summon.summon.wildHowlRank === undefined || nonnegativeInteger(summon.summon.wildHowlRank) &&
        Number(summon.summon.wildHowlRank) >= 1 && Number(summon.summon.wildHowlRank) <= 6) &&
      (summon.summon.beastmasterHasteRank === undefined || nonnegativeInteger(summon.summon.beastmasterHasteRank) &&
        Number(summon.summon.beastmasterHasteRank) >= 1 && Number(summon.summon.beastmasterHasteRank) <= 6) &&
      (summon.spawnOverlaps === undefined || Array.isArray(summon.spawnOverlaps) && summon.spawnOverlaps.every(nonnegativeInteger)) &&
      [summon.summon.attack, summon.summon.speed, summon.summon.green, summon.summon.blue].every(finite) &&
      (summon.summon.shadowDance === undefined || record(summon.summon.shadowDance) &&
        nonnegativeInteger(summon.summon.shadowDance.rank) && finite(summon.summon.shadowDance.attributes)) &&
      [summon.summon.manaBreak, summon.summon.manaCounter].every(value => value === undefined || value === true) &&
      [summon.summon.moonGlaiveRank, summon.summon.swordCleaveRank, summon.summon.output, summon.summon.damageTaken, summon.summon.criticalRank, summon.summon.spectreRank, summon.summon.overpowerRank, summon.summon.doomOverpowerRank].every(value =>
        value === undefined || finite(value) && Number(value) > 0))) &&
    (value.detectors === undefined || Array.isArray(value.detectors) && value.detectors.every(detector =>
      record(detector) && point(detector) && nonnegativeInteger(detector.id) && nonnegativeInteger(detector.ownerId) &&
      (detector.hp === undefined || finite(detector.hp) && Number(detector.hp) > 0))) &&
    Array.isArray(value.cards) && value.cards.every(card => record(card) && nonnegativeInteger(card.id) &&
      typeof card.card === "string" && cardTemplates.has(card.card) && point(card.point) &&
      finite(card.hp) && (card.bound === undefined || card.bound === true) && (card.invulnerable === undefined || card.invulnerable === true) &&
      nonnegativeInteger(card.charges) && Number(card.charges) > 0) &&
    (value.openingChoicesUnlocked === undefined || typeof value.openingChoicesUnlocked === "boolean") &&
    (value.chestReadyUs === undefined || nonnegativeInteger(value.chestReadyUs)) &&
    (value.openedChests === undefined || nonnegativeInteger(value.openedChests)) &&
    (value.inventory === undefined || Array.isArray(value.inventory) && value.inventory.every(item =>
      record(item) && nonnegativeInteger(item.id) && typeof item.itemId === "string" && (items.has(item.itemId) || eventBoxes.has(item.itemId)) &&
      (item.slot === null || nonnegativeInteger(item.slot) && Number(item.slot) < 6) &&
      (item.towerId === undefined || item.slot !== null && (item.towerId === circleId ||
        (value.structures as Array<{ id: number }>).some(tower => tower.id === item.towerId) ||
        Array.isArray(value.summons) && value.summons.some(unit => unit.id === item.towerId && unit.bear))) &&
      (item.invulnerable === undefined || item.invulnerable === true) &&
      (item.pawnable === undefined || typeof item.pawnable === "boolean") &&
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

const store = createM3SaveStore(validProfile, validRun);
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
let pendingWorkerFeedback: string | undefined;
let pendingBuild: { commandId: string; key: string } | undefined;
let scoutWard: { itemId: number; towerId: number; mode: "scout" | "snow" | "teleport" } | undefined;
let pointSpell: {
  label: string;
  action: { type: "cast-hero"; towerId: number; skillId: HeroSpell } |
    { type: "cast-tower"; towerId: number; skillId: string };
} | undefined;
let artilleryTowerId: number | undefined;
let wolfMoveId: number | undefined;
const compatibleMap = () => !!run && run.mapVersion === mapVersion;
let releaseWriter: (() => void) | undefined;
let pendingTransaction: { id: string; action: Action; dueUs: number; draft?: Match } | undefined;
let simulation: {
  worker: Worker;
  hold?: { id: string; realMs: number };
  waitingForView: boolean;
  lastViewMs: number;
  held: boolean;
  continuation?: PerformanceContinuation["actions"];
} | undefined;
let workerDrainMs = 0;
const overBudgetSlices: OverBudgetSlice[] = [];
let recoveryStartedMs: number | undefined;
let replayOutcomes: FramePerformance["recordedOutcomes"];

function sendSimulation(message: SimulationInput) {
  simulation!.worker.postMessage(message);
}

function startSimulation() {
  if (!run || !writer || !compatibleMap()) return;
  if (!simulation) {
    const worker = new Worker(new URL("./m2-simulation-worker.ts", import.meta.url), { type: "module" });
    const owner = { worker, waitingForView: false, lastViewMs: 0, held: false };
    simulation = owner;
    worker.onmessage = ({ data }: MessageEvent<SimulationOutput>) => {
      if (simulation === owner) acceptSimulation(data);
    };
    worker.onerror = () => {
      if (simulation !== owner) return;
      releaseWriter?.();
      el("save").textContent = "战斗计算中断。可重新载入最近存档。";
      retrySave.hidden = false;
    };
  }
  simulation.held = false;
  simulation.hold = undefined;
  simulation.waitingForView = false;
  simulation.lastViewMs = 0;
  recoveryStartedMs = undefined;
  previousTime = performance.now();
  sendSimulation({ type: "load", run, realMs: previousTime });
}

function holdSimulation(id: string) {
  const request = { id, realMs: previousTime };
  simulation!.hold = request;
  sendSimulation({ type: "hold", realMs: request.realMs, requestId: request.id });
}

function acceptSimulation(message: SimulationOutput) {
  if (message.type === "queued") {
    if (message.actionType === "stop-worker" && framePerformanceProbe()) performanceStops.set(message.id, message.dueUs);
    return;
  }
  if (message.type === "rejected") {
    if (message.actionType === "stop-worker" && framePerformanceProbe()) {
      rejectedStops.push({ id: message.id, atUs: message.atUs, terminal: message.terminal });
    }
    if (pendingCommand === message.id) {
      pendingCommand = undefined;
      el("feedback").textContent = message.terminal ? "对局已结束。" : "指令未执行。";
    }
    return;
  }
  if (!simulation || message.run.matchId !== run?.matchId) return;
  if (message.type === "held") {
    const request = simulation.hold;
    if (message.requestId !== request?.id) return;
    previousTime = request.realMs;
    simulation.hold = undefined;
    simulation.held = true;
    run = message.run;
    if (message.requestId === "restart") restart();
    else if (pendingTransaction?.id === message.requestId) pendingTransaction.dueUs = run.clock.targetUs + 1;
    return;
  }

  simulation.waitingForView = false;
  const previous = run;
  const next = message.run;
  run = next;
  if (recoveryStartedMs !== undefined && message.realMs >= recoveryStartedMs &&
      (next.phase !== "running" || next.clock.targetUs - next.queue.nowUs < 1_000_000)) {
    recoveryStartedMs = undefined;
  }
  workerDrainMs = Math.max(workerDrainMs, message.maxSliceMs ?? 0);
  if (message.overBudgetSlices) overBudgetSlices.push(...message.overBudgetSlices);
  const resultsChanged = Object.keys(previous.commandResults).length !== Object.keys(next.commandResults).length;
  const replay = framePerformanceProbe()?.continuation;
  if (replay && message.nextRecordedInput !== undefined) {
    replay.next = message.nextRecordedInput;
    if (resultsChanged) for (let index = 0; index < replay.next; index++) {
      const { id } = replay.actions[index];
      if (Object.hasOwn(next.commandResults, id) && !Object.hasOwn(previous.commandResults, id)) {
        (replayOutcomes ??= {})[id] = next.commandResults[id];
      }
    }
  }
  pendingWorkerFeedback ??= previous.approach?.command.id;
  showCompleted(next);
  const constructionCount = (state: Match) => state.structures.filter(tower => tower.pending).length;
  if (previous.phase !== next.phase || previous.wave !== next.wave || previous.seasonRevision !== next.seasonRevision ||
      previous.activityScore !== next.activityScore || previous.clock.paused !== next.clock.paused || previous.clock.speed !== next.clock.speed ||
      resultsChanged || constructionCount(previous) !== constructionCount(next) || saveRequested) save();
}

function writable() {
  return !!writer && !busy && !simulation?.hold && compatibleMap() && run?.phase === "running";
}

function send(action: Action) {
  if (!writable() || !run || pendingTransaction) return;
  tickClock();
  const id = crypto.randomUUID();
  if (action.type === "choose-opening" || action.type === "buy-event-box" || action.type === "exchange-hero" ||
      action.type === "use-item" && run.inventory?.some(item => item.id === action.itemId && eventBoxes.has(item.itemId))) {
    pendingTransaction = { id, action, dueUs: run.clock.targetUs + 1 };
    if (simulation && !simulation.held) holdSimulation(id);
    el("feedback").textContent = run.clock.paused ? "指令已排队，继续后执行。" : "指令已排队。";
    return id;
  }
  if (simulation && !simulation.held) {
    sendSimulation({ type: "command", realMs: previousTime, command: { id, matchId: run.matchId, action } });
    pendingCommand = id;
    el("feedback").textContent = run.clock.paused ? "指令已排队，继续后执行。" : "指令已排队。";
    return id;
  }
}

function addButton(parent: HTMLElement, label: string, action: () => void, disabled = !writable(), iconId?: string) {
  const button = document.createElement("button");
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", action);
  if (iconId) prependOriginalIcon(button, iconId);
  parent.append(button);
  return button;
}

const appearance = el("worker-appearance");
const appearanceLabels: Record<AppearanceSlot, string> = {
  worker: "工人外观", circle: "能量圈外观", aura: "工人光环", wings: "工人羽翼", title: "工人称号", accent: "工人装饰",
};
const appearanceOptions = appearanceSlots.flatMap(slot => {
  const group = document.createElement("details");
  group.name = appearance.id;
  const summary = document.createElement("summary");
  summary.textContent = appearanceLabels[slot];
  const choices = document.createElement("div");
  choices.className = "appearance-options";
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", appearanceLabels[slot]);
  group.append(summary, choices);
  appearance.append(group);
  return [undefined, ...appearanceChoices.filter(choice => choice.slot === slot)].map(choice => {
    const control = addButton(choices, choice?.name.replace(/（(?:工人|能量圈)）$/, "") ?? "默认",
      () => send({ type: "choose-appearance", slot, choice: choice?.id }), true, choice?.id);
    control.value = choice?.id ?? "";
    if (!control.querySelector("img")) setCommandIcon(control, choice ? "info" : "retry");
    return { slot, choice, control };
  });
});

function cardName(id: string) {
  const card = cardTemplates.get(id);
  return card ? `${card.name} · ${card.rarity}` : id;
}

function placeCard(id: number, card: string) {
  clearPlacement();
  build = { key: String(id), label: cardName(card), action: { type: "build-card", cardId: id } };
  el("feedback").textContent = "";
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
  const bears = run?.summons?.filter(unit => unit.bear) ?? [];
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
  const aimedSpells = new Map<string, { id: number; unitId?: string; templateId?: string }[]>();
  if (run) {
    for (const tower of run.structures) {
      for (const [slot, rank] of Object.entries(tower.hero?.ranks ?? {})) {
        const id = activeHeroSkill(tower, slot);
        if (!rank || !isCastableHeroSkill(id)) continue;
        const mode = heroSpellTargetMode(id);
        if (mode === "unit") aimedSpells.set(`${tower.id}/${id}`, heroSpellTargets(run, tower.id, id as HeroSpell));
        if (mode === "ally") aimedSpells.set(`${tower.id}/${id}`, heroAllySpellTargets(run, tower, id));
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
    run?.waveRewardSlots, run?.overdraftOpen, run?.overdraftPoints, run?.mysteryShopOpen, run?.mysteryRefreshed, run?.mysteryStock, run?.matchId, run?.phase, run?.openingCard, run?.openingCandidates, run?.openingChoicesUnlocked, run?.inventory, run?.qualificationShopOpen, run?.cards, run?.books, run?.structures.map(({ id, x, y, templateId, pending, qualification, hero, flameArrows, swordRainToken, snow, scepterSwap, scepterWard, doomBorrowed, autoModes }) =>
      [id, x, y, templateId, pending, qualification, hero, flameArrows, swordRainToken, snow?.token, scepterSwap?.grant, scepterWard, doomBorrowed, autoModes, arrowTargets.get(id)?.map(enemy => enemy.id)]),
    bears.map(unit => [unit.id, unit.autoModes]),
    wolves.map((unit, index) => [unit.id, unit.wolfOrder?.type, availableWolfTargets[index].map(enemy => enemy.id)]),
    run?.workerSharing, run && run.queue.nowUs >= (run.workerBenefitReadyUs ?? 0),
    run?.snowDuration, run?.activityScore, run?.fragments,
    run?.mallHeroClaims, run?.scoreHeroClaimed, run && spendableScore(run), run?.wave, pendingTransaction?.id, run?.appearance, run?.seasons?.spring.unlocks, run?.seasons?.summer.unlocks,
    writer !== undefined, busy, build?.key, wolfMoveId, scoutWard, pointSpell, artilleryTowerId,
    run?.structures.map(tower => [tower.id, tower.autoModes?.nativeSlow, tower.autoModes?.nativeBloodlust]),
    [...aimedSpells].map(([id, enemies]) => [id, enemies.map(enemy => enemy.id)]),
    [...equipmentTargets].map(([id, enemies]) => [id, enemies.map(enemy => enemy.id)]),
  ]);
  if (lastControls === key) return;
  lastControls = key;
  const locked = !writable();
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
        () => send({ type: "claim-wave", slot }), locked || status !== 2, reward.itemId);
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
      addButton(panel, `${items.get(itemId)!.name} ×${count}${price ? " · " + price : ""}`,
        () => send({ type: "buy-special", shop, itemId }), locked, itemId);
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
  for (const card of run?.openingCandidates ?? []) {
    addButton(choices, cardName(card), () => send({ type: "choose-opening", card }), locked, card);
  }

  const builds = el("builds");
  builds.replaceChildren();
  for (const tower of Object.keys(directBuilds) as Array<keyof typeof directBuilds>) {
    addButton(builds, `${workerTowers.get(tower)!.name} · ${directBuilds[tower].gold} 金`, () => {
      clearPlacement();
      build = { key: tower, label: workerTowers.get(tower)!.name, action: { type: "build-worker-tower", tower } };
      el("feedback").textContent = "";
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
    addButton(prayer, `${book.name} · ${book.gold} 金`, () => send({ type: "buy-book", bookId: book.id }), locked, book.id);
  }

  const pack = el("books");
  pack.textContent = run?.books?.map(book =>
    `${prayerBooks.find(entry => entry.id === book.bookId)!.name} ×${book.charges}`).join(" · ") || "工人未持有经验道具。";

  function addItemTransfer(row: HTMLElement, itemId: number, name: string, from?: number) {
    const targets = document.createElement("select");
    targets.setAttribute("aria-label", `${name}的转交目标`);
    if (from !== undefined) targets.append(new Option("工人", ""));
    if (from !== circleId) targets.append(new Option("能量圈", String(circleId)));
    for (const tower of [...(run?.structures ?? []), ...bears]) {
      if (tower.id === from || tower.pending) continue;
      targets.append(new Option(`${tower.bear ? "熊灵" : structureName(tower.templateId)} #${tower.id}`, String(tower.id)));
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
  appearance.hidden = !run;
  for (const { slot, choice, control } of appearanceOptions) {
    const unlocked = !choice || appearanceUnlocked(choice, run?.seasons);
    control.disabled = locked || !unlocked;
    control.title = unlocked ? "" : "尚未解锁";
    control.setAttribute("aria-pressed", String(run?.appearance?.[slot] === choice?.id));
  }

  const eventShop = el("event-boxes");
  eventShop.replaceChildren();
  if (run) {
    for (const [offer, box] of eventBoxOffers) {
      addButton(eventShop, `${box.name} · ${eventBoxCost} 活动积分`,
        () => send({ type: "buy-event-box", offer }), locked || !!pendingTransaction || (run.activityScore ?? 0) < eventBoxCost, offer);
    }
  }

  const heroExchange = el("hero-exchange");
  heroExchange.hidden = !heroExchangeOffers.size;
  const offers = el("hero-exchange-offers");
  offers.replaceChildren();
  if (run) for (const [offer, definition] of heroExchangeOffers) {
    const blocked = definition.cost ? run.scoreHeroClaimed || spendableScore(run) < definition.cost :
      run.mallHeroClaims?.includes(offer) || (run.mallHeroClaims?.length ?? 0) >= mallHeroLimit(run.wave);
    addButton(offers, `${cardName(definition.card)} · 1 张 SR${definition.cost ? ` ＋ ${definition.cost} 积分` : ""}`,
      () => send({ type: "exchange-hero", offer }), locked || !!blocked || !!pendingTransaction, definition.card);
  }

  const inventory = el("worker-items");
  inventory.replaceChildren();
  for (const item of run?.inventory?.filter(entry => entry.towerId === undefined) ?? []) {
    const name = (eventBoxes.get(item.itemId) ?? items.get(item.itemId))!.name + (item.charges > 1 ? ` ×${item.charges}` : "");
    const row = document.createElement("div");
    row.className = "controls";
    prependOriginalIcon(row, item.itemId);
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
      else placeCard(card.id, card.card);
    }, locked, card.card).setAttribute("aria-pressed", String(build?.key === String(card.id)));
    if (card.slot !== null) {
      if (!card.bound) addButton(cards, `丢下 ${cardName(card.card)}`, () => send({ type: "drop-card", cardId: card.id }));
      if (talent?.id === "W012" && card.slot !== 0) {
        addButton(cards, `${cardName(card.card)}放入第一格`, () => send({ type: "swap-worker-slots", from: card.slot!, to: 0 }));
      }
    }
  }

  function showEquipment(container: HTMLElement, towerId: number) {
    const entries = run?.inventory?.filter(item => item.towerId === towerId) ?? [];
    for (const item of entries) {
      const gear = document.createElement("div");
      const name = (eventBoxes.get(item.itemId) ?? items.get(item.itemId))!.name;
      gear.textContent = `${name}${item.charges > 1 ? " ×" + item.charges : ""} `;
      prependOriginalIcon(gear, item.itemId);
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
      if ((item.itemId === "i207" || item.itemId === "i230") && towerId !== circleId) {
        addButton(gear, "使用" + name, () => {
          clearPlacement();
          scoutWard = { itemId: item.id, towerId, mode: "teleport" };
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
          el("feedback").textContent = "选择炮击落点。";
        }, locked).setAttribute("aria-pressed", String(artilleryTowerId === tower.id));
        const targets = artilleryItems(run!, tower.id);
        if (targets.length) {
          const select = document.createElement("select");
          select.setAttribute("aria-label", "炮击物品目标");
          for (const target of targets) {
            const name = "card" in target ? cardName(target.card) : (eventBoxes.get(target.itemId) ?? items.get(target.itemId))!.name;
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
        if (activeMatch.lifeDrains?.[tower.id]) addButton(row, "停止生命汲取", () => send({ type: "stop-tower-cast", towerId: tower.id }), locked);
        const skills = document.createElement("div");
        skills.className = "controls";
        for (const skill of learnableSkills(tower.templateId)) {
          const rank = hero.ranks[skill.skillId] ?? 0;
          const required = learningLevel(hero, tower.templateId, skill.skillId);
          const label = required === undefined ? `${skill.name} Lv${rank}` :
            `学习${skill.name} Lv${rank + 1}（需 ${required} 级）`;
          const learn = addButton(skills, label, () => send({ type: "learn-skill", towerId: tower.id, skillId: skill.skillId }),
            locked || hero.points < 1 || required === undefined || hero.level < required);
          prependOriginalIcon(learn, skill.skillId, true);
          if (rank) addHeroCast(activeHeroSkill(tower, skill.skillId), skill.name);
          if (rank && skill.skillId === "A091") {
            const enabled = tower.autoModes?.A091 === true;
            const toggle = addButton(skills, `${enabled ? "关闭" : "开启"}自动${skill.name}`,
              () => send({ type: "set-auto-mode", towerId: tower.id, key: "A091", enabled: !enabled }), locked);
            toggle.setAttribute("aria-pressed", String(enabled));
          }
        }
        if (hero.ranks.A225) for (const [attribute, name] of [["STR", "力量"], ["AGI", "敏捷"]] as const) {
          const active = tower.morphShift?.attribute === attribute;
          const toggle = addButton(skills, active ? `停止转${name}` : `转为${name}`,
            () => send({ type: "toggle-morph", towerId: tower.id, attribute }), locked);
          toggle.setAttribute("aria-pressed", String(active));
        }
        for (const { id, rank, name } of doomAbilities(tower)) {
          const text = `${name} Lv${rank}`;
          if (isCastableHeroSkill(id)) {
            addHeroCast(id, text);
            if (heroAutoCastOrder.some(automatic => automatic === id)) {
              const enabled = tower.autoModes?.[id] !== false;
              const toggle = addButton(skills, `${enabled ? "关闭" : "开启"}自动${name}`,
                () => send({ type: "set-auto-mode", towerId: tower.id, key: id, enabled: !enabled }), locked);
              toggle.setAttribute("aria-pressed", String(enabled));
            }
          } else {
            const label = document.createElement("span");
            label.textContent = text;
            skills.append(label);
          }
        }
        function addHeroCast(skillId: string, name: string) {
          if (!isCastableHeroSkill(skillId)) return;
          const mode = heroSpellTargetMode(skillId);
          if (mode === "point") {
            const label = skillId === "A094" && tower.scepterWard ? "强化群蛇守卫" : name;
            addButton(skills, `施放${label}`, () => {
              clearPlacement();
              pointSpell = { action: { type: "cast-hero", towerId: tower.id, skillId: skillId as HeroSpell }, label };
            }, locked, skillId);
          } else if (mode === "unit" || mode === "ally") {
            const targets = document.createElement("select");
            targets.setAttribute("aria-label", name + "目标");
            for (const target of aimedSpells.get(`${tower.id}/${skillId}`) ?? []) {
              targets.append(new Option(`${target.templateId ? structureName(target.templateId) : target.unitId} #${target.id}`, String(target.id)));
            }
            skills.append(targets);
            addButton(skills, `施放${name}`, () => send({ type: "cast-hero", towerId: tower.id, skillId,
              targetId: Number(targets.value) }), locked || targets.options.length === 0, skillId);
          } else {
            addButton(skills, `施放${name}`, () => send({ type: "cast-hero", towerId: tower.id, skillId }), locked, skillId);
          }
        }
        if (hero.ranks.A106) {
          addButton(skills, "施放雷云", () => {
            clearPlacement();
            pointSpell = { action: { type: "cast-hero", towerId: tower.id, skillId: "A106" }, label: "雷云" };
          }, locked);
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
        for (const skin of heroSkins.filter(skin => skin.from === tower.templateId)) {
          addButton(skills, "切换" + skin.name, () => send({ type: "choose-skin", towerId: tower.id, choice: skin.choice }), locked);
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
        const orb = attackOrb(tower)!;
        const enabled = tower.flameArrows ?? orb.defaultAuto;
        addButton(row, (enabled ? "关闭" : "开启") + orb.name, () => send({ type: "toggle-flame-arrows", towerId: tower.id }));
        const select = document.createElement("select");
        select.setAttribute("aria-label", orb.name + "目标");
        for (const enemy of targets) select.append(new Option(`${enemy.unitId} #${enemy.id}`, String(enemy.id)));
        row.append(select);
        addButton(row, "手动发射" + orb.name, () => send({ type: "cast-flame-arrow", towerId: tower.id, targetId: Number(select.value) }),
          locked || targets.length === 0);
      }
      if (tower.requiemFollowTimer !== undefined) addButton(row, "停止魂之挽歌", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.freezingFieldId !== undefined) addButton(row, "停止冰冻领域", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.snow) addButton(row, "停止落雪", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.spellWindup !== undefined) addButton(row, "取消施法", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.illuminateCharge) addButton(row, "释放冲击波", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.upheavalId !== undefined) addButton(row, "停止剧变", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.leashToken !== undefined) addButton(row, "停止枷锁", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      if (tower.swordRainToken !== undefined) {
        addButton(row, "停止黑暗剑雨", () => send({ type: "stop-tower-cast", towerId: tower.id }));
      }
      for (const spell of towerSpells.get(tower.templateId) ?? []) {
        const binding = towerLevels.get(tower.templateId)?.bindings.find(entry => entry.skillId === spell.id);
        if (!binding) continue;
        const cast = { type: "cast-tower" as const, towerId: tower.id, skillId: spell.id };
        if (pointTowerSpell(spell.id)) {
          addButton(row, "施放" + binding.name, () => {
            clearPlacement();
            pointSpell = { action: cast, label: binding.name };
          }, locked);
          continue;
        }
        if (spell.effect.kind !== "purge" && spell.effect.kind !== "slow" && spell.effect.kind !== "boulder" && spell.effect.kind !== "bloodlust") {
          addButton(row, "施放" + binding.name, () => send(cast));
          continue;
        }
        const targets = document.createElement("select");
        targets.setAttribute("aria-label", binding.name + "目标");
        const candidates = spell.effect.kind === "bloodlust" ? bloodlustTargets(activeMatch, tower, spell.effect.range) :
          towerSpellTargets(activeMatch, tower, spell.id);
        for (const candidate of candidates) {
          const name = "templateId" in candidate ? structureName(candidate.templateId) : candidate.unitId;
          targets.append(new Option(`${name} #${candidate.id}`, String(candidate.id)));
        }
        row.append(targets);
        addButton(row, "施放" + binding.name, () => send({ ...cast, targetId: Number(targets.value) }), locked || !targets.options.length);
        if (spell.effect.kind === "slow") addButton(row, tower.autoModes?.nativeSlow === false ? "开启自动减速" : "关闭自动减速",
          () => send({ type: "set-auto-mode", towerId: tower.id, key: "nativeSlow", enabled: tower.autoModes?.nativeSlow === false }), locked);
        if (spell.effect.kind === "bloodlust") addButton(row, tower.autoModes?.nativeBloodlust === false ? "开启自动嗜血" : "关闭自动嗜血",
          () => send({ type: "set-auto-mode", towerId: tower.id, key: "nativeBloodlust", enabled: tower.autoModes?.nativeBloodlust === false }), locked);
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
  for (const bear of bears) {
    const row = document.createElement("div");
    row.dataset.bearId = String(bear.id);
    const label = document.createElement("span");
    label.textContent = `熊灵 Lv${Number(bear.templateId.slice(1)) - 254} #${bear.id}`;
    row.append(label);
    for (const ability of bearAbilities(bear)) {
      addButton(row, ability.name, () => send({ type: "cast-tower", towerId: bear.id, skillId: ability.id }), locked);
      if (ability.mana > 0) {
        const enabled = bear.autoModes?.[ability.id] !== false;
        const toggle = addButton(row, enabled ? "关闭自动咆哮" : "开启自动咆哮",
          () => send({ type: "set-auto-mode", towerId: bear.id, key: ability.id, enabled: !enabled }), locked);
        toggle.setAttribute("aria-pressed", String(enabled));
      }
    }
    for (const item of run!.inventory?.filter(entry => entry.towerId === bear.id && entry.slot !== null) ?? []) {
      const label = items.get(item.itemId)!.name;
      if (canMoveItem(item.itemId)) {
        addItemTransfer(row, item.id, label, bear.id);
        addButton(row, `丢下${label}`, () => send({ type: "drop-item", itemId: item.id }), locked);
      }
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
const orbitControl = el<HTMLButtonElement>("orbit-view");
orbitControl.onclick = () => {
  const active = orbitControl.getAttribute("aria-pressed") !== "true";
  orbitControl.setAttribute("aria-pressed", String(active));
  draw?.setOrbit(active);
};
el("reset-view").onclick = () => {
  orbitControl.setAttribute("aria-pressed", "false");
  draw?.setOrbit(false);
  draw?.resetView();
};
el("view-oblique").onclick = () => draw?.setView("oblique");
el("view-top").onclick = () => draw?.setView("top");
el("rotate-left").onclick = () => draw?.rotateView(-1);
el("rotate-right").onclick = () => draw?.rotateView(1);
el("zoom-in").onclick = () => draw?.zoomView(1.2);
el("zoom-out").onclick = () => draw?.zoomView(1 / 1.2);
setCommandIcon(el("pause"), "pause", "暂停");
setCommandIcon(el("view-oblique"), "oblique", "斜俯视");
setCommandIcon(el("view-top"), "overhead", "俯视");
setCommandIcon(el("rotate-left"), "rotate-left", "镜头向左旋转 45 度");
setCommandIcon(el("rotate-right"), "rotate-right", "镜头向右旋转 45 度");
setCommandIcon(el("zoom-in"), "zoom-in", "拉近镜头");
setCommandIcon(el("zoom-out"), "zoom-out", "拉远镜头");
setCommandIcon(el("reset-view"), "recenter", "复位视角");
setCommandIcon(el("cancel-placement"), "close", "取消放置");
setCommandIcon(el("cancel-save-wait"), "close", "取消等待");
setCommandIcon(el("retry-save"), "retry", "重试存档");
const commandUI = createCommandUI({ match: () => compatibleMap() ? run : undefined, scene: () => draw, send, writable, placeCard,
  refreshManagement: showControls, cancel: clearPlacement, placing: () => !!build || !!pointSpell || !!scoutWard || wolfMoveId !== undefined || artilleryTowerId !== undefined });
const sceneReady = createM2Scene(el<HTMLCanvasElement>("field"), point => {
  if (artilleryTowerId !== undefined && writable()) {
    const towerId = artilleryTowerId;
    artilleryTowerId = undefined;
    send({ type: "attack-ground", towerId, point });
    return;
  }
  if (pointSpell && writable()) {
    const { action } = pointSpell;
    pointSpell = undefined;
    send({ ...action, point });
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
  if (!result.ok) { el("feedback").textContent = rejection[result.reason] + "，请重新选位置。"; return; }
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
  if (run && writer && !busy && compatibleMap()) {
    if (simulation?.held) creditTime(run, now - previousTime);
    else if (simulation && !simulation.hold) {
      if (!run.clock.paused && now - previousTime >= 2_000) recoveryStartedMs = now;
      const busyScene = run.clock.speed === 4 && run.enemies.length + run.structures.length + (run.summons?.length ?? 0) >= 100;
      const capture = !simulation.waitingForView && (!busyScene || now - simulation.lastViewMs >= 28);
      if (capture) {
        simulation.waitingForView = true;
        simulation.lastViewMs = now;
      }
      const probe = framePerformanceProbe();
      const actions = probe?.continuation?.actions;
      const continuation = actions !== simulation.continuation ? actions : undefined;
      simulation.continuation = actions;
      sendSimulation({ type: "observe", realMs: now, capture, measure: !!probe, continuation });
    }
  }
  previousTime = now;
}

function createMatch(initialProfile = profile) {
  const value = new URLSearchParams(location.search).get("seed");
  const requested = value === null || !/^\d+$/.test(value) ? NaN : Number(value);
  const seed = requested >= 0 && requested <= 0xffffffff ? requested : crypto.getRandomValues(new Uint32Array(1))[0];
  const match = newMatch(crypto.randomUUID(), seed, initialProfile.seasons ?? emptySeasons());
  match.startingScore = initialProfile.score;
  match.activityScore = initialProfile.activityScore ?? 0;
  match.fragments = initialProfile.fragments ?? 0;
  if (initialProfile.appearance) match.appearance = { ...initialProfile.appearance };
  return match;
}

function restore(checkpoint: Saved | undefined) {
  if (!checkpoint) return;
  head = { revision: checkpoint.revision, activeMatchId: checkpoint.activeMatchId };
  if (run?.matchId !== checkpoint.run.matchId) {
    pendingCommand = undefined;
    pendingWorkerFeedback = undefined;
    performanceStops.clear();
    rejectedStops.length = 0;
    pendingTransaction = undefined;
    saveRequested = false;
    restartRequested = false;
    pendingBuild = undefined;
    pointSpell = undefined;
    scoutWard = undefined;
    artilleryTowerId = undefined;
  }
  run = checkpoint.run;
  profile = { ...checkpoint.profile, score: checkpoint.profile.score - matchScore(run) };
  run.startingScore ??= profile.score;
  run.seasons ??= structuredClone(profile.seasons ?? emptySeasons());
  if (compatibleMap()) restoreHeroState(run, false);
}

function matchScore(match: Match) {
  return (match.seasonScore ?? 0) + (match.eventScore ?? 0) + (match.killScore ?? 0) - (match.spentScore ?? 0);
}

function checkpointProfile(match: Match): Profile {
  return { ...profile, seasons: match.seasons, appearance: match.appearance, score: profile.score + matchScore(match),
    activityScore: match.activityScore ?? 0, fragments: match.fragments ?? 0,
    enabledSkins: [...new Set([...(profile.enabledSkins ?? []), firelordSkin.unlock])] };
}

let queuedSave = false;
let saveRequested = false;
function save() {
  if (framePerformanceProbe()?.autosave === false) return;
  if (!writer || !run || !compatibleMap()) return;
  saveRequested = true;
  if (queuedSave || eventInProgress(run)) return;
  queuedSave = true;
  jobs = jobs.then(async () => {
    queuedSave = false;
    if (!writer || !run || busy || !compatibleMap() || eventInProgress(run)) return;
    saveRequested = false;
    lastSave = performance.now();
    head = await writer.commit(head, checkpointProfile(run), run);
    el("save").textContent = `已保存 · 修订 ${head.revision}`;
  }).catch(handleStorageError);
}

function handleStorageError(error: unknown) {
  el("save").textContent = error instanceof Error ? error.message : "存档失败，稍后可重试。";
  if (error instanceof StaleM3Checkpoint) releaseWriter?.();
}

el("pause").onclick = () => {
  if (!writable() || !run) return;
  tickClock();
  if (simulation && !simulation.held) {
    sendSimulation({ type: "clock", realMs: previousTime, key: "paused" });
  } else {
    run.clock.paused = !run.clock.paused;
    save();
  }
};
el("speed").onclick = () => {
  if (!writable() || !run) return;
  tickClock();
  if (simulation && !simulation.held) {
    sendSimulation({ type: "clock", realMs: previousTime, key: "speed" });
  } else {
    run.clock.speed = run.clock.speed === 1 ? 4 : 1;
    save();
  }
};
let restartRequested = false;
el("restart").onclick = () => {
  if (!writer || !head || busy || restartRequested || simulation?.hold || !confirm("重新开局会替换当前对局。确定重开？")) return;
  restartRequested = true;
  tickClock();
  if (simulation && !simulation.held) holdSimulation("restart");
  else restart();
};

function restart() {
  restartRequested = false;
  tickClock();
  busy = true;
  void jobs.then(async () => {
    if (!writer || !head || !run) return;
    const latestProfile = checkpointProfile(run);
    const fresh = createMatch(latestProfile);
    head = await writer.restart(head, latestProfile, fresh);
    profile = latestProfile;
    run = fresh;
    saveRequested = false;
    build = undefined;
    wolfMoveId = undefined;
    pointSpell = undefined;
    scoutWard = undefined;
    artilleryTowerId = undefined;
    pendingCommand = undefined;
    pendingWorkerFeedback = undefined;
    performanceStops.clear();
    rejectedStops.length = 0;
    pendingTransaction = undefined;
    pendingBuild = undefined;
    recycleConfirmation = undefined;
    el("feedback").textContent = "已重开。";
    el("save").textContent = `已保存 · 修订 ${head.revision}`;
  }).catch(handleStorageError).finally(() => {
    previousTime = performance.now();
    busy = false;
    startSimulation();
  });
}

const cancelSaveWait = el<HTMLButtonElement>("cancel-save-wait");
const retrySave = el<HTMLButtonElement>("retry-save");

async function openProfile() {
  const wait = new AbortController();
  retrySave.hidden = true;
  cancelSaveWait.onclick = () => wait.abort();
  const abortOnPageHide = () => wait.abort();
  window.addEventListener("pagehide", abortOnPageHide, { once: true });
  try {
    const snapshot = await store.read();
    restore(snapshot);
    cancelSaveWait.hidden = false;
    el("save").textContent = "正在等待档案写入权限。";
    await store.withWriter(async session => {
      restore(session.checkpoint);
      if (!session.checkpoint) {
        const created = await withM2Archive(validProfile, async (archived, source) => {
          const inherited: Profile = archived ?? { claims: [], ...startSeasons() };
          const initial: Profile = {
            ...inherited,
            seasons: inherited.seasons ?? emptySeasons(),
            activityScore: inherited.activityScore ?? 0,
            fragments: inherited.fragments ?? 0,
            openGiftNum: inherited.openGiftNum ?? 0,
          };
          const fresh = createMatch(initial);
          const committed = await session.commit(undefined, initial, fresh, source);
          return { initial, fresh, committed };
        }, () => {
          el("save").textContent = "请关闭旧版游戏标签页后重试。";
        }, wait.signal);
        profile = created.initial;
        run = created.fresh;
        head = created.committed;
      }
      cancelSaveWait.hidden = true;
      el("save").textContent = "正在加载当前战场。";
      await sceneReady;
      if (draw && run && compatibleMap()) await draw.preloadMatch(run);
      if (wait.signal.aborted) return;
      writer = session;
      previousTime = performance.now();
      startSimulation();
      el("save").textContent = `已载入 · 修订 ${head!.revision}`;
      await new Promise<void>(resolve => {
        releaseWriter = () => {
          window.removeEventListener("pagehide", releaseWriter!);
          writer = undefined;
          simulation?.worker.terminate();
          simulation = undefined;
          releaseWriter = undefined;
          resolve();
        };
        window.addEventListener("pagehide", releaseWriter, { once: true });
      });
    }, wait.signal);
  } catch (error) {
    if (wait.signal.aborted) el("save").textContent = "已取消等待。";
    else handleStorageError(error);
    retrySave.hidden = false;
  } finally {
    cancelSaveWait.hidden = true;
    window.removeEventListener("pagehide", abortOnPageHide);
  }
}
retrySave.onclick = () => void openProfile();
void openProfile();
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

function advanceTransaction(current: Match, transaction: NonNullable<typeof pendingTransaction>) {
  if (!transaction.draft) {
    const draft = structuredClone(current);
    draft.clock.targetUs = transaction.dueUs - 1;
    enqueue(draft, { id: transaction.id, matchId: draft.matchId, action: transaction.action });
    transaction.draft = draft;
  }
  const draft = transaction.draft;
  draft.clock = { ...current.clock, targetUs: transaction.dueUs };
  const deadline = performance.now() + 6;
  const result = drain(draft, 32_000, () => performance.now() >= deadline ||
    !eventInProgress(draft) && Object.hasOwn(draft.commandResults, transaction.id));
  if (eventInProgress(draft) || result === "pending" && !Object.hasOwn(draft.commandResults, transaction.id)) return;
  const outcome = draft.commandResults[transaction.id];
  if (draft.phase === "running") draft.clock.targetUs = current.clock.targetUs;
  pendingTransaction = undefined;
  if (outcome?.ok === false) {
    run = draft;
    el("feedback").textContent = rejection[outcome.reason];
    startSimulation();
    return;
  }
  busy = true;
  const session = writer!;
  jobs = jobs.then(async () => {
    head = await session.commit(head, checkpointProfile(draft), draft);
    run = draft;
    lastSave = performance.now();
    el("save").textContent = `已保存 · 修订 ${head.revision}`;
    const reward = outcome?.eventReward;
    if (reward) {
      el("feedback").textContent = `获得 ${reward.amount} ${reward.currency === "score" ? "积分" : "碎片"}`;
    } else if (outcome) {
      const droppedOpeningCard = transaction.action.type === "choose-opening" &&
        draft.cards.some(card => card.id === outcome.createdId && card.slot === null);
      el("feedback").textContent = droppedOpeningCard ? "工人背包已满，塔卡掉在工人脚边。" : "操作已执行。";
    }
  }).catch(error => {
    el("feedback").textContent = "存档失败，请重新操作。";
    handleStorageError(error);
  }).finally(() => {
    previousTime = performance.now();
    busy = false;
    startSimulation();
  });
}

type FramePerformance = {
  phase: Match["phase"];
  atUs: number;
  backlogUs: number;
  queuedEvents: number;
  entities: number;
  drainMs: number;
  renderMs: number;
  controlMs: number;
  commandUiMs: number;
  frameMs: number;
  presentedAt?: number;
  overBudgetSlices?: OverBudgetSlice[];
  queuedStops?: { id: string; scheduledUs: number; ok?: boolean }[];
  rejectedStops?: { id: string; atUs: number; terminal: boolean }[];
  recordedOutcomes?: Record<string, Match["commandResults"][string]>;
};

type PerformanceContinuation = {
  actions: { id: string; atUs: number; action: Action }[];
  next: number;
};

const performanceStops = new Map<string, number>();
const rejectedStops: NonNullable<FramePerformance["rejectedStops"]> = [];

function framePerformanceProbe() {
  return (globalThis as typeof globalThis & {
    __td3FramePerformance?: ((sample: FramePerformance) => void) & { autosave?: boolean; continuation?: PerformanceContinuation };
  }).__td3FramePerformance;
}

function showCompleted(state: Match) {
  const results = state.commandResults;
  const completed = [...new Set([pendingWorkerFeedback, pendingBuild?.commandId, pendingCommand])].filter(
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
      if (state.commandResults[pendingBuild.commandId].ok && pendingBuild.key === build?.key) build = undefined;
      pendingBuild = undefined;
    }
    if (pendingCommand && completed.includes(pendingCommand)) pendingCommand = undefined;
    if (pendingWorkerFeedback && completed.includes(pendingWorkerFeedback)) pendingWorkerFeedback = undefined;
  }
}

function frame() {
  const performanceFlag = framePerformanceProbe();
  const frameStarted = performanceFlag ? performance.now() : 0;
  tickClock();
  if (writer && run && !busy && compatibleMap()) {
    if (simulation?.held && pendingTransaction && pendingTransaction.dueUs <= run.clock.targetUs) {
      advanceTransaction(run, pendingTransaction);
    } else if (!simulation?.hold && run.phase === "running" &&
        performance.now() - lastSave >= configuration.persistence.autosaveRealSeconds * 1000) save();
  }
  const drainMs = workerDrainMs;
  workerDrainMs = 0;
  const recordedOutcomes = replayOutcomes;
  replayOutcomes = undefined;
  const queuedStops: FramePerformance["queuedStops"] = [];
  if (performanceFlag && run) {
    for (const [id, scheduledUs] of performanceStops) {
      const ok = run.commandResults[id]?.ok;
      queuedStops.push({ id, scheduledUs, ok });
      if (ok !== undefined || run.phase !== "running") performanceStops.delete(id);
    }
  }
  if (run) {
    const seconds = Math.floor(run.queue.nowUs / 1_000_000);
    const timer = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const result = run.phase === "failed" ? " · 容怪超限" : run.result?.reason === "boss-killed" ? " · 已击杀肉山" :
      run.phase === "won" ? " · 超时结算" : recoveryStartedMs === undefined ? "" : " · 正在补算";
    showText(el("resources"), `${run.gold} 金 · ${run.lumber} 木 · 人口 ${run.population}/${run.populationLimit} · 积分 ${spendableScore(run)}${run.killScore ? `（结算 +${run.killScore}）` : ""}`);
    showText(el("event-balance"), `${run.activityScore ?? 0} 活动积分 · ${run.fragments ?? 0} 碎片`);
    showText(el("wave"), run.wave === 0
      ? `${timer} · 首波将在 ${Math.max(0, Math.ceil((waves[0].startUs - run.queue.nowUs) / 1_000_000))} 秒后出怪`
      : `${timer} · 第 ${run.wave}/55 波 · 容怪 ${containmentPoints(run)}/100 · 击杀 ${run.kills ?? 0}${result}`);
    const latestHit = run.recentHits?.at(-1);
    const hitStatus = el("last-hit");
    hitStatus.hidden = latestHit === undefined;
    if (latestHit) {
      const source = [...run.structures, ...(run.summons ?? [])].find(tower => tower.id === latestHit.casterId);
      showText(hitStatus, `${source ? structureName(source.templateId) : latestHit.sourceTemplate ?? "己方塔"} 命中 · ${Math.round(latestHit.amount * 10) / 10} 伤害`);
    }
    const boss = run.enemies.find(enemy => enemy.unitId === "mBOS");
    showText(el("boss"), boss && run.bossDeadlineUs !== null
      ? `肉山 ${Math.ceil(boss.hp).toLocaleString("zh-CN")} 生命 · 剩余 ${Math.ceil((run.bossDeadlineUs - run.queue.nowUs) / 1_000_000)} 秒` : "");
    const benefit = run.lastWorkerBenefit;
    const label = el("worker-benefit-result");
    showText(label, benefit && run.queue.nowUs - benefit.atUs < 8_000_000 ?
      `${benefit.source === "J006" ? "自动发放福利" : "领取福利"} · +${benefit.amount} 金` : "");
    const pauseButton = el("pause");
    const pauseLabel = run.clock.paused ? "继续" : "暂停";
    if (pauseButton.textContent !== pauseLabel) {
      showText(pauseButton, pauseLabel);
      setCommandIcon(pauseButton, run.clock.paused ? "play" : "pause", pauseLabel);
    }
    showText(el("speed"), `${run.clock.speed}×`);
  }
  const selectedBuild = build?.action;
  if (selectedBuild?.type === "build-card" &&
      !run?.cards.some(card => card.id === selectedBuild.cardId && card.slot !== null)) build = undefined;
  if (pointSpell && !run?.structures.some(tower => {
    const action = pointSpell!.action;
    return tower.id === action.towerId && !tower.pending && (action.type === "cast-hero" ? tower.hero?.ranks[action.skillId] :
      towerSpells.get(tower.templateId)?.some(spell => spell.id === action.skillId));
  })) pointSpell = undefined;
  if (scoutWard && (!run?.inventory?.some(item => item.id === scoutWard?.itemId && item.towerId === scoutWard?.towerId && item.slot !== null) ||
    !run.structures.some(tower => tower.id === scoutWard?.towerId && !tower.pending))) scoutWard = undefined;
  if (!writable() || !run?.summons?.some(unit => unit.id === wolfMoveId && unit.summon?.independent)) wolfMoveId = undefined;
  if (!writable() || !run?.structures.some(tower => tower.id === artilleryTowerId && !tower.pending)) artilleryTowerId = undefined;
  const controlStarted = performanceFlag ? performance.now() : 0;
  const locked = !writable();
  el<HTMLButtonElement>("pause").disabled = locked;
  el<HTMLButtonElement>("speed").disabled = locked;
  el<HTMLButtonElement>("restart").disabled = !writer || busy;
  if (commandUI.managementVisible()) showControls();
  const controlMs = performanceFlag ? performance.now() - controlStarted : 0;
  const choosingPoint = wolfMoveId !== undefined || Boolean(pointSpell) || Boolean(scoutWard) || artilleryTowerId !== undefined;
  el("cancel-placement").hidden = !build && !choosingPoint;
  const cancelLabel = choosingPoint ? "取消选择" : "取消放置";
  if (el("cancel-placement").textContent !== cancelLabel) {
    showText(el("cancel-placement"), cancelLabel);
    setCommandIcon(el("cancel-placement"), "close", cancelLabel);
  }
  el("field").classList.toggle("placing", !!build || choosingPoint);
  const renderStarted = performanceFlag ? performance.now() : 0;
  const presented = paintBattlefield();
  const renderMs = performanceFlag ? performance.now() - renderStarted : 0;
  const commandStarted = performanceFlag ? performance.now() : 0;
  commandUI.update(compatibleMap() ? run : undefined);
  if (performanceFlag && run) recordFrame(performanceFlag, run, {
    drainMs, renderMs, controlMs, commandUiMs: performance.now() - commandStarted, frameMs: performance.now() - frameStarted,
    overBudgetSlices: overBudgetSlices.length ? overBudgetSlices.splice(0) : undefined,
    presentedAt: presented ? renderStarted : undefined, queuedStops, rejectedStops: rejectedStops.splice(0), recordedOutcomes,
  });
  scheduleFrame();
}

function paintBattlefield() {
  if (document.hidden || !draw || recoveryStartedMs !== undefined) return false;
  draw(compatibleMap() ? run : undefined, writable() ? build : undefined, wolfMoveId,
    artilleryTowerId !== undefined ? "炮击地面 · 选择落点" : pointSpell ? `${pointSpell.label} · 选择施法地点` :
    scoutWard?.mode === "scout" ? "侦查守卫 · 选择英雄 500 范围内的位置" :
    scoutWard?.mode === "snow" ? "落雪 · 选择施法地点" :
    scoutWard?.mode === "teleport" ? "传送 · 选择落点" : undefined);
  return true;
}

function recordFrame(report: (sample: FramePerformance) => void, state: Match,
                     metrics: Omit<FramePerformance, "phase" | "atUs" | "backlogUs" | "queuedEvents" | "entities">) {
  const enemyCarriers = state.queue.pending.filter(({ payload }) => payload.type === "untouchable-carrier-expire").length;
  report({ ...metrics, phase: state.phase, atUs: state.queue.nowUs, backlogUs: state.clock.targetUs - state.queue.nowUs,
    queuedEvents: state.queue.pending.length, entities: state.structures.length + state.enemies.length +
      (state.summons?.length ?? 0) + (state.detectors?.length ?? 0) + enemyCarriers });
}
document.addEventListener("visibilitychange", scheduleFrame);
document.addEventListener("resume", frame);
scheduleFrame();
