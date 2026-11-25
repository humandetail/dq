import { advanceEvents, cancelEvent, createEventQueue, scheduleEvent, secondsToMicroseconds as us, type EventQueue } from "../event-queue.ts";
import { cardTemplates, chestKeys, chestPools, configuration, directBuilds, firelordSkin, firelordSkillSlots, footprintTowers, itemChargeInheritance, itemChargeStacks, itemExclusions, itemFields, items, lumberVouchers, openingChoices, openingResources, ordinaryGoods, prayerBooks, qualificationChains, rarityPools, recipes, recycleRate, summonCards, towerLevels, towerRadius, waveRewards } from "./content.ts";
import { buildAnchor, buildFootprint, contains, gridSize, map, mapVersion, overlaps, type Disk, type Point } from "./map.ts";
import { moveUnits, movementStepUs, movementSweep, type Mobile } from "./movement.ts";
import { findApproachPath, nearestSpawn, segmentDistanceSquared } from "./pathfinding.ts";
import { addHeroExperience, bookExperience, learnHeroSkill, newHero, type Hero } from "./hero.ts";
import { creditSeason, type Season, type Seasons } from "./seasons.ts";
import { towerSpells } from "./tower-spells.ts";
import { talentChoices, talentRules, promotionWaves } from "./talents.ts";
import { challengeGoods, challengeTemplates, drawMysteryStock, mysteryWaves } from "./shops.ts";
import { criticalMultipliers, effectiveAttributes, equipmentAttackSpeed, flatAttack, killExperience, physicalDamage, unitBalance, unitTargetType, weapons, welfareGold, type Weapon, type WeaponShot } from "./combat.ts";
import { enemySpells, type EnemySpellId } from "./enemy-effects.ts";
import { heroSpells, type HeroSpell, type SpellSweep } from "./hero-spells.ts";
import itemResources from "../../../docs/rules/item-resources-batch-01.json" with { type: "json" };
import itemRegeneration from "../../../docs/rules/item-regeneration-batch-01.json" with { type: "json" };
import { waves, welfareTemplates } from "./waves.ts";

type TalentCast = { type: "cast-talent"; towerId?: number };

export type Action =
  | { type: "choose-talent"; choice: string }
  | TalentCast
  | { type: "choose-opening"; card: string }
  | { type: "build-worker-tower"; tower: keyof typeof directBuilds; point: Point }
  | { type: "build-card"; cardId: number; point: Point }
  | { type: "draw"; draw: keyof typeof configuration.cardRolls }
  | { type: "buy-weight"; card: string }
  | { type: "pick-up-card" | "drop-card"; cardId: number }
  | { type: "swap-worker-slots"; from: number; to: number }
  | { type: "exchange"; qualification: string }
  | { type: "upgrade-tower"; towerId: number }
  | { type: "use-item"; itemId: number; targetId?: number }
  | { type: "pick-up-item" | "drop-item"; itemId: number }
  | { type: "transfer-item"; itemId: number; towerId?: number }
  | { type: "buy-item"; itemId: string }
  | { type: "buy-special"; shop: "challenge" | "mystery"; itemId: string }
  | { type: "reserve-challenge"; unitId: string }
  | { type: "overdraft" }
  | { type: "claim-wave"; slot: number }
  | { type: "buy-book"; bookId: BookId }
  | { type: "use-book"; itemId: number; towerId: number }
  | { type: "learn-skill"; towerId: number; skillId: string }
  | { type: "cast-tower"; towerId: number; skillId: string }
  | { type: "stop-tower-cast"; towerId: number }
  | { type: "cast-flame-arrow"; towerId: number; targetId: number }
  | { type: "cast-hero"; towerId: number; skillId: HeroSpell }
  | { type: "cast-equipment"; itemId: number; towerId: number }
  | { type: "choose-skin"; towerId: number; choice: string }
  | { type: "toggle-flame-arrows"; towerId: number }
  | { type: "recycle-tower"; towerId: number }
  | { type: "cancel-construction"; towerId: number };

type Command = { id: string; matchId: string; action: Action };
type Result = { ok: true; createdId?: number } | { ok: false; reason: "opening" | "placement" | "resources" | "missing" | "full" | "materials" | "closed" | "learning" | "range" | "stock" | "cooldown" | "equipment" };
type MatchEvent =
  | { type: "movement" }
  | { type: "weapon-fire"; towerId: number; targetId: number; slot: number; startedUs?: number }
  | { type: "weapon-ready"; towerId: number }
  | { type: "weapon-impact"; shot: WeaponShot; travelUs: number }
  | { type: "immolation"; towerId: number }
  | { type: "equipment-lightning"; towerId: number; targetId: number; itemId: "i173" | "i177" }
  | { type: "equipment-burn" }
  | { type: "tower-spell"; towerId: number; skillId: string; point: Point; targetId?: number }
  | { type: "sword-rain-emit"; towerId: number; token: number; skillId: string; center: Point; direction: Point; amount: number; remaining: number }
  | { type: "sword-rain-travel"; towerId: number; skillId: string; origin: Point; direction: Point; amount: number; from: number; distance: number; length: number }
  | { type: "hero-spell"; towerId: number; targetId: number; skillId: HeroSpell; point: Point }
  | { type: "spell-sweep"; sweep: SpellSweep }
  | { type: "contract-expire"; towerId: number; token: number }
  | { type: "magic-arrow"; towerId: number; targetId: number; point: Point; rank: number; scepter: boolean }
  | { type: "magic-arrow-restore"; towerId: number; targetId: number; token: number; amount: number }
  | { type: "summon-expire"; unitId: number }
  | { type: "detector-expire"; unitId: number }
  | { type: "mana-debt"; towerId: number; amount: number }
  | { type: "hero-leash"; towerId: number; targetId: number; point: Point; token: number; rank: number; primary: boolean; tick: number }
  | { type: "spell-zones"; towerId: number; skillId: "A171" | "A172"; token: number; centers: Point[]; rank: number; remaining: number; hit: number[] }
  | { type: "tree-grab-expire"; towerId: number; buffId: number }
  | { type: "avalanche"; towerId: number; point: Point; rank: number; skillId: string }
  | { type: "stun-expire"; enemyId: number }
  | { type: "frost-expire"; enemyId: number }
  | { type: "enemy-cast"; enemyId: number; skill: EnemySpellId; point: Point }
  | { type: "enemy-speed-expire"; enemyId: number }
  | { type: "enemy-form-end"; enemyId: number }
  | { type: "enemy-egg-end"; enemyId: number; eggId: number }
  | { type: "commit-talent"; command: Command & { action: TalentCast } }
  | { type: "start-wave"; index: number }
  | { type: "spawn"; index: number }
  | { type: "stop-wave"; index: number }
  | { type: "welfare-spawn"; index: number; second: boolean }
  | { type: "welfare-end"; index: number }
  | { type: "challenge-spawn"; challengeId: number }
  | { type: "boss-timeout" }
  | { type: "command"; command: Command }
  | { type: "finish-construction"; towerId: number };

export type Enemy = Mobile & {
  unitId: string;
  points: number;
  hp: number;
  mana: number;
  armor: number | null;
  maxHp?: number;
  manaMax?: number;
  manaTickUs?: number;
  spellReady?: Partial<Record<EnemySpellId, number>>;
  spellCastingUntilUs?: number;
  speedBuffUntilUs?: number;
  sprintUntilUs?: number;
  phaseUntilUs?: number;
  evasionUntilUs?: number;
  invisibleFromUs?: number;
  barrier?: { hits?: number; damage?: number; untilUs: number };
  purgeDamage?: number;
  form?: { unitId: string; lifeDelta: number; armorDelta: number; speed: number; manaMax: number; abilities: string[] };
  eggParentId?: number;
  healthTickUs?: number;
  armorBuff?: { value: number; untilUs: number };
  spellShieldReadyUs?: number;
  waveArmor?: { amount: number; expiresUs: number };
  howlArmor?: { amount: number; expiresUs: number };
  corrosion?: { value: number; untilUs: number };
  wave: number;
  welfare?: true;
  challengeId?: number;
  abilities?: string[];
  shield?: true;
  graveUntilUs?: number;
  overdraftArmor?: number;
};

type BookId = typeof prayerBooks[number]["id"];
type Book = { id: number; bookId: BookId; slot: number; charges: number };

type Card = { id: number; card: string; slot: number | null; point: Point; hp: number; charges: number };
type Item = { id: number; itemId: string; slot: number | null; point: Point; charges: number; towerId?: number };

type Cost = { gold: number; wood: number; population: number };
type Construction = Disk & {
  id: number;
  templateId: string;
  population: number;
  qualification: string | null;
  hero?: Hero;
  attack?: { targetId: number; readyUs: number; winding: boolean; startedUs: number; flameBonus?: number };
  lastAttackUs?: number;
  lastAttackTarget?: Point;
  multishotReadyUs?: number;
  strafeUntilUs?: number;
  frenzyUntilUs?: number;
  frenzyReadyUs?: number;
  contracts?: Record<number, number>;
  flameArrows?: boolean;
  flameTarget?: number;
  avalancheReadyUs?: number;
  mana?: number;
  manaLastUs?: number;
  equipmentLightningReadyUs?: number;
  equipmentVolleyReadyUs?: number;
  heroSpellReady?: Partial<Record<HeroSpell, number>>;
  towerSpellReady?: Record<string, number>;
  heroCastUntilUs?: number;
  swordRainToken?: number;
  icePathToken?: number;
  magicArrowToken?: number;
  leashToken?: number;
  summon?: { ownerId: number; attack: number; speed: number; green: number; blue: number; skillId?: string;
    independent?: true; projectileGroup?: { extra: number; range: number; speed: number } };
  necromancyReadyUs?: number;
  manaPotionUntilUs?: number;
  manaPotionReadyUs?: number;
  soulRingReadyUs?: number;
  manaMaximum?: number;
  manaRegen?: number;
  tauntedTarget?: number;
  stunnedUntilUs?: number;
  armorFrostUntilUs?: number;
  weakenedUntilUs?: number;
  treeGrab?: { readyUs: number; cleaveUntilUs: number; strength: Record<number, number> };
  pending: null | {
    timer: number;
    cost: Cost;
    upgradeTo?: string;
    consumedCard?: Card;
  };
};

export type Match = {
  matchId: string;
  mapVersion?: string;
  seed: number;
  randomState: number;
  queue: EventQueue<MatchEvent>;
  clock: { targetUs: number; fractionUs: number; speed: 1 | 4; paused: boolean };
  phase: "running" | "failed" | "won";
  result?: { reason: "capacity" | "timeout" | "boss-killed"; atUs: number; points?: number };
  worker: Point;
  approach: { command: Command; point: Point; path: Point[]; range?: number } | null;
  wave: number;
  batch: number;
  totalArrivals: number;
  bossArrivalUs: number | null;
  bossDeadlineUs: number | null;
  nextId: number;
  openingCard: string | null;
  cards: Card[];
  inventory?: Item[];
  openingChoicesUnlocked?: boolean;
  chestReadyUs?: number;
  openedChests?: number;
  seasons?: Seasons;
  seasonScore?: number;
  seasonRevision?: number;
  seasonalFourHeroes?: true;
  seasonalChallengeUnlocks?: number;
  transmuteReadyUs?: number;
  waveRewardSlots?: number[];
  charmUsed?: boolean;
  charmReadyUs?: number;
  forgedSwords?: number;
  books?: Book[];
  bookRestock?: Partial<Record<BookId, number[]>>;
  shopRestock?: Record<string, number[]>;
  blackWeights: Record<string, number>;
  luckLevel: number;
  talent?: { id: string; rank: number; readyUs: number; busyUntilUs: number };
  gold: number;
  lumber: number;
  populationLimit: number;
  population: number;
  challengeShopOpen: boolean;
  qualificationShopOpen: boolean;
  mysteryShopOpen: boolean;
  mysteryStock?: Record<string, number>;
  mysteryRefreshed?: boolean;
  challengeStock?: Record<string, number>;
  challengeStages?: number[];
  challengeReadyUs?: number;
  challenges?: Record<number, { unitId: string; remaining: number; timer: number }>;
  challengeScore?: number;
  kills?: number;
  equipmentBurnTimer?: number;
  recentHits?: { atUs: number; x: number; y: number; targetId: number; casterId: number; amount: number; deadUnitId?: string }[];
  killScore?: number;
  welfareDamage?: number;
  lastWelfareGold?: number;
  finalHit?: { towerId?: number; sourceTemplate?: string; targetId: number; amount: number; hpBefore: number; atUs: number; skillId?: string };
  overdraftOpen: boolean;
  overdraftPoints?: number;
  activeOverdraft?: number;
  enemies: Enemy[];
  structures: Construction[];
  summons?: Construction[];
  detectors?: (Point & { id: number; ownerId: number })[];
  commandResults: Record<string, Result>;
  spawner: number | null;
};

function creditTask(state: Match, season: Season, id: number, amount = 1) {
  if (!state.seasons) return;
  const before = state.seasons[season].counts[id];
  const score = creditSeason(state.seasons, season, id, amount);
  if (state.seasons[season].counts[id] !== before) state.seasonRevision = (state.seasonRevision ?? 0) + 1;
  if (score) state.seasonScore = (state.seasonScore ?? 0) + score;
}

export function newMatch(matchId: string, seed: number, seasons?: Seasons): Match {
  const queue = createEventQueue<MatchEvent>();
  scheduleEvent(queue, movementStepUs, { type: "movement" }, movementStepUs);
  scheduleEvent(queue, waves[0].startUs, { type: "start-wave", index: 0 });
  const state: Match = {
    matchId, mapVersion, seed: seed >>> 0, randomState: seed >>> 0, queue,
    clock: { targetUs: 0, fractionUs: 0, speed: 1, paused: false },
    phase: "running", waveRewardSlots: [0, 0, 0, 0, 0], worker: { ...map.worker }, approach: null, wave: 0, batch: 0, totalArrivals: 0, bossArrivalUs: null, bossDeadlineUs: null, nextId: 1,
    openingCard: null, openingChoicesUnlocked: false, cards: [], inventory: [], books: [], shopRestock: {}, ...openingResources,
    blackWeights: Object.fromEntries(configuration.cardPools.SR.map(id => [id, 100])), luckLevel: 0, population: 0,
    challengeShopOpen: false, qualificationShopOpen: false, mysteryShopOpen: false,
    overdraftOpen: false, enemies: [], structures: [], commandResults: {}, spawner: null,
  };
  for (let index = 0; index < waveRewards.length * 4; index++) roll(state);
  if (seasons) state.seasons = structuredClone(seasons);
  deliverItem(state, "i004");
  deliverItem(state, "i006");
  return state;
}

export function containmentPoints(state: Match) {
  return state.enemies.reduce((sum, enemy) => sum + (contains(map.containment, enemy) ? enemy.points : 0), 0);
}

function spawn(state: Match, stats: Omit<Enemy, keyof Mobile> & Pick<Mobile, "layer" | "speed" | "radius">, activity = false, anchor?: Enemy) {
  const enemy: Enemy = {
    ...stats, ...(anchor ? { x: anchor.x, y: anchor.y } : nearestSpawn(activity ? map.activityEntry : map.entry, stats.radius, stats.layer)), id: state.nextId++,
    previousWaypoint: anchor?.previousWaypoint ?? null, waypoint: anchor?.waypoint ?? (activity ? map.activityWaypoint : map.entryWaypoint), initialOverlaps: [],
  };
  for (const other of state.enemies) {
    if (other.layer === enemy.layer && overlaps(other, enemy)) {
      enemy.initialOverlaps.push(other.id);
      other.initialOverlaps.push(enemy.id);
    }
  }
  enemy.maxHp = enemy.hp;
  enemy.manaMax = enemy.mana;
  enemy.manaTickUs = state.queue.nowUs;
  if (enemy.abilities?.includes("N512") && enemy.mana >= 10) {
    enemy.mana -= 10;
    enemy.shield = true;
  }
  state.enemies.push(enemy);
  return enemy;
}

function spawnBatch(state: Match, index: number) {
  const wave = waves[index];
  const { unitId, layer, speed, radius, points, hp, armor, mana } = wave;
  const overdraft = state.activeOverdraft ?? 0;
  const boss = wave.abilities.includes("N534") && unitBalance.get(unitId)?.type === "sapper";
  const hpFactor = boss ? 0.1 : 0.2;
  const armorFactor = boss ? 0.01 : 0.02;
  const reductionLevels = boss ? Math.floor(overdraft / 3) : overdraft;
  for (let count = 0; count < wave.unitsPerBatch; count++) {
    spawn(state, { unitId, layer, speed, radius, points, hp: hp * (1 + hpFactor * overdraft),
      armor: armor === null ? null : armor * (1 + armorFactor * overdraft), mana,
      wave: wave.number, abilities: wave.abilities, overdraftArmor: reductionLevels });
    state.totalArrivals++;
  }
  state.batch++;
}

function startWave(state: Match, index: number) {
  const wave = waves[index];
  state.wave = wave.number;
  state.batch = 0;
  const rewards = state.waveRewardSlots ??= [0, 0, 0, 0, 0];
  for (const [slot, reward] of waveRewards.entries()) {
    if (state.wave >= reward.claimable) rewards[slot] = Math.max(rewards[slot], 2);
    else if (state.wave >= reward.shown) rewards[slot] = Math.max(rewards[slot], 1);
  }
  if (state.wave === 11) state.challengeShopOpen = true;
  if (state.wave === 54) {
    if (state.overdraftPoints) creditTask(state, "summer", 2);
    state.challengeShopOpen = false;
    for (const challenge of Object.values(state.challenges ?? {})) cancelEvent(state.queue, challenge.timer);
    state.challenges = {};
    state.challengeStock = {};
    state.enemies = state.enemies.filter(enemy => enemy.challengeId === undefined);
  }
  if (state.wave === 20) state.qualificationShopOpen = true;
  if (mysteryWaves.includes(state.wave)) {
    state.mysteryShopOpen = true;
    state.mysteryStock = drawMysteryStock(() => roll(state));
  }
  if (state.wave >= 11 && state.wave <= 41 && state.wave % 10 === 1) {
    state.populationLimit = Math.min(100, 30 + 2 * (state.wave - 1));
  }
  if (state.wave >= 11 && state.wave <= 47) {
    if (state.wave % 5 === 1 && state.wave <= 46) state.overdraftOpen = true;
    if (state.wave % 5 === 2 && state.wave >= 12) {
      state.overdraftOpen = false;
      state.activeOverdraft = state.overdraftPoints;
    }
  }
  if (state.wave === 53) state.bossArrivalUs = waves[54].startUs;
  if (wave.deadlineUs !== null) {
    state.overdraftOpen = false;
    state.activeOverdraft = 0;
  }

  // The first spawn and the C01 check are one callback, including at wave 55.
  spawnBatch(state, index);
  const points = containmentPoints(state);
  if (points > 100) {
    state.phase = "failed";
    state.result = { reason: "capacity", points, atUs: state.queue.nowUs };
    commitKillScore(state);
    return false;
  }
  if (promotionWaves.includes(state.wave)) {
    if (state.talent) {
      state.talent.rank++;
      if (state.talent.id === "W017") state.luckLevel = state.talent.rank;
      if (state.talent.id === "W019") {
        for (const tower of state.structures) if (tower.hero) applyTalentAttributes(tower.hero, state.talent.rank);
      }
    }
    deliverItem(state, state.wave < 30 ? "i003" : "i005");
  }
  if (wave.deadlineUs !== null) {
    state.bossDeadlineUs = wave.deadlineUs;
    scheduleEvent(state.queue, wave.deadlineUs - state.queue.nowUs, { type: "boss-timeout" });
  }
  if (wave.windowUs > 0) {
    scheduleEvent(state.queue, wave.windowUs, { type: "stop-wave", index });
    state.spawner = scheduleEvent(state.queue, wave.intervalUs, { type: "spawn", index }, wave.intervalUs);
  }
  if (wave.welfareUs !== null) {
    const delay = wave.welfareUs - state.queue.nowUs;
    scheduleEvent(state.queue, delay, { type: "welfare-spawn", index, second: false });
    scheduleEvent(state.queue, delay + us(0.95), { type: "welfare-spawn", index, second: true });
    scheduleEvent(state.queue, delay + us(20), { type: "welfare-end", index });
  }
  const next = waves[index + 1];
  if (next) scheduleEvent(state.queue, next.startUs - state.queue.nowUs, { type: "start-wave", index: index + 1 });
}

