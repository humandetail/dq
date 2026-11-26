import { advanceEvents, cancelEvent, createEventQueue, scheduleEvent, secondsToMicroseconds as us, type EventQueue } from "../event-queue.ts";
import { cardTemplates, chestKeys, chestPools, configuration, directBuilds, firelordSkin, firelordSkillSlots, footprintTowers, itemChargeInheritance, itemChargeStacks, itemExclusions, itemFields, items, lumberVouchers, openingChoices, openingResources, ordinaryGoods, prayerBooks, qualificationChains, rarityPools, recipes, recycleRate, summonCards, towerLevels, towerRadius, waveRewards } from "./content.ts";
import { buildAnchor, buildFootprint, contains, gridSize, map, mapVersion, overlaps, type Disk, type Point } from "./map.ts";
import { moveUnits, movementStepUs, movementSweep, type Mobile } from "./movement.ts";
import { findApproachPath, findPath, nearestSpawn, segmentDistanceSquared, staticSweep } from "./pathfinding.ts";
import { addHeroExperience, bookExperience, learnHeroSkill, newHero, restoreHeroGrowth, type Hero } from "./hero.ts";
import { appearanceChoice, appearanceUnlocked, type Appearance, type AppearanceSlot } from "./appearance.ts";
import { creditSeason, type Season, type Seasons } from "./seasons.ts";
import { towerSpells } from "./tower-spells.ts";
import { talentChoices, talentRules, promotionWaves } from "./talents.ts";
import { challengeGoods, challengeTemplates, drawMysteryStock, mysteryWaves } from "./shops.ts";
import { criticalMultipliers, effectiveAttributes, equipmentAttackSpeed, flatAttack, killExperience, physicalDamage, unitBalance, unitTargetType, weaponPhaseDelay, weaponScheduleRate, weapons, welfareGold, type Weapon, type WeaponPhase, type WeaponShot, type WeaponTiming } from "./combat.ts";
import { divineDamageFactor, divineField, divineStars, isDivineBook, type DivineForm } from "./divine.ts";
import { enemySpells, type EnemySpellId } from "./enemy-effects.ts";
import { heroAutoCastOrder, heroSpells, heroSpellTargetMode, type CastableHeroSkill, type HeroSpell, type SpellSweep } from "./hero-spells.ts";
import itemResources from "../../../docs/rules/item-resources-batch-01.json" with { type: "json" };
import itemRegeneration from "../../../docs/rules/item-regeneration-batch-01.json" with { type: "json" };
import { waves, welfareTemplates } from "./waves.ts";

type TalentCast = { type: "cast-talent"; towerId?: number };

export type Action =
  | { type: "move-worker"; point: Point }
  | { type: "stop-worker" }
  | { type: "focus-target"; towerId: number; targetId?: number }
  | { type: "set-auto-mode"; towerId: number; key: string; enabled: boolean }
  | { type: "choose-talent"; choice: string }
  | { type: "claim-worker-benefit" }
  | { type: "toggle-worker-sharing" }
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
  | { type: "cast-tower"; towerId: number; skillId: string; targetId?: number }
  | { type: "stop-tower-cast"; towerId: number }
  | { type: "move-wolf"; unitId: number; point: Point }
  | { type: "attack-with-wolf"; unitId: number; targetId: number }
  | { type: "stop-wolf"; unitId: number }
  | { type: "attack-ground"; towerId: number; point: Point }
  | { type: "attack-ground-item"; towerId: number; objectId: number }
  | { type: "cast-flame-arrow"; towerId: number; targetId: number }
  | { type: "cast-hero"; towerId: number; skillId: CastableHeroSkill; point?: Point; targetId?: number }
  | { type: "cast-equipment"; itemId: number; towerId: number; targetId?: number; point?: Point }
  | { type: "set-snow-duration"; seconds: number }
  | { type: "place-scout-ward"; itemId: number; towerId: number; point: Point }
  | { type: "cast-scepter-swap"; towerId: number; targetId: number }
  | { type: "choose-skin"; towerId: number; choice: string }
  | { type: "choose-appearance"; slot: AppearanceSlot; choice?: string }
  | { type: "toggle-flame-arrows"; towerId: number }
  | { type: "recycle-tower"; towerId: number }
  | { type: "cancel-construction"; towerId: number };

type Command = { id: string; matchId: string; action: Action };
type Result = { ok: true; createdId?: number; divineBook?: DivineForm | "ineligible" | "max-stars" | "failed" } |
  { ok: false; reason: "opening" | "placement" | "resources" | "missing" | "full" | "materials" | "closed" | "learning" | "range" | "stock" | "cooldown" | "equipment" };
type WeaponRateEffect = "strafeUntilUs" | "frenzyUntilUs" | "armorFrostUntilUs" | "thunderClap" | "untouchable" | "i721";
type ArtilleryTarget = { point: Point } | { objectId: number };
type MatchEvent =
  | { type: "movement" }
  | { type: "worker-benefit" }
  | { type: "divine-effect-end"; towerId: number; abilityId: string; untilUs: number }
  | { type: "weapon-fire"; towerId: number; targetId?: number; slot: number; startedUs?: number }
  | { type: "weapon-ready"; towerId: number; startedUs?: number }
  | { type: "weapon-backswing-end"; towerId: number; startedUs: number }
  | { type: "weapon-rate-end"; towerId: number; effect: WeaponRateEffect; expiresUs: number }
  | { type: "weapon-impact"; shot: WeaponShot; travelUs: number }
  | { type: "immolation"; towerId: number }
  | { type: "spawn-rune" }
  | { type: "demonflame"; towerId: number; itemId: number }
  | { type: "scepter-swap"; towerId: number; targetId: number; stage: "effect" | "move"; grant: number }
  | { type: "equipment-snow"; towerId: number; token: number }
  | { type: "auto-control-equipment"; towerId: number; itemId: number; targetId?: number; point?: Point }
  | { type: "equipment-seal-end"; targetId: number }
  | { type: "equipment-doom-impact"; targetId: number; point: Point; expiresUs: number; travelUs?: number }
  | { type: "equipment-hex-damage"; towerId: number; point: Point }
  | { type: "equipment-hex-end"; enemyId: number; sourceId: number }
  | { type: "equipment-frost"; towerId: number; itemId: "i149" | "i153"; token: number }
  | { type: "equipment-lightning"; towerId: number; targetId: number; itemId: "i173" | "i177"; source?: Point & { id: number } }
  | { type: "equipment-volley"; towerId: number; targetId: number; source: Point & { id: number }; base: number; itemId: "i204" | "i282" }
  | { type: "equipment-burn" }
  | { type: "tower-spell"; towerId: number; skillId: string; point: Point; targetId?: number }
  | { type: "sword-rain-emit"; towerId: number; token: number; skillId: string; center: Point; direction: Point; amount: number; remaining: number }
  | { type: "sword-rain-travel"; towerId: number; skillId: string; origin: Point; direction: Point; amount: number; from: number; distance: number; length: number }
  | { type: "hero-spell"; towerId: number; targetId: number; skillId: HeroSpell; point: Point; wardVariant?: boolean }
  | { type: "hero-spell-end"; towerId: number; skillId: HeroSpell }
  | { type: "spell-sweep"; sweep: SpellSweep }
  | { type: "contract-expire"; towerId: number; token: number }
  | { type: "magic-arrow"; towerId: number; targetId: number; point: Point; rank: number; scepter: boolean;
      expiresUs?: number; sourceId?: number; travelUs?: number }
  | { type: "magic-arrow-restore"; towerId: number; targetId: number; token: number; amount: number }
  | { type: "summon-expire"; unitId: number }
  | { type: "detector-expire"; unitId: number }
  | { type: "mana-debt"; towerId: number; amount: number }
  | { type: "hero-leash"; towerId: number; targetId: number; point: Point; token: number; rank: number; primary: boolean; tick: number; sourceId?: number }
  | { type: "spell-zones"; towerId: number; skillId: "A171" | "A172"; token: number; centers: Point[]; rank: number; remaining: number; hit: number[]; sourceIds?: number[] }
  | { type: "ice-path-impact"; towerId: number; targetId: number; source: Point & { id: number };
      amount: number; expiresUs: number; travelUs: number }
  | { type: "tree-grab-expire"; towerId: number; buffId: number }
  | { type: "avalanche"; towerId: number; point: Point; rank: number; skillId: string; source?: Point & { id: number } }
  | { type: "stun-expire"; enemyId: number }
  | { type: "frost-expire"; enemyId: number }
  | { type: "enemy-cast"; enemyId: number; skill: EnemySpellId; point: Point; targetId?: number }
  | { type: "enemy-speed-expire"; enemyId: number }
  | { type: "enemy-summon-expire"; enemyId: number }
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
  lastSpellUs?: number;
  speedBuffUntilUs?: number;
  sprintUntilUs?: number;
  phaseUntilUs?: number;
  evasionUntilUs?: number;
  invisibleFromUs?: number;
  windwalk?: { invisibleUs: number; endUs: number; speed: number };
  barrier?: { hits?: number; damage?: number; untilUs: number };
  purgeDamage?: number;
  bossPurgeDamage?: number;
  shellDamage?: number;
  berserkerResistanceRank?: number;
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
  diseaseStartedUs?: number;
  graveUntilUs?: number;
  graveCastUs?: number;
  graveSpellReadyUs?: number;
  hexSourceId?: number;
  seal?: { amount: number; untilUs: number };
  doomReadyUs?: number;
  overdraftArmor?: number;
};

type BookId = typeof prayerBooks[number]["id"];
type Book = { id: number; bookId: BookId; slot: number; charges: number };

type Card = { id: number; card: string; slot: number | null; point: Point; hp: number; charges: number; invulnerable?: true };
type Item = { id: number; itemId: string; slot: number | null; point: Point; charges: number; towerId?: number;
  hp?: number; invulnerable?: true };
const itemInitialLife = 75;