function roll(state: Match) {
  state.randomState = (Math.imul(state.randomState, 1664525) + 1013904223) >>> 0;
  return state.randomState / 2 ** 32;
}

function rollPercent(state: Match) {
  return 1 + Math.floor(roll(state) * 100);
}

function freeWorkerSlot(state: Match) {
  return [0, 1, 2, 3, 4, 5].find(slot => state.cards.every(card => card.slot !== slot) &&
    !state.books?.some(book => book.slot === slot) && !state.inventory?.some(item => item.towerId === undefined && item.slot === slot)) ?? null;
}

function deliverCard(state: Match, card: string, point = state.worker, refundHp?: number) {
  const item = summonCards.get(card)?.itemFields;
  if (!item || item.HP === null || item.uses === null) throw new Error(`Missing M2 summon card ${card}`);
  const id = state.nextId++;
  state.cards.push({ id, card, slot: freeWorkerSlot(state), point: { x: point.x, y: point.y },
    hp: refundHp ?? item.HP, charges: refundHp === undefined ? item.uses : 1 });
  return id;
}

export function canChooseOpening(state: Match) {
  return state.openingCard === null && state.openingChoicesUnlocked !== false;
}

function removeItem(state: Match, item: Item) {
  state.inventory!.splice(state.inventory!.indexOf(item), 1);
}

export const circleId = 0;
const circle: Construction = { ...map.energyCircle, id: circleId, radius: 0, templateId: "w000", population: 0, qualification: null, pending: null };

const brokenSwords = new Map([["i131", "i132"], ["i133", "i134"], ["i262", "i263"]]);
const workerOnlyItems = new Set(["i256", "i329", "i278", "i131", "i133", "i262"]);
const recycleDestroyedItems = new Set(["i547", "i548", "i549", "i550", "i546", "i330", "i004", "i545"]);

function energyCircle(tower: Construction) {
  return tower.templateId === "w000";
}

function equipmentAllowed(state: Match, itemId: string, tower: Construction) {
  if (energyCircle(tower)) return itemId !== "i256" && itemId !== "i278";
  const level = itemFields.get(itemId)?.Level ?? 0;
  return !workerOnlyItems.has(itemId) && level <= 10 && (level <= 3 || qualified(state, tower.id));
}

function freeItemSlot(state: Match, tower?: Construction) {
  if (!tower) return freeWorkerSlot(state);
  return [0, 1, 2, 3, 4, 5].find(slot =>
    !state.inventory?.some(item => item.towerId === tower.id && item.slot === slot)) ?? null;
}

function itemOwner(state: Match, towerId: number | undefined) {
  return towerId === circleId ? circle : state.structures.find(tower => tower.id === towerId);
}

export function canMoveItem(itemId: string) {
  return itemId !== "i330" && itemFields.get(itemId)?.droppable === 1;
}

function dropItem(state: Match, item: Item) {
  const owner = itemOwner(state, item.towerId) ?? state.worker;
  item.slot = null;
  item.point = { x: owner.x, y: owner.y };
  delete item.towerId;
}

function finishPickup(state: Match, item: Item, tower?: Construction): number {
  if (item.itemId === "i330" && (!tower || energyCircle(tower))) {
    removeItem(state, item);
    return deliverItem(state, "i332", undefined, tower);
  }

  const books = state.books ??= [];
  const carried = [
    ...state.inventory!.filter(entry => entry.slot !== null && entry.towerId === tower?.id),
    ...(!tower ? books : []),
  ].sort((a, b) => a.slot! - b.slot!);
  const typeOf = (entry: Item | Book) => "itemId" in entry ? entry.itemId : entry.bookId;
  for (const [result, materials] of recipes) {
    if (result !== item.itemId && !materials.includes(item.itemId)) continue;
    const matched = new Set<Item | Book>();
    for (const material of materials) {
      const entry = carried.find(candidate => typeOf(candidate) === material && !matched.has(candidate));
      if (!entry) break;
      matched.add(entry);
    }
    if (matched.size !== materials.length) continue;

    let inherited = 0;
    for (const entry of matched) {
      const transfers = entry.charges > 0 && itemChargeInheritance.has(typeOf(entry));
      if (transfers) inherited = entry.charges;
      if (transfers || entry.charges <= 1) {
        if ("itemId" in entry) removeItem(state, entry);
        else books.splice(books.indexOf(entry), 1);
      } else {
        entry.charges--;
      }
    }
    return deliverItem(state, result, itemChargeInheritance.has(result) && inherited > 0 ? inherited : undefined, tower);
  }

  if (tower && !energyCircle(tower) && itemExclusions.some(group => group.includes(item.itemId) &&
      carried.some(entry => entry !== item && group.includes(typeOf(entry))))) {
    dropItem(state, item);
    return item.id;
  }
  if (itemChargeStacks.has(item.itemId)) {
    const old = carried.find(candidate => candidate !== item && typeOf(candidate) === item.itemId);
    if (old) {
      old.charges += item.charges;
      removeItem(state, item);
      return old.id;
    }
  }
  const book = prayerBooks.find(book => book.id === item.itemId);
  if (book && !tower) {
    books.push({ id: item.id, bookId: book.id, slot: item.slot!, charges: item.charges });
    removeItem(state, item);
  }
  return item.id;
}

function deliverItem(state: Match, itemId: string, charges?: number, tower?: Construction): number {
  if (cardTemplates.has(itemId)) return deliverCard(state, itemId);
  const lumber = lumberVouchers.get(itemId);
  if (lumber !== undefined) {
    state.lumber += lumber;
    return state.nextId++;
  }
  const fields = itemFields.get(itemId);
  if (!fields) throw new Error(`Missing M2 item ${itemId}`);
  const point = tower ?? state.worker;
  const slot = tower && !equipmentAllowed(state, itemId, tower) ? null : freeItemSlot(state, tower);
  const item: Item = { id: state.nextId++, itemId, slot,
    charges: charges ?? fields.uses ?? 0, point: { x: point.x, y: point.y } };
  if (tower && slot !== null) item.towerId = tower.id;
  (state.inventory ??= []).push(item);
  return item.slot === null ? item.id : finishPickup(state, item, tower);
}

function drawPurchasedCard(state: Match, draw: keyof typeof configuration.cardRolls) {
  if (rollPercent(state) <= configuration.luckPercentByLevel[state.luckLevel]) {
    deliverCard(state, drawCard(state, draw));
  }
  return deliverCard(state, drawCard(state, draw));
}

export function usableWorkerItem(itemId: string) {
  return itemId === "i256" || itemId === "i004" || itemId === "i006" || itemId === "i278" || chestKeys.has(itemId) || Object.hasOwn(configuration.cardRolls, itemId);
}

export function transmuteTargets(state: Match) {
  const now = state.queue.nowUs;
  return state.enemies.filter(enemy => !/^[A-Z]/.test(enemy.unitId) &&
    targetable(enemy, ["ground", "air", "structure"], now) && canSeeEnemy(state, enemy) &&
    (enemy.x - state.worker.x) ** 2 + (enemy.y - state.worker.y) ** 2 <= 500 ** 2 &&
    unitBalance.get(enemy.unitId)?.level !== undefined);
}

function useWorkerItem(state: Match, item: Item, targetId?: number): Result {
  const inventory = state.inventory!;
  const remove = (entry: Item) => inventory.splice(inventory.indexOf(entry), 1);

  function consumeCharge() {
    item.charges--;
    if (item.charges === 0) remove(item);
  }
  if (item.itemId === "i256") {
    if (state.queue.nowUs < (state.transmuteReadyUs ?? 0)) return { ok: false, reason: "cooldown" };
    const target = transmuteTargets(state).find(enemy => enemy.id === targetId);
    if (!target) return { ok: false, reason: "range" };
    const reward = unitBalance.get(target.unitId)!.level! * 300;
    state.transmuteReadyUs = state.queue.nowUs + us(300);
    target.hp = 0;
    removeDeadEnemy(state, target.id);
    state.gold += reward;
    creditTask(state, "summer", 6);
    return { ok: true };
  }
  if (item.itemId === "i004") {
    if (item.charges < 1) return { ok: false, reason: "missing" };
    rollPercent(state);
    for (const id of ["i401", "i411", "i411", "i412"]) deliverItem(state, id);
    state.openingChoicesUnlocked = true;
  } else if (item.itemId === "i278") {
    if (item.charges < 1) return { ok: false, reason: "missing" };
    if (state.queue.nowUs < (state.charmReadyUs ?? 0)) return { ok: false, reason: "cooldown" };
    state.charmReadyUs = state.queue.nowUs + us(1);
    consumeCharge();
    if (state.charmUsed) return { ok: true };
    state.charmUsed = true;
    for (const enemy of [...state.enemies]) {
      if (state.phase !== "running") break;
      enemy.hp = 0;
      removeDeadEnemy(state, enemy.id);
    }
    return { ok: true };
  } else if (item.itemId === "i006") {
    if (item.charges < 1) return { ok: false, reason: "missing" };
    const chance = rollPercent(state);
    deliverItem(state, chance <= 32 ? "i131" : chance <= 65 ? "i133" : "i262");
  } else if (Object.hasOwn(configuration.cardRolls, item.itemId)) {
    if (item.charges < 1) return { ok: false, reason: "missing" };
    const createdId = drawPurchasedCard(state, item.itemId as keyof typeof configuration.cardRolls);
    consumeCharge();
    return { ok: true, createdId };
  } else {
    const chestId = chestKeys.get(item.itemId);
    if (!chestId) return { ok: false, reason: "missing" };
    if (state.queue.nowUs < (state.chestReadyUs ?? 0)) return { ok: false, reason: "cooldown" };
    state.chestReadyUs = state.queue.nowUs + us(1);
    const chest = inventory.filter(entry => entry.itemId === chestId && entry.slot !== null && entry.towerId === undefined)
      .sort((a, b) => a.slot! - b.slot!)[0];
    if (!chest) return { ok: false, reason: "materials" };
    remove(item);
    remove(chest);
    const groups = chestPools.get(chestId)!;
    const weight = groups.reduce((sum, group) => sum + group.weight, 0);
    let selection = Math.floor(roll(state) * weight);
    const group = groups.find(group => (selection -= group.weight) < 0)!;
    const createdId = deliverItem(state, group.entries[Math.floor(roll(state) * group.entries.length)]);
    state.openedChests = (state.openedChests ?? 0) + 1;
    creditTask(state, "summer", 3);
    return { ok: true, createdId };
  }
  consumeCharge();
  return { ok: true };
}

function drawCard(state: Match, draw: keyof typeof configuration.cardRolls) {
  const chance = rollPercent(state);
  const range = configuration.cardRolls[draw].ranges.find(([min, max]) => chance >= Number(min) && chance <= Number(max));
  const rarity = String(range![2]);
  if (draw === "i005") creditTask(state, "summer", 4);
  if (rarity === "SSR") creditTask(state, "summer", 9);
  const pool = rarityPools.get(rarity)!;
  if (draw === "i005" && rarity === "SR") {
    const total = pool.reduce((sum, card) => sum + state.blackWeights[card], 0);
    let needle = Math.floor(roll(state) * total);
    const selected = pool.find(card => (needle -= state.blackWeights[card]) < 0)!;
    state.blackWeights[selected] = 100;
    return selected;
  }
  return pool[Math.floor(roll(state) * pool.length)];
}

function canPay(state: Match, cost: Cost) {
  return state.gold >= cost.gold && state.lumber >= cost.wood && state.population + cost.population <= state.populationLimit;
}

function pay(state: Match, cost: Cost, direction: 1 | -1) {
  state.gold -= direction * cost.gold;
  state.lumber -= direction * cost.wood;
  state.population += direction * cost.population;
}

export function inspectBuildPlacement(state: Match, action: Extract<Action, { type: "build-card" | "build-worker-tower" }>) {
  const card = action.type === "build-card" ? state.cards.find(card => card.id === action.cardId && card.slot !== null && card.charges > 0) : undefined;
  const templateId = action.type === "build-card" ? cardTemplates.get(card?.card ?? "")?.root : action.tower;
  const build = action.type === "build-worker-tower" && Object.hasOwn(directBuilds, action.tower) ? directBuilds[action.tower] : undefined;
  if (!templateId || (!card && !build)) return { ok: false as const, reason: "missing" as const };
  const fields = towerLevels.get(templateId)!.fields;
  if (!fields.fused) throw new Error(`Missing M2 population for ${templateId}`);
  const cost = { gold: build?.gold ?? 0, wood: build?.wood ?? 0, population: fields.fused.value };
  const disk = buildAnchor(action.point, towerRadius, state.structures,
    state.structures.filter(tower => footprintTowers.has(tower.templateId)).map(buildFootprint), footprintTowers.has(templateId));
  if (!disk) return { ok: false as const, reason: "placement" as const };
  if ((card && state.population + card.hp > state.populationLimit) || !canPay(state, cost)) {
    return { ok: false as const, reason: "resources" as const };
  }
  return { ok: true as const, disk, templateId, cost, card, seconds: build?.seconds ?? fields.bldtm.value };
}

function construct(state: Match, action: Extract<Action, { type: "build-card" | "build-worker-tower" }>): Result {
  const result = inspectBuildPlacement(state, action);
  if (!result.ok) return result;
  const { disk, templateId, cost, card, seconds } = result;
  const id = state.nextId++;
  const timer = scheduleEvent(state.queue, us(seconds), { type: "finish-construction", towerId: id });
  state.structures.push({
    ...disk, id, templateId, population: cost.population, qualification: null,
    pending: { timer, cost, consumedCard: card && { ...card } },
  });
  pay(state, cost, 1);
  if (card && --card.charges === 0) state.cards.splice(state.cards.indexOf(card), 1);
  return { ok: true, createdId: id };
}

export function qualified(state: Match, towerId: number) {
  const tower = state.structures.find(tower => tower.id === towerId);
  const chain = qualificationChains.get(tower?.qualification ?? "");
  return !!chain && state.structures.some(provider => provider.templateId === chain.requireUnit && (!provider.pending || provider.pending.upgradeTo !== undefined));
}

// Domain entry for direct item rewards and enemy death experience.
export function grantHeroExperience(state: Match, towerId: number, amount: number) {
  if (state.phase !== "running") return;
  const tower = state.structures.find(entry => entry.id === towerId);
  if (!tower?.hero || tower.pending) return;
  addHeroExperience(tower.hero, tower.templateId, amount, () => qualified(state, towerId), () => {
    if (state.talent?.id === "W019") applyTalentAttributes(tower.hero!, state.talent.rank);
  });
}

export function restoreHeroState(state: Match) {
  for (const tower of state.structures) {
    if (tower.hero === undefined && !tower.pending) {
      const hero = newHero(tower.templateId);
      if (hero) tower.hero = hero;
    }
  }
}

function applyTalentAttributes(hero: Hero, rank: number) {
  hero.talentAttributes = Math.floor((0.5 * rank + 0.5) * hero.level);
}

export function talentHeroDamageFactor(state: Match, towerId: number) {
  return state.talent?.id === "W013" && state.structures.some(tower => tower.id === towerId && tower.hero)
    ? talentRules.get("W013")!.heroDamageFactor![state.talent.rank - 1] : 1;
}

export function talentMonsterKillGold(state: Match) {
  return state.talent?.id === "W015" ? talentRules.get("W015")!.goldPerMonsterKill![state.talent.rank - 1] : 0;
}

function relocation(state: Match, tower: Construction) {
  const buildable = (point: Point) => map.buildAreas.some(area => contains(area, point)) &&
    !map.obstacles.some(area => contains(area, point));
  let request = state.worker;
  if (!buildable(request)) {
    const fallback = Array.from({ length: 13 }, (_, index) => {
      const angle = index * Math.PI / 6;
      return { x: state.worker.x + 250 * Math.cos(angle), y: state.worker.y + 250 * Math.sin(angle) };
    }).find(buildable);
    if (!fallback) return false;
    request = fallback;
  }

  const others = state.structures.filter(entry => entry !== tower);
  const footprints = others.filter(entry => footprintTowers.has(entry.templateId)).map(buildFootprint);
  const fit = (point: Point) => buildAnchor(point, tower.radius, others, footprints, footprintTowers.has(tower.templateId), false);
  let destination = fit(request);
  if (!destination) {
    const grid: Array<Point & { distance: number }> = [];
    for (let y = Math.ceil((request.y - 250) / gridSize) * gridSize; y <= request.y + 250; y += gridSize) {
      for (let x = Math.ceil((request.x - 250) / gridSize) * gridSize; x <= request.x + 250; x += gridSize) {
        const distance = (x - request.x) ** 2 + (y - request.y) ** 2;
        if (distance <= 250 ** 2) grid.push({ x, y, distance });
      }
    }
    grid.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
    for (const candidate of grid) {
      destination = fit(candidate);
      if (destination) break;
    }
  }
  if (destination) Object.assign(tower, destination);
  return true;
}

function talentTarget(state: Match, action: TalentCast) {
  return state.structures.find(tower => tower.id === action.towerId && !tower.pending && !energyCircle(tower) &&
    Math.hypot(tower.x - state.worker.x, tower.y - state.worker.y) <= 9999);
}

function commitTalent(state: Match, action: TalentCast): Result {
  const talent = state.talent!;
  const rules = talentRules.get(talent.id)!;
  const tower = talentTarget(state, action);
  if (talent.id === "W018" && !tower) return { ok: false, reason: "missing" };
  talent.readyUs = state.queue.nowUs + us(rules.cooldown![talent.rank - 1]);
  talent.busyUntilUs = state.queue.nowUs + us(0.51);
  const fail = (reason: "materials" | "placement"): Result => {
    talent.readyUs = state.queue.nowUs + us(0.1);
    return { ok: false, reason };
  };
  if (talent.id === "W012") {
    const card = state.cards.find(entry => entry.slot === 0);
    const pool = card && ["N", "R", "SR"].map(tier => rarityPools.get(tier)!).find(pool => pool.includes(card.card));
    if (!card || !pool || pool.length < 2) return fail("materials");
    const offset = 1 + Math.floor(roll(state) * (pool.length - 1));
    state.cards.splice(state.cards.indexOf(card), 1);
    return { ok: true, createdId: deliverCard(state, pool[(pool.indexOf(card.card) + offset) % pool.length]) };
  }
  if (talent.id === "W014") {
    const [low, high] = rules.rarityIntervals![talent.rank - 1];
    const tier = () => low === high ? low : low + Math.floor(roll(state) * (high - low + 1));
    deliverItem(state, rules.boxIds![tier() - 1]);
    return { ok: true, createdId: deliverItem(state, rules.keyIds![tier() - 1]) };
  }
  if (talent.id === "W016") {
    for (const [level, rarity] of [[11, "R"], [12, "SR"]] as const) {
      const materials = state.cards.filter(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === level)
        .sort((a, b) => a.slot! - b.slot!).slice(0, 4);
      if (materials.length < 4) continue;
      const pool = rarityPools.get(rarity)!;
      state.cards = state.cards.filter(card => !materials.includes(card));
      return { ok: true, createdId: deliverCard(state, pool[Math.floor(roll(state) * pool.length)]) };
    }
    return fail("materials");
  }
  return relocation(state, tower!) ? { ok: true } : fail("placement");
}

function reserveChallenge(state: Match, unitId: string): Result {
  if (!state.challengeShopOpen) return { ok: false, reason: "closed" };
  const template = challengeTemplates.find(entry => entry.unitId === unitId);
  if (!template) return { ok: false, reason: "missing" };
  const stages = state.challengeStages ??= Array<number>(8).fill(0);
  if (template.stage !== stages[template.family]) return { ok: false, reason: "stock" };
  if (state.queue.nowUs < (state.challengeReadyUs ?? 0)) return { ok: false, reason: "cooldown" };
  const id = state.nextId++;
  const timer = scheduleEvent(state.queue, us(10 + template.interval), { type: "challenge-spawn", challengeId: id });
  (state.challenges ??= {})[id] = { unitId, remaining: template.count, timer };
  state.challengeReadyUs = state.queue.nowUs + us(240);
  stages[template.family]++;
  return { ok: true, createdId: id };
}

function spawnChallenge(state: Match, id: number) {
  const challenge = state.challenges?.[id];
  if (!state.challengeShopOpen || !challenge || challenge.remaining === 0) return;
  const { unitId, abilities, hp, mana, armor, speed, radius, layer, points, interval } =
    challengeTemplates.find(entry => entry.unitId === challenge.unitId)!;
  spawn(state, { unitId, abilities, hp, mana, armor, speed, radius, layer, points, wave: state.wave, challengeId: id });
  if (--challenge.remaining > 0) {
    challenge.timer = scheduleEvent(state.queue, us(interval), { type: "challenge-spawn", challengeId: id });
  }
}

function rewardChallenge(state: Match, enemy: Enemy) {
  const id = enemy.challengeId;
  if (id === undefined) return;
  const challenge = state.challenges?.[id];
  if (!challenge || challenge.remaining > 0 || state.enemies.some(entry => entry !== enemy && entry.challengeId === id)) return;
  delete state.challenges![id];
  const { family, stage } = challengeTemplates.find(entry => entry.unitId === challenge.unitId)!;
  if (family === 0) {
    const [low, high] = [[30, 120], [100, 260], [240, 400]][stage];
    state.challengeScore = (state.challengeScore ?? 0) + low + Math.floor(roll(state) * (high - low + 1));
  } else if (stage === 0) state.gold += 3000;
  else if (stage === 1) state.lumber += 300;
  else {
    (state.challengeStock ??= {})[challengeGoods[family - 1]] = 1;
    if (state.seasons) {
      state.seasonalChallengeUnlocks = (state.seasonalChallengeUnlocks ?? 0) + 1;
      if (state.seasonalChallengeUnlocks === 2) creditTask(state, "summer", 8);
    }
  }
}

function rollDice(state: Match, dice: number, sides: number) {
  let amount = 0;
  for (let index = 0; index < dice && sides > 0; index++) amount += 1 + Math.floor(roll(state) * sides);
  return amount;
}

function commitKillScore(state: Match) {
  // Q18 enables SHOPITEM03 and SHOPITEM01/08 in the ordinary solo build.
  state.killScore = Math.floor((state.kills ?? 0) * 2.5 / 100);
}

function forgeSword(state: Match, enemy: Enemy) {
  const item = state.inventory?.filter(item => item.towerId === circleId && item.slot !== null && brokenSwords.has(item.itemId))
    .sort((a, b) => a.slot! - b.slot!)[0];
  if (!item) return;
  item.charges += enemy.abilities?.includes("N534") && unitBalance.get(enemy.unitId)?.type === "sapper" ? 5 : 1;
  if (item.charges < 1400) return;
  removeItem(state, item);
  deliverItem(state, brokenSwords.get(item.itemId)!, undefined, circle);
  state.forgedSwords = (state.forgedSwords ?? 0) + 1;
  creditTask(state, "spring", 4);
}

function dropDeathChest(state: Match, enemy: Enemy, credited: boolean) {
  if (enemy.eggParentId !== undefined) return;
  const threshold = enemy.abilities?.includes("N534") &&
    unitBalance.get(enemy.unitId)?.type?.split(",").includes("sapper") ? 2 : 1;
  // The solo SHOPITEM01 entitlement applies to an actual player-owned killer.
  if (Math.floor(roll(state) * (credited ? 240 : 300)) + 1 > threshold) return;
  const tierRoll = rollPercent(state);
  const wave = state.wave;
  const tier = wave < 10 ? tierRoll < 30 ? 2 : 1 :
    wave < 20 ? tierRoll < 20 ? 3 : tierRoll < 60 ? 2 : 1 :
    wave < 30 ? tierRoll < 30 ? 3 : 2 :
    wave < 50 ? tierRoll < 25 ? 4 : tierRoll < 70 ? 3 : 2 : 1;
  const itemId = "i" + (400 + tier + (rollPercent(state) < 35 ? 10 : 0));
  (state.inventory ??= []).push({ id: state.nextId++, itemId, slot: null, charges: itemFields.get(itemId)?.uses ?? 0,
    point: { x: enemy.x, y: enemy.y } });
}