type Cost = { gold: number; wood: number; population: number };
type Construction = Disk & {
  id: number;
  templateId: string;
  population: number;
  qualification: string | null;
  hero?: Hero;
  attack?: { targetId?: number; readyUs: number; winding: boolean; startedUs: number; flameBonus?: number;
    manualFlame?: true; timing?: WeaponTiming; artillery?: ArtilleryTarget };
  artilleryOrder?: ArtilleryTarget;
  focusTarget?: number;
  autoModes?: Record<string, boolean>;
  lastAttackUs?: number;
  lastCastUs?: number;
  spellWindup?: number;
  lastCastTarget?: Point;
  lastAttackTarget?: Point;
  multishotReadyUs?: number;
  strafeUntilUs?: number;
  thunderClap?: { amount: number; untilUs: number };
  untouchable?: { attackSlow: number; movement: number; untilUs: number };
  weakAttackUntilUs?: number;
  divineEffects?: Record<string, { rank: number; untilUs: number; readyUs: number }>;
  divineCooldowns?: Record<string, number>;
  runeBuffs?: Partial<Record<"i719" | "i720" | "i721", number>>;
  lifeOffset?: number;
  manaOffset?: number;
  permanentAttack?: number;
  skullReadyUs?: number;
  snowReadyUs?: number;
  snow?: { token: number; startedUs: number; duration: number; point: Point };
  life?: { hp: number; maximum: number; staticMaximum: number; lastUs: number; regen: number };
  demonflameAuto?: boolean;
  demonflameReadyUs?: number;
  demonflameTimer?: number;
  scepterSwap?: { grant: number; readyUs: number };
  scepterWard?: boolean;
  frenzyUntilUs?: number;
  frenzyReadyUs?: number;
  frenzyAmount?: number;
  contracts?: Record<number, number>;
  flameArrows?: boolean;
  flameTarget?: number;
  avalancheReadyUs?: number;
  mana?: number;
  manaLastUs?: number;
  equipmentLightningReadyUs?: number;
  equipmentFrost?: Partial<Record<"i149" | "i153", { token: number; expiresUs: number; stopUs: number; targetId: number }>>;
  equipmentVolleyReadyUs?: number;
  starfallReadyUs?: number;
  conquestReadyUs?: number;
  relicHits?: number;
  glowCharge?: 0 | 1;
  ashMarks?: number;
  controlEquipmentReady?: Partial<Record<"i276" | "i281", number>>;
  heroSpellReady?: Partial<Record<HeroSpell, number>>;
  towerSpellReady?: Record<string, number>;
  heroCastUntilUs?: number;
  swordRainToken?: number;
  icePathToken?: number;
  leashToken?: number;
  summon?: { ownerId: number; attack: number; speed: number; green: number; blue: number; skillId?: string;
    independent?: true; illusion?: true; criticalItems?: string[]; intervalReduction?: number;
    projectileGroup?: { extra: number; range: number; speed: number } };
  wolfOrder?: { type: "move"; point: Point; path: Point[] } | { type: "attack"; targetId: number; path: Point[] };
  spawnOverlaps?: number[];
  walkDirection?: Point;
  necromancyReadyUs?: number;
  manaPotionUntilUs?: number;
  manaPotionReadyUs?: number;
  soulRingReadyUs?: number;
  manaMaximum?: number;
  manaStaticMaximum?: number;
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
  vipGoldStarted?: true;
  workerBenefitReadyUs?: number;
  workerSharing?: boolean;
  lastWorkerBenefit?: { amount: number; atUs: number; source: "J001" | "J006" };
  appearance?: Appearance;
  workerWeakUntilUs?: number;
  circleWeakUntilUs?: number;
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
  seasonalOverdraftSurvival?: true;
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
  battleAnimations?: (Point & { atUs: number; unitId: string;
    kind: "death" | "revive" | "heal-link" | "weapon-link" | "spell-link" | "artillery-impact"; target?: Point })[];
  damageEvents?: { atUs: number; x: number; y: number; amount: number }[];
  recentHits?: { atUs: number; x: number; y: number; targetId: number; casterId: number; ownerId?: number; sourceTemplate?: string; amount: number; deadUnitId?: string }[];
  killScore?: number;
  welfareDamage?: number;
  lastWelfareGold?: number;
  activeRuneId?: number;
  snowDuration?: number;
  knowledgeReady?: Record<string, number>;
  finalHit?: { towerId?: number; sourceId?: number; sourceTemplate?: string; targetId: number; amount: number; hpBefore: number; atUs: number; skillId?: string };
  swordRainImpacts?: (Point & { atUs: number })[];
  overdraftOpen: boolean;
  overdraftPoints?: number;
  activeOverdraft?: number;
  enemies: Enemy[];
  structures: Construction[];
  summons?: Construction[];
  detectors?: (Point & { id: number; ownerId: number; templateId?: "b116"; hp?: number })[];
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
  scheduleEvent(queue, us(120), { type: "worker-benefit" }, us(120));
  scheduleEvent(queue, us(5), { type: "worker-benefit" });
  const state: Match = {
    matchId, mapVersion, seed: seed >>> 0, randomState: seed >>> 0, queue,
    clock: { targetUs: 0, fractionUs: 0, speed: 1, paused: false },
    phase: "running", vipGoldStarted: true, waveRewardSlots: [0, 0, 0, 0, 0], worker: { ...map.worker }, approach: null, wave: 0, batch: 0, totalArrivals: 0, bossArrivalUs: null, bossDeadlineUs: null, nextId: 1,
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
  if (enemy.abilities?.includes("T044")) enemy.diseaseStartedUs = state.queue.nowUs;
  state.enemies.push(enemy);
  return enemy;
}

export function diseasePulseTargets(state: Match, enemy: Enemy) {
  if (enemy.diseaseStartedUs === undefined || enemy.hp <= 0 || !enemy.abilities?.includes("T044")) return [];
  const elapsed = state.queue.nowUs - enemy.diseaseStartedUs;
  if (elapsed < us(1) || elapsed % us(1) >= us(.25)) return [];
  const towers = [...state.structures, ...(state.summons ?? [])].filter(unit =>
    (unit.x - enemy.x) ** 2 + (unit.y - enemy.y) ** 2 <= 220 ** 2 &&
    !unit.pending &&
    !unitTargetType.get(unit.templateId)?.split(",").some((type: string) =>
      type === "air" || type === "mechanical" || type === "structure" || type === "ward"));
  return (state.worker.x - enemy.x) ** 2 + (state.worker.y - enemy.y) ** 2 <= 220 ** 2
    ? [state.worker, ...towers] : towers;
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
  if (rollPercent(state) < 50) scheduleEvent(state.queue, us(15), { type: "spawn-rune" });
  state.batch = 0;
  const rewards = state.waveRewardSlots ??= [0, 0, 0, 0, 0];
  for (const [slot, reward] of waveRewards.entries()) {
    if (state.wave >= reward.claimable) rewards[slot] = Math.max(rewards[slot], 2);
    else if (state.wave >= reward.shown) rewards[slot] = Math.max(rewards[slot], 1);
  }
  if (state.wave === 11) state.challengeShopOpen = true;
  if (state.wave === 54) {
    if (state.seasons && state.overdraftPoints && !state.seasonalOverdraftSurvival) {
      state.seasonalOverdraftSurvival = true;
      creditTask(state, "summer", 2);
    }
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
        weaponRatesDirty.add(state);
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

function grantWorkerBenefit(state: Match, source: "J001" | "J006") {
  const multiplier = source === "J006" ? 21 + Math.floor(10 * roll(state)) : 11 + Math.floor(20 * roll(state));
  const amount = 4 * Math.max(1, state.wave) * multiplier;
  state.gold += amount;
  state.lastWorkerBenefit = { amount, atUs: state.queue.nowUs, source };
}

function freeWorkerSlot(state: Match) {
  return [0, 1, 2, 3, 4, 5].find(slot => state.cards.every(card => card.slot !== slot) &&
    !state.books?.some(book => book.slot === slot) && !state.inventory?.some(item => item.towerId === undefined && item.slot === slot)) ?? null;
}

function deliverCard(state: Match, card: string, point = state.worker, refundHp?: number) {
  const item = summonCards.get(card)?.itemFields;
  if (!item || item.HP === null || item.uses === null) throw new Error(`Missing M2 summon card ${card}`);
  const id = state.nextId++;
  const slot = freeWorkerSlot(state);
  state.cards.push({ id, card, slot, point: { x: point.x, y: point.y }, ...(slot === null ? {} : { invulnerable: true }),
    hp: refundHp ?? item.HP, charges: refundHp === undefined ? item.uses : 1 });
  return id;
}

export function canChooseOpening(state: Match) {
  return state.openingCard === null && state.openingChoicesUnlocked !== false;
}

function removeItem(state: Match, item: Item, owner = itemOwner(state, item.towerId)) {
  state.inventory!.splice(state.inventory!.indexOf(item), 1);
  if (item.itemId === "i310" && owner) removeScepterEffects(state, owner);
  refreshEquippedResources(state, owner, item.itemId);
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

function dropItem(state: Match, item: Item, tower = itemOwner(state, item.towerId)) {
  const owner = tower ?? state.worker;
  if (item.slot !== null) item.invulnerable = true;
  item.slot = null;
  item.point = { x: owner.x, y: owner.y };
  delete item.towerId;
  if (item.itemId === "i310" && tower) removeScepterEffects(state, tower);
  refreshEquippedResources(state, tower, item.itemId);
}

function refreshEquippedResources(state: Match, owner: Construction | undefined, itemId: string) {
  if (!owner || energyCircle(owner)) return;
  weaponRatesDirty.add(state);
  if (owner.life) syncTowerLife(state, owner);
  if (itemId === "i129" || itemId === "i161") {
    for (const tower of state.structures) {
      if (tower.manaLastUs !== undefined && (tower.x - owner.x) ** 2 + (tower.y - owner.y) ** 2 <= 1000 ** 2) syncMana(state, tower);
    }
  } else if (owner.manaLastUs !== undefined) syncMana(state, owner);
}

function removeScepterEffects(state: Match, tower: Construction) {
  if (towerGear(state, tower).some(item => item.itemId === "i310")) return;
  delete tower.scepterSwap;
  if (tower.scepterWard) tower.scepterWard = false;
}

function finishPickup(state: Match, item: Item, tower?: Construction): number {
  if (item.itemId === "i330" && (!tower || energyCircle(tower))) {
    removeItem(state, item);
    return deliverItem(state, "i332", undefined, tower);
  }
  item.invulnerable = true;

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
  if (item.itemId === "i310" && tower?.hero && item.slot !== null) {
    if (tower.hero.ranks.A153) tower.scepterSwap = { grant: state.queue.nextSequence++, readyUs: state.queue.nowUs + us(10) };
    if (tower.templateId === "H029") tower.scepterWard = !!tower.hero.ranks.A094;
  }
  refreshEquippedResources(state, tower, item.itemId);
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
    charges: charges ?? fields.uses ?? 0, hp: itemInitialLife, point: { x: point.x, y: point.y } };
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

export function isKnowledgeBook(id: string): id is "i312" | "i313" | "i314" {
  return id === "i312" || id === "i313" || id === "i314";
}

const runeIds = ["i718", "i719", "i720", "i721", "i722", "i723"];

function spawnRune(state: Match) {
  if (state.inventory?.some(item => item.id === state.activeRuneId)) return;
  roll(state);
  roll(state);
  const itemId = runeIds[Math.floor(roll(state) * runeIds.length)];
  const id = state.nextId++;
  const point = { x: map.runeAnchor.x + 10, y: map.runeAnchor.y - 220 };
  (state.inventory ??= []).push({ id, itemId, point, charges: 0, slot: null });
  state.activeRuneId = id;
}

function applyRune(state: Match, item: Item) {
  removeItem(state, item);
  if (state.activeRuneId === item.id) delete state.activeRuneId;
  if (item.itemId === "i718") {
    state.gold += Math.max(1, state.wave) * 66;
    return;
  }
  const now = state.queue.nowUs;
  for (const tower of state.structures) {
    if (!tower.hero || tower.pending) continue;
    if (item.itemId === "i723") {
      syncMana(state, tower);
      tower.mana = Math.min(tower.manaMaximum!, tower.mana! + tower.manaMaximum! * .5);
    } else if (item.itemId === "i719" || item.itemId === "i720" || item.itemId === "i721") {
      (tower.runeBuffs ??= {})[item.itemId] = now + us(10);
      if (item.itemId === "i721") scheduleWeaponRateEnd(state, tower, "i721", tower.runeBuffs.i721!);
    } else if (item.itemId === "i722") {
      const weapon = weapons[tower.templateId]?.[0];
      if (!weapon) continue;
      const primary = unitBalance.get(tower.templateId)?.Primary;
      const attributes = combatAttributes(state, tower);
      const attribute = primary === "STR" ? attributes.STR : primary === "AGI" ? attributes.AGI : primary === "INT" ? attributes.INT : 0;
      const aura = attackAura(state, tower);
      const gear = towerGear(state, tower);
      const base = weapon.base + attribute * 1.4 + (tower.hero.growthBonus?.attack ?? 0);
      const weakness = now < (tower.weakAttackUntilUs ?? 0) ? .5 : 0;
      const attack = base * (1 + aura.command + aura.drums + aura.banner + aura.vengeance - weakness) - weapon.base +
        gear.reduce((sum, item) => sum + (flatAttack.get(item.itemId) ?? 0), tower.permanentAttack ?? 0) +
        Object.values(tower.contracts ?? {}).reduce((sum, contribution) => sum + contribution, 0);
      const criticalItems = gear.map(item => item.itemId).filter(id => ["i141", "i213", "i215", "i306", "i322"].includes(id));
      spawnSummon(state, tower, tower.templateId, { ownerId: tower.id, attack, speed: 0.002 * attributes.AGI + weaponSpeedBonus(state, tower, gear),
        green: 0, blue: 0, skillId: "i722", illusion: true, criticalItems,
        intervalReduction: gear.some(item => item.itemId === "i304") ? .2 : 0 }, 10);
    }
  }
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
    weaponRatesDirty.add(state);
  });
}

export function restoreHeroState(state: Match) {
  if (state.seasons) {
    creditTask(state, "spring", 7, 666);
    creditTask(state, "summer", 7, 666);
    if (state.wave >= 54 && state.overdraftPoints) state.seasonalOverdraftSurvival = true;
  }
  for (const detector of state.detectors ?? []) {
    if (detector.templateId === "b116") detector.hp ??= 200;
  }
  if (!state.vipGoldStarted && state.phase === "running") {
    const now = state.queue.nowUs;
    const period = us(120);
    scheduleEvent(state.queue, period - now % period, { type: "worker-benefit" }, period);
    if (now < us(5)) scheduleEvent(state.queue, us(5) - now, { type: "worker-benefit" });
    state.vipGoldStarted = true;
  }
  for (const tower of state.structures) {
    if (tower.spellWindup === undefined && state.queue.nowUs < (tower.heroCastUntilUs ?? 0)) {
      const pending = state.queue.pending.find(({ payload }) => (payload.type === "hero-spell" || payload.type === "tower-spell" ||
        payload.type === "scepter-swap" && payload.stage === "effect") && payload.towerId === tower.id);
      if (pending) tower.spellWindup = pending.timerId;
    }
    if (tower.hero === undefined && !tower.pending) {
      const hero = newHero(tower.templateId);
      if (hero) tower.hero = hero;
    }
    if (tower.hero) {
      restoreHeroGrowth(tower.hero, tower.templateId);
      if (tower.hero.ranks.P000) tower.hero.divineForm ??= { id: "P200", stars: 1 };
    }
    if (tower.templateId === "H029" && tower.scepterWard === undefined && towerGear(state, tower).some(item => item.itemId === "i310")) {
      tower.scepterWard = true;
    }
    const frenzy = towerSpells.get(tower.templateId)?.find(spell => spell.effect.kind === "frenzy");
    if (frenzy?.effect.kind === "frenzy") {
      if (tower.frenzyUntilUs !== undefined) tower.frenzyAmount ??= frenzy.effect.amount;
      if (tower.frenzyReadyUs !== undefined) {
        (tower.towerSpellReady ??= {})[frenzy.id] ??= tower.frenzyReadyUs;
        delete tower.frenzyReadyUs;
      }
    }
  }
  if (state.phase === "running") {
    for (const tower of [...state.structures, ...(state.summons ?? [])]) {
      const expirations: Record<WeaponRateEffect, number | undefined> = {
        strafeUntilUs: tower.strafeUntilUs, frenzyUntilUs: tower.frenzyUntilUs,
        armorFrostUntilUs: tower.armorFrostUntilUs, thunderClap: tower.thunderClap?.untilUs,
        untouchable: tower.untouchable?.untilUs, i721: tower.runeBuffs?.i721,
      };
      for (const [effect, expiresUs] of Object.entries(expirations)) {
        if (expiresUs === undefined || expiresUs < state.queue.nowUs || state.queue.pending.some(({ payload }) =>
          payload.type === "weapon-rate-end" && payload.towerId === tower.id &&
          payload.effect === effect && payload.expiresUs === expiresUs)) continue;
        scheduleEvent(state.queue, expiresUs - state.queue.nowUs, {
          type: "weapon-rate-end", towerId: tower.id, effect: effect as WeaponRateEffect, expiresUs,
        });
      }
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
  if (destination) {
    Object.assign(tower, destination);
    weaponRatesDirty.add(state);
  }
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

export function removeDeadEnemy(state: Match, enemyId: number, killerTowerId?: number, ownerId = killerTowerId) {
  if (state.phase !== "running") return false;
  const index = state.enemies.findIndex(enemy => enemy.id === enemyId && enemy.hp <= 0);
  if (index === -1) return false;
  const enemy = state.enemies[index];
  endEnemyLeashes(state, enemy);
  if (canSeeEnemy(state, enemy)) recordBattleAnimation(state, enemy, enemy.unitId, "death");
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
    const owner = state.structures.find(tower => tower.id === ownerId);
    if (owner) {
      const gear = towerGear(state, owner);
      const blood = bloodItems.map(id => gear.find(item => item.itemId === id)).find(item => item !== undefined);
      if (blood) {
        syncTowerLife(state, owner);
        blood.charges += blood.itemId === "i147" ? 1 : 2;
        syncTowerLife(state, owner);
      }
      const mana = manaChargeItems.map(id => gear.find(item => item.itemId === id)).find(item => item !== undefined);
      if (mana) {
        syncMana(state, owner);
        mana.charges += mana.itemId === "i220" ? 2 : 1;
        syncMana(state, owner);
      }
    }
  }
  dropDeathChest(state, enemy, killerTowerId !== undefined);
  if (mapBoss(enemy) && Math.floor(1000 * roll(state)) === 0) {
    (state.inventory ??= []).push({ id: state.nextId++, itemId: "i255", slot: null,
      charges: itemFields.get("i255")?.uses ?? 5, point: { x: enemy.x, y: enemy.y } });
  }
  rewardChallenge(state, enemy);
  state.enemies.splice(index, 1);
  if (enemy.unitId === "m052" && rollPercent(state) <= 40) {
    for (const tower of [...state.structures, ...(state.summons ?? [])]) {
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

function groundObjectLife(object: Card | Item) {
  return object.hp ?? itemInitialLife;
}

function artilleryObject(state: Match, objectId: number) {
  const object = state.cards.find(card => card.id === objectId) ?? state.inventory?.find(item => item.id === objectId);
  return object?.slot === null && !object.invulnerable && groundObjectLife(object) > 0 ? object : undefined;
}

function artilleryPoint(state: Match, tower: Construction, weapon: Weapon, order: ArtilleryTarget) {
  const point = "point" in order ? order.point : weapon.targets.includes("item") ? artilleryObject(state, order.objectId)?.point : undefined;
  if (!point || !contains(map.bounds, point)) return;
  const distance = Math.hypot(point.x - tower.x, point.y - tower.y);
  if (distance >= weapon.min && distance <= weapon.max) return point;
}

export function artilleryItems(state: Match, towerId: number) {
  const tower = state.structures.find(entry => entry.id === towerId && !entry.pending);
  const weapon = tower && weapons[tower.templateId]?.find(slot => slot.kind === "artillery");
  if (!tower || !weapon) return [];
  return [...state.cards, ...(state.inventory ?? [])].filter(object =>
    object.slot === null && !object.invulnerable && artilleryPoint(state, tower, weapon, { objectId: object.id }));
}

function targetable(enemy: Enemy, targets: string[], nowUs: number) {
  const targetType = unitTargetType.get(enemy.unitId);
  return enemy.hp > 0 && nowUs >= (enemy.phaseUntilUs ?? 0) && targets.includes(targetType ?? (enemy.layer === "fly" ? "air" : "ground"));
}

function magicImmune(enemy: Enemy) {
  return enemy.abilities?.some(id => ["Amim", "ACm2", "ACm3", "ACmi", "AImu", "AImx", "T060"].includes(id));
}

function mechanicalEnemy(enemy: Enemy) {
  return unitTargetType.get(enemy.unitId) === "mechanical" || enemy.abilities?.includes("Amec") ||
    unitBalance.get(enemy.unitId)?.type?.split(",").includes("mechanical");
}

function resistantToControl(enemy: Enemy) {
  return /^[A-Z]/.test(enemy.unitId) || enemy.abilities?.some(id => ["N534", "Arsk", "ACrk", "ACsk"].includes(id));
}

function weaponTargetable(enemy: Enemy, weapon: Weapon, nowUs: number, targets = weapon.targets) {
  return targetable(enemy, targets, nowUs) && !enemy.abilities?.some(id => id === "Aloc" || id === "Avul") &&
    (weapon.attackType === "magic" ? !magicImmune(enemy) : !enemy.abilities?.includes("Aeth"));
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

function flameWeapon(state: Match, tower: Construction, enemy: Enemy, range: number) {
  if (!flameTargetable(state, tower, enemy, range)) return undefined;
  const distance = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
  return weapons[tower.templateId]?.find(slot => distance >= slot.min && weaponTargetable(enemy, slot, state.queue.nowUs));
}

export function flameArrowTargets(state: Match, towerId: number) {
  const tower = state.structures.find(entry => entry.id === towerId);
  const effect = tower && flameArrow(tower);
  if (!tower || !effect || tower.pending) return undefined;
  return state.enemies.filter(enemy => flameWeapon(state, tower, enemy, effect.range));
}

export function wolfTargets(state: Match, unitId: number) {
  const wolf = state.summons?.find(unit => unit.id === unitId && unit.summon?.independent);
  const weapon = wolf && weapons[wolf.templateId]?.[0];
  if (!weapon) return [];
  return state.enemies.filter(enemy => weaponTargetable(enemy, weapon, state.queue.nowUs) && canSeeEnemy(state, enemy));
}

function enemyIsInvisible(enemy: Enemy, now: number) {
  return !!(enemy.windwalk && now >= enemy.windwalk.invisibleUs && now < enemy.windwalk.endUs ||
    enemy.invisibleFromUs !== undefined && now >= enemy.invisibleFromUs && now < (enemy.speedBuffUntilUs ?? 0));
}

export function canSeeEnemy(state: Match, enemy: Enemy) {
  const now = state.queue.nowUs;
  return !enemyIsInvisible(enemy, now) ||
    state.inventory?.some(item => {
      if (item.itemId !== "i206" || item.slot === null) return false;
      const owner = itemOwner(state, item.towerId);
      if (item.towerId !== undefined && (!owner || owner.pending && !owner.pending.upgradeTo)) return false;
      const source = owner ?? state.worker;
      return (source.x - enemy.x) ** 2 + (source.y - enemy.y) ** 2 <= 1100 ** 2;
    }) ||
    state.detectors?.some(detector => (detector.x - enemy.x) ** 2 + (detector.y - enemy.y) ** 2 <= (detector.templateId === "b116" ? 1100 : 1000) ** 2) ||
    state.structures.some(tower => !tower.pending && (/^n1(?:5[9]|6[0-7])$/.test(tower.templateId)) &&
      (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 1000 ** 2);
}

function inWeaponRange(tower: Construction, enemy: Enemy, weapon: Weapon, bonus: number, firing: boolean, nowUs: number) {
  const distance = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
  return weaponTargetable(enemy, weapon, nowUs) && distance >= weapon.min &&
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

function weaponContributions(state: Match, tower: Construction, weapon: Weapon, gear: Item[]) {
  const primary: unknown = unitBalance.get(tower.templateId)?.Primary;
  const attribute = primary === "STR" || primary === "AGI" || primary === "INT" ? combatAttributes(state, tower)[primary] : 0;
  const base = weapon.base + attribute * 1.4 + (tower.hero?.growthBonus?.attack ?? 0);
  const aura = attackAura(state, tower);
  const weak = state.queue.nowUs < (tower.weakAttackUntilUs ?? 0) ? .5 : 0;
  const percent = tower.summon?.illusion ? 0 : aura.command + aura.drums + aura.banner + aura.vengeance - weak;
  const form = tower.hero?.divineForm;
  const divineAttack = form?.id === "P215" || form?.id === "P216" ?
    divineField(form.id === "P215" ? "T116" : "T115", "DataA", form.stars) : 0;
  const fixed = divineAttack + (tower.permanentAttack ?? 0) +
    gear.reduce((sum, item) => sum + (flatAttack.get(item.itemId) ?? 0), tower.summon?.attack ?? 0) +
    (tower.contracts ? Object.values(tower.contracts).reduce((sum, attack) => sum + attack, 0) : 0);
  return { base, percent, fixed, banner: aura.banner };
}

function weaponFieldInt(value: number) {
  const integer = Math.trunc(value);
  if (!Number.isFinite(integer) || integer < -2_147_483_648 || integer > 2_147_483_647) {
    throw new RangeError("Weapon field is outside int32");
  }
  return integer;
}

function weaponFields(state: Match, tower: Construction, weapon: Weapon, gear: Item[]) {
  const { base, percent, fixed } = weaponContributions(state, tower, weapon, gear);
  const meanDice = weapon.dice * (weapon.sides + 1) / 2;
  const attack = weaponFieldInt(base);
  const bonus = weaponFieldInt(fixed + percent * (base + meanDice));
  return { attack, bonus };
}

function averageWeaponField(state: Match, tower: Construction, weapon: Weapon, gear: Item[]) {
  const { attack, bonus } = weaponFields(state, tower, weapon, gear);
  const low = Math.fround(weaponFieldInt(attack + bonus + weapon.dice));
  const high = Math.fround(weaponFieldInt(attack + bonus + weapon.dice * weapon.sides));
  return (low + high) / 2;
}

function triggerEquipmentFrost(state: Match, tower: Construction, target: Enemy, itemId: "i149" | "i153") {
  const now = state.queue.nowUs;
  const effects = tower.equipmentFrost ??= {};
  const old = effects[itemId];
  const token = state.queue.nextSequence;
  effects[itemId] = { token, expiresUs: old && old.expiresUs > now ? old.expiresUs : now + us(10),
    stopUs: now + us(1), targetId: target.id };
  scheduleEvent(state.queue, 0, { type: "equipment-frost", towerId: tower.id, itemId, token });
}

function tickEquipmentFrost(state: Match, event: Extract<MatchEvent, { type: "equipment-frost" }>) {
  const tower = state.structures.find(unit => unit.id === event.towerId);
  const effect = tower?.equipmentFrost?.[event.itemId];
  const now = state.queue.nowUs;
  if (!effect || effect.token !== event.token || now >= Math.min(effect.expiresUs, effect.stopUs)) return;
  const target = state.enemies.find(enemy => enemy.id === effect.targetId && targetable(enemy, ["ground", "air"], now) &&
    canSeeEnemy(state, enemy) && !enemy.abilities?.some(id => id === "Aloc" || id === "Avul"));
  if (target && !ordinaryMiss(state, target)) {
    for (const enemy of event.itemId === "i149" ? [target] : state.enemies) {
      if (!targetable(enemy, ["ground", "air"], now) || magicImmune(enemy) ||
          enemy.abilities?.some(id => id === "Aloc" || id === "Avul") ||
          (enemy.x - target.x) ** 2 + (enemy.y - target.y) ** 2 > 360 ** 2) continue;
      const duration = us(resistantToControl(enemy) ? 2 : 3);
      enemy.frost = { factor: .6, expiresUs: now + duration };
      scheduleEvent(state.queue, duration, { type: "frost-expire", enemyId: enemy.id });
    }
  }
  scheduleEvent(state.queue, us(.2), event);
}

function triggerEquipmentLightning(state: Match, tower: Construction, target: Enemy, gear: Item[]) {
  const itemId = gear.some(item => item.itemId === "i173") ? "i173" :
    gear.some(item => item.itemId === "i177") ? "i177" : undefined;
  if (!itemId || state.queue.nowUs < (tower.equipmentLightningReadyUs ?? 0)) return;
  tower.equipmentLightningReadyUs = state.queue.nowUs + us(.1);
  if (rollPercent(state) <= (itemId === "i173" ? 15 : 25)) {
    scheduleEvent(state.queue, 0, { type: "equipment-lightning", towerId: tower.id, targetId: target.id, itemId,
      source: { x: tower.x, y: tower.y, id: state.nextId++ } });
  }
}

function equipmentLightning(state: Match, { towerId, targetId, itemId, source }: Extract<MatchEvent, { type: "equipment-lightning" }>) {
  const target = state.enemies.find(entry => entry.id === targetId);
  const origin = source ?? firingUnit(state, towerId);
  if (!origin || !target) return;
  chainLightning(state, towerId, source ?? { x: origin.x, y: origin.y, id: state.nextId++ }, target, 5000,
    itemId === "i173" ? 5 : 7, (itemId === "i173" ? 1000 : 2000) * .8, itemId);
}

function chainLightning(state: Match, towerId: number, source: Point & { id: number }, primary: Enemy,
  range: number, maximum: number, damage: number, skillId: string) {
  const eligible = (target: Enemy) => organicWaveTarget(state, target);
  if (!eligible(primary) || (primary.x - source.x) ** 2 + (primary.y - source.y) ** 2 > range ** 2 ||
    consumeEnemySpellShield(state, primary)) return;
  const visited = new Set<number>();
  let target: Enemy | undefined = primary;
  while (target && visited.size < maximum && state.phase === "running") {
    const x: number = target.x;
    const y: number = target.y;
    visited.add(target.id);
    const owner = state.structures.find(tower => tower.id === towerId && !tower.pending);
    damageEnemy(state, owner, "q001", target, damage, "magic", skillId, source);
    target = state.enemies.filter(enemy => !visited.has(enemy.id) && eligible(enemy) &&
      (enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= 600 ** 2).sort((left, right) => left.id - right.id)[0];
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
  const form = tower.hero.divineForm;
  if (form) {
    if (form.id === "P201" || form.id === "P204") values.STR += divineField(form.id, "DataC", form.stars);
    if (form.id === "P202" || form.id === "P204") values.AGI += divineField(form.id, "DataA", form.stars);
    if (form.id === "P203" || form.id === "P204") values.INT += divineField(form.id, "DataB", form.stars);
  }
  for (const [id, effect] of Object.entries(tower.divineEffects ?? {})) {
    if (state.queue.nowUs > effect.untilUs) continue;
    values.STR += divineField(id, "DataC", effect.rank);
    values.AGI += divineField(id, "DataA", effect.rank);
    values.INT += divineField(id, "DataB", effect.rank);
  }
  values.STR += Object.values(tower.treeGrab?.strength ?? {}).reduce((sum, strength) => sum + strength, 0);
  return values;
}

const bloodItems = ["i332", "i330", "i145", "i147"];
const lifeLimits = new Map(itemResources.items.map(item => [item.id, item.webStats[0]]));

function divineLifeBonus(form: DivineForm | undefined) {
  return form?.id === "P220" ? divineField("T" + (231 + form.stars), "DataA", 1) : 0;
}

function syncTowerLife(state: Match, tower: Construction, divineLifeChange = 0) {
  const now = state.queue.nowUs;
  const gear = towerGear(state, tower);
  const stats = unitBalance.get(tower.templateId);
  const strength = combatAttributes(state, tower).STR;
  const staticMaximum = (stats?.HP ?? 1) + strength * 15 +
    gear.reduce((sum, item) => sum + (lifeLimits.get(item.itemId) ?? 0), 0);
  const divineLife = divineLifeBonus(tower.hero?.divineForm);
  const maximum = staticMaximum + (tower.lifeOffset ?? 0) + divineLife + 4 * gear.reduce((sum, item) =>
    sum + (bloodItems.includes(item.itemId) ? item.charges : 0), 0);
  const prev = tower.life;
  const hp = prev ? Math.min(prev.maximum, prev.hp + prev.regen * (now - prev.lastUs) / 1_000_000) +
    staticMaximum - prev.staticMaximum + divineLifeChange : staticMaximum + divineLife;
  const regen = (stats?.regenType === "always" ? stats.regenHP ?? 0 : 0) + strength * .1 +
    (gear.some(item => item.itemId === "i332" || item.itemId === "i145") ? maximum * .04 : 0);
  return tower.life = { hp: Math.max(1, Math.min(maximum, hp)), maximum, staticMaximum, lastUs: now, regen };
}

const manaLimits = new Map(itemResources.items.map(item => [item.id, item.webStats[1]]));
const manaRate = new Map(itemRegeneration.items.map(item => [item.id, (item.web.manaPercent ?? 0) / 100]));
const manaChargeItems = ["i220", "i327", "i218"];

function syncMana(state: Match, tower: Construction) {
  const now = state.queue.nowUs;
  const intelligence = combatAttributes(state, tower).INT;
  const stats = unitBalance.get(tower.templateId);
  const gear = towerGear(state, tower);
  const form = tower.hero?.divineForm;
  const divineMana = form?.id === "P221" ? divineField("T" + (241 + form.stars), "DataA", 1) : 0;
  const staticMaximum = (stats?.manaN ?? 0) + 12 * intelligence + divineMana +
    gear.reduce((sum, item) => sum + (manaLimits.get(item.itemId) ?? 0), 0);
  const maximum = staticMaximum + (tower.manaOffset ?? 0) + 3 * gear.reduce((sum, item) =>
    sum + (manaChargeItems.includes(item.itemId) ? item.charges : 0), 0);
  if (tower.mana === undefined || tower.manaLastUs === undefined || tower.manaMaximum === undefined) {
    tower.mana = maximum;
  } else {
    const potionTime = Math.max(0, Math.min(now, tower.manaPotionUntilUs ?? 0) - tower.manaLastUs);
    const recovered = tower.mana + ((tower.manaRegen ?? 0) * (now - tower.manaLastUs) + 5 * potionTime) / 1_000_000;
    const staticDifference = staticMaximum - (tower.manaStaticMaximum ?? tower.manaMaximum);
    tower.mana = Math.min(maximum, Math.max(0, Math.min(tower.manaMaximum, recovered) + staticDifference));
  }
  tower.manaLastUs = now;
  tower.manaMaximum = maximum;
  tower.manaStaticMaximum = staticMaximum;
  const percent = gear.reduce((sum, item) => sum + (manaRate.get(item.itemId) ?? 0), 0);
  const aura = stats?.type?.split(",").includes("ancient") ? 0 :
    nearbyEquipment(state, tower, ["i161"], 1000) ? 10 : nearbyEquipment(state, tower, ["i129"], 1000) ? 3 : 0;
  tower.manaRegen = ((stats?.regenMana ?? 0) + 0.03 * intelligence) * (1 + percent) + aura;
}

function triggerDivineEffect(state: Match, tower: Construction, trigger: "attack" | "spell") {
  const form = tower.hero?.divineForm;
  if (!form) return;
  const attackEffects: Record<string, [string, number]> = { P205: ["T125", 20], P206: ["T126", 10], P207: ["T127", 30], P208: ["T128", 15] };
  const effect = trigger === "attack" ? attackEffects[form.id] : form.id === "P217" ? ["T127", 70] as const : undefined;
  if (!effect || rollPercent(state) > effect[1]) return;
  const now = state.queue.nowUs;
  const cooldowns = tower.divineCooldowns ??= {};
  if (now < (cooldowns[form.id] ?? 0)) return;
  const duration = us(trigger === "attack" ? 3 : 5);
  const untilUs = now + duration;
  const readyUs = now + us(trigger === "attack" ? 5 : 7);
  cooldowns[form.id] = readyUs;
  (tower.divineEffects ??= {})[effect[0]] = { rank: form.stars, untilUs, readyUs };
  weaponRatesDirty.add(state);
  if (tower.manaLastUs !== undefined) syncMana(state, tower);
  if (tower.life) syncTowerLife(state, tower);
  scheduleEvent(state.queue, duration, { type: "divine-effect-end", towerId: tower.id, abilityId: effect[0], untilUs });
}

function useDivineBook(state: Match, item: Item, tower: Construction): Result {
  const hero = tower.hero!;
  const owner = itemOwner(state, item.towerId);
  if (item.charges < 1 || owner?.pending) return { ok: false, reason: "missing" };
  if (state.queue.nowUs < Math.max(owner?.stunnedUntilUs ?? 0, owner?.heroCastUntilUs ?? 0)) return { ok: false, reason: "cooldown" };
  item.charges--;
  const form = hero.divineForm;
  const chance = item.itemId === "i259" && form && form.id !== "P200" ? rollPercent(state) : undefined;
  const eligible = !!form && (item.itemId === "i258" || form.id !== "P200");
  const maxStars = !!form && form.stars === 10 && (item.itemId === "i259" || item.itemId === "i264");
  if (!eligible || maxStars) {
    deliverItem(state, item.itemId, 1, owner);
  } else if (item.itemId === "i258") {
    const stars = divineStars(rollPercent(state), 1 + Math.floor(6 * roll(state)));
    let variant = 16;
    for (let i = 0; i < 11 && variant === 16; i++) variant = 1 + Math.floor(22 * roll(state));
    hero.divineForm = { id: "P" + (200 + (variant === 16 ? 12 : variant)), stars };
  } else if (item.itemId === "i260") {
    hero.divineForm = { id: form.id, stars: divineStars(rollPercent(state), 1 + Math.floor(6 * roll(state))) };
  } else if (chance === undefined || chance > ([0, 0, 0, 0, 0, 25, 68, 88, 92][form.stars - 1] ?? 0)) {
    hero.divineForm = { id: form.id, stars: form.stars + 1 };
  }
  if (item.charges === 0) removeItem(state, item);
  if (hero.divineForm && hero.divineForm !== form) {
    weaponRatesDirty.add(state);
    const lifeChange = divineLifeBonus(hero.divineForm) - divineLifeBonus(form);
    if (tower.life || lifeChange !== 0) syncTowerLife(state, tower, lifeChange);
    syncMana(state, tower);
  }
  return { ok: true, divineBook: !eligible ? "ineligible" : maxStars ? "max-stars" :
    hero.divineForm === form ? "failed" : { ...hero.divineForm! } };
}

function triggerSpellEquipment(state: Match, tower: Construction) {
  const gear = towerGear(state, tower);
  if (gear.some(item => item.itemId === "i134") && rollPercent(state) <= 50) {
    syncMana(state, tower);
    const amount = (tower.mana ?? 0) * .67 * .8;
    if (amount > 0) {
      for (const enemy of [...state.enemies]) {
        if (state.phase !== "running") return;
        if (!targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) || magicImmune(enemy) ||
            enemy.abilities?.some(id => id === "Aloc" || id === "Avul") ||
            (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > 900 ** 2) continue;
        damageEnemy(state, tower, tower.templateId, enemy, amount, "magic", "i134");
      }
    }
  }
  if (gear.some(item => item.itemId === "i202" || item.itemId === "i325") && rollPercent(state) <= 50) {
    const now = state.queue.nowUs;
    const targets = state.enemies.filter(enemy => (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 700 ** 2)
      .sort((left, right) => left.id - right.id);
    for (const enemy of targets) {
      if (enemy.hp <= 0) continue;
      const sourceId = state.nextId++;
      if (!organicWaveTarget(state, enemy) || enemy.abilities?.includes("Aeth") || ["b142", "b143"].includes(enemy.unitId) ||
          (!/^[A-Z]/.test(enemy.unitId) && (unitBalance.get(enemy.unitId)?.level ?? 0) > 1000) ||
          consumeEnemySpellShield(state, enemy)) continue;
      const duration = us(resistantToControl(enemy) ? 1 : 2);
      enemy.hexUntilUs = now + duration;
      enemy.hexSourceId = sourceId;
      interruptEnemyCast(state, enemy);
      scheduleEvent(state.queue, duration, { type: "equipment-hex-end", enemyId: enemy.id, sourceId });
    }
    scheduleEvent(state.queue, us(.2), { type: "equipment-hex-damage", towerId: tower.id, point: { x: tower.x, y: tower.y } });
  }
  if (state.phase !== "running") return;
  triggerDivineEffect(state, tower, "spell");
  if (tower.hero) triggerAshHood(state, tower);
  if (state.phase !== "running") return;
  if (!gear.some(item => item.itemId === "i279") || !tower.hero) return;
  tower.glowCharge = tower.glowCharge ? 0 : 1;
  if (tower.glowCharge) return;
  const target = state.enemies.filter(enemy => enemy.hp > 0 && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 600 ** 2)
    .sort((left, right) => left.id - right.id)[0];
  const facing = tower.lastCastTarget && (tower.lastCastTarget.x !== tower.x || tower.lastCastTarget.y !== tower.y) ?
    tower.lastCastTarget : tower.lastAttackTarget ?? tower;
  const direction = spellDirection(tower, target ?? facing);
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { towerId: tower.id, sourceId: state.nextId++, name: "i279", x: tower.x, y: tower.y,
    ...direction, speed: 1050, range: 600, radiusStart: 125, radiusEnd: 600, amount: 2500, traveled: 0, hit: [],
    budget: 9_999_999, targets: ["ground", "air", "structure"] } });
}

function triggerAshHood(state: Match, tower: Construction) {
  const items = ["i318", "i319", "i320"];
  const hoodRank = () => towerGear(state, tower).reduce((best, item) => Math.max(best, items.indexOf(item.itemId)), -1);
  if (hoodRank() < 0) return;
  const stats = combatAttributes(state, tower);
  if (stats.INT < Math.max(stats.STR, stats.AGI)) return;
  tower.ashMarks = (tower.ashMarks ?? 0) + 1;
  while (tower.ashMarks >= 5 && state.phase === "running" && !tower.pending && state.structures.includes(tower)) {
    const rank = hoodRank();
    if (rank < 0) return;
    const center = state.enemies.find(enemy => enemy.hp > 0 &&
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 750 ** 2);
    if (!center) return;
    const { x, y } = center;
    const range = (400 + 100 * rank) ** 2;
    const inArea = (enemy: Enemy) => (enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= range;
    tower.ashMarks -= 5;
    const intelligence = combatAttributes(state, tower).INT;
    syncMana(state, tower);
    const spellDamage = (rank + 1) * 4000 + (5 + rank) * intelligence + (.2 + .05 * rank) * (tower.mana ?? 0);
    for (const enemy of [...state.enemies]) {
      if (state.phase !== "running") return;
      if (inArea(enemy) && targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs)) {
        damageEnemy(state, tower, tower.templateId, enemy, spellDamage, "magic", items[rank]);
      }
    }
    for (const enemy of [...state.enemies]) {
      if (state.phase !== "running") return;
      if (enemy.hp > 0 && inArea(enemy)) {
        const ratio = (mapBoss(enemy) ? .01 : .03) * (rank + 1);
        damageEnemy(state, tower, tower.templateId, enemy, enemy.hp * ratio, "divine", items[rank]);
      }
    }
  }
}

function activateTreeGrab(state: Match, tower: Construction, skillId = tower.templateId === "G059" ? "A149" : "A068"): Result {
  if (tower.pending || skillId !== (tower.templateId === "G059" ? "A149" : "A068")) return { ok: false, reason: "missing" };
  const rank = tower.hero?.ranks[skillId] ?? 0;
  if (rank < 1) return { ok: false, reason: "missing" };
  if (state.queue.nowUs < Math.max(tower.treeGrab?.readyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  const cost = [10, 15, 20, 25, 30, 40][rank - 1];
  if (tower.mana! < cost) return { ok: false, reason: "resources" };
  tower.mana! -= cost;
  const status = tower.treeGrab ??= { readyUs: 0, cleaveUntilUs: 0, strength: {} };
  status.readyUs = state.queue.nowUs + us(15);
  tower.lastCastUs = state.queue.nowUs;
  tower.lastCastTarget = { x: tower.x, y: tower.y };
  triggerSpellEquipment(state, tower);
  if (state.phase !== "running" || !state.structures.includes(tower)) return { ok: true };
  const buffId = scheduleEvent(state.queue, us(6), { type: "tree-grab-expire", towerId: tower.id, buffId: state.queue.nextSequence });
  status.strength[buffId] = [20, 35, 50, 65, 80, 100][rank - 1];
  status.cleaveUntilUs = state.queue.nowUs + us(6);
  status.readyUs = adjustedSpellCooldown(state, tower, status.readyUs);
  return { ok: true };
}

function adjustedSpellCooldown(state: Match, tower: Construction, readyUs: number) {
  const now = state.queue.nowUs;
  let remaining = Math.max(0, readyUs - now);
  if (towerGear(state, tower).some(item => item.itemId === "i327")) remaining = Math.round(remaining * .8);
  const form = tower.hero?.divineForm;
  if (form?.id === "P222") remaining = Math.round(remaining * (1 - .01 * form.stars));
  return now + remaining;
}

function eligibleHeroTarget(state: Match, tower: Construction, enemy: Enemy, range: number, skillId?: HeroSpell) {
  if (!canSeeEnemy(state, enemy) || !targetable(enemy, ["ground", "air"], state.queue.nowUs) ||
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > range ** 2) return false;
  const types = unitBalance.get(enemy.unitId)?.type?.split(",") ?? [];
  if (skillId === "A042") return !/^[A-Z]/.test(enemy.unitId) && !(enemy.abilities?.includes("N534") && types.includes("sapper"));
  if (skillId === "A092" && !organicWaveTarget(state, enemy)) return false;
  return skillId === undefined || heroSpellTargetMode(skillId) !== "unit" ||
    !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Avul" || id === "Aloc");
}

function spellTarget(state: Match, tower: Construction, range: number, skillId?: HeroSpell) {
  const candidates = state.enemies.filter(enemy => eligibleHeroTarget(state, tower, enemy, range, skillId));
  return (skillId === "A151" || skillId === "A020" ? candidates.find(enemy => enemy.abilities?.includes("N534")) : undefined) ?? candidates[0];
}

export function heroSpellTargets(state: Match, towerId: number, skillId: HeroSpell) {
  const tower = state.structures.find(unit => unit.id === towerId);
  if (!tower) return [];
  return state.enemies.filter(enemy => eligibleHeroTarget(state, tower, enemy, heroSpells[skillId].range, skillId));
}

export function purgeTargets(state: Match, caster: Point, range: number) {
  return state.enemies.filter(enemy => organicWaveTarget(state, enemy) && canSeeEnemy(state, enemy) &&
    (enemy.x - caster.x) ** 2 + (enemy.y - caster.y) ** 2 <= range ** 2).sort((left, right) => left.id - right.id);
}

function beginTowerSpell(state: Match, tower: Construction, skillId: string, automatic: boolean, targetId?: number): Result {
  const spell = towerSpells.get(tower.templateId)?.find(entry => entry.id === skillId);
  if (!spell || tower.pending) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (spell.effect.kind === "frenzy") {
    if (automatic && tower.summon?.illusion) return { ok: false, reason: "missing" };
    if (now < Math.max(tower.towerSpellReady?.[skillId] ?? tower.frenzyReadyUs ?? 0, tower.stunnedUntilUs ?? 0)) {
      return { ok: false, reason: "cooldown" };
    }
    syncMana(state, tower);
    if (tower.mana! < spell.cost) return { ok: false, reason: "resources" };
    tower.mana! -= spell.cost;
    (tower.towerSpellReady ??= {})[skillId] = now + us(spell.cooldown);
    tower.frenzyAmount = spell.effect.amount;
    tower.frenzyUntilUs = now + us(5);
    scheduleWeaponRateEnd(state, tower, "frenzyUntilUs", tower.frenzyUntilUs);
    tower.lastCastUs = now;
    tower.lastCastTarget = { x: tower.x, y: tower.y };
    triggerSpellEquipment(state, tower);
    return { ok: true };
  }
  if (now < Math.max(tower.towerSpellReady?.[skillId] ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  const isTargeted = spell.effect.kind === "purge";
  let target: Construction | Enemy | undefined = tower;
  if (spell.effect.kind === "purge") {
    const candidates = purgeTargets(state, tower, automatic ? spell.search : spell.effect.range);
    target = targetId === undefined ? candidates[0] : candidates.find(enemy => enemy.id === targetId);
  } else if (spell.effect.kind !== "wolves" && (spell.effect.kind === "wave" || spell.effect.kind === "sword-rain" || automatic)) {
    target = spellTarget(state, tower, automatic ? spell.search : 800);
  }
  if (!target) return { ok: false, reason: "range" };
  syncMana(state, tower);
  if (tower.mana! < spell.cost) return { ok: false, reason: "resources" };
  interruptWeapon(state, tower);
  tower.heroCastUntilUs = now + us(spell.cast);
  tower.spellWindup = scheduleEvent(state.queue, us(spell.cast), { type: "tower-spell", towerId: tower.id, skillId,
    point: { x: target.x, y: target.y }, ...(isTargeted ? { targetId: target.id } : {}) });
  return { ok: true };
}

function resolveTowerSpell(state: Match, event: Extract<MatchEvent, { type: "tower-spell" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  if (tower) delete tower.spellWindup;
  if (!tower || tower.pending || state.queue.nowUs < (tower.stunnedUntilUs ?? 0)) return;
  const spell = towerSpells.get(tower.templateId)?.find(entry => entry.id === event.skillId);
  if (!spell || spell.effect.kind === "frenzy") return;
  const now = state.queue.nowUs;
  const effect = spell.effect;
  const target = effect.kind === "purge" ? state.enemies.find(enemy => enemy.id === event.targetId) : undefined;
  if (effect.kind === "purge" && (!target || !organicWaveTarget(state, target) ||
      !canSeeEnemy(state, target) || (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > effect.range ** 2)) return;
  syncMana(state, tower);
  if (tower.mana! < spell.cost) return;
  tower.mana! -= spell.cost;
  (tower.towerSpellReady ??= {})[spell.id] = now + us(spell.cooldown);
  tower.lastCastUs = now;
  tower.lastCastTarget = event.point;
  triggerSpellEquipment(state, tower);
  if (state.phase !== "running") return;
  if (effect.kind === "purge") {
    if (!target || consumeEnemySpellShield(state, target)) return;
    delete target.armorBuff;
    delete target.speedBuff;
    delete target.speedBuffUntilUs;
    delete target.sprintUntilUs;
    delete target.invisibleFromUs;
    delete target.windwalk;
    delete target.windwalkSpeed;
    const duration = resistantToControl(target) ? .5 : 4;
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
  const victims = [...state.enemies].sort((left, right) => left.id - right.id);
  for (const enemy of victims) {
    if (state.phase !== "running") return;
    const targets = effect.kind === "howl" ? ["ground", "air"] :
      effect.kind === "stomp" ? ["ground", "structure", "mechanical"] : ["ground", "mechanical"];
    if (!state.enemies.includes(enemy) || !targetable(enemy, targets, now) || magicImmune(enemy) ||
        enemy.abilities?.some(id => id === "Avul" || id === "Aloc") ||
        (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > effect.radius ** 2) continue;
    const resistant = resistantToControl(enemy);
    if (effect.kind === "howl") {
      if (mechanicalEnemy(enemy)) continue;
      enemy.howlArmor = { amount: effect.amount, expiresUs: now + us(resistant ? 2 : 4) };
      continue;
    }
    const duration = resistant ? .4 : 1.2;
    if (effect.kind === "stomp" && targetable(enemy, ["ground"], now) && !mechanicalEnemy(enemy)) {
      stunEnemy(state, enemy, us(duration));
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

function stopTowerCast(state: Match, tower: Construction) {
  if (tower.spellWindup !== undefined) {
    cancelEvent(state.queue, tower.spellWindup);
    delete tower.spellWindup;
    tower.heroCastUntilUs = state.queue.nowUs;
    return true;
  }
  if (tower.snow) {
    finishSnow(state, tower);
    return true;
  }
  if (tower.leashToken !== undefined) {
    for (const enemy of state.enemies) {
      if (enemy.leashes) enemy.leashes = enemy.leashes.filter(token => token !== tower.leashToken);
    }
    delete tower.leashToken;
    tower.heroCastUntilUs = state.queue.nowUs;
    if (tower.heroSpellReady?.A093 !== undefined) tower.heroSpellReady.A093 = adjustedSpellCooldown(state, tower, tower.heroSpellReady.A093);
    return true;
  }
  if (tower.swordRainToken === undefined) return false;
  stopSwordRain(tower, state.queue.nowUs);
  return true;
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
    const recent = state.swordRainImpacts?.filter(effect => now - effect.atUs < 300_000) ?? [];
    state.swordRainImpacts = [...recent, { ...impact, atUs: now }];
    const victims = state.enemies.filter(enemy => eligible(enemy) && (enemy.x - impact.x) ** 2 + (enemy.y - impact.y) ** 2 <= 100 ** 2)
      .sort((a, b) => a.id - b.id);
    for (const enemy of victims) {
      if (state.phase !== "running") break;
      if (!state.enemies.includes(enemy) || !eligible(enemy)) continue;
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

function organicWaveTarget(state: Match, enemy: Enemy) {
  return targetable(enemy, ["ground", "air"], state.queue.nowUs) && !magicImmune(enemy) &&
    !enemy.abilities?.some(id => id === "Aloc" || id === "Avul") && !mechanicalEnemy(enemy);
}

function beginHeroSpell(state: Match, tower: Construction, skillId: HeroSpell, automatic: boolean,
  selection?: Pick<Extract<Action, { type: "cast-hero" }>, "point" | "targetId">): Result {
  const spec = heroSpells[skillId];
  const rank = tower.hero?.ranks[skillId] ?? 0;
  if (!spec || !rank || tower.pending) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0, tower.heroSpellReady?.[skillId] ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  const mode = heroSpellTargetMode(skillId);
  const target = selection?.targetId !== undefined ?
    heroSpellTargets(state, tower.id, skillId).find(enemy => enemy.id === selection.targetId) :
    mode === "self" || selection?.point ? undefined : spellTarget(state, tower, automatic ? spec.autoRange : spec.range, skillId);
  const point = mode === "self" ? tower : mode === "unit" ? target : selection?.point ?? target;
  if (!point || !contains(map.bounds, point) || (point.x - tower.x) ** 2 + (point.y - tower.y) ** 2 > spec.range ** 2) {
    return { ok: false, reason: "range" };
  }
  syncMana(state, tower);
  if (tower.mana! < spec.mana[rank - 1]) return { ok: false, reason: "resources" };
  interruptWeapon(state, tower);
  tower.heroCastUntilUs = now + us(.4);
  tower.spellWindup = scheduleEvent(state.queue, us(.3), { type: "hero-spell", towerId: tower.id, targetId: target?.id ?? 0, skillId,
    point: { x: point.x, y: point.y }, ...(skillId === "A094" ? { wardVariant: !!tower.scepterWard } : {}) });
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
  if (tower) delete tower.spellWindup;
  const now = state.queue.nowUs;
  if (!tower?.hero || tower.pending || now < (tower.stunnedUntilUs ?? 0)) return;
  const rank = tower.hero.ranks[skillId];
  if (!rank) return;
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const mode = heroSpellTargetMode(skillId);
  if (mode === "unit" && (!target || !eligibleHeroTarget(state, tower, target, spec.range, skillId))) return;
  if (mode === "point" && (!contains(map.bounds, point) || (point.x - tower.x) ** 2 + (point.y - tower.y) ** 2 > spec.range ** 2)) return;
  if (event.wardVariant !== undefined && event.wardVariant !== !!tower.scepterWard) return;
  syncMana(state, tower);
  if (tower.mana! < spec.mana[rank - 1]) return;
  tower.mana! -= spec.mana[rank - 1];
  (tower.heroSpellReady ??= {})[skillId] = now + us(spec.cooldown[rank - 1] ?? spec.cooldown[0]);
  tower.lastCastUs = now;
  const castTarget = mode === "unit" ? target! : point;
  tower.lastCastTarget = { x: castTarget.x, y: castTarget.y };
  triggerSpellEquipment(state, tower);
  if (state.phase !== "running") return;
  if (skillId !== "A093") scheduleEvent(state.queue, us(.1), { type: "hero-spell-end", towerId: tower.id, skillId });
  const amount = spec.damage[rank - 1] ?? spec.damage[0];
  if (skillId === "A041") {
    tower.strafeUntilUs = now + us([4, 5, 6, 7, 8, 10][rank - 1]);
    scheduleWeaponRateEnd(state, tower, "strafeUntilUs", tower.strafeUntilUs);
    return;
  }
  if (skillId === "A042" && target) {
    const attack = Math.min(4000, (target.maxHp ?? target.hp) * (.08 + (rank - 1) * .01));
    damageEnemy(state, tower, "q025", target, amount, "divine", "A042", { x: tower.x, y: tower.y, id: state.nextId++ });
    const token = state.queue.nextSequence;
    (tower.contracts ??= {})[token] = Math.trunc(attack);
    scheduleEvent(state.queue, us(120), { type: "contract-expire", towerId: tower.id, token });
    return;
  }
  if (skillId === "A020" && target) {
    lagunaBlade(state, tower, target, amount);
    const extra = state.phase === "running" && towerGear(state, tower).some(item => item.itemId === "i310")
      ? state.enemies.filter(enemy => enemy.hp > 0 && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 900 ** 2)
        .sort((left, right) => left.id - right.id)[0] : undefined;
    if (extra && eligibleHeroTarget(state, tower, extra, 1500, "A020")) lagunaBlade(state, tower, extra, amount);
    return;
  }
  const origin = { x: tower.x, y: tower.y };
  if (skillId === "A094") {
    if (state.structures.includes(tower) && !tower.pending) createSerpentWards(state, tower, point, rank);
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
    if (tower.leashToken === undefined) scheduleEvent(state.queue, us(.1), { type: "hero-spell-end", towerId: tower.id, skillId });
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
    const secondary = state.enemies.filter(enemy => {
      if (enemy === target || !organicWaveTarget(state, enemy)) return false;
      const x = enemy.x - origin.x, y = enemy.y - origin.y;
      const depth = x * dx + y * dy;
      return depth >= 0 && depth <= 1200 && Math.abs(x * dy - y * dx) <= 250 + depth / 8;
    }).sort((left, right) => left.id - right.id);
    const candidates = [target, ...secondary.slice(0, 3 + rank * 2)];
    for (const enemy of candidates) {
      if (state.phase !== "running") break;
      if (!state.enemies.includes(enemy) || !organicWaveTarget(state, enemy)) continue;
      if (enemy === target && consumeEnemySpellShield(state, enemy)) continue;
      recordBattleAnimation(state, origin, tower.templateId, "spell-link", enemy);
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
      centers, rank, remaining: skillId === "A171" ? 6 : 10, hit: [],
      ...(skillId === "A172" ? { sourceIds: centers.map(() => state.nextId++) } : {}) });
    return;
  }
  const sweep: SpellSweep = { ...origin, ...direction, towerId: tower.id, name: skillId, sourceId: state.nextId++, speed: skillId === "A170" ? 1050 : 2000,
    range: 700, radiusStart: skillId === "A170" ? 200 : 300, radiusEnd: skillId === "A170" ? 400 : 300,
    amount, traveled: 0, hit: [], budget: 9_999_999 };
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep });
  if (skillId === "A170") {
    scheduleEvent(state.queue, us(.3), { type: "spell-sweep", sweep: { ...sweep, sourceId: state.nextId++, hit: [],
      amount: 0, slow: .20 + rank * .05, aim: point } });
  }
  if (skillId === "A152") {
    const centers = [300, 600, 900].map(ahead);
    for (const enemy of state.enemies) {
      if (!targetable(enemy, ["ground", "air"], now) || magicImmune(enemy) ||
          enemy.abilities?.some(id => id === "Aloc" || id === "Avul") ||
          unitBalance.get(enemy.unitId)?.type?.split(",").includes("mechanical") ||
          !centers.some(center => (enemy.x - center.x) ** 2 + (enemy.y - center.y) ** 2 <= 300 ** 2)) continue;
      enemy.waveArmor = { amount: rank * 10, expiresUs: now + us(6) };
    }
  }
}

function lagunaBlade(state: Match, tower: Construction, target: Enemy, amount: number) {
  const caster = { x: tower.x, y: tower.y, id: state.nextId++ };
  if (!consumeEnemySpellShield(state, target)) damageEnemy(state, tower, "q010", target, amount, "magic", "A020", caster);
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
  const unit: Construction = { x: point.x, y: point.y, id, templateId, pending: null,
    radius: behavior.independent ? unitBalance.get(templateId)?.collision ?? 0 : 0,
    qualification: null, population: 0, summon: behavior };
  if (behavior.independent) {
    unit.spawnOverlaps = wolfOccupants(state).filter(other => overlaps(unit, other)).map(other => other.id);
    for (const enemy of state.enemies) {
      if (unit.spawnOverlaps.includes(enemy.id)) enemy.initialOverlaps.push(id);
    }
  }
  (state.summons ??= []).push(unit);
  scheduleEvent(state.queue, us(duration), { type: "summon-expire", unitId: id });
  return id;
}

const necromancyBooks = ["i193", "i194", "i195", "i196"];
const necromancyPriority = [...necromancyBooks].reverse();

export function isActiveTowerEquipment(id: string) {
  return necromancyBooks.includes(id) || id === "i326" || id === "i238" || id === "i330" || id === "i332" || id === "i255";
}

function switchDemonflame(state: Match, tower: Construction, item: Item) {
  syncTowerLife(state, tower);
  const lighting = item.itemId === "i332";
  if (tower.demonflameTimer !== undefined) {
    cancelEvent(state.queue, tower.demonflameTimer);
    delete tower.demonflameTimer;
  }
  removeItem(state, item);
  syncTowerLife(state, tower);
  const replacement = { ...item, id: state.nextId++, itemId: lighting ? "i330" : "i332" };
  (state.inventory ??= []).push(replacement);
  syncTowerLife(state, tower);
  if (lighting) {
    tower.demonflameTimer = scheduleEvent(state.queue, us(1), { type: "demonflame", towerId: tower.id, itemId: replacement.id });
  }
  return replacement.id;
}

function useGuldanSkull(state: Match, tower: Construction, skull: Item): Result {
  if (!tower.hero || skull.charges <= 0) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.skullReadyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  syncTowerLife(state, tower);
  if (tower.mana! < 10) return { ok: false, reason: "resources" };
  tower.mana! -= 10;
  tower.skullReadyUs = now + us(120);
  const choice = Math.floor(6 * roll(state));
  const attribute = (["STR", "AGI", "INT"] as const)[choice];
  if (attribute) tower.hero.natural[attribute] += 5 + Math.floor(26 * roll(state));
  else if (choice === 3) {
    tower.lifeOffset = (tower.lifeOffset ?? 0) + 200 + Math.floor(201 * roll(state));
    const life = syncTowerLife(state, tower);
    life.hp = life.maximum;
  } else if (choice === 4) {
    tower.manaOffset = (tower.manaOffset ?? 0) + 200 + Math.floor(201 * roll(state));
    syncMana(state, tower);
    tower.mana = tower.manaMaximum;
  } else tower.permanentAttack = (tower.permanentAttack ?? 0) + 30 + Math.floor(31 * roll(state));
  if (--skull.charges === 0) removeItem(state, skull);
  if (attribute === "AGI") weaponRatesDirty.add(state);
  syncMana(state, tower);
  syncTowerLife(state, tower);
  return { ok: true };
}

function beginSnow(state: Match, tower: Construction, point: Point | undefined): Result {
  const now = state.queue.nowUs;
  if (!point || !contains(map.bounds, point) || (tower.x - point.x) ** 2 + (tower.y - point.y) ** 2 > 1000 ** 2) {
    return { ok: false, reason: "range" };
  }
  if (now < Math.max(tower.snowReadyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  if (tower.mana! < 150) return { ok: false, reason: "resources" };
  tower.mana! -= 150;
  interruptWeapon(state, tower);
  tower.snowReadyUs = now + us(20);
  const duration = state.snowDuration ?? 4;
  const token = state.queue.nextSequence;
  tower.snow = { token, point: { ...point }, startedUs: now, duration };
  tower.heroCastUntilUs = now + us(duration);
  tower.lastCastUs = now;
  tower.lastCastTarget = point;
  scheduleEvent(state.queue, us(duration), { type: "equipment-snow", towerId: tower.id, token });
  return { ok: true };
}

function finishSnow(state: Match, tower: Construction) {
  const snow = tower.snow;
  if (!snow) return;
  delete tower.snow;
  const now = state.queue.nowUs;
  tower.heroCastUntilUs = now;
  cancelEvent(state.queue, snow.token);
  tower.snowReadyUs = adjustedSpellCooldown(state, tower, tower.snowReadyUs!);
  const duration = Math.min(snow.duration, Math.floor((now - snow.startedUs) / 1_000_000));
  if (duration < 1) return;
  const radius = 200 + 100 * duration;
  const source = { ...snow.point, id: state.nextId++ };
  const targets = [...state.enemies].sort((left, right) => left.id - right.id);
  for (const enemy of targets) {
    if (state.phase !== "running") return;
    if (!targetable(enemy, ["ground", "air", "structure"], now) || magicImmune(enemy) ||
        enemy.abilities?.some(id => id === "Aloc" || id === "Avul") ||
        (enemy.x - snow.point.x) ** 2 + (enemy.y - snow.point.y) ** 2 > radius ** 2) continue;
    const owner = firingUnit(state, tower.id);
    damageEnemy(state, owner, "q001", enemy, 2800 * duration * .8, "magic", "i325", source);
    if (enemy.hp <= 0) continue;
    const hold = resistantToControl(enemy) ? .5 + .25 * duration : .75 * duration;
    stunEnemy(state, enemy, us(hold));
  }
}

function mapBoss(enemy: Enemy) {
  return enemy.abilities?.includes("N534") && unitBalance.get(enemy.unitId)?.type?.split(",").includes("sapper");
}

type TargetedEquipment = "i276" | "i281";

export function isTargetedEquipment(itemId: string): itemId is TargetedEquipment {
  return itemId === "i276" || itemId === "i281";
}

export function controlEquipmentTargets(state: Match, towerId: number, itemId: TargetedEquipment) {
  const tower = state.structures.find(entry => entry.id === towerId);
  if (!tower || tower.pending) return [];
  const range = itemId === "i276" ? 1000 : 900;
  return state.enemies.filter(enemy => eligibleHeroTarget(state, tower, enemy, range, "A020") &&
    (itemId !== "i276" || enemy.unitId !== "ma01") && (itemId !== "i281" || mapBoss(enemy)));
}

function useControlEquipment(state: Match, tower: Construction, itemId: TargetedEquipment, targetId: number | undefined) {
  const now = state.queue.nowUs;
  if (now < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0, tower.controlEquipmentReady?.[itemId] ?? 0)) {
    return { ok: false, reason: "cooldown" } as const;
  }
  const target = controlEquipmentTargets(state, tower.id, itemId).find(enemy => enemy.id === targetId);
  if (!target) return { ok: false, reason: "range" } as const;
  const cost = itemId === "i276" ? 300 : 100;
  syncMana(state, tower);
  if (tower.mana! < cost) return { ok: false, reason: "resources" } as const;
  tower.mana! -= cost;
  (tower.controlEquipmentReady ??= {})[itemId] = now + us(itemId === "i276" ? 30 : 15);
  if (itemId === "i276") {
    if (target.seal || consumeEnemySpellShield(state, target)) return { ok: true } as const;
    syncEnemyHealth(state, target);
    const amount = target.hp * .4;
    target.hp -= amount;
    target.seal = { amount, untilUs: now + us(6) };
    scheduleEvent(state.queue, us(6), { type: "equipment-seal-end", targetId: target.id });
  } else {
    triggerSpellEquipment(state, tower);
    if (state.phase !== "running" || target.hp <= 0 || now < (target.doomReadyUs ?? 0)) return { ok: true } as const;
    target.doomReadyUs = now + us(10);
    scheduleEvent(state.queue, 0, { type: "equipment-doom-impact", targetId: target.id,
      point: { x: tower.x, y: tower.y }, expiresUs: now + us(1), travelUs: 0 });
  }
  return { ok: true } as const;
}

function advanceEquipmentDoom(state: Match, event: Extract<MatchEvent, { type: "equipment-doom-impact" }>) {
  const now = state.queue.nowUs;
  const target = state.enemies.find(enemy => enemy.id === event.targetId && targetable(enemy, ["ground", "air"], now));
  if (!target || now > event.expiresUs || magicImmune(target) || target.abilities?.some(id => id === "Aloc" || id === "Avul")) return;
  const travelUs = event.travelUs ?? movementStepUs;
  const step = .001 * travelUs;
  const distance = Math.hypot(target.x - event.point.x, target.y - event.point.y);
  if (us(distance / 1000) > travelUs) {
    const { dx, dy } = spellDirection(event.point, target);
    const nextTravelUs = Math.min(movementStepUs, us((distance - step) / 1000));
    scheduleEvent(state.queue, nextTravelUs, { ...event, travelUs: nextTravelUs,
      point: { x: event.point.x + dx * step, y: event.point.y + dy * step } });
    return;
  }
  if (consumeEnemySpellShield(state, target)) return;
  target.doomUntilUs = now + us(5);
}

function useDemonflame(state: Match, tower: Construction, item: Item): Result {
  const now = state.queue.nowUs;
  if (now < Math.max(tower.demonflameReadyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  tower.demonflameReadyUs = now + us(1);
  if (item.charges === 1) item.charges = 0;
  const lighting = item.itemId === "i332";
  const life = syncTowerLife(state, tower);
  tower.demonflameAuto = lighting;
  if (lighting && life.hp <= life.maximum * .8) return { ok: false, reason: "resources" };
  return { ok: true, createdId: switchDemonflame(state, tower, item) };
}

function tickDemonflame(state: Match, towerId: number, itemId: number) {
  const tower = state.structures.find(entry => entry.id === towerId);
  if (!tower) return;
  delete tower.demonflameTimer;
  const item = towerGear(state, tower).find(entry => entry.id === itemId && entry.itemId === "i330");
  if (!item) return;
  const life = syncTowerLife(state, tower);
  if (life.hp < life.maximum * .2) {
    switchDemonflame(state, tower, item);
    return;
  }
  const damage = 2.5 * (life.maximum - life.hp);
  life.hp -= life.maximum * .08;
  tower.demonflameTimer = scheduleEvent(state.queue, us(1), { type: "demonflame", towerId, itemId });
  if (damage <= 0) return;
  for (const enemy of [...state.enemies].sort((left, right) => left.id - right.id)) {
    if (state.phase !== "running") return;
    if (!targetable(enemy, ["ground", "air", "structure", "mechanical"], state.queue.nowUs) ||
        enemy.abilities?.some(id => id === "Avul" || id === "Aloc" || id === "Aeth") ||
        (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > 700 ** 2) continue;
    damageEnemy(state, tower, tower.templateId, enemy,
      physicalDamage(damage, "normal", armorAt(state, enemy), !!enemy.welfare), "physical", "i330");
  }
}

function scepterSwapTarget(state: Match, id: number): Point | undefined {
  if (id === -1) return state.worker;
  if (id === circleId) return circle;
  const unit = firingUnit(state, id);
  return unit?.pending ? undefined : unit;
}

function resolveScepterSwap(state: Match, event: Extract<MatchEvent, { type: "scepter-swap" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  if (event.stage === "effect") {
    const target = scepterSwapTarget(state, event.targetId);
    if (tower) delete tower.spellWindup;
    const now = state.queue.nowUs;
    if (!tower?.scepterSwap || tower.scepterSwap.grant !== event.grant || !target || tower.pending ||
        now < (tower.stunnedUntilUs ?? 0) || (tower.x - target.x) ** 2 + (tower.y - target.y) ** 2 > 9999 ** 2) return;
    syncMana(state, tower);
    if (tower.mana! < 150) return;
    tower.mana! -= 150;
    tower.scepterSwap.readyUs = now + us(10);
    tower.lastCastUs = now;
    tower.lastCastTarget = { x: target.x, y: target.y };
    triggerSpellEquipment(state, tower);
    if (state.phase !== "running" || !state.structures.includes(tower)) return;
    if (event.targetId !== -1 && event.targetId !== circleId && map.buildAreas.some(area => contains(area, target))) {
      scheduleEvent(state.queue, us(.1), { ...event, stage: "move" });
    }
    if (tower.scepterSwap?.grant === event.grant) tower.scepterSwap.readyUs = adjustedSpellCooldown(state, tower, tower.scepterSwap.readyUs);
    return;
  }
  const target = firingUnit(state, event.targetId);
  const from = tower ? { x: tower.x, y: tower.y } : { x: 0, y: 0 };
  if (tower) Object.assign(tower, target ? { x: target.x, y: target.y } : { x: 0, y: 0 });
  if (target) Object.assign(target, from);
  weaponRatesDirty.add(state);
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
  const upgraded = tower.scepterWard === true;
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

function launchMagicArrow(state: Match, towerId: number, target: Enemy, point: Point, rank: number, scepter: boolean,
  expiresUs = scepter ? state.queue.nowUs + us(1) : undefined, sourceId = scepter ? state.nextId++ : undefined) {
  const distance = Math.hypot(target.x - point.x, target.y - point.y);
  const travelUs = Math.min(movementStepUs, us(distance / 1250));
  scheduleEvent(state.queue, travelUs, {
    type: "magic-arrow", towerId, targetId: target.id, point, rank, scepter, expiresUs, sourceId, travelUs,
  });
}

function resolveMagicArrow(state: Match, event: Extract<MatchEvent, { type: "magic-arrow" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const tower = state.structures.find(tower => tower.id === event.towerId);
  const now = state.queue.nowUs;
  if ((!tower && !event.scepter) || !target || now > (event.expiresUs ?? Infinity) || !targetable(target, ["ground", "air"], now) || magicImmune(target) ||
      target.abilities?.some(id => id === "Avul" || id === "Aloc")) return;
  const step = 1250 * (event.travelUs ?? movementStepUs) / 1_000_000;
  if (Math.hypot(target.x - event.point.x, target.y - event.point.y) > step + 1250 / 1_000_000) {
    const { dx, dy } = spellDirection(event.point, target);
    launchMagicArrow(state, event.towerId, target, { x: event.point.x + dx * step, y: event.point.y + dy * step },
      event.rank, event.scepter, event.expiresUs, event.sourceId);
    return;
  }
  if (consumeEnemySpellShield(state, target)) return;
  const duration = event.scepter ? .1 : 2 + (event.rank - 1) * .2;
  target.stunUntilUs = Math.max(target.stunUntilUs ?? 0, now + us(duration));
  scheduleEvent(state.queue, target.stunUntilUs - now, { type: "stun-expire", enemyId: target.id });
  if (event.scepter) {
    if (!tower) {
      damageEnemy(state, undefined, "q032", target, 1, "magic", "A151", { ...event.point, id: event.sourceId ?? state.nextId++ });
      return;
    }
    syncEnemyHealth(state, target);
    const amount = target.hp * .5;
    target.hp -= amount;
    const token = state.queue.nextSequence;
    scheduleEvent(state.queue, us(6), { type: "magic-arrow-restore", towerId: tower.id, targetId: target.id, token, amount });
  } else if (tower) {
    damageEnemy(state, tower, tower.templateId, target, heroSpells.A151.damage[event.rank - 1], "magic", "A151");
  }
}

function sendHeroLeash(state: Match, tower: Construction, enemy: Enemy, rank: number, primary: boolean) {
  const now = state.queue.nowUs;
  const point = { x: tower.x, y: tower.y };
  if (!canSeeEnemy(state, enemy) || !targetable(enemy, ["ground", "air"], now) || magicImmune(enemy) ||
      enemy.abilities?.some(id => id === "Avul" || id === "Aloc") || (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 >
      (primary ? 600 : 2000) ** 2 || consumeEnemySpellShield(state, enemy)) return;
  const token = state.queue.nextSequence;
  if (primary) {
    tower.leashToken = token;
    tower.heroCastUntilUs = now + us(3);
  }
  if (!(enemy.abilities?.includes("N534"))) (enemy.leashes ??= []).push(token);
  scheduleEvent(state.queue, us(1), { type: "hero-leash", towerId: tower.id, targetId: enemy.id, point, token, rank, primary, tick: 1,
    sourceId: primary ? tower.id : state.nextId++ });
}

function resolveHeroLeash(state: Match, event: Extract<MatchEvent, { type: "hero-leash" }>) {
  const { towerId, targetId, point, token, rank, primary, tick } = event;
  const tower = state.structures.find(entry => entry.id === towerId);
  const target = state.enemies.find(enemy => enemy.id === targetId);
  const now = state.queue.nowUs;
  const distance = target ? (target.x - point.x) ** 2 + (target.y - point.y) ** 2 : Infinity;
  const eligible = target && targetable(target, ["ground", "air"], now) && canSeeEnemy(state, target) && !magicImmune(target) &&
    !target.abilities?.some(id => id === "Avul" || id === "Aloc") && distance <= (primary ? 600 : 2000) ** 2 &&
    (!primary || tower && !tower.pending && tower.leashToken === token && now >= (tower.stunnedUntilUs ?? 0)) &&
    (target.abilities?.includes("N534") || target.leashes?.includes(token));
  if (eligible) {
    const source = primary ? tower : { ...point, id: event.sourceId ?? -token };
    damageEnemy(state, tower, primary && tower ? tower.templateId : "q001", target,
      heroSpells.A093.damage[rank - 1], "magic", "A093", source);
    if (tick < 3 && target.hp > 0 && state.phase === "running" &&
        (target.abilities?.includes("N534") || target.leashes?.includes(token))) {
      scheduleEvent(state.queue, us(1), { ...event, tick: tick + 1 });
      return;
    }
  }
  if (target?.leashes) target.leashes = target.leashes.filter(link => link !== token);
  if (primary && tower?.leashToken === token) {
    delete tower.leashToken;
    tower.heroCastUntilUs = now;
    if (tower.heroSpellReady?.A093 !== undefined) tower.heroSpellReady.A093 = adjustedSpellCooldown(state, tower, tower.heroSpellReady.A093);
  }
}

function advanceSpellSweep(state: Match, sweep: SpellSweep) {
  if (sweep.startedUs !== undefined && sweep.sourceId !== undefined) {
    advanceOrganicWave(state, sweep, sweep.startedUs, sweep.sourceId);
    return;
  }
  const tower = state.structures.find(entry => entry.id === sweep.towerId);
  if (!tower && !sweep.sourceId && sweep.name !== "i322") return;
  if (sweep.aim) {
    if (!tower) return;
    Object.assign(sweep, { x: tower.x, y: tower.y, ...spellDirection(tower, sweep.aim) });
    delete sweep.aim;
  }
  const distance = Math.min(sweep.range, sweep.traveled + sweep.speed * movementStepUs / 1_000_000);
  const from = { x: sweep.x + sweep.dx * sweep.traveled, y: sweep.y + sweep.dy * sweep.traveled };
  const to = { x: sweep.x + sweep.dx * distance, y: sweep.y + sweep.dy * distance };
  const radius = sweep.radiusStart + (sweep.radiusEnd - sweep.radiusStart) * distance / sweep.range;
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (sweep.hit.includes(enemy.id) || !targetable(enemy, sweep.targets ?? ["ground", "air", "structure"], state.queue.nowUs) ||
        magicImmune(enemy) || enemy.abilities?.some(id => id === "Aloc" || id === "Avul") ||
        segmentDistanceSquared(from, to, enemy) > radius ** 2) continue;
    sweep.hit.push(enemy.id);
    if (sweep.slow !== undefined) {
      if (tower && !consumeEnemySpellShield(state, enemy)) {
        const rank = tower.hero?.ranks.A170 ?? 1;
        const slow = sweep.name === "A170" ? .20 + rank * .05 : sweep.slow;
        enemy.frost = { factor: 1 - slow, expiresUs: state.queue.nowUs + us(5) };
        scheduleEvent(state.queue, us(5), { type: "frost-expire", enemyId: enemy.id });
      }
    } else {
      const damage = Math.min(sweep.amount, sweep.budget ?? Infinity);
      if (damage <= 0) break;
      if (sweep.budget !== undefined) sweep.budget -= damage;
      if (sweep.name === "i322") {
        damageEnemy(state, tower, "q018", enemy, damage * .8, "magic", "i322",
          { ...to, id: sweep.sourceId ?? sweep.towerId });
      } else {
        const actual = sweep.sourceId === undefined ? tower : { x: sweep.x, y: sweep.y, id: sweep.sourceId };
        if (!actual) continue;
        const raw = sweep.name === "A152" || sweep.name === "A170" ? damage : damage * .8;
        damageEnemy(state, tower, sweep.name === "A019" && tower ? tower.templateId : "q001", enemy, raw, "magic", sweep.name, actual);
      }
    }
  }
  if (distance < sweep.range && state.phase === "running") {
    sweep.traveled = distance;
    scheduleEvent(state.queue, movementStepUs, { type: "spell-sweep", sweep });
  }
}

function advanceOrganicWave(state: Match, sweep: SpellSweep, startedUs: number, sourceId: number) {
  const now = state.queue.nowUs;
  const distance = Math.min(sweep.range, (now - startedUs) * sweep.speed / 1_000_000);
  const radius = sweep.radiusStart;
  const point = { x: sweep.x + sweep.dx * distance, y: sweep.y + sweep.dy * distance };
  const contacts = state.enemies.filter(enemy => !sweep.hit.includes(enemy.id) && organicWaveTarget(state, enemy))
    .sort((left, right) => left.id - right.id);
  const tolerance = sweep.speed / 1_000_000;
  for (const enemy of contacts) {
    if (state.phase !== "running" || sweep.budget === 0) return;
    if (!state.enemies.includes(enemy) || !organicWaveTarget(state, enemy) ||
        Math.hypot(enemy.x - point.x, enemy.y - point.y) > radius + tolerance) continue;
    const raw = Math.min(sweep.amount, sweep.budget!);
    sweep.budget! -= raw;
    sweep.hit.push(enemy.id);
    const owner = state.structures.find(tower => tower.id === sweep.towerId && !tower.pending);
    damageEnemy(state, owner, "q001", enemy, raw * .8, "magic", sweep.name, { x: sweep.x, y: sweep.y, id: sourceId });
  }
  if (distance >= sweep.range || state.phase !== "running" || sweep.budget === 0) return;
  let next = startedUs + us(sweep.range / sweep.speed);
  for (const enemy of state.enemies) {
    if (sweep.hit.includes(enemy.id) || !organicWaveTarget(state, enemy)) continue;
    const x = enemy.x - sweep.x, y = enemy.y - sweep.y;
    const along = x * sweep.dx + y * sweep.dy;
    const across = x * sweep.dy - y * sweep.dx;
    const overlap = radius ** 2 - across ** 2;
    if (overlap < 0) continue;
    const half = Math.sqrt(overlap);
    if (along + half < distance || along - half > sweep.range) continue;
    next = Math.min(next, Math.max(now + 1, startedUs + us(Math.max(0, along - half) / sweep.speed)));
  }
  const movement = state.queue.pending.find(event => event.payload.type === "movement");
  if (movement) next = Math.min(next, movement.dueUs);
  sweep.traveled = distance;
  scheduleEvent(state.queue, Math.max(0, next - now), { type: "spell-sweep", sweep });
}

function resolveSpellZones(state: Match, event: Extract<MatchEvent, { type: "spell-zones" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  const ice = event.skillId === "A171";
  if (ice && tower?.icePathToken !== event.token) return;
  if (ice && event.remaining === 0) {
    delete tower!.icePathToken;
    return;
  }
  const now = state.queue.nowUs;
  const damage = heroSpells[event.skillId].damage[event.rank - 1];
  if (!ice) {
    event.sourceIds ??= event.centers.map(() => state.nextId++);
    for (const [index, center] of event.centers.entries()) {
      const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure"], now) &&
        !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Aloc" || id === "Avul") &&
        (enemy.x - center.x) ** 2 + (enemy.y - center.y) ** 2 <= 150 ** 2).sort((left, right) => left.id - right.id);
      const amount = Math.min(damage, 999_999 / targets.length);
      for (const enemy of targets) {
        if (state.phase !== "running") return;
        damageEnemy(state, tower, "q001", enemy, amount, "magic", event.skillId, { ...center, id: event.sourceIds[index] });
      }
    }
    if (--event.remaining > 0) scheduleEvent(state.queue, us(.5), event);
    return;
  }
  const candidates = [...state.enemies].sort((left, right) => left.id - right.id);
  for (const center of event.centers) for (const enemy of candidates) {
    if (state.phase !== "running") return;
    if (!targetable(enemy, ["ground", "air"], now) ||
        (enemy.x - center.x) ** 2 + (enemy.y - center.y) ** 2 > 200 ** 2 || event.hit.includes(enemy.id)) continue;
    event.hit.push(enemy.id);
    const source = { x: enemy.x, y: enemy.y, id: state.nextId++ };
    if (magicImmune(enemy) || enemy.abilities?.some(id => id === "Aloc" || id === "Avul")) continue;
    scheduleEvent(state.queue, 0, { type: "ice-path-impact", towerId: event.towerId, targetId: enemy.id,
      source, amount: damage, expiresUs: now + us(1), travelUs: 0 });
  }
  event.remaining--;
  scheduleEvent(state.queue, us(.5), event);
}

function resolveIcePath(state: Match, event: Extract<MatchEvent, { type: "ice-path-impact" }>) {
  const now = state.queue.nowUs;
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!target || now >= event.expiresUs || !targetable(target, ["ground", "air"], now) ||
      magicImmune(target) || target.abilities?.some(id => id === "Aloc" || id === "Avul")) return;
  const distance = Math.hypot(target.x - event.source.x, target.y - event.source.y);
  const travel = 3000 * event.travelUs / 1_000_000;
  if (distance > travel + .003) {
    const { dx, dy } = spellDirection(event.source, target);
    const travelUs = Math.min(movementStepUs, us((distance - travel) / 3000));
    const source = { ...event.source, x: event.source.x + dx * travel, y: event.source.y + dy * travel };
    scheduleEvent(state.queue, travelUs, { ...event, source, travelUs });
    return;
  }
  if (consumeEnemySpellShield(state, target)) return;
  stunEnemy(state, target, us(2.5));
  const owner = firingUnit(state, event.towerId);
  damageEnemy(state, owner, "q001", target, event.amount, "magic", "A171", event.source);
}

function weaponSpeedBonus(state: Match, tower: Construction, gear: Item[]) {
  if (tower.summon?.illusion) return tower.summon.speed;
  const now = state.queue.nowUs;
  const equipmentHaste = (nearbyEquipment(state, tower, ["i217"], 800) ? .20 : 0) +
    (nearbyEquipment(state, tower, ["i228"], 800) ? .10 : 0) + (hasBattleBanner(state, tower) ? .50 : 0) +
    (tower.summon?.speed ?? 0) + ((tower.strafeUntilUs ?? -1) >= now ? 1.5 : 0);
  const frenzy = (tower.frenzyUntilUs ?? -1) >= now ? tower.frenzyAmount ?? 0 : 0;
  const form = tower.hero?.divineForm;
  const divineSpeed = form?.id === "P214" ? divineField(form.id, "DataA", form.stars) :
    form?.id === "P215" ? divineField("T114", "DataA", form.stars) : 0;
  return gear.reduce((total, item) => total + (equipmentAttackSpeed.get(item.itemId) ?? 0),
    equipmentHaste + frenzy + divineSpeed + ((tower.runeBuffs?.i721 ?? -1) >= now ? .5 : 0));
}

function hasEnduranceAura(state: Match, unit: Point) {
  return state.structures.some(source => source.templateId === "n152" && !source.pending &&
    (source.x - unit.x) ** 2 + (source.y - unit.y) ** 2 <= 1000 ** 2);
}

function rawWeaponRate(state: Match, tower: Construction, gear: Item[], agility: number) {
  const now = state.queue.nowUs;
  const clapSlow = tower.thunderClap && tower.thunderClap.untilUs >= now ? tower.thunderClap.amount : 0;
  const untouchableSlow = tower.untouchable && tower.untouchable.untilUs >= now ? tower.untouchable.attackSlow : 0;
  const endurance = hasEnduranceAura(state, tower) ? .05 : 0;
  return 1 + .002 * agility + weaponSpeedBonus(state, tower, gear) + endurance - clapSlow - untouchableSlow -
    ((tower.armorFrostUntilUs ?? -1) >= now ? .25 : 0);
}

const weaponRatesDirty = new WeakSet<Match>();

function scheduleWeaponRateEnd(state: Match, tower: Construction, effect: WeaponRateEffect, expiresUs: number) {
  scheduleEvent(state.queue, expiresUs - state.queue.nowUs, { type: "weapon-rate-end", towerId: tower.id, effect, expiresUs });
  weaponRatesDirty.add(state);
}

function endWeaponRateEffect(state: Match, { towerId, effect, expiresUs }: Extract<MatchEvent, { type: "weapon-rate-end" }>) {
  const tower = firingUnit(state, towerId);
  if (!tower) return;
  if (effect === "i721") {
    if (tower.runeBuffs?.i721 !== expiresUs) return;
    delete tower.runeBuffs.i721;
  } else if (effect === "thunderClap" || effect === "untouchable") {
    if (tower[effect]?.untilUs !== expiresUs) return;
    delete tower[effect];
  } else {
    if (tower[effect] !== expiresUs) return;
    delete tower[effect];
    if (effect === "frenzyUntilUs") delete tower.frenzyAmount;
  }
  weaponRatesDirty.add(state);
}

function weaponCycleUs(tower: Construction, weapon: Weapon, gear: Item[]) {
  const reduction = tower.summon?.intervalReduction ?? (gear.some(item => item.itemId === "i304") ? .2 : 0);
  return us(Math.max(.000001, weapon.cooldown - reduction));
}

function scheduleWeaponPhase(state: Match, tower: Construction, phase: "windup" | "cooldown" | "backswing",
  workUs: number, rate: number): WeaponPhase {
  const { targetId, startedUs, timing } = tower.attack!;
  const delay = weaponPhaseDelay(workUs, rate);
  const timerId = scheduleEvent(state.queue, delay, phase === "windup"
    ? { type: "weapon-fire", towerId: tower.id, ...(targetId === undefined ? {} : { targetId }), slot: timing!.slot, startedUs }
    : phase === "cooldown" ? { type: "weapon-ready", towerId: tower.id, startedUs }
      : { type: "weapon-backswing-end", towerId: tower.id, startedUs });
  return { workUs, recordedUs: state.queue.nowUs, dueUs: state.queue.nowUs + delay, timerId };
}

function refreshWeaponTiming(state: Match, tower: Construction) {
  const attack = tower.attack;
  const timing = attack?.timing;
  if (!attack || !timing || !timing.cooldown && !timing.windup && !timing.backswing) return;
  const now = state.queue.nowUs;
  const gear = towerGear(state, tower);
  const current = weapons[tower.templateId]?.find(weapon => weapon.slot === timing.slot);
  const cycle = current ? weaponCycleUs(tower, current, gear) : timing.cycleUs;
  const oldRate = weaponScheduleRate(timing.rawRate);
  timing.rawRate = rawWeaponRate(state, tower, gear, combatAttributes(state, tower).AGI);
  const rate = weaponScheduleRate(timing.rawRate);
  for (const key of ["windup", "cooldown", "backswing"] as const) {
    const phase = timing[key];
    const scale = key === "cooldown" ? cycle / timing.cycleUs : 1;
    if (!phase || phase.dueUs <= now || oldRate === rate && scale === 1) continue;
    const remaining = (phase.workUs - (now - phase.recordedUs) * oldRate) * scale;
    if (remaining <= 0) continue;
    cancelEvent(state.queue, phase.timerId);
    timing[key] = scheduleWeaponPhase(state, tower, key, remaining, rate);
    if (key === "cooldown") attack.readyUs = timing[key].dueUs;
  }
  // A cooldown already due keeps its original B05 entry even when C changes.
  timing.cycleUs = cycle;
}

function interruptWeapon(state: Match, tower: Construction) {
  const attack = tower.attack;
  if (!attack) return;
  attack.winding = false;
  if (attack.timing?.windup) cancelEvent(state.queue, attack.timing.windup.timerId);
  if (attack.timing?.backswing) cancelEvent(state.queue, attack.timing.backswing.timerId);
  if (attack.timing) {
    delete attack.timing.windup;
    delete attack.timing.backswing;
  }
}

function beginWeaponTiming(state: Match, tower: Construction, weapon: Weapon, gear: Item[], point: Point,
  targetId?: number, artillery?: ArtilleryTarget) {
  const now = state.queue.nowUs;
  const rawRate = rawWeaponRate(state, tower, gear, combatAttributes(state, tower).AGI);
  const rate = weaponScheduleRate(rawRate);
  const timing: WeaponTiming = { version: 1, slot: weapon.slot, rawRate, cycleUs: weaponCycleUs(tower, weapon, gear),
    pointUs: us(weapon.windup), recoveryUs: us(weapon.backswing) };
  interruptWeapon(state, tower);
  const attack: NonNullable<Construction["attack"]> = { readyUs: now, winding: true, startedUs: now, timing };
  if (targetId !== undefined) attack.targetId = targetId;
  if (artillery) attack.artillery = artillery;
  tower.attack = attack;
  tower.lastAttackTarget = { x: point.x, y: point.y };
  timing.windup = scheduleWeaponPhase(state, tower, "windup", timing.pointUs, rate);
  timing.cooldown = scheduleWeaponPhase(state, tower, "cooldown", timing.cycleUs, rate);
  attack.readyUs = timing.cooldown.dueUs;
}

function startWeapon(state: Match, tower: Construction) {
  const now = state.queue.nowUs;
  if (tower.pending || tower.attack?.winding || tower.attack?.timing?.cooldown ||
    now < Math.max(tower.attack?.readyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) return;
  const slots = weapons[tower.templateId];
  if (!slots?.length) return;
  if (tower.wolfOrder?.type === "move") return;
  const wolfOrder = tower.wolfOrder;
  const commanded = wolfOrder?.type === "attack" ?
    wolfTargets(state, tower.id).find(enemy => enemy.id === wolfOrder.targetId) : undefined;
  if (wolfOrder?.type === "attack" && !commanded) delete tower.wolfOrder;
  const gear = towerGear(state, tower);
  if (tower.artilleryOrder) {
    const order = tower.artilleryOrder;
    delete tower.artilleryOrder;
    const weapon = slots.find(slot => slot.kind === "artillery");
    const point = weapon && artilleryPoint(state, tower, weapon, order);
    if (weapon && point) {
      beginWeaponTiming(state, tower, weapon, gear, point, undefined, order);
      return;
    }
  }
  const flame = flameArrow(tower);
  const manual = flame && state.enemies.find(enemy => enemy.id === tower.flameTarget &&
    flameWeapon(state, tower, enemy, flame.range));
  if (!manual) delete tower.flameTarget;
  for (const spell of towerSpells.get(tower.templateId) ?? []) {
    if ((spell.effect.kind === "wolves" || spell.effect.kind === "sword-rain") &&
      tower.autoModes?.[spell.id] !== false && beginTowerSpell(state, tower, spell.id, true).ok) return;
  }
  const focus = state.enemies.find(enemy => enemy.id === tower.focusTarget && canSeeEnemy(state, enemy) &&
    slots.some(slot => inWeaponRange(tower, enemy, slot, weaponRange(slot, gear), false, now)));
  if (!focus) delete tower.focusTarget;
  const current = manual || focus || state.enemies.find(enemy => enemy.id === (tower.tauntedTarget ?? tower.attack?.targetId));
  if (!current && tower.tauntedTarget !== undefined) delete tower.tauntedTarget;
  let target: Enemy | undefined;
  let weapon: Weapon | undefined;
  for (const enemy of commanded ? [commanded] : current ? [current, ...state.enemies] : state.enemies) {
    if (!canSeeEnemy(state, enemy)) continue;
    weapon = enemy === manual && flame ? flameWeapon(state, tower, enemy, flame.range) :
      slots.find(slot => inWeaponRange(tower, enemy, slot, weaponRange(slot, gear), false, now));
    if (weapon) {
      target = enemy;
      break;
    }
  }
  if (target && weapon) {
    const book = necromancyPriority.find(id => gear.some(item => item.itemId === id));
    if (book && tower.autoModes?.[book] !== false) useNecromancy(state, tower, book);
    const ring = gear.find(item => item.itemId === "i238");
    if (ring && tower.autoModes?.[ring.itemId] !== false) useRestoration(state, tower, ring);
  }
  for (const id of ["i276", "i281"] as const) {
    const equipped = gear.find(item => item.itemId === id);
    if (!equipped || tower.autoModes?.[id] === false || now < (tower.controlEquipmentReady?.[id] ?? 0)) continue;
    const range = id === "i281" ? 900 : 950;
    const boss = controlEquipmentTargets(state, tower.id, id).find(enemy => mapBoss(enemy) &&
      (id !== "i276" || !enemy.seal) && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= range ** 2);
    if (boss) scheduleEvent(state.queue, 0, { type: "auto-control-equipment", towerId: tower.id,
      itemId: equipped.id, targetId: boss.id });
  }
  const snow = gear.find(item => item.itemId === "i325");
  if (snow && tower.autoModes?.[snow.itemId] !== false && now >= (tower.snowReadyUs ?? 0)) {
    const next = state.enemies.find(enemy => enemy.hp > 0 && (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 800 ** 2);
    if (next) scheduleEvent(state.queue, 0, { type: "auto-control-equipment", towerId: tower.id,
      itemId: snow.id, point: { x: next.x, y: next.y } });
  }
  const heart = gear.find(item => item.itemId === "i332");
  if (heart && tower.autoModes?.[heart.itemId] !== false && tower.demonflameAuto !== false && state.enemies.some(enemy => enemy.hp > 0 &&
      (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 700 ** 2)) {
    const life = syncTowerLife(state, tower);
    if (life.hp >= life.maximum) switchDemonflame(state, tower, heart);
  }
  if (!target || !weapon) return;
  const hero = tower.hero;
  if (hero && !manual) {
    for (const skillId of heroAutoCastOrder) {
      if (hero.ranks[skillId] && tower.autoModes?.[skillId] !== false && beginHeroSpell(state, tower, skillId, true).ok) return;
    }
  }
  for (const spell of towerSpells.get(tower.templateId) ?? []) {
    if (spell.effect.kind === "wolves" || spell.effect.kind === "sword-rain") continue;
    if (tower.autoModes?.[spell.id] !== false && beginTowerSpell(state, tower, spell.id, true).ok && spell.effect.kind !== "frenzy") return;
  }
  if (state.phase !== "running") return;
  if (tower.autoModes?.[tower.templateId === "G059" ? "A149" : "A068"] !== false) activateTreeGrab(state, tower);
  triggerDivineEffect(state, tower, "attack");
  const untouchable = [2, 1, 0].find(index => target.abilities?.includes("N70" + (6 + index)));
  if (untouchable !== undefined && (tower.untouchable?.untilUs ?? -1) < now) {
    tower.untouchable = { attackSlow: [.5, .8, 1.2][untouchable], movement: [.9, .6, .4][untouchable], untilUs: now + us(2) };
    scheduleWeaponRateEnd(state, tower, "untouchable", tower.untouchable.untilUs);
  }
  const { STR: strength } = combatAttributes(state, tower);
  beginWeaponTiming(state, tower, weapon, gear, target, target.id);
  delete tower.tauntedTarget;
  if (flame && (!flame.cost || manual) && (manual || tower.flameArrows === true) &&
      flameTargetable(state, tower, target, flame.range)) {
    tower.attack!.flameBonus = flame.bonus;
    if (manual) tower.attack!.manualFlame = true;
    delete tower.flameTarget;
  }
  for (const id of ["i149", "i153"] as const) {
    if (gear.some(item => item.itemId === id)) triggerEquipmentFrost(state, tower, target, id);
  }
  triggerEquipmentLightning(state, tower, target, gear);
  if (weapon.kind !== "normal" && gear.some(item => item.itemId === "i204" || item.itemId === "i282")) {
    triggerEquipmentVolley(state, tower, target, weapon, gear);
  }
  if (state.phase !== "running") return;
  triggerAttackEquipment(state, tower, target, weapon, gear);
  if (state.phase !== "running") return;
  const skillId = tower.templateId === "G059" ? "A148" : "A067";
  const rank = hero?.ranks[skillId] ?? 0;
  if (rank > 0 && now >= (tower.avalancheReadyUs ?? 0) &&
      rollPercent(state) <= Math.min(60, 15 + 0.05 * strength)) {
    tower.avalancheReadyUs = now + us(2);
    const source = { x: tower.x, y: tower.y, id: state.nextId++ };
    if ((target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 <= 1500 ** 2) {
      scheduleEvent(state.queue, 0, { type: "avalanche", towerId: tower.id,
        point: { x: target.x, y: target.y }, rank, skillId, source });
    }
  }
}

function triggerAttackEquipment(state: Match, tower: Construction, target: Enemy, weapon: Weapon, gear: Item[]) {
  if (tower.summon?.illusion) return;
  const melee = weapon.kind === "normal";
  const stats = combatAttributes(state, tower);
  const fits = (enemy: Enemy, origin: Point, radius: number) => targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) &&
    !enemy.abilities?.some(id => id === "Aloc" || id === "Avul") &&
    (enemy.x - origin.x) ** 2 + (enemy.y - origin.y) ** 2 <= radius ** 2;

  if (gear.some(item => item.itemId === "i132") && rollPercent(state) <= 20) {
    const firstWeapon = weapons[tower.templateId]?.[0] ?? weapon;
    const average = averageWeaponField(state, tower, firstWeapon, gear);
    const amount = average * 3.6 + syncTowerLife(state, tower).maximum * .15;
    for (const enemy of [...state.enemies]) {
      if (state.phase !== "running") return;
      if (fits(enemy, target, 460)) damageEnemy(state, tower, tower.templateId, enemy,
        physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "i132");
    }
  }
  if (!melee && gear.some(item => item.itemId === "i302") && rollPercent(state) <= 12 &&
      state.queue.nowUs >= (tower.starfallReadyUs ?? 0)) {
    tower.starfallReadyUs = state.queue.nowUs + us(.3);
    const amount = 13 * stats.AGI * (weapon.max + weaponRange(weapon, gear)) / 1000;
    for (const enemy of [...state.enemies]) {
      if (state.phase !== "running") return;
      if (fits(enemy, target, 425)) damageEnemy(state, tower, tower.templateId, enemy, amount, "divine", "i302");
    }
  }
  if (gear.some(item => item.itemId === "i316") && rollPercent(state) <= (melee ? 25 : 15) &&
      state.queue.nowUs >= (tower.conquestReadyUs ?? 0)) {
    tower.conquestReadyUs = state.queue.nowUs + us(2);
    const victims = state.enemies.filter(enemy => fits(enemy, melee ? tower : target, melee ? 500 : 350));
    if (!victims.length) return;
    const strengthDifference = stats.STR - (tower.hero?.natural.AGI ?? 0);
    const amount = strengthDifference * victims.length * (melee ? 10 : 8) + (melee ? .6 * syncTowerLife(state, tower).hp : 0);
    if (amount <= 0) return;
    for (const enemy of victims) {
      if (state.phase !== "running") return;
      damageEnemy(state, tower, tower.templateId, enemy,
        physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "i316");
    }
  }
}

function triggerEquipmentVolley(state: Match, tower: Construction, target: Enemy, weapon: Weapon, gear: Item[]) {
  const roll = rollPercent(state);
  if (roll > 25 || state.queue.nowUs < (tower.equipmentVolleyReadyUs ?? 0)) return;
  tower.equipmentVolleyReadyUs = state.queue.nowUs + us(.4);
  const { attack, bonus } = weaponFields(state, tower, weapons[tower.templateId]?.[0] ?? weapon, gear);
  const base = weaponFieldInt(Math.fround(Math.fround(attack) + Math.fround(bonus)));
  const source = { x: tower.x, y: tower.y, id: state.nextId++ };
  scheduleEvent(state.queue, 0, { type: "equipment-volley", towerId: tower.id, targetId: target.id, source, base,
    itemId: gear.some(item => item.itemId === "i204") ? "i204" : "i282" });
}

function finishEquipmentVolley(state: Match, { towerId, targetId, source, base, itemId }: Extract<MatchEvent, { type: "equipment-volley" }>) {
  const inRange = (enemy: Enemy) => canSeeEnemy(state, enemy) &&
    targetable(enemy, ["ground", "air", "debris"], state.queue.nowUs) &&
    !enemy.abilities?.some(id => id === "Aloc" || id === "Avul" || id === "Aeth") &&
    (enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2 <= 900 ** 2;
  const target = state.enemies.find(enemy => enemy.id === targetId);
  if (!target || !inRange(target)) return;
  const others = state.enemies.filter(enemy => enemy !== target && inRange(enemy))
    .map(enemy => enemy.id).sort((left, right) => left - right).slice(0, 9);
  let budget = 9_999_999;
  for (const id of [targetId, ...others]) {
    if (state.phase !== "running") return;
    const enemy = state.enemies.find(entry => entry.id === id);
    if (!enemy || !inRange(enemy)) continue;
    const primary = id === targetId;
    const raw = Math.min(base + rollDice(state, 1, 1), primary ? Infinity : budget);
    if (raw <= 0) continue;
    if (!primary) budget -= raw;
    if (ordinaryMiss(state, enemy)) continue;
    const owner = state.structures.find(tower => tower.id === towerId && !tower.pending);
    damageEnemy(state, owner, "q007", enemy, physicalDamage(raw, "hero", armorAt(state, enemy), !!enemy.welfare),
      "weapon", itemId, source);
  }
}

function ordinaryMiss(state: Match, enemy: Enemy) {
  if (state.queue.nowUs < (enemy.evasionUntilUs ?? 0)) return true;
  const threshold = enemy.abilities?.includes("N524") ? 90 : enemy.abilities?.includes("N523") ? 35 : 0;
  return threshold > 0 && rollPercent(state) <= threshold;
}

const temporaryDamageSources = new Set(["q001", "q007", "q010", "q019", "q025", "q032", "q039"]);

function damageEnemy(state: Match, tower: Construction | undefined, sourceTemplate: string, enemy: Enemy, amount: number,
  kind: "weapon" | "physical" | "magic" | "divine", skillId?: string,
  source: (Point & { id: number; weakenedUntilUs?: number }) | undefined = tower, illusion = false,
  retiredContract?: NonNullable<WeaponShot["summon"]>["contract"]) {
  const now = state.queue.nowUs;
  if (enemy.hp <= 0 || now < (enemy.phaseUntilUs ?? 0) ||
      enemy.abilities?.some(id => id === "Avul" || id === "Aloc") || kind === "magic" && magicImmune(enemy) ||
      sourceTemplate === "q004" || sourceTemplate === "q005") return;
  if (enemy.sprintUntilUs && now < enemy.sprintUntilUs) amount *= 1.3;
  if (enemy.eggParentId !== undefined) {
    amount = amount > 0 && kind === "weapon" && source === tower && tower?.templateId === sourceTemplate && tower.hero ? 1 : 0;
  }
  syncEnemyMana(state, enemy);
  syncEnemyHealth(state, enemy);
  let magicResistance = 0;
  if (kind === "magic") {
    const resist = [0.15, 0.4, 0.5, 0.6, 0.8, 0.9].reduce((value, factor, index) =>
      enemy.abilities?.includes("T0" + (13 + index)) ? value * (1 - factor) : value, 1);
    const berserkerRank = enemy.abilities?.includes("N709") ? enemy.berserkerResistanceRank ?? 1 : 0;
    const remaining = resist * (1 - Math.min(.99, berserkerRank / 10));
    magicResistance = 1 - remaining;
    amount *= remaining;
  }
  if (enemy.shield && amount > 0) {
    const absorbed = Math.min(0.9 * amount, 2 * enemy.mana);
    enemy.mana -= absorbed / 2;
    amount -= absorbed;
  }
  if (amount === 0) return;
  if (sourceTemplate === "q018") {
    amount = 0;
    if (tower && !tower.pending) {
      const weapon = weapons[tower.templateId]?.[0];
      if (weapon) {
        const gear = towerGear(state, tower);
        const stats = combatAttributes(state, tower);
        const interval = weapon.cooldown - (gear.some(item => item.itemId === "i304") ? .2 : 0);
        const speed = rawWeaponRate(state, tower, gear, stats.AGI);
        const amount = Math.max(1000, Math.floor(6300 / interval + speed * 1000) + stats.AGI * 2.5);
        if (interval !== 0 && Number.isFinite(amount)) {
          damageEnemy(state, tower, "q019", enemy, amount, "divine", "i322", { x: tower.x, y: tower.y, id: state.nextId++ });
          if (state.phase !== "running" || enemy.hp <= 0) return;
        }
      }
    }
  }
  const ownedGear = tower && !illusion ? towerGear(state, tower) : [];
  if (tower && source === tower && sourceTemplate === tower.templateId) {
    const rune = kind === "magic" ? tower.runeBuffs?.i720 : kind === "divine" ? undefined : tower.runeBuffs?.i719;
    if (now < (rune ?? 0)) amount *= 1.2;
  }
  if (tower && !illusion && source === tower && kind === "weapon" && sourceTemplate === tower.templateId &&
      weapons[sourceTemplate]?.[0]?.kind === "normal" && ownedGear.some(item => item.itemId === "i322")) {
    const attributes = combatAttributes(state, tower);
    if (attributes.AGI >= attributes.INT && attributes.AGI >= attributes.STR) {
      tower.relicHits = (tower.relicHits ?? 0) + 1;
      if (tower.relicHits >= 10) {
        tower.relicHits = 0;
        if ((tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 5000 ** 2) {
          const direction = spellDirection(tower, enemy);
          scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { towerId: tower.id, sourceId: state.nextId++,
            name: "i322", x: tower.x, y: tower.y, ...direction, speed: 2500, range: 900, radiusStart: 300, radiusEnd: 300,
            amount: 10, traveled: 0, hit: [], targets: ["ground", "air"], budget: 9_999_999 } });
        }
      }
    }
  }
  if (tower && source === tower && amount > 0 && kind === "weapon" && sourceTemplate === tower.templateId) {
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
  if (tower && source && source !== tower && amount !== 0 && kind === "weapon") {
    const summonerUnit = state.summons?.find(unit => unit === source && unit.templateId === sourceTemplate);
    const activeContract = summonerUnit?.summon;
    const contract = activeContract && !activeContract.independent && !activeContract.illusion ? activeContract : retiredContract;
    if (contract) {
      if (contract.green > 0) {
        damageEnemy(state, tower, sourceTemplate, enemy,
          contract.green * combatAttributes(state, tower).AGI, "divine", "T086", source);
      }
      if (state.phase !== "running") return;
      if (contract.blue > 0 && rollPercent(state) <= 15) {
        const weapon = weapons[sourceTemplate][0];
        const active = summonerUnit && weaponFields(state, summonerUnit, weapon, towerGear(state, summonerUnit));
        const attack = active ? Math.fround(active.attack) + Math.fround(active.bonus) : retiredContract!.baseAttack;
        for (const target of [...state.enemies]) {
          if (state.phase !== "running") return;
          if ((target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= 400 ** 2) {
            damageEnemy(state, tower, sourceTemplate, target, contract.blue * attack * .5, "magic", "T087", source);
          }
        }
      }
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (kind === "weapon" && sourceTemplate !== "q039") {
    if (source && /^n15[3-5]$/.test(sourceTemplate)) {
      const index = Number(sourceTemplate.slice(1)) - 153;
      const sourceId = state.nextId++;
      if (organicWaveTarget(state, enemy) && canSeeEnemy(state, enemy) &&
          (enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2 <= 2000 ** 2) {
        const radius = [100, 110, 120][index];
        scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { x: source.x, y: source.y,
          ...spellDirection(source, enemy), sourceId, towerId: tower?.id ?? 0, startedUs: now, name: "N0" + (17 + index),
          speed: 1200, range: [900, 1200, 1500][index], radiusStart: radius, radiusEnd: radius,
          amount: [300, 600, 1200][index], traveled: 0, hit: [], budget: 9_999_999 } });
      }
    }
    if (rollPercent(state) <= 15 && tower && source && /^n(?:179|18[0-2])$/.test(sourceTemplate)) {
      const index = Number(sourceTemplate.slice(1)) - 179;
      const damage = [800, 1200, 1800, 4000][index];
      const targets = state.enemies.filter(target => targetable(target, ["ground", "air", "structure"], now) &&
        (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= 500 ** 2).sort((left, right) => left.id - right.id);
      for (const target of targets) {
        if (state.phase !== "running") return;
        if (state.enemies.includes(target)) {
          damageEnemy(state, tower, sourceTemplate, target,
            physicalDamage(damage, "normal", armorAt(state, target), !!target.welfare), "physical", "N0" + (54 + index), source);
        }
      }
    }
    if (rollPercent(state) <= 20 && tower && source && /^n18[3-5]$/.test(sourceTemplate)) {
      const index = Number(sourceTemplate.slice(1)) - 183;
      const carrier = { x: source.x, y: source.y, id: state.nextId++ };
      chainLightning(state, tower.id, carrier, enemy, 2000, 5 + index, [400, 800, 1800][index] * .8, "N0" + (58 + index));
    }
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  const hero = tower?.hero;
  if (tower && source === tower && kind === "weapon" && /^n18[6-9]$/.test(sourceTemplate)) {
    dragonCrush(state, tower);
    if (state.phase !== "running" || enemy.hp <= 0) return;
    amount = 0;
  }
  if (tower && source === tower && kind === "weapon" && amount > 0 && (tower.treeGrab?.cleaveUntilUs ?? 0) > now) {
    treeGrabCleave(state, tower, enemy, amount);
    if (state.phase !== "running") return;
  }
  if (kind === "magic") {
    if (amount !== 0) {
      const hasRing = ownedGear.some(item => item.itemId === "i161");
      if ((hasRing || ownedGear.some(item => item.itemId === "i119")) && rollPercent(state) <= (hasRing ? 25 : 10)) {
        amount *= hasRing ? 2 : 1.4;
      }
      amount *= Math.max(1, ...ownedGear.map(item => dagonMultiplier.get(item.itemId) ?? 1));
      if (magicResistance > 0 && magicResistance < 1) {
        const primary = ownedGear.some(item => item.itemId === "i200") ? .9 : 1;
        const secondary = ownedGear.some(item => item.itemId === "i265") ? .65 : ownedGear.some(item => item.itemId === "i308") ? .75 : 1;
        amount *= (1 - magicResistance * primary * secondary) / (1 - magicResistance);
      }
    }
    if (ownedGear.some(item => item.itemId === "i134")) amount *= 1.32;
    const amplification = hero?.ranks.A021 ?? 0;
    if (amplification > 0) amount *= [1.12, 1.15, 1.20, 1.25, 1.32, 1.40][amplification - 1] ?? 0;
    const nightmareRank = state.structures.reduce((rank, caster) => {
      const form = caster.hero?.divineForm;
      if (caster.pending || form?.id !== "P218" || magicImmune(enemy)) return rank;
      const radius = divineField(form.id, "Area", form.stars);
      return (caster.x - enemy.x) ** 2 + (caster.y - enemy.y) ** 2 <= radius ** 2 ? Math.max(rank, Math.ceil(form.stars / 2)) : rank;
    }, 0);
    if (nightmareRank) amount *= [1.12, 1.14, 1.16, 1.18, 1.20][nightmareRank - 1];
  } else if ((kind === "weapon" || kind === "physical") && ownedGear.some(item => item.itemId === "i132")) {
    amount *= 1.25;
  }
  if (kind === "weapon" && ownedGear.some(item => item.itemId === "i267")) {
    const armor = armorAt(state, enemy);
    if (armor > 0) {
      const ignored = source === tower && hero?.ranks.A026 ? .175 : .35;
      amount *= (1 + .018 * armor) / (1 + .018 * armor * (1 - ignored));
    }
  }
  if (tower && amount !== 0 && ownedGear.some(item => item.itemId === "i263")) {
    amount *= 1.18;
    if (kind === "divine") {
      if (rollPercent(state) <= 20) amount *= 2.4;
    } else if (amount > 0) {
      damageEnemy(state, tower, tower.templateId, enemy, amount * .15, "divine", "i263");
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (tower && hero && amount > 0) {
    const stats = combatAttributes(state, tower);
    const bonus = kind === "weapon" || kind === "physical" ? stats.STR * 0.0006 : kind === "magic" ? stats.INT * 0.001 : stats.AGI * 0.0005;
    amount *= 1 + bonus;
    if (hero.ranks.P000) amount *= 1.4;
    amount *= divineDamageFactor(hero.divineForm, kind);
  }
  if (now < (enemy.doomUntilUs ?? 0)) amount *= 1.1;
  if (tower && source === tower && sourceTemplate === tower.templateId && hasBattleBanner(state, tower)) amount *= 1.2;
  if (tower) amount *= talentHeroDamageFactor(state, tower.id);
  if (tower && sourceTemplate === "q010" && skillId === "A020" && amount > enemy.hp) {
    const excess = amount - enemy.hp;
    for (const bystander of [...state.enemies]) {
      if (state.phase !== "running") return;
      if ((bystander.x - enemy.x) ** 2 + (bystander.y - enemy.y) ** 2 <= 600 ** 2 &&
          targetable(bystander, ["ground", "air", "structure"], now)) {
        damageEnemy(state, tower, tower.templateId, bystander, excess, "magic", "A020");
      }
    }
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  startEnemyReaction(state, enemy, tower, ["N511", "N513", "N514", "N710", "N581"]);
  if (enemy.abilities?.includes("N533") && rollPercent(state) <= 40 && sourceTemplate !== "q025") amount = 0;
  if (enemy.abilities?.includes("N577")) amount *= .6;
  startEnemyReaction(state, enemy, tower, ["N515"]);
  if (enemy.abilities?.includes("N516")) {
    const factor = Math.min(enemy.frost?.factor ?? 1, enemy.coldArrow?.factor ?? 1) *
      (enemy.speedBuff ?? 1) * (enemy.windwalkSpeed ?? 1);
    const increase = Math.floor(300 * amount / (enemy.maxHp ?? enemy.hp));
    if (factor > 0 && enemy.speed * factor + increase <= 600) enemy.speed += increase / factor;
  }
  startEnemyReaction(state, enemy, tower, ["N517", "N518", "N527", "N519"]);
  if (source && (source !== tower || sourceTemplate === tower?.templateId) && now < (source.weakenedUntilUs ?? 0)) amount *= .5;
  startEnemyReaction(state, enemy, tower, ["N520"]);
  if (enemy.abilities?.includes("N709")) {
    const ratio = enemy.hp / (enemy.maxHp ?? enemy.hp);
    const threshold = [.12, .21, .31, .41, .51, .61, .71, .81, .91].findIndex(value => ratio < value);
    enemy.berserkerResistanceRank = threshold < 0 ? 1 : 10 - threshold;
  }
  startEnemyReaction(state, enemy, tower, ["N522"]);
  const impactOrigin = temporaryDamageSources.has(sourceTemplate) ? tower : source;
  if (impactOrigin && enemy.abilities?.includes("N525")) {
    const destination = enemy.path?.[0] ?? map.waypoints[enemy.waypoint];
    const degrees = (x: number, y: number) => (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const difference = Math.abs(degrees(destination.x - enemy.x, destination.y - enemy.y) -
      degrees(impactOrigin.x - enemy.x, impactOrigin.y - enemy.y));
    amount *= impactOrigin.x === enemy.x && impactOrigin.y === enemy.y ? .9 :
      difference > 130 && difference < 230 ? .4 : difference > 60 && difference < 300 ? .7 : .9;
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
  startEnemyReaction(state, enemy, tower, ["N526", "N575", "N528", "N530", "N531", "N532", "N571", "N576"]);
  if (enemy.abilities?.includes("N536") && amount !== 0) {
    if (enemy.shellDamage !== undefined && amount > enemy.hp) delete enemy.shellDamage;
    else {
      enemy.shellDamage = (enemy.shellDamage ?? 0) + amount;
      if (enemy.shellDamage > (enemy.maxHp ?? enemy.hp) * .1) {
        enemy.shellDamage = 0;
        clearEnemyDebuffs(state, enemy);
      }
    }
  }
  if (enemy.abilities?.includes("N574")) purgeEnemyDebuffs(state, enemy, amount, "N574");
  startEnemyReaction(state, enemy, tower, ["N711", "N712"]);
  if (enemy.overdraftArmor && sourceTemplate !== "q025") amount *= (100 - Math.min(99, (kind === "magic" ? 3.2 : kind === "divine" ? 3.7 : 4.4) * enemy.overdraftArmor)) / 100;
  if (enemy.abilities?.includes("N579")) purgeEnemyDebuffs(state, enemy, amount, "N579");
  if (enemy.welfare) {
    const provisionTower = tower && towerLevels.get(tower.templateId)?.bindings.some(binding => binding.skillId === "N159");
    state.welfareDamage = (state.welfareDamage ?? 0) + amount * (illusion ? .8 : 1) * (provisionTower ? 0.2 : 1) * (kind === "magic" ? 1.4 : kind === "divine" ? 1 : 0.58);
    return;
  }
  if (amount > enemy.hp && sourceTemplate !== "q025") {
    if (enemy.abilities?.includes("N521")) {
      if (enemy.abilities.includes("T045") && now >= Math.max(enemy.spellCastingUntilUs ?? 0,
        enemy.stunUntilUs ?? 0, enemy.hexUntilUs ?? 0, enemy.doomUntilUs ?? 0, enemy.graveSpellReadyUs ?? 0)) {
        enemy.graveCastUs = now;
        enemy.graveSpellReadyUs = now + us(1);
      }
      enemy.abilities = enemy.abilities.filter(id => id !== "N521");
      enemy.graveUntilUs = state.queue.nowUs + us(6);
      amount = 0;
    } else if (now < (enemy.graveUntilUs ?? 0)) {
      enemy.hp = 1;
      amount = 0;
    }
  }
  if (amount > enemy.hp && enemy.abilities?.some(id => id === "N582" || id === "N583" || id === "N584")) {
    const slow = enemy.abilities.includes("N584") ? 1.2 : .4;
    amount = 0;
    enemy.hp = enemy.maxHp ?? enemy.hp;
    recordBattleAnimation(state, enemy, enemy.unitId, "revive");
    enemy.abilities = enemy.abilities.filter(id => id !== "N582" && id !== "N583" && id !== "N584");
    for (const target of [...state.structures, ...(state.summons ?? [])]) {
      if (target.pending || (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 > 1000 ** 2) continue;
      target.thunderClap = { amount: slow, untilUs: now + us(4) };
      scheduleWeaponRateEnd(state, target, "thunderClap", target.thunderClap.untilUs);
    }
  }
  const hpBefore = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  if (source && enemy.hp < hpBefore) {
    const hits = state.recentHits ??= [];
    if (hits.length >= 64) hits.shift();
    const damageEvents = state.damageEvents ??= [];
    while (damageEvents.length && now - damageEvents[0].atUs > us(1.2)) damageEvents.shift();
    damageEvents.push({ atUs: now, x: enemy.x, y: enemy.y, amount: hpBefore - enemy.hp });
    hits.push({ atUs: now, x: enemy.x, y: enemy.y, targetId: enemy.id, casterId: source.id, ownerId: tower?.id,
      sourceTemplate, amount: hpBefore - enemy.hp, ...(enemy.hp === 0 ? { deadUnitId: enemy.unitId } : {}) });
  }
  if (enemy.hp !== 0) return;
  if (enemy.unitId === "mBOS") {
    state.finalHit = { towerId: tower?.id, sourceId: source?.id, sourceTemplate, targetId: enemy.id,
      amount, hpBefore, skillId, atUs: state.queue.nowUs };
  }
  removeDeadEnemy(state, enemy.id, source?.id, tower?.id ?? source?.id);
}

function recordBattleAnimation(state: Match, point: Point, unitId: string,
  kind: NonNullable<Match["battleAnimations"]>[number]["kind"], target?: Point, delayUs = 0) {
  const effects = state.battleAnimations ??= [];
  if (effects.length >= 64) effects.shift();
  effects.push({ x: point.x, y: point.y, unitId, kind, atUs: state.queue.nowUs + delayUs,
    ...(target ? { target: { x: target.x, y: target.y } } : {}) });
}

function dragonCrush(state: Match, tower: Construction) {
  const tier = Number(tower.templateId.slice(1)) - 186;
  const weapon = weapons[tower.templateId][0];
  const gear = towerGear(state, tower);
  const rate = rawWeaponRate(state, tower, gear, combatAttributes(state, tower).AGI);
  const interval = weapon.cooldown - (gear.some(item => item.itemId === "i304") ? 0.2 : 0);
  const radius = Math.min(1200, 50 + 260 * interval / rate);
  if (!Number.isFinite(radius) || radius < 0) return;
  const raw = averageWeaponField(state, tower, weapon, gear) * [0.8, 1, 1.2, 1.4][tier];
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
  const divineArmor = state.structures.reduce((debuff, tower) => {
    const form = tower.hero?.divineForm;
    if (tower.pending || form?.id !== "P219" || (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 > 800 ** 2) return debuff;
    return Math.min(debuff, divineField(form.id, "DataA", form.stars));
  }, 0);
  const wave = enemy.waveArmor;
  const howl = enemy.howlArmor;
  return (enemy.armor ?? 0) + divineArmor - aura - (howl && howl.expiresUs > state.queue.nowUs ? howl.amount : 0) - (wave && wave.expiresUs > state.queue.nowUs ? wave.amount : 0) + (buff && buff.untilUs > state.queue.nowUs ? buff.value : 0) -
    (corrosion && corrosion.untilUs > state.queue.nowUs ? corrosion.value : 0);
}

function syncEnemyMana(state: Match, enemy: Enemy) {
  if (enemy.manaMax === undefined || enemy.manaTickUs === undefined) return;
  const regeneration = unitBalance.get(enemy.unitId)?.regenMana ?? 0;
  const now = state.queue.nowUs;
  enemy.mana = Math.min(enemy.manaMax, enemy.mana + regeneration * (now - enemy.manaTickUs) / 1_000_000);
  enemy.manaTickUs = now;
}

function startEnemyReaction(state: Match, enemy: Enemy, attacker: Construction | undefined, skills: EnemySpellId[]) {
  const now = state.queue.nowUs;
  if (enemy.hexSourceId !== undefined || enemy.leashes?.length || now < Math.max(enemy.stunUntilUs ?? 0, enemy.doomUntilUs ?? 0,
    enemy.spellCastingUntilUs ?? 0, enemy.hexUntilUs ?? 0)) return;
  for (const skill of skills) {
    if (!enemy.abilities?.includes(skill)) continue;
    if (skill === "N514" && enemy.hp >= (enemy.maxHp ?? enemy.hp) * 0.4) continue;
    if (skill === "N522" && (!attacker || (enemy.x - attacker.x) ** 2 + (enemy.y - attacker.y) ** 2 >= 800 ** 2)) continue;
    const life = enemy.hp / (enemy.maxHp ?? enemy.hp);
    if ((skill === "N530" || skill === "N576") && life >= .3 ||
         skill === "N710" && life >= .5 || skill === "N712" && life >= .7 ||
         (skill === "N531" || skill === "N532" || skill === "N571") && life >= .7 ||
         skill === "N581" && life >= .5) continue;
    if ((skill === "N526" || skill === "N575") && (enemy.barrier?.untilUs ?? 0) > now) continue;
    const spec = enemySpells[skill];
    if (now < (enemy.spellReady?.[skill] ?? 0) || enemy.mana < spec.cost) continue;
    const point = attacker ? { x: attacker.x, y: attacker.y } : { x: enemy.x, y: enemy.y };
    const weaknessTarget = skill === "N519" ? weaknessTargets(state).find(target =>
      target.untilUs <= now && (target.point.x - enemy.x) ** 2 + (target.point.y - enemy.y) ** 2 <= 800 ** 2) : undefined;
    if (skill === "N519" && (!weaknessTarget || weaknessTarget.pending)) continue;
    enemy.spellCastingUntilUs = now + us(spec.cast);
    if (spec.cast === 0) finishEnemyReaction(state, enemy.id, skill, point);
    else scheduleEvent(state.queue, us(spec.cast), { type: "enemy-cast", enemyId: enemy.id, skill, point,
      ...(weaknessTarget ? { targetId: weaknessTarget.id } : {}) });
    break;
  }
}

function weaknessTargets(state: Match) {
  return [
    { id: -1, point: state.worker, untilUs: state.workerWeakUntilUs ?? 0, pending: false,
      apply(untilUs: number) { state.workerWeakUntilUs = untilUs; } },
    { id: circleId, point: circle, untilUs: state.circleWeakUntilUs ?? 0, pending: false,
      apply(untilUs: number) { state.circleWeakUntilUs = untilUs; } },
    ...[...state.structures, ...(state.summons ?? [])].sort((a, b) => a.id - b.id).map(tower => ({
      id: tower.id, point: tower, untilUs: tower.weakAttackUntilUs ?? 0, pending: !!tower.pending,
      apply(untilUs: number) { tower.weakAttackUntilUs = untilUs; },
    })),
  ];
}

function finishEnemyReaction(state: Match, enemyId: number, skill: EnemySpellId, point: Point, targetId?: number) {
  const enemy = state.enemies.find(entry => entry.id === enemyId);
  const now = state.queue.nowUs;
  if (!enemy || enemy.hp <= 0 || enemy.hexSourceId !== undefined || enemy.leashes?.length ||
      now < Math.max(enemy.stunUntilUs ?? 0, enemy.doomUntilUs ?? 0, enemy.hexUntilUs ?? 0)) return;
  syncEnemyMana(state, enemy);
  const spell = enemySpells[skill];
  if (enemy.mana < spell.cost || (skill === "N522" && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 > 900 ** 2)) return;
  const weakTarget = skill === "N519" ? weaknessTargets(state).find(target => target.id === targetId) : undefined;
  if (skill === "N519" && (!weakTarget || weakTarget.pending ||
      (weakTarget.point.x - enemy.x) ** 2 + (weakTarget.point.y - enemy.y) ** 2 > 800 ** 2)) return;
  if (skill !== "N518" && skill !== "N527") {
    delete enemy.windwalk;
    delete enemy.windwalkSpeed;
  }
  enemy.mana -= spell.cost;
  enemy.lastSpellUs = now;
  (enemy.spellReady ??= {})[skill] = now + us(spell.cooldown);
  if (skill === "N511") {
    enemy.armorBuff = { value: 9999, untilUs: now + us(2.5) };
    const eligible = [...state.structures, ...(state.summons ?? [])].filter(tower => !tower.pending &&
      now >= Math.max(tower.heroCastUntilUs ?? 0, tower.stunnedUntilUs ?? 0) && canSeeEnemy(state, enemy) &&
      weapons[tower.templateId]?.some(weapon => weaponTargetable(enemy, weapon, now)))
      .map(tower => ({ tower, distance: (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 }))
      .filter(entry => entry.distance <= 450 ** 2).sort((a, b) => a.distance - b.distance || a.tower.id - b.tower.id);
    for (const { tower } of eligible.slice(0, 10)) {
      if (tower.summon?.independent) tower.wolfOrder = { type: "attack", targetId: enemy.id, path: [] };
      else tower.tauntedTarget = enemy.id;
      if (tower.attack?.targetId !== enemy.id) interruptWeapon(state, tower);
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
  } else if (skill === "N518" || skill === "N527") {
    const duration = skill === "N518" ? 20 : 3;
    const speed = skill === "N518" ? 1.1 : 3;
    enemy.windwalk = { invisibleUs: now + us(skill === "N518" ? .8 : .5), endUs: now + us(duration), speed };
    enemy.windwalkSpeed = Math.min(speed, 600 / enemy.speed);
    scheduleEvent(state.queue, us(duration), { type: "enemy-speed-expire", enemyId });
  } else if (skill === "N519") {
    weakTarget?.apply(now + us(8));
  } else if (skill === "N571") {
    enemy.speedBuff = 1.4;
    enemy.speedBuffUntilUs = enemy.evasionUntilUs = now + us(6);
    scheduleEvent(state.queue, us(6), { type: "enemy-speed-expire", enemyId });
  } else if (skill === "N530") {
    enemy.hp = Math.min(enemy.hp + 9_000_000, enemy.maxHp ?? enemy.hp);
  } else if (skill === "N531" || skill === "N532") {
    enterEnemyForm(state, enemy, skill === "N531");
  } else if (skill === "N576") {
    const egg = spawn(state, { unitId: "b138", layer: "fly", speed: 0, radius: 1, points: 1, hp: 33, mana: 0,
      armor: null, wave: enemy.wave, abilities: ["N534"], eggParentId: enemy.id }, false, enemy);
    enemy.phaseUntilUs = enemy.stunUntilUs = now + us(6);
    scheduleEvent(state.queue, us(6), { type: "enemy-egg-end", enemyId, eggId: egg.id });
  } else if (skill === "N710") {
    stunNearbyTowers(state, enemy, 1000, 3, 1.8);
  } else if (skill === "N711") {
    const unitId = rollPercent(state) < 50 ? "b143" : "b142";
    const stats = unitBalance.get(unitId)!;
    const child = spawn(state, { unitId, layer: enemy.layer, speed: enemy.speed, radius: stats.collision ?? 1, points: 5,
      hp: (enemy.maxHp ?? enemy.hp) * .3, mana: 0, armor: (stats.def ?? 0) + armorAt(state, enemy) / 2,
      wave: enemy.wave, challengeId: enemy.challengeId }, false, enemy);
    child.path = enemy.path?.map(point => ({ ...point }));
    scheduleEvent(state.queue, us(30), { type: "enemy-summon-expire", enemyId: child.id });
  } else if (skill === "N712") {
    const maximum = enemy.maxHp ?? enemy.hp;
    let healing = maximum * .2;
    for (const ally of state.enemies) {
      if (ally.hp <= 0 || ally.welfare || ally.unitId === "mBOS" || challengeTemplates.some(template => template.unitId === ally.unitId) ||
          (ally.x - enemy.x) ** 2 + (ally.y - enemy.y) ** 2 > 1500 ** 2) continue;
      healing += ally.hp * .5;
      recordBattleAnimation(state, enemy, enemy.unitId, "heal-link", ally);
    }
    enemy.hp = Math.min(maximum, enemy.hp + healing);
  } else if (skill === "N528" || skill === "N581") {
    stunNearbyTowers(state, enemy, skill === "N528" ? 1500 : 1200, skill === "N528" ? 2 : 3, skill === "N528" ? 1.5 : 3);
  } else {
    const center = skill === "N514" ? enemy : point;
    const radius = skill === "N514" ? 1000 : 20;
    for (const tower of state.structures) {
      if (tower.pending || (tower.x - center.x) ** 2 + (tower.y - center.y) ** 2 > radius ** 2) continue;
      const duration = skill === "N514" ? tower.hero ? 1.2 : 1.8 : tower.hero ? 0.5 : 1;
      tower.stunnedUntilUs = Math.max(tower.stunnedUntilUs ?? 0, now + us(duration));
      interruptWeapon(state, tower);
      stopTowerCast(state, tower);
    }
  }
}

function stunNearbyTowers(state: Match, center: Point, radius: number, normal: number, hero: number) {
  for (const tower of [...state.structures, ...(state.summons ?? [])]) {
    if (tower.pending || (tower.x - center.x) ** 2 + (tower.y - center.y) ** 2 > radius ** 2) continue;
    tower.stunnedUntilUs = Math.max(tower.stunnedUntilUs ?? 0, state.queue.nowUs + us(tower.hero ? hero : normal));
    interruptWeapon(state, tower);
    stopTowerCast(state, tower);
  }
}

function purgeEnemyDebuffs(state: Match, enemy: Enemy, amount: number, skill: "N574" | "N579") {
  const field = skill === "N579" ? "bossPurgeDamage" : "purgeDamage";
  if (amount === 0) return;
  if (enemy[field] !== undefined && amount > enemy.hp) {
    delete enemy[field];
    return;
  }
  enemy[field] = (enemy[field] ?? 0) + amount;
  const threshold = skill === "N579" ? (enemy.maxHp ?? enemy.hp) * .3 : 20_000;
  if (enemy[field] <= threshold) return;
  enemy[field] = 0;
  clearEnemyDebuffs(state, enemy);
}

function clearEnemyDebuffs(state: Match, enemy: Enemy) {
  delete enemy.frost;
  delete enemy.coldArrow;
  endEnemyLeashes(state, enemy);
  delete enemy.waveArmor;
  delete enemy.howlArmor;
  delete enemy.clapSlow;
  delete enemy.hexUntilUs;
  delete enemy.hexSourceId;
  delete enemy.doomUntilUs;
}

function endEnemyLeashes(state: Match, enemy: Enemy) {
  const leashes = enemy.leashes;
  if (leashes?.length) {
    for (const tower of state.structures) {
      if (tower.leashToken !== undefined && leashes.includes(tower.leashToken)) stopTowerCast(state, tower);
    }
  }
  delete enemy.leashes;
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
  if (primary && shot.weapon.kind === "normal" && enemy.armorBuff?.value === 40 && enemy.armorBuff.untilUs > state.queue.nowUs) {
    const attacker = shot.summon ? firingUnit(state, shot.summon.id) : tower;
    if (attacker) {
      attacker.armorFrostUntilUs = state.queue.nowUs + us(1);
      scheduleWeaponRateEnd(state, attacker, "armorFrostUntilUs", attacker.armorFrostUntilUs);
    }
  }
  if (shot.summon) {
    const { id, banner } = shot.summon;
    const unit = firingUnit(state, id);
    const source = unit ?? { ...(shot.summon.point ?? shot.point), id };
    const extra = shot.summon.illusion && primary && !shot.secondary ? (shot.fixedHitBonus ?? 0) * .4 : 0;
    damageEnemy(state, tower?.pending ? undefined : tower, shot.sourceTemplate, enemy, physicalDamage((shot.raw + extra) * (banner ? 1.2 : 1) * multiplier,
      shot.weapon.attackType, armorAt(state, enemy), !!enemy.welfare), "weapon", shot.summon.skillId ?? "A094", source,
      shot.summon.illusion, unit ? undefined : shot.summon.contract);
    return;
  }
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
    damageEnemy(state, undefined, shot.sourceTemplate, enemy,
      physicalDamage(damage * multiplier, shot.weapon.attackType, armorAt(state, enemy), !!enemy.welfare), "weapon", tower.summon.skillId, tower);
    return;
  }
  let damage = (shot.raw + (primary && !shot.secondary ? (shot.orbBonus ?? 0) + (shot.fixedHitBonus ?? 0) : 0)) * multiplier;
  if (primary && !shot.secondary) {
    for (const itemId of shot.attackEquipment ?? []) {
      if (itemId === "i141" && rollPercent(state) <= 30) damage += 400;
      if (itemId === "i144" && rollPercent(state) <= 20) damage += 100;
    }
  }
  if (/^n16[0-3]$/.test(shot.sourceTemplate) &&
      !(enemy.abilities?.includes("N534") && unitBalance.get(enemy.unitId)?.type?.split(",").includes("sapper"))) {
    damage *= [1.2, 1.4, 1.6, 1.8][Number(shot.sourceTemplate.slice(1)) - 160];
  }
  if (/^n14[4-6]$/.test(shot.sourceTemplate) &&
      targetable(enemy, ["ground", "structure", "mechanical"], state.queue.nowUs) && rollPercent(state) <= 30) {
    if (unitTargetType.get(enemy.unitId) !== "structure" && !mechanicalEnemy(enemy)) {
      stunEnemy(state, enemy, us(resistantToControl(enemy) ? .01 : .1));
    }
    damage += [260, 550, 850][Number(shot.sourceTemplate.slice(1)) - 144];
  }
  if (primary && shot.corrosion && (!enemy.corrosion || enemy.corrosion.untilUs <= state.queue.nowUs ||
      shot.corrosion >= enemy.corrosion.value)) {
    enemy.corrosion = { value: shot.corrosion, untilUs: state.queue.nowUs + us(5) };
  }
  if (primary && shot.frost && !magicImmune(enemy)) {
    enemy.coldArrow = { factor: 1 - shot.frost, expiresUs: state.queue.nowUs + us(3) };
    scheduleEvent(state.queue, us(3), { type: "frost-expire", enemyId: enemy.id });
  }
  damageEnemy(state, tower, shot.sourceTemplate, enemy,
    physicalDamage(damage, shot.weapon.attackType, armorAt(state, enemy), !!enemy.welfare), "weapon");
}

function interruptEnemyCast(state: Match, enemy: Enemy) {
  if (enemy.spellCastingUntilUs !== undefined) {
    for (const { timerId, payload } of [...state.queue.pending]) {
      if (payload.type === "enemy-cast" && payload.enemyId === enemy.id) cancelEvent(state.queue, timerId);
    }
    delete enemy.spellCastingUntilUs;
  }
}

function stunEnemy(state: Match, enemy: Enemy, durationUs: number) {
  const now = state.queue.nowUs;
  enemy.stunUntilUs = Math.max(enemy.stunUntilUs ?? 0, now + durationUs);
  interruptEnemyCast(state, enemy);
  scheduleEvent(state.queue, enemy.stunUntilUs - now, { type: "stun-expire", enemyId: enemy.id });
}

function avalanche(state: Match, { towerId, point, rank, skillId, source }: Extract<MatchEvent, { type: "avalanche" }>) {
  const tower = firingUnit(state, towerId);
  if (!source && !tower) return;
  const actual = source ?? { x: tower!.x, y: tower!.y, id: state.nextId++ };
  const eligible = (enemy: Enemy) => targetable(enemy, ["ground", "structure", "mechanical"], state.queue.nowUs) &&
    !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Aloc" || id === "Avul");
  const targets = state.enemies.filter(enemy => eligible(enemy) &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 300 ** 2).sort((left, right) => left.id - right.id);
  for (const enemy of targets) {
    if (state.phase !== "running") break;
    if (!state.enemies.includes(enemy) || !eligible(enemy)) continue;
    if (unitTargetType.get(enemy.unitId) !== "structure" && !mechanicalEnemy(enemy)) {
      const durations = resistantToControl(enemy) ? [.1, .3, .4, .5, .6, .8] : [.4, .6, .8, 1, 1.2, 1.5];
      stunEnemy(state, enemy, us(durations[rank - 1]));
    }
    const owner = firingUnit(state, towerId);
    damageEnemy(state, owner, "q001", enemy, [150, 275, 420, 650, 860, 1120][rank - 1] * .8, "magic", skillId, actual);
  }
}

const immolationSources = new Map(["n021", "n022", "n023", "n024", "n025"]
  .map((id, rank) => [id, { skillId: "N" + (127 + rank), damage: [60, 100, 150, 200, 300][rank] }] as const));

function tickImmolation(state: Match, towerId: number) {
  const tower = state.structures.find(entry => entry.id === towerId);
  const effect = tower && immolationSources.get(tower.templateId);
  if (!tower || !effect || tower.pending && !tower.pending.upgradeTo) return;
  scheduleEvent(state.queue, us(1), { type: "immolation", towerId });
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 600 ** 2)
    .sort((left, right) => left.id - right.id);
  for (const enemy of targets) {
    if (state.phase !== "running" || !state.structures.includes(tower)) break;
    if (!state.enemies.includes(enemy)) continue;
    damageEnemy(state, tower, tower.templateId, enemy, effect.damage * 0.8, "magic", effect.skillId);
  }
}

function rollWeaponCritical(state: Match, shot: WeaponShot, main: Enemy | undefined) {
  const crit = shot.secondary ? undefined : criticalMultipliers.get(shot.sourceTemplate);
  let multiplier = main && crit && rollPercent(state) <= 20 ? crit : 1;
  let sureHit = false;
  let fixedBonus = 0;
  if (main && shot.divineCritical && !shot.secondary && rollPercent(state) <= shot.divineCritical.chance) {
    multiplier = Math.max(multiplier, shot.divineCritical.multiple);
  }
  if (main && !shot.secondary) {
    const criticalItems = [
      { id: "i141", chance: 70, multiple: 1, bonus: 1, sureHit: true },
      { id: "i213", chance: 20, multiple: 2, bonus: 0, sureHit: false },
      { id: "i215", chance: 25, multiple: 3.8, bonus: 0, sureHit: true },
      { id: "i322", chance: 70, multiple: 1, bonus: 1, sureHit: true },
      { id: "i306", chance: 50, multiple: 1, bonus: 1, sureHit: true },
    ];
    for (const profile of criticalItems) {
      for (const item of shot.attackEquipment ?? []) {
        if (item !== profile.id || rollPercent(state) > profile.chance) continue;
        multiplier = Math.max(multiplier, profile.multiple);
        fixedBonus += profile.bonus;
        sureHit ||= profile.sureHit;
      }
    }
  }
  return { multiplier, sureHit, fixedBonus };
}

function finishWeapon(state: Match, shot: WeaponShot) {
  const { weapon } = shot;
  if (weapon.kind === "artillery") recordBattleAnimation(state, shot.destination, shot.sourceTemplate, "artillery-impact");
  const main = state.enemies.find(enemy => enemy.id === shot.targetId && weaponTargetable(enemy, weapon, state.queue.nowUs));
  const { multiplier, sureHit, fixedBonus } = shot.artilleryCritical ?? rollWeaponCritical(state, shot, main);
  shot.raw *= multiplier;
  shot.fixedHitBonus = fixedBonus;
  if (!weapon.splash) {
    if (main && (sureHit || !ordinaryMiss(state, main))) applyWeaponDamage(state, shot, main, 1);
    return;
  }
  const ring = (point: Point) => weapon.splash!.find(([radius]) =>
    (point.x - shot.destination.x) ** 2 + (point.y - shot.destination.y) ** 2 <= radius ** 2);
  const artilleryVictims = weapon.kind === "artillery" ? state.enemies.filter(enemy =>
    enemy.id !== main?.id && weaponTargetable(enemy, weapon, state.queue.nowUs, weapon.splashTargets!) && ring(enemy))
    .map(enemy => enemy.id).sort((left, right) => left - right) : undefined;
  if (shot.objectId !== undefined) {
    const object = artilleryObject(state, shot.objectId);
    const band = object && ring(object.point);
    if (object && band && shot.raw > 0) {
      object.hp = Math.max(0, groundObjectLife(object) - shot.raw * band[1]);
      if (object.hp === 0) {
        if ("itemId" in object) removeItem(state, object);
        else state.cards.splice(state.cards.indexOf(object), 1);
        const approach = state.approach?.command;
        if (approach && (approach.action.type === "pick-up-item" && approach.action.itemId === object.id ||
            approach.action.type === "pick-up-card" && approach.action.cardId === object.id)) {
          recordResult(state, approach, { ok: false, reason: "missing" });
          state.approach = null;
        }
      }
    }
  }
  const mainBand = main && ring(main);
  if (main && mainBand) {
    if (weapon.kind === "artillery") {
      if (sureHit || !shot.artilleryMiss) applyWeaponDamage(state, shot, main, mainBand[1]);
    } else {
      if (!sureHit && ordinaryMiss(state, main)) return;
      applyWeaponDamage(state, shot, main, 1);
    }
  }
  if (artilleryVictims) {
    for (const id of artilleryVictims) {
      if (state.phase !== "running") break;
      const enemy = state.enemies.find(entry => entry.id === id);
      if (!enemy || !weaponTargetable(enemy, weapon, state.queue.nowUs, weapon.splashTargets!)) continue;
      const band = ring(enemy);
      if (band) applyWeaponDamage(state, shot, enemy, band[1], false);
    }
    return;
  }
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (enemy.id === main?.id || !weaponTargetable(enemy, weapon, state.queue.nowUs, weapon.splashTargets!)) continue;
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
  if (!shot.summon && !firingUnit(state, shot.towerId)) return;
  if (shot.weapon.homing) {
    const target = state.enemies.find(enemy => enemy.id === shot.targetId && weaponTargetable(enemy, shot.weapon, state.queue.nowUs));
    if (!target) {
      if (shot.weapon.splash) finishWeapon(state, shot);
      return;
    }
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

function fireWeapon(state: Match, towerId: number, targetId: number | undefined, slot: number, startedUs?: number) {
  const tower = firingUnit(state, towerId);
  if (!tower?.attack?.winding || startedUs !== undefined && tower.attack.startedUs !== startedUs) return;
  tower.attack.winding = false;
  const timing = tower.attack.timing;
  if (timing) {
    delete timing.windup;
    if (!timing.cooldown) scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId });
  }
  if (tower.pending) return;
  const target = state.enemies.find(enemy => enemy.id === targetId);
  const weapon = weapons[tower.templateId]?.find(entry => entry.slot === slot);
  if (!weapon) return;
  const gear = towerGear(state, tower);
  const manual = tower.attack.manualFlame ? flameArrow(tower) : undefined;
  const artillery = tower.attack.artillery;
  const point = artillery && weapon.kind === "artillery" ? artilleryPoint(state, tower, weapon, artillery) : target;
  if (!point || !artillery && (!target || !canSeeEnemy(state, target) ||
      (tower.attack.manualFlame ? !manual || !flameWeapon(state, tower, target, manual.range) :
        !inWeaponRange(tower, target, weapon, weaponRange(weapon, gear), true, state.queue.nowUs)))) return;
  if (manual?.cost) {
    syncMana(state, tower);
    if (tower.mana! < manual.cost) return;
    tower.mana! -= manual.cost;
  }
  if (manual && !manual.cost) {
    triggerSpellEquipment(state, tower);
    if (state.phase !== "running") return;
  }
  if (timing) timing.backswing = scheduleWeaponPhase(state, tower, "backswing", timing.recoveryUs, weaponScheduleRate(timing.rawRate));
  const hero = tower.hero;
  const { base, percent, fixed, banner } = weaponContributions(state, tower, weapon, gear);
  const form = hero?.divineForm;
  const illusion = tower.summon?.illusion;
  const amount = (base + rollDice(state, weapon.dice, weapon.sides)) * (1 + percent) + fixed;
  const frost = /^n00[6-9]$|^n010$/.test(tower.templateId)
    ? [0.06, 0.08, 0.10, 0.12, 0.15][Number(tower.templateId.slice(1)) - 6] : undefined;
  const shot: WeaponShot = {
    towerId: tower.summon?.independent ? towerId : tower.summon?.ownerId ?? towerId,
    ...(frost === undefined ? {} : { frost }),
    sourceTemplate: tower.templateId, weapon, raw: amount * (tower.summon?.illusion ? .4 : 1),
    point: { x: tower.x, y: tower.y }, destination: { x: point.x, y: point.y },
  };
  if (tower.summon && !tower.summon.independent) {
    const { skillId } = tower.summon;
    shot.summon = { id: tower.id, point: { ...shot.point }, banner: !illusion && !!banner, skillId, illusion };
  }
  if (targetId !== undefined) shot.targetId = targetId;
  if (artillery && "objectId" in artillery) shot.objectId = artillery.objectId;
  tower.lastAttackUs = state.queue.nowUs;
  tower.lastAttackTarget = { ...shot.destination };
  if (!target) {
    scheduleWeaponImpact(state, shot);
    return;
  }
  if (/^n18[3-5]$/.test(tower.templateId)) {
    recordBattleAnimation(state, tower, tower.templateId, "weapon-link", target, us(.25));
  }
  const attackEquipment = gear.filter(item => ["i141", "i144", "i213", "i215", "i306", "i322"].includes(item.itemId));
  if (illusion) shot.attackEquipment = tower.summon?.criticalItems;
  else if (attackEquipment.length) shot.attackEquipment = attackEquipment.map(item => item.itemId);
  if (form?.id === "P213") shot.divineCritical = { chance: divineField(form.id, "DataA", form.stars),
    multiple: divineField(form.id, "DataB", form.stars) };
  const corrosion = targetable(target, ["ground", "air", "ward"], state.queue.nowUs) ?
    gear.some(item => item.itemId === "i188") ? 70 : gear.some(item => item.itemId === "i186") ? 25 : undefined : undefined;
  const flame = flameArrow(tower);
  if (manual) shot.orbBonus = manual.bonus;
  else if (corrosion) shot.corrosion = corrosion;
  else if (flame && flameTargetable(state, tower, target, flame.range)) {
    if (tower.attack.flameBonus) shot.orbBonus = tower.attack.flameBonus;
    else if (flame.cost && tower.flameArrows !== false) {
      syncMana(state, tower);
      if (tower.mana! >= flame.cost) {
        tower.mana! -= flame.cost;
        shot.orbBonus = flame.bonus;
      }
    }
  }
  if (shot.orbBonus) shot.weapon = { ...weapon, homing: true, speed: 1500 };
  if (weapon.kind === "artillery") {
    shot.artilleryCritical = rollWeaponCritical(state, shot, target);
    shot.artilleryMiss = !shot.artilleryCritical.sureHit && ordinaryMiss(state, target);
  }
  if (weapon.kind === "normal") finishWeapon(state, { ...shot });
  else scheduleWeaponImpact(state, shot);

  const group = tower.summon?.projectileGroup ??
    (/^b13[2-7]$/.test(tower.templateId) ? { extra: 3, range: 700, speed: 900 } : undefined);
  if (group && state.queue.nowUs >= (tower.multishotReadyUs ?? 0)) {
    tower.multishotReadyUs = state.queue.nowUs + us(2);
    const others = state.enemies.filter(enemy => enemy.id !== targetId && canSeeEnemy(state, enemy) &&
      weaponTargetable(enemy, weapon, state.queue.nowUs) && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= group.range ** 2)
      .sort((left, right) => left.id - right.id);
    let budget = 9_999_999;
    for (const enemy of others.slice(0, group.extra)) {
      const raw = Math.min(shot.raw, budget);
      if (raw <= 0) break;
      budget -= raw;
      scheduleWeaponImpact(state, { ...shot, raw, secondary: true, targetId: enemy.id, point: { ...shot.point },
        weapon: { ...shot.weapon, speed: group.speed, homing: true }, destination: { x: enemy.x, y: enemy.y } });
    }
  }
  const arrowRank = /^n00[1-5]$/.test(tower.templateId) ? Number(tower.templateId.slice(1)) : 0;
  if (arrowRank > 0 && state.queue.nowUs >= (tower.multishotReadyUs ?? 0)) {
    tower.multishotReadyUs = state.queue.nowUs + us(2);
    const types = weapon.targets.filter(type => ["ground", "air", "structure", "mechanical"].includes(type));
    const targets = state.enemies.filter(enemy => enemy.id !== targetId && canSeeEnemy(state, enemy) &&
      weaponTargetable(enemy, weapon, state.queue.nowUs, types) && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 1000 ** 2)
      .sort((left, right) => left.id - right.id).slice(0, arrowRank + 1);
    let budget = 9_999_999;
    for (const enemy of targets) {
      const raw = Math.min(amount, budget);
      if (raw <= 0) break;
      budget -= raw;
      const { corrosion: _corrosion, ...secondary } = shot;
      scheduleWeaponImpact(state, {
        ...secondary, raw, secondary: true, point: { ...shot.point }, targetId: enemy.id, weapon: { ...weapon, homing: true, speed: 1800 },
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
  weaponRatesDirty.add(state);
  syncMana(state, tower);
  return { ok: true };
}

function execute(state: Match, action: Action): Result {
  switch (action.type) {
    case "move-worker": return staticSweep(action.point, action.point, 1, "fly") ? { ok: true } : { ok: false, reason: "placement" };
    case "stop-worker":
      if (state.approach) recordResult(state, state.approach.command, { ok: false, reason: "range" });
      state.approach = null;
      return { ok: true };
    case "set-auto-mode": {
      const tower = state.structures.find(tower => tower.id === action.towerId);
      if (!tower || ![...(towerLevels.get(tower.templateId)?.bindings.map(binding => binding.skillId) ?? []),
        ...(state.inventory ?? []).filter(item => item.towerId === tower.id).map(item => item.itemId)].includes(action.key)) return { ok: false, reason: "missing" };
      (tower.autoModes ??= {})[action.key] = action.enabled;
      return { ok: true };
    }
    case "focus-target": {
      const tower = state.structures.find(tower => tower.id === action.towerId && !tower.pending);
      if (!tower) return { ok: false, reason: "missing" };
      if (action.targetId !== undefined && !state.enemies.some(enemy => enemy.id === action.targetId && canSeeEnemy(state, enemy) &&
        weapons[tower.templateId]?.some(weapon => inWeaponRange(tower, enemy, weapon, weaponRange(weapon, towerGear(state, tower)), false, state.queue.nowUs)))) return { ok: false, reason: "range" };
      tower.focusTarget = action.targetId;
      return { ok: true };
    }

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
    case "claim-worker-benefit": {
      if (state.queue.nowUs < (state.workerBenefitReadyUs ?? 0)) return { ok: false, reason: "cooldown" };
      state.workerBenefitReadyUs = state.queue.nowUs + us(120);
      grantWorkerBenefit(state, "J001");
      return { ok: true };
    }
    case "toggle-worker-sharing":
      state.workerSharing = !state.workerSharing;
      return { ok: true };
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
      const previousTower = itemOwner(state, item.towerId);
      const source = previousTower ?? state.worker;
      const destination = tower ?? state.worker;
      if (Math.hypot(source.x - destination.x, source.y - destination.y) > 1000) return { ok: false, reason: "range" };
      const slot = freeItemSlot(state, tower);
      if (slot === null) return { ok: false, reason: "full" };
      if (tower && !equipmentAllowed(state, item.itemId, tower)) {
        item.towerId = tower.id;
        if (previousTower && item.itemId === "i310") removeScepterEffects(state, previousTower);
        dropItem(state, item);
        refreshEquippedResources(state, previousTower, item.itemId);
        return { ok: false, reason: "equipment" };
      }
      item.slot = slot;
      delete item.towerId;
      if (tower) item.towerId = tower.id;
      if (previousTower && item.itemId === "i310") removeScepterEffects(state, previousTower);
      refreshEquippedResources(state, previousTower, item.itemId);
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
      if (runeIds.includes(item.itemId)) {
        applyRune(state, item);
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
      if (!tower?.hero || tower.pending) return { ok: false, reason: "missing" };
      if (!book) {
        const item = state.inventory?.find(entry => entry.id === action.itemId && entry.slot !== null);
        if (!item) return { ok: false, reason: "missing" };
        if (isDivineBook(item.itemId)) return useDivineBook(state, item, tower);
        if (!isKnowledgeBook(item.itemId)) return { ok: false, reason: "missing" };
        const owner = itemOwner(state, item.towerId);
        if (owner?.pending) return { ok: false, reason: "missing" };
        const key = `${item.towerId ?? "worker"}/${item.itemId}`;
        if (state.queue.nowUs < Math.max(state.knowledgeReady?.[key] ?? 0, owner?.stunnedUntilUs ?? 0,
          owner?.heroCastUntilUs ?? 0)) return { ok: false, reason: "cooldown" };
        (state.knowledgeReady ??= {})[key] = state.queue.nowUs + us(180);
        if (item.charges > 0) item.charges--;
        grantHeroExperience(state, tower.id, bookExperience(item.itemId, tower.hero.level));
        return { ok: true };
      }
      if (book.charges < 1) return { ok: false, reason: "missing" };

      book.charges--;
      grantHeroExperience(state, action.towerId, bookExperience(book.bookId, tower.hero.level));
      if (book.charges === 0) state.books!.splice(index, 1);
      return { ok: true };
    }

    case "cast-tower": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      return tower ? beginTowerSpell(state, tower, action.skillId, false, action.targetId) : { ok: false, reason: "missing" };
    }
    case "stop-tower-cast": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      return tower && stopTowerCast(state, tower) ? { ok: true } : { ok: false, reason: "missing" };
    }
    case "move-wolf":
    case "attack-with-wolf":
    case "stop-wolf": {
      const wolf = state.summons?.find(unit => unit.id === action.unitId && unit.summon?.independent);
      if (!wolf) return { ok: false, reason: "missing" };
      if (action.type === "move-wolf") {
        if (!staticSweep(action.point, action.point, wolf.radius, "ground")) return { ok: false, reason: "placement" };
        wolf.wolfOrder = { type: "move", point: { ...action.point }, path: [] };
      } else if (action.type === "attack-with-wolf") {
        if (!wolfTargets(state, wolf.id).some(enemy => enemy.id === action.targetId)) return { ok: false, reason: "range" };
        wolf.wolfOrder = { type: "attack", targetId: action.targetId, path: [] };
      } else {
        delete wolf.wolfOrder;
      }
      interruptWeapon(state, wolf);
      delete wolf.walkDirection;
      return { ok: true };
    }
    case "attack-ground":
    case "attack-ground-item": {
      const tower = state.structures.find(entry => entry.id === action.towerId && !entry.pending);
      const weapon = tower && weapons[tower.templateId]?.find(slot => slot.kind === "artillery");
      if (!tower || !weapon) return { ok: false, reason: "missing" };
      if (action.type === "attack-ground-item" && !artilleryObject(state, action.objectId)) return { ok: false, reason: "missing" };
      const target = action.type === "attack-ground" ? { point: { ...action.point } } : { objectId: action.objectId };
      if (!artilleryPoint(state, tower, weapon, target)) return { ok: false, reason: "range" };
      tower.artilleryOrder = target;
      startWeapon(state, tower);
      return { ok: true };
    }
    case "cast-flame-arrow": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      const effect = tower && flameArrow(tower);
      if (!tower || !effect || tower.pending) return { ok: false, reason: "missing" };
      if (!flameArrowTargets(state, tower.id)?.some(enemy => enemy.id === action.targetId)) {
        return { ok: false, reason: "range" };
      }
      if (effect.cost) {
        syncMana(state, tower);
        if (tower.mana! < effect.cost) return { ok: false, reason: "resources" };
      }
      tower.flameTarget = action.targetId;
      return { ok: true };
    }
    case "place-scout-ward": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      const item = tower && towerGear(state, tower).find(entry => entry.id === action.itemId && entry.itemId === "i235");
      if (!tower?.hero || tower.pending || !item || item.charges < 1) return { ok: false, reason: "missing" };
      if (state.queue.nowUs < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) return { ok: false, reason: "cooldown" };
      if (!contains(map.bounds, action.point) || (tower.x - action.point.x) ** 2 + (tower.y - action.point.y) ** 2 > 500 ** 2) {
        return { ok: false, reason: "range" };
      }
      if (--item.charges === 0) removeItem(state, item);
      const id = state.nextId++;
      (state.detectors ??= []).push({ id, ownerId: tower.id, templateId: "b116", hp: 200, ...action.point });
      scheduleEvent(state.queue, us(100), { type: "detector-expire", unitId: id });
      return { ok: true, createdId: id };
    }
    case "cast-scepter-swap": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      const target = scepterSwapTarget(state, action.targetId);
      if (!tower?.scepterSwap || !target || tower.pending) return { ok: false, reason: "missing" };
      if (state.queue.nowUs < Math.max(tower.scepterSwap.readyUs, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
        return { ok: false, reason: "cooldown" };
      }
      if ((tower.x - target.x) ** 2 + (tower.y - target.y) ** 2 > 9999 ** 2) return { ok: false, reason: "range" };
      syncMana(state, tower);
      if (tower.mana! < 150) return { ok: false, reason: "resources" };
      interruptWeapon(state, tower);
      tower.heroCastUntilUs = state.queue.nowUs + us(.3);
      tower.spellWindup = scheduleEvent(state.queue, us(.3), { type: "scepter-swap", towerId: tower.id, targetId: action.targetId,
        grant: tower.scepterSwap.grant, stage: "effect" });
      return { ok: true };
    }
    case "cast-equipment": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      const book = tower && towerGear(state, tower).find(item => item.id === action.itemId);
      if (!tower || !book || tower.pending) return { ok: false, reason: "missing" };
      if (book.itemId === "i255") return useGuldanSkull(state, tower, book);
      if (book.itemId === "i325") return beginSnow(state, tower, action.point);
      if (isTargetedEquipment(book.itemId)) return useControlEquipment(state, tower, book.itemId, action.targetId);
      if (book.itemId === "i330" || book.itemId === "i332") return useDemonflame(state, tower, book);
      return necromancyBooks.includes(book.itemId) ? useNecromancy(state, tower, book.itemId) : useRestoration(state, tower, book);
    }
    case "set-snow-duration": {
      if (!Number.isInteger(action.seconds) || action.seconds < 1 || action.seconds > 4) return { ok: false, reason: "range" };
      state.snowDuration = action.seconds;
      return { ok: true };
    }
    case "choose-skin": return chooseSkin(state, action.towerId, action.choice);
    case "choose-appearance": {
      const appearance = state.appearance ??= {};
      if (!action.choice) {
        delete appearance[action.slot];
        return { ok: true };
      }
      const choice = appearanceChoice(action.slot, action.choice);
      if (!choice || !appearanceUnlocked(choice, state.seasons)) return { ok: false, reason: "missing" };
      appearance[action.slot] = choice.id;
      return { ok: true };
    }
    case "toggle-flame-arrows": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      const effect = tower && flameArrow(tower);
      if (!tower || !effect || tower.pending) return { ok: false, reason: "missing" };
      tower.flameArrows = effect.cost ? tower.flameArrows === false : tower.flameArrows !== true;
      return { ok: true };
    }
    case "cast-hero": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      if (!tower) return { ok: false, reason: "missing" };
      const { skillId } = action;
      return skillId === "A068" || skillId === "A149"
        ? activateTreeGrab(state, tower, skillId)
        : beginHeroSpell(state, tower, skillId, false, action);
    }
    case "learn-skill": {
      const tower = state.structures.find(tower => tower.id === action.towerId);
      if (!tower?.hero || tower.pending) return { ok: false, reason: "missing" };
      if (!learnHeroSkill(tower.hero, tower.templateId, action.skillId)) return { ok: false, reason: "learning" };
      weaponRatesDirty.add(state);
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
      state.structures.splice(index, 1);
      interruptWeapon(state, tower);
      if (tower.attack?.timing?.cooldown) cancelEvent(state.queue, tower.attack.timing.cooldown.timerId);
      weaponRatesDirty.add(state);
      if (tower.spellWindup !== undefined) cancelEvent(state.queue, tower.spellWindup);
      if (tower.snow) cancelEvent(state.queue, tower.snow.token);
      if (tower.leashToken !== undefined) {
        for (const enemy of state.enemies) {
          if (enemy.leashes) enemy.leashes = enemy.leashes.filter(token => token !== tower.leashToken);
        }
      }
      for (let slot = 0; slot < 6; slot++) {
        const item = state.inventory?.find(entry => entry.towerId === tower.id && entry.slot === slot);
        if (!item) continue;
        if (recycleDestroyedItems.has(item.itemId)) removeItem(state, item, tower);
        else dropItem(state, item, tower);
      }
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
      card.invulnerable = true;
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
      card.invulnerable = true;
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
      weaponRatesDirty.add(state);
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
      interruptWeapon(state, tower);
      stopTowerCast(state, tower);
      if (state.phase !== "running") return { ok: false, reason: "missing" };
      const timer = scheduleEvent(state.queue, us(upgrade.seconds), { type: "finish-construction", towerId: tower.id });
      tower.pending = { timer, cost, upgradeTo: upgrade.to };
      weaponRatesDirty.add(state);
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
  if (action.type === "move-worker") {
    if (!staticSweep(action.point, action.point, 1, "fly")) return false;
    target = action.point;
    range = 2;
  } else if (action.type === "build-card" || action.type === "build-worker-tower") {
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
  const worker: Mobile = { ...state.worker, id: 0, layer: "fly", radius: 1,
    speed: 350 * (hasEnduranceAura(state, state.worker) ? 1.1 : 1),
    waypoint: 0, previousWaypoint: null, initialOverlaps: [] };
  const sweep = movementSweep(worker, state.enemies);
  let budget = worker.speed / 32;
  if (!approach.path.length || !sweep(worker, approach.path[0])) {
    approach.path = (approach.command.action.type === "move-worker" ? findPath(worker, approach.point, sweep)?.points :
      findApproachPath(worker, approach.point, range, sweep)) ?? [];
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

function groundAllies(state: Match) {
  return [
    ...state.structures.map(tower => ({ ...tower, layer: "ground" as const })),
    ...(state.summons ?? []).filter(unit => unit.summon?.independent)
      .map(unit => ({ ...unit, radius: unitBalance.get(unit.templateId)?.collision ?? unit.radius, layer: "ground" as const })),
  ];
}

function wolfOccupants(state: Match) {
  return [
    ...groundAllies(state),
    ...state.enemies.filter(enemy => enemy.layer === "ground" && enemy.hp > 0 &&
      state.queue.nowUs >= (enemy.phaseUntilUs ?? 0) && !enemy.abilities?.includes("Aloc")),
  ];
}

function moveWolf(state: Match, wolf: Construction) {
  delete wolf.walkDirection;
  const order = wolf.wolfOrder;
  if (!order || state.queue.nowUs < (wolf.stunnedUntilUs ?? 0)) return;
  const target = order.type === "attack" ? wolfTargets(state, wolf.id).find(enemy => enemy.id === order.targetId) : undefined;
  const weapon = weapons[wolf.templateId]?.[0];
  if (order.type === "attack" && (!target || !weapon)) {
    delete wolf.wolfOrder;
    return;
  }
  if (target && weapon && inWeaponRange(wolf, target, weapon, 0, false, state.queue.nowUs)) return;
  let goal: Point;
  if (order.type === "move") {
    goal = order.point;
  } else {
    const direction = spellDirection(target!, wolf);
    const reach = Math.min(weapon!.max, weapon!.acquire) - gridSize;
    goal = { x: target!.x + direction.dx * reach, y: target!.y + direction.dy * reach };
  }
  const speed = (unitBalance.get(wolf.templateId)?.spd ?? 320) *
    (wolf.untouchable && wolf.untouchable.untilUs >= state.queue.nowUs ? wolf.untouchable.movement : 1) *
    ((wolf.armorFrostUntilUs ?? -1) >= state.queue.nowUs ? .5 : 1) *
    (hasEnduranceAura(state, wolf) ? 1.1 : 1);
  const unit: Mobile = { ...wolf, radius: unitBalance.get(wolf.templateId)?.collision ?? wolf.radius, speed,
    waypoint: 0, previousWaypoint: null, layer: "ground", initialOverlaps: wolf.spawnOverlaps ?? [] };
  const occupants = wolfOccupants(state).filter(other => other.id !== target?.id);
  const blocked = state.structures.filter(tower => footprintTowers.has(tower.templateId)).map(buildFootprint);
  const sweep = movementSweep(unit, occupants, blocked);
  const end = order.path.at(-1);
  if (!end || !sweep(unit, order.path[0]) ||
      (target && Math.hypot(goal.x - end.x, goal.y - end.y) >= gridSize)) {
    const direct = sweep(unit, goal) ? [goal] : findPath(unit, goal, sweep)?.points;
    order.path = direct ?? (target ? findPath(unit, target, sweep)?.points : undefined) ?? [];
  }
  let budget = speed / 32;
  while (order.path.length && budget > 0) {
    const next = order.path[0];
    if (!sweep(wolf, next)) break;
    const dx = next.x - wolf.x;
    const dy = next.y - wolf.y;
    const length = Math.hypot(dx, dy);
    const step = Math.min(length, budget);
    if (step > 0) {
      wolf.walkDirection = { x: dx / length, y: dy / length };
      wolf.x += wolf.walkDirection.x * step;
      wolf.y += wolf.walkDirection.y * step;
      budget -= step;
    }
    if (step === length) order.path.shift();
  }
  wolf.spawnOverlaps = unit.initialOverlaps.filter(id => occupants.some(other => other.id === id && overlaps({ ...wolf, radius: unit.radius }, other)));
  if (order.type === "move" && Math.hypot(wolf.x - goal.x, wolf.y - goal.y) <= 1e-8) delete wolf.wolfOrder;
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
  const advanced = advanceEvents(state.queue, state.clock.targetUs, eventLimit, ({ payload: event, timerId }) => {
    switch (event.type) {
      case "worker-benefit": grantWorkerBenefit(state, "J006"); break;
      case "divine-effect-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.divineEffects?.[event.abilityId]?.untilUs !== event.untilUs) break;
        delete tower.divineEffects[event.abilityId];
        weaponRatesDirty.add(state);
        if (tower.manaLastUs !== undefined) syncMana(state, tower);
        if (tower.life) syncTowerLife(state, tower);
        break;
      }
      case "movement": {
        moveWorker(state);
        reconcileEquipmentBurn(state);
        const shivasGuard = state.inventory?.some(item => item.itemId === "i155" && item.slot !== null && (item.towerId ?? 0) > 0);
        for (const enemy of state.enemies) {
          if (enemy.doomUntilUs !== undefined && enemy.doomUntilUs <= state.queue.nowUs) delete enemy.doomUntilUs;
          if (enemy.hexSourceId === undefined && enemy.hexUntilUs !== undefined && enemy.hexUntilUs <= state.queue.nowUs) delete enemy.hexUntilUs;
          if (enemy.purge) {
            if (state.queue.nowUs >= enemy.purge.endUs || magicImmune(enemy)) delete enemy.purge;
            else if (state.queue.nowUs >= enemy.purge.middleUs) enemy.purge.factor = .5;
          }
          if (enemy.clapSlow && (enemy.clapSlow.untilUs <= state.queue.nowUs || magicImmune(enemy))) delete enemy.clapSlow;
          if (enemy.howlArmor && (enemy.howlArmor.expiresUs <= state.queue.nowUs || magicImmune(enemy))) delete enemy.howlArmor;
          if (enemy.coldArrow && magicImmune(enemy)) delete enemy.coldArrow;
          if (shivasGuard && nearbyEquipment(state, enemy, ["i155"], 900)) enemy.auraSpeed = .65;
          else if (enemy.auraSpeed !== undefined) delete enemy.auraSpeed;
        }
        const now = state.queue.nowUs;
        const phasing = new Set(state.enemies.filter(enemy => enemyIsInvisible(enemy, now)).map(enemy => enemy.id));
        if (state.enemies.some(enemy => enemy.layer === "ground")) {
          moveUnits(state.enemies, () => roll(state),
            state.structures.filter(tower => footprintTowers.has(tower.templateId)).map(buildFootprint),
            groundAllies(state), phasing);
        } else {
          moveUnits(state.enemies, () => roll(state), [], [], phasing);
        }
        for (const tower of state.structures) startWeapon(state, tower);
        for (const summon of state.summons ?? []) {
          if (summon.summon?.independent) {
            const { x, y } = summon;
            moveWolf(state, summon);
            if (summon.x !== x || summon.y !== y) refreshWeaponTiming(state, summon);
          }
          startWeapon(state, summon);
        }
        break;
      }
      case "hero-spell": finishHeroSpell(state, event); break;
      case "hero-spell-end": {
        const tower = firingUnit(state, event.towerId);
        const ready = tower?.heroSpellReady?.[event.skillId];
        if (tower?.heroSpellReady && ready !== undefined) {
          tower.heroSpellReady[event.skillId] = adjustedSpellCooldown(state, tower, ready);
        }
        break;
      }
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
        if (state.queue.pending.some(({ payload }) => payload.type === "magic-arrow-restore" &&
          payload.towerId === event.towerId && payload.token > event.token)) break;
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (target) {
          syncEnemyHealth(state, target);
          target.hp = Math.min(target.maxHp ?? target.hp, target.hp + .7 * event.amount);
        }
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
      case "detector-expire": {
        const detector = state.detectors?.find(entry => entry.id === event.unitId);
        if (detector?.templateId) recordBattleAnimation(state, detector, detector.templateId, "death");
        state.detectors = state.detectors?.filter(entry => entry.id !== event.unitId);
        break;
      }
      case "summon-expire": {
        const unit = state.summons?.find(unit => unit.id === event.unitId);
        if (unit) {
          interruptWeapon(state, unit);
          if (unit.attack?.timing?.cooldown) cancelEvent(state.queue, unit.attack.timing.cooldown.timerId);
          const summon = unit.summon!;
          if (!summon.independent && !summon.illusion && (summon.green || summon.blue)) {
            const fields = weaponFields(state, unit, weapons[unit.templateId][0], towerGear(state, unit));
            const contract = { green: summon.green, blue: summon.blue, baseAttack: Math.fround(fields.attack) + Math.fround(fields.bonus) };
            for (const { payload } of state.queue.pending) {
              if (payload.type === "weapon-impact" && payload.shot.summon?.id === unit.id) payload.shot.summon.contract = contract;
            }
          }
          recordBattleAnimation(state, unit, unit.templateId, "death");
          state.summons = state.summons?.filter(entry => entry !== unit);
        }
        break;
      }
      case "spell-zones": resolveSpellZones(state, event); break;
      case "ice-path-impact": resolveIcePath(state, event); break;
      case "equipment-snow": {
        const tower = state.structures.find(entry => entry.id === event.towerId);
        if (tower?.snow?.token === event.token) finishSnow(state, tower);
        break;
      }
      case "auto-control-equipment": {
        const tower = state.structures.find(tower => tower.id === event.towerId);
        const item = state.inventory?.find(item => item.id === event.itemId);
        if (tower && item && tower.autoModes?.[item.itemId] !== false)
          execute(state, { type: "cast-equipment", towerId: event.towerId, itemId: event.itemId, targetId: event.targetId, point: event.point });
        break;
      }
      case "equipment-seal-end": {
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (target?.seal && target.seal.untilUs <= state.queue.nowUs) {
          syncEnemyHealth(state, target);
          target.hp = Math.min(target.maxHp ?? target.hp, target.hp + target.seal.amount * .8);
          delete target.seal;
        }
        break;
      }
      case "equipment-doom-impact": advanceEquipmentDoom(state, event); break;
      case "equipment-hex-damage": {
        const tower = state.structures.find(entry => entry.id === event.towerId);
        if (!tower) break;
        for (const enemy of [...state.enemies].sort((left, right) => left.id - right.id)) {
          if (state.phase !== "running") break;
          if ((enemy.x - event.point.x) ** 2 + (enemy.y - event.point.y) ** 2 > 700 ** 2 ||
              !targetable(enemy, ["ground", "air", "structure", "mechanical"], state.queue.nowUs)) continue;
          damageEnemy(state, tower, tower.templateId, enemy, physicalDamage(1, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "T049");
        }
        break;
      }
      case "equipment-hex-end": {
        const enemy = state.enemies.find(entry => entry.id === event.enemyId);
        if (enemy?.hexSourceId === event.sourceId) {
          delete enemy.hexUntilUs;
          delete enemy.hexSourceId;
        }
        break;
      }
      case "equipment-frost": tickEquipmentFrost(state, event); break;
      case "equipment-lightning": equipmentLightning(state, event); break;
      case "equipment-volley": finishEquipmentVolley(state, event); break;
      case "equipment-burn": applyEquipmentBurn(state); break;
      case "weapon-fire": {
        const timing = firingUnit(state, event.towerId)?.attack?.timing;
        if (!timing || timing.windup?.timerId === timerId) fireWeapon(state, event.towerId, event.targetId, event.slot, event.startedUs);
        break;
      }
      case "weapon-ready": {
        const tower = firingUnit(state, event.towerId);
        if (!tower) break;
        if (event.startedUs !== undefined) {
          if (tower.attack?.startedUs !== event.startedUs || tower.attack.timing?.cooldown?.timerId !== timerId) break;
          delete tower.attack.timing.cooldown;
        }
        startWeapon(state, tower);
        break;
      }
      case "weapon-backswing-end": {
        const timing = firingUnit(state, event.towerId)?.attack?.timing;
        if (timing?.backswing?.timerId === timerId) delete timing.backswing;
        break;
      }
      case "weapon-rate-end": endWeaponRateEffect(state, event); break;
      case "weapon-impact": advanceWeaponShot(state, event.shot, event.travelUs); break;
      case "immolation": tickImmolation(state, event.towerId); break;
      case "spawn-rune": spawnRune(state); break;
      case "demonflame": tickDemonflame(state, event.towerId, event.itemId); break;
      case "scepter-swap": resolveScepterSwap(state, event); break;
      case "tree-grab-expire": {
        const tower = state.structures.find(entry => entry.id === event.towerId);
        if (tower?.treeGrab) delete tower.treeGrab.strength[event.buffId];
        break;
      }
      case "avalanche": avalanche(state, event); break;
      case "stun-expire": {
        const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (enemy?.stunUntilUs && enemy.stunUntilUs <= state.queue.nowUs) delete enemy.stunUntilUs;
        break;
      }
      case "enemy-cast": finishEnemyReaction(state, event.enemyId, event.skill, event.point, event.targetId); break;
      case "enemy-summon-expire": {
        const child = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (child) {
          child.hp = 0;
          removeDeadEnemy(state, child.id);
        }
        break;
      }
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
        recordBattleAnimation(state, parent, parent.unitId, "revive");
        break;
      }
      case "enemy-speed-expire": {
        const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (enemy && (enemy.speedBuffUntilUs ?? 0) <= state.queue.nowUs) delete enemy.speedBuff;
        if (enemy?.windwalk && enemy.windwalk.endUs <= state.queue.nowUs) {
          delete enemy.windwalk;
          delete enemy.windwalkSpeed;
        }
        break;
      }
      case "frost-expire": {
        const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (enemy?.frost && enemy.frost.expiresUs <= state.queue.nowUs) delete enemy.frost;
        if (enemy?.coldArrow && enemy.coldArrow.expiresUs <= state.queue.nowUs) delete enemy.coldArrow;
        break;
      }
      case "start-wave": if (startWave(state, event.index) === false) return false; break;
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
        weaponRatesDirty.add(state);
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
    if (weaponRatesDirty.delete(state)) {
      for (const tower of state.structures) refreshWeaponTiming(state, tower);
      for (const summon of state.summons ?? []) refreshWeaponTiming(state, summon);
    }
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