export function removeDeadEnemy(state: Match, enemyId: number, killerTowerId?: number) {
  if (state.phase !== "running") return false;
  const index = state.enemies.findIndex(enemy => enemy.id === enemyId && enemy.hp <= 0);
  if (index === -1) return false;
  const enemy = state.enemies[index];
  if (killerTowerId !== undefined) {
    const recipients = state.structures.filter(tower => tower.hero && !tower.pending &&
      (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 1600 ** 2).sort((a, b) => a.id - b.id);
    const experience = Math.floor(killExperience(enemy.unitId) / recipients.length);
    for (const hero of recipients) grantHeroExperience(state, hero.id, experience);
    state.gold += talentMonsterKillGold(state);
    const bounty = unitBalance.get(enemy.unitId);
    if (bounty) {
      state.gold += (bounty.bountyplus ?? 0) + rollDice(state, bounty.bountydice ?? 0, bounty.bountysides ?? 0);
      state.lumber += (bounty.lumberbountyplus ?? 0) + rollDice(state, bounty.lumberbountydice ?? 0, bounty.lumberbountysides ?? 0);
    }
    state.kills = (state.kills ?? 0) + 1;
    forgeSword(state, enemy);
  }
  dropDeathChest(state, enemy, killerTowerId !== undefined);
  rewardChallenge(state, enemy);
  state.enemies.splice(index, 1);
  if (enemy.unitId === "m052" && rollPercent(state) <= 40) {
    for (const tower of state.structures) {
      const now = state.queue.nowUs;
      if (tower.pending || now < (tower.weakenedUntilUs ?? 0) ||
          (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 > 300 ** 2) continue;
      tower.weakenedUntilUs = now + us(8);
    }
  }
  if (enemy.eggParentId !== undefined) {
    state.enemies = state.enemies.filter(parent => parent.id !== enemy.eggParentId);
  }
  if (enemy.unitId === "mBOS") {
    creditTask(state, "spring", 8);
    commitKillScore(state);
    state.phase = "won";
    state.result = { reason: "boss-killed", atUs: state.queue.nowUs };
    state.enemies = [];
  }
  return true;
}

function towerGear(state: Match, tower: Construction) {
  return state.inventory?.filter(item => item.towerId === tower.id && item.slot !== null) ?? [];
}

function weaponRange(weapon: Weapon, gear: Item[]) {
  return gear.some(item => item.itemId === "i282") ? weapon.kind === "normal" ? 100 : 200 : 0;
}

function targetable(enemy: Enemy, targets: string[], nowUs: number) {
  const targetType = unitTargetType.get(enemy.unitId);
  return enemy.hp > 0 && nowUs >= (enemy.phaseUntilUs ?? 0) && targets.includes(targetType ?? (enemy.layer === "fly" ? "air" : "ground"));
}

function magicImmune(enemy: Enemy) {
  return enemy.abilities?.some(id => id === "Amim" || id === "ACmi" || id === "AImu");
}

function flameArrow(tower: Construction) {
  if (tower.templateId === "n142") return { bonus: 40, range: 800, cost: 0 };
  if (tower.templateId === "n143") return { bonus: 100, range: 800, cost: 0 };
  const rank = tower.hero?.ranks.A040 ?? 0;
  return rank ? { bonus: [500, 700, 900, 1100, 1300, 1500][rank - 1], range: 1300, cost: 3 } : undefined;
}

function flameTargetable(state: Match, tower: Construction, enemy: Enemy, range: number) {
  return !enemy.abilities?.some(id => id === "Aloc" || id === "Avul" || id === "Aeth") &&
    canSeeEnemy(state, enemy) && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= range ** 2;
}

export function flameArrowTargets(state: Match, towerId: number) {
  const tower = state.structures.find(entry => entry.id === towerId);
  const effect = tower && flameArrow(tower);
  if (!tower || !effect || tower.pending) return undefined;
  const gear = towerGear(state, tower);
  return state.enemies.filter(enemy => flameTargetable(state, tower, enemy, effect.range) &&
    weapons[tower.templateId]?.some(slot => inWeaponRange(tower, enemy, slot, weaponRange(slot, gear), false, state.queue.nowUs)));
}

function canSeeEnemy(state: Match, enemy: Enemy) {
  const now = state.queue.nowUs;
  return !(enemy.invisibleFromUs !== undefined && now >= enemy.invisibleFromUs && now < (enemy.speedBuffUntilUs ?? 0)) ||
    nearbyEquipment(state, enemy, ["i206"], 1100) ||
    state.detectors?.some(detector => (detector.x - enemy.x) ** 2 + (detector.y - enemy.y) ** 2 <= 1000 ** 2) ||
    state.structures.some(tower => !tower.pending && (/^n1(?:5[9]|6[0-7])$/.test(tower.templateId)) &&
      (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 1000 ** 2);
}

function inWeaponRange(tower: Construction, enemy: Enemy, weapon: Weapon, bonus: number, firing: boolean, nowUs: number) {
  const distance = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
  return targetable(enemy, weapon.targets, nowUs) && distance >= weapon.min &&
    distance <= (firing ? weapon.max + (weapon.kind === "artillery" ? 0 : weapon.buffer) :
      Math.min(weapon.acquire, weapon.max)) + bonus;
}

const burnDamage = new Map([["i135", 250], ["i136", 360], ["i137", 470], ["i138", 620], ["i276", 1000]]);
const dagonMultiplier = new Map([["i179", 1.07], ["i180", 1.12], ["i181", 1.17], ["i182", 1.22], ["i183", 1.27], ["i184", 1.35]]);

function nearbyEquipment(state: Match, point: Point, ids: readonly string[], range: number) {
  return state.inventory?.some(item => {
    if (item.slot === null || item.towerId === undefined || !ids.includes(item.itemId)) return false;
    const source = state.structures.find(tower => tower.id === item.towerId && (!tower.pending || tower.pending.upgradeTo));
    return !!source && (source.x - point.x) ** 2 + (source.y - point.y) ** 2 <= range ** 2;
  }) ?? false;
}

function hasBattleBanner(state: Match, tower: Construction) {
  return unitBalance.get(tower.templateId)?.type?.split(",").includes("sapper") &&
    nearbyEquipment(state, tower, ["i270"], 900);
}

function attackAura(state: Match, tower: Construction) {
  const command = nearbyEquipment(state, tower, ["i209"], 1000) ? .35 :
    nearbyEquipment(state, tower, ["i198"], 1000) ? .25 : 0;
  const drums = nearbyEquipment(state, tower, ["i228"], 800) ? .10 : 0;
  const banner = hasBattleBanner(state, tower) ? .50 : 0;
  const vengeance = state.structures.reduce((best, source) => {
    const rank = source.hero?.ranks.A153 ?? 0;
    return !source.pending && rank && (source.x - tower.x) ** 2 + (source.y - tower.y) ** 2 <= 800 ** 2
      ? Math.max(best, [.10, .18, .26, .34, .42, .50][rank - 1]) : best;
  }, 0);
  return { command, drums, banner, vengeance };
}

function triggerEquipmentLightning(state: Match, tower: Construction, target: Enemy, gear: Item[]) {
  const itemId = gear.some(item => item.itemId === "i173") ? "i173" :
    gear.some(item => item.itemId === "i177") ? "i177" : undefined;
  if (!itemId || state.queue.nowUs < (tower.equipmentLightningReadyUs ?? 0)) return;
  tower.equipmentLightningReadyUs = state.queue.nowUs + us(.1);
  if (rollPercent(state) <= (itemId === "i173" ? 15 : 25)) {
    scheduleEvent(state.queue, 0, { type: "equipment-lightning", towerId: tower.id, targetId: target.id, itemId });
  }
}

function equipmentLightning(state: Match, towerId: number, targetId: number, itemId: "i173" | "i177") {
  const tower = state.structures.find(entry => entry.id === towerId);
  const target = state.enemies.find(entry => entry.id === targetId);
  if (!tower || !target || (tower.x - target.x) ** 2 + (tower.y - target.y) ** 2 > 5000 ** 2) return;
  chainLightning(state, tower, target, itemId === "i173" ? 5 : 7, (itemId === "i173" ? 1000 : 2000) * .8, itemId);
}

function chainLightning(state: Match, tower: Construction, primary: Enemy, maximum: number, damage: number, skillId: string) {
  const now = state.queue.nowUs;
  if (!targetable(primary, ["ground", "air"], now) || consumeEnemySpellShield(state, primary)) return;
  const visited = new Set<number>();
  let target: Enemy | undefined = primary;
  while (target && visited.size < maximum && state.phase === "running") {
    const x: number = target.x;
    const y: number = target.y;
    visited.add(target.id);
    damageEnemy(state, tower, "q001", target, damage, "magic", skillId);
    target = state.enemies.find(enemy => !visited.has(enemy.id) && targetable(enemy, ["ground", "air"], now) &&
      (enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= 600 ** 2);
  }
}

function equipmentBurnSources(state: Match) {
  return (state.inventory ?? []).flatMap(item => {
    const raw = burnDamage.get(item.itemId);
    if (!raw || item.towerId === undefined || item.slot === null) return [];
    const tower = state.structures.find(entry => entry.id === item.towerId && (!entry.pending || entry.pending.upgradeTo));
    return tower ? [{ tower, raw, itemId: item.itemId }] : [];
  }).sort((a, b) => b.raw - a.raw || a.tower.id - b.tower.id);
}

function reconcileEquipmentBurn(state: Match) {
  if (!state.inventory?.some(item => item.towerId !== undefined && item.towerId !== circleId && burnDamage.has(item.itemId))) {
    if (state.equipmentBurnTimer !== undefined) cancelEvent(state.queue, state.equipmentBurnTimer);
    delete state.equipmentBurnTimer;
  } else if (state.equipmentBurnTimer === undefined && equipmentBurnSources(state).length) {
    state.equipmentBurnTimer = scheduleEvent(state.queue, us(1), { type: "equipment-burn" }, us(1));
  }
}

function applyEquipmentBurn(state: Match) {
  const sources = equipmentBurnSources(state);
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (!targetable(enemy, ["ground"], state.queue.nowUs)) continue;
    const source = sources.find(({ tower }) => (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 900 ** 2);
    if (source) damageEnemy(state, source.tower, source.tower.templateId, enemy, source.raw * .8, "magic", source.itemId);
  }
}

function combatAttributes(state: Match, tower: Construction) {
  if (!tower.hero) return { STR: 0, AGI: 0, INT: 0 };
  const values = effectiveAttributes(tower.hero, towerGear(state, tower).map(item => item.itemId));
  values.STR += Object.values(tower.treeGrab?.strength ?? {}).reduce((sum, strength) => sum + strength, 0);
  return values;
}

const manaLimits = new Map(itemResources.items.map(item => [item.id, item.webStats[1]]));
const manaRate = new Map(itemRegeneration.items.map(item => [item.id, (item.web.manaPercent ?? 0) / 100]));

function syncMana(state: Match, tower: Construction) {
  const now = state.queue.nowUs;
  const intelligence = combatAttributes(state, tower).INT;
  const stats = unitBalance.get(tower.templateId);
  const gear = towerGear(state, tower);
  const maximum = (stats?.manaN ?? 0) + 12 * intelligence +
    gear.reduce((sum, item) => sum + (manaLimits.get(item.itemId) ?? 0), 0);
  if (tower.mana === undefined || tower.manaLastUs === undefined || tower.manaMaximum === undefined) {
    tower.mana = maximum;
  } else {
    const potionTime = Math.max(0, Math.min(now, tower.manaPotionUntilUs ?? 0) - tower.manaLastUs);
    const recovered = tower.mana + ((tower.manaRegen ?? 0) * (now - tower.manaLastUs) + 5 * potionTime) / 1_000_000;
    tower.mana = Math.min(maximum, Math.max(0, Math.min(tower.manaMaximum, recovered) + maximum - tower.manaMaximum));
  }
  tower.manaLastUs = now;
  tower.manaMaximum = maximum;
  const percent = gear.reduce((sum, item) => sum + (manaRate.get(item.itemId) ?? 0), 0);
  const aura = stats?.type?.split(",").includes("ancient") ? 0 :
    nearbyEquipment(state, tower, ["i161"], 1000) ? 10 : nearbyEquipment(state, tower, ["i129"], 1000) ? 3 : 0;
  tower.manaRegen = ((stats?.regenMana ?? 0) + 0.03 * intelligence) * (1 + percent) + aura;
}

function activateTreeGrab(state: Match, tower: Construction) {
  const rank = tower.hero?.ranks[tower.templateId === "G059" ? "A149" : "A068"] ?? 0;
  if (rank < 1 || state.queue.nowUs < (tower.treeGrab?.readyUs ?? 0)) return;
  syncMana(state, tower);
  const cost = [10, 15, 20, 25, 30, 40][rank - 1];
  if (tower.mana! < cost) return;
  tower.mana! -= cost;
  const status = tower.treeGrab ??= { readyUs: 0, cleaveUntilUs: 0, strength: {} };
  const buffId = scheduleEvent(state.queue, us(6), { type: "tree-grab-expire", towerId: tower.id, buffId: state.queue.nextSequence });
  status.strength[buffId] = [20, 35, 50, 65, 80, 100][rank - 1];
  status.readyUs = state.queue.nowUs + us(15);
  status.cleaveUntilUs = state.queue.nowUs + us(6);
}

function spellTarget(state: Match, tower: Construction, range: number, skillId?: HeroSpell) {
  const casterTime = state.queue.nowUs;
  const candidates = state.enemies.filter(enemy => canSeeEnemy(state, enemy) && targetable(enemy, ["ground", "air"], casterTime) &&
    (skillId !== "A042" || !enemy.abilities?.includes("N534")) &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= range ** 2);
  return (skillId === "A151" || skillId === "A020" ? candidates.find(enemy => enemy.abilities?.includes("N534")) : undefined) ?? candidates[0];
}

function beginTowerSpell(state: Match, tower: Construction, skillId: string, automatic: boolean): Result {
  const spell = towerSpells.get(tower.templateId)?.find(entry => entry.id === skillId);
  if (!spell || tower.pending) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.towerSpellReady?.[skillId] ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  const isTargeted = spell.effect.kind === "purge";
  const target = spell.effect.kind === "wolves" ? tower :
    spell.effect.kind === "wave" || spell.effect.kind === "sword-rain" || isTargeted || automatic
    ? spellTarget(state, tower, automatic ? spell.search : 800) : tower;
  if (!target) return { ok: false, reason: "range" };
  syncMana(state, tower);
  if (tower.mana! < spell.cost) return { ok: false, reason: "resources" };
  if (tower.attack) tower.attack.winding = false;
  tower.heroCastUntilUs = now + us(spell.cast);
  scheduleEvent(state.queue, us(spell.cast), { type: "tower-spell", towerId: tower.id, skillId, point: { x: target.x, y: target.y }, ...(isTargeted ? { targetId: target.id } : {}) });
  return { ok: true };
}

function resolveTowerSpell(state: Match, event: Extract<MatchEvent, { type: "tower-spell" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  if (!tower || tower.pending || state.queue.nowUs < (tower.stunnedUntilUs ?? 0)) return;
  const spell = towerSpells.get(tower.templateId)?.find(entry => entry.id === event.skillId);
  if (!spell) return;
  const now = state.queue.nowUs;
  const effect = spell.effect;
  const target = effect.kind === "purge" ? state.enemies.find(enemy => enemy.id === event.targetId) : undefined;
  if (effect.kind === "purge" && (!target || !targetable(target, ["ground", "air"], now) ||
      !canSeeEnemy(state, target) || (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > effect.range ** 2)) return;
  syncMana(state, tower);
  if (tower.mana! < spell.cost) return;
  tower.mana! -= spell.cost;
  (tower.towerSpellReady ??= {})[spell.id] = now + us(spell.cooldown);
  if (effect.kind === "purge") {
    if (!target || consumeEnemySpellShield(state, target)) return;
    delete target.armorBuff;
    delete target.speedBuff;
    delete target.speedBuffUntilUs;
    delete target.sprintUntilUs;
    delete target.invisibleFromUs;
    const duration = /^[A-Z]/.test(target.unitId) || target.abilities?.includes("Arsk") ? .5 : 4;
    target.purge = { middleUs: now + us(duration / 2), endUs: now + us(duration), factor: 0 };
    return;
  }
  if (effect.kind === "wave") {
    sendTowerWave(state, tower, event.point, spell.id, effect.speed, effect.range, effect.radius, effect.amount, effect.air);
    return;
  }
  if (effect.kind === "wolves") {
    state.summons = state.summons?.filter(unit => unit.summon?.ownerId !== tower.id || !unit.summon.independent);
    const facing = spellDirection(tower, tower.lastAttackTarget ?? tower);
    for (const side of [-30, 30]) spawnSummon(state, {
      x: tower.x - facing.dy * side, y: tower.y + facing.dx * side,
    }, effect.unit, { ownerId: tower.id, attack: 0, speed: 0, green: 0, blue: 0, independent: true, skillId: spell.id }, 15);
    return;
  }
  if (effect.kind === "sword-rain") {
    const { dx: x, dy: y } = spellDirection(tower, event.point);
    tower.heroCastUntilUs = now + us(6);
    const token = tower.swordRainToken = state.queue.nextSequence;
    scheduleEvent(state.queue, 0, { type: "sword-rain-emit", towerId: tower.id, token, skillId: spell.id,
      center: event.point, direction: { x, y }, amount: effect.amount, remaining: 120 });
    return;
  }
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") return;
    const targets = effect.kind === "howl" ? ["ground", "air"] : effect.kind === "stomp" ? ["ground", "structure"] : ["ground"];
    if (!targetable(enemy, targets, now) || (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > effect.radius ** 2) continue;
    const resistant = enemy.abilities?.includes("N534");
    if (effect.kind === "howl") {
      enemy.howlArmor = { amount: effect.amount, expiresUs: now + us(resistant ? 2 : 4) };
      continue;
    }
    const duration = resistant ? .4 : 1.2;
    if (effect.kind === "stomp" && targetable(enemy, ["ground"], now)) {
      enemy.stunUntilUs = Math.max(enemy.stunUntilUs ?? 0, now + us(duration));
      scheduleEvent(state.queue, enemy.stunUntilUs - now, { type: "stun-expire", enemyId: enemy.id });
    }
    damageEnemy(state, tower, tower.templateId, enemy, effect.amount * .8, "magic", spell.id);
    if (effect.kind === "clap" && effect.slow && enemy.hp > 0) {
      enemy.clapSlow = { untilUs: now + us(duration), factor: 1 - effect.slow };
    }
  }
}

function stopSwordRain(tower: Construction, atUs: number) {
  delete tower.swordRainToken;
  tower.heroCastUntilUs = atUs;
}

function emitSwordRain(state: Match, event: Extract<MatchEvent, { type: "sword-rain-emit" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  if (!tower || tower.swordRainToken !== event.token) return;
  const now = state.queue.nowUs;
  if (tower.pending || now < (tower.stunnedUntilUs ?? 0) ||
      !towerSpells.get(tower.templateId)?.some(spell => spell.id === event.skillId)) {
    stopSwordRain(tower, now);
    return;
  }
  if (event.remaining === 0) {
    stopSwordRain(tower, now);
    return;
  }
  const { direction, center } = event;
  const side = (2 * roll(state) - 1) * 700;
  const half = Math.sqrt(700 ** 2 - side ** 2);
  const origin = { x: center.x - direction.x * half - direction.y * side, y: center.y - direction.y * half + direction.x * side };
  scheduleEvent(state.queue, 0, { type: "sword-rain-travel", towerId: tower.id, skillId: event.skillId,
    origin, direction, amount: event.amount, from: 0, distance: 0, length: 2 * half });
  scheduleEvent(state.queue, 50_000, { ...event, remaining: event.remaining - 1 });
}

function advanceSwordRain(state: Match, event: Extract<MatchEvent, { type: "sword-rain-travel" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  if (!tower) return;
  const now = state.queue.nowUs;
  const { origin, direction } = event;
  const eligible = (enemy: Enemy) => targetable(enemy, ["ground", "structure", "debris"], now) &&
    !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Aloc" || id === "Avul");
  let first = Infinity;
  for (const enemy of state.enemies) {
    if (!eligible(enemy)) continue;
    const x = enemy.x - origin.x;
    const y = enemy.y - origin.y;
    const lateral = x * direction.y - y * direction.x;
    if (Math.abs(lateral) > 50) continue;
    const projection = x * direction.x + y * direction.y;
    const contact = Math.sqrt(50 ** 2 - lateral ** 2);
    if (projection + contact < event.from || projection - contact > event.distance) continue;
    first = Math.min(first, Math.max(event.from, projection - contact));
  }
  if (first < Infinity) {
    const impact = { x: origin.x + direction.x * first, y: origin.y + direction.y * first };
    for (const enemy of state.enemies.filter(enemy => eligible(enemy) && (enemy.x - impact.x) ** 2 + (enemy.y - impact.y) ** 2 <= 100 ** 2)) {
      if (state.phase !== "running") break;
      damageEnemy(state, tower, tower.templateId, enemy, event.amount * .8, "magic", event.skillId);
    }
  } else if (event.distance < event.length) {
    const stepTimeUs = Math.min(movementStepUs, Math.max(1, us((event.length - event.distance) / 700)));
    const end = Math.min(event.length, event.distance + 700 * stepTimeUs / 1_000_000);
    scheduleEvent(state.queue, stepTimeUs, { ...event, from: event.distance, distance: end });
  }
}

function sendTowerWave(state: Match, tower: Construction, target: Point, name: string, speed: number, range: number,
  radius: number, amount: number, air: boolean) {
  const direction = spellDirection(tower, target);
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { x: tower.x, y: tower.y, ...direction,
    name, towerId: tower.id, speed, range, radiusStart: radius, radiusEnd: radius, amount, traveled: 0, hit: [],
    targets: air ? ["ground", "air", "structure"] : ["ground", "structure"], budget: 9_999_999 } });
}

function beginHeroSpell(state: Match, tower: Construction, skillId: HeroSpell, automatic: boolean): Result {
  const spec = heroSpells[skillId];
  const rank = tower.hero?.ranks[skillId] ?? 0;
  if (!spec || !rank || tower.pending) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0, tower.heroSpellReady?.[skillId] ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  const target = spellTarget(state, tower, automatic ? spec.autoRange : spec.range, skillId);
  if ((!target || (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > spec.range ** 2) && skillId !== "A041") {
    return { ok: false, reason: "range" };
  }
  syncMana(state, tower);
  if (tower.mana! < spec.mana[rank - 1]) return { ok: false, reason: "resources" };
  if (tower.attack) tower.attack.winding = false;
  tower.heroCastUntilUs = now + us(.4);
  scheduleEvent(state.queue, us(.3), { type: "hero-spell", towerId: tower.id, targetId: target?.id ?? 0, skillId,
    point: { x: target?.x ?? tower.x, y: target?.y ?? tower.y } });
  return { ok: true };
}

function consumeEnemySpellShield(state: Match, enemy: Enemy) {
  const now = state.queue.nowUs;
  if (!enemy.abilities?.includes("N535") || now < (enemy.spellShieldReadyUs ?? 0)) return false;
  enemy.spellShieldReadyUs = now + us(6);
  return true;
}

function spellDirection(tower: Point, point: Point) {
  const length = Math.hypot(point.x - tower.x, point.y - tower.y);
  return length ? { dx: (point.x - tower.x) / length, dy: (point.y - tower.y) / length } : { dx: 1, dy: 0 };
}

function finishHeroSpell(state: Match, event: Extract<MatchEvent, { type: "hero-spell" }>) {
  const { skillId, point } = event;
  const spec = heroSpells[skillId];
  const tower = state.structures.find(entry => entry.id === event.towerId);
  const now = state.queue.nowUs;
  if (!tower?.hero || tower.pending || now < (tower.stunnedUntilUs ?? 0)) return;
  const rank = tower.hero.ranks[skillId];
  if (!rank) return;
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if ((skillId === "A092" || skillId === "A093" || skillId === "A151" || skillId === "A020" || skillId === "A042") &&
      (!target || !targetable(target, ["ground", "air"], now) || !canSeeEnemy(state, target) ||
        (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > spec.range ** 2)) return;
  syncMana(state, tower);
  if (tower.mana! < spec.mana[rank - 1]) return;
  tower.mana! -= spec.mana[rank - 1];
  (tower.heroSpellReady ??= {})[skillId] = now + us(spec.cooldown[rank - 1] ?? spec.cooldown[0]);
  const amount = spec.damage[rank - 1] ?? spec.damage[0];
  if (skillId === "A041") {
    tower.strafeUntilUs = now + us([4, 5, 6, 7, 8, 10][rank - 1]);
    return;
  }
  if (skillId === "A042" && target && !target.abilities?.includes("N534")) {
    const attack = Math.min(4000, (target.maxHp ?? target.hp) * (.08 + (rank - 1) * .01));
    damageEnemy(state, tower, "q025", target, amount, "divine", "A042");
    const token = state.queue.nextSequence;
    (tower.contracts ??= {})[token] = Math.trunc(attack);
    scheduleEvent(state.queue, us(120), { type: "contract-expire", towerId: tower.id, token });
    return;
  }
  if (skillId === "A020" && target) {
    lagunaBlade(state, tower, target, amount);
    const extra = state.phase === "running" && towerGear(state, tower).some(item => item.itemId === "i310")
      ? spellTarget(state, tower, 900) : undefined;
    if (extra) lagunaBlade(state, tower, extra, amount);
    return;
  }
  const origin = { x: tower.x, y: tower.y };
  if (skillId === "A094") {
    createSerpentWards(state, tower, point, rank);
    return;
  }
  if (skillId === "A151" && target) {
    const hasScepter = towerGear(state, tower).some(item => item.itemId === "i310");
    if (hasScepter && !target.welfare) launchMagicArrow(state, tower.id, target, origin, rank, true);
    launchMagicArrow(state, tower.id, target, origin, rank, false);
    return;
  }
  if (skillId === "A093" && target) {
    sendHeroLeash(state, tower, target, rank, true);
    for (const enemy of state.enemies) {
      if (enemy === target || (enemy.x - target.x) ** 2 + (enemy.y - target.y) ** 2 > 600 ** 2) continue;
      sendHeroLeash(state, tower, enemy, rank, false);
    }
    return;
  }
  const direction = spellDirection(origin, skillId === "A092" && target ? target : point);
  const { dx, dy } = direction;
  const ahead = (d: number) => ({ x: origin.x + dx * d, y: origin.y + dy * d });
  if (skillId === "A019") {
    scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { ...origin, ...direction, towerId: tower.id, name: skillId,
      speed: 2000, range: 1500, radiusStart: 200 + (rank - 1) * 50, radiusEnd: 200, amount, traveled: 0, hit: [],
      budget: 9_999_999, targets: ["ground", "structure"] } });
    return;
  }
  if (skillId === "A092" && target) {
    const candidates = [target, ...state.enemies.filter(enemy => {
      if (enemy === target || !targetable(enemy, ["ground", "air"], now)) return false;
      const x = enemy.x - origin.x, y = enemy.y - origin.y;
      const depth = x * dx + y * dy;
      return depth >= 0 && depth <= 1200 && Math.abs(x * dy - y * dx) <= 250 + depth / 8;
    })].slice(0, 4 + rank * 2);
    for (const enemy of candidates) {
      if (state.phase !== "running") break;
      if (enemy === target && consumeEnemySpellShield(state, enemy)) continue;
      damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", skillId);
    }
    return;
  }
  if (skillId === "A171" || skillId === "A172") {
    const centers = (skillId === "A171" ? [220, 440, 660, 880, 1100, 1320, 1540] :
      [300, 600, 900, 1200, 1500]).map(ahead);
    const token = state.queue.nextSequence;
    if (skillId === "A171") tower.icePathToken = token;
    scheduleEvent(state.queue, us(.5), { type: "spell-zones", skillId, towerId: tower.id, token,
      centers, rank, remaining: skillId === "A171" ? 6 : 10, hit: [] });
    return;
  }
  const sweep: SpellSweep = { ...origin, ...direction, towerId: tower.id, name: skillId, speed: skillId === "A170" ? 1050 : 2000,
    range: 700, radiusStart: skillId === "A170" ? 200 : 300, radiusEnd: skillId === "A170" ? 400 : 300,
    amount, traveled: 0, hit: [] };
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep });
  if (skillId === "A170") {
    scheduleEvent(state.queue, us(.3), { type: "spell-sweep", sweep: { ...sweep, hit: [], amount: 0, slow: .20 + rank * .05 } });
  }
  if (skillId === "A152") {
    for (const enemy of state.enemies) {
      if (targetable(enemy, ["ground", "air"], now) && [300, 600, 900].map(ahead).some(center =>
        (enemy.x - center.x) ** 2 + (enemy.y - center.y) ** 2 <= 300 ** 2)) {
        enemy.waveArmor = { amount: rank * 10, expiresUs: now + us(6) };
      }
    }
  }
}

function lagunaBlade(state: Match, tower: Construction, target: Enemy, amount: number) {
  if (!consumeEnemySpellShield(state, target)) damageEnemy(state, tower, "q010", target, amount * .8, "magic", "A020");
}

const summonContracts = ["i243", "i245", "i247", "i249", "i250", "i251", "i252", "i253", "i254"];

function summonModifiers(gear: string[]) {
  return {
    speed: gear.reduce((sum, id) => sum + (summonContracts.includes(id) ? .5 : id === "i240" ? .3 : id === "i242" ? .2 : 0), 0),
    green: gear.includes("i252") ? 1 : gear.includes("i251") ? .8 : gear.includes("i245") ? .6 : 0,
    blue: gear.includes("i254") ? 10 : gear.includes("i253") ? 8 : gear.includes("i247") ? 6 : 0,
  };
}

function spawnSummon(state: Match, point: Point, templateId: string, behavior: NonNullable<Construction["summon"]>, duration: number) {
  const id = state.nextId++;
  (state.summons ??= []).push({ x: point.x, y: point.y, id, templateId, pending: null, radius: 0,
    qualification: null, population: 0, summon: behavior });
  scheduleEvent(state.queue, us(duration), { type: "summon-expire", unitId: id });
  return id;
}

const necromancyBooks = ["i193", "i194", "i195", "i196"];
const necromancyPriority = [...necromancyBooks].reverse();

export function isActiveTowerEquipment(id: string) {
  return necromancyBooks.includes(id) || id === "i326" || id === "i238";
}

function useRestoration(state: Match, tower: Construction, item: Item): Result {
  const potion = item.itemId === "i326";
  if (!potion && item.itemId !== "i238") return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0,
    (potion ? tower.manaPotionReadyUs : tower.soulRingReadyUs) ?? 0)) return { ok: false, reason: "cooldown" };
  syncMana(state, tower);
  if (tower.mana! < 1 || potion && (item.charges === 0 || tower.mana! >= tower.manaMaximum!)) {
    return { ok: false, reason: "resources" };
  }
  tower.mana! -= 1;
  if (potion) {
    tower.manaPotionReadyUs = now + us(1);
    tower.manaPotionUntilUs = now + us(60);
    if (--item.charges === 0) {
      removeItem(state, item);
      syncMana(state, tower);
    }
  } else {
    tower.soulRingReadyUs = now + us(10);
    const amount = Math.min(250, tower.manaMaximum! - tower.mana!);
    tower.mana! += amount;
    scheduleEvent(state.queue, us(7), { type: "mana-debt", towerId: tower.id, amount });
  }
  return { ok: true };
}

function useNecromancy(state: Match, tower: Construction, itemId: string): Result {
  const gear = towerGear(state, tower).map(item => item.itemId);
  const rank = necromancyBooks.indexOf(itemId);
  if (rank === -1 || !gear.includes(itemId) || tower.pending) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.necromancyReadyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  const cost = [30, 50, 70, 90][rank];
  if (tower.mana! < cost) return { ok: false, reason: "resources" };
  tower.mana! -= cost;
  tower.necromancyReadyUs = now + us(25);
  const createdId = spawnSummon(state, tower, "b" + (107 + rank), {
    ownerId: tower.id, attack: Math.trunc(combatAttributes(state, tower).INT * [1.2, 1.3, 1.4, 1.5][rank]),
    ...summonModifiers(gear), skillId: itemId, projectileGroup: { extra: 2 + rank, range: 900, speed: 1200 },
  }, 20);
  if (rank === 3) {
    const id = state.nextId++;
    (state.detectors ??= []).push({ id, ownerId: tower.id, x: tower.x, y: tower.y });
    scheduleEvent(state.queue, us(20), { type: "detector-expire", unitId: id });
  }
  return { ok: true, createdId };
}

function createSerpentWards(state: Match, tower: Construction, point: Point, rank: number) {
  const gear = towerGear(state, tower).map(item => item.itemId);
  const upgraded = gear.includes("i310");
  const stats = combatAttributes(state, tower);
  const inherited = summonContracts.some(id => gear.includes(id)) ? .6 : gear.includes("i240") ? .5 : .4;
  const attack = Math.trunc(inherited * (stats.AGI + stats.INT + stats.STR));
  const behavior = { ownerId: tower.id, attack, skillId: upgraded ? "A095" : "A094", ...summonModifiers(gear),
    ...(upgraded ? { projectileGroup: { extra: 3, range: 700, speed: 900 } } : {}) };
  const sites = Array.from({ length: 8 }, (_, index) => {
    const angle = index * Math.PI / 4;
    return { x: point.x + 300 * Math.cos(angle), y: point.y + 300 * Math.sin(angle) };
  });
  const occupied = sites.filter(candidate => contains(map.bounds, candidate));
  for (const ideal of sites) {
    let site = ideal;
    if (!contains(map.bounds, ideal)) {
      let bestDistance = Infinity;
      for (let y = Math.max(map.bounds.minY, Math.ceil((point.y - 300) / gridSize) * gridSize); y <= Math.min(map.bounds.maxY, point.y + 300); y += gridSize) {
        for (let x = Math.max(map.bounds.minX, Math.ceil((point.x - 300) / gridSize) * gridSize); x <= Math.min(map.bounds.maxX, point.x + 300); x += gridSize) {
          const distance = (x - ideal.x) ** 2 + (y - ideal.y) ** 2;
          if (distance >= bestDistance || (x - point.x) ** 2 + (y - point.y) ** 2 > 300 ** 2 ||
              occupied.some(cell => cell.x === x && cell.y === y)) continue;
          bestDistance = distance;
          site = { x, y };
        }
      }
      occupied.push(site);
    }
    spawnSummon(state, site, "b" + ((upgraded ? 131 : 121) + rank), behavior, upgraded ? 15 : 12);
  }
}

function launchMagicArrow(state: Match, towerId: number, target: Enemy, point: Point, rank: number, scepter: boolean) {
  const distance = Math.hypot(target.x - point.x, target.y - point.y);
  scheduleEvent(state.queue, Math.min(movementStepUs, us(distance / 1250)), {
    type: "magic-arrow", towerId, targetId: target.id, point, rank, scepter,
  });
}

function resolveMagicArrow(state: Match, event: Extract<MatchEvent, { type: "magic-arrow" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const tower = state.structures.find(tower => tower.id === event.towerId);
  const now = state.queue.nowUs;
  if (!tower || !target || !targetable(target, ["ground", "air"], now)) return;
  const step = 1250 * movementStepUs / 1_000_000;
  if (Math.hypot(target.x - event.point.x, target.y - event.point.y) > step) {
    const { dx, dy } = spellDirection(event.point, target);
    launchMagicArrow(state, tower.id, target, { x: event.point.x + dx * step, y: event.point.y + dy * step }, event.rank, event.scepter);
    return;
  }
  if (consumeEnemySpellShield(state, target)) return;
  const duration = event.scepter ? .1 : 2 + (event.rank - 1) * .2;
  target.stunUntilUs = Math.max(target.stunUntilUs ?? 0, now + us(duration));
  scheduleEvent(state.queue, target.stunUntilUs - now, { type: "stun-expire", enemyId: target.id });
  if (event.scepter) {
    const amount = target.hp * .5;
    target.hp -= amount;
    const token = state.queue.nextSequence;
    tower.magicArrowToken = token;
    scheduleEvent(state.queue, us(6), { type: "magic-arrow-restore", towerId: tower.id, targetId: target.id, token, amount });
  } else {
    damageEnemy(state, tower, tower.templateId, target, heroSpells.A151.damage[event.rank - 1] * .8, "magic", "A151");
  }
}

function sendHeroLeash(state: Match, tower: Construction, enemy: Enemy, rank: number, primary: boolean) {
  const now = state.queue.nowUs;
  const point = { x: tower.x, y: tower.y };
  if (!targetable(enemy, ["ground", "air"], now) || (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 >
      (primary ? 600 : 2000) ** 2 || consumeEnemySpellShield(state, enemy)) return;
  const token = state.queue.nextSequence;
  if (primary) {
    tower.leashToken = token;
    tower.heroCastUntilUs = now + us(3);
  }
  if (!(enemy.abilities?.includes("N534"))) (enemy.leashes ??= []).push(token);
  scheduleEvent(state.queue, us(1), { type: "hero-leash", towerId: tower.id, targetId: enemy.id, point, token, rank, primary, tick: 1 });
}

function resolveHeroLeash(state: Match, event: Extract<MatchEvent, { type: "hero-leash" }>) {
  const { towerId, targetId, point, token, rank, primary, tick } = event;
  const tower = state.structures.find(entry => entry.id === towerId);
  const target = state.enemies.find(enemy => enemy.id === targetId);
  const now = state.queue.nowUs;
  const distance = target ? (target.x - point.x) ** 2 + (target.y - point.y) ** 2 : Infinity;
  const eligible = target && tower && targetable(target, ["ground", "air"], now) &&
    distance <= (primary ? 600 : 2000) ** 2 && (!primary || tower.leashToken === token && now >= (tower.stunnedUntilUs ?? 0)) &&
    (target.abilities?.includes("N534") || target.leashes?.includes(token));
  if (eligible) {
    damageEnemy(state, tower, primary ? tower.templateId : "q001", target, heroSpells.A093.damage[rank - 1] * .8, "magic", "A093");
    if (tick < 3 && target.hp > 0 && state.phase === "running") {
      scheduleEvent(state.queue, us(1), { ...event, tick: tick + 1 });
      return;
    }
  }
  if (target?.leashes) target.leashes = target.leashes.filter(link => link !== token);
  if (primary && tower?.leashToken === token) {
    delete tower.leashToken;
    tower.heroCastUntilUs = now;
  }
}

function advanceSpellSweep(state: Match, sweep: SpellSweep) {
  const tower = state.structures.find(entry => entry.id === sweep.towerId);
  if (!tower) return;
  const distance = Math.min(sweep.range, sweep.traveled + sweep.speed * movementStepUs / 1_000_000);
  const from = { x: sweep.x + sweep.dx * sweep.traveled, y: sweep.y + sweep.dy * sweep.traveled };
  const to = { x: sweep.x + sweep.dx * distance, y: sweep.y + sweep.dy * distance };
  const radius = sweep.radiusStart + (sweep.radiusEnd - sweep.radiusStart) * distance / sweep.range;
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (sweep.hit.includes(enemy.id) || !targetable(enemy, sweep.targets ?? ["ground", "air", "structure"], state.queue.nowUs) ||
        segmentDistanceSquared(from, to, enemy) > radius ** 2) continue;
    sweep.hit.push(enemy.id);
    if (sweep.slow !== undefined) {
      if (!consumeEnemySpellShield(state, enemy)) {
        enemy.frost = { factor: 1 - sweep.slow, expiresUs: state.queue.nowUs + us(5) };
        scheduleEvent(state.queue, us(5), { type: "frost-expire", enemyId: enemy.id });
      }
    } else {
      const damage = Math.min(sweep.amount, sweep.budget ?? Infinity);
      if (damage <= 0) break;
      if (sweep.budget !== undefined) sweep.budget -= damage;
      damageEnemy(state, tower, sweep.name === "A019" ? tower.templateId : "q001", enemy, damage * .8, "magic", sweep.name);
    }
  }
  if (distance < sweep.range && state.phase === "running") {
    sweep.traveled = distance;
    scheduleEvent(state.queue, movementStepUs, { type: "spell-sweep", sweep });
  }
}

function resolveSpellZones(state: Match, event: Extract<MatchEvent, { type: "spell-zones" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  const ice = event.skillId === "A171";
  if (!tower || ice && tower.icePathToken !== event.token) return;
  const now = state.queue.nowUs;
  const damage = heroSpells[event.skillId].damage[event.rank - 1];
  for (const center of event.centers) for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") return;
    if (!targetable(enemy, ["ground", "air"], now) ||
        (enemy.x - center.x) ** 2 + (enemy.y - center.y) ** 2 > (ice ? 200 : 150) ** 2) continue;
    if (ice) {
      if (event.hit.includes(enemy.id)) continue;
      event.hit.push(enemy.id);
      if (consumeEnemySpellShield(state, enemy)) continue;
      enemy.stunUntilUs = Math.max(enemy.stunUntilUs ?? 0, now + us(2.5));
      scheduleEvent(state.queue, enemy.stunUntilUs - now, { type: "stun-expire", enemyId: enemy.id });
    }
    damageEnemy(state, tower, "q001", enemy, damage * .8, "magic", event.skillId);
  }
  if (--event.remaining > 0) scheduleEvent(state.queue, us(.5), event);
}

function startWeapon(state: Match, tower: Construction) {
  const now = state.queue.nowUs;
  if (tower.pending || tower.attack?.winding || now < Math.max(tower.attack?.readyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) return;
  const slots = weapons[tower.templateId];
  if (!slots?.length) return;
  const gear = towerGear(state, tower);
  const flame = flameArrow(tower);
  const manual = flame && state.enemies.find(enemy => enemy.id === tower.flameTarget &&
    flameTargetable(state, tower, enemy, flame.range) &&
    slots.some(slot => inWeaponRange(tower, enemy, slot, weaponRange(slot, gear), false, now)));
  if (!manual) delete tower.flameTarget;
  for (const spell of towerSpells.get(tower.templateId) ?? []) {
    if ((spell.effect.kind === "wolves" || spell.effect.kind === "sword-rain") &&
      beginTowerSpell(state, tower, spell.id, true).ok) return;
  }
  const current = manual || state.enemies.find(enemy => enemy.id === (tower.tauntedTarget ?? tower.attack?.targetId));
  if (!current && tower.tauntedTarget !== undefined) delete tower.tauntedTarget;
  let target: Enemy | undefined;
  let weapon: Weapon | undefined;
  for (const enemy of current ? [current, ...state.enemies] : state.enemies) {
    if (!canSeeEnemy(state, enemy)) continue;
    weapon = slots.find(slot => inWeaponRange(tower, enemy, slot, weaponRange(slot, gear), false, now));
    if (weapon) {
      target = enemy;
      break;
    }
  }
  if (!target || !weapon) return;
  const book = necromancyPriority.find(id => gear.some(item => item.itemId === id));
  if (book) useNecromancy(state, tower, book);
  const ring = gear.find(item => item.itemId === "i238");
  if (ring) useRestoration(state, tower, ring);
  const hero = tower.hero;
  if (hero) {
    for (const skillId of Object.keys(heroSpells) as HeroSpell[]) {
      if (hero.ranks[skillId] && beginHeroSpell(state, tower, skillId, true).ok) return;
    }
  }
  if (/^n18[3-5]$/.test(tower.templateId) && now >= (tower.frenzyReadyUs ?? 0)) {
    const cost = 30 + (Number(tower.templateId.slice(1)) - 183) * 10;
    syncMana(state, tower);
    if (tower.mana! >= cost) {
      tower.mana! -= cost;
      tower.frenzyReadyUs = now + us(10);
      tower.frenzyUntilUs = now + us(5);
    }
  }
  for (const spell of towerSpells.get(tower.templateId) ?? []) {
    if (spell.effect.kind === "wolves" || spell.effect.kind === "sword-rain") continue;
    if (beginTowerSpell(state, tower, spell.id, true).ok) return;
  }
  activateTreeGrab(state, tower);
  const { STR: strength, AGI: agility } = combatAttributes(state, tower);
  const bannerSpeed = attackAura(state, tower).banner ? .50 : 0;
  const equipmentHaste = (nearbyEquipment(state, tower, ["i217"], 800) ? .20 : 0) +
    (nearbyEquipment(state, tower, ["i228"], 800) ? .10 : 0) + bannerSpeed + (tower.summon?.speed ?? 0) + (now < (tower.strafeUntilUs ?? 0) ? 1.5 : 0);
  const frenzy = now < (tower.frenzyUntilUs ?? 0) ? .2 * (Number(tower.templateId.slice(1)) - 182) : 0;
  const endurance = state.structures.some(source => source.templateId === "n152" && !source.pending &&
    (source.x - tower.x) ** 2 + (source.y - tower.y) ** 2 <= 1000 ** 2) ? .05 : 0;
  const speed = gear.reduce((total, item) => total + (equipmentAttackSpeed.get(item.itemId) ?? 0),
    equipmentHaste + frenzy + endurance);
  const rate = Math.min(5, Math.max(0.2, 1 + 0.002 * agility + speed - (now < (tower.armorFrostUntilUs ?? 0) ? 0.25 : 0)));
  const interval = weapon.cooldown - (gear.some(item => item.itemId === "i304") ? 0.2 : 0);
  const windupUs = us(weapon.windup / rate);
  const cycleUs = Math.max(1, windupUs, us(Math.max(0.000001, interval) / rate));
  tower.attack = { targetId: target.id, readyUs: now + cycleUs, winding: true, startedUs: now };
  if (flame && (!flame.cost || manual) && (manual || tower.flameArrows === true) &&
      flameTargetable(state, tower, target, flame.range)) {
    if (flame.cost) syncMana(state, tower);
    if (!flame.cost || tower.mana! >= flame.cost) {
      if (flame.cost) tower.mana! -= flame.cost;
      tower.attack.flameBonus = flame.bonus;
      delete tower.flameTarget;
    }
  }
  scheduleEvent(state.queue, windupUs, { type: "weapon-fire", towerId: tower.id, targetId: target.id, slot: weapon.slot, startedUs: now });
  scheduleEvent(state.queue, cycleUs, { type: "weapon-ready", towerId: tower.id });
  triggerEquipmentLightning(state, tower, target, gear);
  if (weapon.kind !== "normal" && gear.some(item => item.itemId === "i204" || item.itemId === "i282")) {
    triggerEquipmentVolley(state, tower, target, weapon, gear);
  }
  const skillId = tower.templateId === "G059" ? "A148" : "A067";
  const rank = hero?.ranks[skillId] ?? 0;
  if (rank > 0 && now >= (tower.avalancheReadyUs ?? 0) &&
      rollPercent(state) <= Math.min(60, 15 + 0.05 * strength)) {
    tower.avalancheReadyUs = now + us(2);
    if ((target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 <= 1500 ** 2) {
      scheduleEvent(state.queue, 0, { type: "avalanche", towerId: tower.id, point: { x: target.x, y: target.y }, rank, skillId });
    }
  }
}

function triggerEquipmentVolley(state: Match, tower: Construction, target: Enemy, weapon: Weapon, gear: Item[]) {
  const roll = rollPercent(state);
  if (roll > 25 || state.queue.nowUs < (tower.equipmentVolleyReadyUs ?? 0)) return;
  tower.equipmentVolleyReadyUs = state.queue.nowUs + us(.4);
  const inRange = (enemy: Enemy) => canSeeEnemy(state, enemy) &&
    targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 900 ** 2;
  if (!inRange(target)) return;
  const primary = unitBalance.get(tower.templateId)?.Primary;
  const attribute: "STR" | "AGI" | "INT" | undefined =
    primary === "STR" || primary === "AGI" || primary === "INT" ? primary : undefined;
  const mainAttribute = attribute ? combatAttributes(state, tower)[attribute] : 0;
  const base = weapon.base + mainAttribute * 1.4 +
    gear.reduce((sum, item) => sum + (flatAttack.get(item.itemId) ?? 0), 0);
  for (const enemy of [target, ...state.enemies.filter(enemy => enemy !== target && inRange(enemy)).slice(0, 9)]) {
    if (state.phase !== "running") return;
    if (ordinaryMiss(state, enemy)) continue;
    damageEnemy(state, tower, "q007", enemy, physicalDamage(base + 1, "hero", armorAt(state, enemy), !!enemy.welfare),
      "weapon", gear.some(item => item.itemId === "i204") ? "i204" : "i282");
  }
}

function ordinaryMiss(state: Match, enemy: Enemy) {
  if (state.queue.nowUs < (enemy.evasionUntilUs ?? 0)) return true;
  const threshold = enemy.abilities?.includes("N524") ? 90 : enemy.abilities?.includes("N523") ? 35 : 0;
  return threshold > 0 && rollPercent(state) <= threshold;
}

function damageEnemy(state: Match, tower: Construction, sourceTemplate: string, enemy: Enemy, amount: number,
  kind: "weapon" | "physical" | "magic" | "divine", skillId?: string) {
  const now = state.queue.nowUs;
  if (enemy.hp <= 0 || now < (enemy.phaseUntilUs ?? 0)) return;
  if (enemy.sprintUntilUs && now < enemy.sprintUntilUs) amount *= 1.3;
  if (enemy.eggParentId !== undefined) {
    amount = amount > 0 && kind === "weapon" && tower.templateId === sourceTemplate && tower.hero ? 1 : 0;
  }
  if (sourceTemplate === tower.templateId && now < (tower.weakenedUntilUs ?? 0)) amount *= 0.5;
  if (enemy.abilities?.includes("N525")) {
    const destination = enemy.path?.[0] ?? map.waypoints[enemy.waypoint];
    const degrees = (x: number, y: number) => (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const difference = Math.abs(degrees(destination.x - enemy.x, destination.y - enemy.y) -
      degrees(tower.x - enemy.x, tower.y - enemy.y));
    amount *= tower.x === enemy.x && tower.y === enemy.y ? .9 :
      difference > 130 && difference < 230 ? .4 : difference > 60 && difference < 300 ? .7 : .9;
  }
  syncEnemyMana(state, enemy);
  syncEnemyHealth(state, enemy);
  if (kind === "magic") {
    const resist = [0.15, 0.4, 0.5, 0.6, 0.8, 0.9].reduce((value, factor, index) =>
      enemy.abilities?.includes("T0" + (13 + index)) ? value * (1 - factor) : value, 1);
    amount *= resist;
  }
  if (enemy.shield && amount > 0) {
    const absorbed = Math.min(0.9 * amount, 2 * enemy.mana);
    enemy.mana -= absorbed / 2;
    amount -= absorbed;
  }
  const ownedGear = towerGear(state, tower);
  if (amount > 0 && kind === "weapon" && sourceTemplate === tower.templateId) {
    const melee = weapons[sourceTemplate]?.[0]?.kind === "normal";
    const axe = ownedGear.some(item => item.itemId === "i209") ? "i209" :
      ownedGear.some(item => item.itemId === "i115") ? "i115" : undefined;
    if (melee && axe) {
      const radius = axe === "i209" ? 520 : 380;
      const ratio = axe === "i209" ? .90 : .45;
      for (const bystander of [...state.enemies]) {
        if (state.phase !== "running") break;
        if (bystander === enemy || (bystander.x - enemy.x) ** 2 + (bystander.y - enemy.y) ** 2 > radius ** 2) continue;
        damageEnemy(state, tower, sourceTemplate, bystander, amount * ratio * (bystander.welfare ? .20 : 1), "divine", axe);
      }
      if (state.phase !== "running") return;
    }
  }
  if (kind === "weapon" && sourceTemplate === tower.templateId && amount > 0) {
    if (/^n(?:179|18[0-2])$/.test(sourceTemplate) && rollPercent(state) <= 15) {
      const index = Number(sourceTemplate.slice(1)) - 179;
      const damage = [800, 1200, 1800, 4000][index];
      for (const target of [...state.enemies]) {
        if (state.phase !== "running") return;
        if ((target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= 500 ** 2 &&
            targetable(target, ["ground", "air", "structure"], now)) {
          damageEnemy(state, tower, sourceTemplate, target,
            physicalDamage(damage, "normal", armorAt(state, target), !!target.welfare), "physical", "N0" + (54 + index));
        }
      }
    }
    if (/^n18[3-5]$/.test(sourceTemplate) && rollPercent(state) <= 20 &&
        (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 2000 ** 2) {
      const index = Number(sourceTemplate.slice(1)) - 183;
      chainLightning(state, tower, enemy, 5 + index, [400, 800, 1800][index] * .8, "N0" + (58 + index));
    }
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  const hero = tower.hero;
  if (kind === "weapon" && /^n18[6-9]$/.test(tower.templateId)) {
    dragonCrush(state, tower);
    if (state.phase !== "running" || enemy.hp <= 0) return;
    amount = 0;
  }
  if (kind === "weapon" && amount > 0 && (tower.treeGrab?.cleaveUntilUs ?? 0) > state.queue.nowUs) {
    treeGrabCleave(state, tower, enemy, amount);
    if (state.phase !== "running") return;
  }
  if (kind === "magic") {
    const dagon = Math.max(1, ...ownedGear.map(item => dagonMultiplier.get(item.itemId) ?? 1));
    amount *= dagon;
    if (ownedGear.some(item => item.itemId === "i134")) amount *= 1.32;
    const amplification = tower.hero?.ranks.A021 ?? 0;
    if (amplification > 0) amount *= [1.12, 1.15, 1.20, 1.25, 1.32, 1.40][amplification - 1] ?? 0;
  } else if ((kind === "weapon" || kind === "physical") && ownedGear.some(item => item.itemId === "i132")) {
    amount *= 1.25;
  }
  if (kind === "weapon" && ownedGear.some(item => item.itemId === "i267")) {
    const armor = armorAt(state, enemy);
    if (armor > 0) {
      const ignored = tower.hero?.ranks.A026 ? .175 : .35;
      amount *= (1 + .018 * armor) / (1 + .018 * armor * (1 - ignored));
    }
  }
  if (ownedGear.some(item => item.itemId === "i263")) {
    amount *= 1.18;
    if (kind === "divine") {
      if (rollPercent(state) <= 20) amount *= 2.4;
    } else if (amount > 0) {
      damageEnemy(state, tower, tower.templateId, enemy, amount * .15, "divine", "i263");
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (hero && amount > 0) {
    const stats = combatAttributes(state, tower);
    const bonus = kind === "weapon" || kind === "physical" ? stats.STR * 0.0006 : kind === "magic" ? stats.INT * 0.001 : stats.AGI * 0.0005;
    amount *= 1 + bonus;
    if (hero.ranks.P000) amount *= 1.4;
  }
  if (sourceTemplate === tower.templateId && hasBattleBanner(state, tower)) amount *= 1.2;
  amount *= talentHeroDamageFactor(state, tower.id);
  if (enemy.abilities?.includes("N533") && rollPercent(state) <= 40 && sourceTemplate !== "q025") amount = 0;
  if (sourceTemplate === "q010" && skillId === "A020" && amount > enemy.hp) {
    const excess = amount - enemy.hp;
    for (const bystander of [...state.enemies]) {
      if (state.phase !== "running") return;
      if ((bystander.x - enemy.x) ** 2 + (bystander.y - enemy.y) ** 2 <= 600 ** 2 &&
          targetable(bystander, ["ground", "air", "structure"], now)) {
        damageEnemy(state, tower, tower.templateId, bystander, excess * .8, "magic", "A020");
      }
    }
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  const barrier = enemy.barrier;
  if (barrier && now < barrier.untilUs) {
    if (barrier.hits !== undefined) {
      if (barrier.hits-- > 0) amount = 0;
      else delete enemy.barrier;
    } else if (barrier.damage !== undefined) {
      const absorbed = Math.min(barrier.damage, amount);
      barrier.damage -= absorbed;
      amount -= absorbed;
      if (barrier.damage <= 0) delete enemy.barrier;
    }
  }
  startEnemyReaction(state, enemy, tower, amount);
  if (enemy.abilities?.includes("N574") || enemy.abilities?.includes("N579")) purgeEnemyDebuffs(enemy, amount);
  if (enemy.overdraftArmor) amount *= (100 - Math.min(99, (kind === "magic" ? 3.2 : kind === "divine" ? 3.7 : 4.4) * enemy.overdraftArmor)) / 100;
  if (enemy.welfare) {
    const provisionTower = towerLevels.get(tower.templateId)?.bindings.some(binding => binding.skillId === "N159");
    state.welfareDamage = (state.welfareDamage ?? 0) + amount * (provisionTower ? 0.2 : 1) * (kind === "magic" ? 1.4 : kind === "divine" ? 1 : 0.58);
    return;
  }
  if (amount > enemy.hp) {
    if (enemy.abilities?.includes("N521")) {
      enemy.abilities = enemy.abilities.filter(id => id !== "N521");
      enemy.graveUntilUs = state.queue.nowUs + us(6);
      return;
    }
    if (state.queue.nowUs < (enemy.graveUntilUs ?? 0)) {
      enemy.hp = 1;
      return;
    }
  }
  const hpBefore = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  if (enemy.hp < hpBefore) {
    const hits = state.recentHits ??= [];
    if (hits.length >= 64) hits.shift();
    hits.push({ atUs: now, x: enemy.x, y: enemy.y, targetId: enemy.id, casterId: tower.id, amount: hpBefore - enemy.hp, ...(enemy.hp === 0 ? { deadUnitId: enemy.unitId } : {}) });
  }
  if (enemy.hp !== 0) return;
  if (enemy.unitId === "mBOS") {
    state.finalHit = { towerId: tower.id, sourceTemplate, targetId: enemy.id,
      amount, hpBefore, skillId, atUs: state.queue.nowUs };
  }
  removeDeadEnemy(state, enemy.id, tower.id);
}

function dragonCrush(state: Match, tower: Construction) {
  const tier = Number(tower.templateId.slice(1)) - 186;
  const weapon = weapons[tower.templateId][0];
  const gear = towerGear(state, tower);
  const aura = attackAura(state, tower);
  const rate = 1 + gear.reduce((sum, item) => sum + (equipmentAttackSpeed.get(item.itemId) ?? 0), 0) +
    (nearbyEquipment(state, tower, ["i217"], 800) ? .20 : 0) + aura.drums + (aura.banner ? .50 : 0);
  const interval = weapon.cooldown - (gear.some(item => item.itemId === "i304") ? 0.2 : 0);
  const radius = Math.min(1200, 50 + 260 * interval / rate);
  const bonus = gear.reduce((sum, item) => sum + (flatAttack.get(item.itemId) ?? 0), 0);
  const average = weapon.base + weapon.dice * (weapon.sides + 1) / 2;
  const raw = (average * (1 + aura.command + aura.drums + aura.banner + aura.vengeance) + bonus) * [0.8, 1, 1.2, 1.4][tier];
  const skillId = "N0" + (68 + tier);
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (!targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) ||
        (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > radius ** 2) continue;
    const amount = physicalDamage(raw, "chaos", armorAt(state, enemy), !!enemy.welfare);
    damageEnemy(state, tower, tower.templateId, enemy, amount, "physical", skillId);
  }
}

function armorAt(state: Match, enemy: Enemy) {
  const buff = enemy.armorBuff;
  const corrosion = enemy.corrosion;
  const aura = (nearbyEquipment(state, enemy, ["i217"], 800) ? 30 : 0) +
    (nearbyEquipment(state, enemy, ["i269"], 900) ? 90 : 0);
  const wave = enemy.waveArmor;
  const howl = enemy.howlArmor;
  return (enemy.armor ?? 0) - aura - (howl && howl.expiresUs > state.queue.nowUs ? howl.amount : 0) - (wave && wave.expiresUs > state.queue.nowUs ? wave.amount : 0) + (buff && buff.untilUs > state.queue.nowUs ? buff.value : 0) -
    (corrosion && corrosion.untilUs > state.queue.nowUs ? corrosion.value : 0);
}

function syncEnemyMana(state: Match, enemy: Enemy) {
  if (enemy.manaMax === undefined || enemy.manaTickUs === undefined) return;
  const regeneration = unitBalance.get(enemy.unitId)?.regenMana ?? 0;
  const now = state.queue.nowUs;
  enemy.mana = Math.min(enemy.manaMax, enemy.mana + regeneration * (now - enemy.manaTickUs) / 1_000_000);
  enemy.manaTickUs = now;
}

function startEnemyReaction(state: Match, enemy: Enemy, attacker: Construction, amount: number) {
  const now = state.queue.nowUs;
  if (enemy.abilities?.includes("N516")) {
    const actual = enemy.speed * (enemy.frost?.factor ?? 1) * (enemy.speedBuff ?? 1);
    const increase = Math.floor(300 * amount / (enemy.maxHp ?? enemy.hp));
    if (actual + increase <= 600) enemy.speed += increase / ((enemy.frost?.factor ?? 1) * (enemy.speedBuff ?? 1));
  }
  if (now < Math.max(enemy.stunUntilUs ?? 0, enemy.spellCastingUntilUs ?? 0)) return;
  for (const skill of Object.keys(enemySpells) as EnemySpellId[]) {
    if (!enemy.abilities?.includes(skill)) continue;
    if (skill === "N514" && enemy.hp >= (enemy.maxHp ?? enemy.hp) * 0.4) continue;
    if (skill === "N522" && (enemy.x - attacker.x) ** 2 + (enemy.y - attacker.y) ** 2 >= 800 ** 2) continue;
    const life = enemy.hp / (enemy.maxHp ?? enemy.hp);
    if ((skill === "N530" || skill === "N576") && life >= .3 ||
         (skill === "N531" || skill === "N532" || skill === "N571") && life >= .7 ||
         skill === "N581" && life >= .5) continue;
    if ((skill === "N526" || skill === "N575") && (enemy.barrier?.untilUs ?? 0) > now) continue;
    const spec = enemySpells[skill];
    if (now < (enemy.spellReady?.[skill] ?? 0) || enemy.mana < spec.cost) continue;
    const point = { x: attacker.x, y: attacker.y };
    enemy.spellCastingUntilUs = now + us(spec.cast);
    if (spec.cast === 0) finishEnemyReaction(state, enemy.id, skill, point);
    else scheduleEvent(state.queue, us(spec.cast), { type: "enemy-cast", enemyId: enemy.id, skill, point });
    break;
  }
}

function finishEnemyReaction(state: Match, enemyId: number, skill: EnemySpellId, point: Point) {
  const enemy = state.enemies.find(entry => entry.id === enemyId);
  const now = state.queue.nowUs;
  if (!enemy || now < (enemy.stunUntilUs ?? 0) || enemy.hp <= 0) return;
  syncEnemyMana(state, enemy);
  const spell = enemySpells[skill];
  if (enemy.mana < spell.cost || (skill === "N522" && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 > 900 ** 2)) return;
  enemy.mana -= spell.cost;
  (enemy.spellReady ??= {})[skill] = now + us(spell.cooldown);
  if (skill === "N511") {
    enemy.armorBuff = { value: 9999, untilUs: now + us(2.5) };
    const eligible = state.structures.filter(tower => !tower.pending && weapons[tower.templateId]?.length)
      .map(tower => ({ tower, distance: (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 }))
      .filter(entry => entry.distance <= 450 ** 2).sort((a, b) => a.distance - b.distance || a.tower.id - b.tower.id);
    for (const { tower } of eligible.slice(0, 10)) {
      tower.tauntedTarget = enemy.id;
      if (tower.attack && tower.attack.targetId !== enemy.id) tower.attack.winding = false;
    }
  } else if (skill === "N513" || skill === "N520") {
    const duration = skill === "N513" ? 6 : 8;
    enemy.speedBuff = skill === "N513" ? 1.8 : 1.5;
    enemy.speedBuffUntilUs = now + us(duration);
    if (skill === "N513") enemy.sprintUntilUs = enemy.speedBuffUntilUs;
    scheduleEvent(state.queue, us(duration), { type: "enemy-speed-expire", enemyId });
  } else if (skill === "N515") {
    enemy.phaseUntilUs = now + us(0.5);
    enemy.stunUntilUs = Math.max(enemy.stunUntilUs ?? 0, enemy.phaseUntilUs);
    scheduleEvent(state.queue, us(0.5), { type: "stun-expire", enemyId });
  } else if (skill === "N517") {
    enemy.armorBuff = { value: 40, untilUs: now + us(10) };
  } else if (skill === "N526" || skill === "N575") {
    enemy.barrier = skill === "N526" ? { hits: 50, untilUs: now + us(20) } :
      { damage: 120_000, untilUs: now + us(15) };
  } else if (skill === "N527" || skill === "N571") {
    const windWalk = skill === "N527";
    const duration = windWalk ? 3 : 6;
    enemy.speedBuff = windWalk ? Math.min(3, 600 / enemy.speed) : 1.4;
    enemy.speedBuffUntilUs = now + us(duration);
    if (windWalk) enemy.invisibleFromUs = now + us(.5);
    else enemy.evasionUntilUs = enemy.speedBuffUntilUs;
    scheduleEvent(state.queue, us(duration), { type: "enemy-speed-expire", enemyId });
  } else if (skill === "N530") {
    enemy.hp = Math.min(enemy.hp + 9_000_000, enemy.maxHp ?? enemy.hp);
  } else if (skill === "N531" || skill === "N532") {
    enterEnemyForm(state, enemy, skill === "N531");
  } else if (skill === "N576") {
    const egg = spawn(state, { unitId: "b138", layer: "fly", speed: 0, radius: 1, points: 1, hp: 33, mana: 0,
      armor: null, wave: enemy.wave, abilities: ["N534"], eggParentId: enemy.id }, false, enemy);
    enemy.phaseUntilUs = enemy.stunUntilUs = now + us(6);
    scheduleEvent(state.queue, us(6), { type: "enemy-egg-end", enemyId, eggId: egg.id });
  } else if (skill === "N528" || skill === "N581") {
    stunNearbyTowers(state, enemy, skill === "N528" ? 1500 : 1200, skill === "N528" ? 2 : 3, skill === "N528" ? 1.5 : 3);
  } else {
    const center = skill === "N514" ? enemy : point;
    const radius = skill === "N514" ? 1000 : 20;
    for (const tower of state.structures) {
      if (tower.pending || (tower.x - center.x) ** 2 + (tower.y - center.y) ** 2 > radius ** 2) continue;
      const duration = skill === "N514" ? tower.hero ? 1.2 : 1.8 : tower.hero ? 0.5 : 1;
      tower.stunnedUntilUs = Math.max(tower.stunnedUntilUs ?? 0, now + us(duration));
      if (tower.attack) tower.attack.winding = false;
    }
  }
}

function stunNearbyTowers(state: Match, center: Point, radius: number, normal: number, hero: number) {
  for (const tower of state.structures) {
    if (tower.pending || (tower.x - center.x) ** 2 + (tower.y - center.y) ** 2 > radius ** 2) continue;
    tower.stunnedUntilUs = Math.max(tower.stunnedUntilUs ?? 0, state.queue.nowUs + us(tower.hero ? hero : normal));
    if (tower.attack) tower.attack.winding = false;
  }
}

function purgeEnemyDebuffs(enemy: Enemy, amount: number) {
  if (amount === 0 || (enemy.purgeDamage !== undefined && amount > enemy.hp)) return;
  enemy.purgeDamage = (enemy.purgeDamage ?? 0) + amount;
  const threshold = enemy.abilities?.includes("N579") ? (enemy.maxHp ?? enemy.hp) * .3 : 20_000;
  if (enemy.purgeDamage <= threshold) return;
  enemy.purgeDamage = 0;
  delete enemy.frost;
  delete enemy.leashes;
  delete enemy.waveArmor;
  delete enemy.howlArmor;
  delete enemy.clapSlow;
  delete enemy.stunUntilUs;
}

function enterEnemyForm(state: Match, enemy: Enemy, wolf: boolean) {
  const id = wolf ? "e008" : "e009";
  const base = unitBalance.get(enemy.unitId);
  const form = unitBalance.get(id);
  if (!base || !form || enemy.form) return;
  const lifeDelta = (form.HP ?? 0) - (base.HP ?? 0) + (wolf ? 2500 : 200);
  const armorDelta = (form.def ?? 0) - (base.def ?? 0);
  enemy.form = { unitId: enemy.unitId, lifeDelta, armorDelta, speed: enemy.speed, manaMax: enemy.manaMax ?? enemy.mana,
    abilities: enemy.abilities ?? [] };
  enemy.unitId = id;
  enemy.healthTickUs = state.queue.nowUs;
  enemy.hp += lifeDelta;
  enemy.maxHp = (enemy.maxHp ?? enemy.hp - lifeDelta) + lifeDelta;
  enemy.armor = (enemy.armor ?? 0) + armorDelta;
  enemy.speed += (form.spd ?? 0) - (base.spd ?? 0);
  enemy.manaMax = Math.max(0, enemy.form.manaMax + (form.manaN ?? 0) - (base.manaN ?? 0));
  enemy.mana = Math.min(enemy.mana, enemy.manaMax);
  enemy.abilities = [...enemy.form.abilities.filter(id => id !== "T016"), "T014"];
  scheduleEvent(state.queue, us(20), { type: "enemy-form-end", enemyId: enemy.id });
}

function finishEnemyForm(state: Match, enemyId: number) {
  const enemy = state.enemies.find(entry => entry.id === enemyId);
  if (!enemy?.form) return;
  syncEnemyMana(state, enemy);
  syncEnemyHealth(state, enemy);
  const form = enemy.form;
  enemy.unitId = form.unitId;
  enemy.maxHp = (enemy.maxHp ?? enemy.hp) - form.lifeDelta;
  enemy.hp = Math.min(enemy.maxHp, Math.max(1, enemy.hp - form.lifeDelta));
  enemy.armor = (enemy.armor ?? 0) - form.armorDelta;
  enemy.speed = form.speed;
  enemy.manaMax = form.manaMax;
  enemy.mana = Math.min(enemy.mana, enemy.manaMax);
  enemy.abilities = form.abilities;
  delete enemy.form;
}

function syncEnemyHealth(state: Match, enemy: Enemy) {
  if (!enemy.form || enemy.unitId !== "e009") return;
  const now = state.queue.nowUs;
  const time = enemy.healthTickUs ?? now;
  enemy.hp = Math.min(enemy.maxHp ?? enemy.hp, enemy.hp + 14_000 * (now - time) / 1_000_000);
  enemy.healthTickUs = now;
}

function treeGrabCleave(state: Match, tower: Construction, main: Enemy, amount: number) {
  const skillId = tower.templateId === "G059" ? "A149" : "A068";
  const rank = tower.hero?.ranks[skillId] ?? 0;
  let targets = 0;
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (enemy === main || enemy.hp <= 0 || (main.x - enemy.x) ** 2 + (main.y - enemy.y) ** 2 > 400 ** 2) continue;
    targets++;
    damageEnemy(state, tower, tower.templateId, enemy, amount * (enemy.welfare ? 0.4 : 0.5), "divine", skillId);
  }
  if (!tower.treeGrab || rank < 1) return;
  const now = state.queue.nowUs;
  const minimum = us([7, 6, 5, 4, 2, 0.2][rank - 1]);
  if (tower.treeGrab.readyUs - now > minimum) {
    tower.treeGrab.readyUs = Math.max(now + minimum, tower.treeGrab.readyUs - us(targets));
  }
}

function applyWeaponDamage(state: Match, shot: WeaponShot, enemy: Enemy, multiplier: number, primary = true) {
  const tower = firingUnit(state, shot.towerId);
  if (!tower) return;
  if (tower.summon?.independent) {
    let damage = shot.raw;
    const cap = [10, 15, 20, 20][Number(shot.sourceTemplate.slice(1)) - 103];
    if (targetable(enemy, ["ground", "air"], state.queue.nowUs) && !magicImmune(enemy) &&
        !enemy.abilities?.some(id => id === "Aloc" || id === "Avul" || id === "Aeth")) {
      syncEnemyMana(state, enemy);
      const drained = Math.min(cap, Math.max(0, enemy.mana));
      enemy.mana -= drained;
      damage += drained;
    }
    damageEnemy(state, tower, shot.sourceTemplate, enemy,
      physicalDamage(damage * multiplier, shot.weapon.attackType, armorAt(state, enemy), !!enemy.welfare), "weapon", tower.summon.skillId);
    return;
  }
  if (shot.summon) {
    const { green, blue, attack, banner } = shot.summon;
    if (green > 0) damageEnemy(state, tower, shot.sourceTemplate, enemy, green * combatAttributes(state, tower).AGI, "divine", "T086");
    if (state.phase !== "running") return;
    if (blue > 0 && rollPercent(state) <= 15) {
      for (const target of [...state.enemies]) {
        if (state.phase !== "running") return;
        if ((target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= 400 ** 2) {
          damageEnemy(state, tower, shot.sourceTemplate, target, blue * attack * .4, "magic", "T087");
        }
      }
    }
    damageEnemy(state, tower, shot.sourceTemplate, enemy, physicalDamage(shot.raw * (banner ? 1.2 : 1) * multiplier,
      shot.weapon.attackType, armorAt(state, enemy), !!enemy.welfare), "weapon", shot.summon.skillId ?? "A094");
    return;
  }
  if (primary && /^n15[3-5]$/.test(shot.sourceTemplate) && targetable(enemy, ["ground", "air"], state.queue.nowUs)) {
    const rank = Number(shot.sourceTemplate.slice(1)) - 153;
    sendTowerWave(state, tower, enemy, "N0" + (17 + rank), 1200, [900, 1200, 1500][rank],
      [100, 110, 120][rank], [300, 600, 1200][rank], true);
  }
  let damage = (shot.raw + (shot.orbBonus ?? 0)) * multiplier;
  if (/^n16[0-3]$/.test(shot.sourceTemplate) &&
      !(enemy.abilities?.includes("N534") && unitBalance.get(enemy.unitId)?.type?.split(",").includes("sapper"))) {
    damage *= [1.2, 1.4, 1.6, 1.8][Number(shot.sourceTemplate.slice(1)) - 160];
  }
  if (/^n14[4-6]$/.test(shot.sourceTemplate) && targetable(enemy, ["ground"], state.queue.nowUs) && rollPercent(state) <= 30) {
    const duration = enemy.abilities?.includes("N534") ? .01 : .1;
    enemy.stunUntilUs = Math.max(enemy.stunUntilUs ?? 0, state.queue.nowUs + us(duration));
    scheduleEvent(state.queue, enemy.stunUntilUs - state.queue.nowUs, { type: "stun-expire", enemyId: enemy.id });
    damage += [260, 550, 850][Number(shot.sourceTemplate.slice(1)) - 144];
  }
  if (primary && shot.corrosion && (!enemy.corrosion || enemy.corrosion.untilUs <= state.queue.nowUs ||
      shot.corrosion >= enemy.corrosion.value)) {
    enemy.corrosion = { value: shot.corrosion, untilUs: state.queue.nowUs + us(5) };
  }
  if (!shot.weapon.speed && enemy.armorBuff && enemy.armorBuff.value === 40 && enemy.armorBuff.untilUs > state.queue.nowUs) {
    tower.armorFrostUntilUs = state.queue.nowUs + us(1);
  }
  if (shot.frost) {
    enemy.frost = { factor: 1 - shot.frost, expiresUs: state.queue.nowUs + us(3) };
    scheduleEvent(state.queue, us(3), { type: "frost-expire", enemyId: enemy.id });
  }
  damageEnemy(state, tower, shot.sourceTemplate, enemy,
    physicalDamage(damage, shot.weapon.attackType, armorAt(state, enemy), !!enemy.welfare), "weapon");
}

function avalanche(state: Match, towerId: number, point: Point, rank: number, skillId: string) {
  const tower = state.structures.find(entry => entry.id === towerId);
  if (!tower) return;
  const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "structure"], state.queue.nowUs) &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 300 ** 2);
  for (const enemy of targets) {
    if (state.phase !== "running") break;
    const isResistant = enemy.abilities?.includes("N534");
    const duration = isResistant ? [0.1, 0.3, 0.4, 0.5, 0.6, 0.8] : [0.4, 0.6, 0.8, 1, 1.2, 1.5];
    enemy.stunUntilUs = Math.max(enemy.stunUntilUs ?? 0, state.queue.nowUs + us(duration[rank - 1]));
    scheduleEvent(state.queue, enemy.stunUntilUs - state.queue.nowUs, { type: "stun-expire", enemyId: enemy.id });
    damageEnemy(state, tower, "q001", enemy, [150, 275, 420, 650, 860, 1120][rank - 1] * 0.8, "magic", skillId);
  }
}

const immolationSources = new Map(["n021", "n022", "n023", "n024", "n025"]
  .map((id, rank) => [id, { skillId: "N" + (127 + rank), damage: [60, 100, 150, 200, 300][rank] }] as const));

function tickImmolation(state: Match, towerId: number) {
  const tower = state.structures.find(entry => entry.id === towerId);
  const effect = tower && immolationSources.get(tower.templateId);
  if (!tower || !effect) return;
  scheduleEvent(state.queue, us(1), { type: "immolation", towerId });
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (enemy.hp <= 0 || (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 > 600 ** 2) continue;
    damageEnemy(state, tower, tower.templateId, enemy, effect.damage * 0.8, "magic", effect.skillId);
  }
}

function finishWeapon(state: Match, shot: WeaponShot) {
  const { weapon } = shot;
  const main = state.enemies.find(enemy => enemy.id === shot.targetId && targetable(enemy, weapon.targets, state.queue.nowUs));
  const crit = criticalMultipliers.get(shot.sourceTemplate);
  if (main && crit && rollPercent(state) <= 20) shot.raw *= crit;
  if (!weapon.splash) {
    if (main && !ordinaryMiss(state, main)) applyWeaponDamage(state, shot, main, 1);
    return;
  }
  const ring = (enemy: Enemy) => weapon.splash!.find(([radius]) =>
    (enemy.x - shot.destination.x) ** 2 + (enemy.y - shot.destination.y) ** 2 <= radius ** 2);
  const mainBand = main && ring(main);
  if (main && mainBand) {
    if (weapon.kind === "artillery") {
      if (!shot.artilleryMiss) applyWeaponDamage(state, shot, main, mainBand[1]);
    } else {
      if (ordinaryMiss(state, main)) return;
      applyWeaponDamage(state, shot, main, 1);
    }
  }
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (enemy.id === main?.id || !targetable(enemy, weapon.splashTargets!, state.queue.nowUs)) continue;
    const band = ring(enemy);
    if (band) applyWeaponDamage(state, shot, enemy, band[1], false);
  }
}

function scheduleWeaponImpact(state: Match, shot: WeaponShot) {
  const distance = Math.hypot(shot.destination.x - shot.point.x, shot.destination.y - shot.point.y);
  const travel = us(distance / shot.weapon.speed);
  const delay = shot.weapon.homing ? Math.min(movementStepUs, travel) : travel;
  scheduleEvent(state.queue, distance > 0 ? Math.max(1, delay) : 0, { type: "weapon-impact", shot, travelUs: delay });
}

function advanceWeaponShot(state: Match, shot: WeaponShot, travelUs: number) {
  if (!state.structures.some(tower => tower.id === shot.towerId)) return;
  if (shot.weapon.homing) {
    const target = state.enemies.find(enemy => enemy.id === shot.targetId && targetable(enemy, shot.weapon.targets, state.queue.nowUs));
    if (!target) return;
    shot.destination = { x: target.x, y: target.y };
    const distance = Math.hypot(target.x - shot.point.x, target.y - shot.point.y);
    const step = shot.weapon.speed * travelUs / 1_000_000;
    if (distance > step + shot.weapon.speed / 1_000_000) {
      shot.point.x += (target.x - shot.point.x) * step / distance;
      shot.point.y += (target.y - shot.point.y) * step / distance;
      scheduleWeaponImpact(state, shot);
      return;
    }
  }
  finishWeapon(state, shot);
}

function firingUnit(state: Match, towerId: number) {
  return state.structures.find(entry => entry.id === towerId) ?? state.summons?.find(entry => entry.id === towerId);
}

function fireWeapon(state: Match, towerId: number, targetId: number, slot: number, startedUs?: number) {
  const tower = firingUnit(state, towerId);
  if (!tower?.attack?.winding || startedUs !== undefined && tower.attack.startedUs !== startedUs) return;
  tower.attack.winding = false;
  if (tower.pending) return;
  const target = state.enemies.find(enemy => enemy.id === targetId);
  const weapon = weapons[tower.templateId]?.find(entry => entry.slot === slot);
  const gear = towerGear(state, tower);
  if (!target || !weapon || !canSeeEnemy(state, target) || !inWeaponRange(tower, target, weapon, weaponRange(weapon, gear), true, state.queue.nowUs)) return;
  const hero = tower.hero;
  const primary = unitBalance.get(tower.templateId)?.Primary;
  const attr: keyof Hero["natural"] | undefined = primary === "STR" || primary === "AGI" || primary === "INT" ? primary : undefined;
  const mainAttribute = attr ? combatAttributes(state, tower)[attr] : 0;
  const aura = attackAura(state, tower);
  const baseDamage = weapon.base + mainAttribute * 1.4 + (hero?.ranks.A069 ?? 0) * 90 +
    rollDice(state, weapon.dice, weapon.sides);
  const amount = baseDamage * (1 + aura.command + aura.drums + aura.banner + aura.vengeance) +
    gear.reduce((sum, item) => sum + (flatAttack.get(item.itemId) ?? 0), tower.summon?.attack ?? 0) +
    (tower.contracts ? Object.values(tower.contracts).reduce((sum, attack) => sum + attack, 0) : 0);
  const frost = /^n00[6-9]$|^n010$/.test(tower.templateId)
    ? [0.06, 0.08, 0.10, 0.12, 0.15][Number(tower.templateId.slice(1)) - 6] : undefined;
  const shot: WeaponShot = {
    towerId: tower.summon?.independent ? towerId : tower.summon?.ownerId ?? towerId, targetId, ...(frost === undefined ? {} : { frost }),
    ...(tower.summon && !tower.summon.independent ? { summon: { id: tower.id, green: tower.summon.green, blue: tower.summon.blue, attack: tower.summon.attack, banner: !!aura.banner, skillId: tower.summon.skillId } } : {}),
    sourceTemplate: tower.templateId, weapon, raw: amount,
    point: { x: tower.x, y: tower.y }, destination: { x: target.x, y: target.y },
  };
  const orbRank = hero?.ranks.A040 ?? 0;
  if (tower.attack.flameBonus) {
    shot.orbBonus = tower.attack.flameBonus;
    shot.weapon = { ...weapon, homing: true, speed: 1500 };
  } else if (orbRank && tower.flameArrows !== false && (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 <= 1300 ** 2) {
    syncMana(state, tower);
    if (tower.mana! >= 3) {
      tower.mana! -= 3;
      shot.orbBonus = [500, 700, 900, 1100, 1300, 1500][orbRank - 1];
      shot.weapon = { ...weapon, homing: true, speed: 1500 };
    }
  }
  if (gear.some(item => item.itemId === "i188")) shot.corrosion = 70;
  else if (gear.some(item => item.itemId === "i186")) shot.corrosion = 25;
  if (weapon.kind === "artillery") shot.artilleryMiss = ordinaryMiss(state, target);
  tower.lastAttackUs = state.queue.nowUs;
  tower.lastAttackTarget = { x: target.x, y: target.y };
  if (weapon.kind === "normal") finishWeapon(state, shot);
  else scheduleWeaponImpact(state, shot);

  const group = tower.summon?.projectileGroup ??
    (/^b13[2-7]$/.test(tower.templateId) ? { extra: 3, range: 700, speed: 900 } : undefined);
  if (group && state.queue.nowUs >= (tower.multishotReadyUs ?? 0)) {
    tower.multishotReadyUs = state.queue.nowUs + us(2);
    const others = state.enemies.filter(enemy => enemy.id !== targetId && canSeeEnemy(state, enemy) &&
      targetable(enemy, weapon.targets, state.queue.nowUs) && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= group.range ** 2);
    let budget = 9_999_999;
    for (const enemy of others.slice(0, group.extra)) {
      const raw = Math.min(shot.raw, budget);
      if (raw <= 0) break;
      budget -= raw;
      scheduleWeaponImpact(state, { ...shot, raw, targetId: enemy.id, point: { ...shot.point },
        weapon: { ...shot.weapon, speed: group.speed, homing: true }, destination: { x: enemy.x, y: enemy.y } });
    }
  }
  const arrowRank = /^n00[1-5]$/.test(tower.templateId) ? Number(tower.templateId.slice(1)) : 0;
  if (arrowRank > 0 && state.queue.nowUs >= (tower.multishotReadyUs ?? 0)) {
    tower.multishotReadyUs = state.queue.nowUs + us(2);
    const targets = state.enemies.filter(enemy => enemy.id !== targetId && targetable(enemy, weapon.targets, state.queue.nowUs) &&
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 1000 ** 2).slice(0, arrowRank + 1);
    let budget = 9_999_999;
    for (const enemy of targets) {
      const raw = Math.min(amount, budget);
      if (raw <= 0) break;
      budget -= raw;
      const { corrosion: _corrosion, ...secondary } = shot;
      scheduleWeaponImpact(state, {
        ...secondary, raw, point: { ...shot.point }, targetId: enemy.id, weapon: { ...weapon, homing: true, speed: 1800 },
        destination: { x: enemy.x, y: enemy.y },
      });
    }
  }
}

function buySpecial(state: Match, shop: "challenge" | "mystery", itemId: string): Result {
  if (!(shop === "challenge" ? state.challengeShopOpen : state.mysteryShopOpen)) return { ok: false, reason: "closed" };
  if (shop === "mystery" && itemId === "i399") {
    if (state.mysteryRefreshed) return { ok: false, reason: "stock" };
    state.mysteryRefreshed = true;
    state.mysteryStock = drawMysteryStock(() => roll(state));
    return { ok: true };
  }
  const stock = shop === "challenge" ? state.challengeStock : state.mysteryStock;
  if (!stock || !Object.hasOwn(stock, itemId) || stock[itemId] < 1) return { ok: false, reason: "stock" };
  const fields = itemFields.get(itemId)!;
  const cost = { gold: fields.goldcost ?? 0, wood: fields.lumbercost ?? 0, population: 0 };
  if (!canPay(state, cost)) return { ok: false, reason: "resources" };
  if (freeWorkerSlot(state) === null) return { ok: false, reason: "full" };
  pay(state, cost, 1);
  stock[itemId]--;
  return { ok: true, createdId: deliverItem(state, itemId) };
}

function chooseSkin(state: Match, towerId: number, choice: string): Result {
  const tower = state.structures.find(entry => entry.id === towerId);
  if (choice !== firelordSkin.choice || tower?.templateId !== firelordSkin.from || !tower.hero || tower.pending) {
    return { ok: false, reason: "missing" };
  }
  if (state.queue.nowUs < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  // Drop in slot order while the source template still owns each item.
  for (let slot = 0; slot < 6; slot++) {
    const item = state.inventory?.find(entry => entry.towerId === tower.id && entry.slot === slot);
    if (item && item.itemId !== "i310" && item.itemId !== "i304") dropItem(state, item);
  }
  tower.hero.natural.STR += 30;
  tower.hero.natural.AGI += 30;
  tower.hero.natural.INT += 30;
  for (const [old, replacement] of Object.entries(firelordSkillSlots)) {
    if (!Object.hasOwn(tower.hero.ranks, old)) continue;
    tower.hero.ranks[replacement] = tower.hero.ranks[old];
    delete tower.hero.ranks[old];
  }
  tower.hero.paid = tower.hero.paid.map(id => firelordSkillSlots[id] ?? id);
  tower.templateId = firelordSkin.to;
  // The original two templates have identical collision and weapon timing. The
  // existing stationary tower and in-flight clocks already retain those values.
  syncMana(state, tower);
  return { ok: true };
}

function execute(state: Match, action: Action): Result {
  switch (action.type) {
    case "choose-talent": {
      const choice = talentChoices.find(entry => entry.choice === action.choice);
      if (!choice || state.talent) return { ok: false, reason: "missing" };
      state.talent = { id: choice.id, rank: 1, readyUs: 0, busyUntilUs: 0 };
      if (choice.id === "W017") state.luckLevel = 1;
      return { ok: true };
    }
    case "claim-wave": {
      const reward = waveRewards[action.slot];
      if (!reward || state.waveRewardSlots?.[action.slot] !== 2) return { ok: false, reason: "missing" };
      state.waveRewardSlots[action.slot] = 3;
      return { ok: true, createdId: deliverItem(state, reward.itemId) };
    }
    case "overdraft":
      if (!state.overdraftOpen) return { ok: false, reason: "closed" };
      if ((state.overdraftPoints ?? 0) >= 20) return { ok: false, reason: "stock" };
      state.overdraftPoints = (state.overdraftPoints ?? 0) + 1;
      return { ok: true };
    case "reserve-challenge": return reserveChallenge(state, action.unitId);
    case "buy-special": return buySpecial(state, action.shop, action.itemId);
    case "cast-talent": return { ok: false, reason: "missing" };
    case "use-item": {
      const item = state.inventory?.find(item => item.id === action.itemId && item.slot !== null && item.towerId === undefined);
      return item ? useWorkerItem(state, item, action.targetId) : { ok: false, reason: "missing" };
    }
    case "drop-item": {
      const item = state.inventory?.find(item => item.id === action.itemId && item.slot !== null);
      if (!item || !canMoveItem(item.itemId)) return { ok: false, reason: "missing" };
      dropItem(state, item);
      return { ok: true };
    }
    case "transfer-item": {
      const item = state.inventory?.find(item => item.id === action.itemId && item.slot !== null);
      const tower = itemOwner(state, action.towerId);
      if (!item || !canMoveItem(item.itemId) || (action.towerId !== undefined && !tower) || tower?.pending ||
          itemOwner(state, item.towerId)?.pending || item.towerId === action.towerId) {
        return { ok: false, reason: "missing" };
      }
      const source = itemOwner(state, item.towerId) ?? state.worker;
      const destination = tower ?? state.worker;
      if (Math.hypot(source.x - destination.x, source.y - destination.y) > 1000) return { ok: false, reason: "range" };
      const slot = freeItemSlot(state, tower);
      if (slot === null) return { ok: false, reason: "full" };
      if (tower && !equipmentAllowed(state, item.itemId, tower)) {
        item.towerId = tower.id;
        dropItem(state, item);
        return { ok: false, reason: "equipment" };
      }
      item.slot = slot;
      delete item.towerId;
      if (tower) item.towerId = tower.id;
      return { ok: true, createdId: finishPickup(state, item, tower) };
    }
    case "pick-up-item": {
      const item = state.inventory?.find(item => item.id === action.itemId && item.slot === null);
      if (!item) return { ok: false, reason: "missing" };
      if (Math.hypot(item.point.x - state.worker.x, item.point.y - state.worker.y) > 400) return { ok: false, reason: "range" };
      const lumber = lumberVouchers.get(item.itemId);
      if (lumber !== undefined) {
        removeItem(state, item);
        state.lumber += lumber;
        return { ok: true };
      }
      const slot = freeWorkerSlot(state);
      if (slot === null) return { ok: false, reason: "full" };
      item.slot = slot;
      return { ok: true, createdId: finishPickup(state, item) };
    }
    case "draw":
    case "buy-item":
    case "buy-book": {
      if (action.type === "draw" && !Object.hasOwn(configuration.cardRolls, action.draw)) return { ok: false, reason: "missing" };
      const id = action.type === "draw" ? action.draw : action.type === "buy-item" ? action.itemId : action.bookId;
      const definition = ordinaryGoods.get(id);
      if (!definition) return { ok: false, reason: "missing" };
      if (state.gold < definition.gold || state.lumber < definition.lumber) return { ok: false, reason: "resources" };
      const outstanding = (state.shopRestock?.[id] ?? state.bookRestock?.[id as BookId] ?? [])
        .filter(due => due > state.queue.nowUs);
      if (outstanding.length >= definition.stock) return { ok: false, reason: "stock" };
      if (!lumberVouchers.has(id) && freeWorkerSlot(state) === null) return { ok: false, reason: "full" };

      const previousDue = outstanding.at(-1) ?? state.queue.nowUs;
      outstanding.push(previousDue + us(definition.replenishSeconds));
      (state.shopRestock ??= {})[id] = outstanding;
      state.gold -= definition.gold;
      state.lumber -= definition.lumber;
      const createdId = deliverItem(state, id);
      if (action.type === "draw") return useWorkerItem(state, state.inventory!.find(item => item.id === createdId)!);
      return { ok: true, createdId };
    }
    case "use-book": {
      const index = state.books?.findIndex(book => book.id === action.itemId) ?? -1;
      const book = state.books?.[index];
      const tower = state.structures.find(entry => entry.id === action.towerId);
      if (!book || book.charges < 1 || !tower?.hero || tower.pending) return { ok: false, reason: "missing" };

      book.charges--;
      grantHeroExperience(state, action.towerId, bookExperience(book.bookId, tower.hero.level));
      if (book.charges === 0) state.books!.splice(index, 1);
      return { ok: true };
    }

    case "cast-tower": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      return tower ? beginTowerSpell(state, tower, action.skillId, false) : { ok: false, reason: "missing" };
    }
    case "stop-tower-cast": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      if (!tower?.swordRainToken) return { ok: false, reason: "missing" };
      stopSwordRain(tower, state.queue.nowUs);
      return { ok: true };
    }
    case "cast-flame-arrow": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      const effect = tower && flameArrow(tower);
      if (!tower || !effect || tower.pending) return { ok: false, reason: "missing" };
      if (!flameArrowTargets(state, tower.id)?.some(enemy => enemy.id === action.targetId)) {
        return { ok: false, reason: "range" };
      }
      tower.flameTarget = action.targetId;
      return { ok: true };
    }
    case "cast-equipment": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      const book = tower && towerGear(state, tower).find(item => item.id === action.itemId);
      if (!tower || !book || tower.pending) return { ok: false, reason: "missing" };
      return necromancyBooks.includes(book.itemId) ? useNecromancy(state, tower, book.itemId) : useRestoration(state, tower, book);
    }
    case "choose-skin": return chooseSkin(state, action.towerId, action.choice);
    case "toggle-flame-arrows": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      const effect = tower && flameArrow(tower);
      if (!tower || !effect || tower.pending) return { ok: false, reason: "missing" };
      tower.flameArrows = effect.cost ? tower.flameArrows === false : tower.flameArrows !== true;
      return { ok: true };
    }
    case "cast-hero": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      return tower ? beginHeroSpell(state, tower, action.skillId, false) : { ok: false, reason: "missing" };
    }
    case "learn-skill": {
      const tower = state.structures.find(tower => tower.id === action.towerId);
      if (!tower?.hero || tower.pending) return { ok: false, reason: "missing" };
      if (!learnHeroSkill(tower.hero, tower.templateId, action.skillId)) return { ok: false, reason: "learning" };
      if (action.skillId === "A040") tower.flameArrows = true;
      return { ok: true };
    }
    case "recycle-tower": {
      const index = state.structures.findIndex(tower => tower.id === action.towerId);
      const tower = state.structures[index];
      if (!tower || tower.pending) return { ok: false, reason: "missing" };
      if (Math.hypot(tower.x - state.worker.x, tower.y - state.worker.y) > 1000) {
        return { ok: false, reason: "range" };
      }
      const points = towerLevels.get(tower.templateId)?.fields.points?.value ?? 0;
      state.gold += Math.floor(points * recycleRate);
      state.population -= tower.population;
      for (const item of state.inventory?.filter(item => item.towerId === tower.id) ?? []) {
        if (recycleDestroyedItems.has(item.itemId)) removeItem(state, item);
        else dropItem(state, item);
      }
      state.structures.splice(index, 1);
      return { ok: true };
    }
    case "choose-opening":
      if (!canChooseOpening(state) || !openingChoices.includes(action.card)) return { ok: false, reason: "opening" };
      state.openingCard = action.card;
      return { ok: true, createdId: deliverCard(state, action.card) };
    case "buy-weight": {
      if (!Object.hasOwn(state.blackWeights, action.card)) return { ok: false, reason: "missing" };
      const weight = state.blackWeights[action.card];
      const price = 500 + (weight - 100) * 11;
      if (state.gold < price) return { ok: false, reason: "resources" };
      const chance = rollPercent(state);
      const multiplier = chance === 1 ? 3 : chance <= 24 ? 2 : 1;
      state.gold -= price;
      state.blackWeights[action.card] = weight + Math.floor(weight * multiplier * 15 / 100);
      return { ok: true };
    }
    case "drop-card": {
      const card = state.cards.find(card => card.id === action.cardId && card.slot !== null);
      if (!card || summonCards.get(card.card)?.itemFields.droppable !== 1) return { ok: false, reason: "missing" };
      card.slot = null;
      card.point = { ...state.worker };
      return { ok: true };
    }
    case "swap-worker-slots": {
      const { from, to } = action;
      if (![from, to].every(slot => Number.isInteger(slot) && slot >= 0 && slot < 6) || from === to) {
        return { ok: false, reason: "missing" };
      }
      const carried = [...state.cards, ...state.books ?? [], ...state.inventory?.filter(item => item.towerId === undefined) ?? []];
      const source = carried.find(entry => entry.slot === from);
      if (!source) return { ok: false, reason: "missing" };
      const target = carried.find(entry => entry.slot === to);
      source.slot = to;
      if (target) target.slot = from;
      return { ok: true };
    }
    case "pick-up-card": {
      const card = state.cards.find(card => card.id === action.cardId && card.slot === null);
      if (!card) return { ok: false, reason: "missing" };
      if (Math.hypot(card.point.x - state.worker.x, card.point.y - state.worker.y) > 400) return { ok: false, reason: "range" };
      const slot = freeWorkerSlot(state);
      if (slot === null) return { ok: false, reason: "full" };
      card.slot = slot;
      return { ok: true };
    }
    case "exchange": {
      if (!state.qualificationShopOpen) return { ok: false, reason: "closed" };
      const chain = qualificationChains.get(action.qualification);
      if (!chain) return { ok: false, reason: "missing" };
      const materials = state.cards.filter(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === 12)
        .sort((a, b) => a.slot! - b.slot!).slice(0, 5);
      if (materials.length !== 5) return { ok: false, reason: "materials" };
      state.cards = state.cards.filter(card => !materials.includes(card));
      return { ok: true, createdId: deliverCard(state, chain.targetedCard) };
    }
    case "cancel-construction": {
      const index = state.structures.findIndex(tower => tower.id === action.towerId);
      const tower = state.structures[index];
      if (!tower?.pending) return { ok: false, reason: "missing" };
      const { timer, cost, upgradeTo, consumedCard } = tower.pending;
      cancelEvent(state.queue, timer);
      pay(state, cost, -1);
      if (upgradeTo) tower.pending = null;
      else state.structures.splice(index, 1);
      if (consumedCard) {
        const remaining = state.cards.find(card => card.id === consumedCard.id && card.slot !== null);
        if (remaining) remaining.charges++;
        else deliverCard(state, consumedCard.card, tower, consumedCard.hp);
      }
      return { ok: true };
    }
    case "upgrade-tower": {
      const tower = state.structures.find(tower => tower.id === action.towerId);
      const upgrade = tower && towerLevels.get(tower.templateId)?.upgrade;
      if (!tower || tower.pending || !upgrade) return { ok: false, reason: "missing" };
      const cost = { gold: upgrade.gold, wood: upgrade.wood, population: upgrade.populationDelta };
      if (!canPay(state, cost)) return { ok: false, reason: "resources" };
      const timer = scheduleEvent(state.queue, us(upgrade.seconds), { type: "finish-construction", towerId: tower.id });
      tower.pending = { timer, cost, upgradeTo: upgrade.to };
      pay(state, cost, 1);
      return { ok: true };
    }
    case "build-card":
    case "build-worker-tower": return construct(state, action);
  }
}

function recordResult(state: Match, command: Command, result: Result) {
  Object.defineProperty(state.commandResults, command.id, {
    value: result, enumerable: true, configurable: true, writable: true,
  });
}

function startApproach(state: Match, command: Command) {
  const { action } = command;
  let target: Point | undefined;
  let range = 100;
  if (action.type === "build-card" || action.type === "build-worker-tower") {
    target = buildAnchor(action.point, towerRadius, state.structures);
  } else if (action.type === "pick-up-card") {
    target = state.cards.find(card => card.id === action.cardId && card.slot === null)?.point;
    range = 400;
  } else if (action.type === "pick-up-item") {
    target = state.inventory?.find(item => item.id === action.itemId && item.slot === null)?.point;
    range = 400;
  } else if (action.type === "transfer-item") {
    const item = state.inventory?.find(item => item.id === action.itemId && item.slot !== null && canMoveItem(item.itemId));
    if (item?.towerId === undefined && item && action.towerId !== undefined) target = itemOwner(state, action.towerId);
    else if (item?.towerId !== undefined && action.towerId === undefined) target = itemOwner(state, item.towerId);
    range = 1000;
  }
  if (!target) return false;
  if (state.approach) {
    recordResult(state, state.approach.command, { ok: false, reason: "range" });
    state.approach = null;
  }
  if (Math.hypot(target.x - state.worker.x, target.y - state.worker.y) <= range) return false;
  state.approach = { command, point: { x: target.x, y: target.y }, path: [], range };
  return true;
}

function moveWorker(state: Match) {
  const approach = state.approach;
  if (!approach) return;
  const range = approach.range ?? 100;
  const worker: Mobile = { ...state.worker, id: 0, layer: "fly", radius: 1, speed: 350,
    waypoint: 0, previousWaypoint: null, initialOverlaps: [] };
  const sweep = movementSweep(worker, state.enemies);
  let budget = worker.speed / 32;
  if (!approach.path.length || !sweep(worker, approach.path[0])) {
    approach.path = findApproachPath(worker, approach.point, range, sweep) ?? [];
  }
  while (budget > 0 && approach.path.length) {
    const next = approach.path[0];
    if (!sweep(worker, next)) break;
    const d = Math.hypot(next.x - worker.x, next.y - worker.y);
    const step = Math.min(budget, d);
    if (d > 0) {
      worker.x += (next.x - worker.x) * step / d;
      worker.y += (next.y - worker.y) * step / d;
    }
    budget -= step;
    if (step === d) approach.path.shift();
  }
  state.worker = { x: worker.x, y: worker.y };
  if (Math.hypot(worker.x - approach.point.x, worker.y - approach.point.y) <= range) {
    state.approach = null;
    recordResult(state, approach.command, execute(state, approach.command.action));
  }
}

export function enqueue(state: Match, command: Command) {
  if (state.phase !== "running" || state.matchId !== command.matchId) return false;
  if (Object.hasOwn(state.commandResults, command.id) || state.approach?.command.id === command.id || state.queue.pending.some(
    ({ payload }) => (payload.type === "command" || payload.type === "commit-talent") && payload.command.id === command.id,
  )) return false;
  // Inputs received during catch-up apply after all already credited time.
  scheduleEvent(state.queue, state.clock.targetUs - state.queue.nowUs + 1, { type: "command", command: structuredClone(command) });
  return true;
}

export function creditTime(state: Match, elapsedMs: number) {
  if (state.phase !== "running" || state.clock.paused || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
  const credited = state.clock.fractionUs + elapsedMs * 1_000 * state.clock.speed;
  const integerUs = Math.floor(credited);
  state.clock.targetUs += integerUs;
  state.clock.fractionUs = credited - integerUs;
}

export function drain(state: Match, eventLimit: number, shouldYield?: () => boolean) {
  if (state.phase !== "running") return "stopped";
  const advanced = advanceEvents(state.queue, state.clock.targetUs, eventLimit, ({ payload: event }) => {
    switch (event.type) {
      case "movement":
        moveWorker(state);
        reconcileEquipmentBurn(state);
        const shivasGuard = state.inventory?.some(item => item.itemId === "i155" && item.slot !== null && (item.towerId ?? 0) > 0);
        for (const enemy of state.enemies) {
          if (enemy.purge) {
            if (state.queue.nowUs >= enemy.purge.endUs) delete enemy.purge;
            else if (state.queue.nowUs >= enemy.purge.middleUs) enemy.purge.factor = .5;
          }
          if (enemy.clapSlow && enemy.clapSlow.untilUs <= state.queue.nowUs) delete enemy.clapSlow;
          if (shivasGuard && nearbyEquipment(state, enemy, ["i155"], 900)) enemy.auraSpeed = .65;
          else if (enemy.auraSpeed !== undefined) delete enemy.auraSpeed;
        }
        if (state.enemies.some(enemy => enemy.layer === "ground")) {
          moveUnits(state.enemies, () => roll(state),
            state.structures.filter(tower => footprintTowers.has(tower.templateId)).map(buildFootprint),
            state.structures.map(tower => ({ ...tower, layer: "ground" })));
        } else {
          moveUnits(state.enemies, () => roll(state));
        }
        for (const tower of state.structures) startWeapon(state, tower);
        for (const summon of state.summons ?? []) startWeapon(state, summon);
        break;
      case "hero-spell": finishHeroSpell(state, event); break;
      case "tower-spell": resolveTowerSpell(state, event); break;
      case "sword-rain-emit": emitSwordRain(state, event); break;
      case "sword-rain-travel": advanceSwordRain(state, event); break;
      case "spell-sweep": advanceSpellSweep(state, event.sweep); break;
      case "contract-expire": {
        const tower = state.structures.find(entry => entry.id === event.towerId);
        if (tower?.contracts) delete tower.contracts[event.token];
        break;
      }
      case "magic-arrow": resolveMagicArrow(state, event); break;
      case "magic-arrow-restore": {
        const tower = state.structures.find(entry => entry.id === event.towerId);
        if (tower?.magicArrowToken !== event.token) break;
        delete tower.magicArrowToken;
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (target) target.hp = Math.min(target.maxHp ?? target.hp, target.hp + .7 * event.amount);
        break;
      }
      case "hero-leash": resolveHeroLeash(state, event); break;
      case "mana-debt": {
        const tower = firingUnit(state, event.towerId);
        if (tower) {
          syncMana(state, tower);
          tower.mana = Math.max(0, tower.mana! - event.amount);
        }
        break;
      }
      case "detector-expire": state.detectors = state.detectors?.filter(detector => detector.id !== event.unitId); break;
      case "summon-expire": state.summons = state.summons?.filter(unit => unit.id !== event.unitId); break;
      case "spell-zones": resolveSpellZones(state, event); break;
      case "equipment-lightning": equipmentLightning(state, event.towerId, event.targetId, event.itemId); break;
      case "equipment-burn": applyEquipmentBurn(state); break;
      case "weapon-fire": fireWeapon(state, event.towerId, event.targetId, event.slot, event.startedUs); break;
      case "weapon-ready": {
        const tower = firingUnit(state, event.towerId);
        if (tower) startWeapon(state, tower);
        break;
      }
      case "weapon-impact": advanceWeaponShot(state, event.shot, event.travelUs); break;
      case "immolation": tickImmolation(state, event.towerId); break;
      case "tree-grab-expire": {
        const tower = state.structures.find(entry => entry.id === event.towerId);
        if (tower?.treeGrab) delete tower.treeGrab.strength[event.buffId];
        break;
      }
      case "avalanche": avalanche(state, event.towerId, event.point, event.rank, event.skillId); break;
      case "stun-expire": {
        const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (enemy?.stunUntilUs && enemy.stunUntilUs <= state.queue.nowUs) delete enemy.stunUntilUs;
        break;
      }
      case "enemy-cast": finishEnemyReaction(state, event.enemyId, event.skill, event.point); break;
      case "enemy-form-end": finishEnemyForm(state, event.enemyId); break;
      case "enemy-egg-end": {
        const parent = state.enemies.find(entry => entry.id === event.enemyId);
        const egg = state.enemies.find(entry => entry.id === event.eggId);
        if (!parent || !egg || egg.hp <= 0) break;
        state.enemies = state.enemies.filter(entry => entry !== egg);
        parent.x = egg.x;
        parent.y = egg.y;
        delete parent.phaseUntilUs;
        delete parent.stunUntilUs;
        stunNearbyTowers(state, parent, 1200, 4, 4);
        parent.hp = parent.maxHp ?? parent.hp;
        break;
      }
      case "enemy-speed-expire": {
        const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (enemy && (enemy.speedBuffUntilUs ?? 0) <= state.queue.nowUs) delete enemy.speedBuff;
        break;
      }
      case "frost-expire": {
        const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (enemy?.frost && enemy.frost.expiresUs <= state.queue.nowUs) delete enemy.frost;
        break;
      }
      case "start-wave": return startWave(state, event.index);
      case "spawn": spawnBatch(state, event.index); break;
      case "stop-wave":
        if (state.spawner !== null) cancelEvent(state.queue, state.spawner);
        state.spawner = null;
        break;
      case "welfare-spawn": {
        const wave = waves[event.index];
        spawn(state, {
          ...welfareTemplates[event.second ? 1 : 0], welfare: true, wave: wave.number,
          hp: wave.number * 3800, mana: wave.number * 200, armor: null,
        }, true);
        break;
      }
      case "challenge-spawn": spawnChallenge(state, event.challengeId); break;
      case "welfare-end":
        state.enemies = state.enemies.filter(enemy => !enemy.welfare);
        state.lastWelfareGold = welfareGold(waves[event.index ?? Math.max(0, state.wave - 1)].number,
          (state.welfareDamage ?? 0) * (1 + 0.08 * (state.overdraftPoints ?? 0)));
        state.gold += state.lastWelfareGold;
        if (state.lastWelfareGold >= 30_000) creditTask(state, "spring", 5);
        creditTask(state, "spring", 6, Math.floor(state.lastWelfareGold / 10_000));
        state.welfareDamage = 0;
        break;
      case "boss-timeout":
        commitKillScore(state);
        state.phase = "won";
        state.result = { reason: "timeout", atUs: state.queue.nowUs };
        state.enemies = [];
        return false;
      case "command": {
        const { command } = event;
        if (command.action.type === "cast-talent") {
          const talent = state.talent;
          if (!talent || !talentRules.get(talent.id)?.cooldown || (talent.id === "W018" && !talentTarget(state, command.action))) {
            recordResult(state, command, { ok: false, reason: "missing" });
          } else if (state.queue.nowUs < Math.max(talent.readyUs, talent.busyUntilUs)) {
            recordResult(state, command, { ok: false, reason: "cooldown" });
          } else {
            talent.busyUntilUs = state.queue.nowUs + us(0.3);
            scheduleEvent(state.queue, us(0.3), { type: "commit-talent", command: { ...command, action: command.action } });
          }
        } else if (!startApproach(state, command)) recordResult(state, command, execute(state, command.action));
        break;
      }
      case "commit-talent":
        recordResult(state, event.command, commitTalent(state, event.command.action));
        break;
      case "finish-construction": {
        const tower = state.structures.find(tower => tower.id === event.towerId);
        if (!tower?.pending) break;
        const { upgradeTo, cost } = tower.pending;
        if (upgradeTo) {
          tower.templateId = upgradeTo;
          tower.population += cost.population;
        }
        if (tower.templateId.startsWith("H") && tower.qualification === null) {
          const ids = [...qualificationChains.keys()];
          tower.qualification = ids[Math.floor(roll(state) * ids.length)];
        }
        if (!tower.hero) {
          const hero = newHero(tower.templateId);
          if (hero) tower.hero = hero;
        }
        tower.pending = null;
        if (state.seasons && !upgradeTo && tower.hero && !state.seasonalFourHeroes &&
            state.structures.filter(entry => entry.hero && !entry.pending).length >= 4) {
          state.seasonalFourHeroes = true;
          creditTask(state, "summer", 5);
        }
        if (!upgradeTo && immolationSources.has(tower.templateId)) {
          scheduleEvent(state.queue, us(1), { type: "immolation", towerId: tower.id });
        }
        break;
      }
    }
    if (state.phase !== "running") return false;
  }, shouldYield);
  if (advanced === "stopped") {
    state.queue.pending.length = 0;
    state.clock.targetUs = state.queue.nowUs;
    state.clock.fractionUs = 0;
    state.spawner = null;
    state.approach = null;
  }
  return advanced;
}
