import { advanceEvents, cancelEvent, createEventQueue, scheduleEvent, secondsToMicroseconds as us, type EventQueue } from "../event-queue.ts";
import { cardTemplates, chestKeys, chestPools, configuration, directBuilds, firelordSkin, firelordSkillSlots, footprintTowers, itemChargeInheritance, itemChargeStacks, itemExclusions, itemFields, items, lumberVouchers, openingChoices, openingResources, ordinaryGoods, pawnGold, prayerBooks, qualificationChains, rarityPools, recipes, recycleRate, summonCards, towerLevels, towerRadius, waveRewards } from "./content.ts";
import { buildAnchor, buildFootprint, contains, gridSize, map, mapVersion, overlaps, terrainAllowsConstruction, waypointRegions, type Disk, type Point } from "./map.ts";
import { alchemistForms, beastmasterBoars, beastmasterHawks, dragonForms, lycanFormRanks, lycanForms } from "./content.ts";
import { completeRouteSpan, effectiveMoveSpeed, movementCandidates, movementRate, moveUnits, movementStepUs, movementSweep, planRouteSpan, routeSpanPoint, routeSpansOverlap, type Mobile, type RoutePlan, type RouteSpan } from "./movement.ts";
import { movingWaveContacts, waveContact } from "./wave-contact.ts";
import { findApproachPathSteps, findPath, findPathSteps, nearestSpawn, staticSweep } from "./pathfinding.ts";
import { addHeroExperience, bookExperience, learnHeroSkill, newHero, restoreHeroGrowth, type Hero } from "./hero.ts";
import { appearanceChoice, appearanceUnlocked, type Appearance, type AppearanceSlot } from "./appearance.ts";
import { creditSeason, type Season, type Seasons } from "./seasons.ts";
import { pointTowerSpell, pointTowerSpellRange, towerSpells } from "./tower-spells.ts";
import { talentChoices, talentRules, promotionWaves } from "./talents.ts";
import { challengeGoods, challengeTemplates, drawMysteryStock, mysteryWaves } from "./shops.ts";
import { blademasterCriticalChance, blademasterCriticalMultiplier, criticalMultipliers, effectiveAttributes, equipmentAttackSpeed, flatAttack, killExperience, physicalDamage, unitBalance, unitTargetType, weaponPhaseDelay, weaponScheduleRate, weapons, welfareGold, wraithCriticalChance, wraithCriticalMultiplier, type Weapon, type WeaponPhase, type WeaponShot, type WeaponTiming } from "./combat.ts";
import { divineDamageFactor, divineField, divineStars, isDivineBook, type DivineForm } from "./divine.ts";
import { unitMovementType } from "./combat.ts";
import { enemySpells, type EnemySpellId } from "./enemy-effects.ts";
import { accuracySkill, isAccuracySkill, isWispOverload, wispOverload, type AccuracySkill, type WispOverload, heroAutoCastOrder, heroSpells, heroSpellTargetMode, type CastableHeroSkill, type HeroSpell, type SpellSweep } from "./hero-spells.ts";
import itemResources from "../../../docs/rules/item-resources-batch-01.json" with { type: "json" };
import itemRegeneration from "../../../docs/rules/item-regeneration-batch-01.json" with { type: "json" };
import { heroExchangeOffers, mallHeroLimit } from "./hero-exchange.ts";
import { eventBoxCost, eventBoxOffers, eventBoxes } from "./event-boxes.ts";
import doomRules from "../../../docs/rules/doom-devour-borrowed-skills.json" with { type: "json" };
import { enemyTemplateAbilities, waves, welfareTemplates } from "./waves.ts";

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
  | { type: "exchange-hero"; offer: string }
  | { type: "upgrade-tower"; towerId: number }
  | { type: "use-item"; itemId: number; targetId?: number }
  | { type: "pick-up-item" | "drop-item"; itemId: number }
  | { type: "transfer-item"; itemId: number; towerId?: number }
  | { type: "buy-item"; itemId: string }
  | { type: "sell-item"; itemId: number; shop: string }
  | { type: "buy-event-box"; offer: string }
  | { type: "buy-special"; shop: "challenge" | "mystery"; itemId: string }
  | { type: "reserve-challenge"; unitId: string }
  | { type: "overdraft" }
  | { type: "claim-wave"; slot: number }
  | { type: "buy-book"; bookId: BookId }
  | { type: "use-book"; itemId: number; towerId: number }
  | { type: "learn-skill"; towerId: number; skillId: string }
  | { type: "cast-tower"; towerId: number; skillId: string; targetId?: number; point?: Point }
  | { type: "stop-tower-cast"; towerId: number }
  | { type: "toggle-morph"; towerId: number; attribute: "STR" | "AGI" }
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
type Result = { ok: true; createdId?: number; eventReward?: { currency: "fragments" | "score"; amount: number }; divineBook?: DivineForm | "ineligible" | "max-stars" | "failed" } |
  { ok: false; reason: "opening" | "placement" | "resources" | "missing" | "full" | "materials" | "closed" | "learning" | "range" | "stock" | "cooldown" | "equipment" };
type WeaponRateEffect = "fleetAura" | "bladeStormHasteUs" | "doomBloodlust" | "bloodlust" | "overpower" | "axeBloodlustUntilUs" | "strafeUntilUs" | "frenzyUntilUs" | "armorFrostUntilUs" | "thunderClap" | "untouchable" | "i721" | "pressTheAttack" | "focusFire";
type ArtilleryTarget = { point: Point } | { objectId: number };
type DoomProjectile = { type: "doom-projectile"; towerId: number; targetId: number; source: Point & { id: number };
  position: Point; expiresUs?: number; travelUs: number } &
  ({ spell: "A200"; remaining: number } | { spell: "T302"; visited: number[]; mana: number } | { spell: "T178"; mana: number } | { spell: "T303"; stun: number } | { spell: "T328"; damage: number } | { spell: "T230"; rank: number });
type ExorcismEvent = { type: "exorcism"; towerId: number; token: number } &
  ({ stage: "spawn"; remaining: number } | { stage: "control" | "return" | "remove" });
type BountyProjectile = { type: "bounty-projectile"; towerId: number; targetId: number; source: Point & { id: number };
  position: Point; expiresUs?: number; travelUs: number; rank: number; throwId: number; remaining?: number };
type LifeDrain = { targetId: number; timerId: number; rank: number; endUs: number; skillId: "A103" | "A176";
  carrier?: Point & { id: number; hp: number; active: boolean } };
type UpheavalAura = Point & { towerId: number; untilUs: number; rank: number; stage: number;
  visual: "q040" | "q044"; progressTimer?: number };
type EmberCycle = { timerId: number; remaining: number };
type WildAxes = { towerId: number; step: number; timerId: number; crossing: Point; turns: [Point, Point];
  axes: [Point & { id: number; hit: number[] }, Point & { id: number; hit: number[] }] };
type FirestormProjectile = { type: "firestorm-projectile"; source: Point & { id: number }; towerId: number; targetId: number;
  position: Point; expiresUs: number; travelUs: number; rank: number };
type PhantomSpearLink = { castId: number; contacts: number };
type PhantomSpear = { type: "phantom-spear"; towerId: number; targetId: number; source: Point & { id: number; spear: PhantomSpearLink };
  position: Point; rank: number; expiresUs: number; travelUs: number };
type CaskProjectile = { type: "cask-projectile"; towerId: number; targetId: number; position: Point; expiresUs: number; travelUs: number;
  source: Point & { id: number; cask: { castId: number; jumps: number } } };
type TideProjectile = { type: "tide-projectile"; towerId?: number; targetId: number; source: Point & { id: number };
  position: Point; expiresUs: number; travelUs: number; skillId: "T276" | "T278"; rank: number };
type RazorStorm = Point & { id: number; towerId: number; intervalUs: number; untilUs: number; inFlight: number; targetId?: number };
type MatchEvent =
  | DoomProjectile
  | ExorcismEvent
  | BountyProjectile
  | PhantomSpear
  | CaskProjectile
  | TideProjectile
  | FirestormProjectile
  | { type: "tide-carrier-expire"; sourceId: number; towerId?: number; targetId: number; skillId: "T276" | "T278"; point: Point }
  | { type: "tide-wave-expire"; sourceId: number; towerId: number }
  | { type: "tide-corrosion-end"; enemyId: number; untilUs: number }
  | { type: "ravage-step"; token: number; targets: number[]; stuns: number[]; step: number; rank: number }
  | { type: "impale-lift"; token: number; targets: number[]; step: number }
  | { type: "lion-hex-tail"; towerId: number; point: Point }
  | { type: "lion-carrier-expire"; towerId: number; sourceId: number; targetId: number; skillId: "T405" | "T406"; point: Point; mana: number }
  | { type: "vacuum-tick"; towerId: number }
  | { type: "vacuum-carrier-expire"; towerId: number; sourceId: number; targetId: number; point: Point; mana: number }
  | { type: "ion-shell-tick"; targetId: number }
  | { type: "replica-expire"; enemyId: number }
  | { type: "world-night-change" }
  | { type: "dark-ascension-end"; towerId: number }
  | { type: "void-slow"; sourceId: number; carrierTimer: number; targetId: number }
  | { type: "void-carrier-expire"; sourceId: number; towerId: number; targetId: number; point: Point; mana: number }
  | { type: "void-slow-end"; enemyId: number; untilUs: number }
  | { type: "magnus-push"; enemyId: number }
  | { type: "empower-end"; towerId: number }
  | { type: "magnus-carrier-expire"; sourceId: number; towerId: number; skillId: "T205" | "T199"; rank: number }
  | { type: "oracle-flame-end" | "oracle-edict-end"; enemyId: number }
  | { type: "oracle-promise"; towerId: number }
  | { type: "oracle-purge-step"; enemyId: number; untilUs: number; factor: number }
  | { type: "oracle-pause-end"; enemyId: number; untilUs: number }
  | { type: "oracle-carrier-expire"; towerId: number; sourceId: number; targetId: number; mana: number }
  | { type: "quill-layers-end"; enemyId: number; towerId: number }
  | { type: "bristle-goo-armor-end"; enemyId: number; towerId: number }
  | { type: "bristle-goo-slow-end"; enemyId: number; untilUs: number }
  | { type: "bristle-goo-carrier-end"; towerId: number; sourceId: number; targetId: number; point: Point; stacks: number }
  | { type: "bristle-goo-projectile"; sourceId: number; targetId: number; position: Point; travelUs: number; stacks: number }
  | { type: "searing-chains" | "flame-guard"; towerId: number }
  | { type: "searing-chains-release"; enemyId: number; untilUs: number }
  | { type: "sleight-of-fist"; towerId: number; sequence: number }
  | { type: "wild-axes"; castId: number }
  | { type: "boar-venom-end"; sourceId: number; enemyId: number; untilUs: number }
  | { type: "pit-pulse"; towerId: number; skillId: "A233" | "A234" }
  | { type: "firestorm-impact"; towerId: number; point: Point; source: Point; amount: number }
  | { type: "firestorm-burn"; enemyId: number }
  | { type: "pit-net-end"; enemyId: number; untilUs: number }
  | { type: "death-aura-end"; towerId: number; amount: number }
  | { type: "shackle-projectile"; towerId: number; targetId: number; position: Point; travelUs: number }
  | { type: "focus-restore"; towerId: number }
  | { type: "focus-carrier-expire"; towerId: number; sourceId: number; skillId: "T171" | "T172" | "T173" | "T260" | "T261"; rank: number; mana: number; point: Point }
  | { type: "witch-curse"; curseId: number; final: boolean }
  | { type: "death-ward-area"; towerId: number; point: Point; amount: number }
  | { type: "movement" }
  | { type: "move-route"; enemyId: number }
  | { type: "disease-tick" | "poison-tick"; towerId: number; enemyId: number }
  | { type: "native-slow-scan"; towerId: number }
  | { type: "bloodlust-scan"; towerId: number }
  | { type: "boulder-projectile"; towerId: number; targetId: number; sourceId?: number; source: Point;
      position: Point; expiresUs?: number; travelUs: number; skillId: string; amount: number; stun: number; heroStun: number }
  | { type: "worker-benefit" }
  | { type: "divine-effect-end"; towerId: number; abilityId: string; untilUs: number }
  | { type: "weapon-fire"; towerId: number; targetId?: number; slot: number; startedUs?: number }
  | { type: "weapon-ready"; towerId: number; startedUs?: number }
  | { type: "weapon-backswing-end"; towerId: number; startedUs: number }
  | { type: "weapon-rate-end"; towerId: number; effect: WeaponRateEffect; expiresUs: number }
  | { type: "fury-swipes-end"; towerId: number; expiresUs: number }
  | { type: "ursa-carrier-expire"; sourceId: number; towerId: number; skillId: "T007" | "T144" | "N015"; rank: number; mana: number; point: Point }
  | { type: "coup-carrier-expire"; sourceId: number; towerId: number; point: Point }
  | { type: "requiem-carrier-expire"; sourceId: number; towerId: number }
  | { type: "mana-counter-expire"; towerId: number; amount: number }
  | { type: "mana-void-projectile"; towerId: number; targetId: number; position: Point; travelUs: number }
  | { type: "barrage-launch"; towerId: number; amount: number; remaining: number }
  | { type: "barrage-rocket"; towerId: number; targetId: number; amount: number; position: Point; travelUs: number }
  | { type: "flak-end"; towerId: number }
  | { type: "calldown"; towerId: number; point: Point; stage: "first" | "second" }
  | { type: "calldown-damage"; source: Point & { id: number }; sourceTemplate: string; point: Point; amount: number }
  | { type: "calldown-slow-end"; enemyId: number; untilUs: number }
  | { type: "calldown-carrier-expire"; sourceId: number; towerId: number; skillId: "T218" | "T219"; targetId: number; mana: number }
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
  | { type: "morph-shift"; towerId: number }
  | { type: "morph-bolt"; towerId: number; targetId: number; source: Point & { id: number };
      position: Point; stun: number; expiresUs: number; travelUs: number }
  | { type: "razor-plasma"; towerId: number; amount: number; tick: number; hit: number[] }
  | { type: "razor-static-tick"; towerId: number; targetId: number; source: Point & { id: number }; linkId: number; remaining: number }
  | { type: "razor-static-end"; towerId: number; linkId: number }
  | { type: "razor-storm-shot"; stormId: number }
  | { type: "razor-storm-impact"; stormId: number; targetId: number; position: Point; travelUs: number }
  | { type: "illuminate-timeout"; towerId: number }
  | { type: "spirit-wave"; towerId: number; aim: Point }
  | { type: "illuminate-blind-end"; enemyId: number; untilUs: number }
  | { type: "ogre-projectile"; towerId: number; targetId: number; sourceId?: number; source: Point;
      position: Point; expiresUs?: number; travelUs: number; rank: number }
  | { type: "ogre-repeat"; towerId: number; targetId: number; remaining: number }
  | { type: "freezing-pulse"; fieldId: number; index: number }
  | { type: "freezing-end"; fieldId: number }
  | { type: "freezing-scepter"; towerId: number; targetId: number; sourceId: number; source: Point;
      position: Point; expiresUs: number; travelUs: number; rank: number }
  | DeathPulseProjectile
  | DuelProjectile
  | { type: "duel-observe"; towerId: number }
  | { type: "duel-unlock"; targetId: number; untilUs: number }
  | { type: "dragon-restore-range" | "dragon-end"; towerId: number; formTimer: number }
  | { type: "alchemist-restore-range" | "alchemist-end" | "lycan-restore-range" | "lycan-end"; towerId: number; formTimer: number }
  | { type: "acid-cloud-tick" | "acid-cloud-end"; cloudId: number }
  | { type: "goblin-greed-end"; towerId: number }
  | { type: "dragon-imprint" | "dragon-imprint-end"; imprintId: number }
  | { type: "burning-spear"; towerId: number; targetId: number; remaining: number }
  | { type: "berserker-blood" | "inner-vitality"; towerId: number }
  | { type: "life-break-slow-end"; targetId: number; untilUs: number }
  | { type: "march-robot-launch"; towerId: number; sourceId: number; point: Point; direction: Point; amount: number; index: number }
  | { type: "rearm-finish"; towerId: number }
  | { type: "heartstopper-tick"; towerId: number }
  | { type: "prophet-teleport"; towerId: number; point: Point }
  | { type: "eclipse-tick" | "eclipse-end"; towerId: number }
  | { type: "eclipse-hammer"; targetId: number; sourceId: number; point: Point }
  | { type: "storm-hammer"; towerId: number; targetId: number; sourceId: number;
      skillId: "A061" | "A119" | "A128"; visual: string; position: Point; expiresUs: number; travelUs: number; damage: number }
  | { type: "wraith-projectile"; towerId: number; targetId: number; source: Point; position: Point;
      expiresUs: number; travelUs: number; rank: number }
  | { type: "nova-tick"; towerId: number }
  | { type: "dark-pact-start" | "dark-pact-tick"; towerId: number }
  | { type: "essence-expire"; towerId: number; amount: number }
  | { type: "wisp-link-tick"; towerId: number }
  | { type: "wisp-overload-tick"; towerId: number }
  | { type: "wisp-relocate"; towerId: number; point: Point }
  | { type: "accuracy-expire"; towerId: number }
  | { type: "contract-expire"; towerId: number; token: number }
  | { type: "magic-arrow"; towerId: number; targetId: number; point: Point; rank: number; scepter: boolean;
      expiresUs?: number; sourceId?: number; travelUs?: number }
  | { type: "magic-arrow-restore"; towerId: number; targetId: number; token: number; amount: number }
  | { type: "summon-expire"; unitId: number }
  | { type: "blade-storm-tick" | "blade-storm-end"; id: number }
  | { type: "omnislash-tick" | "omnislash-end"; towerId: number; id: number }
  | { type: "bear-update"; unitId: number }
  | { type: "bear-form-end"; towerId: number }
  | { type: "bear-cast"; unitId: number; skillId: string }
  | { type: "bear-frenzy-end"; towerId: number }
  | { type: "detector-expire"; unitId: number }
  | { type: "mana-debt"; towerId: number; amount: number }
  | { type: "spell-immunity-expire"; towerId: number; sourceId: number }
  | { type: "equipment-teleport"; towerId: number; point: Point }
  | { type: "soul-burn-end"; targetId: number }
  | { type: "spectre-refraction"; towerId: number }
  | { type: "doom-digest"; towerId: number; gold: number }
  | { type: "doom-retry"; towerId: number }
  | { type: "doom-scorch"; towerId: number; token: number; remaining: number }
  | { type: "torrent-step"; token: number; targets: number[]; step: number }
  | { type: "tidebringer-ready"; towerId: number }
  | { type: "fleet-release" | "fleet-expire"; fleetId: number }
  | { type: "astral-intelligence-end"; towerId: number; amount: number }
  | { type: "arcane-poison-end"; enemyId: number; untilUs: number }
  | { type: "bounty-mark-end" | "bounty-armor-end"; enemyId: number }
  | { type: "bounty-track-scan"; towerId: number }
  | { type: "shadow-wind-expire"; auraId: number }
  | { type: "shadow-wind-boundary"; enemyId: number }
  | { type: "nether-blast"; towerId: number; point: Point; damage: number; visual: "WispExplode" | "PsiWave" }
  | { type: "decrepify-end"; enemyId: number; untilUs: number }
  | { type: "life-drain-tick"; towerId: number }
  | { type: "fatal-bonds-expire"; groupId: number }
  | { type: "fatal-bonds-carrier-expire"; carrierId: number }
  | { type: "upheaval-progress" | "upheaval-expire"; auraId: number }
  | { type: "infernal-land"; towerId: number; rank: number; source: Point & { id: number } }
  | { type: "infernal-immolation"; unitId: number }
  | { type: "phantom-slow-end"; enemyId: number; untilUs: number }
  | { type: "phantom-illusion"; towerId: number } &
    ({ kind: "spear"; targetId: number } | { kind: "parallel"; point: Point; actorId: number })
  | { type: "stone-gaze-end"; enemyId: number }
  | { type: "doom-frost"; towerId: number; targetId: number; token: number; tick: number; skillId?: "A199" }
  | { type: "doom-frost-hit"; towerId: number; source: Point & { id: number }; damage: number; skillId?: "A199" }
  | { type: "doom-drain"; towerId: number; targetId: number; source: Point & { id: number }; damage: number; hp: number; remaining: number; skillId?: "A065"; nativeSkill?: "T170" }
  | { type: "doom-drain-end"; towerId: number; untilUs: number }
  | { type: "doom-poison-cast"; towerId: number; targetId: number; source: Point & { id: number }; damage: number }
  | { type: "doom-poison"; towerId: number; targetId: number; source: Point & { id: number }; damage: number; remaining: number }
  | { type: "doom-infernal"; towerId: number; targetId: number; token: number; remaining: number }
  | { type: "doom-blink"; towerId: number; point: Point }
  | { type: "doom-curse"; towerId: number; targetId: number; token: number; damage: number; remaining: number }
  | { type: "zeus-cloud"; cloudId: number; towerId: number; point: Point; remaining: number; visualUntilUs: number; visualModelId: "A106H031" | "A106G048" }
  | { type: "zeus-wrath-rebate"; towerId: number; count: number }
  | { type: "axe-bleed-impact"; towerId: number; targetId: number; source: Point & { id: number }; damage: number; travelUs: number; expiresUs: number }
  | { type: "axe-bleed-tick"; towerId: number; targetId: number; source: Point & { id: number }; damage: number; remaining: number }
  | { type: "axe-cull-rebate"; towerId: number }
  | { type: "jingu-expire"; towerId: number; untilUs: number }
  | { type: "jingu-hammer"; towerId: number; targetId: number; source: Point & { id: number }; expiresUs: number; travelUs: number }
  | { type: "soul-burn-focus"; towerId: number; targetId: number }
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
  | { type: "untouchable-carrier-expire"; ownerId: number; targetId: number; point: Point; rank: number }
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
  routeSpan?: RouteSpan;
  replica?: true;
  overdraftLife?: number;
  magnusPush?: { dx: number; dy: number; remaining: number; timerId: number };
  oracleFlame?: { timerId: number; stacks: number };
  oracleEdict?: { timerId: number };
  quills?: Record<number, { stacks: number; timerId: number }>;
  bristleGoo?: Record<number, { stacks: number; timerId: number }>;
  bristleGooArmor?: { level: number; value: number };
  firestormBurn?: { timerId: number; towerId: number; source: Point & { id: number }; rank: number; untilUs: number; nextUs: number };
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
  axeBleed?: { sourceId: number; untilUs: number };
  doomWeave?: { amount: number; untilUs: number };
  doomPoison?: Record<number, number>;
  doomTrack?: { casterId: number; amount: number; untilUs: number };
  bountyMark?: { towerId: number; timerId: number };
  bountyArmor?: { amount: number; untilUs: number; timerId: number };
  shadowWindTimer?: number;
  doomCurse?: { token: number; untilUs: number; suppressed: string[] };
  soulBurn?: { timerId: number; untilUs: number; casterId: number; casterTemplate: string;
    casterPoint: Point; itemId: "i224" | "i226"; total: number; dispelled?: true };
  bearRootLockUntilUs?: number;
  stormHammerMarkUntilUs?: number;
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
  nativeCorrosion?: { value: 10 | 25 | 40; untilUs: number };
  wave: number;
  welfare?: true;
  challengeId?: number;
  abilities?: string[];
  shield?: true;
  diseaseStartedUs?: number;
  diseaseClouds?: Record<number, { expiresUs: number; nextUs: number }>;
  poison?: Record<number, { expiresUs: number; nextUs: number; skillId: keyof typeof poisonSkills }>;
  poisonAttackSlow?: { amount: number; expiresUs: number };
  arcanePoisonUntilUs?: number;
  illuminateBlindUntilUs?: number;
  graveUntilUs?: number;
  graveCastUs?: number;
  graveSpellReadyUs?: number;
  hexSourceId?: number;
  hexForm?: string;
  seal?: { amount: number; untilUs: number };
  doomReadyUs?: number;
  overdraftArmor?: number;
};

type BookId = typeof prayerBooks[number]["id"];
type Book = { id: number; bookId: BookId; slot: number; charges: number };

type Card = { id: number; card: string; slot: number | null; point: Point; hp: number; charges: number; invulnerable?: true; bound?: true };
type Item = { id: number; itemId: string; slot: number | null; point: Point; charges: number; towerId?: number;
  hp?: number; invulnerable?: true; pawnable?: boolean };
const itemInitialLife = 75;

type Cost = { gold: number; wood: number; population: number };
type NightMarker = "T214" | "T215" | "T255" | "T256" | "T257" | "T258";
type NightHunter = { registered?: true; marks: NightMarker[]; attackRank: number; speedRank: number; personalTimer?: number };
type Construction = Disk & {
  id: number;
  templateId: string;
  population: number;
  qualification: string | null;
  hero?: Hero;
  nightHunter?: NightHunter;
  tideWaveScepter?: true;
  fingerStacks?: number;
  fingerDisplayUntilUs?: number;
  fingerDisplayPoint?: Point;
  attack?: { targetId?: number; readyUs: number; winding: boolean; startedUs: number; flameBonus?: number;
    manualFlame?: true; timing?: WeaponTiming; artillery?: ArtilleryTarget; flakToken?: number };
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
  accuracyReadyUs?: number;
  accuracySelfUntilUs?: number;
  accuracy?: { templateId: string; attack: number; agility: number; armor: number; untilUs: number };
  thunderClap?: { amount: number; untilUs: number };
  untouchable?: { attackSlow: number; movement: number; untilUs: number };
  weakAttackUntilUs?: number;
  pressTheAttackTarget?: number;
  pressTheAttack?: { rank: number; untilUs: number };
  duel?: { targetId: number; timerId: number; untilUs: number; point: Point; skin: boolean; dead?: true };
  duelWins?: number;
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
  slardarScepterAura?: true;
  scepterWard?: boolean;
  wispLink?: { targetId: number; timer: number; shared?: true; boost?: { stat: "STR" | "AGI" | "INT"; amount: number } };
  wispLinked?: true;
  novaTimer?: number;
  wispOverload?: { buff: WispOverload; timer: number };
  wispOverloadReadyUs?: number;
  wispRelocateTimer?: number;
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
  freezingFieldId?: number;
  barrageTimer?: number;
  flak?: { timerId: number; remaining: number };
  calldown?: Partial<Record<"first" | "second", number>>;
  deathWardId?: number;
  focusCycleReductionUs?: number;
  focusRestoreTimer?: number;
  focusRecoveryUntilUs?: number;
  focusFire?: { untilUs: number; sourceId: number; rank: number };
  searingChains?: EmberCycle & { targets: number[] };
  flameGuard?: EmberCycle;
  firestorm?: EmberCycle & Point;
  pit?: EmberCycle & Point;
  deathAuraCount?: number;
  sleight?: Point & { targets: number[]; next: number; cycleDeltaUs: number; timerId: number; visual: "q036" | "q043" };
  oraclePromise?: { targetId: number; timerId: number; initialHp: number; remaining: number; dead?: true };
  empower?: { rank: number; timerId: number };
  empowerTarget?: number;
  vacuum?: { timerId: number; point: Point; targets: number[]; step: number };
  ionShellTarget?: number;
  leashToken?: number;
  summon?: { ownerId: number; attack: number; speed: number; green: number; blue: number; red?: number; skillId?: string;
    independent?: true; illusion?: true; criticalItems?: string[]; intervalReduction?: number;
    output?: number; damageTaken?: number; criticalRank?: number; spectreRank?: number; wraithCritRank?: number; blademasterCritRank?: number;
    swordCleaveRank?: number; moonGlaiveRank?: number; shadowDance?: { rank: number; attributes: number }; overpowerRank?: number; doomOverpowerRank?: number;
    manaBreak?: true; manaCounter?: true; wildHowlRank?: number; beastmasterHasteRank?: number;
    phantom?: { forkRank: number; edgeRank: number; agility: number; counted: boolean };
    projectileGroup?: { extra: number; range: number; speed: number; budget?: number } };
  spiritBear?: { id?: number; stored?: number[] };
  bear?: { timerId?: number; inheritedAttack: number; scepter: boolean; gear: Record<number, number> };
  bearFrenzy?: { timerId: number; amount: number; unitId: number | null };
  bearFrenzyBonus?: number;
  bladeStormHasteUs?: number;
  heartstopperTimer?: number;
  sadist?: { half: boolean; gained: number };
  prophetTeleportTimer?: number;
  eclipse?: { periodic: number; end: number };
  godsStrength?: { untilUs: number; rank: number; variant: "A063" | "A118" };
  omnislash?: Point & { id: number; templateId: string; facing: number; lastAttackUs: number; endTimer: number; repeatTimer?: number };
  bearFormInterval?: { seconds: number; timerId: number };
  dragonShape?: HeroTransformation;
  alchemistShape?: HeroTransformation & { rank: number };
  lycanShape?: HeroTransformation;
  goblinGreed?: { timerId: number; accumulated: number };
  goblinGreedGold?: number;
  berserkerBlood?: { timerId: number; tier: number };
  innerVitality?: { timerId: number; remaining: number };
  rearmTimer?: number;
  wolfOrder?: { type: "move"; point: Point; path: Point[] } | { type: "attack"; targetId: number; path: Point[] };
  spawnOverlaps?: number[];
  walkDirection?: Point;
  necromancyReadyUs?: number;
  manaPotionUntilUs?: number;
  manaPotionReadyUs?: number;
  soulRingReadyUs?: number;
  blackKingBarReadyUs?: number;
  soulBurnReadyUs?: number;
  mirrorReadyUs?: number;
  bloodlust?: { untilUs: number; amount: number };
  overpower?: { untilUs: number; sourceId: number; rank: number };
  furySwipes?: { count: number; amount: number; untilUs: number; timerId: number };
  enrageUntilUs?: number;
  attackSpeedTrainingRank?: number;
  souls?: number;
  requiemFollowTimer?: number;
  ogreMulticast?: { count: number; atUs: number };
  spectreRefraction?: { timerId: number; untilUs: number; total: number };
  spectreDesolateReadyUs?: number;
  doomDigestTimer?: number;
  doomInfernalToken?: number;
  doomBloodlust?: { untilUs: number; amount: number };
  doomChakraTargetId?: number;
  razorStatic?: { id: number; attack: number; untilUs: number };
  razorStormUntilUs?: number;
  morphShift?: { attribute: "STR" | "AGI"; timerId: number };
  chakraTargetId?: number;
  chakraToken?: { id: number; untilUs: number };
  chakraHasteUntilUs?: number;
  chakraUses?: Record<string, number>;
  illuminateCharge?: { point: Point; orb: Point; startedUs: number; maxUs: number; timerId: number };
  doomFrost?: { token: number; targetId: number };
  doomDrain?: { untilUs: number; bonus: number };
  doomTotem?: { untilUs: number; scale: number };
  exorcismToken?: number;
  tidebringerTimer?: number;
  fleetFollowId?: number;
  fleetAura?: { layers: number; untilUs: number };
  bountyTrackTimer?: number;
  bountyTrackingGold?: number;
  upheavalId?: number;
  spiritOrder?: {
    token: number; birth: Point; sureHit: boolean; nextRoamUs: number; targetId?: number;
    move?: { kind: "roam" | "return" | "retire"; point: Point };
  };
  doomScorchToken?: number;
  doomBorrowed?: { id: string; rank: number };
  axeBloodlustUntilUs?: number;
  axeHelixUntilUs?: number;
  axeFailures?: number;
  axeRebateTimer?: number;
  jingu?: { count: number; rank?: number; untilUs?: number; displayUntilUs?: number };
  teleportReadyUs?: Partial<Record<"i207" | "i230", number>>;
  teleportTimer?: number;
  spellImmunity?: { sourceId: number; carrierUntilUs: number; untilUs: number };
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
  razorStorms?: Record<number, RazorStorm>;
  worldNight?: boolean;
  movementAnchorUs?: number;
  ionShells?: Record<number, { towerId: number; timerId: number; amount: number; remaining: number; corpsePoint?: Point }>;
  witchCurses?: Record<number, { towerId: number; rate: number; targets: { id: number; hp: number }[] }>;
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
  openingCandidates: string[];
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
  activityScore?: number;
  fragments?: number;
  eventScore?: number;
  startingScore?: number;
  spentScore?: number;
  scoreHeroClaimed?: true;
  mallHeroClaims?: string[];
  eventBoxReadyUs?: Record<string, number>;
  kills?: number;
  equipmentBurnTimer?: number;
  battleAnimations?: (Point & { atUs: number; unitId: string;
    kind: "death" | "revive" | "heal-link" | "weapon-link" | "spell-link" | "artillery-impact" | "stomp-impact" | "relocation-impact" | "model-effect" | "ice-shard";
    target?: Point; enemyId?: number; durationUs?: number })[];
  damageEvents?: { atUs: number; x: number; y: number; amount: number }[];
  recentHits?: { atUs: number; x: number; y: number; targetId: number; casterId: number; ownerId?: number; sourceTemplate?: string; amount: number; deadUnitId?: string }[];
  dragonImprints?: Record<number, { towerId: number; point: Point; untilUs: number; period: number }>;
  acidClouds?: Record<number, { towerId: number; point: Point; rank: number; amount: number }>;
  wildAxes?: Record<number, WildAxes>;
  killScore?: number;
  welfareDamage?: number;
  lastWelfareGold?: number;
  activeRuneId?: number;
  snowDuration?: number;
  knowledgeReady?: Record<string, number>;
  finalHit?: { towerId?: number; sourceId?: number; sourceTemplate?: string; targetId: number; amount: number; hpBefore: number; atUs: number; skillId?: string };
  bladeStorms?: Record<number, Point & { towerId: number; untilUs: number; raw: number }>;
  swordRainImpacts?: (Point & { atUs: number })[];
  ghostFleets?: Record<number, { towerId: number; source: Point; point: Point; amount: number;
    visual: "T079" | "T080"; seen: number[] }>;
  shadowWindAuras?: Record<number, Point & { untilUs: number }>;
  lifeDrains?: Record<number, LifeDrain>;
  fatalBonds?: Record<number, { members: number[]; untilUs: number }>;
  fatalBondsCarrier?: Point & { id: number; untilUs: number };
  upheavalAuras?: Record<number, UpheavalAura>;
  freezingFields?: Record<number, { towerId: number; point: Point; rank: number; endsUs: number; carrierIds: [number, number, number] }>;
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
  scheduleEvent(queue, us(120), { type: "world-night-change" }, us(120));
  const state: Match = {
    matchId, mapVersion, seed: seed >>> 0, randomState: seed >>> 0, queue, worldNight: false,
    clock: { targetUs: 0, fractionUs: 0, speed: 1, paused: false },
    phase: "running", vipGoldStarted: true, waveRewardSlots: [0, 0, 0, 0, 0], worker: { ...map.worker }, approach: null, wave: 0, batch: 0, totalArrivals: 0, bossArrivalUs: null, bossDeadlineUs: null, nextId: 1,
    openingCard: null, openingCandidates: [...openingChoices], openingChoicesUnlocked: false, cards: [], inventory: [], books: [], shopRestock: {}, ...openingResources,
    blackWeights: Object.fromEntries(configuration.cardPools.SR.map(id => [id, 100])), luckLevel: 0, population: 0,
    challengeShopOpen: false, qualificationShopOpen: false, mysteryShopOpen: false,
    overdraftOpen: false, enemies: [], structures: [], commandResults: {}, spawner: null,
  };
  for (let index = 0; index < waveRewards.length * 4; index++) roll(state);
  if (state.openingCandidates.length > 4) {
    const eligible = state.openingCandidates;
    state.openingCandidates = Array.from({ length: 4 }, () =>
      eligible.splice(Math.floor(roll(state) * eligible.length), 1)[0]);
  }
  if (seasons) state.seasons = structuredClone(seasons);
  deliverItem(state, "i004");
  deliverItem(state, "i006");
  return state;
}

export function spendableScore(state: Match) {
  return (state.startingScore ?? 0) + (state.seasonScore ?? 0) + (state.eventScore ?? 0) - (state.spentScore ?? 0);
}

export function containmentPoints(state: Match) {
  return state.enemies.reduce((sum, enemy) => sum + (!enemy.replica && contains(map.containment, enemy) ? enemy.points : 0), 0);
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
  if (state.movementAnchorUs === undefined) {
    const nextAnchor = state.queue.pending.find(event => event.payload.type === "movement" && event.periodUs === movementStepUs);
    if (nextAnchor) state.movementAnchorUs = nextAnchor.dueUs;
  }
  reconcileDiseaseClouds(state, [enemy]);
  rescheduleSweepContact(state, enemy);
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
  const life = hp * (1 + hpFactor * overdraft);
  for (let count = 0; count < wave.unitsPerBatch; count++) {
    spawn(state, { unitId, layer, speed, radius, points, hp: life, ...(life === hp ? {} : { overdraftLife: life - hp }),
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

function deliverCard(state: Match, card: string, point = state.worker, refundHp?: number, bound?: true) {
  const item = summonCards.get(card)?.itemFields;
  if (!item || item.HP === null || item.uses === null) throw new Error(`Missing M2 summon card ${card}`);
  const id = state.nextId++;
  const slot = freeWorkerSlot(state);
  state.cards.push({ id, card, slot, point: { x: point.x, y: point.y }, ...(slot === null ? {} : { invulnerable: true }),
    hp: refundHp ?? item.HP, charges: refundHp === undefined ? item.uses : 1, ...(bound ? { bound } : {}) });
  return id;
}

export function canChooseOpening(state: Match) {
  return state.openingCard === null && state.openingChoicesUnlocked !== false;
}

function removeItem(state: Match, item: Item, owner = itemOwner(state, item.towerId)) {
  state.inventory!.splice(state.inventory!.indexOf(item), 1);
  if (owner) withdrawBearGear(state, owner, item.id);
  if (item.itemId === "i310" && owner) removeScepterEffects(state, owner);
  refreshEquippedResources(state, owner, item.itemId);
}

export const circleId = 0;
const circle: Construction = { ...map.energyCircle, id: circleId, radius: 0, templateId: "w000", population: 0, qualification: null, pending: null };

const brokenSwords = new Map([["i131", "i132"], ["i133", "i134"], ["i262", "i263"]]);
export const isBrokenSword = (itemId: string) => brokenSwords.has(itemId);
const workerOnlyItems = new Set(["i256", "i329", "i278", "i131", "i133", "i262"]);
const recycleDestroyedItems = new Set(["i547", "i548", "i549", "i550", "i546", "i330", "i004", "i545"]);

function energyCircle(tower: Construction) {
  return tower.templateId === "w000";
}

function equipmentAllowed(state: Match, itemId: string, tower: Construction) {
  if (energyCircle(tower)) return itemId !== "i256" && itemId !== "i278";
  const level = itemFields.get(itemId)?.Level ?? 0;
  if (tower.bear && itemId === "i310") return true;
  return !workerOnlyItems.has(itemId) && level <= 10 && (level <= 3 || qualified(state, tower.summon?.ownerId ?? tower.id));
}

function freeItemSlot(state: Match, tower?: Construction) {
  if (!tower) return freeWorkerSlot(state);
  const slots = tower.templateId === "n208" ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5];
  return slots.find(slot => !state.inventory?.some(item => item.towerId === tower.id && item.slot === slot)) ?? null;
}

function itemOwner(state: Match, towerId: number | undefined) {
  return towerId === circleId ? circle : state.structures.find(tower => tower.id === towerId) ??
    state.summons?.find(unit => unit.id === towerId && unit.bear);
}

export function canMoveItem(itemId: string) {
  return itemId !== "i330" && itemFields.get(itemId)?.droppable === 1;
}

const pawnShops = new Set([...ordinaryGoods.values()].map(good => good.shop));

export function itemSaleQuote(state: Match, item: Item, shop: string) {
  if (state.phase !== "running" || !pawnShops.has(shop) || item.slot === null) return;
  const owner = itemOwner(state, item.towerId);
  if (item.towerId !== undefined && (!owner || owner.pending || owner.life && owner.life.hp <= 0)) return;
  const fields = itemFields.get(item.itemId);
  if (!(item.pawnable ?? fields?.pawnable === 1)) return;
  const gold = pawnGold.get(item.itemId);
  if (gold === undefined) return;
  const uses = fields?.uses ?? 0;
  return Math.floor(uses > 0 ? gold * item.charges / (2 * uses) : gold / 2);
}

function dropItem(state: Match, item: Item, tower = itemOwner(state, item.towerId)) {
  const owner = tower ?? state.worker;
  if (item.slot !== null) item.invulnerable = true;
  item.slot = null;
  item.point = { x: owner.x, y: owner.y };
  delete item.towerId;
  if (tower) withdrawBearGear(state, tower, item.id);
  if (item.itemId === "i310" && tower) removeScepterEffects(state, tower);
  refreshEquippedResources(state, tower, item.itemId);
}

function refreshEquippedResources(state: Match, owner: Construction | undefined, itemId: string) {
  if (!owner || energyCircle(owner)) return;
  const shape = owner.dragonShape ?? owner.alchemistShape ?? owner.lycanShape;
  if (itemId === "i282" && shape) {
    const lance = towerGear(state, owner).some(item => item.itemId === "i282");
    const bonus = weapons[owner.templateId][0].kind === "normal" ? 100 : 200;
    if (lance !== shape.lance) shape.rangeDelta += lance ? bonus : -bonus;
    shape.lance = lance;
  }
  weaponRatesDirty.add(state);
  if (owner.life) syncTowerLife(state, owner);
  if (itemId === "i129" || itemId === "i161") {
    for (const tower of state.structures) {
      if (tower.manaLastUs !== undefined && (tower.x - owner.x) ** 2 + (tower.y - owner.y) ** 2 <= 1000 ** 2) syncMana(state, tower);
    }
  } else if (owner.manaLastUs !== undefined) syncMana(state, owner);
}

function hasPhysicalScepter(state: Match, tower: Construction) {
  return towerGear(state, tower).some(item => item.itemId === "i310");
}

function hasScepter(state: Match, tower: Construction) {
  return hasPhysicalScepter(state, tower) || !!state.structures.find(source =>
    source.wispLink?.targetId === tower.id && source.wispLink.shared);
}

export function activeHeroSkill(tower: Construction, skillId: string) {
  return skillId === "A217" && tower.tideWaveScepter ? "A218" : skillId;
}

function grantScepterEffects(state: Match, tower: Construction) {
  if (tower.templateId === "H057") tower.tideWaveScepter = true;
  if (tower.hero?.ranks.A033) tower.slardarScepterAura = true;
  if (tower.hero?.ranks.A105) {
    tower.hero.ranks.A106 = 1;
    (tower.heroSpellReady ??= {}).A106 = state.queue.nowUs + us(15);
  }
  if (tower.hero?.ranks.A153) tower.scepterSwap = { grant: state.queue.nextSequence++, readyUs: state.queue.nowUs + us(10) };
  if (tower.templateId === "H029") tower.scepterWard = !!tower.hero?.ranks.A094;
}

function removeScepterEffects(state: Match, tower: Construction) {
  if (hasScepter(state, tower)) return;
  if (tower.templateId === "H057") delete tower.tideWaveScepter;
  if (tower.hero?.ranks.A033) delete tower.slardarScepterAura;
  if (tower.hero?.ranks.A106) {
    delete tower.hero.ranks.A106;
    if (tower.heroSpellReady) delete tower.heroSpellReady.A106;
  }
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
  if (itemChargeStacks.has(item.itemId) || eventBoxes.has(item.itemId)) {
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
    grantScepterEffects(state, tower);
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
  if (!fields && !eventBoxes.has(itemId)) throw new Error(`缺少物品定义 ${itemId}`);
  const point = tower ?? state.worker;
  const slot = tower && !equipmentAllowed(state, itemId, tower) ? null : freeItemSlot(state, tower);
  const item: Item = { id: state.nextId++, itemId, slot,
    charges: charges ?? fields?.uses ?? 0, hp: itemInitialLife, point: { x: point.x, y: point.y } };
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
      spawnTowerIllusions(state, tower, "i722", 1, 10, .4, 2);
    }
  }
}

export function usableWorkerItem(itemId: string) {
  return eventBoxes.has(itemId) || itemId === "i256" || itemId === "i004" || itemId === "i006" || itemId === "i278" || chestKeys.has(itemId) || Object.hasOwn(configuration.cardRolls, itemId);
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
  const box = eventBoxes.get(item.itemId);
  if (box) {
    if (item.charges < 1) return { ok: false, reason: "missing" };
    const now = state.queue.nowUs;
    if (now < (state.eventBoxReadyUs?.[box.cooldownGroup] ?? 0)) return { ok: false, reason: "cooldown" };
    (state.eventBoxReadyUs ??= {})[box.cooldownGroup] = now + us(1);
    // All permanent candidates are owned under Q19–Q21. The rare draw still advances RNG.
    rollPercent(state);
    const fragments = rollPercent(state) <= box.currencyFallback.skinPiece.branchRollInclusive[1];
    const [minimum, maximum] = (fragments ? box.currencyFallback.skinPiece : box.currencyFallback.score).amountInclusive;
    const amount = minimum + Math.floor(roll(state) * (maximum - minimum + 1));
    const currency = fragments ? "fragments" : "score";
    if (fragments) state.fragments = (state.fragments ?? 0) + amount;
    else state.eventScore = (state.eventScore ?? 0) + amount;
    consumeCharge();
    return { ok: true, eventReward: { currency, amount } };
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
  if (!tower || (tower.life?.hp ?? 1) <= 0) return false;
  const chain = qualificationChains.get(tower.qualification ?? "");
  return !!chain && state.structures.some(provider => provider.templateId === chain.requireUnit &&
    (provider.life?.hp ?? 1) > 0 && (!provider.pending || provider.pending.upgradeTo !== undefined));
}

// Domain entry for direct item rewards and enemy death experience.
export function grantHeroExperience(state: Match, towerId: number, amount: number) {
  if (state.phase !== "running") return;
  const tower = state.structures.find(entry => entry.id === towerId);
  if (!tower?.hero || tower.pending) return;
  addHeroExperience(tower.hero, tower.templateId, amount, () => qualified(state, towerId), () => {
    if (state.talent?.id === "W019") applyTalentAttributes(tower.hero!, state.talent.rank);
    if (tower.hero!.ranks.A225 && tower.life) syncTowerLife(state, tower);
    weaponRatesDirty.add(state);
  }, tower.hero.ranks.A225 ? () => {
    syncTowerLife(state, tower);
    const offset = tower.lifeOffset;
    tower.lifeOffset = (offset ?? 0) + 1000;
    syncTowerLife(state, tower);
    if (offset === undefined) delete tower.lifeOffset;
    else tower.lifeOffset = offset;
    syncTowerLife(state, tower);
  } : undefined);
}

export function restoreHeroState(state: Match, restoreLegacyAwards = true) {
  if (state.seasons) {
    if (restoreLegacyAwards) {
      creditTask(state, "spring", 7, 666);
      creditTask(state, "summer", 7, 666);
    }
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
        bladeStormHasteUs: tower.bladeStormHasteUs,
        strafeUntilUs: tower.strafeUntilUs, frenzyUntilUs: tower.frenzyUntilUs, axeBloodlustUntilUs: tower.axeBloodlustUntilUs,
        bloodlust: tower.bloodlust?.untilUs, overpower: tower.overpower?.untilUs,
        doomBloodlust: tower.doomBloodlust?.untilUs, fleetAura: tower.fleetAura?.untilUs,
        pressTheAttack: tower.pressTheAttack?.untilUs, focusFire: tower.focusFire?.untilUs,
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

function relocation(state: Match, tower: Construction, request: Point = state.worker, terrainFallback = true, combatMovement = false) {
  if (terrainFallback && !terrainAllowsConstruction(request)) {
    const fallback = Array.from({ length: 13 }, (_, index) => {
      const angle = index * Math.PI / 6;
      return { x: request.x + 250 * Math.cos(angle), y: request.y + 250 * Math.sin(angle) };
    }).find(terrainAllowsConstruction);
    if (!fallback) return false;
    request = fallback;
  }

  const others = state.structures.filter(entry => entry !== tower);
  const footprints = others.filter(entry => footprintTowers.has(entry.templateId)).map(buildFootprint);
  const fit = (point: Point) => {
    if (!combatMovement) return buildAnchor(point, tower.radius, others, footprints, footprintTowers.has(tower.templateId), false);
    const disk = { ...point, radius: tower.radius };
    if (staticSweep(point, point, tower.radius, "ground", footprints) && !others.some(other => overlaps(disk, other))) return disk;
  };
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
    const origin = { x: tower.x, y: tower.y };
    Object.assign(tower, destination);
    if (emitsManaAura(tower)) refreshManaAuras(state, origin, tower);
    else if (tower.manaLastUs !== undefined) syncMana(state, tower);
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
    state.activityScore = (state.activityScore ?? 0) + low + Math.floor(roll(state) * (high - low + 1));
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
  if (ownerId !== undefined && state.structures.some(tower => tower.id === ownerId) && enemy.bountyMark) {
    const tracker = state.structures.find(tower => tower.id === enemy.bountyMark!.towerId);
    cancelEvent(state.queue, enemy.bountyMark.timerId);
    delete enemy.bountyMark;
    const rank = tracker?.hero?.ranks.A091 ?? 0;
    if (tracker && rank >= 1 && rank <= 6) {
      const minimum = [10, 15, 20, 25, 30, 50][rank - 1];
      const maximum = [50, 60, 70, 80, 90, 110][rank - 1];
      const amount = (minimum + Math.floor(roll(state) * (maximum - minimum + 1))) * (mapBoss(enemy) ? 6 : 1);
      tracker.bountyTrackingGold = (tracker.bountyTrackingGold ?? 0) + amount;
      state.gold += amount;
    }
  }
  for (const tower of state.structures) {
    if (tower.duel?.targetId === enemyId) tower.duel.dead = true;
    if (tower.oraclePromise?.targetId === enemyId) tower.oraclePromise.dead = true;
  }
  if (enemy.oracleFlame) cancelEvent(state.queue, enemy.oracleFlame.timerId);
  if (enemy.oracleEdict) cancelEvent(state.queue, enemy.oracleEdict.timerId);
  if (enemy.magnusPush) cancelEvent(state.queue, enemy.magnusPush.timerId);
  if (enemy.firestormBurn) cancelEvent(state.queue, enemy.firestormBurn.timerId);
  for (const { timerId } of Object.values(enemy.quills ?? {})) cancelEvent(state.queue, timerId);
  for (const { timerId } of Object.values(enemy.bristleGoo ?? {})) cancelEvent(state.queue, timerId);
  endEnemyLeashes(state, enemy);
  for (const tower of state.structures) {
    const rank = tower.hero?.ranks.A235;
    if (!rank || tower.pending || (tower.life?.hp ?? 1) <= 0 || (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 > 700 ** 2) continue;
    tower.deathAuraCount = (tower.deathAuraCount ?? 0) + 2;
    const amount = [5, 10, 15, 25, 35, 50][rank - 1];
    tower.permanentAttack = (tower.permanentAttack ?? 0) + amount + (tower.deathAuraCount <= 3000 ? 2 : 0);
    scheduleEvent(state.queue, us(20), { type: "death-aura-end", towerId: tower.id, amount });
  }
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
    const soulRank = owner?.hero?.ranks.A002;
    if (owner && soulRank) {
      const souls = mapBoss(enemy) ? 10 : 1;
      const cap = [200, 250, 300, 350, 400, 500][soulRank - 1] * (hasScepter(state, owner) ? 2 : 1);
      const gained = owner.souls === undefined ? souls : Math.max(0, Math.min(souls, cap - owner.souls));
      if (gained > 0) {
        owner.souls = (owner.souls ?? 0) + gained;
        if (owner.templateId === "G053") recordBattleAnimation(state, enemy, "T136", "model-effect", owner);
      }
    }
    if (owner && enemy.doomTrack && enemy.doomTrack.untilUs > state.queue.nowUs) {
      const tracker = state.structures.find(tower => tower.id === enemy.doomTrack!.casterId);
      if (tracker?.doomBorrowed?.id === "T319") {
        const rank = tracker.doomBorrowed.rank;
        const minimum = 5 + rank * 5;
        const maximum = 40 + rank * 10;
        state.gold += (minimum + Math.floor(roll(state) * (maximum - minimum + 1))) * (mapBoss(enemy) ? 6 : 1);
      }
    }
    if (owner) {
      if (owner.doomBorrowed?.id === "T320") {
        syncTowerLife(state, owner);
        owner.lifeOffset = (owner.lifeOffset ?? 0) + 3 + owner.doomBorrowed.rank;
        syncTowerLife(state, owner);
      }
      const greedRank = owner.hero?.ranks.A109;
      if (greedRank) {
        const minimum = 3 * greedRank;
        const maximum = [5, 10, 20, 35, 55, 80][greedRank - 1] + (owner.alchemistShape ? 2 * (owner.hero?.ranks.A110 ?? 0) : 0);
        const old = owner.goblinGreed;
        const payout = Math.min(maximum, old ? Math.max(minimum, old.accumulated + 1) : minimum);
        if (old) cancelEvent(state.queue, old.timerId);
        owner.goblinGreed = { accumulated: Math.max(old?.accumulated ?? 0, payout),
          timerId: scheduleEvent(state.queue, us(5), { type: "goblin-greed-end", towerId: owner.id }) };
        creditGoblinGold(state, owner, payout);
      }
      const sadistRank = owner.hero?.ranks.A048;
      if (sadistRank) {
        const growth = owner.sadist ??= { half: false, gained: 0 };
        growth.half = !growth.half;
        const maximum = [100, 250, 400, 550, 700, 1000][sadistRank - 1] + (hasScepter(state, owner) ? 400 : 0);
        if (!growth.half && growth.gained < maximum) {
          syncMana(state, owner);
          growth.gained++;
          owner.hero!.natural.INT++;
          syncMana(state, owner);
        }
      }
      const gear = towerGear(state, owner);
      if (owner.hero?.ranks.A009) {
        syncTowerLife(state, owner);
        owner.lifeOffset = (owner.lifeOffset ?? 0) + 7;
        syncTowerLife(state, owner);
      }
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
      if (tower.pending || towerSpellImmune(tower, now) || now < (tower.weakenedUntilUs ?? 0) ||
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

function weaponRange(weapon: Weapon, gear: Item[], tower: Construction) {
  return (tower.dragonShape ?? tower.alchemistShape ?? tower.lycanShape)?.rangeDelta ?? (gear.some(item => item.itemId === "i282") ? weapon.kind === "normal" ? 100 : 200 : 0);
}

export function attackRange(state: Match, tower: Construction) {
  const gear = towerGear(state, tower);
  return Math.max(0, ...(weapons[tower.templateId] ?? []).map(weapon =>
    Math.min(weapon.acquire, weapon.max) + weaponRange(weapon, gear, tower)));
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
  if (distance >= weapon.min && distance <= weapon.max + weaponRange(weapon, towerGear(state, tower), tower)) return point;
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
  const ensnaredAir = enemy.layer === "fly" && Math.max(enemy.bearRootUntilUs ?? 0, enemy.searingChainsUntilUs ?? 0, enemy.pitNetUntilUs ?? 0) > nowUs && targets.includes("ground");
  return enemy.hp > 0 && nowUs >= (enemy.phaseUntilUs ?? 0) && (ensnaredAir || targets.includes(targetType ?? (enemy.layer === "fly" ? "air" : "ground")));
}

function towerSpellImmune(tower: Construction, now: number) {
  return !!tower.bear || (tower.spellImmunity?.untilUs ?? 0) > now;
}

function magicImmune(enemy: Enemy) {
  return enemy.abilities?.some(id => ["Amim", "ACm2", "ACm3", "ACmi", "AImu", "AImx", "T060"].includes(id));
}

function mechanicalEnemy(enemy: Enemy) {
  return unitTargetType.get(enemy.unitId) === "mechanical" || enemy.abilities?.includes("Amec") ||
    unitBalance.get(enemy.unitId)?.type?.split(",").includes("mechanical");
}

const diseaseCloudSources = new Map([
  ["n196", { id: "N073", damage: 10 }],
  ["n197", { id: "N074", damage: 20 }],
  ["n198", { id: "N075", damage: 30 }],
]);
const poisonSkills = { N093: 50, N095: 150, A011: 40, A012: 80 } as const;
const nonlethalCreepSkills = new Set([...diseaseCloudSources.values()].map(skill => skill.id).concat(Object.keys(poisonSkills)));

function organicPhysicalTarget(state: Match, enemy: Enemy, layers: string[]) {
  return targetable(enemy, layers, state.queue.nowUs) && !mechanicalEnemy(enemy) &&
    !enemy.abilities?.some(id => id === "Aloc" || id === "Avul" || id === "Aeth");
}

function diseaseTarget(state: Match, enemy: Enemy) {
  return organicPhysicalTarget(state, enemy, ["ground"]) && !unitBalance.get(enemy.unitId)?.type?.split(",").includes("undead");
}

function reconcileDiseaseClouds(state: Match, enemies = state.enemies) {
  const sources = state.structures.filter(tower => diseaseCloudSources.has(tower.templateId) &&
    (!tower.pending || tower.pending.upgradeTo) && (tower.life?.hp ?? 1) > 0).sort((a, b) => a.id - b.id);
  const now = state.queue.nowUs;
  if (!sources.length) return;
  const targets = enemies.filter(enemy => {
    if (diseaseTarget(state, enemy)) return true;
    delete enemy.diseaseClouds;
    return false;
  }).sort((a, b) => a.id - b.id);
  for (const tower of sources) {
    for (const enemy of targets) {
      if ((enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > 500 ** 2) continue;
      const clouds = enemy.diseaseClouds ??= {};
      const infection = clouds[tower.id];
      if (infection && now <= infection.expiresUs) {
        infection.expiresUs = now + us(100);
      } else {
        clouds[tower.id] = { expiresUs: now + us(100), nextUs: now + us(1) };
        scheduleEvent(state.queue, us(1), { type: "disease-tick", towerId: tower.id, enemyId: enemy.id });
      }
    }
  }
}

function tickDiseaseCloud(state: Match, towerId: number, enemyId: number) {
  const enemy = state.enemies.find(entry => entry.id === enemyId);
  const infection = enemy?.diseaseClouds?.[towerId];
  const now = state.queue.nowUs;
  if (!enemy || !infection || infection.nextUs !== now) return;
  const tower = state.structures.find(entry => entry.id === towerId);
  const effect = tower && diseaseCloudSources.get(tower.templateId);
  if (!tower || !effect || now > infection.expiresUs || !diseaseTarget(state, enemy)) {
    delete enemy.diseaseClouds![towerId];
    return;
  }
  if (now < infection.expiresUs) {
    infection.nextUs += us(1);
    scheduleEvent(state.queue, us(1), { type: "disease-tick", towerId, enemyId });
  } else {
    delete enemy.diseaseClouds![towerId];
  }
  damageEnemy(state, tower, tower.templateId, enemy,
    physicalDamage(effect.damage, "normal", armorAt(state, enemy), !!enemy.welfare), "physical", effect.id);
}

function clearPoisonSource(enemy: Enemy, towerId: number) {
  if (!enemy.poison?.[towerId]) return;
  delete enemy.poison[towerId];
  const expiresUs = Math.max(0, ...Object.values(enemy.poison).map(infection => infection.expiresUs));
  if (!expiresUs) {
    delete enemy.poison;
    delete enemy.poisonAttackSlow;
  } else if (enemy.poisonAttackSlow) {
    enemy.poisonAttackSlow.expiresUs = expiresUs;
  }
}

function tickTowerPoison(state: Match, towerId: number, enemyId: number) {
  const enemy = state.enemies.find(entry => entry.id === enemyId);
  const infection = enemy?.poison?.[towerId];
  if (!enemy || !infection) return;
  const tower = state.structures.find(entry => entry.id === towerId);
  const now = state.queue.nowUs;
  if (!tower || now > infection.expiresUs || !organicPhysicalTarget(state, enemy, ["ground", "air"])) {
    clearPoisonSource(enemy, towerId);
    return;
  }
  if (now === infection.nextUs) {
    infection.nextUs += us(1);
    damageEnemy(state, tower, tower.templateId, enemy,
      physicalDamage(poisonSkills[infection.skillId], "normal", armorAt(state, enemy), !!enemy.welfare), "physical", infection.skillId);
    if (state.phase !== "running" || !state.enemies.includes(enemy)) return;
  }
  if (now >= infection.expiresUs) clearPoisonSource(enemy, towerId);
  else scheduleEvent(state.queue, Math.min(infection.nextUs, infection.expiresUs) - now, { type: "poison-tick", towerId, enemyId });
}

function resistantToControl(enemy: Enemy) {
  return /^[A-Z]/.test(enemy.unitId) || enemy.abilities?.some(id => ["N534", "Arsk", "ACrk", "ACsk"].includes(id));
}

function weaponTargetable(enemy: Enemy, weapon: Weapon, nowUs: number, targets = weapon.targets) {
  return targetable(enemy, targets, nowUs) && !enemy.abilities?.some(id => id === "Aloc" || id === "Avul") &&
    (weapon.attackType === "magic" ? !magicImmune(enemy) : !enemy.abilities?.includes("Aeth"));
}

export function attackOrb(tower: Construction) {
  const flame = { id: "A040", name: "灼热之箭", bonus: 0, range: 800, cost: 0, defaultAuto: false, frostRank: 0 };
  if (tower.templateId === "n142") return { ...flame, bonus: 40 };
  if (tower.templateId === "n143") return { ...flame, bonus: 100 };
  const ranks = tower.hero?.ranks;
  const arcaneRank = ranks?.A083 ?? 0;
  if (arcaneRank) return { ...flame, id: "A083", name: "秘法天球", range: 1300, cost: 50 + 50 * arcaneRank };
  const flameRank = ranks?.A040 ?? 0;
  if (flameRank) return { ...flame, bonus: [500, 700, 900, 1100, 1300, 1500][flameRank - 1],
    range: 1300, cost: 3, defaultAuto: true };
  const id = tower.templateId === "G073" ? "A210" : "A070";
  const frostRank = ranks?.[id] ?? 0;
  return frostRank ? { id, name: "霜冻之箭", bonus: 0, range: 1200, cost: 3, defaultAuto: false, frostRank } : undefined;
}

function flameTargetable(state: Match, tower: Construction, enemy: Enemy, range: number) {
  return !enemy.abilities?.some(id => id === "Aloc" || id === "Avul" || id === "Aeth") &&
    canSeeEnemy(state, enemy) && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= range ** 2;
}

function flameWeapon(state: Match, tower: Construction, enemy: Enemy, orb: NonNullable<ReturnType<typeof attackOrb>>) {
  if (!flameTargetable(state, tower, enemy, orb.range) || orb.id === "A083" && !organicWaveTarget(state, enemy)) return undefined;
  const distance = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
  return weapons[tower.templateId]?.find(slot => distance >= slot.min && weaponTargetable(enemy, slot, state.queue.nowUs));
}

export function flameArrowTargets(state: Match, towerId: number) {
  const tower = state.structures.find(entry => entry.id === towerId);
  const effect = tower && attackOrb(tower);
  if (!tower || !effect || tower.pending) return undefined;
  return state.enemies.filter(enemy => flameWeapon(state, tower, enemy, effect));
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
  return !enemyIsInvisible(enemy, now) || (enemy.doomTrack?.untilUs ?? 0) > now || (enemy.bountyArmor?.untilUs ?? 0) > now ||
    state.inventory?.some(item => {
      if (item.itemId !== "i206" || item.slot === null) return false;
      const owner = itemOwner(state, item.towerId);
      if (item.towerId !== undefined && (!owner || owner.pending && !owner.pending.upgradeTo)) return false;
      const source = owner ?? state.worker;
      return (source.x - enemy.x) ** 2 + (source.y - enemy.y) ** 2 <= 1100 ** 2;
    }) ||
    state.detectors?.some(detector => (detector.x - enemy.x) ** 2 + (detector.y - enemy.y) ** 2 <= (detector.templateId === "b116" ? 1100 : 1000) ** 2) ||
    state.summons?.some(unit => /^b16[2-7]$/.test(unit.templateId) && (unit.life?.hp ?? 1) > 0 &&
      (unit.x - enemy.x) ** 2 + (unit.y - enemy.y) ** 2 <= 1000 ** 2) ||
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

function accuracyAttack(state: Match, tower: Construction) {
  const active = tower.accuracy;
  return active && active.templateId === tower.templateId && state.queue.nowUs < active.untilUs ? active.attack : 0;
}

type TroopAuraSkill = "N016" | "N103" | "N104";

export function troopAuraSkill(tower: Construction): TroopAuraSkill | undefined {
  if ((tower.pending && !tower.pending.upgradeTo) || (tower.life?.hp ?? 1) <= 0) return;
  if (tower.templateId === "n213") return "N016";
  if (tower.templateId === "n230" || tower.templateId === "n233") return "N103";
  if (tower.templateId === "n236" || tower.templateId === "n239") return "N104";
}

export function troopAuraInRange(source: Point, receiver: Point) {
  return (source.x - receiver.x) ** 2 + (source.y - receiver.y) ** 2 <= 1000 ** 2;
}

export function troopAuraAffects(skill: TroopAuraSkill, weapon: Weapon) {
  return skill === "N016" || (skill === "N103") === (weapon.kind === "normal");
}

function troopAttackAura(state: Match, tower: Construction, weapon: Weapon) {
  let command = false;
  let combat = false;
  for (const source of state.structures) {
    const skill = troopAuraSkill(source);
    if (!skill || !troopAuraInRange(source, tower) || !troopAuraAffects(skill, weapon)) continue;
    if (skill === "N016") command = true;
    else combat = true;
    if (command && combat) break;
  }
  return (command ? .15 : 0) + (combat ? .4 : 0);
}

function splitArrowEngineeringAttack(tower: Construction) {
  return tower.templateId === "G035" || tower.templateId === "G043" ? 2 : 0;
}

function weaponContributions(state: Match, tower: Construction, weapon: Weapon, gear: Item[]) {
  const primary: unknown = unitBalance.get(tower.templateId)?.Primary;
  const attribute = primary === "STR" || primary === "AGI" || primary === "INT" ? combatAttributes(state, tower)[primary] : 0;
  const totem = tower.doomTotem;
  const base = (weapon.base + attribute * 1.4 + (tower.hero?.growthBonus?.attack ?? 0) + accuracyAttack(state, tower) + (tower.bear?.inheritedAttack ?? 0) + (tower.razorStatic?.attack ?? 0)) *
    (totem && totem.untilUs > state.queue.nowUs ? totem.scale : 1);
  const aura = attackAura(state, tower);
  const weak = state.queue.nowUs < (tower.weakAttackUntilUs ?? 0) ? .5 : 0;
  const troopAura = troopAttackAura(state, tower, weapon);
  const godsStrength = tower.godsStrength && tower.godsStrength.untilUs > state.queue.nowUs
    ? [1.8, 2.6, 3.4, 4, 4.2, 5][tower.godsStrength.rank - 1] : 0;
  const wildHowlRank = tower.hero?.ranks.A168 ?? tower.summon?.wildHowlRank;
  const wildHowl = wildHowlRank ? [10, 18, 26, 34, 42, 50][wildHowlRank - 1] / 100 : 0;
  const empower = tower.empower ? [.20, .25, .30, .35, .40, .50][tower.empower.rank - 1] : 0;
  const percent = troopAura + godsStrength + wildHowl + empower +
    (tower.summon?.illusion ? 0 : aura.command + aura.drums + aura.banner + aura.vengeance - weak);
  const form = tower.hero?.divineForm;
  const divineAttack = form?.id === "P215" || form?.id === "P216" ?
    divineField(form.id === "P215" ? "T116" : "T115", "DataA", form.stars) : 0;
  let moonAura = 0;
  for (const source of state.structures) {
    const rank = source.hero?.ranks.A053;
    if (!rank || source.pending || (source.life?.hp ?? 1) <= 0 ||
        (source.x - tower.x) ** 2 + (source.y - tower.y) ** 2 > 500 ** 2) continue;
    moonAura = Math.max(moonAura, [100, 130, 160, 190, 240, 300][rank - 1]);
  }
  const fixed = splitArrowEngineeringAttack(tower) + moonAura + divineAttack + (tower.permanentAttack ?? 0) + 50 * (tower.hero?.ranks.A127 ?? 0) + (tower.furySwipes?.amount ?? 0) +
    3 * (tower.souls ?? 0) + 100 * (tower.duelWins ?? 0) + 50 * (tower.berserkerBlood?.tier ?? 0) +
    nightHunterBonus(tower.nightHunter?.attackRank, nightAttack) +
    (tower.pressTheAttack && state.queue.nowUs < tower.pressTheAttack.untilUs ? 200 + 100 * tower.pressTheAttack.rank : 0) +
    gear.reduce((sum, item) => sum + (flatAttack.get(item.itemId) ?? 0), tower.summon?.attack ?? 0) +
    (tower.contracts ? Object.values(tower.contracts).reduce((sum, attack) => sum + attack, 0) : 0);
  return { base, percent, fixed, moonAura, banner: aura.banner };
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
  range: number, maximum: number, damage: number, skillId: string, jump = 600) {
  const nativeLightning = skillId === "A029";
  const hawkLightning = /^T(?:269|27[0-4])$/.test(skillId);
  const eligible = (target: Enemy) => nativeLightning
    ? targetable(target, ["ground", "air"], state.queue.nowUs) && !magicImmune(target) && canSeeEnemy(state, target) &&
      !target.abilities?.some(id => id === "Aloc" || id === "Avul")
    : organicWaveTarget(state, target) && (skillId !== "A104" || canSeeEnemy(state, target));
  if (!eligible(primary) || (primary.x - source.x) ** 2 + (primary.y - source.y) ** 2 > range ** 2 ||
    consumeEnemySpellShield(state, primary)) return;
  const hawk = hawkLightning ? firingUnit(state, source.id)! : undefined;
  if (hawk) triggerSpellEquipment(state, hawk, skillId);
  const visited = new Set<number>();
  let target: Enemy | undefined = primary;
  let from: Point = source;
  while (target && visited.size < maximum && state.phase === "running") {
    const x: number = target.x;
    const y: number = target.y;
    visited.add(target.id);
    const owner = state.structures.find(tower => tower.id === towerId && !tower.pending);
    if (nativeLightning && !owner) return;
    if (hawk && (!state.summons?.includes(hawk) || hawk.life?.hp === 0)) return;
    if (nativeLightning || hawk) recordBattleAnimation(state, from, hawk?.templateId ?? owner!.templateId, "spell-link", target);
    damageEnemy(state, owner, hawk?.templateId ?? (nativeLightning ? owner!.templateId : "q001"), target, damage, "magic", skillId, source);
    from = { x, y };
    target = state.enemies.filter(enemy => !visited.has(enemy.id) && eligible(enemy) &&
      (enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= jump ** 2).sort((left, right) => left.id - right.id)[0];
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
  if (tower.lycanShape) {
    values.STR -= 22;
    values.AGI += 7;
  }
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
  if (tower.accuracy && state.queue.nowUs < tower.accuracy.untilUs) values.AGI += tower.accuracy.agility;
  for (const source of state.structures) {
    const link = source.wispLink;
    if (link?.targetId === tower.id && link.boost) values[link.boost.stat] += link.boost.amount;
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
  const staticMaximum = (stats?.HP ?? 1) + strength * 15 + (tower.dragonShape || tower.alchemistShape || tower.lycanShape ? 500 : 0) +
    gear.reduce((sum, item) => sum + (lifeLimits.get(item.itemId) ?? 0), 0);
  const divineLife = divineLifeBonus(tower.hero?.divineForm);
  const maximum = staticMaximum + (tower.lifeOffset ?? 0) + divineLife + 4 * gear.reduce((sum, item) =>
    sum + (bloodItems.includes(item.itemId) ? item.charges : 0), 0);
  const prev = tower.life;
  const hp = prev ? Math.min(prev.maximum, prev.hp + prev.regen * (now - prev.lastUs) / 1_000_000) +
    staticMaximum - prev.staticMaximum + divineLifeChange : staticMaximum + divineLife;
  const baseRegen = stats?.regenType === "always" || stats?.regenType === (state.worldNight ? "night" : "day") ? stats.regenHP ?? 0 : 0;
  const regen = baseRegen + strength * .1 +
    (gear.some(item => item.itemId === "i332" || item.itemId === "i145") ? maximum * .04 : 0);
  return tower.life = { hp: prev?.hp === 0 ? 0 : Math.max(1, Math.min(maximum, hp)), maximum, staticMaximum, lastUs: now, regen };
}

type HeroTransformation = { normal: string; timerId: number; rangeTimerId?: number; lance: boolean; rangeDelta: number };

function enterHeroTransformation(state: Match, tower: Construction, skillId: "A010" | "A239" | "A110" | "A169", rank: number) {
  const normal = tower.templateId;
  const timerId = state.queue.nextSequence;
  const alchemist = skillId === "A110";
  const lycan = skillId === "A169";
  scheduleEvent(state.queue, us(lycan ? 18 : 20), { type: lycan ? "lycan-end" : alchemist ? "alchemist-end" : "dragon-end", towerId: tower.id, formTimer: timerId });
  syncTowerLife(state, tower);
  const lance = towerGear(state, tower).some(item => item.itemId === "i282");
  const shape: HeroTransformation & { rank: number } = { normal, timerId, lance, rangeDelta: 0, rank };
  if (alchemist) tower.alchemistShape = shape;
  else if (lycan) tower.lycanShape = shape;
  else tower.dragonShape = shape;
  const mana = tower.mana!;
  tower.templateId = alchemist ? alchemistForms[rank - 1] : lycan ? lycanForms[rank - 1] : dragonForms[skillId === "A010" ? 0 : 1][rank - 1];
  syncTowerLife(state, tower);
  syncMana(state, tower);
  tower.mana = Math.min(mana, tower.manaMaximum!);
  shape.rangeTimerId = scheduleEvent(state.queue, us(3), { type: lycan ? "lycan-restore-range" : alchemist ? "alchemist-restore-range" : "dragon-restore-range", towerId: tower.id, formTimer: timerId });
  weaponRatesDirty.add(state);
}

function endHeroTransformation(state: Match, tower: Construction, shape: HeroTransformation) {
  syncTowerLife(state, tower);
  syncMana(state, tower);
  const mana = tower.mana!;
  cancelEvent(state.queue, shape.timerId);
  if (shape.rangeTimerId !== undefined) cancelEvent(state.queue, shape.rangeTimerId);
  delete tower.dragonShape;
  delete tower.alchemistShape;
  delete tower.lycanShape;
  tower.templateId = shape.normal;
  syncTowerLife(state, tower);
  syncMana(state, tower);
  tower.mana = Math.min(mana, tower.manaMaximum!);
  weaponRatesDirty.add(state);
}

function creditGoblinGold(state: Match, tower: Construction, gold: number) {
  tower.goblinGreedGold = (tower.goblinGreedGold ?? 0) + gold;
  state.gold += gold;
}

function pulseAcidCloud(state: Match, cloud: NonNullable<Match["acidClouds"]>[number]) {
  const tower = firingUnit(state, cloud.towerId);
  if (!tower) return;
  const { point, amount } = cloud;
  const victims = state.enemies.filter(enemy => (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 500 ** 2)
    .sort((a, b) => a.id - b.id);
  for (const enemy of victims) {
    if (state.phase !== "running") break;
    if (!state.enemies.includes(enemy) || !targetable(enemy, ["ground", "air", "structure", "ward"], state.queue.nowUs) ||
        enemy.abilities?.some(id => id === "Avul" || id === "Aloc")) continue;
    damageEnemy(state, tower, tower.templateId, enemy, physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "A108");
  }
}

function registerDragonImprint(state: Match, tower: Construction, enemy: Enemy) {
  const imprints = state.dragonImprints ??= {};
  const existing = Object.values(imprints);
  if (existing.filter(mark => mark.towerId === tower.id).length >= 1 + (tower.hero?.ranks.A008 ?? 0) ||
      existing.filter(mark => firingUnit(state, mark.towerId)).length >= 12) return;
  const imprintId = state.nextId++;
  const duration = us(4 + .5 * (tower.hero?.ranks.A009 ?? 0));
  scheduleEvent(state.queue, duration, { type: "dragon-imprint-end", imprintId });
  const period = scheduleEvent(state.queue, us(1), { type: "dragon-imprint", imprintId }, us(1));
  imprints[imprintId] = { towerId: tower.id, point: { x: enemy.x, y: enemy.y }, untilUs: state.queue.nowUs + duration, period };
}

function pulseDragonImprint(state: Match, imprintId: number) {
  const mark = state.dragonImprints![imprintId];
  const tower = firingUnit(state, mark.towerId);
  if (!tower) return;
  const hp = syncTowerLife(state, tower).hp;
  if (!hp) return;
  const amount = hp * (tower.dragonShape ? .4 : .3);
  const targets = state.enemies.filter(enemy => (enemy.x - mark.point.x) ** 2 + (enemy.y - mark.point.y) ** 2 <= 150 ** 2)
    .sort((a, b) => a.id - b.id);
  for (const enemy of targets) {
    if (state.phase !== "running") break;
    if (!state.enemies.includes(enemy) || enemy.hp <= 0 || enemy.abilities?.includes("Avul") ||
        state.queue.nowUs < (enemy.phaseUntilUs ?? 0)) continue;
    damageEnemy(state, tower, tower.templateId, enemy,
      physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "A008");
  }
}

const berserkerAttackSpeed = [.2, .3, .4, .5, .6, .8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6];

function applyBurningSpear(state: Match, tower: Construction, target: Enemy) {
  if (tower.hero?.ranks.A115) {
    scheduleEvent(state.queue, us(1), { type: "burning-spear", towerId: tower.id, targetId: target.id, remaining: 6 });
  }
  const life = syncTowerLife(state, tower);
  if (life.hp < life.maximum * .05) {
    if (!tower.innerVitality && state.structures.includes(tower)) {
      const timerId = scheduleEvent(state.queue, us(1), { type: "inner-vitality", towerId: tower.id }, us(1));
      tower.innerVitality = { timerId, remaining: 8 };
    }
  } else {
    life.hp -= Math.floor(life.maximum * .01);
  }
}

function tickBurningSpear(state: Match, event: Extract<MatchEvent, { type: "burning-spear" }>) {
  const tower = firingUnit(state, event.towerId);
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!tower || !target) return;
  const rank = tower.hero?.ranks.A115 ?? 0;
  if (rank) {
    const scepter = hasScepter(state, tower);
    damageEnemy(state, tower, "H034", target, (scepter ? 100 : 80) * rank, scepter ? "divine" : "magic", "A115");
  }
  if (event.remaining > 1 && state.phase === "running" && state.enemies.includes(target)) {
    scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1 });
  }
}

function changeEssence(state: Match, tower: Construction, amount: number) {
  const hero = tower.hero!;
  const alive = (tower.life?.hp ?? 1) > 0;
  syncTowerLife(state, tower);
  syncMana(state, tower);
  hero.natural.STR += amount;
  hero.natural.AGI += amount;
  hero.natural.INT += amount;
  const life = syncTowerLife(state, tower);
  life.hp = alive ? life.maximum : 0;
  syncMana(state, tower);
  weaponRatesDirty.add(state);
}

const manaLimits = new Map(itemResources.items.map(item => [item.id, item.webStats[1]]));
const manaRate = new Map(itemRegeneration.items.map(item => [item.id, (item.web.manaPercent ?? 0) / 100]));
const manaChargeItems = ["i220", "i327", "i218"];

function emitsManaAura(tower: Construction) {
  return (!tower.pending || tower.pending.upgradeTo) && !tower.summon?.illusion && (tower.life?.hp ?? 1) > 0 &&
    (tower.templateId === "n245" || !!tower.hero?.ranks.A018);
}

function refreshManaAuras(state: Match, ...origins: Point[]) {
  for (const tower of [...state.structures, ...(state.summons ?? [])]) {
    if (tower.manaLastUs !== undefined &&
        origins.some(origin => (tower.x - origin.x) ** 2 + (tower.y - origin.y) ** 2 <= 1200 ** 2)) syncMana(state, tower);
  }
}

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
  const ancient = stats?.type?.split(",").includes("ancient") ?? false;
  const equipmentAura = ancient ? 0 :
    nearbyEquipment(state, tower, ["i161"], 1000) ? 10 : nearbyEquipment(state, tower, ["i129"], 1000) ? 3 : 0;
  let arcaneAura = 0;
  let shrimpAura = 0;
  if (!ancient && (tower.life?.hp ?? 1) > 0) {
    for (const source of state.structures) {
      if (!emitsManaAura(source)) continue;
      const distance = (source.x - tower.x) ** 2 + (source.y - tower.y) ** 2;
      if (source.templateId === "n245" && distance <= 800 ** 2) shrimpAura = 3;
      const rank = source.hero?.ranks.A018;
      if (rank && distance <= 1200 ** 2) {
        arcaneAura = Math.max(arcaneAura, [2, 3, 4, 5, 6, 8][rank - 1] * (source === tower ? 2 : 1));
      }
    }
  }
  const baseRegen = tower.alchemistShape ? .01 + 3 * tower.alchemistShape.rank : stats?.regenMana ?? 0;
  tower.manaRegen = (baseRegen + 0.03 * intelligence) * (1 + percent) + equipmentAura + arcaneAura + shrimpAura;
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

const essenceUselessSpells = new Set(["A000", "A075", "A083", "A164", "I001", "I002", "I167", "I168", "I204", "I205",
  "I206", "I207", "I210", "I211", "I219", "I220", "I233", "I243", "I245", "I248", "I266", "I267", "I274", "N000",
  "T329", "A226", "A227", "A228", "A229", "I270", "T033", "A040", "A070", "A210"]);

function essenceAuraRank(state: Match, tower: Construction) {
  if ((!tower.hero && !/^[HG]/.test(tower.templateId)) || tower.pending && !tower.pending.upgradeTo ||
      (tower.life?.hp ?? 1) <= 0 || unitBalance.get(tower.templateId)?.type?.split(",").includes("ancient")) return 0;
  let strongest = 0;
  for (const source of state.structures) {
    const rank = source.hero?.ranks.A084 ?? 0;
    if (rank > strongest && (!source.pending || source.pending.upgradeTo) && (source.life?.hp ?? 1) > 0 &&
        !source.summon?.illusion && (source.x - tower.x) ** 2 + (source.y - tower.y) ** 2 <= 900 ** 2) strongest = rank;
  }
  return strongest;
}

function recoverEssenceMana(state: Match, tower: Construction, rank: number) {
  if (rollPercent(state) > 30) return;
  syncMana(state, tower);
  recordBattleAnimation(state, tower, "A084", "model-effect");
  tower.mana = Math.min(tower.manaMaximum!, tower.mana! + tower.manaMaximum! * rank * .05);
}

function changeAstralIntelligence(state: Match, tower: Construction, amount: number) {
  syncMana(state, tower);
  tower.hero!.natural.INT += amount;
  syncMana(state, tower);
}

function triggerSpellEquipment(state: Match, tower: Construction, skillId?: string) {
  if (skillId && !essenceUselessSpells.has(skillId) && !tower.summon?.independent) {
    const rank = essenceAuraRank(state, tower);
    if (rank) recoverEssenceMana(state, tower, rank);
  }
  applySpellEquipment(state, tower, skillId);
  const rank = tower.hero?.ranks.A060;
  if (!rank || state.phase !== "running" || !state.structures.includes(tower)) return 1;
  const count = Math.ceil(rollPercent(state) * (rank + 1) / 100);
  if (count > 1) {
    tower.ogreMulticast = { count, atUs: state.queue.nowUs };
    if (towerGear(state, tower).some(item => item.itemId === "i318" || item.itemId === "i319" || item.itemId === "i320")) {
      tower.ashMarks = (tower.ashMarks ?? 0) + count - 1;
    }
  }
  return count;
}

function applyEnemyHex(state: Match, enemy: Enemy, sourceId: number, duration: number, form?: string) {
  enemy.hexUntilUs = state.queue.nowUs + duration;
  enemy.hexSourceId = sourceId;
  if (form) enemy.hexForm = form;
  else delete enemy.hexForm;
  interruptEnemyCast(state, enemy);
  scheduleEvent(state.queue, duration, { type: "equipment-hex-end", enemyId: enemy.id, sourceId });
}

function applySpellEquipment(state: Match, tower: Construction, skillId?: string) {
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
    const targets = state.enemies.filter(enemy => (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 700 ** 2)
      .sort((left, right) => left.id - right.id);
    for (const enemy of targets) {
      if (enemy.hp <= 0) continue;
      const sourceId = state.nextId++;
      if (!organicWaveTarget(state, enemy) || enemy.abilities?.includes("Aeth") || ["b142", "b143"].includes(enemy.unitId) ||
          (!/^[A-Z]/.test(enemy.unitId) && (unitBalance.get(enemy.unitId)?.level ?? 0) > 1000) ||
          consumeEnemySpellShield(state, enemy)) continue;
      applyEnemyHex(state, enemy, sourceId, us(resistantToControl(enemy) ? 1 : 2));
    }
    scheduleEvent(state.queue, us(.2), { type: "equipment-hex-damage", towerId: tower.id, point: { x: tower.x, y: tower.y } });
  }
  if (state.phase !== "running") return;
  triggerDivineEffect(state, tower, "spell");
  zeusStaticField(state, tower);
  if (tower.hero && skillId !== "A075") triggerAshHood(state, tower);
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
  triggerSpellEquipment(state, tower, skillId);
  if (state.phase !== "running" || !state.structures.includes(tower)) return { ok: true };
  const buffId = scheduleEvent(state.queue, us(6), { type: "tree-grab-expire", towerId: tower.id, buffId: state.queue.nextSequence });
  status.strength[buffId] = [20, 35, 50, 65, 80, 100][rank - 1];
  status.cleaveUntilUs = state.queue.nowUs + us(6);
  captureChakra(state, tower, skillId);
  status.readyUs = adjustedSpellCooldown(state, tower, status.readyUs, 0, skillId);
  return { ok: true };
}

function activateAccuracy(state: Match, tower: Construction, skill: AccuracySkill): Result {
  const rank = tower.hero?.ranks[skill] ?? 0;
  if (tower.pending || !rank || skill !== accuracySkill(tower.templateId)) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0, tower.accuracyReadyUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  const attack = Math.floor(combatAttributes(state, tower).AGI * rank / 10);
  const scepterActive = hasScepter(state, tower);
  const untilUs = now + us(10);
  tower.accuracySelfUntilUs = untilUs;
  tower.accuracyReadyUs = untilUs;
  tower.lastCastUs = now;
  tower.lastCastTarget = { x: tower.x, y: tower.y };
  for (const target of [...state.structures, ...(state.summons ?? [])]) {
    if (target.pending || (target.life?.hp ?? 1) <= 0 || !weapons[target.templateId]?.some(weapon => weapon.kind !== "normal") ||
        (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > 800 ** 2) continue;
    const bonus = target.hero ? attack : Math.ceil(attack / 2);
    if (target.accuracy && target.accuracy.untilUs > now && target.accuracy.attack > bonus) continue;
    target.accuracy = { templateId: target.templateId, attack: bonus, agility: target.hero && scepterActive ? 100 : 0,
      armor: 5, untilUs };
    scheduleEvent(state.queue, us(10), { type: "accuracy-expire", towerId: target.id });
  }
  weaponRatesDirty.add(state);
  triggerSpellEquipment(state, tower, skill);
  captureChakra(state, tower, skill);
  tower.accuracyReadyUs = adjustedSpellCooldown(state, tower, tower.accuracyReadyUs, 0, skill);
  return { ok: true };
}

export function wispLinkTargets(state: Match, towerId: number) {
  const tower = state.structures.find(source => source.id === towerId);
  if (!tower) return [];
  return [...state.structures, ...(state.summons ?? [])].filter(target =>
    towerLevels.get(target.templateId)?.growth && !target.pending && (target.life?.hp ?? 1) > 0 &&
    !towerSpellImmune(target, state.queue.nowUs) && (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 <= 800 ** 2);
}

function endWispLink(state: Match, tower: Construction) {
  const link = tower.wispLink;
  if (!link) return;
  const target = firingUnit(state, link.targetId);
  if (target?.manaLastUs !== undefined) syncMana(state, target);
  cancelEvent(state.queue, link.timer);
  delete tower.wispLink;
  if (target && (target.life?.hp ?? 1) > 0) {
    if (!hasPhysicalScepter(state, target)) removeScepterEffects(state, target);
    delete target.wispLinked;
    weaponRatesDirty.add(state);
  }
  if (target?.manaLastUs !== undefined) syncMana(state, target);
  if (target?.life) syncTowerLife(state, target);
}

function connectWisp(state: Match, tower: Construction, target: Construction) {
  if (state.structures.some(source => source.wispLink?.targetId === target.id)) return;
  endWispLink(state, tower);
  tower.wispLink = { targetId: target.id,
    timer: scheduleEvent(state.queue, us(1), { type: "wisp-link-tick", towerId: tower.id }, us(1)) };
  target.wispLinked = true;
  weaponRatesDirty.add(state);
}

function toggleWispOverload(state: Match, tower: Construction, skill: WispOverload): Result {
  if (tower.wispOverload) {
    cancelEvent(state.queue, tower.wispOverload.timer);
    delete tower.wispOverload;
    return { ok: true };
  }
  const rank = tower.hero?.ranks[skill] ?? 0;
  if (!rank || tower.pending || skill !== wispOverload(tower.templateId)) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0, tower.wispOverloadReadyUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  const cost = rank === 1 ? 0 : 25;
  if (tower.mana! < cost) return { ok: false, reason: "resources" };
  tower.mana! -= cost;
  captureChakra(state, tower, skill);
  tower.wispOverloadReadyUs = adjustedSpellCooldown(state, tower, now + us(5), 0, skill, true);
  tower.wispOverload = { buff: skill,
    timer: scheduleEvent(state.queue, us(1), { type: "wisp-overload-tick", towerId: tower.id }, us(1)) };
  triggerSpellEquipment(state, tower, skill);
  return { ok: true };
}

function updateWispLink(state: Match, tower: Construction) {
  const link = tower.wispLink!;
  const target = firingUnit(state, link.targetId);
  if (!target || (target.life?.hp ?? 1) <= 0) {
    endWispLink(state, tower);
    return;
  }
  if (!hasPhysicalScepter(state, target)) {
    const shared = hasScepter(state, tower);
    if (shared && !link.shared) {
      link.shared = true;
      grantScepterEffects(state, target);
    } else if (!shared && link.shared) {
      delete link.shared;
      removeScepterEffects(state, target);
    }
  }
  const skill = wispOverload(tower.templateId);
  if (target.manaLastUs !== undefined) syncMana(state, target);
  let changed = false;
  if (tower.wispOverload?.buff === skill) {
    const ratio = ((tower.hero?.ranks[skill] ?? 0) + 1) / 10;
    const amountFor = (value: number) => value * ratio >= 3000 ? 3000 :
      Math.floor(Math.max(0, value * ratio) / 70) * 70;
    if (!link.boost || amountFor(combatAttributes(state, tower)[link.boost.stat]) !== link.boost.amount) {
      delete link.boost;
      const { STR, AGI, INT } = combatAttributes(state, target);
      const stat = STR > AGI && STR > INT ? "STR" : AGI > INT ? "AGI" : "INT";
      const amount = amountFor(combatAttributes(state, tower)[stat]);
      link.boost = { stat, amount };
      if (amount >= 1680) creditTask(state, "spring", 2, amount);
      changed = true;
    }
  } else if (link.boost) {
    delete link.boost;
    changed = true;
  }
  if (changed) {
    if (target.manaLastUs !== undefined) syncMana(state, target);
    if (target.life) syncTowerLife(state, target);
    weaponRatesDirty.add(state);
  }
  if ((target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > 1000 ** 2) endWispLink(state, tower);
}

function captureChakra(state: Match, tower: Construction, skillId: string) {
  const token = tower.chakraToken;
  if (token && token.untilUs > state.queue.nowUs && !Object.values(tower.chakraUses ?? {}).includes(token.id)) {
    (tower.chakraUses ??= {})[skillId] = token.id;
  }
}

function adjustedSpellCooldown(state: Match, tower: Construction, readyUs: number, minimumSeconds = 0, skillId?: string, chakraOnly = false) {
  const now = state.queue.nowUs;
  let remaining = Math.max(0, readyUs - now);
  const captured = skillId && tower.chakraUses?.[skillId];
  if (skillId && captured !== undefined) {
    delete tower.chakraUses?.[skillId];
    if (tower.chakraToken?.id === captured) delete tower.chakraToken;
  }
  if (captured || skillId && (tower.chakraHasteUntilUs ?? 0) > now ||
      !chakraOnly && towerGear(state, tower).some(item => item.itemId === "i327")) {
    remaining = Math.max(us(minimumSeconds), Math.round(remaining * .8));
  }
  if (chakraOnly) return now + remaining;
  const form = tower.hero?.divineForm;
  if (form?.id === "P222") remaining = Math.max(us(minimumSeconds), Math.round(remaining * (1 - .01 * form.stars)));
  return now + remaining;
}

function eligibleHeroTarget(state: Match, tower: Construction, enemy: Enemy, range: number, skillId?: HeroSpell) {
  if (skillId === "A192" || skillId === "A217" || skillId === "A218") return canSeeEnemy(state, enemy) && physicalAreaTarget(state, enemy) &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= range ** 2;
  if (skillId === "A058" || skillId === "A155" || skillId === "A156" || skillId === "A157" ||
      skillId === "A160" || skillId === "A161" || skillId === "A207") return ogreBlastTarget(state, enemy) &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= range ** 2;
  if (!canSeeEnemy(state, enemy) || !targetable(enemy, ["ground", "air"], state.queue.nowUs) ||
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > range ** 2) return false;
  const types = unitBalance.get(enemy.unitId)?.type?.split(",") ?? [];
  if (skillId === "A224") return organicWaveTarget(state, enemy);
  if (skillId === "A173") return !enemy.abilities?.some(id => id === "Avul" || id === "Aloc");
  if (skillId === "A034" && !mapBoss(enemy)) return false;
  if (skillId === "A045") return !enemy.abilities?.some(id => id === "Avul" || id === "Aloc" || id === "Aeth");
  if (skillId === "A134") return mapBoss(enemy) && organicWaveTarget(state, enemy);
  if (skillId === "A166") return mapBoss(enemy) && !mechanicalEnemy(enemy) &&
    !enemy.abilities?.some(id => id === "Avul" || id === "Aloc");
  if (skillId === "T317" || skillId === "A198") {
    // Source welfare chest units are N534 sappers. Their runtime templates omit that marker.
    if (types.includes("hero") || /^[A-Z]/.test(enemy.unitId) || mapBoss(enemy) ||
        enemy.unitId === "m998" || enemy.unitId === "m999") return false;
  }
  if (skillId === "A057") return !enemy.abilities?.some(id => id === "Avul" || id === "Aloc");
  if (skillId === "A042") return !/^[A-Z]/.test(enemy.unitId) && !(enemy.abilities?.includes("N534") && types.includes("sapper"));
  if ((skillId === "A051" || skillId === "A092" || skillId === "A104") && !organicWaveTarget(state, enemy)) return false;
  return skillId === undefined || heroSpellTargetMode(skillId) !== "unit" ||
    !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Avul" || id === "Aloc");
}

function spellTarget(state: Match, tower: Construction, range: number, skillId?: HeroSpell) {
  if (skillId === "A102" || skillId === "A103" || skillId === "A176" || skillId === "A122") {
    const nearby = state.enemies.filter(enemy => enemy.hp > 0 &&
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= range ** 2).sort((left, right) => left.id - right.id);
    return (skillId === "A103" || skillId === "A176" ? nearby.find(mapBoss) : undefined) ?? nearby[0];
  }
  const candidates = state.enemies.filter(enemy => eligibleHeroTarget(state, tower, enemy, range, skillId));
  if (skillId === "A192") {
    candidates.sort((left, right) => left.id - right.id);
    return candidates.find(enemy => mapBoss(enemy) || enemy.unitId === "m998" || enemy.unitId === "m999") ?? candidates[0];
  }
  if (skillId === "A076" || skillId === "A079") {
    return candidates.filter(enemy => !enemy.abilities?.some(id => id === "Avul" || id === "Aloc") &&
      (skillId !== "A076" || targetable(enemy, ["ground", "structure"], state.queue.nowUs) && !magicImmune(enemy)))
      .sort((left, right) => left.id - right.id)[0];
  }
  if (skillId === "A155" || skillId === "A156" || skillId === "A157") {
    candidates.sort((left, right) => left.id - right.id);
    return candidates.find(mapBoss) ?? candidates[0];
  }
  if (skillId === "A236" || skillId === "A237" || skillId === "A238") {
    candidates.sort((left, right) => left.id - right.id);
    return (skillId === "A238" ? candidates.find(mapBoss) : undefined) ?? candidates[0];
  }
  if (skillId === "A164") return candidates.find(mapBoss) ?? candidates[0];
  if (skillId === "A089" || skillId === "A161" || skillId === "A162" || skillId === "A201" || skillId === "A203" ||
      skillId === "A207" || skillId === "A208")
    return candidates.sort((left, right) => left.id - right.id)[0];
  if (skillId === "A200") return candidates.find(enemy => !mapBoss(enemy)) ?? candidates[0];
  return (skillId === "A151" || skillId === "A020" ? candidates.find(enemy => enemy.abilities?.includes("N534")) :
    skillId === "A117" ? candidates.find(mapBoss) : undefined) ?? candidates[0];
}

export function heroSpellTargets(state: Match, towerId: number, skillId: HeroSpell) {
  const tower = state.structures.find(unit => unit.id === towerId);
  if (!tower) return [];
  if ((skillId === "A217" || skillId === "A218") && skillId !== activeHeroSkill(tower, "A217")) return [];
  return state.enemies.filter(enemy => eligibleHeroTarget(state, tower, enemy, heroSpells[skillId].range, skillId));
}

export function purgeTargets(state: Match, caster: Point, range: number) {
  return state.enemies.filter(enemy => organicWaveTarget(state, enemy) && canSeeEnemy(state, enemy) &&
    (enemy.x - caster.x) ** 2 + (enemy.y - caster.y) ** 2 <= range ** 2).sort((left, right) => left.id - right.id);
}

function nativeControlTarget(state: Match, enemy: Enemy, spell: "slow" | "boulder", carrier = false) {
  const layers = spell === "slow" ? ["ground", "air", "mechanical"] :
    carrier ? ["ground", "air"] : ["ground", "air", "structure"];
  return targetable(enemy, layers, state.queue.nowUs) && (spell === "slow" || !mechanicalEnemy(enemy)) &&
    canSeeEnemy(state, enemy) && !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Avul" || id === "Aloc");
}

export function towerSpellTargets(state: Match, tower: Point, skillId: string) {
  if (skillId === "N116") return purgeTargets(state, tower, 800);
  const kind = /^N07[6-8]$/.test(skillId) ? "slow" : "boulder";
  return state.enemies.filter(enemy => nativeControlTarget(state, enemy, kind) &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 700 ** 2).sort((a, b) => a.id - b.id);
}

export function bloodlustTargets(state: Match, tower: Point, range = 1000, heroesOnly = false, carrier = false) {
  return [...state.structures, ...(state.summons ?? [])].filter(unit => {
    const tags = unitBalance.get(unit.templateId)?.type?.split(",");
    return (!unit.pending || unit.pending.upgradeTo) && (unit.life?.hp ?? 1) > 0 &&
      (!heroesOnly || /^[HG]/.test(unit.templateId)) && !energyCircle(unit) &&
      !towerSpellImmune(unit, state.queue.nowUs) &&
      (carrier || heroesOnly || unitTargetType.get(unit.templateId) !== "structure" && !tags?.includes("mechanical")) &&
      (unit.x - tower.x) ** 2 + (unit.y - tower.y) ** 2 <= range ** 2;
  });
}

function applyBloodlust(state: Match, ally: Construction, amount: number, seconds: number) {
  const untilUs = state.queue.nowUs + us(seconds);
  ally.bloodlust = { untilUs, amount };
  scheduleWeaponRateEnd(state, ally, "bloodlust", untilUs);
}

function nativeBloodlustTarget(state: Match, tower: Construction, heroesOnly = false) {
  const now = state.queue.nowUs;
  const allies = bloodlustTargets(state, tower, 1000, heroesOnly).filter(unit => {
    if (now < (unit.bloodlust?.untilUs ?? 0)) return false;
    const attacking = state.enemies.find(enemy => enemy.id === unit.attack?.targetId);
    return attacking && canSeeEnemy(state, attacking) &&
      weapons[unit.templateId]?.some(weapon => inWeaponRange(unit, attacking, weapon, weaponRange(weapon, towerGear(state, unit), unit), false, now));
  });
  const distance = (unit: Construction) => (unit.x - tower.x) ** 2 + (unit.y - tower.y) ** 2;
  return allies.filter(unit => unit !== tower).sort((a, b) => distance(a) - distance(b) || a.id - b.id)[0] ??
    allies.find(unit => unit === tower);
}

function scanBloodlust(state: Match, towerId: number) {
  const tower = state.structures.find(unit => unit.id === towerId);
  if (!tower) return;
  const hero = tower.templateId === "H018";
  const spell = towerSpells.get(tower.templateId)?.find(entry => entry.effect.kind === "bloodlust");
  if (!spell && !hero) return;
  scheduleEvent(state.queue, us(.25), { type: "bloodlust-scan", towerId });
  const enabled = tower.autoModes?.nativeBloodlust ?? !hero;
  const readyUs = spell ? tower.towerSpellReady?.[spell.id] : tower.heroSpellReady?.A059;
  if (!enabled || hero && !tower.hero?.ranks.A059 || tower.pending || tower.attack?.winding ||
      state.queue.nowUs < Math.max(tower.heroCastUntilUs ?? 0, tower.stunnedUntilUs ?? 0, readyUs ?? 0)) return;
  const ally = nativeBloodlustTarget(state, tower, hero);
  if (!ally) return;
  if (hero) beginHeroSpell(state, tower, "A059", false, { targetId: ally.id });
  else beginTowerSpell(state, tower, spell!.id, false, ally.id);
}

function scanNativeSlow(state: Match, towerId: number) {
  const tower = state.structures.find(unit => unit.id === towerId);
  const spell = tower && towerSpells.get(tower.templateId)?.find(entry => entry.effect.kind === "slow");
  if (!tower || !spell) return;
  scheduleEvent(state.queue, us(.25), { type: "native-slow-scan", towerId });
  if (tower.pending || tower.attack?.winding || tower.autoModes?.nativeSlow === false ||
      state.queue.nowUs < Math.max(tower.heroCastUntilUs ?? 0, tower.stunnedUntilUs ?? 0,
        tower.towerSpellReady?.[spell.id] ?? 0)) return;
  const enemy = towerSpellTargets(state, tower, spell.id).find(unit => state.queue.nowUs >= (unit.nativeSlow?.untilUs ?? 0));
  if (enemy) beginTowerSpell(state, tower, spell.id, false, enemy.id);
}

function beginTowerSpell(state: Match, tower: Construction, skillId: string, automatic: boolean, targetId?: number, aim?: Point): Result {
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
    captureChakra(state, tower, skillId);
    (tower.towerSpellReady ??= {})[skillId] = adjustedSpellCooldown(state, tower, now + us(spell.cooldown), 0, skillId, true);
    tower.frenzyAmount = spell.effect.amount;
    tower.frenzyUntilUs = now + us(5);
    scheduleWeaponRateEnd(state, tower, "frenzyUntilUs", tower.frenzyUntilUs);
    tower.lastCastUs = now;
    tower.lastCastTarget = { x: tower.x, y: tower.y };
    triggerSpellEquipment(state, tower, skillId);
    return { ok: true };
  }
  if (now < Math.max(tower.towerSpellReady?.[skillId] ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  const isTargeted = spell.effect.kind === "purge" || spell.effect.kind === "slow" || spell.effect.kind === "bloodlust" || spell.effect.kind === "boulder" && !spell.effect.radius;
  const pointSpell = pointTowerSpell(skillId);
  if (aim && (!pointSpell || !contains(map.bounds, aim) ||
      (aim.x - tower.x) ** 2 + (aim.y - tower.y) ** 2 > pointTowerSpellRange(skillId) ** 2)) {
    return { ok: false, reason: "range" };
  }
  let target: Construction | Enemy | undefined = tower;
  if (spell.effect.kind === "purge") {
    const candidates = purgeTargets(state, tower, automatic ? spell.search : spell.effect.range);
    target = targetId === undefined ? candidates[0] : candidates.find(enemy => enemy.id === targetId);
  } else if (spell.effect.kind === "bloodlust") {
    const candidates = bloodlustTargets(state, tower, spell.effect.range);
    target = targetId === undefined ? candidates.find(unit => unit === tower) : candidates.find(unit => unit.id === targetId);
  } else if (isTargeted) {
    const candidates = towerSpellTargets(state, tower, skillId);
    target = targetId === undefined ? candidates[0] : candidates.find(enemy => enemy.id === targetId);
  } else if (!aim && pointSpell) {
    target = state.enemies.filter(enemy => enemy.hp > 0 &&
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= (automatic ? spell.search : pointTowerSpellRange(skillId)) ** 2)
      .sort((a, b) => a.id - b.id)[0];
  } else if (!aim && spell.effect.kind !== "wolves" && (spell.effect.kind === "wave" || spell.effect.kind === "sword-rain" || automatic)) {
    target = spellTarget(state, tower, automatic ? spell.search : 800);
  }
  const point = aim ?? target;
  if (!point) return { ok: false, reason: "range" };
  syncMana(state, tower);
  if (tower.mana! < spell.cost) return { ok: false, reason: "resources" };
  interruptWeapon(state, tower);
  tower.heroCastUntilUs = now + us(spell.cast);
  tower.spellWindup = scheduleEvent(state.queue, us(spell.cast), { type: "tower-spell", towerId: tower.id, skillId,
    point: { x: point.x, y: point.y }, ...(isTargeted && target ? { targetId: target.id } : {}) });
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
  if (pointTowerSpell(spell.id) &&
      (event.point.x - tower.x) ** 2 + (event.point.y - tower.y) ** 2 > pointTowerSpellRange(spell.id) ** 2) return;
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const ally = effect.kind === "bloodlust" ? bloodlustTargets(state, tower, effect.range).find(unit => unit.id === event.targetId) : undefined;
  if (effect.kind === "bloodlust" && !ally) return;
  if (effect.kind === "purge" && (!target || !organicWaveTarget(state, target) ||
      !canSeeEnemy(state, target) || (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > effect.range ** 2)) return;
  if ((effect.kind === "slow" || effect.kind === "boulder" && !effect.radius) &&
      (!target || !nativeControlTarget(state, target, effect.kind) ||
        (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > effect.range ** 2)) return;
  syncMana(state, tower);
  if (tower.mana! < spell.cost) return;
  tower.mana! -= spell.cost;
  captureChakra(state, tower, spell.id);
  (tower.towerSpellReady ??= {})[spell.id] = adjustedSpellCooldown(state, tower, now + us(spell.cooldown), 0, spell.id, true);
  tower.lastCastUs = now;
  tower.lastCastTarget = event.point;
  triggerSpellEquipment(state, tower, event.skillId);
  if (state.phase !== "running") return;
  if (effect.kind === "purge") {
    if (!target || consumeEnemySpellShield(state, target)) return;
    clearEnemyPositiveBuffs(target);
    const duration = resistantToControl(target) ? .5 : 4;
    target.purge = { middleUs: now + us(duration / 2), endUs: now + us(duration), factor: 0 };
    return;
  }
  if (effect.kind === "bloodlust") {
    if (ally) applyBloodlust(state, ally, effect.amount, 5);
    return;
  }
  if (effect.kind === "slow") {
    if (target && !consumeEnemySpellShield(state, target)) {
      target.nativeSlow = { untilUs: now + us(nativeControlHero(target) ? 2 : 3), factor: effect.factor, attackPenalty: .25 };
    }
    return;
  }
  if (effect.kind === "boulder") {
    const radius = effect.radius;
    const victims = radius === undefined ? target ? [target] : [] :
      state.enemies.filter(enemy => enemy.hp > 0 && (enemy.x - event.point.x) ** 2 + (enemy.y - event.point.y) ** 2 <= radius ** 2)
        .sort((a, b) => a.id - b.id);
    if (radius !== undefined) tower.heroCastUntilUs = now + us(.5);
    const source = { x: tower.x, y: tower.y };
    for (const enemy of victims) {
      const sourceId = radius === undefined ? undefined : state.nextId++;
      const range = radius === undefined ? effect.range : 2000;
      if (!nativeControlTarget(state, enemy, "boulder", sourceId !== undefined) ||
          (enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2 > range ** 2 || consumeEnemySpellShield(state, enemy)) continue;
      launchTrackingProjectile(state, { type: "boulder-projectile", towerId: tower.id, targetId: enemy.id,
        source, position: { ...source }, ...(sourceId === undefined ? {} : { expiresUs: now + us(2), sourceId }), travelUs: 0,
        skillId: spell.id, amount: effect.amount, stun: effect.stun, heroStun: effect.heroStun }, enemy);
    }
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
  if (effect.kind === "clap") {
    applyThunderClap(state, tower, spell.id, effect);
    return;
  }
  const victims = [...state.enemies].sort((left, right) => left.id - right.id);
  for (const enemy of victims) {
    if (state.phase !== "running") return;
    const targets = effect.kind === "howl" ? ["ground", "air"] : ["ground", "structure", "mechanical"];
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
  }
}

function applyThunderClap(state: Match, tower: Construction, skillId: string,
  effect: { radius: number; amount: number; slow?: number }, carrier?: Point & { id: number }) {
  const now = state.queue.nowUs;
  const source = carrier ?? tower;
  for (const enemy of [...state.enemies].sort((left, right) => left.id - right.id)) {
    if (state.phase !== "running") return;
    if (!state.enemies.includes(enemy) || !targetable(enemy, ["ground", "mechanical"], now) ||
        magicImmune(enemy) || enemy.abilities?.some(id => id === "Avul" || id === "Aloc") ||
        (enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2 > effect.radius ** 2) continue;
    damageEnemy(state, tower, carrier ? "q001" : tower.templateId, enemy, effect.amount * .8, "magic", skillId, source);
    if (effect.slow && enemy.hp > 0) {
      const hero = nativeControlHero(enemy);
      const duration = skillId === "N087" ? (hero ? 1 : 3) : (hero ? .4 : 1.2);
      enemy.clapSlow = { untilUs: now + us(duration), factor: 1 - effect.slow, attackPenalty: .25 };
    }
  }
}

function stopSwordRain(tower: Construction, atUs: number) {
  delete tower.swordRainToken;
  tower.heroCastUntilUs = atUs;
}

function stopTowerCast(state: Match, tower: Construction) {
  if (stopLifeDrain(state, tower)) return true;
  if (stopUpheaval(state, tower)) return true;
  if (releaseIlluminate(state, tower)) return true;
  if (tower.spellWindup !== undefined) {
    cancelEvent(state.queue, tower.spellWindup);
    delete tower.spellWindup;
    tower.heroCastUntilUs = state.queue.nowUs;
    return true;
  }
  if ((tower.focusRecoveryUntilUs ?? 0) > state.queue.nowUs) {
    delete tower.focusRecoveryUntilUs;
    tower.heroCastUntilUs = state.queue.nowUs;
    return true;
  }
  if (tower.requiemFollowTimer !== undefined) {
    cancelEvent(state.queue, tower.requiemFollowTimer);
    delete tower.requiemFollowTimer;
    tower.heroCastUntilUs = state.queue.nowUs;
    tower.heroSpellReady!.A001 = adjustedSpellCooldown(state, tower, tower.heroSpellReady!.A001!, 0, "A001");
    return true;
  }
  if (tower.rearmTimer !== undefined) {
    cancelEvent(state.queue, tower.rearmTimer);
    delete tower.rearmTimer;
    tower.heroCastUntilUs = state.queue.nowUs;
    tower.heroSpellReady!.A075 = adjustedSpellCooldown(state, tower, tower.heroSpellReady!.A075!, 0, "A075", true);
    return true;
  }
  if (tower.freezingFieldId !== undefined) {
    delete tower.freezingFieldId;
    tower.heroCastUntilUs = state.queue.nowUs;
    tower.heroSpellReady!.A016 = adjustedSpellCooldown(state, tower, tower.heroSpellReady!.A016!, 0, "A016");
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
    if (tower.heroSpellReady?.A093 !== undefined) tower.heroSpellReady.A093 = adjustedSpellCooldown(state, tower, tower.heroSpellReady.A093, 0, "A093");
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
    targets: air ? ["ground", "air", "structure", "mechanical"] : ["ground", "structure", "mechanical"], budget: 9_999_999 } });
}

function organicWaveTarget(state: Match, enemy: Enemy, targetTypes = ["ground", "air"]) {
  return targetable(enemy, targetTypes, state.queue.nowUs) && !magicImmune(enemy) &&
    !enemy.abilities?.some(id => id === "Aloc" || id === "Avul") && !mechanicalEnemy(enemy);
}

export function heroAllySpellTargets(state: Match, tower: Construction, skillId: string) {
  if (skillId === "A190" || skillId === "T300" || skillId === "T318" || skillId === "T321" || skillId === "A199" ||
      skillId === "A133" || skillId === "A187" || skillId === "A202") {
    const range = heroSpells[skillId].range;
    return [...state.structures, ...(state.summons ?? [])].filter(ally =>
      (!ally.pending || ally.pending.upgradeTo) && (ally.life?.hp ?? 1) > 0 && !energyCircle(ally) &&
      (ally.x - tower.x) ** 2 + (ally.y - tower.y) ** 2 <= range ** 2);
  }
  return skillId === "A059" ? bloodlustTargets(state, tower, 1000, true) : wispLinkTargets(state, tower.id);
}

function canReplaceFocusCast(state: Match, tower: Construction) {
  if ((tower.focusRecoveryUntilUs ?? 0) > state.queue.nowUs) return true;
  return !!tower.hero?.ranks.A163 && tower.spellWindup !== undefined && state.queue.pending.some(({ timerId, payload }) =>
    timerId === tower.spellWindup && payload.type === "hero-spell" && payload.skillId === "A163");
}

function beginHeroSpell(state: Match, tower: Construction, skillId: HeroSpell, automatic: boolean,
  selection?: Pick<Extract<Action, { type: "cast-hero" }>, "point" | "targetId">): Result {
  const spec = heroSpells[skillId];
  const slot = skillId === "A218" ? "A217" : skillId;
  if (slot === "A217" && skillId !== activeHeroSkill(tower, slot)) return { ok: false, reason: "missing" };
  const rank = tower.hero?.ranks[slot] ?? 0;
  if (!spec || !rank || tower.pending) return { ok: false, reason: "missing" };
  const transforms = skillId === "A010" || skillId === "A239" || skillId === "A110" || skillId === "A169";
  if (transforms && (tower.dragonShape || tower.alchemistShape || tower.lycanShape || tower.life?.hp === 0)) return { ok: false, reason: "cooldown" };
  if (skillId === "A164" && tower.doomDigestTimer !== undefined) return { ok: false, reason: "cooldown" };
  if (automatic && skillId === "A180" && tower.sleight) return { ok: false, reason: "cooldown" };
  const now = state.queue.nowUs;
  const replaceFocus = (!automatic || skillId !== "A163") && canReplaceFocusCast(state, tower) &&
    (!automatic || tower.spellWindup !== undefined);
  if ((skillId === "A163" || skillId === "A192" || skillId === "A194" || tower.templateId === "H057") && (tower.life?.hp ?? 1) <= 0)
    return { ok: false, reason: "missing" };
  if (automatic && skillId === "A194" && isNightHunter(tower)) return { ok: false, reason: "cooldown" };
  const casterBusyUntil = tower.rearmTimer !== undefined || replaceFocus ||
    !automatic && (state.lifeDrains?.[tower.id] || tower.upheavalId !== undefined || tower.illuminateCharge !== undefined) ? 0 : tower.heroCastUntilUs ?? 0;
  if (now < Math.max(tower.stunnedUntilUs ?? 0, casterBusyUntil, tower.heroSpellReady?.[slot] ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  const mode = heroSpellTargetMode(skillId);
  if (automatic && skillId === "A075" && !state.enemies.some(enemy =>
    enemy.hp > 0 && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 600 ** 2)) return { ok: false, reason: "range" };
  if (automatic && (skillId === "A181" || skillId === "A188") && !state.enemies.some(enemy =>
    enemy.hp > 0 && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= spec.autoRange ** 2)) return { ok: false, reason: "range" };
  const pressTarget = automatic && skillId === "A133" ? firingUnit(state, tower.pressTheAttackTarget ?? tower.id) : undefined;
  const repeatingAlly = automatic && (skillId === "A190" || skillId === "T300" || skillId === "T318" || skillId === "A199" ||
    skillId === "A187" || skillId === "A202");
  const allyTarget = automatic && skillId === "A133" ? (pressTarget && (pressTarget.life?.hp ?? 1) > 0 ? pressTarget.id : tower.id) :
    repeatingAlly ? (skillId === "A187" ? tower.empowerTarget : skillId === "A202" ? tower.ionShellTarget :
      skillId === "A190" ? tower.chakraTargetId : skillId === "T300" ? tower.doomChakraTargetId : tower.doomFrost?.targetId) ?? tower.id : selection?.targetId;
  const target = mode === "ally" ? heroAllySpellTargets(state, tower, skillId).find(ally => ally.id === allyTarget) ??
    (repeatingAlly ? tower : undefined) :
    selection?.targetId !== undefined ? heroSpellTargets(state, tower.id, skillId).find(enemy => enemy.id === selection.targetId) :
    mode === "self" || selection?.point ? undefined : spellTarget(state, tower, automatic ? spec.autoRange : spec.range, skillId);
  if (automatic && (skillId === "A107" || skillId === "A231" || skillId === "A232") &&
      !state.enemies.some(enemy => enemy.hp > 0 && (skillId === "A231" ? !mapBoss(enemy) : mapBoss(enemy)) &&
        (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= spec.autoRange ** 2)) {
    return { ok: false, reason: "range" };
  }
  if (automatic && (skillId === "A001" || skillId === "A055" || skillId === "A056" || skillId === "A016" || skillId === "A017" || skillId === "A037" || skillId === "A043" || skillId === "T301" || skillId === "A066" || skillId === "A178") &&
      !state.enemies.some(enemy => enemy.hp > 0 && (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= spec.autoRange ** 2)) {
    return { ok: false, reason: "range" };
  }
  const point = mode === "self" ? tower : mode === "unit" || mode === "ally" ? target : selection?.point ?? target;
  if ((skillId === "A103" || skillId === "A176" || skillId === "A122") &&
      (!target || !("unitId" in target) || !eligibleHeroTarget(state, tower, target, spec.range, skillId))) return { ok: false, reason: "range" };
  if (automatic && skillId === "A160") {
    if (!target || !("unitId" in target) || !target.manaMax) return { ok: false, reason: "range" };
    syncEnemyMana(state, target);
    if (target.mana >= target.manaMax * .5) return { ok: false, reason: "range" };
  }
  const range = skillId === "T312" ? [500, 1500, 2000, 2500][rank - 1] : skillId === "A197" ? Infinity : spec.range;
  if (!point || !contains(map.bounds, point) || (point.x - tower.x) ** 2 + (point.y - tower.y) ** 2 > range ** 2) {
    return { ok: false, reason: "range" };
  }
  syncMana(state, tower);
  if (tower.mana! < (spec.mana[rank - 1] ?? spec.mana[0])) return { ok: false, reason: "resources" };
  if (!automatic) {
    stopLifeDrain(state, tower);
    stopUpheaval(state, tower);
    releaseIlluminate(state, tower);
  }
  if (replaceFocus) stopTowerCast(state, tower);
  if (tower.rearmTimer !== undefined) stopTowerCast(state, tower);
  if (skillId === "A024" || skillId === "A037" || skillId === "A043" || skillId === "A126" || skillId === "A196") {
    finishHeroSpell(state, { type: "hero-spell", towerId: tower.id, targetId: 0, skillId, point: tower });
    return { ok: true };
  }
  interruptWeapon(state, tower);
  if (transforms) {
    finishHeroSpell(state, { type: "hero-spell", towerId: tower.id, targetId: 0, skillId, point: tower });
    return { ok: true };
  }
  const windup = skillId === "A008" && tower.dragonShape || skillId === "A167" && tower.lycanShape ? .3 :
    "cast" in spec ? spec.cast : skillId === "A034" ? .5 : tower.templateId === "H042" ? .75 : .3;
  tower.heroCastUntilUs = now + us(windup + ("recovery" in spec ? spec.recovery : .1));
  tower.spellWindup = scheduleEvent(state.queue, us(windup), { type: "hero-spell", towerId: tower.id, targetId: target?.id ?? 0, skillId,
    point: { x: point.x, y: point.y }, ...(skillId === "A094" ? { wardVariant: !!tower.scepterWard } : {}) });
  return { ok: true };
}

function consumeEnemySpellShield(state: Match, enemy: Enemy) {
  const now = state.queue.nowUs;
  if (!enemyHasAbility(enemy, "N535") || now < (enemy.spellShieldReadyUs ?? 0)) return false;
  enemy.spellShieldReadyUs = now + us(6);
  return true;
}

const nightAttack = [50, 75, 100, 125, 150, 175];
const nightSpeed = [.35, .4, .45, .5, .55, .6];
const naturalNightMarkers: readonly NightMarker[] = ["T214", "T255", "T257"];

function isNightHunter(tower: Construction) {
  return tower.nightHunter?.marks.some(mark => mark === "T214" || mark === "T215" || mark === "T255" || mark === "T256") ?? false;
}

function nightHunterBonus(rank: number | undefined, bonuses: number[]) {
  return rank ? bonuses[(rank - 1) % 6] * (rank > 6 ? 2 : 1) : 0;
}

function switchNightRanks(state: Match, tower: Construction) {
  const hunter = tower.nightHunter!;
  const learned = tower.hero?.ranks.A193;
  if (!learned) return;
  const rank = learned + (isNightHunter(tower) ? 6 : 0);
  if (hunter.attackRank === rank) return;
  hunter.attackRank = hunter.speedRank = rank;
  weaponRatesDirty.add(state);
}

function learnHunterInTheNight(state: Match, tower: Construction) {
  const hunter = tower.nightHunter ??= { marks: [], attackRank: 0, speedRank: 0 };
  hunter.registered = true;
  hunter.marks = hunter.marks.filter(mark => !naturalNightMarkers.includes(mark));
  if (state.worldNight) {
    if (tower.templateId === "G071") hunter.marks.push("T255", "T257");
    else hunter.marks.push("T214");
  }
  switchNightRanks(state, tower);
}

function changeWorldNight(state: Match) {
  state.worldNight = !state.worldNight;
  for (const tower of state.structures) {
    const regenType = unitBalance.get(tower.templateId)?.regenType;
    if (tower.life && (regenType === "day" || regenType === "night")) syncTowerLife(state, tower);
    const hunter = tower.nightHunter;
    if (!hunter?.registered || tower.pending || (tower.life?.hp ?? 1) <= 0) continue;
    const marks: NightMarker[] = tower.templateId === "G071" ? ["T255", "T257"] : ["T214"];
    if (state.worldNight) hunter.marks = [...new Set([...hunter.marks, ...marks])];
    else hunter.marks = hunter.marks.filter(mark => !marks.includes(mark));
    switchNightRanks(state, tower);
  }
}

function castDarkAscension(state: Match, tower: Construction, rank: number) {
  const hunter = tower.nightHunter ??= { marks: [], attackRank: 0, speedRank: 0 };
  if (hunter.personalTimer !== undefined) cancelEvent(state.queue, hunter.personalTimer);
  hunter.personalTimer = scheduleEvent(state.queue, us(14 + rank), { type: "dark-ascension-end", towerId: tower.id });
  const marks: NightMarker[] = tower.templateId === "G071" ? ["T256", "T258"] : ["T215"];
  hunter.marks = [...new Set([...hunter.marks, ...marks])];
  switchNightRanks(state, tower);
}

function physicalAreaTarget(state: Match, enemy: Enemy) {
  return enemy.hp > 0 && state.queue.nowUs >= (enemy.phaseUntilUs ?? 0) &&
    !enemy.abilities?.some(id => id === "Avul" || id === "Aloc");
}

function castVoid(state: Match, tower: Construction, target: Enemy, base: number) {
  const amount = base + .13 * syncTowerLife(state, tower).maximum;
  const point = { x: target.x, y: target.y };
  const night = isNightHunter(tower);
  const skin = tower.templateId === "G071";
  const near = (enemy: Enemy) => (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 350 ** 2;
  const targets = night ? state.enemies.filter(enemy => near(enemy) && physicalAreaTarget(state, enemy))
    .sort((a, b) => a.id - b.id) : [target];
  for (const enemy of targets) {
    if (state.phase !== "running") break;
    if (!state.enemies.includes(enemy) || !physicalAreaTarget(state, enemy)) continue;
    damageEnemy(state, tower, tower.templateId, enemy,
      physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "A192");
  }
  const art = night ? (skin ? "A192G071Night" : "A192Night") : (skin ? "A192G071" : "A192");
  recordBattleAnimation(state, point, art, "model-effect");
  const commands = night ? state.enemies.filter(enemy => enemy.hp > 0 && near(enemy)).sort((a, b) => a.id - b.id) : [target];
  for (const enemy of commands) {
    const sourceId = state.nextId++;
    const carrierTimer = scheduleEvent(state.queue, us(night ? 2 : 1), {
      type: "void-carrier-expire", sourceId, towerId: tower.id, targetId: enemy.id, point, mana: 1000,
    });
    scheduleEvent(state.queue, 0, { type: "void-slow", sourceId, carrierTimer, targetId: enemy.id });
  }
}

function commitVoidSlow(state: Match, event: Extract<MatchEvent, { type: "void-slow" }>) {
  const carrier = state.queue.pending.find(entry => entry.timerId === event.carrierTimer)?.payload;
  if (carrier?.type !== "void-carrier-expire" || carrier.sourceId !== event.sourceId) return;
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!target || !physicalAreaTarget(state, target) || !targetable(target, ["ground", "air"], state.queue.nowUs) ||
      !canSeeEnemy(state, target) || magicImmune(target) ||
      (target.x - carrier.point.x) ** 2 + (target.y - carrier.point.y) ** 2 > 500 ** 2) return;
  carrier.mana -= 10;
  if (consumeEnemySpellShield(state, target)) return;
  target.voidSlowUntilUs = state.queue.nowUs + us(3);
  scheduleEvent(state.queue, us(3), { type: "void-slow-end", enemyId: target.id, untilUs: target.voidSlowUntilUs });
}

function spellDirection(tower: Point, point: Point) {
  const length = Math.hypot(point.x - tower.x, point.y - tower.y);
  return length ? { dx: (point.x - tower.x) / length, dy: (point.y - tower.y) / length } : { dx: 1, dy: 0 };
}

function boundedMorphRatio(numerator: number, denominator: number, cap: number) {
  if (numerator <= 0) return 0;
  return denominator <= 0 ? cap : Math.min(numerator / denominator, cap);
}

function toggleMorph(state: Match, tower: Construction, attribute: "STR" | "AGI"): Result {
  if (!tower.hero?.ranks.A225 || tower.pending || (tower.life?.hp ?? 1) <= 0) return { ok: false, reason: "missing" };
  if (state.queue.nowUs < (tower.stunnedUntilUs ?? 0)) return { ok: false, reason: "cooldown" };
  const previous = tower.morphShift;
  if (previous) cancelEvent(state.queue, previous.timerId);
  if (previous?.attribute === attribute) {
    delete tower.morphShift;
  } else {
    const timerId = scheduleEvent(state.queue, us(.1), { type: "morph-shift", towerId: tower.id }, us(.1));
    tower.morphShift = { attribute, timerId };
  }
  return { ok: true };
}

function tickMorphShift(state: Match, towerId: number, timerId: number) {
  const tower = firingUnit(state, towerId);
  const shift = tower?.morphShift;
  if (!tower?.hero || shift?.timerId !== timerId) {
    cancelEvent(state.queue, timerId);
    return;
  }
  const { attribute } = shift;
  const donor = attribute === "AGI" ? "STR" : "AGI";
  const rank = tower.hero.ranks.A225;
  const life = syncTowerLife(state, tower);
  syncMana(state, tower);
  const transfer = Math.min(rank ?? 0, tower.hero.natural[donor] - 1);
  if (tower.pending || transfer <= 0 || tower.mana! <= 3 || life.hp <= (attribute === "AGI" ? 500 : 0)) {
    cancelEvent(state.queue, timerId);
    delete tower.morphShift;
    return;
  }
  tower.hero.natural.STR += attribute === "STR" ? transfer : -transfer;
  syncTowerLife(state, tower);
  tower.hero.natural.AGI += attribute === "AGI" ? transfer : -transfer;
  tower.mana! -= 3;
  weaponRatesDirty.add(state);
}

function resolveMorphBolt(state: Match, event: Extract<MatchEvent, { type: "morph-bolt" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!target || !organicWaveTarget(state, target) ||
      !trackingProjectileArrived(state, event, target) || consumeEnemySpellShield(state, target)) return;
  stunEnemy(state, target, us(event.stun * (nativeControlHero(target) ? .7 : 1)));
  recordBattleAnimation(state, target, "T286", "model-effect");
  damageEnemy(state, firingUnit(state, event.towerId), "q056", target, 100 * .8, "magic", "T286", event.source);
}

function weaponAttackAndBonus(state: Match, tower: Construction) {
  const { attack, bonus } = weaponFields(state, tower, weapons[tower.templateId][0], towerGear(state, tower));
  return Math.fround(attack) + Math.fround(bonus);
}

function pulseRazorPlasma(state: Match, event: Extract<MatchEvent, { type: "razor-plasma" }>) {
  const tower = firingUnit(state, event.towerId);
  if (!tower || tower.pending || (tower.life?.hp ?? 1) <= 0) return;
  const phaseTick = (event.tick - 1) % 46 + 1;
  if (phaseTick === 1 || phaseTick === 23) event.hit = [];
  if (phaseTick <= 45) {
    const shell = phaseTick <= 22 ? phaseTick : 45 - phaseTick;
    const inner = Math.max(0, 50 * (shell - 1));
    const outer = 50 * shell + 20;
    const victims = state.enemies.filter(enemy => {
      const distance2 = (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2;
      return enemy.hp > 0 && distance2 >= inner ** 2 && distance2 <= outer ** 2 && !event.hit.includes(enemy.id);
    }).sort((left, right) => left.id - right.id);
    for (const enemy of victims) {
      if (state.phase !== "running") return;
      damageEnemy(state, tower, tower.templateId, enemy, event.amount * .8, "magic", "A204");
      if (state.phase !== "running") return;
      if ((tower.razorStormUntilUs ?? 0) > state.queue.nowUs || tower.flak) {
        triggerSpecialAttackEquipment(state, tower, enemy, weapons[tower.templateId][0], towerGear(state, tower));
      }
      event.hit.push(enemy.id);
    }
  }
  if (event.tick < 92) scheduleEvent(state.queue, us(.05), { ...event, tick: event.tick + 1 });
}

function beginRazorStatic(state: Match, tower: Construction, point: Point) {
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 400 ** 2)
    .sort((left, right) => left.id - right.id);
  if (!targets.length) return;
  const id = state.nextId++;
  tower.razorStatic = { id, attack: 0, untilUs: state.queue.nowUs + us(13) };
  scheduleEvent(state.queue, us(13), { type: "razor-static-end", towerId: tower.id, linkId: id });
  for (const target of targets) {
    const source = { id: state.nextId++, x: tower.x, y: tower.y };
    if (!organicWaveTarget(state, target) || !canSeeEnemy(state, target) ||
        (target.x - source.x) ** 2 + (target.y - source.y) ** 2 > 2000 ** 2 ||
        consumeEnemySpellShield(state, target)) continue;
    recordBattleAnimation(state, source, "BIZM", "spell-link", target).durationUs = us(1);
    scheduleEvent(state.queue, us(1), { type: "razor-static-tick", towerId: tower.id, targetId: target.id, source, linkId: id, remaining: 5 });
  }
}

function tickRazorStatic(state: Match, event: Extract<MatchEvent, { type: "razor-static-tick" }>) {
  const tower = firingUnit(state, event.towerId);
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!tower || tower.pending || !target || !organicWaveTarget(state, target) || !canSeeEnemy(state, target) ||
      (target.x - event.source.x) ** 2 + (target.y - event.source.y) ** 2 > 1000 ** 2) return;
  damageEnemy(state, tower, "q050", target, 10 * .8, "magic", "T229", { ...event.source, razorLinkId: event.linkId });
  if (event.remaining > 1) {
    recordBattleAnimation(state, event.source, "BIZM", "spell-link", target).durationUs = us(1);
    scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1 });
  }
}

function razorStormTargets(state: Match, enemy: Enemy) {
  return canSeeEnemy(state, enemy) && targetable(enemy, weapons.q051[0].targets, state.queue.nowUs) &&
    !enemy.abilities?.some(id => id === "Avul" || id === "Aloc");
}

function finishRazorStormFlight(state: Match, storm: RazorStorm) {
  if (storm.inFlight === 0 && state.queue.nowUs >= storm.untilUs) delete state.razorStorms?.[storm.id];
}

function shootRazorStorm(state: Match, id: number) {
  const storm = state.razorStorms?.[id];
  if (!storm) return;
  const tower = firingUnit(state, storm.towerId);
  if (!tower || tower.pending || (tower.life?.hp ?? 1) <= 0) {
    delete state.razorStorms?.[id];
    return;
  }
  const range = weapons.q051[0].max;
  const eligible = (enemy: Enemy) => razorStormTargets(state, enemy) &&
    (enemy.x - storm.x) ** 2 + (enemy.y - storm.y) ** 2 <= range ** 2;
  const current = state.enemies.find(enemy => enemy.id === storm.targetId && eligible(enemy));
  const target = current ?? state.enemies.filter(eligible).sort((left, right) => left.id - right.id)[0];
  if (target) {
    storm.targetId = target.id;
    storm.inFlight += 1;
    recordBattleAnimation(state, storm, "ChimaeraLightningMissile", "model-effect", target).durationUs =
      Math.max(1, us(Math.hypot(target.x - storm.x, target.y - storm.y) / weapons.q051[0].speed));
    launchTrackingProjectile(state, { type: "razor-storm-impact", stormId: id, targetId: target.id,
      position: { x: storm.x, y: storm.y }, travelUs: 0 }, target);
  }
  if (state.queue.nowUs + storm.intervalUs <= storm.untilUs) {
    scheduleEvent(state.queue, storm.intervalUs, { type: "razor-storm-shot", stormId: id });
  } else {
    finishRazorStormFlight(state, storm);
  }
}

function hitRazorStorm(state: Match, event: Extract<MatchEvent, { type: "razor-storm-impact" }>) {
  const storm = state.razorStorms?.[event.stormId];
  if (!storm) return;
  const tower = firingUnit(state, storm.towerId);
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (tower && target && razorStormTargets(state, target)) {
    if (!trackingProjectileArrived(state, event, target)) return;
    damageEnemy(state, tower, "q051", target, 11, "weapon", "T044", storm);
  }
  storm.inFlight -= 1;
  finishRazorStormFlight(state, storm);
}

function resolveRazorStormDamage(state: Match, tower: Construction, target: Enemy, storm: Point) {
  const rank = tower.hero?.ranks.A206;
  if (!rank || tower.pending || (tower.life?.hp ?? 1) <= 0) return;
  storm.x = tower.x;
  storm.y = tower.y;
  const base = weaponAttackAndBonus(state, tower) + heroSpells.A206.damage[rank - 1];
  const victims = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) &&
    (enemy.x - target.x) ** 2 + (enemy.y - target.y) ** 2 <= 250 ** 2).sort((left, right) => left.id - right.id);
  for (const enemy of victims) {
    if (state.phase !== "running") return;
    damageEnemy(state, tower, tower.templateId, enemy,
      physicalDamage(base, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "A206");
  }
  if (state.phase !== "running") return;
  const gear = towerGear(state, tower);
  const weapon = weapons[tower.templateId][0];
  triggerNativeAttackEquipment(state, tower, target, weapon, gear);
  if (state.phase !== "running") return;
  triggerAttackEquipment(state, tower, target, weapon, gear);
  target.armor = (target.armor ?? 0) - 1;
}

function launchLightWave(state: Match, tower: Construction, point: Point, name: "A189" | "A191", amount: number,
  lightCarrier: NonNullable<SpellSweep["lightCarrier"]>) {
  const direction = spellDirection(tower, point);
  const end = { x: tower.x + direction.dx * 1500, y: tower.y + direction.dy * 1500 };
  recordBattleAnimation(state, tower, name === "A189" ? "T207" : "T408", "model-effect", end);
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { x: tower.x, y: tower.y, ...direction,
    towerId: tower.id, sourceId: state.nextId++, name, speed: 1500, range: 1500, radiusStart: 400, radiusEnd: 400,
    amount, traveled: 0, hit: [], budget: 999_999, lightCarrier } });
}

function releaseIlluminate(state: Match, tower: Construction) {
  const charge = tower.illuminateCharge;
  if (!charge) return false;
  delete tower.illuminateCharge;
  cancelEvent(state.queue, charge.timerId);
  const now = state.queue.nowUs;
  tower.heroCastUntilUs = now;
  tower.heroSpellReady!.A189 = adjustedSpellCooldown(state, tower, tower.heroSpellReady!.A189!, 0, "A189");
  const elapsed = Math.min(charge.maxUs, Math.max(0, now - charge.startedUs)) / 1_000_000;
  const rank = tower.hero?.ranks.A189 ?? 0;
  const amount = elapsed * (heroSpells.A189.damage[rank - 1] ?? 0) * (hasScepter(state, tower) ? 1.9 : 1);
  launchLightWave(state, tower, charge.point, "A189", amount, "q064");
  return true;
}

function blindLightTarget(state: Match, enemy: Enemy) {
  if (!canSeeEnemy(state, enemy) || consumeEnemySpellShield(state, enemy)) return;
  const untilUs = state.queue.nowUs + us(5);
  enemy.illuminateBlindUntilUs = untilUs;
  const effect = recordBattleAnimation(state, enemy, "T409", "model-effect");
  effect.enemyId = enemy.id;
  effect.durationUs = us(5);
  scheduleEvent(state.queue, us(5), { type: "illuminate-blind-end", enemyId: enemy.id, untilUs });
}

function stopLifeDrain(state: Match, tower: Construction) {
  const drain = state.lifeDrains?.[tower.id];
  if (!drain) return false;
  cancelEvent(state.queue, drain.timerId);
  delete state.lifeDrains![tower.id];
  if (!Object.keys(state.lifeDrains!).length) delete state.lifeDrains;
  tower.heroCastUntilUs = state.queue.nowUs;
  tower.heroSpellReady![drain.skillId] = adjustedSpellCooldown(state, tower, tower.heroSpellReady![drain.skillId]!, 0, drain.skillId);
  return true;
}

function beginLifeDrain(state: Match, tower: Construction, enemy: Enemy, skillId: LifeDrain["skillId"], rank: number) {
  stopLifeDrain(state, tower);
  if (consumeEnemySpellShield(state, enemy)) {
    scheduleEvent(state.queue, us(.1), { type: "hero-spell-end", towerId: tower.id, skillId });
    return;
  }
  const endUs = state.queue.nowUs + us(8);
  const drains = state.lifeDrains ??= {};
  const carrier = hasScepter(state, tower) && !Object.values(drains).some(drain => drain.targetId === enemy.id && drain.carrier) ?
    { id: state.nextId++, x: tower.x, y: tower.y, hp: unitBalance.get("q026")!.HP!,
      active: organicWaveTarget(state, enemy) && !consumeEnemySpellShield(state, enemy) } : undefined;
  drains[tower.id] = { skillId, rank, targetId: enemy.id, endUs, carrier,
    timerId: scheduleEvent(state.queue, us(.5), { type: "life-drain-tick", towerId: tower.id }, us(.5)) };
  tower.heroCastUntilUs = endUs;
}

function lifeDrainTarget(state: Match, tower: Construction, drain: LifeDrain) {
  if (tower.pending || (tower.life?.hp ?? 1) <= 0 || state.queue.nowUs < (tower.stunnedUntilUs ?? 0)) return undefined;
  return state.enemies.find(enemy => enemy.id === drain.targetId && eligibleHeroTarget(state, tower, enemy, 1000, drain.skillId));
}

function tickLifeDrain(state: Match, towerId: number, timerId: number) {
  const tower = firingUnit(state, towerId);
  const drain = state.lifeDrains?.[towerId];
  if (!tower || drain?.timerId !== timerId) return;
  const enemy = lifeDrainTarget(state, tower, drain);
  if (!enemy) {
    stopLifeDrain(state, tower);
    return;
  }
  const lifeLost = damageEnemy(state, tower, tower.templateId, enemy, drain.rank * 100 * .8, "magic", drain.skillId) ?? 0;
  if (lifeLost > 0 && (tower.life?.hp ?? 1) > 0) {
    const life = syncTowerLife(state, tower);
    life.hp = Math.min(life.maximum, life.hp + lifeLost);
  }
  if (state.lifeDrains?.[towerId] !== drain) return;
  if (state.phase !== "running" || !lifeDrainTarget(state, tower, drain)) {
    stopLifeDrain(state, tower);
    return;
  }
  syncEnemyMana(state, enemy);
  syncMana(state, tower);
  const mana = Math.min(enemy.mana, [50, 80, 110, 140, 170, 200][drain.rank - 1]);
  enemy.mana -= mana;
  tower.mana = Math.min(tower.manaMaximum!, tower.mana! + mana);
  const carrier = drain.carrier;
  if (carrier?.active) {
    if (!organicWaveTarget(state, enemy) || (carrier.x - enemy.x) ** 2 + (carrier.y - enemy.y) ** 2 > 1000 ** 2) {
      carrier.active = false;
    } else {
      const losses = damageEnemy(state, tower, "q026", enemy, 100 * .8, "magic", "T099", carrier) ?? 0;
      carrier.hp = Math.min(unitBalance.get("q026")!.HP!, carrier.hp + losses);
    }
  }
  if (state.queue.nowUs === drain.endUs) stopLifeDrain(state, tower);
}

function finishHeroSpell(state: Match, event: Extract<MatchEvent, { type: "hero-spell" }>) {
  const { skillId, point } = event;
  const spec = heroSpells[skillId];
  const tower = state.structures.find(entry => entry.id === event.towerId);
  if (tower) delete tower.spellWindup;
  const now = state.queue.nowUs;
  if (!tower?.hero || tower.pending || now < (tower.stunnedUntilUs ?? 0)) return;
  if ((skillId === "A163" || skillId === "A192" || skillId === "A194" || tower.templateId === "H057") && (tower.life?.hp ?? 1) <= 0) return;
  const slot = skillId === "A218" ? "A217" : skillId;
  if (slot === "A217" && skillId !== activeHeroSkill(tower, slot)) return;
  const rank = tower.hero.ranks[slot];
  if (!rank) return;
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const mode = heroSpellTargetMode(skillId);
  const ally = mode === "ally" ? heroAllySpellTargets(state, tower, skillId).find(ally => ally.id === event.targetId) : undefined;
  if (mode === "ally" && !ally) return;
  if (mode === "unit" && (!target || !eligibleHeroTarget(state, tower, target, spec.range, skillId))) return;
  const range = skillId === "T312" ? [500, 1500, 2000, 2500][rank - 1] : skillId === "A197" ? Infinity : spec.range;
  if (mode === "point" && (!contains(map.bounds, point) || (point.x - tower.x) ** 2 + (point.y - tower.y) ** 2 > range ** 2)) return;
  if (event.wardVariant !== undefined && event.wardVariant !== !!tower.scepterWard) return;
  syncMana(state, tower);
  const cost = spec.mana[rank - 1] ?? spec.mana[0];
  if (tower.mana! < cost) return;
  tower.mana! -= cost;
  captureChakra(state, tower, slot);
  (tower.heroSpellReady ??= {})[slot] = now + us(spec.cooldown[rank - 1] ?? spec.cooldown[0]);
  tower.lastCastUs = now;
  const castTarget = mode === "unit" ? target! : ally ?? point;
  const priorAim = tower.lastCastTarget;
  tower.lastCastTarget = { x: castTarget.x, y: castTarget.y };
  const dragonAbility = skillId === "A010" || skillId === "A239";
  const transforms = dragonAbility || skillId === "A110" || skillId === "A169";
  if (transforms) enterHeroTransformation(state, tower, skillId, rank);
  if (skillId === "A024") tower.enrageUntilUs = now + us(8);
  const casts = triggerSpellEquipment(state, tower, skillId);
  if (state.phase !== "running") return;
  if (transforms) {
    const baseCooldown = dragonAbility && hasScepter(state, tower) ? 21 : spec.cooldown[rank - 1] ?? spec.cooldown[0];
    tower.heroSpellReady![skillId] = adjustedSpellCooldown(state, tower, now + us(baseCooldown), skillId === "A169" ? 19 : 0, skillId);
    return;
  }
  if (skillId === "A008") {
    const speed = 1050;
    const direction = spellDirection(tower, point);
    const art = tower.hero.ranks.A239 ? "A008G077" : "A008";
    recordBattleAnimation(state, tower, art, "model-effect", { x: tower.x + direction.dx * 600, y: tower.y + direction.dy * 600 });
    scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { x: tower.x, y: tower.y, ...direction,
      towerId: tower.id, sourceId: state.nextId++, name: skillId, speed, range: 600, radiusStart: rank === 2 ? 120 : 125,
      radiusEnd: 600, amount: spec.damage[rank - 1], traveled: 0, hit: [], budget: 9_999_999 } });
    scheduleEvent(state.queue, 0, { type: "hero-spell-end", towerId: tower.id, skillId });
    return;
  }
  if (skillId === "A075") {
    const duration = us(5 - rank * .5);
    tower.heroCastUntilUs = now + duration;
    tower.rearmTimer = scheduleEvent(state.queue, duration, { type: "rearm-finish", towerId: tower.id });
    return;
  }
  if (skillId !== "A189" && skillId !== "A001" && skillId !== "A093" && skillId !== "A016" && skillId !== "A103" && skillId !== "A176" && skillId !== "A174") {
    const recovery = skillId === "A223" || skillId === "A224" || skillId === "A205" || skillId === "A161" || skillId === "A162" || skillId === "A163" || skillId === "A209" ?
      heroSpells[skillId].recovery : .1;
    scheduleEvent(state.queue, us(recovery), { type: "hero-spell-end", towerId: tower.id, skillId });
  }
  const amount = spec.damage[rank - 1] ?? spec.damage[0];
  if (skillId === "A236") {
    const aim = point.x !== tower.x || point.y !== tower.y ? point : [priorAim, tower.lastAttackTarget]
      .find(aim => aim && (aim.x !== tower.x || aim.y !== tower.y)) ?? point;
    castImpale(state, tower, aim, amount);
    return;
  }
  if (skillId === "A237") {
    castLionHex(state, tower, point);
    return;
  }
  if (skillId === "A238" && target) {
    castFingerOfDeath(state, tower, target);
    return;
  }
  if (skillId === "A192" && target) {
    castVoid(state, tower, target, amount);
    return;
  }
  if (skillId === "A194") {
    castDarkAscension(state, tower, rank);
    return;
  }
  if ((skillId === "A217" || skillId === "A218") && target) {
    castTideWave(state, tower, target, skillId, rank);
    return;
  }
  if (skillId === "A221") {
    const fields = weaponFields(state, tower, weapons[tower.templateId][0], towerGear(state, tower));
    const raw = rank * (.2 * syncTowerLife(state, tower).maximum + .5 * (Math.fround(fields.attack) + Math.fround(fields.bonus)));
    const targets = state.enemies.filter(enemy => physicalAreaTarget(state, enemy) &&
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 600 ** 2).sort((a, b) => a.id - b.id);
    for (const enemy of targets) {
      if (state.phase !== "running") break;
      if (!state.enemies.includes(enemy) || !physicalAreaTarget(state, enemy)) continue;
      damageEnemy(state, tower, tower.templateId, enemy, physicalDamage(raw, "hero", armorAt(state, enemy), !!enemy.welfare),
        "physical", "A221");
    }
    return;
  }
  if (skillId === "A222") {
    castRavage(state, tower, rank, amount);
    return;
  }
  if (skillId === "A223") {
    const bearing = Math.atan2(point.y - tower.y, point.x - tower.x);
    const angle = Math.floor((bearing * 180 / Math.PI + 360) % 360) * Math.PI / 180;
    const finish = { x: tower.x + Math.cos(angle) * 960, y: tower.y + Math.sin(angle) * 960 };
    const visual = tower.templateId === "G075" ? "q058" : "q055";
    recordBattleAnimation(state, tower, visual, "model-effect", finish).durationUs = us(.78);
    recordBattleAnimation(state, finish, tower.templateId === "G075" ? "blackhole" : "NagaDeath", "model-effect", undefined, us(.72));
    scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { x: tower.x, y: tower.y, ...spellDirection(tower, point),
      towerId: tower.id, sourceId: state.nextId++, name: skillId, speed: 1100, range: 1000, radiusStart: 225, radiusEnd: 100,
      amount, traveled: 0, hit: [], budget: 999_999 } });
    return;
  }
  if (skillId === "A224" && target) {
    const { STR, AGI } = combatAttributes(state, tower);
    const ratio = boundedMorphRatio(STR, AGI, 4);
    const stun = Math.min([2, 2.8, 3.6, 4.4, 5.2, 6][rank - 1], .1 + (.3 + .2 * rank) * ratio);
    const source = { x: tower.x, y: tower.y, id: state.nextId++ };
    launchTrackingProjectile(state, { type: "morph-bolt", towerId: tower.id, targetId: target.id, source,
      position: { x: tower.x, y: tower.y }, expiresUs: now + us(1), travelUs: 0, stun }, target);
    return;
  }
  if (skillId === "A204") {
    const base = weaponAttackAndBonus(state, tower);
    scheduleEvent(state.queue, us(.05), { type: "razor-plasma", towerId: tower.id,
      amount: base * (hasScepter(state, tower) ? 5 : amount), tick: 1, hit: [] });
    return;
  }
  if (skillId === "A205") {
    beginRazorStatic(state, tower, point);
    return;
  }
  if (skillId === "A206") {
    const id = state.nextId++;
    const intervalUs = us(hasScepter(state, tower) ? .3 : .5);
    tower.razorStormUntilUs = now + us(15);
    (state.razorStorms ??= {})[id] = { id, towerId: tower.id, x: tower.x, y: tower.y,
      intervalUs, untilUs: tower.razorStormUntilUs, inFlight: 0 };
    scheduleEvent(state.queue, intervalUs, { type: "razor-storm-shot", stormId: id });
    return;
  }
  if (skillId === "A189" || skillId === "A191") {
    const direction = spellDirection(tower, point);
    const orb = { x: tower.x + direction.dx * 200, y: tower.y + direction.dy * 200 };
    if (skillId === "A189") {
      const maxUs = us(rank === 1 ? 1 : 2);
      tower.heroCastUntilUs = now + maxUs;
      tower.illuminateCharge = { point, orb, startedUs: now, maxUs,
        timerId: scheduleEvent(state.queue, maxUs, { type: "illuminate-timeout", towerId: tower.id }) };
    } else {
      recordBattleAnimation(state, tower, "q063", "model-effect", orb).durationUs = us(2);
      recordBattleAnimation(state, orb, "FarseerMissile", "model-effect").durationUs = us(2);
      scheduleEvent(state.queue, us(1.2), { type: "spirit-wave", towerId: tower.id, aim: orb });
    }
    return;
  }
  if (skillId === "A190" && ally) {
    tower.chakraTargetId = ally.id;
    syncMana(state, ally);
    const staff = hasScepter(state, tower);
    ally.mana = Math.min(ally.manaMaximum!, ally.mana! + amount + (staff ? ally.manaMaximum! * .13 : 0));
    if (staff) ally.chakraHasteUntilUs = now + us(7);
    else ally.chakraToken = { id: state.nextId++, untilUs: now + us(25) };
    recordBattleAnimation(state, ally, "AIimTarget", "model-effect");
    return;
  }
  if (skillId === "A186") {
    const facing = priorAim && (priorAim.x !== tower.x || priorAim.y !== tower.y) ? priorAim : tower.lastAttackTarget ?? point;
    const direction = spellDirection(tower, point.x === tower.x && point.y === tower.y ? facing : point);
    const staff = hasScepter(state, tower);
    const sourceId = state.nextId++;
    recordBattleAnimation(state, tower, "T205", "model-effect", {
      x: tower.x + direction.dx * 1000, y: tower.y + direction.dy * 1000,
    });
    scheduleEvent(state.queue, us(1), { type: "magnus-carrier-expire", towerId: tower.id,
      sourceId, skillId: "T205", rank: rank + (staff ? 6 : 0) });
    scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { x: tower.x, y: tower.y, ...direction,
      name: skillId, towerId: tower.id, sourceId, speed: 1200, range: 1000, radiusStart: 300, radiusEnd: 500,
      amount: amount * (staff ? 2 : 1), traveled: 0, hit: [], budget: 999_999 } });
    return;
  }
  if (skillId === "A187" && ally) {
    tower.empowerTarget = ally.id;
    if (ally.empower && ally.empower.rank > rank) return;
    if (ally.empower) cancelEvent(state.queue, ally.empower.timerId);
    ally.empower = { rank, timerId: scheduleEvent(state.queue, us(7), { type: "empower-end", towerId: ally.id }) };
    recordBattleAnimation(state, ally, "T198", "model-effect").durationUs = us(7);
    return;
  }
  if (skillId === "A188") {
    commitReversePolarity(state, tower, rank, amount);
    return;
  }
  if (skillId === "A201") {
    beginVacuum(state, tower, point, rank);
    return;
  }
  if (skillId === "A202" && ally) {
    tower.ionShellTarget = ally.id;
    const shells = state.ionShells ??= {};
    if (shells[ally.id]) cancelEvent(state.queue, shells[ally.id].timerId);
    const damage = amount + (hasScepter(state, tower) ? combatAttributes(state, tower).INT : 0);
    shells[ally.id] = { towerId: tower.id, amount: damage / 5, remaining: 50,
      timerId: scheduleEvent(state.queue, us(.2), { type: "ion-shell-tick", targetId: ally.id }, us(.2)) };
    return;
  }
  if (skillId === "A203") {
    replicateEnemies(state, point, rank);
    return;
  }
  if ((skillId === "A155" || skillId === "A156" || skillId === "A157") && target) {
    if (consumeEnemySpellShield(state, target)) return;
    if (skillId === "A155") {
      const cap = target.unitId === "mBOS" || /^m5[0-7][1-3]$/.test(target.unitId) ? 1 : hasScepter(state, tower) ? 10 : 5;
      const stacks = Math.min(cap, (target.oracleFlame?.stacks ?? 0) + 1);
      if (target.oracleFlame) cancelEvent(state.queue, target.oracleFlame.timerId);
      target.oracleFlame = { stacks, timerId: scheduleEvent(state.queue, us(5), { type: "oracle-flame-end", enemyId: target.id }) };
      syncEnemyHealth(state, target);
      const raw = (1000 + .05 * target.hp) * stacks;
      damageEnemy(state, tower, tower.templateId, target, physicalDamage(raw, "hero", armorAt(state, target), !!target.welfare),
        "physical", skillId);
      recordBattleAnimation(state, target, tower.templateId === "G064" ? "HAJT1" : "darkmending", "model-effect").durationUs = us(.5);
    } else if (skillId === "A156") {
      if (target.oracleEdict) cancelEvent(state.queue, target.oracleEdict.timerId);
      const duration = us(3 + rank * .5);
      target.oracleEdict = { timerId: scheduleEvent(state.queue, duration, { type: "oracle-edict-end", enemyId: target.id }) };
      const art = recordBattleAnimation(state, target, "fatesedict", "model-effect");
      art.durationUs = duration;
      art.enemyId = target.id;
    } else {
      if (tower.oraclePromise) settleOraclePromise(state, tower);
      if (state.phase !== "running" || target.hp <= 0 || !state.enemies.includes(target)) return;
      syncEnemyHealth(state, target);
      const remaining = 2 + rank;
      tower.oraclePromise = { targetId: target.id, initialHp: target.hp, remaining,
        timerId: scheduleEvent(state.queue, us(1), { type: "oracle-promise", towerId: tower.id }, us(1)) };
      const art = recordBattleAnimation(state, target, tower.templateId === "G064" ? "HAJT3" : "falsepromise", "model-effect");
      art.durationUs = us(remaining);
      art.enemyId = target.id;
    }
    return;
  }
  if (skillId === "A108") {
    const count = state.structures.filter(unit => !unit.pending && (unit.templateId === "H032" || unit.alchemistShape)).length;
    const cloud = { towerId: tower.id, point, rank, amount: Math.min(60_000, 150 * rank + state.gold / ([10, 9, 8, 7, 6, 4][rank - 1] * Math.max(1, count))) };
    pulseAcidCloud(state, cloud);
    if (state.phase !== "running") return;
    const cloudId = state.nextId++;
    for (let tick = 1; tick <= 5; tick++) scheduleEvent(state.queue, us(tick), { type: "acid-cloud-tick", cloudId });
    scheduleEvent(state.queue, us(5), { type: "acid-cloud-end", cloudId });
    (state.acidClouds ??= {})[cloudId] = cloud;
    return;
  }
  if (skillId === "A161" && target) {
    commitShackle(state, tower, target);
    return;
  }
  if (skillId === "A162") {
    const direction = spellDirection(tower, point);
    const sourceId = state.nextId++;
    const art = tower.templateId === "G072" ? "T260" : "T172";
    recordBattleAnimation(state, tower, art, "model-effect", { x: tower.x + direction.dx * 2000, y: tower.y + direction.dy * 2000 });
    scheduleEvent(state.queue, us(1), { type: "focus-carrier-expire", towerId: tower.id, sourceId, skillId: art, rank: 1,
      mana: 1000, point: { x: tower.x, y: tower.y } });
    scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { ...direction, x: tower.x, y: tower.y,
      towerId: tower.id, sourceId, name: skillId, speed: 3000, range: 2000, radiusStart: 200, radiusEnd: 200,
      amount: 100, traveled: 0, hit: [], budget: 99_999_999 } });
    return;
  }
  if (skillId === "A163") {
    const duration = us([3, 3.5, 4, 4.5, 5, 6][rank - 1]);
    tower.focusRecoveryUntilUs = now + us(.51);
    tower.focusRestoreTimer = scheduleEvent(state.queue, duration, { type: "focus-restore", towerId: tower.id });
    tower.focusCycleReductionUs = (tower.focusCycleReductionUs ?? 0) + 200_000;
    weaponRatesDirty.add(state);
    if (tower.templateId === "G072") recordBattleAnimation(state, tower, "H120", "model-effect").durationUs = duration;
    const sourceId = state.nextId++;
    const immune = towerSpellImmune(tower, now);
    scheduleEvent(state.queue, us(.5), { type: "focus-carrier-expire", towerId: tower.id, sourceId, skillId: "T171", rank,
      mana: 1000, point: { x: tower.x, y: tower.y } });
    if (!immune) {
      const untilUs = now + duration;
      tower.focusFire = { untilUs, sourceId, rank };
      scheduleWeaponRateEnd(state, tower, "focusFire", untilUs);
    }
    return;
  }
  if (skillId === "A073" && target) {
    fireTinkerLaser(state, tower, target);
    return;
  }
  if (skillId === "A074") {
    const { dx, dy } = spellDirection(tower, point);
    scheduleEvent(state.queue, 0, { type: "march-robot-launch", towerId: tower.id, sourceId: state.nextId++,
      point, direction: { x: dx, y: dy }, amount, index: 0 });
    return;
  }
  if (skillId === "A117" && target) {
    if (!consumeEnemySpellShield(state, target)) {
      const untilUs = now + us(5);
      target.lifeBreakSlowUs = untilUs;
      scheduleEvent(state.queue, us(5), { type: "life-break-slow-end", targetId: target.id, untilUs });
    }
    const life = syncTowerLife(state, tower);
    const multiplier = hasScepter(state, tower) ? 1.2 : 1;
    const ratio = Math.min((10 + life.maximum / 1000) / 100, [.15, .20, .25, .30, .35, .40][rank - 1]) * multiplier;
    life.hp = Math.max(1, life.hp * (1 - [.55, .50, .45, .40, .35, .30][rank - 1] * multiplier));
    syncEnemyHealth(state, target);
    const raw = target.hp * ratio * (target.unitId === "mBOS" ? .5 : 1);
    recordBattleAnimation(state, target, "A117", "model-effect");
    damageEnemy(state, tower, tower.templateId, target, raw * .8, "magic", "A117");
    return;
  }
  if (skillId === "A195") {
    if (tower.barrageTimer !== undefined) cancelEvent(state.queue, tower.barrageTimer);
    tower.barrageTimer = scheduleEvent(state.queue, us(.1), { type: "barrage-launch", towerId: tower.id, amount, remaining: 30 }, us(.1));
    return;
  }
  if (skillId === "A196") {
    if (tower.flak) cancelEvent(state.queue, tower.flak.timerId);
    tower.flak = { timerId: scheduleEvent(state.queue, us(3), { type: "flak-end", towerId: tower.id }),
      remaining: [3, 4, 4, 5, 5, 6][rank - 1] };
    return;
  }
  if (skillId === "A197") {
    for (const timerId of Object.values(tower.calldown ?? {})) cancelEvent(state.queue, timerId);
    const center = { x: point.x, y: point.y };
    tower.calldown = { first: scheduleEvent(state.queue, us(2), { type: "calldown", towerId: tower.id, point: center, stage: "first" }),
      second: scheduleEvent(state.queue, us(4), { type: "calldown", towerId: tower.id, point: center, stage: "second" }) };
    recordBattleAnimation(state, tower, "calldown_flyup", "model-effect");
    recordBattleAnimation(state, center, tower.templateId === "G080" ? "jijie" : "calldown_4", "model-effect");
    return;
  }
  if (skillId === "A207") {
    launchCask(state, tower, tower, target!, { castId: state.nextId++, jumps: 0 });
    return;
  }
  if (skillId === "A208") {
    const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 400 ** 2).sort((left, right) => left.id - right.id);
    const curseId = state.nextId++;
    const samples = targets.map(enemy => {
      syncEnemyHealth(state, enemy);
      return { id: enemy.id, hp: enemy.hp };
    });
    (state.witchCurses ??= {})[curseId] = { towerId: tower.id, rate: amount, targets: samples };
    scheduleEvent(state.queue, us(4), { type: "witch-curse", curseId, final: false });
    scheduleEvent(state.queue, us(8), { type: "witch-curse", curseId, final: true });
    return;
  }
  if (skillId === "A209") {
    if ((tower.life?.hp ?? 1) > 0 && state.structures.includes(tower)) {
      const facing = priorAim && (priorAim.x !== tower.x || priorAim.y !== tower.y) ? priorAim : tower.lastAttackTarget ?? tower;
      createDeathWard(state, tower, rank, facing);
    }
    return;
  }
  if (skillId === "A160") {
    const primary = target!;
    syncEnemyMana(state, primary);
    const maximum = primary.manaMax ?? 0;
    const missing = maximum - primary.mana;
    recordBattleAnimation(state, primary, tower.templateId === "G068" ? "T664" : "enchantment", "model-effect");
    if (missing > 0) {
      primary.mana = maximum;
      const center = { x: primary.x, y: primary.y };
      const raw = missing * (hasScepter(state, tower) ? 2 : 1);
      for (const enemy of [...state.enemies].sort((left, right) => left.id - right.id)) {
        if (state.phase !== "running") return;
        if (!state.enemies.includes(enemy) || !targetable(enemy, ["ground", "air", "mechanical", "structure"], now) ||
            (enemy.x - center.x) ** 2 + (enemy.y - center.y) ** 2 > 300 ** 2) continue;
        damageEnemy(state, tower, tower.templateId, enemy, raw * .8, "magic", skillId);
      }
    }
    if (state.phase === "running" && state.enemies.includes(primary)) {
      launchTrackingProjectile(state, { type: "mana-void-projectile", towerId: tower.id, targetId: primary.id,
        position: { x: tower.x, y: tower.y }, travelUs: 0 }, primary);
    }
    return;
  }
  if (skillId === "A132") {
    const victims = state.enemies.filter(enemy => enemy.hp > 0 &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 500 ** 2).sort((a, b) => a.id - b.id);
    const weight = victims.reduce((sum, enemy) => sum + (mapBoss(enemy) || enemy.welfare ? 5 : 1), 0);
    const fields = weaponFields(state, tower, weapons[tower.templateId][0], towerGear(state, tower));
    const raw = (Math.fround(fields.attack) + Math.fround(fields.bonus)) * weight * rank * .5;
    if (raw > 0) for (const enemy of victims) {
      if (state.phase !== "running") break;
      if (!state.enemies.includes(enemy) || !targetable(enemy, ["ground", "air", "structure", "ward"], now) ||
          enemy.abilities?.some(id => id === "Avul" || id === "Aloc")) continue;
      damageEnemy(state, tower, tower.templateId, enemy, physicalDamage(raw, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", skillId);
    }
    recordBattleAnimation(state, point, "A132", "model-effect");
    return;
  }
  if (skillId === "A133" && ally) {
    tower.pressTheAttackTarget = ally.id;
    clearTowerDebuffs(state, ally);
    if (ally.pressTheAttack && ally.pressTheAttack.untilUs > now && ally.pressTheAttack.rank > rank) return;
    const untilUs = now + us(7);
    ally.pressTheAttack = { rank, untilUs };
    scheduleWeaponRateEnd(state, ally, "pressTheAttack", untilUs);
    return;
  }
  if (skillId === "A134" && target) {
    if (tower.duel) cancelEvent(state.queue, tower.duel.timerId);
    const origin = { x: target.x, y: target.y };
    tower.duel = { targetId: target.id, point: origin, skin: tower.templateId === "G062", untilUs: now + us(5),
      timerId: scheduleEvent(state.queue, us(.5), { type: "duel-observe", towerId: tower.id }, us(.5)) };
    launchTrackingProjectile(state, { type: "duel-projectile", targetId: target.id, position: origin,
      travelUs: 0, expiresUs: now + us(1) }, target);
    return;
  }
  if (skillId === "A001") {
    const art = tower.templateId === "G053" ? "T135" : "T001";
    tower.requiemFollowTimer = scheduleEvent(state.queue, us(.6), { type: "hero-spell-end", towerId: tower.id, skillId });
    for (let ray = 1; ray <= 20; ray++) {
      const angle = (ray % 20) * Math.PI / 10;
      const direction = { dx: Math.cos(angle), dy: Math.sin(angle) };
      const sourceId = state.nextId++;
      scheduleEvent(state.queue, us(3), { type: "requiem-carrier-expire", towerId: tower.id, sourceId });
      scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: {
        towerId: tower.id, sourceId, name: skillId, x: tower.x, y: tower.y, ...direction, speed: 800, range: 800,
        radiusStart: 20, radiusEnd: 300, amount, traveled: 0, hit: [], budget: 9_999_999,
      } });
      recordBattleAnimation(state, tower, art, "model-effect", { x: tower.x + 800 * direction.dx, y: tower.y + 800 * direction.dy });
    }
    return;
  }
  if (skillId === "A024") {
    if (hasScepter(state, tower)) {
      const source = { x: tower.x, y: tower.y, id: state.nextId++ };
      scheduleEvent(state.queue, us(2), { type: "ursa-carrier-expire", sourceId: source.id, towerId: tower.id,
        skillId: "N015", rank: 1, mana: 950, point: { x: source.x, y: source.y } });
      const clap = towerSpells.get("n152")![0];
      if (clap.effect.kind === "clap") applyThunderClap(state, tower, clap.id, clap.effect, source);
      recordBattleAnimation(state, source, tower.templateId, "stomp-impact");
    }
    return;
  }
  if (skillId === "A031") {
    const inGroundCircle = (enemy: Enemy) => targetable(enemy, ["ground", "mechanical"], now) &&
      !enemy.abilities?.some(id => id === "Aloc" || id === "Avul") &&
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 800 ** 2;
    const duration = us(.8 + rank * .2);
    for (const target of state.enemies.filter(inGroundCircle).sort((a, b) => a.id - b.id)) {
      if (!magicImmune(target) && !mechanicalEnemy(target)) stunEnemy(state, target, duration);
    }
    recordBattleAnimation(state, tower, tower.templateId, "stomp-impact");
    for (const target of state.enemies.filter(inGroundCircle).sort((a, b) => a.id - b.id)) {
      if (state.phase !== "running") break;
      if (!state.enemies.includes(target) || !inGroundCircle(target) || target.abilities?.includes("Aeth")) continue;
      damageEnemy(state, tower, tower.templateId, target, physicalDamage(amount, "hero", armorAt(state, target), !!target.welfare),
        "physical", "A031");
    }
    return;
  }
  if (skillId === "A016") {
    const carrierIds = [state.nextId++, state.nextId++, state.nextId++] as [number, number, number];
    const fieldId = carrierIds[0];
    tower.freezingFieldId = fieldId;
    tower.heroCastUntilUs = now + us(7);
    (state.freezingFields ??= {})[fieldId] = { towerId: tower.id, point: { x: tower.x, y: tower.y },
      rank, endsUs: tower.heroCastUntilUs, carrierIds };
    for (let index = 1; index <= 7; index++) scheduleEvent(state.queue, us(index), { type: "freezing-pulse", fieldId, index });
    scheduleEvent(state.queue, us(7), { type: "freezing-end", fieldId });
    return;
  }
  if (skillId === "A125") {
    replaceSpiritBear(state, tower, rank, tower.lastAttackTarget ?? priorAim ?? { x: tower.x + 1, y: tower.y });
    return;
  }
  if (skillId === "A126") {
    activateBearFrenzy(state, tower, rank);
    return;
  }
  if (skillId === "A127") {
    const mana = tower.mana!;
    const hp = tower.life ? syncTowerLife(state, tower).hp : undefined;
    const seconds = weapons[tower.templateId][0].cooldown;
    tower.bearFormInterval = { seconds, timerId: scheduleEvent(state.queue, us(3), { type: "bear-form-end", towerId: tower.id }) };
    tower.templateId = tower.templateId === "E016" ? "H036" : "E016";
    syncMana(state, tower);
    tower.mana = Math.min(mana, tower.manaMaximum!);
    if (hp !== undefined) {
      const life = syncTowerLife(state, tower);
      life.hp = Math.min(hp, life.maximum);
    }
    weaponRatesDirty.add(state);
    return;
  }
  if (skillId === "A037") {
    scheduleEvent(state.queue, us(.5), { type: "dark-pact-start", towerId: tower.id });
    return;
  }
  if (skillId === "A017") {
    const candidates = state.enemies.filter(enemy => (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 600 ** 2)
      .sort((a, b) => a.id - b.id);
    for (const target of candidates) {
      if (state.phase !== "running") return;
      if (!state.enemies.includes(target) || !freezingTarget(state, target, false)) continue;
      const duration = us(.7 + rank * .1);
      target.iceBindingUntilUs = Math.max(target.iceBindingUntilUs ?? 0, now + duration);
      interruptEnemyCast(state, target);
      scheduleEvent(state.queue, target.iceBindingUntilUs - now, { type: "stun-expire", enemyId: target.id });
      damageEnemy(state, tower, tower.templateId, target, amount * .8, "magic", "A017");
    }
    return;
  }
  if (skillId === "A058" && target) {
    if (casts > 1) scheduleEvent(state.queue, us(.6), { type: "ogre-repeat", towerId: tower.id, targetId: target.id, remaining: casts - 1 });
    sendOgreBlast(state, tower, target, rank, false);
    return;
  }
  if (skillId === "A059" && ally) {
    const candidates = bloodlustTargets(state, tower, 1200, false, true).filter(unit => unit !== ally &&
      (unit.x - ally.x) ** 2 + (unit.y - ally.y) ** 2 <= 600 ** 2).sort((a, b) => a.id - b.id);
    const amount = [.5, .6, .7, .8, .9, 1][rank - 1];
    for (let count = 1; count < casts && candidates.length; count++) {
      const index = candidates.length > 1 ? Math.floor(roll(state) * candidates.length) : 0;
      const [target] = candidates.splice(index, 1);
      applyBloodlust(state, target, amount, 7);
    }
    applyBloodlust(state, ally, amount, 7);
    return;
  }
  if (skillId === "A028") {
    const radius = [300, 350, 400, 450, 500, 600][rank - 1];
    const carrier = { ...point, id: state.nextId++ };
    recordBattleAnimation(state, carrier, tower.templateId, "stomp-impact");
    const victims = state.enemies.filter(enemy => organicWaveTarget(state, enemy, ["ground"]) &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= radius ** 2).sort((a, b) => a.id - b.id);
    for (const enemy of victims) {
      if (state.phase !== "running") return;
      if (!organicWaveTarget(state, enemy, ["ground"]) || !state.enemies.includes(enemy)) continue;
      stunEnemy(state, enemy, us((rank + 4) / 5));
      damageEnemy(state, tower, "q001", enemy, amount * .8, "magic", skillId, carrier);
    }
    return;
  }
  if (skillId === "A029" && target) {
    chainLightning(state, tower.id, tower, target, 800, 5 + rank, amount * .8, skillId, 500);
    return;
  }
  if (skillId === "A111" && ally) {
    connectWisp(state, tower, ally);
    return;
  }
  if (skillId === "A113") {
    if (terrainAllowsConstruction(point)) tower.wispRelocateTimer =
      scheduleEvent(state.queue, us(.1), { type: "wisp-relocate", towerId: tower.id, point });
    return;
  }
  if (skillId === "A034" && target) {
    const source = { x: tower.x, y: tower.y };
    launchTrackingProjectile(state, { type: "wraith-projectile", towerId: tower.id, targetId: target.id,
      source, position: { ...source }, expiresUs: now + us(1), travelUs: 0, rank }, target);
    return;
  }
  if (skillId === "T300" && ally) {
    tower.doomChakraTargetId = ally.id;
    syncMana(state, ally);
    const restore = [300, 400, 500 + .05 * tower.manaMaximum!, 600 + .10 * tower.manaMaximum!][rank - 1];
    ally.mana = Math.min(ally.manaMaximum!, ally.mana! + restore);
    return;
  }
  if (skillId === "T301") {
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > 600 ** 2) continue;
      if (organicWaveTarget(state, enemy) && targetable(enemy, ["ground"], now)) {
        enemy.doomRoarUntilUs = Math.max(enemy.doomRoarUntilUs ?? 0, now + us([1.4, 1.6, 1.8, 2][rank - 1]));
      }
      const source = { x: tower.x, y: tower.y, id: state.nextId++ };
      scheduleEvent(state.queue, us(1), { type: "doom-poison-cast", towerId: tower.id, targetId: enemy.id, source, damage: amount });
    }
    return;
  }
  if ((skillId === "T302" || skillId === "T303" || skillId === "T328") && target) {
    const source = { x: tower.x, y: tower.y, id: skillId === "T328" ? tower.id : state.nextId++ };
    const flight = { type: "doom-projectile", towerId: tower.id, targetId: target.id, source,
      position: { x: source.x, y: source.y }, travelUs: 0 } as const;
    if (skillId === "T302") {
      launchTrackingProjectile(state, { ...flight, spell: skillId, expiresUs: now + us(1), visited: [], mana: 0 }, target);
    } else if (skillId === "T303") {
      const stun = 1 + Math.floor(roll(state) * (rank + 1));
      launchTrackingProjectile(state, { ...flight, spell: skillId, expiresUs: now + us(4), stun }, target);
    } else {
      launchTrackingProjectile(state, { ...flight, spell: skillId, damage: amount }, target);
      const helper = { ...source, id: state.nextId++ };
      launchTrackingProjectile(state, { ...flight, source: helper, spell: "T230", expiresUs: now + us(1), rank }, target);
    }
    return;
  }
  if (skillId === "T310" || skillId === "T324") {
    const radius = skillId === "T310" ? 1200 : 800;
    const stompRank = Math.floor(Math.min(11, Math.max(1, combatAttributes(state, tower).STR / 200)));
    const targets = state.enemies.filter(enemy =>
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= radius ** 2 &&
      targetable(enemy, ["ground", "air", "structure"], now)).sort((left, right) => left.id - right.id);
    const carrier = { x: tower.x, y: tower.y, id: state.nextId++ };
    recordBattleAnimation(state, carrier, "q001", "stomp-impact");
    for (const enemy of targets) {
      if (state.phase !== "running") return;
      if (enemy.hp <= 0) continue;
      if (organicWaveTarget(state, enemy)) {
        const duration = skillId === "T324" ? .8 + .2 * rank :
          1 + (mapBoss(enemy) ? .2 : .3) * (stompRank - 1);
        stunEnemy(state, enemy, us(duration));
      }
      if (skillId === "T310") damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", skillId);
      else damageEnemy(state, tower, tower.templateId, enemy, physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare),
        "physical", skillId);
    }
    return;
  }
  if (skillId === "T311") {
    const untilUs = now + us([2.5, 3, 3.5, 4][rank - 1]);
    tower.doomBloodlust = { untilUs, amount: .5 + .5 * rank };
    scheduleWeaponRateEnd(state, tower, "doomBloodlust", untilUs);
    return;
  }
  if (skillId === "T312") {
    scheduleEvent(state.queue, us(.1), { type: "doom-blink", towerId: tower.id, point });
    return;
  }
  if (skillId === "T313") {
    for (const enemy of state.enemies) {
      if (enemy.hp > 0 && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 500 ** 2) {
        enemy.doomWeave = { amount: [20, 30, 40, 60][rank - 1], untilUs: now + us(5) };
      }
    }
    return;
  }
  if (skillId === "T314" && target) {
    const token = state.queue.nextSequence++;
    tower.doomInfernalToken = token;
    if (organicWaveTarget(state, target) && !consumeEnemySpellShield(state, target)) stunEnemy(state, target, us(.5));
    tickDoomInfernal(state, { type: "doom-infernal", towerId: tower.id, targetId: target.id, token, remaining: 5 });
    return;
  }
  if (skillId === "T315") {
    const victims = state.enemies.filter(enemy => enemy.hp > 0 &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 400 ** 2).sort((left, right) => left.id - right.id);
    const weight = victims.reduce((sum, enemy) => sum + (mapBoss(enemy) ? 5 : 1), 0);
    const slots = weapons[tower.templateId][0];
    const fields = weaponFields(state, tower, slots, towerGear(state, tower));
    const raw = .2 * (Math.fround(fields.attack) + Math.fround(fields.bonus)) * weight;
    for (const enemy of victims) {
      if (state.phase !== "running") return;
      damageEnemy(state, tower, tower.templateId, enemy, physicalDamage(raw, "hero", armorAt(state, enemy), !!enemy.welfare),
        "physical", skillId);
    }
    return;
  }
  if ((skillId === "A198" || skillId === "T317") && target) {
    const maximum = target.maxHp ?? target.hp;
    damageEnemy(state, tower, "q025", target, 10_000_000, "divine", skillId,
      { x: tower.x, y: tower.y, id: state.nextId++ });
    const restore = Math.min(3000, Math.max(200, maximum * [.04, .06, .08, .10, .12, .14][rank - 1]));
    tower.mana = Math.min(tower.manaMaximum!, tower.mana! + restore);
    if (skillId === "A198") recordBattleAnimation(state, target, "A198", "model-effect");
    return;
  }
  if ((skillId === "A199" || skillId === "T318") && ally) {
    const token = state.queue.nextSequence++;
    tower.doomFrost = { token, targetId: ally.id };
    const pulse = { type: "doom-frost", towerId: tower.id, targetId: ally.id, token } as const;
    if (skillId === "A199") {
      recordBattleAnimation(state, ally, "FrostArmorTarget", "model-effect");
      tickDoomFrost(state, { ...pulse, tick: 0, skillId });
    } else scheduleEvent(state.queue, us(1.5), { ...pulse, tick: 1 });
    return;
  }
  if (skillId === "A200" && target) {
    const source = { x: tower.x, y: tower.y, id: state.nextId++ };
    launchTrackingProjectile(state, { type: "doom-projectile", spell: "A200", towerId: tower.id, targetId: target.id,
      source, position: source, travelUs: 0, remaining: 10 }, target);
    return;
  }
  if (skillId === "T319" && target) {
    if (!consumeEnemySpellShield(state, target)) {
      target.doomTrack = { casterId: tower.id, amount: 10 + 10 * rank, untilUs: now + us(10) };
    }
    return;
  }
  if (skillId === "T321" && ally) {
    applyBloodlust(state, ally, .4 + .1 * rank, 7);
    return;
  }
  if (skillId === "T322") {
    tower.doomTotem = { untilUs: now + us(14), scale: 3 + 2 * rank };
    return;
  }
  if (skillId === "A080") {
    const inTorrent = (enemy: Enemy) => enemy.hp > 0 &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 350 ** 2;
    for (const enemy of state.enemies.filter(inTorrent).sort((a, b) => a.id - b.id)) {
      if (state.phase !== "running") return;
      damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", skillId);
    }
    if (state.phase !== "running") return;
    recordBattleAnimation(state, point, tower.templateId === "G042" ? "AZ_Coco_E2_Blast" : "ShuiDaoEffDef", "model-effect");
    const token = state.queue.nextSequence;
    const victims = state.enemies.filter(enemy => inTorrent(enemy) && !enemy.torrentLift).sort((a, b) => a.id - b.id);
    for (const enemy of victims) {
      enemy.torrentLift = { token, height: 0 };
      interruptEnemyCast(state, enemy);
    }
    if (victims.length) scheduleEvent(state.queue, us(.025), { type: "torrent-step", token, targets: victims.map(enemy => enemy.id), step: 1 });
    return;
  }
  if (skillId === "A082") {
    beginGhostFleet(state, tower, point, amount, priorAim);
    return;
  }
  if (skillId === "A089" && target) {
    const throwId = state.nextId++;
    launchBountyProjectile(state, tower, tower, target, rank, throwId, 6);
    if (hasScepter(state, tower)) markBounty(state, tower, target);
    launchBountyProjectile(state, tower, tower, target, rank, throwId);
    return;
  }
  if (skillId === "A173" && target) {
    beginFatalBonds(state, tower, target, rank);
    return;
  }
  if (skillId === "A174") {
    beginUpheaval(state, tower, point, rank);
    return;
  }
  if (skillId === "A175") {
    const count = hasScepter(state, tower) ? 2 : 1;
    for (let index = 0; index < count; index++) {
      scheduleEvent(state.queue, us(1), { type: "infernal-land", towerId: tower.id, rank,
        source: { ...point, id: state.nextId++ } });
      recordBattleAnimation(state, point, "T189", "model-effect", undefined, us(1));
    }
    return;
  }
  if (skillId === "A122" && target) {
    launchPhantomSpear(state, tower, tower, target, rank, { castId: state.nextId++, contacts: 1 });
    return;
  }
  if (skillId === "A091" && target) {
    if (!consumeEnemySpellShield(state, target)) {
      if (target.bountyArmor) cancelEvent(state.queue, target.bountyArmor.timerId);
      target.bountyArmor = { amount: 10 + 10 * rank, untilUs: now + us(10),
        timerId: scheduleEvent(state.queue, us(10), { type: "bounty-armor-end", enemyId: target.id }) };
    }
    markBounty(state, tower, target);
    return;
  }
  if (skillId === "A101") {
    const vampire = tower.templateId === "G060";
    scheduleEvent(state.queue, us(vampire ? .2 : .8), { type: "nether-blast", towerId: tower.id,
      point, damage: amount, visual: vampire ? "PsiWave" : "WispExplode" });
    return;
  }
  if (skillId === "A102") {
    const targets = state.enemies.filter(enemy => ogreBlastTarget(state, enemy) &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 300 ** 2).sort((a, b) => a.id - b.id);
    for (const enemy of targets) {
      if (consumeEnemySpellShield(state, enemy)) continue;
      const untilUs = now + us(5);
      enemy.decrepifyUntilUs = untilUs;
      scheduleEvent(state.queue, us(5), { type: "decrepify-end", enemyId: enemy.id, untilUs });
      recordBattleAnimation(state, enemy, "T098", "model-effect").enemyId = enemy.id;
    }
    return;
  }
  if ((skillId === "A103" || skillId === "A176") && target) {
    beginLifeDrain(state, tower, target, skillId, rank);
    return;
  }
  if (skillId === "A085") {
    const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 550 ** 2).sort((a, b) => a.id - b.id);
    const intelligence = (tower.hero.ranks.A083 ?? 0) * targets.length;
    if (intelligence && hasScepter(state, tower)) {
      changeAstralIntelligence(state, tower, intelligence);
      scheduleEvent(state.queue, us(70), { type: "astral-intelligence-end", towerId: tower.id, amount: intelligence });
    }
    const magic = combatAttributes(state, tower).INT * [6, 10, 14, 18, 22, 30][rank - 1];
    recordBattleAnimation(state, point, tower.templateId === "G069" ? "New_SZZS" : "ShenZhiZhiShi", "model-effect");
    for (const enemy of targets) {
      if (state.phase !== "running") return;
      damageEnemy(state, tower, tower.templateId, enemy, magic * .8, "magic", skillId);
    }
    return;
  }
  if (skillId === "A064") {
    const facing = priorAim && (priorAim.x !== tower.x || priorAim.y !== tower.y) ? priorAim : tower.lastAttackTarget;
    const direction = spellDirection(tower, point.x === tower.x && point.y === tower.y && facing ? facing : point);
    scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: {
      x: tower.x, y: tower.y, ...direction, towerId: tower.id, name: skillId, speed: 1100, range: 1000,
      radiusStart: 300, radiusEnd: 500, amount, traveled: 0, hit: [], budget: 999_999, targets: ["ground", "air", "mechanical"],
    } });
    recordBattleAnimation(state, tower, "A064", "model-effect", { x: tower.x + direction.dx * 1000, y: tower.y + direction.dy * 1000 });
    return;
  }
  if (skillId === "A066") {
    if (tower.exorcismToken !== undefined) clearExorcism(state, tower.id, tower.exorcismToken);
    const token = tower.exorcismToken = state.queue.nextSequence;
    const event = { type: "exorcism", towerId: tower.id, token } as const;
    const count = 3 + 2 * rank + (hasScepter(state, tower) ? 8 : 0);
    scheduleEvent(state.queue, us(.1), { ...event, stage: "spawn", remaining: count });
    scheduleEvent(state.queue, us(15), { ...event, stage: "return" });
    scheduleEvent(state.queue, us(16), { ...event, stage: "remove" });
    scheduleEvent(state.queue, us(1), { ...event, stage: "control" });
    return;
  }
  if (skillId === "A065" || skillId === "T323") {
    const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 300 ** 2).sort((left, right) => left.id - right.id);
    if (!targets.length) return;
    clearDoomDrain(tower);
    const untilUs = now + us(8);
    tower.doomDrain = { untilUs, bonus: 0 };
    scheduleEvent(state.queue, us(8), { type: "doom-drain-end", towerId: tower.id, untilUs });
    for (const target of targets) {
      const source = { x: tower.x, y: tower.y, id: state.nextId++ };
      if (!canSeeEnemy(state, target) || !organicWaveTarget(state, target) || consumeEnemySpellShield(state, target)) continue;
      scheduleEvent(state.queue, us(1), { type: "doom-drain", towerId: tower.id, targetId: target.id, damage: amount,
        source, remaining: 5, hp: unitBalance.get(skillId === "A065" ? "q013" : "q047")?.HP ?? 1,
        ...(skillId === "A065" && { skillId }),
        ...(skillId === "A065" && tower.templateId === "G022" && { nativeSkill: "T170" }) });
    }
    return;
  }
  if (skillId === "T326") {
    state.summons = state.summons?.filter(unit => unit.summon?.ownerId !== tower.id || unit.summon.skillId !== "T326");
    const count = rank === 1 ? 2 : 3;
    const templateId = ["b150", "b151", "b153", "b154"][rank - 1];
    const gear = towerGear(state, tower).map(item => item.itemId);
    const attributes = combatAttributes(state, tower);
    const modifiers = summonModifiers(gear);
    const inheritance = modifiers.red || modifiers.green || modifiers.blue ? .6 : gear.includes("i240") ? .5 : .4;
    const attack = Math.floor((attributes.STR + attributes.AGI + attributes.INT) * inheritance);
    const facing = spellDirection(tower, priorAim ?? tower.lastAttackTarget ?? tower);
    const rotation = Math.atan2(facing.dy, facing.dx);
    for (let index = 0; index < count; index++) {
      const angle = rotation + index * Math.PI * 2 / count;
      const ideal = { x: tower.x + 50 * Math.cos(angle), y: tower.y + 50 * Math.sin(angle) };
      spawnSummon(state, nearestSpawn(ideal, 0, "ground"), templateId,
        { ...modifiers, ownerId: tower.id, skillId, attack }, 25);
    }
    return;
  }
  if (skillId === "T327") {
    const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 600 ** 2);
    for (const enemy of targets) {
      if (state.phase !== "running") return;
      syncEnemyHealth(state, enemy);
      const amountBefore = enemy.hp;
      damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", "T327");
      if (state.phase === "running") damageEnemy(state, tower, tower.templateId, enemy, Math.floor(amountBefore * .05 * rank), "divine", "T327");
    }
    return;
  }
  if (skillId === "A164" && target) {
    devourEnemy(state, tower, target, rank);
    return;
  }
  if (skillId === "T329" && target) {
    stealEnemyAbility(state, tower, target);
    return;
  }
  if (skillId === "A165") {
    const token = state.queue.nextSequence++;
    tower.doomScorchToken = token;
    tickDoomScorch(state, { type: "doom-scorch", towerId: tower.id, token, remaining: 11 });
    return;
  }
  if (skillId === "A166" && target) {
    if (!consumeEnemySpellShield(state, target)) {
      const token = state.queue.nextSequence;
      const suppressed = hasScepter(state, tower) ?
        ["N524", "T017", "N533", "N535", "N579", "N536", "N525"].filter(id => target.abilities?.includes(id)) : [];
      target.doomCurse = { token, untilUs: now + us(10), suppressed };
      interruptEnemyCast(state, target);
      scheduleEvent(state.queue, us(1), { type: "doom-curse", towerId: tower.id, targetId: target.id,
        token, damage: amount, remaining: 10 });
    }
    return;
  }
  if (skillId === "A231") {
    if (tower.spectreRefraction) cancelEvent(state.queue, tower.spectreRefraction.timerId);
    tower.spectreRefraction = { timerId: scheduleEvent(state.queue, us(4), { type: "spectre-refraction", towerId: tower.id }),
      untilUs: now + us(4), total: 0 };
    return;
  }
  if (skillId === "A232") {
    hauntBosses(state, tower, rank);
    return;
  }
  if (skillId === "A104" && target) {
    chainLightning(state, tower.id, { x: tower.x, y: tower.y, id: state.nextId++ }, target, 5000, 10, amount * .8, skillId, 500);
    return;
  }
  if (skillId === "A106") {
    const cloudId = state.nextId++;
    scheduleEvent(state.queue, us(1), { type: "zeus-cloud", cloudId, towerId: tower.id, point: { ...point }, remaining: 10,
      visualUntilUs: now + us(tower.templateId === "G048" ? 10 : 5),
      visualModelId: tower.templateId === "G048" ? "A106G048" : "A106H031" });
    return;
  }
  if (skillId === "A107") {
    zeusWrath(state, tower, amount);
    return;
  }
  if (skillId === "A046") {
    startDeathPulse(state, tower);
    return;
  }
  if (skillId === "A181") {
    castBristleGoo(state, tower, rank);
    return;
  }
  if (skillId === "A182") {
    sprayQuills(state, tower, rank);
    return;
  }
  if (skillId === "A178") {
    beginSearingChains(state, tower, rank);
    return;
  }
  if (skillId === "A179") {
    if (tower.flameGuard) cancelEvent(state.queue, tower.flameGuard.timerId);
    const timerId = scheduleEvent(state.queue, us(1), { type: "flame-guard", towerId: tower.id }, us(1));
    tower.flameGuard = { timerId, remaining: 15 };
    pulseEmberSpell(state, tower, "A179", timerId);
    return;
  }
  if (skillId === "A180") {
    beginSleight(state, tower, point, rank);
    return;
  }
  if (skillId === "A214") {
    launchWildAxes(state, tower, point);
    return;
  }
  if (skillId === "A215") {
    callWildBeasts(state, tower, rank, tower.lastAttackTarget ?? priorAim ?? { x: tower.x + 1, y: tower.y });
    return;
  }
  if (skillId === "A233" || skillId === "A234") {
    const field = skillId === "A233" ? "firestorm" : "pit";
    if (tower[field]) cancelEvent(state.queue, tower[field]!.timerId);
    const timerId = scheduleEvent(state.queue, us(1), { type: "pit-pulse", towerId: tower.id, skillId }, us(1));
    tower[field] = { ...point, timerId, remaining: skillId === "A233" ? 6 : 8 };
    pulsePitSpell(state, tower, skillId, timerId);
    return;
  }
  if (skillId === "A049" || skillId === "A130" || skillId === "A167") {
    const facing = tower.lastAttackTarget ?? priorAim ?? { x: tower.x + 1, y: tower.y };
    createFeralSpiritGroup(state, tower, rank, facing, skillId === "A167");
    return;
  }
  if (skillId === "A050") {
    if (tower.prophetTeleportTimer !== undefined) cancelEvent(state.queue, tower.prophetTeleportTimer);
    tower.prophetTeleportTimer = scheduleEvent(state.queue, us(.1), { type: "prophet-teleport", towerId: tower.id, point });
    return;
  }
  if (skillId === "A051" && target) {
    natureWrath(state, tower, target, rank, amount * .8);
    return;
  }
  if (skillId === "A054") {
    startEclipse(state, tower);
    return;
  }
  if (skillId === "A055") {
    axeBerserkCall(state, tower, rank);
    return;
  }
  if (skillId === "A056") {
    runAxeHelix(state, tower, rank);
    return;
  }
  if (skillId === "A057" && target) {
    axeCull(state, tower, target);
    return;
  }
  if (skillId === "A041") {
    tower.strafeUntilUs = now + us([4, 5, 6, 7, 8, 10][rank - 1]);
    scheduleWeaponRateEnd(state, tower, "strafeUntilUs", tower.strafeUntilUs);
    return;
  }
  if (skillId === "A061" || skillId === "A119" || skillId === "A128") {
    releaseStormHammers(state, tower, point, skillId, amount);
    return;
  }
  if (skillId === "A063" || skillId === "A118") {
    tower.godsStrength = { untilUs: now + us(12), rank, variant: skillId };
    recordBattleAnimation(state, tower, skillId === "A118" ? "AZ_TS_G3" : tower.templateId === "G054" ? "AZ_TZFire" : "RoarCaster", "model-effect");
    return;
  }
  if (skillId === "A043") {
    startBladeStorm(state, tower, rank);
    return;
  }
  if (skillId === "A045" && target) {
    startOmnislash(state, tower, target);
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
    const extra = state.phase === "running" && hasScepter(state, tower)
      ? state.enemies.filter(enemy => enemy.hp > 0 && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 900 ** 2)
        .sort((left, right) => left.id - right.id)[0] : undefined;
    if (extra && eligibleHeroTarget(state, tower, extra, 1500, "A020")) lagunaBlade(state, tower, extra, amount);
    return;
  }
  const origin = { x: tower.x, y: tower.y };
  if (skillId === "A079") {
    createMonkeyFormation(state, tower, point, rank);
    return;
  }
  if (skillId === "A076") {
    const facing = priorAim && (priorAim.x !== origin.x || priorAim.y !== origin.y) ? priorAim : tower.lastAttackTarget;
    const aim = point.x === origin.x && point.y === origin.y && facing ? facing : point;
    scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { ...origin, ...spellDirection(origin, aim),
      towerId: tower.id, sourceId: state.nextId++, name: skillId, speed: 3000, range: 1500,
      radiusStart: 500, radiusEnd: 500, amount, traveled: 0, hit: [],
      budget: 9_999_999, targets: ["ground", "structure"] } });
    return;
  }
  if (skillId === "A094") {
    if (state.structures.includes(tower) && !tower.pending) createSerpentWards(state, tower, point, rank);
    return;
  }
  if (skillId === "A151" && target) {
    const scepterActive = hasScepter(state, tower);
    if (scepterActive && !target.welfare) launchMagicArrow(state, tower.id, target, origin, rank, true);
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
  const facing = priorAim && (priorAim.x !== origin.x || priorAim.y !== origin.y) ? priorAim : tower.lastAttackTarget;
  const aim = skillId === "A092" && target ? target : point;
  const direction = spellDirection(origin, aim.x === origin.x && aim.y === origin.y && facing ? facing : aim);
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
    const pendingIce = state.queue.pending.find(({ payload }) => payload.type === "spell-sweep" &&
      payload.sweep.name === "A170" && payload.sweep.towerId === tower.id && payload.sweep.aim);
    if (pendingIce) cancelEvent(state.queue, pendingIce.timerId);
    scheduleEvent(state.queue, us(.3), { type: "spell-sweep", sweep: { ...sweep, sourceId: state.nextId++, hit: [],
      amount: 100, budget: 999_999, slow: .20 + rank * .05, aim: point } });
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

const doomStealRoster: Readonly<Record<string, readonly string[]>> = doomRules.records[0].rules.steal.roster;
const doomBorrowedLabels: Readonly<Record<string, string>> = {
  T300: "查克拉魔法", T301: "狂战士怒吼", T302: "秘术异蛇", T303: "混乱箭", T304: "恩赐解脱",
  T307: "失效力场", T310: "马蹄践踏", T311: "嗜血渴望", T312: "闪烁", T313: "编织", T314: "阎刃",
  T315: "压倒性优势", T316: "超强力量", T317: "邪恶祭祀", T318: "冰霜魔盾", T319: "追踪术",
  T320: "龙族血统", T321: "嗜血术", T322: "强化图腾", T323: "吸魂巫术", T324: "鱼人碎击",
  T325: "力量压制", T326: "召狼", T327: "死亡旋风", T328: "巨浪",
};

export function doomAbilities(tower: Construction) {
  const steal = tower.hero?.ranks.T329;
  const borrowed = tower.doomBorrowed;
  return [
    ...(steal ? [{ id: "T329", name: "夺取技能", rank: steal }] : []),
    ...(borrowed ? [{ ...borrowed, name: doomBorrowedLabels[borrowed.id] }] : []),
  ];
}

function enemyHasAbility(enemy: Enemy, id: string) {
  return !!enemy.abilities?.includes(id) && !enemy.doomCurse?.suppressed.includes(id);
}

function stealEnemyAbility(state: Match, tower: Construction, enemy: Enemy) {
  const roster = doomStealRoster[enemy.unitId];
  if (!roster) {
    if (tower.heroSpellReady) tower.heroSpellReady.T329 = state.queue.nowUs;
    return;
  }
  const id = roster[enemy.unitId === "m026" && (state.overdraftPoints ?? 0) > 13 ? 1 : 0];
  const prior = tower.doomBorrowed;
  const rank = prior?.id === id ? Math.min(4, prior.rank + 1) : 1 + Math.floor(roll(state) * 4);
  const ranks = tower.hero!.ranks;
  if (prior) delete ranks[prior.id];
  ranks[id] = rank;
  if (tower.heroSpellReady && Object.hasOwn(heroSpells, id)) delete tower.heroSpellReady[id as HeroSpell];
  tower.doomBorrowed = { id, rank };
}

function devourEnemy(state: Match, tower: Construction, target: Enemy, rank: number) {
  if (tower.doomDigestTimer !== undefined) {
    scheduleEvent(state.queue, us(.1), { type: "doom-retry", towerId: tower.id });
    return;
  }
  const level = unitBalance.get(target.unitId)?.level ?? 0;
  const gold = level * 140;
  const maximum = target.maxHp ?? target.hp;
  const boss = mapBoss(target);
  if (boss) state.gold += gold;
  else {
    const seconds = Math.ceil(target.hp / (200 * rank + .03 * maximum));
    tower.doomDigestTimer = scheduleEvent(state.queue, us(seconds), { type: "doom-digest", towerId: tower.id, gold });
  }
  const fraction = [.15, .20, .25, .30, .35, .40][rank - 1];
  tower.mana = Math.min(tower.manaMaximum!, tower.mana! + tower.manaMaximum! * fraction);
  if (boss) {
    const factor = target.unitId === "mBOS" || challengeTemplates.some(entry => entry.unitId === target.unitId) ? .10 : .30;
    damageEnemy(state, tower, tower.templateId, target, level * 200 + target.hp * factor, "divine", "A164");
  } else {
    damageEnemy(state, tower, "q025", target, 10_000_000, "divine", "A164",
      { x: tower.x, y: tower.y, id: state.nextId++ });
  }
}

function tickDoomScorch(state: Match, event: Extract<MatchEvent, { type: "doom-scorch" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  if (!tower || tower.doomScorchToken !== event.token) return;
  const currentRank = tower.hero?.ranks.A165 ?? 0;
  const position = { x: tower.x, y: tower.y };
  const amount = combatAttributes(state, tower).STR * (1 + 2 * currentRank);
  const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) &&
    (enemy.x - position.x) ** 2 + (enemy.y - position.y) ** 2 <= 500 ** 2).sort((left, right) => left.id - right.id);
  for (const enemy of targets) {
    if (state.phase !== "running") return;
    if (state.enemies.includes(enemy)) damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", "A165");
  }
  if (tower.doomScorchToken !== event.token) return;
  if (event.remaining === 1) delete tower.doomScorchToken;
  else scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1 });
}

function stepTorrent(state: Match, event: Extract<MatchEvent, { type: "torrent-step" }>) {
  const active: number[] = [];
  for (const enemy of state.enemies) {
    if (enemy.torrentLift?.token !== event.token || !event.targets.includes(enemy.id)) continue;
    if (event.step === 80) delete enemy.torrentLift;
    else {
      enemy.torrentLift.height += event.step <= 40 ? 20 : -20;
      active.push(enemy.id);
    }
  }
  if (active.length) scheduleEvent(state.queue, us(.025), { ...event, targets: active, step: event.step + 1 });
}

function beginGhostFleet(state: Match, tower: Construction, point: Point, amount: number, priorAim?: Point) {
  const aim = point.x === tower.x && point.y === tower.y ? priorAim ?? tower.lastAttackTarget ?? point : point;
  const { dx, dy } = spellDirection(tower, aim);
  const source = nearestSpawn({ x: point.x - 1800 * dx, y: point.y - 1800 * dy }, 0, "ground");
  const id = state.nextId++;
  (state.ghostFleets ??= {})[id] = { towerId: tower.id, source, point, amount,
    visual: tower.templateId === "G042" ? "T080" : "T079", seen: [] };
  releaseGhostWave(state, id);
  scheduleEvent(state.queue, us(10), { type: "fleet-expire", fleetId: id });
  if (!hasScepter(state, tower)) return;
  if (tower.fleetFollowId !== undefined) {
    for (const { payload, timerId } of [...state.queue.pending]) {
      if (payload.type === "fleet-release" && payload.fleetId === tower.fleetFollowId) cancelEvent(state.queue, timerId);
    }
  }
  tower.fleetFollowId = id;
  scheduleEvent(state.queue, us(2), { type: "fleet-release", fleetId: id });
  scheduleEvent(state.queue, us(4), { type: "fleet-release", fleetId: id });
}

function releaseGhostWave(state: Match, fleetId: number) {
  const fleet = state.ghostFleets?.[fleetId];
  if (!fleet) return;
  const direction = spellDirection(fleet.source, fleet.point);
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: {
    ...fleet.source, ...direction, sourceId: fleetId, towerId: fleet.towerId, name: "A082",
    speed: 800, range: 1400, radiusStart: 425, radiusEnd: 425, amount: fleet.amount, traveled: 0, hit: [],
    targets: ["ground", "air", "structure", "mechanical", "ward"], budget: 9_999_999,
  } });
  recordBattleAnimation(state, fleet.source, fleet.visual, "model-effect",
    { x: fleet.source.x + 1400 * direction.dx, y: fleet.source.y + 1400 * direction.dy });
}

function ghostWaveHit(state: Match, tower: Construction, target: Enemy, fleetId: number) {
  const fleet = state.ghostFleets?.[fleetId];
  if (!fleet) return;
  if (organicWaveTarget(state, target) && canSeeEnemy(state, target) && !consumeEnemySpellShield(state, target)) {
    stunEnemy(state, target, us(1.5));
  }
  if (fleet.seen.includes(target.id)) return;
  fleet.seen.push(target.id);
  const now = state.queue.nowUs;
  const prior = tower.fleetAura;
  const layers = Math.min(15, (prior && prior.untilUs > now ? prior.layers : 0) + 1);
  tower.fleetAura = { layers, untilUs: now + us(5) };
  scheduleWeaponRateEnd(state, tower, "fleetAura", tower.fleetAura.untilUs);
}

function releaseTidebringer(state: Match, tower: Construction, target: Enemy) {
  if (tower.tidebringerTimer !== undefined) return;
  const rank = tower.hero!.ranks.A081 ?? 0;
  tower.tidebringerTimer = scheduleEvent(state.queue, us(7 - .5 * rank), { type: "tidebringer-ready", towerId: tower.id });
  const weapon = weapons[tower.templateId][0];
  const gear = towerGear(state, tower);
  const field = weaponFields(state, tower, weapon, gear);
  const raw = (Math.fround(field.attack) + Math.fround(field.bonus)) * (.7 + .3 * rank);
  const center = { x: target.x, y: target.y };
  const cast = (radius: number, damage: number) => {
    if (damage <= 0) return;
    const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure", "mechanical", "ward"], state.queue.nowUs) &&
      (enemy.x - center.x) ** 2 + (enemy.y - center.y) ** 2 <= radius ** 2).sort((a, b) => a.id - b.id);
    for (const enemy of targets) {
      if (state.phase !== "running") return;
      if (radius === 650 && canSeeEnemy(state, enemy)) recordBattleAnimation(state, enemy, "ShuiDaoHands", "model-effect");
      damageEnemy(state, tower, tower.templateId, enemy, damage, "divine", "A081");
    }
  };
  if (gear.some(item => item.itemId === "i209")) cast(520, raw * .9);
  else if (gear.some(item => item.itemId === "i115")) cast(380, raw * .45);
  cast(650, raw);
  delete tower.hero!.ranks.T082;
  tower.permanentAttack = (tower.permanentAttack ?? 0) - 400 * rank;
}

function clearDoomDrain(tower: Construction) {
  if (!tower.doomDrain) return;
  if (tower.hero) tower.hero.natural.INT -= tower.doomDrain.bonus;
  delete tower.doomDrain;
}

function tickDoomFrost(state: Match, event: Extract<MatchEvent, { type: "doom-frost" }>) {
  const tower = firingUnit(state, event.towerId);
  if (!tower || tower.doomFrost?.token !== event.token) return;
  const target = firingUnit(state, event.targetId);
  if (!target) return;
  const skillId = event.skillId ?? "T318";
  const rank = tower.hero?.ranks[skillId] ?? 0;
  const source = { x: target.x, y: target.y, id: state.nextId++ };
  const damage = (heroSpells[skillId].damage[rank - 1] ?? 0) +
    combatAttributes(state, tower).INT * (hasScepter(state, tower) ? 4 : 2);
  scheduleEvent(state.queue, us(.2), { type: "doom-frost-hit", towerId: tower.id, source, damage, skillId: event.skillId });
  if (event.skillId) recordBattleAnimation(state, source, "T1946", "model-effect");
  for (const enemy of state.enemies) {
    if ((enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2 <= 800 ** 2 && organicWaveTarget(state, enemy) &&
        canSeeEnemy(state, enemy) && !consumeEnemySpellShield(state, enemy)) {
      enemy.doomFrostUntilUs = state.queue.nowUs + us(2);
    }
  }
  if (event.tick < 4) scheduleEvent(state.queue, us(1.5), { ...event, tick: event.tick + 1 });
}

function tickDoomDrain(state: Match, event: Extract<MatchEvent, { type: "doom-drain" }>) {
  const enemy = state.enemies.find(unit => unit.id === event.targetId);
  const tower = firingUnit(state, event.towerId);
  if (!enemy || !organicWaveTarget(state, enemy) ||
      (enemy.x - event.source.x) ** 2 + (enemy.y - event.source.y) ** 2 > 1000 ** 2) return;
  const sourceTemplate = event.skillId === "A065" ? "q013" : "q047";
  const nativeSkill = event.nativeSkill ?? "T058";
  recordBattleAnimation(state, event.source, sourceTemplate, "heal-link", enemy);
  const before = enemy.hp;
  damageEnemy(state, tower, sourceTemplate, enemy, event.damage * .8, "magic", nativeSkill, event.source);
  const amount = Math.max(0, before - enemy.hp);
  if (tower?.hero && tower.doomDrain) {
    const rank = tower.hero.ranks[event.skillId ?? "T323"] ?? 0;
    const add = ([0, 5, 7, 10, 13, 16, 20][rank] ?? 0) + (hasScepter(state, tower) ? 10 : 0);
    tower.hero.natural.INT += add;
    tower.doomDrain.bonus += add;
  }
  if (state.phase === "running" && state.enemies.includes(enemy) && event.remaining > 1) {
    const hp = Math.min(unitBalance.get(sourceTemplate)?.HP ?? 1, event.hp + amount);
    scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1, hp });
  }
}

function tickDoomInfernal(state: Match, event: Extract<MatchEvent, { type: "doom-infernal" }>) {
  const tower = firingUnit(state, event.towerId);
  if (!tower || tower.doomInfernalToken !== event.token) return;
  const enemy = state.enemies.find(unit => unit.id === event.targetId);
  if (enemy && state.phase === "running") {
    syncEnemyHealth(state, enemy);
    const rank = tower.hero?.ranks.T314 ?? 0;
    const factor = enemy.unitId === "mBOS" || challengeTemplates.some(template => template.unitId === enemy.unitId) ? .5 : 1;
    damageEnemy(state, tower, tower.templateId, enemy, enemy.hp * .01 * rank * factor * .8, "magic", "T314");
  }
  if (enemy && state.enemies.includes(enemy) && event.remaining > 1 && state.phase === "running") {
    scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1 });
  } else if (tower.doomInfernalToken === event.token) delete tower.doomInfernalToken;
}

function tickDoomCurse(state: Match, event: Extract<MatchEvent, { type: "doom-curse" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (target?.doomCurse?.token !== event.token) return;
  const owner = state.structures.find(entry => entry.id === event.towerId);
  if (owner) damageEnemy(state, owner, owner.templateId, target, event.damage * .8, "magic", "A166");
  if (target.doomCurse?.token !== event.token || !state.enemies.includes(target)) return;
  if (event.remaining === 1) delete target.doomCurse;
  else scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1 });
}

function hauntBosses(state: Match, tower: Construction, rank: number) {
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && mapBoss(enemy)).sort((left, right) => left.id - right.id);
  for (const target of targets) {
    const destination = target.path?.[0] ?? map.waypoints[target.waypoint] ?? { x: target.x + 1, y: target.y };
    const direction = spellDirection(target, destination);
    const distance = target.radius + tower.radius;
    const behind = { x: target.x - direction.dx * distance, y: target.y - direction.dy * distance };
    if (!contains(map.bounds, behind)) continue;
    const location = nearestSpawn(behind, 1, "ground");
    spawnTowerIllusions(state, tower, "A232", 1, 3 + rank, 1, 1, location, target);
  }
}

function spectreSource(state: Match, tower: Construction, source: (Point & { id: number }) | undefined) {
  if (source === tower) return tower;
  return state.summons?.find(unit => unit === source && unit.summon?.ownerId === tower.id && unit.summon.illusion);
}

function spectreDesolate(state: Match, tower: Construction, source: Construction, target: Enemy) {
  const rank = tower.hero?.ranks.A230 ?? 0;
  const now = state.queue.nowUs;
  if (!rank || source !== tower && !source.summon?.spectreRank ||
      (source.spectreDesolateReadyUs ?? 0) > now) return;
  source.spectreDesolateReadyUs = now + us(.5);
  const amount = (120 * rank + combatAttributes(state, tower).AGI * [0, 0, 2, 4, 6, 8][rank - 1]) *
    (target.unitId === "mBOS" ? .01 : 1);
  const surrounded = state.enemies.some(enemy => enemy !== target && enemy.hp > 0 &&
    (enemy.x - target.x) ** 2 + (enemy.y - target.y) ** 2 <= 150 ** 2);
  damageEnemy(state, tower, source.templateId, target,
    surrounded ? physicalDamage(amount, "hero", armorAt(state, target), !!target.welfare) : amount,
    surrounded ? "physical" : "divine", "A230", source, !!source.summon?.illusion);
}

function finishSpectreRefraction(state: Match, towerId: number, timerId: number) {
  const tower = state.structures.find(entry => entry.id === towerId);
  const window = tower?.spectreRefraction;
  if (!tower || window?.timerId !== timerId) return;
  delete tower.spectreRefraction;
  const rank = tower.hero?.ranks.A231;
  if (!rank || window.total === 0) return;
  const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 900 ** 2).sort((left, right) => left.id - right.id);
  for (const target of targets) {
    if (state.phase !== "running") return;
    if (!state.enemies.includes(target)) continue;
    const distance = Math.hypot(target.x - tower.x, target.y - tower.y);
    const amount = Math.trunc(window.total * .15 * rank * (1000 - distance) / 1000);
    if (amount > 0) {
      recordBattleAnimation(state, tower, tower.templateId, "spell-link", target);
      damageEnemy(state, tower, tower.templateId, target, amount, "divine", "A231");
    }
  }
}

function zeusStaticField(state: Match, tower: Construction) {
  const rank = tower.hero?.ranks.A105;
  if (!rank) return;
  const intelligence = combatAttributes(state, tower).INT;
  const share = Math.min(intelligence / 16000, [.06, .07, .08, .09, .10, .12][rank - 1]);
  const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 1000 ** 2).sort((left, right) => left.id - right.id);
  for (const target of targets) {
    if (state.phase !== "running") return;
    if (!state.enemies.includes(target)) continue;
    const divine = target.hp * share * (mapBoss(target) ? .5 : 1);
    if (divine > 0) damageEnemy(state, tower, tower.templateId, target, divine, "divine", "A105");
    if (state.phase === "running" && state.enemies.includes(target)) {
      damageEnemy(state, tower, tower.templateId, target, 300 * rank * .8, "magic", "A105");
    }
  }
}

function tickZeusCloud(state: Match, event: Extract<MatchEvent, { type: "zeus-cloud" }>) {
  const tower = state.structures.find(entry => entry.id === event.towerId);
  const now = state.queue.nowUs;
  if (tower) {
    const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air"], now) &&
      !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Avul" || id === "Aloc") &&
      (enemy.x - event.point.x) ** 2 + (enemy.y - event.point.y) ** 2 <= 500 ** 2).sort((left, right) => left.id - right.id);
    for (const target of targets) {
      if (state.phase !== "running") return;
      if (!state.enemies.includes(target) || consumeEnemySpellShield(state, target)) continue;
      const source = { x: target.x, y: target.y, id: state.nextId++ };
      stunEnemy(state, target, us(resistantToControl(target) ? .2 : .3));
      recordBattleAnimation(state, event.point, tower.templateId, "spell-link", target);
      damageEnemy(state, tower.pending ? undefined : tower, "q001", target, 1000 * .8, "magic", "A106", source);
    }
  }
  if (event.remaining > 1 && state.phase === "running") {
    scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1 });
  }
}

function zeusWrath(state: Match, tower: Construction, damage: number) {
  const scepter = hasScepter(state, tower);
  const centers = state.enemies.filter(enemy => enemy.hp > 0 &&
    (mapBoss(enemy) || enemy.unitId === "m998" || enemy.unitId === "m999")).sort((left, right) => left.id - right.id);
  let count = 0;
  for (const center of centers) {
    if (state.phase !== "running") return;
    if (!state.enemies.includes(center)) continue;
    const distance = Math.hypot(center.x - tower.x, center.y - tower.y);
    const scale = center.unitId === "m998" || center.unitId === "m999" ? 2 :
      distance < 1500 ? 1 : 300 / (distance - 650);
    const point = { x: center.x, y: center.y };
    const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 200 ** 2).sort((left, right) => left.id - right.id);
    count++;
    recordBattleAnimation(state, tower, tower.templateId, "spell-link", point);
    for (const target of targets) {
      if (state.phase !== "running") return;
      if (state.enemies.includes(target)) damageEnemy(state, tower, tower.templateId, target, damage * scale * .8, "magic", "A107");
    }
    if (scepter && state.enemies.includes(center)) {
      const missingLife = (center.maxHp ?? center.hp) - center.hp;
      if (missingLife > 0) damageEnemy(state, tower, tower.templateId, center,
        missingLife * .12 * scale * (/^m5[0-7][1-3]$/.test(center.unitId) ? .5 : 1), "divine", "A107");
    }
  }
  if (count) scheduleEvent(state.queue, us(.1), { type: "zeus-wrath-rebate", towerId: tower.id, count });
}

function axeBerserkCall(state: Match, tower: Construction, rank: number) {
  const now = state.queue.nowUs;
  const eligible = state.enemies.filter(enemy => enemy.hp > 0 &&
    (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 600 ** 2).sort((left, right) => left.id - right.id);
  for (const enemy of eligible) {
    if (targetable(enemy, ["ground"], now) && !magicImmune(enemy) && !mechanicalEnemy(enemy) &&
        !enemy.abilities?.some(id => id === "Avul" || id === "Aloc")) {
      stunEnemy(state, enemy, us(1 + .2 * (rank - 1)));
    }
    if (!organicWaveTarget(state, enemy) || !canSeeEnemy(state, enemy)) continue;
    const source = { x: tower.x, y: tower.y, id: state.nextId++ };
    scheduleEvent(state.queue, 0, { type: "axe-bleed-impact", towerId: tower.id, targetId: enemy.id,
      source, damage: heroSpells.A055.damage[rank - 1], travelUs: 0, expiresUs: now + us(1) });
  }
}

function advanceAxeBleed(state: Match, event: Extract<MatchEvent, { type: "axe-bleed-impact" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const now = state.queue.nowUs;
  if (!target || now > event.expiresUs || !organicWaveTarget(state, target)) return;
  const distance = Math.hypot(target.x - event.source.x, target.y - event.source.y);
  const travelUs = us(distance / 1800);
  if (travelUs > event.travelUs) {
    const direction = spellDirection(event.source, target);
    const traveled = event.travelUs * .0018;
    const next = Math.min(travelUs - event.travelUs, movementStepUs);
    scheduleEvent(state.queue, next, { ...event, travelUs: next,
      source: { ...event.source, x: event.source.x + direction.dx * traveled, y: event.source.y + direction.dy * traveled } });
    return;
  }
  if (consumeEnemySpellShield(state, target)) return;
  target.axeBleed = { sourceId: event.source.id, untilUs: now + us(10) };
  scheduleEvent(state.queue, us(1), { type: "axe-bleed-tick", towerId: event.towerId, targetId: event.targetId,
    source: event.source, damage: event.damage, remaining: 10 });
}

function tickAxeBleed(state: Match, event: Extract<MatchEvent, { type: "axe-bleed-tick" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!target || target.axeBleed?.sourceId !== event.source.id) return;
  if (!organicWaveTarget(state, target)) {
    delete target.axeBleed;
    return;
  }
  const owner = state.structures.find(tower => tower.id === event.towerId && !tower.pending);
  damageEnemy(state, owner, "q001", target, event.damage * .8, "magic", "A055", event.source);
  if (target.axeBleed?.sourceId !== event.source.id || !state.enemies.includes(target) || state.phase !== "running") return;
  if (event.remaining === 1) delete target.axeBleed;
  else scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1 });
}

function runAxeHelix(state: Match, tower: Construction, rank: number) {
  const gear = towerGear(state, tower);
  const [weapon] = weapons[tower.templateId];
  const fields = weaponFields(state, tower, weapon, gear);
  const strength = combatAttributes(state, tower).STR;
  const amount = (fields.attack + fields.bonus + strength * [1, 1.5, 2, 2.5, 3, 5][rank - 1]) *
    ((tower.axeHelixUntilUs ?? 0) > state.queue.nowUs ? 1.5 : 1);
  if (amount === 0) return;
  tower.lastCastUs = state.queue.nowUs;
  tower.lastCastTarget = { x: tower.x, y: tower.y };
  if (tower.templateId === "G067") recordBattleAnimation(state, tower, "T1837", "model-effect");
  const victims = state.enemies.filter(enemy => enemy.hp > 0 &&
    (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 700 ** 2).sort((left, right) => left.id - right.id);
  for (const target of victims) {
    if (state.phase !== "running") return;
    if (state.enemies.includes(target)) damageEnemy(state, tower, tower.templateId, target, amount, "divine", "A056");
  }
}

function axeCull(state: Match, tower: Construction, target: Enemy) {
  const maximum = syncTowerLife(state, tower).maximum;
  const threshold = (1 + Math.floor(roll(state) * 5)) * ((tower.axeFailures ?? 0) + 1);
  const success = target.hp < maximum * threshold && target.unitId !== "m998" && target.unitId !== "m999";
  if (success) {
    const point = { x: target.x, y: target.y };
    const collateral = target.maxHp ?? target.hp;
    damageEnemy(state, tower, "q025", target, 10_000_000, "divine", "A057",
      { x: tower.x, y: tower.y, id: state.nextId++ });
    recordBattleAnimation(state, point, tower.templateId === "G067" ? "Eff_FW_4" : "Eff_FW_3", "model-effect");
    const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure", "ward"], state.queue.nowUs) &&
      (point.x - enemy.x) ** 2 + (point.y - enemy.y) ** 2 <= 500 ** 2).sort((left, right) => left.id - right.id);
    for (const enemy of targets) {
      if (state.phase !== "running") break;
      if (!state.enemies.includes(enemy)) continue;
      damageEnemy(state, tower, tower.templateId, enemy,
        physicalDamage(collateral, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "A057");
    }
    if (tower.axeRebateTimer !== undefined) cancelEvent(state.queue, tower.axeRebateTimer);
    tower.axeRebateTimer = scheduleEvent(state.queue, us(.1), { type: "axe-cull-rebate", towerId: tower.id });
    if (tower.axeFailures) tower.axeFailures = 0;
  } else {
    damageEnemy(state, tower, tower.templateId, target,
      physicalDamage(maximum * .8, "hero", armorAt(state, target), !!target.welfare), "physical", "A057");
    recordBattleAnimation(state, tower, tower.templateId, "spell-link", target);
    if (hasScepter(state, tower)) tower.axeFailures = (tower.axeFailures ?? 0) + 1;
  }
  tower.axeBloodlustUntilUs = state.queue.nowUs + us(success ? 3 : 6);
  scheduleWeaponRateEnd(state, tower, "axeBloodlustUntilUs", tower.axeBloodlustUntilUs);
}

function castBristleGoo(state: Match, tower: Construction, rank: number) {
  const point = { x: tower.x, y: tower.y };
  const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 550 ** 2).sort((left, right) => left.id - right.id);
  for (const target of targets) {
    const marks = target.bristleGoo ??= {};
    const previous = marks[tower.id];
    const stacks = Math.min((previous?.stacks ?? 0) + 1, [3, 3, 4, 4, 5, 5][rank - 1]);
    const level = [0, 3, 7, 11, 16, 21][rank - 1] + stacks;
    if (level >= (target.bristleGooArmor?.level ?? 0)) {
      target.bristleGooArmor = { level, value: [5, 10, 10, 15, 15, 20][rank - 1] * stacks };
    }
    const sourceId = state.nextId++;
    scheduleEvent(state.queue, us(1), { type: "bristle-goo-carrier-end", towerId: tower.id, targetId: target.id, point, sourceId, stacks });
    if (bristleGooTarget(state, target)) {
      launchTrackingProjectile(state, { type: "bristle-goo-projectile", sourceId, targetId: target.id, position: point, travelUs: 0, stacks }, target);
    }
    if (previous) cancelEvent(state.queue, previous.timerId);
    marks[tower.id] = { stacks, timerId: scheduleEvent(state.queue, us(12), { type: "bristle-goo-armor-end", enemyId: target.id, towerId: tower.id }) };
  }
}

function bristleGooTarget(state: Match, target: Enemy) {
  return physicalAreaTarget(state, target) && !magicImmune(target) && canSeeEnemy(state, target) &&
    targetable(target, ["ground", "air", "structure", "mechanical"], state.queue.nowUs);
}

function sprayQuills(state: Match, tower: Construction, rank: number) {
  const now = state.queue.nowUs;
  const strength = combatAttributes(state, tower).STR;
  const warpath = tower.hero!.ranks.A183 ?? 0;
  const limit = [4, 5, 6, 7, 8, 10, 12][warpath];
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && !enemyIsInvisible(enemy, now) &&
    !enemy.abilities?.includes("Aloc") && (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 800 ** 2)
    .sort((left, right) => left.id - right.id);
  recordBattleAnimation(state, tower, "A182", "model-effect");
  for (const enemy of targets) {
    if (state.phase !== "running") return;
    if (enemy.hp <= 0) continue;
    const previous = enemy.quills?.[tower.id];
    const stacks = Math.min((previous?.stacks ?? 0) + 1, limit);
    const damage = (amount: number, skillId: "A182" | "A183") => damageEnemy(state, tower, tower.templateId, enemy,
      physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", skillId);
    const welfareBefore = state.welfareDamage ?? 0;
    const committed = damage((200 * rank + strength) * stacks, "A182") ?? 0;
    if (enemy.hp <= 0 || committed <= 0 && (!enemy.welfare || (state.welfareDamage ?? 0) <= welfareBefore)) continue;
    const active = (enemy.quills ??= {})[tower.id] = { stacks, timerId: previous?.timerId ?? 0 };
    const stats = combatAttributes(state, tower);
    if (stats.STR >= stats.AGI && stats.STR >= stats.INT && (stacks !== previous?.stacks || stacks === 12)) {
      if (stacks === 5 && targetable(enemy, ["ground", "air"], now) && !magicImmune(enemy) &&
          !enemy.abilities?.includes("Avul") && !consumeEnemySpellShield(state, enemy)) {
        stunEnemy(state, enemy, us(1));
        recordBattleAnimation(state, enemy, "T197", "model-effect");
        damageEnemy(state, tower, "q001", enemy, 8, "magic", "T197", { x: enemy.x, y: enemy.y, id: state.nextId++ });
      } else if (stacks === 7) {
        damage((200 * rank + stats.STR) * stacks, "A183");
      } else if (stacks === 10) {
        if (enemy.hp < (enemy.maxHp ?? enemy.hp) * .2) {
          damageEnemy(state, tower, "q025", enemy, 10_000_000, "divine", "A183", { x: tower.x, y: tower.y, id: state.nextId++ });
        } else damage(enemy.hp * .3, "A183");
      } else if (stacks === 12) {
        damage((enemy.maxHp ?? enemy.hp) * (4 + Math.floor(stats.INT / 30)) / 100, "A183");
      }
    }
    if (previous) cancelEvent(state.queue, previous.timerId);
    if (enemy.hp > 0) active.timerId = scheduleEvent(state.queue, us(8), { type: "quill-layers-end", enemyId: enemy.id, towerId: tower.id });
  }
}

function beginSearingChains(state: Match, tower: Construction, rank: number) {
  if (tower.searingChains) cancelEvent(state.queue, tower.searingChains.timerId);
  const now = state.queue.nowUs;
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 650 ** 2)
    .sort((left, right) => left.id - right.id).slice(0, [4, 4, 5, 5, 6, 6][rank - 1]);
  const timerId = scheduleEvent(state.queue, us(1), { type: "searing-chains", towerId: tower.id }, us(1));
  tower.searingChains = { timerId, remaining: 4, targets: targets.map(enemy => enemy.id) };
  for (const enemy of targets) {
    if (state.phase !== "running") return;
    if (targetable(enemy, ["ground", "air"], now) && canSeeEnemy(state, enemy) &&
        !enemy.abilities?.some(id => ["Avul", "Aloc", "Aeth", "Arsk", "ACrk", "ACsk"].includes(id)) && !consumeEnemySpellShield(state, enemy)) {
      enemy.searingChainsUntilUs = now + us(4);
      scheduleEvent(state.queue, us(4), { type: "searing-chains-release", enemyId: enemy.id, untilUs: enemy.searingChainsUntilUs });
      const visual = recordBattleAnimation(state, enemy, tower.templateId === "G065" ? "A178G065" : "A178", "model-effect");
      visual.enemyId = enemy.id;
      visual.durationUs = us(mapBoss(enemy) || enemy.welfare ? 4 : 2);
    }
    damageEnemy(state, tower, tower.templateId, enemy, 40 * rank, "magic", "A178");
  }
}

function pulseEmberSpell(state: Match, tower: Construction, skillId: "A178" | "A179", timerId: number) {
  const field = skillId === "A178" ? "searingChains" : "flameGuard";
  const active = tower[field];
  if (active?.timerId !== timerId) return;
  const rank = tower.hero?.ranks[skillId] ?? 0;
  const targets = skillId === "A179" ? state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 800 ** 2).sort((left, right) => left.id - right.id) :
    tower.searingChains!.targets.flatMap(id => state.enemies.find(enemy => enemy.id === id) ?? []);
  for (const enemy of targets) {
    if (state.phase !== "running") break;
    damageEnemy(state, tower, tower.templateId, enemy, (skillId === "A178" ? 40 : 160) * rank, "magic", skillId);
  }
  if (--active.remaining === 0) {
    cancelEvent(state.queue, timerId);
    delete tower[field];
  }
}

function pulsePitSpell(state: Match, tower: Construction, skillId: "A233" | "A234", timerId: number) {
  const field = skillId === "A233" ? "firestorm" : "pit";
  const area = tower[field];
  if (area?.timerId !== timerId) return;
  const now = state.queue.nowUs;
  const point = { x: area.x, y: area.y };
  const rank = tower.hero?.ranks[skillId] ?? 0;
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 600 ** 2)
    .sort((left, right) => left.id - right.id);
  if (skillId === "A233") {
    const { attack, bonus } = weaponFields(state, tower, weapons[tower.templateId][0], towerGear(state, tower));
    scheduleEvent(state.queue, us(1), { type: "firestorm-impact", towerId: tower.id, point, source: { x: tower.x, y: tower.y },
      amount: (200 + .5 * (attack + bonus)) * rank });
    for (const enemy of targets) {
      if (!organicWaveTarget(state, enemy) || !canSeeEnemy(state, enemy)) continue;
      const source = { ...point, id: state.nextId++ };
      launchTrackingProjectile(state, { type: "firestorm-projectile", source, towerId: tower.id, targetId: enemy.id,
        position: point, expiresUs: now + us(2), travelUs: 0, rank }, enemy);
    }
  } else {
    recordBattleAnimation(state, point, "A234", "model-effect");
    for (const enemy of targets) {
      if (state.phase !== "running") break;
      damageEnemy(state, tower, tower.templateId, enemy, rank * 160, "magic", "A234");
    }
    for (const enemy of targets) {
      if (state.phase !== "running") break;
      if (!targetable(enemy, ["ground", "air"], now) || !canSeeEnemy(state, enemy) ||
          enemy.abilities?.some(id => ["Avul", "Aloc", "Aeth", "Arsk", "ACrk", "ACsk"].includes(id)) || consumeEnemySpellShield(state, enemy)) continue;
      enemy.pitNetUntilUs = now + us(.3);
      scheduleEvent(state.queue, us(.3), { type: "pit-net-end", enemyId: enemy.id, untilUs: enemy.pitNetUntilUs });
    }
  }
  if (--area.remaining === 0) {
    cancelEvent(state.queue, timerId);
    delete tower[field];
  }
}

function hitFirestormProjectile(state: Match, event: FirestormProjectile) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!target || !organicWaveTarget(state, target) || !trackingProjectileArrived(state, event, target) || consumeEnemySpellShield(state, target)) return;
  const now = state.queue.nowUs;
  const existing = target.firestormBurn;
  const nextUs = existing?.nextUs ?? now + us(1);
  let timerId = existing?.timerId;
  if (existing && existing.untilUs < nextUs) {
    cancelEvent(state.queue, existing.timerId);
    timerId = undefined;
  }
  timerId ??= scheduleEvent(state.queue, nextUs - now, { type: "firestorm-burn", enemyId: target.id });
  target.firestormBurn = { timerId, nextUs, towerId: event.towerId, source: event.source, rank: event.rank, untilUs: now + us(2) };
  recordBattleAnimation(state, target, "T403", "model-effect");
}

function beginSleight(state: Match, tower: Construction, point: Point, rank: number) {
  if (tower.sleight) return;
  const radius = [250, 300, 350, 400, 450, 500][rank - 1];
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= radius ** 2)
    .sort((left, right) => left.id - right.id).map(enemy => enemy.id);
  if (!targets.length) return;
  const slot = weapons[tower.templateId][0];
  const cycleDeltaUs = weaponCycleUs(tower, slot, towerGear(state, tower)) - us(.3);
  const sequence = state.queue.nextSequence;
  const timerId = scheduleEvent(state.queue, us(.25), { type: "sleight-of-fist", towerId: tower.id, sequence }, us(.25));
  tower.sleight = { x: tower.x, y: tower.y, targets, next: 0, cycleDeltaUs, timerId,
    visual: tower.templateId === "G065" ? "q043" : "q036" };
  scheduleEvent(state.queue, us(.01), { type: "sleight-of-fist", towerId: tower.id, sequence });
  weaponRatesDirty.add(state);
}

function advanceSleight(state: Match, tower: Construction, sequence: number) {
  const active = tower.sleight;
  if (active?.timerId !== sequence) return;
  const targetId = active.targets[active.next++];
  if (targetId === undefined) {
    cancelEvent(state.queue, active.timerId);
    relocation(state, tower, { x: active.x, y: active.y }, false, true);
    delete tower.sleight;
    weaponRatesDirty.add(state);
    return;
  }
  const enemy = state.enemies.find(unit => unit.id === targetId);
  const x = (enemy?.x ?? 0) + 10 + Math.floor(41 * roll(state));
  const y = (enemy?.y ?? 0) + 10 + Math.floor(41 * roll(state));
  relocation(state, tower, { x, y }, false, true);
  if (!enemy) return;
  tower.lastAttackTarget = { x: enemy.x, y: enemy.y };
  const now = state.queue.nowUs;
  if (tower.pending || tower.life?.hp === 0 || now < Math.max(tower.stunnedUntilUs ?? 0, tower.attack?.readyUs ?? 0) ||
      tower.spellWindup !== undefined || !canSeeEnemy(state, enemy)) return;
  const gear = towerGear(state, tower);
  const slot = weapons[tower.templateId].find(weapon => inWeaponRange(tower, enemy, weapon, weaponRange(weapon, gear, tower), false, now));
  if (!slot) return;
  tower.heroCastUntilUs = now;
  beginWeaponTiming(state, tower, slot, gear, enemy, enemy.id);
  recordBattleAnimation(state, tower, tower.templateId === "G065" ? "A180G065" : "A180", "model-effect");
}

const jinguMultipliers = [3.5, 3.8, 4.1, 4.4, 4.7, 5];
const monkeyTemplates = new Set(["b117", "b118", "b139", "b140"]);

function jinguRank(tower: Construction, now: number) {
  return (tower.jingu?.untilUs ?? 0) > now ? tower.jingu?.rank ?? 0 : 0;
}

function countJingu(state: Match, tower: Construction) {
  const rank = tower.hero?.ranks.A077 ?? 0;
  const now = state.queue.nowUs;
  if (!rank || tower.summon?.illusion || jinguRank(tower, now)) return;
  const count = (tower.jingu?.count ?? 0) + 1;
  if (count < 60) {
    tower.jingu = { count, displayUntilUs: now + us(1.5) };
    return;
  }
  const untilUs = now + us(4);
  tower.jingu = { count: 0, rank, untilUs };
  scheduleEvent(state.queue, us(4), { type: "jingu-expire", towerId: tower.id, untilUs });
}

function hitJinguWave(state: Match, tower: Construction, target: Enemy) {
  const rank = tower.hero?.ranks.A076 ?? 0;
  const weapon = weapons[tower.templateId]?.[0];
  if (!rank || !weapon) return;
  const now = state.queue.nowUs;
  const source = { x: target.x, y: target.y, id: state.nextId++ };
  scheduleEvent(state.queue, 0, { type: "jingu-hammer", towerId: tower.id, targetId: target.id,
    source, expiresUs: now + us(1), travelUs: 0 });
  const fields = weaponFields(state, tower, weapon, towerGear(state, tower));
  const critical = jinguRank(tower, now);
  const amount = (fields.attack + fields.bonus) * (1 + rank) * (critical ? jinguMultipliers[critical - 1] : 1);
  if (critical) damageEnemy(state, tower, "q019", target, amount, "divine", "A076",
    { x: tower.x, y: tower.y, id: state.nextId++ });
  else damageEnemy(state, tower, tower.templateId, target, amount, "divine", "A076");
  if (state.structures.includes(tower)) countJingu(state, tower);
}

function resolveJinguHammer(state: Match, event: Extract<MatchEvent, { type: "jingu-hammer" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const now = state.queue.nowUs;
  if (!target || now > event.expiresUs || !organicWaveTarget(state, target)) return;
  const distance = Math.hypot(target.x - event.source.x, target.y - event.source.y);
  const travelUs = us(distance / 5000);
  if (travelUs > event.travelUs) {
    const direction = spellDirection(event.source, target);
    const traveled = event.travelUs * .005;
    const next = Math.min(travelUs - event.travelUs, movementStepUs);
    scheduleEvent(state.queue, next, { ...event, travelUs: next,
      source: { ...event.source, x: event.source.x + direction.dx * traveled, y: event.source.y + direction.dy * traveled } });
    return;
  }
  if (!consumeEnemySpellShield(state, target)) stunEnemy(state, target, us(resistantToControl(target) ? .5 : 2));
}

function createMonkeyFormation(state: Match, tower: Construction, point: Point, rank: number) {
  const gear = towerGear(state, tower);
  const scepter = hasScepter(state, tower);
  const form = tower.templateId === "G036";
  const templateId = scepter ? form ? "b140" : "b139" : form ? "b118" : "b117";
  const [weapon] = weapons[tower.templateId];
  const fields = weaponFields(state, tower, weapon, gear);
  const attack = weaponFieldInt((fields.attack + fields.bonus) * (.4 + .1 * rank)) - weapons[templateId][0].base;
  const behavior = { ownerId: tower.id, attack, speed: scepter ? .25 : 0, green: 0, blue: 0, skillId: "A079" };
  for (const [count, radius] of [[5, 400], [9, 800]]) {
    for (let index = 1; index <= count; index++) {
      const angle = 2 * Math.PI * index / count;
      const requested = { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
      const location = nearestSpawn(requested, 1, "ground");
      spawnSummon(state, location, templateId, behavior, 13);
      const monkey = state.summons!.at(-1)!;
      monkey.lastAttackTarget = { ...point };
      monkey.life = { hp: 450, maximum: 450, staticMaximum: 450, regen: 0, lastUs: state.queue.nowUs };
    }
  }
}

const summonContracts = ["i243", "i245", "i247", "i249", "i250", "i251", "i252", "i253", "i254"];

function summonModifiers(gear: string[]) {
  return {
    speed: gear.reduce((sum, id) => sum + (summonContracts.includes(id) ? .5 : id === "i240" ? .3 : id === "i242" ? .2 : 0), 0),
    red: gear.includes("i250") ? 3 : gear.includes("i249") ? 2 : gear.includes("i243") ? 1 : 0,
    green: gear.includes("i252") ? 1 : gear.includes("i251") ? .8 : gear.includes("i245") ? .6 : 0,
    blue: gear.includes("i254") ? 10 : gear.includes("i253") ? 8 : gear.includes("i247") ? 6 : 0,
  };
}

function spawnSummon(state: Match, point: Point, templateId: string, behavior: NonNullable<Construction["summon"]>, duration: number | null) {
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
  if (duration !== null) scheduleEvent(state.queue, us(duration), { type: "summon-expire", unitId: id });
  return id;
}

function clearDeathWardShots(state: Match, unitId: number) {
  for (const { timerId, payload } of [...state.queue.pending]) {
    if (payload.type === "weapon-impact" && payload.shot.summon?.id === unitId) cancelEvent(state.queue, timerId);
  }
}

function createDeathWard(state: Match, tower: Construction, rank: number, aim: Point) {
  const old = state.summons?.find(unit => unit.id === tower.deathWardId);
  if (old) {
    interruptWeapon(state, old);
    for (const { timerId, payload } of [...state.queue.pending]) {
      if (payload.type === "summon-expire" && payload.unitId === old.id ||
          (payload.type === "weapon-ready" || payload.type === "weapon-backswing-end") && payload.towerId === old.id) cancelEvent(state.queue, timerId);
    }
    state.summons!.splice(state.summons!.indexOf(old), 1);
  }
  if (tower.deathWardId !== undefined) clearDeathWardShots(state, tower.deathWardId);
  const gear = towerGear(state, tower).map(item => item.itemId);
  const stats = combatAttributes(state, tower);
  const inheritance = gear.some(item => summonContracts.includes(item)) ? .6 : gear.includes("i240") ? .5 : .4;
  const direction = spellDirection(tower, aim);
  const templateId = "b" + (155 + rank);
  const radius = unitBalance.get(templateId)?.collision ?? 0;
  const location = nearestSpawn({ x: tower.x + 100 * direction.dx, y: tower.y + 100 * direction.dy }, radius, "ground");
  tower.deathWardId = spawnSummon(state, location, templateId, { ownerId: tower.id,
    attack: weaponFieldInt(inheritance * (stats.STR + stats.AGI + stats.INT)), ...summonModifiers(gear), skillId: "A209",
    ...(hasScepter(state, tower) ? { projectileGroup: { extra: 2, range: 1000, speed: 1800, budget: 9_999_999 } } : {}),
  }, 15);
  const ward = state.summons!.at(-1)!;
  ward.radius = radius;
  syncTowerLife(state, ward);
  if (radius) {
    for (const enemy of state.enemies) {
      if (enemy.layer === "ground" && overlaps(ward, enemy)) enemy.initialOverlaps.push(ward.id);
    }
  }
  recordBattleAnimation(state, tower, "UndeadMineCircle", "model-effect");
  recordBattleAnimation(state, ward, "FeralSpiritTarget", "model-effect");
  startWeapon(state, ward);
}

const treantTemplates = new Set(["b100", "b101", "b102", "b119", "b120", "b121", "b144", "b145", "b146", "b147", "b148", "b149"]);

function createFeralSpirit(state: Match, tower: Construction, point: Point, rank: number, temporary: boolean, wolf = false) {
  const skin = tower.templateId === "G055";
  const base = skin ? temporary ? 147 : 144 : temporary ? 119 : 100;
  const template = "b" + (wolf ? 149 + rank : base + Math.floor((rank - 1) / 2));
  const { STR, AGI, INT } = combatAttributes(state, tower);
  const gear = towerGear(state, tower).map(item => item.itemId);
  const contracts = summonModifiers(gear);
  const inherited = contracts.red || contracts.green || contracts.blue ? .6 : gear.includes("i240") ? .5 : .4;
  const unit = unitBalance.get(template)!;
  const radius = unit.collision ?? 0;
  const location = nearestSpawn(point, radius, "ground");
  const wildHowlRank = wolf ? tower.hero?.ranks.A168 : undefined;
  spawnSummon(state, location, template, {
    ownerId: tower.id, attack: weaponFieldInt(inherited * (STR + AGI + INT)), ...contracts,
    skillId: wolf ? "A167" : temporary ? "A051" : skin ? "A130" : "A049",
    ...(wildHowlRank ? { wildHowlRank } : {}),
  }, temporary ? 10 : 25);
  const summoned = state.summons!.at(-1)!;
  summoned.radius = radius;
  const hp = unit.HP!;
  summoned.life = { hp, maximum: hp, staticMaximum: hp, regen: unit.regenHP ?? 0, lastUs: state.queue.nowUs };
  if (radius) {
    for (const enemy of state.enemies) {
      if (enemy.layer === "ground" && overlaps(summoned, enemy)) enemy.initialOverlaps.push(summoned.id);
    }
  }
  if (wolf) recordBattleAnimation(state, summoned, "FeralSpiritTarget", "model-effect");
}

function createFeralSpiritGroup(state: Match, tower: Construction, rank: number, aim: Point, wolf: boolean) {
  const previous = state.summons?.filter(unit => unit.summon?.ownerId === tower.id &&
    (wolf ? unit.summon.skillId === "A167" : unit.summon.skillId === "A049" || unit.summon.skillId === "A130")) ?? [];
  for (const unit of previous) {
    interruptWeapon(state, unit);
    for (const { timerId, payload } of [...state.queue.pending]) {
      if (payload.type === "summon-expire" && payload.unitId === unit.id ||
          payload.type === "weapon-impact" && payload.shot.summon?.id === unit.id ||
          (payload.type === "weapon-ready" || payload.type === "weapon-backswing-end") && payload.towerId === unit.id) {
        cancelEvent(state.queue, timerId);
      }
    }
  }
  if (previous.length > 0) state.summons = state.summons!.filter(unit => !previous.includes(unit));
  const { dx, dy } = spellDirection(tower, aim);
  const facing = Math.atan2(dy, dx);
  const count = (wolf ? [2, 2, 3, 3, 3, 3] : [2, 3, 3, 4, 4, 5])[rank - 1];
  for (let index = 0; index < count; index++) {
    const angle = facing + index * 2 * Math.PI / count;
    createFeralSpirit(state, tower, { x: tower.x + 50 * Math.cos(angle), y: tower.y + 50 * Math.sin(angle) }, rank, false, wolf);
  }
}

function launchWildAxes(state: Match, tower: Construction, point: Point) {
  const direction = spellDirection(tower, point);
  const crossing = { x: tower.x + direction.dx * 1200, y: tower.y + direction.dy * 1200 };
  const turns: [Point, Point] = [
    { x: tower.x + direction.dx * 400 + direction.dy * 150, y: tower.y + direction.dy * 400 - direction.dx * 150 },
    { x: tower.x + direction.dx * 400 - direction.dy * 150, y: tower.y + direction.dy * 400 + direction.dx * 150 },
  ];
  const castId = state.nextId++;
  (state.wildAxes ??= {})[castId] = { towerId: tower.id, step: 0, crossing, turns,
    axes: [{ x: tower.x, y: tower.y, id: state.nextId++, hit: [] }, { x: tower.x, y: tower.y, id: state.nextId++, hit: [] }],
    timerId: scheduleEvent(state.queue, us(.03), { type: "wild-axes", castId }, us(.03)) };
}

function moveWildAxes(state: Match, castId: number) {
  const cast = state.wildAxes![castId];
  const tower = firingUnit(state, cast.towerId);
  const step = ++cast.step;
  if (!tower || step === 64) {
    if (tower?.hero?.ranks.A214 && hasScepter(state, tower)) tower.heroSpellReady!.A214 = state.queue.nowUs;
    cancelEvent(state.queue, cast.timerId);
    delete state.wildAxes![castId];
    return;
  }
  const amount = syncTowerLife(state, tower).maximum * ((tower.hero?.ranks.A214 ?? 0) + 3) / 10;
  for (const [index, axe] of cast.axes.entries()) {
    const from = step < 12 ? tower : step <= 32 ? cast.turns[index] : step <= 53 ? cast.crossing : cast.turns[1 - index];
    const to = step < 12 ? cast.turns[index] : step <= 32 ? cast.crossing : step <= 53 ? cast.turns[1 - index] : tower;
    const progress = step < 12 ? step / 12 : step <= 32 ? (step - 11) / 22 : step <= 53 ? (step - 32) / 22 : (step - 53) / 12;
    axe.x = from.x + (to.x - from.x) * progress;
    axe.y = from.y + (to.y - from.y) * progress;
  }
  for (const axe of cast.axes) {
    const targets = state.enemies.filter(enemy => enemy.hp > 0 && !enemy.abilities?.includes("Aloc") && !axe.hit.includes(enemy.id) &&
      (enemy.x - axe.x) ** 2 + (enemy.y - axe.y) ** 2 <= 200 ** 2).sort((left, right) => left.id - right.id);
    for (const enemy of targets) {
      if (state.phase !== "running") return;
      if (enemy.hp <= 0) continue;
      damageEnemy(state, tower, tower.templateId, enemy, physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "A214");
      axe.hit.push(enemy.id);
    }
  }
}

function callWildBeasts(state: Match, tower: Construction, rank: number, point: Point) {
  const gear = towerGear(state, tower).map(item => item.itemId);
  const contracts = summonModifiers(gear);
  const stats = combatAttributes(state, tower);
  const inherit = contracts.red || contracts.green || contracts.blue ? .6 : gear.includes("i240") ? .5 : .4;
  const attack = weaponFieldInt(inherit * (stats.STR + stats.AGI + stats.INT));
  const haste = tower.hero?.ranks.A216;
  const { dx, dy } = spellDirection(tower, point);
  for (const layer of ["fly", "ground"] as const) {
    const hawk = layer === "fly";
    const templateId = (hawk ? beastmasterHawks : beastmasterBoars)[rank - 1];
    const side = hawk ? 100 : -100;
    const location = nearestSpawn({ x: tower.x - dy * side, y: tower.y + dx * side }, 0, layer);
    spawnSummon(state, location, templateId, { ownerId: tower.id, attack, ...contracts,
      skillId: "A215", ...(haste ? { beastmasterHasteRank: haste } : {}),
      ...(hawk ? {} : { projectileGroup: { extra: rank, range: 800, speed: 1500, budget: 99_999_999 } }),
    }, 12);
    const summoned = state.summons!.at(-1)!;
    syncTowerLife(state, summoned);
    recordBattleAnimation(state, summoned, "FeralSpiritTarget", "model-effect");
    startWeapon(state, summoned);
  }
}

function natureWrath(state: Match, tower: Construction, primary: Enemy, rank: number, raw: number) {
  if (!organicWaveTarget(state, primary) || !canSeeEnemy(state, primary) || consumeEnemySpellShield(state, primary)) return;
  const source = { x: tower.x, y: tower.y, id: state.nextId++ };
  const visited = new Set<number>();
  let target: Enemy | undefined = primary;
  let from: Point = source;
  while (target && visited.size < 8 + rank * 2 && state.phase === "running") {
    const point: Point = { x: target.x, y: target.y };
    visited.add(target.id);
    recordBattleAnimation(state, from, "T088", "spell-link", point);
    damageEnemy(state, tower, "q023", target, raw, "magic", "A051", source);
    if (state.phase === "running" && hasScepter(state, tower) && rollPercent(state) <= 15) {
      const current = tower.hero?.ranks.A049 ?? tower.hero?.ranks.A130;
      if (current) createFeralSpirit(state, tower, point, current, true);
    }
    if (visited.size >= 8 + rank * 2) break;
    const candidates: Enemy[] = state.enemies.filter(enemy => !visited.has(enemy.id) && organicWaveTarget(state, enemy) &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 1000 ** 2).sort((a, b) => a.id - b.id);
    target = candidates.length ? candidates[Math.floor(roll(state) * candidates.length)] : undefined;
    from = point;
    raw *= 1.1;
  }
}

function endEclipse(state: Match, tower: Construction) {
  const eclipse = tower.eclipse;
  if (!eclipse) return;
  cancelEvent(state.queue, eclipse.periodic);
  cancelEvent(state.queue, eclipse.end);
  delete tower.eclipse;
}

function startEclipse(state: Match, tower: Construction) {
  endEclipse(state, tower);
  const periodic = scheduleEvent(state.queue, us(.6), { type: "eclipse-tick", towerId: tower.id }, us(.6));
  const end = scheduleEvent(state.queue, us(6), { type: "eclipse-end", towerId: tower.id });
  tower.eclipse = { periodic, end };
  recordBattleAnimation(state, tower, tower.templateId === "G074" ? "LunaCast" : "StarfallCaster", "model-effect");
}

function eclipseTick(state: Match, towerId: number, timerId: number) {
  const tower = firingUnit(state, towerId);
  if (tower?.eclipse?.periodic !== timerId || (tower.life?.hp ?? 1) <= 0) {
    cancelEvent(state.queue, timerId);
    if (tower?.eclipse?.periodic === timerId) endEclipse(state, tower);
    return;
  }
  const candidates = state.enemies.filter(enemy => enemy.hp > 0 && canSeeEnemy(state, enemy) &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 800 ** 2).sort((a, b) => a.id - b.id);
  if (candidates.length === 0) return;
  const target = candidates[Math.floor(roll(state) * candidates.length)];
  const point = { x: target.x, y: target.y };
  const select = (enemy: Enemy) => (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 200 ** 2;
  const rank = tower.hero!.ranks.A054;
  if (rank) {
    const amount = heroSpells.A054.damage[rank - 1] + averageWeaponField(state, tower, weapons[tower.templateId][0], towerGear(state, tower));
    recordBattleAnimation(state, point, tower.templateId === "G074" ? "LunaPulse" : "StarfallCaster", "model-effect");
    for (const enemy of state.enemies.filter(target => select(target)).sort((a, b) => a.id - b.id)) {
      if (state.phase !== "running") break;
      if (targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs)) {
        damageEnemy(state, tower, tower.templateId, enemy, amount, "magic", "A054");
      }
    }
  }
  if (state.phase !== "running" || !hasScepter(state, tower)) return;
  for (const victim of state.enemies.filter(target => select(target)).sort((a, b) => a.id - b.id)) {
    if (!organicWaveTarget(state, victim)) continue;
    scheduleEvent(state.queue, 0, { type: "eclipse-hammer", targetId: victim.id, sourceId: state.nextId++, point: { x: victim.x, y: victim.y } });
  }
}

function bladeStormTarget(state: Match, enemy: Enemy, center: Point, radius: number) {
  return targetable(enemy, ["ground", "structure"], state.queue.nowUs) &&
    !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Avul" || id === "Aloc") &&
    (enemy.x - center.x) ** 2 + (enemy.y - center.y) ** 2 <= radius ** 2;
}

function bladeStormTick(state: Match, id: number) {
  const storms = state.bladeStorms!;
  const storm = storms[id];
  if (!storm) return;
  const now = state.queue.nowUs;
  const tower = state.structures.find(unit => unit.id === storm.towerId);
  for (const enemy of [...state.enemies].sort((a, b) => a.id - b.id)) {
    if (state.phase !== "running") break;
    if (!bladeStormTarget(state, enemy, storm, 600)) continue;
    const superseded = Object.entries(storms).some(([otherId, other]) =>
      other.untilUs > now && (other.raw > storm.raw || other.raw === storm.raw && Number(otherId) < id) &&
      bladeStormTarget(state, enemy, other, 600));
    if (!superseded) damageEnemy(state, tower, "q008", enemy, storm.raw, "magic", "T051", { ...storm, id });
  }
}

function startBladeStorm(state: Match, tower: Construction, rank: number) {
  const id = state.nextId++;
  const untilUs = state.queue.nowUs + us(5);
  tower.bladeStormHasteUs = untilUs;
  scheduleWeaponRateEnd(state, tower, "bladeStormHasteUs", untilUs);
  (state.bladeStorms ??= {})[id] = { x: tower.x, y: tower.y, towerId: tower.id, untilUs, raw: 200 + rank * 200 };
  for (let tick = 1; tick < 5; tick++) scheduleEvent(state.queue, us(tick), { type: "blade-storm-tick", id });
  scheduleEvent(state.queue, us(5), { type: "blade-storm-end", id });
  recordBattleAnimation(state, tower, tower.templateId === "G041" ? "T051G041" : "T051", "model-effect");
  bladeStormTick(state, id);
}

function endOmnislash(state: Match, tower: Construction) {
  if (!tower.omnislash) return;
  if (tower.omnislash.repeatTimer !== undefined) cancelEvent(state.queue, tower.omnislash.repeatTimer);
  cancelEvent(state.queue, tower.omnislash.endTimer);
  delete tower.omnislash;
}

function strikeOmnislash(state: Match, tower: Construction, target: Enemy) {
  const slash = tower.omnislash!;
  slash.x = target.x;
  slash.y = target.y;
  slash.facing = Math.floor(roll(state) * 361);
  slash.lastAttackUs = state.queue.nowUs;
  const [weapon] = weapons[tower.templateId];
  const gear = towerGear(state, tower);
  const { base, percent, fixed } = weaponContributions(state, tower, weapon, gear);
  const rank = tower.hero!.ranks.A045;
  const critical = tower.hero!.ranks.A044;
  const maximum = weaponFieldInt((base + weapon.dice * weapon.sides) * (1 + percent) + fixed);
  let damage = maximum + [297, 338, 389, 445, 534, 694][rank - 1];
  if (critical ? rollPercent(state) <= blademasterCriticalChance[critical - 1] / 2 : Math.floor(roll(state) * 101) === 0) {
    damage *= critical ? blademasterCriticalMultiplier[critical - 1] / 2 : 0;
  }
  if (hasScepter(state, tower)) {
    for (const victim of [...state.enemies].sort((a, b) => a.id - b.id)) {
      if (state.phase !== "running") break;
      if (!targetable(victim, ["ground", "air", "structure", "ward"], state.queue.nowUs) ||
          (victim.x - target.x) ** 2 + (victim.y - target.y) ** 2 > 200 ** 2) continue;
      damageEnemy(state, tower, slash.templateId, victim, damage * 2, "divine", "A045", slash);
    }
    if (state.phase === "running") triggerAttackEquipment(state, tower, target, weapon, gear);
  } else {
    damageEnemy(state, tower, slash.templateId, target,
      physicalDamage(damage, "hero", armorAt(state, target), !!target.welfare), "physical", "A045", slash);
  }
}

function startOmnislash(state: Match, tower: Construction, target: Enemy) {
  const id = state.nextId++;
  const templateId = tower.templateId === "G040" ? "q020" : tower.templateId === "G041" ? "q021" : "q002";
  endOmnislash(state, tower);
  const [weapon] = weapons[tower.templateId];
  const gear = towerGear(state, tower);
  const interval = rawWeaponRate(state, tower, gear, combatAttributes(state, tower).AGI);
  const period = Math.max(100_000, Math.round(weaponCycleUs(tower, weapon, gear) / interval));
  const repeatTimer = Number.isSafeInteger(period) ? scheduleEvent(state.queue, period,
    { type: "omnislash-tick", towerId: tower.id, id }, period) : undefined;
  const endTimer = scheduleEvent(state.queue, us(8.3), { type: "omnislash-end", towerId: tower.id, id });
  tower.omnislash = { x: target.x, y: target.y, id, templateId, endTimer, facing: 0, lastAttackUs: state.queue.nowUs,
    ...(repeatTimer === undefined ? {} : { repeatTimer }) };
  strikeOmnislash(state, tower, target);
}

function advanceOmnislash(state: Match, towerId: number, id: number, timerId: number) {
  const tower = state.structures.find(unit => unit.id === towerId);
  const slash = tower?.omnislash;
  if (!tower || slash?.id !== id) {
    cancelEvent(state.queue, timerId);
    return;
  }
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && canSeeEnemy(state, enemy) &&
    (enemy.x - slash.x) ** 2 + (enemy.y - slash.y) ** 2 <= 500 ** 2).sort((a, b) => a.id - b.id);
  if (targets.length === 0) endOmnislash(state, tower);
  else strikeOmnislash(state, tower, targets[Math.floor(roll(state) * targets.length)]);
}

function clearExorcism(state: Match, towerId: number, token: number) {
  const spirits = new Set((state.summons ?? []).filter(unit => unit.summon?.ownerId === towerId && unit.spiritOrder?.token === token));
  const spiritIds = new Set([...spirits].map(unit => unit.id));
  for (const spirit of spirits) interruptWeapon(state, spirit);
  for (const { payload, timerId } of [...state.queue.pending]) {
    if (payload.type === "exorcism" && payload.towerId === towerId && payload.token === token ||
        payload.type === "weapon-impact" && payload.shot.summon && spiritIds.has(payload.shot.summon.id) ||
        payload.type === "weapon-ready" && spiritIds.has(payload.towerId) ||
        payload.type === "summon-expire" && spiritIds.has(payload.unitId)) cancelEvent(state.queue, timerId);
  }
  state.summons = state.summons?.filter(unit => !spirits.has(unit));
  const tower = firingUnit(state, towerId);
  if (tower?.exorcismToken === token) delete tower.exorcismToken;
}

function progressExorcism(state: Match, event: ExorcismEvent) {
  const { towerId, token, stage } = event;
  const tower = firingUnit(state, towerId);
  if (!tower || tower.exorcismToken !== token || stage === "remove") {
    clearExorcism(state, towerId, token);
    return;
  }
  const now = state.queue.nowUs;
  if (stage === "spawn") {
    const birth = { x: tower.x, y: tower.y };
    spawnSummon(state, birth, tower.templateId === "G022" ? "q012" : "q011", {
      ownerId: tower.id, attack: 0, speed: 0, green: 0, blue: 0, skillId: "A066",
    }, 20);
    const spirit = state.summons!.at(-1)!;
    spirit.spiritOrder = { token, birth, sureHit: hasScepter(state, tower), nextRoamUs: now + us(5) };
    if (event.remaining > 1) scheduleEvent(state.queue, us(.1), { ...event, remaining: event.remaining - 1 });
    return;
  }
  const spirits = (state.summons ?? []).filter(unit => unit.summon?.ownerId === towerId && unit.spiritOrder?.token === token);
  if (stage === "return") {
    for (const spirit of spirits) {
      interruptWeapon(state, spirit);
      const order = spirit.spiritOrder!;
      delete order.targetId;
      order.move = { kind: "retire", point: { x: tower.x, y: tower.y } };
    }
    for (const { payload, timerId } of [...state.queue.pending]) {
      if (payload.type === "exorcism" && payload.towerId === tower.id && payload.token === token && payload.stage === "control")
        cancelEvent(state.queue, timerId);
    }
    return;
  }
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && canSeeEnemy(state, enemy) &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 900 ** 2).sort((a, b) => a.id - b.id);
  for (const spirit of spirits) {
    const order = spirit.spiritOrder!;
    if ((spirit.x - tower.x) ** 2 + (spirit.y - tower.y) ** 2 > 900 ** 2) {
      interruptWeapon(state, spirit);
      order.move = { kind: "return", point: { x: tower.x, y: tower.y } };
      delete order.targetId;
    } else if (!targets.length) {
      interruptWeapon(state, spirit);
      delete order.move;
      delete order.targetId;
    } else if (order.move) {
      order.targetId = targets[Math.floor(roll(state) * targets.length)].id;
      delete order.move;
    }
  }
  scheduleEvent(state.queue, us(1), event);
}

function moveExorcismSpirit(state: Match, spirit: Construction) {
  const order = spirit.spiritOrder!;
  const weapon = weapons[spirit.templateId][0];
  const now = state.queue.nowUs;
  const returning = order.move?.kind === "return" || order.move?.kind === "retire";
  let target = order.targetId === undefined ? undefined : state.enemies.find(enemy => enemy.id === order.targetId &&
    canSeeEnemy(state, enemy) && weaponTargetable(enemy, weapon, now));
  if (!target && !returning) {
    target = state.enemies.filter(enemy => canSeeEnemy(state, enemy) && weaponTargetable(enemy, weapon, now) &&
      (enemy.x - spirit.x) ** 2 + (enemy.y - spirit.y) ** 2 <= weapon.acquire ** 2).sort((a, b) => a.id - b.id)[0];
    if (target) {
      order.targetId = target.id;
      delete order.move;
    } else delete order.targetId;
  }
  if (now >= order.nextRoamUs && !returning) {
    order.nextRoamUs += us(5);
    if (!target) {
      const angle = 2 * Math.PI * roll(state);
      const radius = 4000 * Math.sqrt(roll(state));
      const point = { x: order.birth.x + radius * Math.cos(angle), y: order.birth.y + radius * Math.sin(angle) };
      point.x = Math.max(map.bounds.minX, Math.min(map.bounds.maxX, point.x));
      point.y = Math.max(map.bounds.minY, Math.min(map.bounds.maxY, point.y));
      order.move = { kind: "roam", point: nearestSpawn(point, 0, "fly") };
    }
  }
  const goal = order.move?.point ?? target;
  delete spirit.walkDirection;
  if (!goal) return;
  const distance = Math.hypot(goal.x - spirit.x, goal.y - spirit.y);
  const remaining = distance - (order.move ? 0 : weapon.max);
  if (remaining <= 1e-8) {
    if (order.move && order.move.kind !== "retire") delete order.move;
    return;
  }
  const step = Math.min(remaining, (order.move?.kind === "retire" ? 700 : 350) * movementStepUs / 1_000_000);
  const [dx, dy] = [(goal.x - spirit.x) / distance, (goal.y - spirit.y) / distance];
  const point = { x: spirit.x + dx * step, y: spirit.y + dy * step };
  if (!staticSweep(spirit, point, 0, "fly")) return;
  spirit.x = point.x;
  spirit.y = point.y;
  spirit.walkDirection = { x: dx, y: dy };
}

function currentSpiritBear(state: Match, tower: Construction) {
  const id = tower.spiritBear?.id;
  return id === undefined ? undefined : state.summons?.find(unit => unit.id === id && unit.bear);
}

function releaseBearInventory(state: Match, bear: Construction) {
  const stored: number[] = [];
  for (let slot = 0; slot < 6; slot++) {
    const item = state.inventory?.find(entry => entry.towerId === bear.id && entry.slot === slot);
    if (!item) continue;
    dropItem(state, item, bear);
    if (state.inventory?.includes(item)) stored.push(item.id);
  }
  return stored;
}

function detachSpiritBear(state: Match, owner: Construction) {
  const bear = currentSpiritBear(state, owner);
  if (bear) {
    const tracking = bear.bear!;
    if (tracking.timerId !== undefined) cancelEvent(state.queue, tracking.timerId);
    delete tracking.timerId;
    releaseBearInventory(state, bear);
  }
  clearBearFrenzy(state, owner);
  delete owner.spiritBear;
}

function expireSpiritBear(state: Match, bear: Construction) {
  const owner = state.structures.find(tower => tower.spiritBear?.id === bear.id);
  const stored = releaseBearInventory(state, bear);
  if (owner) owner.spiritBear = { stored };
  if (bear.bear?.timerId !== undefined) cancelEvent(state.queue, bear.bear.timerId);
}

function bearGearSpeed(id: string) {
  return summonContracts.includes(id) ? .5 : id === "i240" ? .3 : id === "i242" ? .2 : 0;
}

function withdrawBearGear(state: Match, owner: Construction, itemId: number) {
  const bear = currentSpiritBear(state, owner);
  if (!bear?.bear || !Object.hasOwn(bear.bear.gear, itemId)) return;
  delete bear.bear.gear[itemId];
  bear.summon!.speed = Object.values(bear.bear.gear).reduce((total, speed) => total + speed, 0);
  weaponRatesDirty.add(state);
}

function replaceSpiritBear(state: Match, tower: Construction, rank: number, aim: Point) {
  const oldBear = currentSpiritBear(state, tower);
  if (oldBear) {
    expireSpiritBear(state, oldBear);
    interruptWeapon(state, oldBear);
    stopTowerCast(state, oldBear);
    if (oldBear.attack?.timing?.cooldown) cancelEvent(state.queue, oldBear.attack.timing.cooldown.timerId);
    state.summons = state.summons!.filter(unit => unit !== oldBear);
    recordBattleAnimation(state, oldBear, oldBear.templateId, "death");
  }
  const template = "n" + (254 + rank);
  const stats = unitBalance.get(template)!;
  const gear = towerGear(state, tower);
  const { dx, dy } = spellDirection(tower, aim);
  const point = nearestSpawn({ x: tower.x + 50 * dx, y: tower.y + 50 * dy }, stats.collision!, "ground");
  const id = spawnSummon(state, point, template, {
    ownerId: tower.id, attack: 0, ...summonModifiers(gear.map(item => item.itemId)), skillId: "A125",
  }, null);
  const bear = state.summons!.at(-1)!;
  bear.radius = stats.collision!;
  bear.spawnOverlaps = wolfOccupants(state).filter(other => other.id !== bear.id && overlaps(bear, other)).map(other => other.id);
  for (const enemy of state.enemies) {
    if (bear.spawnOverlaps.includes(enemy.id)) enemy.initialOverlaps.push(id);
  }
  bear.bear = { inheritedAttack: 0, scepter: false, gear: Object.fromEntries(gear.flatMap(item => {
    const contribution = bearGearSpeed(item.itemId);
    return contribution ? [[item.id, contribution]] : [];
  })) };
  bear.life = { hp: stats.HP!, maximum: stats.HP!, staticMaximum: stats.HP!, regen: .5, lastUs: state.queue.nowUs };
  syncMana(state, bear);
  for (const storedId of tower.spiritBear?.stored ?? []) {
    const item = state.inventory?.find(entry => entry.id === storedId && entry.slot === null);
    if (!item) continue;
    const slot = freeItemSlot(state, bear);
    if (slot === null || !equipmentAllowed(state, item.itemId, bear)) continue;
    item.slot = slot;
    item.towerId = bear.id;
    finishPickup(state, item, bear);
  }
  tower.spiritBear = { id };
  bear.bear.timerId = scheduleEvent(state.queue, us(1), { type: "bear-update", unitId: id }, us(1));
  bear.permanentAttack = 50 * (tower.hero!.ranks.A127 ?? 0);
}

function updateSpiritBear(state: Match, unitId: number, timerId: number) {
  const bear = firingUnit(state, unitId);
  const tracking = bear?.bear;
  const owner = state.structures.find(tower => tower.spiritBear?.id === unitId);
  if (!bear || !tracking || !owner || tracking.timerId !== timerId) {
    cancelEvent(state.queue, timerId);
    return;
  }
  const gear = towerGear(state, owner).map(item => item.itemId);
  const contracts = summonModifiers(gear);
  const { STR, AGI, INT } = combatAttributes(state, owner);
  const scale = contracts.red || contracts.green || contracts.blue ? .9 : gear.includes("i240") ? .8 : .7;
  tracking.inheritedAttack = Math.floor(scale * (STR + AGI + INT));
  const scepter = hasScepter(state, owner);
  if (tracking.scepter !== scepter) {
    tracking.scepter = scepter;
    weaponRatesDirty.add(state);
  }
  if (!contracts.red) delete bear.summon!.red;
  if (!contracts.green) bear.summon!.green = 0;
  if (!contracts.blue) bear.summon!.blue = 0;
}

function clearBearFrenzy(state: Match, tower: Construction) {
  const current = tower.bearFrenzy;
  if (!current) return;
  cancelEvent(state.queue, current.timerId);
  if (current.unitId !== null) {
    const bear = firingUnit(state, current.unitId);
    if (bear) delete bear.bearFrenzyBonus;
  }
  delete tower.bearFrenzy;
  weaponRatesDirty.add(state);
}

function activateBearFrenzy(state: Match, tower: Construction, rank: number) {
  clearBearFrenzy(state, tower);
  const bear = currentSpiritBear(state, tower);
  const amount = (rank + 3) / 10;
  if (bear) {
    bear.bearFrenzyBonus = amount;
    recordBattleAnimation(state, bear, "B137", "model-effect");
  }
  const timerId = scheduleEvent(state.queue, us(7), { type: "bear-frenzy-end", towerId: tower.id });
  tower.bearFrenzy = { amount, timerId, unitId: bear?.id ?? null };
  weaponRatesDirty.add(state);
}

export function bearAbilities(tower: Construction) {
  if (!tower.bear) return [];
  const rank = Number(tower.templateId.slice(1)) - 254;
  return [
    ...(rank >= 2 ? [{ id: rank >= 5 ? "N139" : "N138", name: "回归", mana: 0, cooldown: rank >= 5 ? 5 : 10 }] : []),
    ...(rank >= 3 ? [{ id: rank >= 6 ? "N141" : "N140", name: "野蛮咆哮", mana: rank >= 6 ? 80 : 45, cooldown: 7 }] : []),
  ];
}

function beginBearCast(state: Match, bear: Construction, skillId: string): Result {
  const ability = bearAbilities(bear).find(entry => entry.id === skillId);
  if (!ability) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(bear.heroCastUntilUs ?? 0, bear.stunnedUntilUs ?? 0, bear.towerSpellReady?.[skillId] ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, bear);
  if (bear.mana! < ability.mana) return { ok: false, reason: "resources" };
  interruptWeapon(state, bear);
  bear.heroCastUntilUs = now + us(.81);
  bear.spellWindup = scheduleEvent(state.queue, us(.3), { type: "bear-cast", unitId: bear.id, skillId });
  return { ok: true };
}

function finishBearCast(state: Match, id: number, skillId: string) {
  const bear = firingUnit(state, id);
  if (!bear) return;
  delete bear.spellWindup;
  const now = state.queue.nowUs;
  const ability = bearAbilities(bear).find(entry => entry.id === skillId)!;
  syncMana(state, bear);
  if (bear.mana! < ability.mana || now < (bear.stunnedUntilUs ?? 0)) return;
  bear.mana! -= ability.mana;
  (bear.towerSpellReady ??= {})[skillId] = now + us(ability.cooldown);
  bear.lastCastUs = now;
  bear.lastCastTarget = { x: bear.x, y: bear.y };
  triggerSpellEquipment(state, bear);
  if (state.phase !== "running") return;
  if (skillId === "N138" || skillId === "N139") {
    const owner = state.structures.find(tower => tower.spiritBear?.id === id);
    if (!owner) return;
    for (let step = 0; step < 12; step++) {
      const angle = step * Math.PI / 6;
      const point = { x: owner.x + 120 * Math.cos(angle), y: owner.y + 120 * Math.sin(angle) };
      if (!terrainAllowsConstruction(point)) continue;
      if (relocation(state, bear, point, false)) recordBattleAnimation(state, bear, bear.templateId, "relocation-impact");
      break;
    }
    return;
  }
  recordBattleAnimation(state, bear, "B138", "model-effect");
  for (const enemy of state.enemies) {
    if (!bearRoarTarget(state, bear, enemy, 500)) continue;
    enemy.bearRoarUntilUs = Math.max(enemy.bearRoarUntilUs ?? 0, now + us(skillId === "N141" ? 3 : 1.5));
  }
}

function bearRoarTarget(state: Match, bear: Construction, enemy: Enemy, range: number) {
  return targetable(enemy, ["ground"], state.queue.nowUs) &&
    !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Avul" || id === "Aloc") &&
    (enemy.x - bear.x) ** 2 + (enemy.y - bear.y) ** 2 <= range ** 2;
}

function autoBearRoar(state: Match, bear: Construction) {
  const skill = bearAbilities(bear).find(ability => ability.mana > 0);
  if (skill && bear.autoModes?.[skill.id] !== false && state.enemies.some(enemy => bearRoarTarget(state, bear, enemy, 450))) {
    beginBearCast(state, bear, skill.id);
  }
}

function triggerBearEnsnare(state: Match, bear: Construction, enemy: Enemy) {
  const now = state.queue.nowUs;
  if (!targetable(enemy, ["ground", "air"], now) || now < Math.max(enemy.bearRootUntilUs ?? 0, enemy.bearRootLockUntilUs ?? 0)) return;
  const strong = Number(bear.templateId.slice(1)) >= 258;
  if (rollPercent(state) > (strong ? 20 : 10)) return;
  enemy.bearRootLockUntilUs = now + us(strong ? 2.5 : 1.5);
  if (enemy.abilities?.some(id => ["Aeth", "Arsk", "ACrk", "ACsk"].includes(id)) || !canSeeEnemy(state, enemy) ||
      consumeEnemySpellShield(state, enemy)) return;
  enemy.bearRootUntilUs = now + us((strong ? 2.5 : 1.5) * (/^[A-Z]/.test(enemy.unitId) ? .5 : 1));
  recordBattleAnimation(state, enemy, "B136", "model-effect");
}

function spawnTowerIllusions(state: Match, tower: Construction, skillId: "i722" | "i272" | "i274" | "A232" | "T132" | "T134",
  count: number, seconds: number, output: number, damageTaken: number, point: Point = tower, focus?: Enemy) {
  const weapon = weapons[tower.templateId]?.[0];
  if (!weapon) return;
  const gear = towerGear(state, tower);
  const criticalItems = gear.filter(item => ["i141", "i213", "i215", "i306", "i322"].includes(item.itemId))
    .sort((left, right) => left.id - right.id).map(item => item.itemId);
  const vital = syncTowerLife(state, tower);
  const moonGlaive = tower.hero?.ranks.A052;
  const splitRank = splitArrowRank(tower);
  const cleave = tower.hero?.ranks.A062 ?? tower.hero?.ranks.A121 ?? 0;
  const shadow = tower.hero?.ranks.A039;
  const forkRank = tower.hero?.ranks.A123;
  const edgeRank = tower.hero?.ranks.A124 ?? 0;
  const temporaryLife = (skillId === "i272" || skillId === "i274") && (tower.hero?.ranks.A225 ?? 0) > 0 ? 1000 : 0;
  // Each image receives its own snapshot and timer, independent of the original tower.
  for (let index = 0; index < count; index++) {
    const attributes = combatAttributes(state, tower);
    const { base, percent, fixed } = weaponContributions(state, tower, weapon, gear);
    spawnSummon(state, point, tower.templateId, {
      ownerId: tower.id, attack: base * (1 + percent - troopAttackAura(state, tower, weapon)) + fixed -
        (tower.furySwipes?.amount ?? 0) - weapon.base - splitArrowEngineeringAttack(tower),
      speed: .002 * attributes.AGI + weaponSpeedBonus(state, tower, gear), green: 0, blue: 0, skillId,
      illusion: true, output, damageTaken, criticalItems,
      ...(tower.hero?.ranks.A027 ? { criticalRank: tower.hero.ranks.A027 } : {}),
      ...(moonGlaive ? { moonGlaiveRank: moonGlaive } : {}),
      ...(splitRank ? { projectileGroup: { extra: [2, 3, 4, 5, 6, 8][splitRank - 1], range: 1300, speed: 1200,
        budget: 99_999_999 } } : {}),
      ...(cleave ? { swordCleaveRank: cleave } : {}),
      ...(shadow ? { shadowDance: { rank: shadow, attributes: attributes.STR + attributes.AGI + attributes.INT } } : {}),
      ...(tower.hero?.ranks.A044 ? { blademasterCritRank: tower.hero.ranks.A044 } : {}),
      ...(tower.hero?.ranks.A035 ? { wraithCritRank: tower.hero.ranks.A035 } : {}),
      ...(tower.hero?.ranks.A022 ? { overpowerRank: tower.hero.ranks.A022 } : {}),
      ...(tower.hero?.ranks.A158 ? { manaBreak: true } : {}),
      ...(tower.hero?.ranks.A159 ? { manaCounter: true } : {}),
      ...(forkRank || edgeRank || skillId === "T134" ? { phantom: { forkRank: forkRank ?? 0, edgeRank,
        agility: attributes.AGI, counted: skillId === "T134" } } : {}),
      ...(tower.doomBorrowed?.id === "T316" ? { doomOverpowerRank: tower.doomBorrowed.rank } : {}),
      intervalReduction: gear.some(item => item.itemId === "i304") ? .2 : 0,
    }, seconds);
    const image = state.summons!.at(-1)!;
    if (focus) {
      image.focusTarget = focus.id;
      image.lastAttackTarget = { x: focus.x, y: focus.y };
    }
    if (temporaryLife) image.lifeOffset = temporaryLife;
    image.life = {
      ...vital, hp: vital.hp + temporaryLife, maximum: vital.maximum + temporaryLife,
    };
    if (forkRank) {
      tower.hero!.natural.AGI += 20;
      weaponRatesDirty.add(state);
    }
  }
}

const mirrorItems = ["i272", "i274"] as const;

function useMirror(state: Match, tower: Construction, id: typeof mirrorItems[number]): Result {
  const now = state.queue.nowUs;
  if (!weapons[tower.templateId]?.length) return { ok: false, reason: "missing" };
  if (now < Math.max(tower.mirrorReadyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  const axe = id === "i272";
  const cost = axe ? 100 : 60;
  syncMana(state, tower);
  if (tower.mana! < cost) return { ok: false, reason: "resources" };
  tower.mana! -= cost;
  zeusStaticField(state, tower);
  tower.mirrorReadyUs = now + us(15);
  tower.lastCastUs = now;
  tower.lastCastTarget = { x: tower.x, y: tower.y };
  spawnTowerIllusions(state, tower, id, axe ? 2 : 1, 7, axe ? .5 : .3, 1);
  return { ok: true };
}

const necromancyBooks = ["i193", "i194", "i195", "i196"];
const necromancyPriority = [...necromancyBooks].reverse();

export function isActiveTowerEquipment(id: string) {
  return necromancyBooks.includes(id) || id === "i272" || id === "i274" || id === "i326" || id === "i238" || id === "i232" || id === "i330" || id === "i332" || id === "i255";
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
  zeusStaticField(state, tower);
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

type TargetedEquipment = "i224" | "i226" | "i276" | "i281";

export function isTargetedEquipment(itemId: string): itemId is TargetedEquipment {
  return itemId === "i224" || itemId === "i226" || itemId === "i276" || itemId === "i281";
}

export function controlEquipmentTargets(state: Match, towerId: number, itemId: TargetedEquipment) {
  const tower = itemOwner(state, towerId);
  if (!tower || tower.pending || energyCircle(tower)) return [];
  const range = itemId === "i276" ? 1000 : itemId === "i281" ? 900 : 800;
  return state.enemies.filter(enemy => eligibleHeroTarget(state, tower, enemy, range, "A020") &&
    (itemId !== "i276" || enemy.unitId !== "ma01") && (itemId !== "i281" || mapBoss(enemy)));
}

function useControlEquipment(state: Match, tower: Construction, itemId: TargetedEquipment, targetId: number | undefined) {
  const now = state.queue.nowUs;
  const soulBurn = itemId === "i224" || itemId === "i226";
  const readyUs = soulBurn ? tower.soulBurnReadyUs : tower.controlEquipmentReady?.[itemId];
  if (now < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0, readyUs ?? 0)) {
    return { ok: false, reason: "cooldown" } as const;
  }
  const target = controlEquipmentTargets(state, tower.id, itemId).find(enemy => enemy.id === targetId);
  if (!target) return { ok: false, reason: "range" } as const;
  const cost = itemId === "i276" ? 300 : itemId === "i281" ? 100 : 70;
  syncMana(state, tower);
  if (tower.mana! < cost) return { ok: false, reason: "resources" } as const;
  tower.mana! -= cost;
  if (itemId !== "i281") zeusStaticField(state, tower);
  if (soulBurn) {
    tower.soulBurnReadyUs = now + us(25);
    if (state.phase !== "running" || !state.enemies.includes(target) || consumeEnemySpellShield(state, target)) return { ok: true } as const;
    if (target.soulBurn) cancelEvent(state.queue, target.soulBurn.timerId);
    target.soulBurn = {
      timerId: scheduleEvent(state.queue, us(5), { type: "soul-burn-end", targetId: target.id }),
      untilUs: now + us(5), casterId: tower.id, casterTemplate: tower.templateId,
      casterPoint: { x: tower.x, y: tower.y }, itemId, total: 0,
    };
    interruptEnemyCast(state, target);
    scheduleEvent(state.queue, us(.1), { type: "soul-burn-focus", towerId: tower.id, targetId: target.id });
    return { ok: true } as const;
  }
  (tower.controlEquipmentReady ??= {})[itemId] = now + us(itemId === "i276" ? 30 : 15);
  if (itemId === "i276") {
    if (state.phase !== "running" || !state.enemies.includes(target) || target.seal || consumeEnemySpellShield(state, target)) return { ok: true } as const;
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
    if (event.targetId !== -1 && event.targetId !== circleId && terrainAllowsConstruction(target)) {
      scheduleEvent(state.queue, us(.1), { ...event, stage: "move" });
    }
    if (tower.scepterSwap?.grant === event.grant) tower.scepterSwap.readyUs = adjustedSpellCooldown(state, tower, tower.scepterSwap.readyUs);
    return;
  }
  const target = firingUnit(state, event.targetId);
  const from = tower ? { x: tower.x, y: tower.y } : { x: 0, y: 0 };
  if (tower) Object.assign(tower, target ? { x: target.x, y: target.y } : { x: 0, y: 0 });
  if (target) Object.assign(target, from);
  if (tower && emitsManaAura(tower) || target && emitsManaAura(target)) refreshManaAuras(state, from, tower ?? from);
  if (tower?.manaLastUs !== undefined) syncMana(state, tower);
  if (target?.manaLastUs !== undefined) syncMana(state, target);
  weaponRatesDirty.add(state);
}

export function isPointTargetedTowerEquipment(id: string) {
  return id === "i207" || id === "i230" || id === "i325";
}

function useTeleportEquipment(state: Match, tower: Construction, item: Item, id: "i207" | "i230", point: Point | undefined): Result {
  if (!point || !contains(map.bounds, point)) return { ok: false, reason: "range" };
  if (id === "i207" && item.charges < 1) return { ok: false, reason: "missing" };
  const now = state.queue.nowUs;
  if (now < Math.max(tower.teleportReadyUs?.[id] ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  if (tower.mana! < 50) return { ok: false, reason: "resources" };
  tower.mana! -= 50;
  zeusStaticField(state, tower);
  (tower.teleportReadyUs ??= {})[id] = now + us(id === "i207" ? 10 : 25);
  tower.lastCastUs = now;
  tower.lastCastTarget = { ...point };
  if (id === "i207") item.charges--;
  if (!terrainAllowsConstruction(point)) {
    if (id === "i230") return { ok: true };
    const firstStaff = towerGear(state, tower).filter(entry => entry.itemId === id)
      .sort((left, right) => left.slot! - right.slot!)[0];
    removeItem(state, firstStaff);
    const createdId = deliverItem(state, id, undefined, tower);
    if (firstStaff !== item && item.charges === 0 && state.inventory!.includes(item)) removeItem(state, item);
    return { ok: true, createdId };
  }
  if (id === "i207" && item.charges === 0) {
    removeItem(state, item);
    syncMana(state, tower);
  }
  if (tower.teleportTimer !== undefined) cancelEvent(state.queue, tower.teleportTimer);
  tower.teleportTimer = scheduleEvent(state.queue, us(.1), { type: "equipment-teleport", towerId: tower.id, point: { ...point } });
  return { ok: true };
}

function useBlackKingBar(state: Match, tower: Construction): Result {
  const now = state.queue.nowUs;
  if (now < Math.max(tower.blackKingBarReadyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  if (tower.mana! < 50) return { ok: false, reason: "resources" };
  tower.mana! -= 50;
  zeusStaticField(state, tower);
  tower.blackKingBarReadyUs = now + us(30);
  // q027 is an unrendered spell carrier. Keep its identity and lifetime with
  // B080 so restoring the effect never reissues the carrier's spell.
  const sourceId = state.nextId++;
  tower.spellImmunity = { sourceId, carrierUntilUs: now + us(1), untilUs: now + us(6) };
  if (tower.bloodlust) {
    delete tower.bloodlust;
    weaponRatesDirty.add(state);
  }
  tower.lastCastUs = now;
  tower.lastCastTarget = { x: tower.x, y: tower.y };
  scheduleEvent(state.queue, us(6), { type: "spell-immunity-expire", towerId: tower.id, sourceId });
  return { ok: true };
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
  zeusStaticField(state, tower);
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
  zeusStaticField(state, tower);
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

type DeathPulseProjectile = {
  type: "death-pulse";
  towerId: number;
  targetId: number;
  sourceId: number;
  position: Point;
  expiresUs: number;
  travelUs: number;
  visual: "T031" | "T133";
};

function startDeathPulse(state: Match, tower: Construction) {
  const point = { x: tower.x, y: tower.y };
  const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 700 ** 2).sort((a, b) => a.id - b.id);
  for (const enemy of targets) {
    const sourceId = state.nextId++;
    if (!organicWaveTarget(state, enemy) || !canSeeEnemy(state, enemy)) continue;
    launchTrackingProjectile(state, { type: "death-pulse", towerId: tower.id, targetId: enemy.id, sourceId,
      position: point, expiresUs: state.queue.nowUs + us(5), travelUs: 0, visual: tower.templateId === "G050" ? "T133" : "T031" }, enemy);
  }
}

function hitDeathPulse(state: Match, event: DeathPulseProjectile) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!target || !organicWaveTarget(state, target) || !trackingProjectileArrived(state, event, target) ||
      consumeEnemySpellShield(state, target)) return;
  const tower = firingUnit(state, event.towerId);
  const rank = tower?.hero?.ranks.A046;
  if (!tower || !rank) return;
  const doubled = rollPercent(state) <= 50 && hasScepter(state, tower);
  if (doubled && !consumeEnemySpellShield(state, target)) {
    stunEnemy(state, target, us(nativeControlHero(target) ? .5 : 1.5));
    recordBattleAnimation(state, target, "T066", "model-effect");
  }
  const { INT } = combatAttributes(state, tower);
  const amount = ([100, 250, 400, 550, 700, 850][rank - 1] + INT * (.5 + .5 * rank)) * (doubled ? 2 : 1);
  recordBattleAnimation(state, target, event.visual, "model-effect");
  damageEnemy(state, tower, tower.templateId, target, amount, "magic", "A046");
}

function pulseHeartstopper(state: Match, id: number, timerId: number) {
  const tower = state.structures.find(unit => unit.id === id);
  if (!tower || tower.heartstopperTimer !== timerId) {
    cancelEvent(state.queue, timerId);
    return;
  }
  const rank = tower.hero?.ranks.A047;
  if (!rank) return;
  const amount = ([80, 100, 120, 140, 160, 200][rank - 1] +
    [0, .10, .16, .22, .28, .40][rank - 1] * combatAttributes(state, tower).INT) / 2;
  for (const target of [...state.enemies].sort((a, b) => a.id - b.id)) {
    if (state.phase !== "running") break;
    if (targetable(target, ["ground", "air", "structure"], state.queue.nowUs) &&
        (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 <= 1000 ** 2) {
      damageEnemy(state, tower, tower.templateId, target, amount, "magic", "A047");
    }
  }
}

type DuelProjectile = { type: "duel-projectile"; targetId: number; position: Point; travelUs: number; expiresUs: number };
type TrackingProjectile = Extract<MatchEvent, { type: "razor-storm-impact" | "morph-bolt" | "bristle-goo-projectile" }> | DeathPulseProjectile | DuelProjectile | BountyProjectile | CaskProjectile | PhantomSpear | TideProjectile | FirestormProjectile | Extract<MatchEvent, { type: "storm-hammer" | "mana-void-projectile" | "barrage-rocket" | "wraith-projectile" | "boulder-projectile" | "ogre-projectile" | "freezing-scepter" | "shackle-projectile" }> | DoomProjectile;

function nativeAttackEffectHero(enemy: Enemy) {
  return /^[A-Z]/.test(enemy.unitId) || enemy.abilities?.includes("Arsk") || unitBalance.get(enemy.unitId)?.type?.split(",").includes("hero");
}

function nativeControlHero(enemy: Enemy) {
  return /^[A-Z]/.test(enemy.unitId) || enemy.abilities?.some(id => id === "Arsk" || id === "ACrk" || id === "ACsk");
}

function trackingProjectileSpeed(event: TrackingProjectile) {
  if (event.type === "bristle-goo-projectile") return 800;
  if (event.type === "firestorm-projectile") return 1400;
  if (event.type === "tide-projectile") return event.skillId === "T276" ? 1400 : 1200;
  if (event.type === "razor-storm-impact") return weapons.q051[0].speed;
  if (event.type === "mana-void-projectile") return 20_000;
  if (event.type === "shackle-projectile") return 3000;
  if (event.type === "barrage-rocket") return 900;
  if (event.type === "duel-projectile") return 5000;
  if (event.type === "storm-hammer") return 1200;
  if (event.type === "death-pulse") return 640;
  if (event.type === "doom-projectile") {
    if (event.spell === "T302" || event.spell === "T178" || event.spell === "A200") return 800;
    return event.spell === "T303" ? 1000 : 1400;
  }
  return event.type === "ogre-projectile" || event.type === "freezing-scepter" ? 3000 : 1000;
}

function launchTrackingProjectile(state: Match, event: TrackingProjectile, target: Point) {
  const speed = trackingProjectileSpeed(event);
  const expiry = "expiresUs" in event ? event.expiresUs ?? Infinity : Infinity;
  const travelUs = Math.min(expiry - state.queue.nowUs, movementStepUs,
    us(Math.hypot(target.x - event.position.x, target.y - event.position.y) / speed));
  scheduleEvent(state.queue, travelUs, { ...event, travelUs });
}

function trackingProjectileArrived(state: Match, event: TrackingProjectile, target: Point) {
  const speedPerUs = trackingProjectileSpeed(event) / 1_000_000;
  const step = event.travelUs * speedPerUs;
  const distance = Math.hypot(target.x - event.position.x, target.y - event.position.y);
  if (distance <= step + speedPerUs) return true;
  const expiry = "expiresUs" in event ? event.expiresUs ?? Infinity : Infinity;
  if (state.queue.nowUs < expiry) {
    const { dx, dy } = spellDirection(event.position, target);
    launchTrackingProjectile(state, { ...event, position: { x: event.position.x + step * dx, y: event.position.y + step * dy } }, target);
  }
  return false;
}

function tideTarget(state: Match, enemy: Enemy) {
  return physicalAreaTarget(state, enemy) && !magicImmune(enemy);
}

function sendTidePair(state: Match, point: Point, target: Enemy, rank: number, towerId?: number) {
  for (const skillId of ["T276", "T278"] as const) {
    const source = { x: point.x, y: point.y, id: state.nextId++ };
    const expiresUs = state.queue.nowUs + us(1);
    scheduleEvent(state.queue, us(1), { type: "tide-carrier-expire", sourceId: source.id, towerId,
      targetId: target.id, skillId, point: { x: point.x, y: point.y } });
    if (!tideTarget(state, target) || !canSeeEnemy(state, target)) continue;
    launchTrackingProjectile(state, { type: "tide-projectile", towerId, targetId: target.id, source, position: { ...source },
      expiresUs, skillId, rank, travelUs: 0 }, target);
    if (skillId === "T276") recordBattleAnimation(state, source, "T276", "model-effect", target);
  }
}

function castTideWave(state: Match, tower: Construction, target: Enemy, skillId: "A217" | "A218", rank: number) {
  const staff = skillId === "A218";
  const range = staff ? 1200 : Math.hypot(target.x - tower.x, target.y - tower.y);
  if (!staff) sendTidePair(state, tower, target, rank);
  const direction = spellDirection(tower, target);
  const sourceId = state.nextId++;
  if (staff) scheduleEvent(state.queue, us(10), { type: "tide-wave-expire", sourceId, towerId: tower.id });
  recordBattleAnimation(state, tower, "T277", "model-effect",
    { x: tower.x + direction.dx * range, y: tower.y + direction.dy * range }).durationUs = us(range / 1000);
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { x: tower.x, y: tower.y, ...direction,
    towerId: tower.id, sourceId, name: skillId, speed: 1000, range,
    radiusStart: 1, radiusEnd: 1 + 424 * range / 1200, amount: 10, traveled: 0, hit: [],
    targets: ["ground", "air", "structure", "mechanical", "ward"], tide: { rank, ...(!staff && { excludeId: target.id }) } } });
}

function resolveTideProjectile(state: Match, event: TideProjectile) {
  const target = state.enemies.find(unit => unit.id === event.targetId);
  if (!target || !tideTarget(state, target) || !trackingProjectileArrived(state, event, target) ||
      consumeEnemySpellShield(state, target)) return;
  if (event.skillId === "T276") {
    const untilUs = state.queue.nowUs + us(4);
    target.tideCorrosion = { armor: 10 + 10 * event.rank, untilUs };
    scheduleEvent(state.queue, us(4), { type: "tide-corrosion-end", enemyId: target.id, untilUs });
    return;
  }
  const hero = nativeAttackEffectHero(target);
  stunEnemy(state, target, us(hero && event.rank >= 5 ? 3 : .01));
  const owner = event.towerId === undefined ? undefined : firingUnit(state, event.towerId);
  damageEnemy(state, owner, "q001", target, heroSpells.A217.damage[event.rank - 1] * .8, "magic", "T278", event.source);
}

function castImpale(state: Match, tower: Construction, aim: Point, amount: number) {
  const { dx, dy } = spellDirection(tower, aim);
  const hit = new Set<number>();
  for (let distance = 200; distance <= 1200; distance += 200) {
    const point = { x: tower.x + distance * dx, y: tower.y + distance * dy };
    recordBattleAnimation(state, point, "ImpaleMissTarget", "model-effect").durationUs = us(2);
    const inCircle = (enemy: Enemy) => (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 200 ** 2;
    for (const enemy of state.enemies.filter(inCircle).sort((left, right) => left.id - right.id)) {
      if (state.phase !== "running") return;
      if (hit.has(enemy.id) || !state.enemies.includes(enemy) || !physicalAreaTarget(state, enemy) || magicImmune(enemy) ||
          !targetable(enemy, ["ground", "structure", "mechanical"], state.queue.nowUs)) continue;
      hit.add(enemy.id);
      damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", "A236");
    }
    const token = state.queue.nextSequence;
    const targets: number[] = [];
    for (const enemy of state.enemies.filter(inCircle).sort((left, right) => left.id - right.id)) {
      if (enemy.hp <= 0 || enemy.impaleLift) continue;
      enemy.impaleLift = { token, height: 0 };
      interruptEnemyCast(state, enemy);
      targets.push(enemy.id);
    }
    if (targets.length) scheduleEvent(state.queue, us(.02), { type: "impale-lift", token, targets, step: 1 });
  }
}

const hexCritters = ["npig", "nsea", "ncrb", "nhmc", "nrat", "nfro", "necr", "nrac"];

function castLionHex(state: Match, tower: Construction, point: Point) {
  const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 600 ** 2).sort((left, right) => left.id - right.id);
  for (const enemy of targets) {
    const sourceId = state.nextId++;
    scheduleEvent(state.queue, us(1), { type: "lion-carrier-expire", towerId: tower.id,
      sourceId, targetId: enemy.id, skillId: "T406", point, mana: unitBalance.get("q001")!.mana0! });
    if (!organicWaveTarget(state, enemy) || !canSeeEnemy(state, enemy) || enemy.abilities?.includes("Aeth") ||
        consumeEnemySpellShield(state, enemy)) continue;
    const movement = unitMovementType.get(enemy.unitId);
    const air = (unitTargetType.get(enemy.unitId) ?? (enemy.layer === "fly" ? "air" : "ground")) === "air";
    const form = air ? hexCritters[Math.floor(roll(state) * hexCritters.length)] :
      movement === "amph" ? "nsha" : movement === "float" ? "nshw" : "nsno";
    applyEnemyHex(state, enemy, sourceId, us(3), form);
    recordBattleAnimation(state, enemy, "PolyMorphDoneGround", "model-effect");
  }
  scheduleEvent(state.queue, us(.2), { type: "lion-hex-tail", towerId: tower.id, point });
}

function castFingerOfDeath(state: Match, tower: Construction, primary: Enemy) {
  const point = { x: primary.x, y: primary.y };
  const targets = hasScepter(state, tower) ? state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 390 ** 2).sort((left, right) => left.id - right.id) : [primary];
  for (const enemy of targets) {
    if (state.phase !== "running") break;
    if (enemy.hp <= 0 || !state.enemies.includes(enemy)) continue;
    const source = { x: tower.x, y: tower.y, id: state.nextId++ };
    scheduleEvent(state.queue, us(1), { type: "lion-carrier-expire", towerId: tower.id,
      sourceId: source.id, targetId: enemy.id, skillId: "T405", point: { x: source.x, y: source.y }, mana: unitBalance.get("q059")!.mana0! });
    if (!physicalAreaTarget(state, enemy) || !canSeeEnemy(state, enemy) || magicImmune(enemy) ||
        (source.x - enemy.x) ** 2 + (source.y - enemy.y) ** 2 > 1200 ** 2 || consumeEnemySpellShield(state, enemy)) continue;
    recordBattleAnimation(state, source, "AFOD", "spell-link", enemy);
    recordBattleAnimation(state, source, "LightningBoltMissile", "model-effect", enemy).durationUs =
      us(Math.hypot(enemy.x - source.x, enemy.y - source.y) / 1500);
    recordBattleAnimation(state, enemy, "DemonBoltImpact", "model-effect");
    damageEnemy(state, tower, "q059", enemy, heroSpells.A238.damage[0] * .8, "magic", "A238", source);
  }
}

function castRavage(state: Match, tower: Construction, rank: number, amount: number) {
  const now = state.queue.nowUs;
  const victims = state.enemies.filter(enemy => tideTarget(state, enemy) &&
    targetable(enemy, ["ground", "structure", "mechanical"], now) &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 1000 ** 2).sort((a, b) => a.id - b.id);
  const stuns = [];
  for (const enemy of victims) {
    if (state.phase !== "running") break;
    if (!state.enemies.includes(enemy) || !tideTarget(state, enemy)) continue;
    damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", "A222");
    if (state.enemies.includes(enemy)) stuns.push(enemy.id);
  }
  for (let index = 1; index <= 20; index++) {
    const angle = index * Math.PI / 10;
    recordBattleAnimation(state, tower, "T279", "model-effect",
      { x: tower.x + 1000 * Math.cos(angle), y: tower.y + 1000 * Math.sin(angle) });
  }
  const token = state.queue.nextSequence;
  const targets = [];
  for (const enemy of [...state.enemies].sort((a, b) => a.id - b.id)) {
    if (enemy.hp <= 0 || (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > 1200 ** 2) continue;
    if (enemy.ravageLift) {
      if (stuns.includes(enemy.id)) stunEnemy(state, enemy, us(2.3 + .3 * rank));
      continue;
    }
    enemy.ravageLift = { token, height: 0 };
    interruptEnemyCast(state, enemy);
    targets.push(enemy.id);
  }
  if (targets.length) scheduleEvent(state.queue, us(.02), { type: "ravage-step", token, targets, stuns, step: 1, rank });
}

function commitShackle(state: Match, tower: Construction, primary: Enemy) {
  launchTrackingProjectile(state, { type: "shackle-projectile", towerId: tower.id, targetId: primary.id,
    position: { x: tower.x, y: tower.y }, travelUs: 0 }, primary);
  recordBattleAnimation(state, tower, "H119", "model-effect", primary);
  const angleFromCaster = (point: Point) => Math.atan2(point.y - tower.y, point.x - tower.x);
  const squaredDistance = (point: Point) => (point.x - tower.x) ** 2 + (point.y - tower.y) ** 2;
  const ray = angleFromCaster(primary);
  const choices = [{ ...state.worker, id: -1 }, circle,
    ...state.structures.filter(unit => (unit.life?.hp ?? 1) > 0),
    ...(state.summons ?? []).filter(unit => (unit.life?.hp ?? 1) > 0),
    ...state.enemies.filter(unit => unit.hp > 0),
  ].sort((left, right) => left.id - right.id);
  const targets: typeof choices = [primary];
  for (;;) {
    const current = targets.at(-1)!;
    const distance = squaredDistance(current);
    const next = choices.find(unit => squaredDistance(unit) > distance &&
      (unit.x - current.x) ** 2 + (unit.y - current.y) ** 2 <= 300 ** 2 && Math.abs(angleFromCaster(unit) - ray) < Math.PI / 12);
    if (!next) break;
    targets.push(next);
  }
  const skillId = tower.templateId === "G072" ? "T261" : "T173";
  for (const [index, target] of targets.entries()) {
    if (state.phase !== "running") break;
    const point = { x: target.x, y: target.y };
    const sourceId = state.nextId++;
    const legal = "unitId" in target && ogreBlastTarget(state, target);
    scheduleEvent(state.queue, us(1), { type: "focus-carrier-expire", towerId: tower.id, sourceId, skillId, rank: 1,
      mana: legal ? 998 : 1000, point });
    const next = targets[index + 1];
    if (next) recordBattleAnimation(state, point, "MFPB", "spell-link", next).durationUs = us(2);
    if (legal && !consumeEnemySpellShield(state, target)) {
      stunEnemy(state, target, us(3));
      damageEnemy(state, tower, "q001", target, heroSpells.A161.damage[0] * .8, "magic", skillId, { ...point, id: sourceId });
    }
  }
}

function markBounty(state: Match, tower: Construction, target: Enemy) {
  if (target.bountyMark) cancelEvent(state.queue, target.bountyMark.timerId);
  target.bountyMark = { towerId: tower.id, timerId: scheduleEvent(state.queue, us(10), { type: "bounty-mark-end", enemyId: target.id }) };
  recordBattleAnimation(state, target, "FaerieFire", "model-effect").enemyId = target.id;
}

function scanBountyTracking(state: Match, tower: Construction) {
  if (!tower.hero?.ranks.A091 || tower.autoModes?.A091 !== true ||
      state.queue.nowUs < (tower.heroSpellReady?.A091 ?? 0)) return;
  const target = state.enemies.filter(enemy => !enemy.bountyArmor &&
    eligibleHeroTarget(state, tower, enemy, heroSpells.A091.autoRange, "A091")).sort((left, right) => left.id - right.id)[0];
  if (target) beginHeroSpell(state, tower, "A091", true, { targetId: target.id });
}

function scheduleBountyTracking(state: Match, tower: Construction) {
  if (tower.bountyTrackTimer !== undefined) {
    cancelEvent(state.queue, tower.bountyTrackTimer);
    delete tower.bountyTrackTimer;
  }
  if (tower.autoModes?.A091 !== true) return;
  const wait = Math.max(0, (tower.heroSpellReady?.A091 ?? 0) - state.queue.nowUs);
  tower.bountyTrackTimer = scheduleEvent(state.queue, wait, { type: "bounty-track-scan", towerId: tower.id });
}

function launchBountyProjectile(state: Match, tower: Construction, from: Point, target: Enemy, rank: number,
  throwId: number, remaining?: number) {
  if (!ogreBlastTarget(state, target) || (from.x - target.x) ** 2 + (from.y - target.y) ** 2 > 1000 ** 2) return;
  const position = { x: from.x, y: from.y };
  const expiresUs = remaining === undefined ? undefined : state.queue.nowUs + us(1);
  launchTrackingProjectile(state, { type: "bounty-projectile", towerId: tower.id, targetId: target.id,
    source: { ...position, id: state.nextId++ }, position, expiresUs, travelUs: 0, rank, throwId, remaining }, target);
}

function launchPhantomSpear(state: Match, tower: Construction, from: Point, enemy: Enemy, rank: number, spear: PhantomSpearLink) {
  if (!ogreBlastTarget(state, enemy) || (from.x - enemy.x) ** 2 + (from.y - enemy.y) ** 2 > 1000 ** 2) return;
  const position = { x: from.x, y: from.y };
  launchTrackingProjectile(state, { type: "phantom-spear", towerId: tower.id, targetId: enemy.id, rank,
    source: { ...position, id: state.nextId++, spear }, position, expiresUs: state.queue.nowUs + us(1), travelUs: 0 }, enemy);
}

function resolvePhantomSpear(state: Match, shot: PhantomSpear) {
  const enemy = state.enemies.find(target => target.id === shot.targetId && ogreBlastTarget(state, target));
  if (!enemy || !trackingProjectileArrived(state, shot, enemy) || consumeEnemySpellShield(state, enemy)) return;
  stunEnemy(state, enemy, us(.01));
  const tower = firingUnit(state, shot.towerId);
  damageEnemy(state, tower, "q029", enemy, heroSpells.A122.damage[shot.rank - 1] * .8, "magic", "A122", shot.source);
}

function phantomSpearLanding(state: Match, tower: Construction, enemy: Enemy, link: PhantomSpearLink, liveRank: number) {
  if (organicWaveTarget(state, enemy) && canSeeEnemy(state, enemy) && !consumeEnemySpellShield(state, enemy)) {
    const untilUs = state.queue.nowUs + us(4);
    enemy.phantomSlow = { untilUs, attackPenalty: .25 };
    scheduleEvent(state.queue, us(4), { type: "phantom-slow-end", enemyId: enemy.id, untilUs });
    recordBattleAnimation(state, enemy, "T131", "model-effect").enemyId = enemy.id;
  }
  scheduleEvent(state.queue, 0, { type: "phantom-illusion", kind: "spear", towerId: tower.id, targetId: enemy.id });
  if (link.contacts >= 3 || !hasScepter(state, tower)) return;
  const target = state.enemies.filter(unit => unit.id !== enemy.id && unit.hp > 0 && !unit.abilities?.includes("Aloc") &&
    (unit.x - enemy.x) ** 2 + (unit.y - enemy.y) ** 2 <= 400 ** 2).sort((left, right) => left.id - right.id)[0];
  if (target) launchPhantomSpear(state, tower, enemy, target, liveRank, { castId: link.castId, contacts: link.contacts + 1 });
}

function phantomCount(state: Match, towerId: number) {
  return state.summons?.filter(unit => unit.summon?.ownerId === towerId && unit.summon.phantom?.counted).length ?? 0;
}

function attackWithPhantom(state: Match, tower: Construction | undefined, actor: Construction, enemy: Enemy) {
  const clone = actor.summon?.phantom;
  const rank = clone?.forkRank ?? actor.hero?.ranks.A123 ?? 0;
  if (!rank) return;
  const roll = rollPercent(state);
  const edge = clone?.edgeRank ?? actor.hero?.ranks.A124 ?? 0;
  const success = clone ? !!edge && roll <= 1 + edge : roll <= 10 + edge;
  if (success && tower) {
    const reserved = state.queue.pending.filter(({ payload }) => payload.type === "phantom-illusion" &&
      payload.kind === "parallel" && payload.towerId === tower.id).length;
    if (phantomCount(state, tower.id) + reserved < rank) {
      const point = enemy.unitId === "m998" || enemy.unitId === "m999" ? enemy : actor;
      scheduleEvent(state.queue, 0, { type: "phantom-illusion", kind: "parallel", towerId: tower.id,
        actorId: actor.id, point: { x: point.x, y: point.y } });
    }
  }
  if (clone) damageEnemy(state, tower, actor.templateId, enemy, clone.agility * .5, "divine", "A123", actor, true);
}

function resolvePhantomIllusion(state: Match, event: Extract<MatchEvent, { type: "phantom-illusion" }>) {
  const tower = firingUnit(state, event.towerId);
  if (!tower || tower.pending || (tower.life?.hp ?? 1) <= 0) return;
  if (event.kind === "parallel") {
    const actor = firingUnit(state, event.actorId);
    const rank = actor?.summon?.phantom?.forkRank ?? actor?.hero?.ranks.A123 ?? 0;
    if (phantomCount(state, tower.id) >= rank) return;
    const position = nearestSpawn(event.point, 0, "ground");
    spawnTowerIllusions(state, tower, "T134", 1, 10, 1, 1, position);
    recordBattleAnimation(state, position, "T134", "model-effect");
  } else {
    const rank = tower.hero?.ranks.A122 ?? 0;
    if (!rank) return;
    const target = state.enemies.find(enemy => enemy.id === event.targetId);
    const point = target ?? state.recentHits?.find(hit => hit.targetId === event.targetId && hit.deadUnitId && hit.atUs === state.queue.nowUs);
    if (!point) return;
    const position = nearestSpawn(point, 0, "ground");
    spawnTowerIllusions(state, tower, "T132", 1, 2 + rank, 1, 1, position, target);
    recordBattleAnimation(state, position, "T132", "model-effect");
  }
}

function resolveBountyProjectile(state: Match, event: BountyProjectile) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId && ogreBlastTarget(state, enemy));
  if (!target || !trackingProjectileArrived(state, event, target) || consumeEnemySpellShield(state, target)) return false;
  stunEnemy(state, target, us(.1));
  if (event.remaining === undefined) return false;
  const tower = firingUnit(state, event.towerId);
  damageEnemy(state, tower, "q024", target, (800 + 200 * event.rank) * .8, "magic", "A089",
    { ...event.source, bounty: { throwId: event.throwId, remaining: event.remaining } });
  return !!tower?.hero?.ranks.A090;
}

function shadowWindImpact(state: Match, tower: Construction, enemy: Enemy, throwId: number, remaining: number) {
  const point = { x: enemy.x, y: enemy.y };
  const source = { ...point, id: state.nextId++ };
  const rank = tower.hero!.ranks.A090;
  const currentTarget = (target: Enemy) => organicWaveTarget(state, target) && canSeeEnemy(state, target);
  const victims = state.enemies.filter(target => currentTarget(target) &&
    (target.x - point.x) ** 2 + (target.y - point.y) ** 2 <= 275 ** 2).sort((left, right) => left.id - right.id);
  for (const target of victims) {
    if (state.phase !== "running") return;
    if (!currentTarget(target)) continue;
    stunEnemy(state, target, us(2));
    damageEnemy(state, tower, "q001", target, (500 + 200 * rank) * .8, "magic", "A090", source);
  }
  if (state.phase !== "running") return;
  recordBattleAnimation(state, point, "SJ_XF", "model-effect");
  const auraId = state.nextId++;
  (state.shadowWindAuras ??= {})[auraId] = { ...point, untilUs: state.queue.nowUs + us(4) };
  scheduleEvent(state.queue, us(4), { type: "shadow-wind-expire", auraId });
  refreshShadowWind(state);
  if (remaining > 0) {
    const next = state.enemies.filter(target => target !== enemy && target.hp > 0 && !!target.bountyMark &&
      !target.abilities?.includes("Aloc") && (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= 600 ** 2)
      .sort((left, right) => left.id - right.id)[0];
    if (next) launchBountyProjectile(state, tower, point, next, Math.max(1, tower.hero!.ranks.A089 ?? 0), throwId, remaining - 1);
  }
}

function beginFatalBonds(state: Match, tower: Construction, target: Enemy, rank: number) {
  const now = state.queue.nowUs;
  const radius = 250 + 50 * rank;
  const others = state.enemies.filter(enemy => enemy.id !== target.id && enemy.hp > 0 &&
    !enemy.abilities?.includes("Aloc") && (enemy.x - target.x) ** 2 + (enemy.y - target.y) ** 2 <= radius ** 2)
    .sort((a, b) => a.id - b.id).slice(0, rank + 1);
  const linked = [target, ...others];
  const groupId = state.nextId++;
  (state.fatalBonds ??= {})[groupId] = { members: linked.map(enemy => enemy.id), untilUs: now + us(6) };
  scheduleEvent(state.queue, us(6), { type: "fatal-bonds-expire", groupId });
  const carrierId = state.nextId++;
  state.fatalBondsCarrier = { x: tower.x, y: tower.y, id: carrierId, untilUs: now + us(7) };
  scheduleEvent(state.queue, us(7), { type: "fatal-bonds-carrier-expire", carrierId });
  for (const [index, enemy] of linked.entries()) {
    const marker = recordBattleAnimation(state, enemy, "T188", "model-effect");
    marker.enemyId = enemy.id;
    marker.durationUs = us(6);
    recordBattleAnimation(state, linked[index - 1] ?? tower, "A173", "spell-link", enemy).durationUs = us(.5);
  }
}

function shareFatalBonds(state: Match, tower: Construction, enemy: Enemy, amount: number, kind: "magic" | "physical" | "divine") {
  const carrier = state.fatalBondsCarrier;
  if (!carrier || !state.fatalBonds) return;
  for (const group of Object.values(state.fatalBonds)) {
    if (!group.members.includes(enemy.id)) continue;
    for (const id of group.members) {
      if (state.phase !== "running") return;
      if (id === enemy.id) continue;
      const victim = state.enemies.find(target => target.id === id);
      if (!victim) continue;
      const transmitted = kind === "physical" ? physicalDamage(amount * .25, "hero", armorAt(state, victim), !!victim.welfare) :
        amount * (kind === "magic" ? .25 * .8 : .25);
      damageEnemy(state, tower, "q039", victim, transmitted, kind, "A173", carrier);
    }
  }
}

function infernalLand(state: Match, { towerId, rank, source }: Extract<MatchEvent, { type: "infernal-land" }>) {
  const tower = firingUnit(state, towerId);
  const now = state.queue.nowUs;
  const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "structure", "debris"], now) &&
    !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Avul" || id === "Aloc") &&
    (enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2 <= 500 ** 2).sort((a, b) => a.id - b.id);
  for (const enemy of targets) {
    if (state.phase !== "running") return;
    stunEnemy(state, enemy, us(1));
    damageEnemy(state, tower, "q001", enemy, 10 * .8, "magic", "A175", source);
  }
  if (state.phase !== "running") return;
  const gear = tower ? towerGear(state, tower).map(item => item.itemId) : [];
  const modifiers = summonModifiers(gear);
  const inheritance = modifiers.red || modifiers.green || modifiers.blue ? .6 : gear.includes("i240") ? .5 : .4;
  const attributes = tower ? combatAttributes(state, tower) : { STR: 0, AGI: 0, INT: 0 };
  const templateId = "n" + (260 + rank);
  const position = nearestSpawn(source, 0, "ground");
  const unitId = spawnSummon(state, position, templateId, {
    ownerId: towerId, attack: weaponFieldInt(inheritance * (attributes.STR + attributes.AGI + attributes.INT)),
    ...modifiers, skillId: "A175",
  }, 15);
  scheduleEvent(state.queue, us(1), { type: "infernal-immolation", unitId }, us(1));
}

function infernalImmolation(state: Match, unitId: number, timerId: number) {
  const unit = firingUnit(state, unitId);
  if (!unit?.summon) {
    cancelEvent(state.queue, timerId);
    return;
  }
  const tower = firingUnit(state, unit.summon.ownerId);
  const rank = Number(unit.templateId.slice(1)) - 260;
  const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure", "mechanical", "ward"], state.queue.nowUs) &&
    (enemy.x - unit.x) ** 2 + (enemy.y - unit.y) ** 2 <= 300 ** 2).sort((a, b) => a.id - b.id);
  for (const enemy of targets) {
    if (state.phase !== "running") return;
    damageEnemy(state, tower, unit.templateId, enemy, 200 * rank * .8, "magic", "N" + (152 + rank), unit);
  }
}

const upheavalStages = [
  [.2, .25, .3, .4], [.2, .3, .4, .5], [.2, .3, .5, .6],
  [.2, .4, .6, .7], [.2, .4, .6, .8], [.2, .4, .7, .9],
];

function stopUpheaval(state: Match, tower: Construction) {
  if (tower.upheavalId === undefined) return false;
  const aura = state.upheavalAuras?.[tower.upheavalId];
  if (aura?.progressTimer !== undefined) {
    cancelEvent(state.queue, aura.progressTimer);
    delete aura.progressTimer;
  }
  delete tower.upheavalId;
  tower.heroCastUntilUs = state.queue.nowUs;
  tower.heroSpellReady!.A174 = adjustedSpellCooldown(state, tower, tower.heroSpellReady!.A174!, 0, "A174");
  return true;
}

function beginUpheaval(state: Match, tower: Construction, point: Point, rank: number) {
  stopUpheaval(state, tower);
  const id = tower.upheavalId = state.nextId++;
  const aura: UpheavalAura = { ...point, towerId: tower.id, untilUs: state.queue.nowUs + us(5), rank, stage: 0,
    visual: tower.templateId === "G070" ? "q044" : "q040" };
  aura.progressTimer = scheduleEvent(state.queue, us(1), { type: "upheaval-progress", auraId: id }, us(1));
  (state.upheavalAuras ??= {})[id] = aura;
  scheduleEvent(state.queue, us(5), { type: "upheaval-expire", auraId: id });
  tower.heroCastUntilUs = aura.untilUs;
  recordBattleAnimation(state, aura, aura.visual, "model-effect").durationUs = us(1);
  refreshUpheavalSlows(state);
}

function refreshUpheavalSlows(state: Match, enemies = state.enemies) {
  if (!state.upheavalAuras) return;
  const sources = Object.values(state.upheavalAuras);
  for (const enemy of enemies) {
    const slow = !shadowWindEligible(enemy) ? 0 : sources.reduce((max, aura) =>
      (aura.x - enemy.x) ** 2 + (aura.y - enemy.y) ** 2 <= 500 ** 2 ?
        Math.max(max, upheavalStages[aura.rank - 1][aura.stage]) : max, 0);
    if (slow) enemy.upheavalSlow = 1 - slow;
    else delete enemy.upheavalSlow;
  }
}

function shadowWindEligible(enemy: Enemy) {
  return enemy.hp > 0 && !magicImmune(enemy) && !enemy.abilities?.includes("Aloc");
}

function refreshShadowWind(state: Match, enemies = state.enemies) {
  if (!state.shadowWindAuras) return;
  const sources = Object.values(state.shadowWindAuras);
  for (const enemy of enemies) {
    if (shadowWindEligible(enemy) && sources.some(source => (source.x - enemy.x) ** 2 + (source.y - enemy.y) ** 2 <= 400 ** 2)) {
      enemy.shadowWindSlow = true;
    } else {
      delete enemy.shadowWindSlow;
    }
  }
}

function scheduleSlowAuraBoundary(state: Match, enemy: Enemy, span: RouteSpan) {
  if ((!state.shadowWindAuras && !state.upheavalAuras) || !shadowWindEligible(enemy)) return;
  const now = state.queue.nowUs;
  const length = Math.hypot(span.to.x - enemy.x, span.to.y - enemy.y);
  if (length <= 0 || span.untilUs <= now) return;
  const direction = spellDirection(enemy, span.to);
  let earliest = Infinity;
  const sources = [
    ...Object.values(state.shadowWindAuras ?? {}).map(source => ({ source, radius: 400 })),
    ...Object.values(state.upheavalAuras ?? {}).map(source => ({ source, radius: 500 })),
  ];
  for (const { source, radius } of sources) {
    const motion: SpellSweep = { ...direction, x: enemy.x, y: enemy.y, towerId: 0, name: "aura",
      speed: length * 1_000_000 / (span.untilUs - now), range: length, radiusStart: radius, radiusEnd: radius, amount: 0, traveled: 0, hit: [] };
    const contact = waveContact(motion, source);
    if (!contact) continue;
    const containsAt = (time: number) => {
      const point = routeSpanPoint(span, time);
      return (source.x - point.x) ** 2 + (source.y - point.y) ** 2 <= radius ** 2;
    };
    const inside = containsAt(now);
    let boundary = now + (inside ? contact[1] : contact[0]);
    if (containsAt(boundary) === inside) boundary++;
    if (boundary > now && boundary <= span.untilUs && boundary < source.untilUs && containsAt(boundary) !== inside) {
      earliest = Math.min(earliest, boundary);
    }
  }
  if (Number.isFinite(earliest)) enemy.shadowWindTimer = scheduleEvent(state.queue, earliest - now,
    { type: "shadow-wind-boundary", enemyId: enemy.id });
}

function launchGyroBarrage(state: Match, event: Extract<MatchEvent, { type: "barrage-launch" }>, timerId: number) {
  const tower = firingUnit(state, event.towerId);
  if (!tower || tower.barrageTimer !== timerId || event.remaining === 0 || (tower.life?.hp ?? 1) <= 0) {
    cancelEvent(state.queue, timerId);
    if (tower?.barrageTimer === timerId) delete tower.barrageTimer;
    return;
  }
  event.remaining--;
  const candidates = state.enemies.filter(enemy => ogreBlastTarget(state, enemy) &&
    (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 800 ** 2).sort((left, right) => left.id - right.id);
  if (!candidates.length) return;
  const target = candidates[Math.floor(roll(state) * candidates.length)];
  launchTrackingProjectile(state, { type: "barrage-rocket", towerId: tower.id, targetId: target.id, amount: event.amount,
    position: { x: tower.x, y: tower.y }, travelUs: 0 }, target);
  recordBattleAnimation(state, tower, "T216", "model-effect", target);
}

function launchCask(state: Match, tower: Construction, from: Point, target: Enemy, cask: CaskProjectile["source"]["cask"]) {
  const { x, y } = from;
  const source = { x, y, id: state.nextId++, cask };
  if (!ogreBlastTarget(state, target) || (target.x - x) ** 2 + (target.y - y) ** 2 > 3000 ** 2) return;
  launchTrackingProjectile(state, { type: "cask-projectile", towerId: tower.id, targetId: target.id, source,
    position: { x, y }, expiresUs: state.queue.nowUs + us(1), travelUs: 0 }, target);
  recordBattleAnimation(state, from, "T231", "model-effect", target);
}

function pulseWitchCurse(state: Match, curseId: number, final: boolean) {
  const curse = state.witchCurses?.[curseId];
  if (!curse) return;
  if (final) delete state.witchCurses![curseId];
  const tower = firingUnit(state, curse.towerId);
  if (!tower) return;
  for (const sample of curse.targets) {
    if (state.phase !== "running") return;
    const enemy = state.enemies.find(unit => unit.id === sample.id && unit.hp > 0);
    if (!enemy) continue;
    syncEnemyHealth(state, enemy);
    const loss = sample.hp - enemy.hp;
    sample.hp = enemy.hp;
    if (loss <= 0) continue;
    recordBattleAnimation(state, enemy, "netherinferno", "model-effect");
    damageEnemy(state, tower, tower.templateId, enemy, loss * curse.rate * .8, "magic", "A208");
  }
}

function clearEnemyPositiveBuffs(target: Enemy) {
  delete target.armorBuff;
  delete target.speedBuff;
  delete target.speedBuffUntilUs;
  delete target.sprintUntilUs;
  delete target.invisibleFromUs;
  delete target.windwalk;
  delete target.windwalkSpeed;
}

function displaceEnemy(state: Match, enemy: Enemy, point: Point, allies: Pick<Enemy, "id" | "x" | "y" | "radius" | "layer">[] = []) {
  Object.assign(enemy, point);
  if (enemy.routeSpan?.timerId !== undefined) cancelEvent(state.queue, enemy.routeSpan.timerId);
  delete enemy.routeSpan;
  enemy.insideRegions = waypointRegions.flatMap((region, index) => contains(region, enemy) ? [index] : []);
  const overlapping = [...state.enemies, ...allies].filter(unit => unit.id !== enemy.id && unit.layer === enemy.layer && overlaps(enemy, unit));
  enemy.initialOverlaps = overlapping.map(unit => unit.id);
  for (const other of state.enemies) {
    if (overlapping.includes(other) && !other.initialOverlaps.includes(enemy.id)) other.initialOverlaps.push(enemy.id);
  }
}

function placeMagnusTarget(state: Match, enemy: Enemy, point: Point) {
  const ground = enemy.layer === "ground";
  const blocked = ground ? state.structures.filter(unit => footprintTowers.has(unit.templateId)).map(buildFootprint) : [];
  displaceEnemy(state, enemy, nearestSpawn(point, enemy.radius, enemy.layer, blocked), ground ? groundAllies(state) : []);
}

function beginMagnusPush(state: Match, tower: Construction, enemy: Enemy) {
  const { dx, dy } = spellDirection(tower, enemy);
  placeMagnusTarget(state, enemy, { x: enemy.x + 40 * dx, y: enemy.y + 40 * dy });
  if (enemy.magnusPush) cancelEvent(state.queue, enemy.magnusPush.timerId);
  enemy.magnusPush = { dx, dy, remaining: 3, timerId: scheduleEvent(state.queue, us(.05), { type: "magnus-push", enemyId: enemy.id }, us(.05)) };
}

function beginVacuum(state: Match, tower: Construction, point: Point, rank: number) {
  if (tower.vacuum) cancelEvent(state.queue, tower.vacuum.timerId);
  const radius = 390 + 10 * rank;
  const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= radius ** 2).sort((left, right) => left.id - right.id);
  tower.vacuum = { point, targets: targets.map(enemy => enemy.id), step: 1,
    timerId: scheduleEvent(state.queue, us(.02), { type: "vacuum-tick", towerId: tower.id }, us(.02)) };
  for (const target of targets) {
    const legal = ogreBlastTarget(state, target);
    const source = { x: target.x, y: target.y };
    const sourceId = state.nextId++;
    scheduleEvent(state.queue, us(1), { type: "vacuum-carrier-expire", towerId: tower.id, sourceId, targetId: target.id,
      point: source, mana: 1000 });
    if (legal && !consumeEnemySpellShield(state, target)) stunEnemy(state, target, us(.5));
  }
  recordBattleAnimation(state, point, "staraura", "model-effect").durationUs = us(2);
}

function pulseVacuum(state: Match, towerId: number, timerId: number) {
  const tower = firingUnit(state, towerId);
  const vacuum = tower?.vacuum;
  if (!tower || vacuum?.timerId !== timerId) {
    cancelEvent(state.queue, timerId);
    return;
  }
  const registered = new Set(vacuum.targets);
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && registered.has(enemy.id)).sort((left, right) => left.id - right.id);
  if (vacuum.step <= 25) {
    const fraction = vacuum.step++ / 60;
    for (const enemy of targets) {
      displaceEnemy(state, enemy, {
        x: Math.min(map.bounds.maxX, Math.max(map.bounds.minX, enemy.x + (vacuum.point.x - enemy.x) * fraction)),
        y: Math.min(map.bounds.maxY, Math.max(map.bounds.minY, enemy.y + (vacuum.point.y - enemy.y) * fraction)),
      });
    }
    return;
  }
  delete tower.vacuum;
  cancelEvent(state.queue, timerId);
  const amount = 400 + 200 * (tower.hero?.ranks.A201 ?? 0);
  for (const enemy of targets) {
    if (state.phase !== "running" || !state.structures.includes(tower)) break;
    if (state.enemies.includes(enemy)) damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", "A201");
  }
}

function removeIonShell(state: Match, targetId: number) {
  const shell = state.ionShells?.[targetId];
  if (!shell) return;
  cancelEvent(state.queue, shell.timerId);
  delete state.ionShells![targetId];
}

function pulseIonShell(state: Match, targetId: number, timerId: number) {
  const shell = state.ionShells?.[targetId];
  if (shell?.timerId !== timerId) {
    cancelEvent(state.queue, timerId);
    return;
  }
  const tower = firingUnit(state, shell.towerId);
  const point = firingUnit(state, targetId) ?? shell.corpsePoint;
  if (!tower || !point) {
    removeIonShell(state, targetId);
    return;
  }
  const targets = state.enemies.filter(enemy => (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 600 ** 2)
    .sort((left, right) => left.id - right.id);
  for (const enemy of targets) {
    if (state.phase !== "running" || !state.structures.includes(tower)) break;
    if (state.enemies.includes(enemy) && targetable(enemy, ["ground", "air", "structure", "mechanical"], state.queue.nowUs))
      damageEnemy(state, tower, tower.templateId, enemy, shell.amount * .8, "magic", "A202");
  }
  if (--shell.remaining === 0 && state.ionShells?.[targetId] === shell) removeIonShell(state, targetId);
}

function replicateEnemies(state: Match, point: Point, rank: number) {
  const radius = 400 + 20 * rank;
  const targets = state.enemies.filter(enemy => enemy.hp > 0 && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= radius ** 2 &&
    !mapBoss(enemy) && !/^m(?:BOS|99[89]|5[0-7][1-3])$/.test(enemy.unitId) &&
    !enemy.abilities?.some(id => id === "Aloc" || id === "Avul")).sort((left, right) => left.id - right.id);
  for (const enemy of targets.slice(0, 4 + rank)) {
    const wave = waves.find(entry => entry.unitId === enemy.unitId);
    const stat = unitBalance.get(enemy.unitId);
    const oldBase = waves[enemy.wave - 1];
    const overdraftLife = enemy.overdraftLife ?? (oldBase ? oldBase.hp * .2 * (enemy.overdraftArmor ?? 0) : 0);
    const maximum = (enemy.maxHp ?? enemy.hp) - overdraftLife;
    if (overdraftLife > 0) {
      syncEnemyHealth(state, enemy);
      enemy.maxHp = maximum;
      enemy.hp = Math.min(enemy.hp, maximum);
      // A zero marker also prevents re-inferring this already removed bonus from legacy armor.
      enemy.overdraftLife = 0;
    }
    const abilities = enemyTemplateAbilities(enemy.unitId).filter(id => id !== "T202");
    const replica = spawn(state, { unitId: enemy.unitId, radius: wave?.radius ?? stat?.collision ?? enemy.radius,
      layer: wave?.layer ?? enemy.layer, speed: wave?.speed ?? stat?.spd ?? enemy.speed,
      armor: wave?.armor ?? stat?.def ?? null, mana: wave?.mana ?? stat?.manaN ?? 0, hp: Math.max(1, Math.trunc(maximum / 2)),
      points: enemy.points, wave: enemy.wave, abilities, replica: true }, false, enemy);
    scheduleEvent(state.queue, us(10), { type: "replica-expire", enemyId: replica.id });
    recordBattleAnimation(state, replica, "AZ_diangun01_F_fx2", "model-effect");
  }
}

function commitReversePolarity(state: Match, tower: Construction, rank: number, amount: number) {
  const radius = hasScepter(state, tower) ? Math.min(1400, 500 + Math.floor(.5 * combatAttributes(state, tower).STR)) : 500;
  const distance = (target: Point) => (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2;
  const victims = state.enemies.filter(enemy => enemy.hp > 0 && distance(enemy) <= radius ** 2)
    .sort((left, right) => left.id - right.id);
  const anchor = victims.reduce<Enemy | undefined>((best, enemy) => !best || distance(enemy) < distance(best) ? enemy : best, undefined);
  if (!anchor) return;
  for (const enemy of victims) {
    if (enemy.magnusPush) {
      cancelEvent(state.queue, enemy.magnusPush.timerId);
      delete enemy.magnusPush;
    }
    placeMagnusTarget(state, enemy, { x: anchor.x + 10 + Math.floor(roll(state) * 41),
      y: anchor.y + 10 + Math.floor(roll(state) * 41) });
  }
  const source = { x: anchor.x, y: anchor.y, id: state.nextId++ };
  scheduleEvent(state.queue, us(1), { type: "magnus-carrier-expire", sourceId: source.id, towerId: tower.id, skillId: "T199", rank });
  recordBattleAnimation(state, source, "T199", "model-effect");
  const targets = state.enemies.filter(enemy => (enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2 <= 300 ** 2)
    .sort((left, right) => left.id - right.id);
  for (const enemy of targets) {
    if (state.phase !== "running") break;
    if (!targetable(enemy, ["ground", "air", "structure", "mechanical"], state.queue.nowUs) || magicImmune(enemy) ||
        enemy.abilities?.some(id => id === "Avul" || id === "Aloc")) continue;
    stunEnemy(state, enemy, us(nativeControlHero(enemy) ? 1.6 : 2));
    damageEnemy(state, undefined, "q001", enemy, amount * .8, "magic", "A188", source);
  }
}

function settleOraclePromise(state: Match, tower: Construction) {
  const promise = tower.oraclePromise!;
  cancelEvent(state.queue, promise.timerId);
  delete tower.oraclePromise;
  const target = state.enemies.find(enemy => enemy.id === promise.targetId);
  if (!target && !promise.dead) return;
  const alive = target && target.hp > 0 && !promise.dead;
  if (alive) syncEnemyHealth(state, target);
  const loss = promise.initialHp - (alive ? target.hp : 0);
  if (loss <= 0) return;
  const point = alive ? target : tower;
  const radius = alive ? 425 : 500;
  const amount = loss * (hasScepter(state, tower) ? 2 : 1) * (alive ? 1 : 1.5);
  recordBattleAnimation(state, point, tower.templateId === "G064" ? "HAJT2" : "shenYuZhe", "model-effect").durationUs = us(1);
  const enemies = state.enemies.filter(enemy => (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= radius ** 2)
    .sort((left, right) => left.id - right.id);
  for (const enemy of enemies) {
    if (state.phase !== "running") return;
    if (!state.enemies.includes(enemy) || !targetable(enemy, ["ground", "air", "structure", "mechanical"], state.queue.nowUs)) continue;
    damageEnemy(state, tower, tower.templateId, enemy, amount, "divine", "A157");
  }
}

function pulseOraclePromise(state: Match, towerId: number, timerId: number) {
  const tower = firingUnit(state, towerId);
  const promise = tower?.oraclePromise;
  if (!tower || promise?.timerId !== timerId) {
    cancelEvent(state.queue, timerId);
    return;
  }
  const target = state.enemies.find(enemy => enemy.id === promise.targetId);
  if (!target && !promise.dead) {
    settleOraclePromise(state, tower);
    return;
  }
  if (target && target.hp > 0 && !promise.dead) {
    const now = state.queue.nowUs;
    delete target.decrepifyUntilUs;
    const sourceId = state.nextId++;
    const legal = ogreBlastTarget(state, target);
    scheduleEvent(state.queue, us(1), { type: "oracle-carrier-expire", towerId, sourceId, targetId: target.id, mana: legal ? 970 : 1000 });
    if (legal && !consumeEnemySpellShield(state, target)) {
      clearEnemyPositiveBuffs(target);
      const hero = nativeControlHero(target);
      const duration = us(hero ? 1 : 2);
      const untilUs = now + duration;
      target.purge = { middleUs: untilUs, endUs: untilUs, factor: 0 };
      for (const [phase, factor] of [[1, 1 / 3], [2, 2 / 3], [3, 1]]) {
        scheduleEvent(state.queue, Math.round(duration * phase / 3), { type: "oracle-purge-step", enemyId: target.id, untilUs, factor });
      }
      if (!hero) {
        target.oraclePauseUntilUs = now + us(3);
        interruptEnemyCast(state, target);
        scheduleEvent(state.queue, us(3), { type: "oracle-pause-end", enemyId: target.id, untilUs: target.oraclePauseUntilUs });
      }
    }
  }
  if (--promise.remaining === 0) settleOraclePromise(state, tower);
}

function resolveCalldown(state: Match, event: Extract<MatchEvent, { type: "calldown" }>, timerId: number) {
  const tower = firingUnit(state, event.towerId);
  if (!tower?.calldown || tower.calldown[event.stage] !== timerId) return;
  delete tower.calldown[event.stage];
  if (!Object.keys(tower.calldown).length) delete tower.calldown;
  const now = state.queue.nowUs;
  const { point } = event;
  const first = event.stage === "first";
  const rank = tower.hero?.ranks.A197 || 1;
  const raw = heroSpells.A197.damage[rank - 1] * (first ? 1 : 1.5);
  scheduleEvent(state.queue, 0, { type: "calldown-damage", source: { x: tower.x, y: tower.y, id: tower.id },
    sourceTemplate: tower.templateId, point, amount: raw });
  if (first) {
    recordBattleAnimation(state, point, tower.templateId === "G080" ? "jijie" : "calldown_4", "model-effect");
    recordBattleAnimation(state, point, "calldown_flydown", "model-effect");
  }
  recordBattleAnimation(state, point, "VolcanoMissile", "model-effect");
  const victims = state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 600 ** 2).sort((a, b) => a.id - b.id);
  const untilUs = now + us(first ? 2 : 5);
  for (const enemy of victims) {
    const sourceId = state.nextId++;
    const legal = ogreBlastTarget(state, enemy) && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 500 ** 2;
    scheduleEvent(state.queue, us(2), { type: "calldown-carrier-expire", sourceId, towerId: tower.id,
      skillId: first ? "T218" : "T219", targetId: enemy.id, mana: legal ? 999 : 1000 });
    if (!legal || consumeEnemySpellShield(state, enemy)) continue;
    enemy.calldownSlow = { untilUs, factor: first ? .5 : .8 };
    scheduleEvent(state.queue, untilUs - now, { type: "calldown-slow-end", enemyId: enemy.id, untilUs });
  }
}

function commitCalldownDamage(state: Match, event: Extract<MatchEvent, { type: "calldown-damage" }>) {
  const owner = firingUnit(state, event.source.id);
  for (const enemy of [...state.enemies].sort((a, b) => a.id - b.id)) {
    if (state.phase !== "running") return;
    if (!state.enemies.includes(enemy) || !targetable(enemy, ["ground", "air", "mechanical", "structure"], state.queue.nowUs) ||
        (enemy.x - event.point.x) ** 2 + (enemy.y - event.point.y) ** 2 > 600 ** 2) continue;
    damageEnemy(state, owner, event.sourceTemplate, enemy, event.amount * .8, "magic", "A197", owner ?? event.source);
  }
}

function releaseStormHammers(state: Match, tower: Construction, point: Point, skillId: "A061" | "A119" | "A128", damage: number) {
  const visual = skillId === "A119" ? "T129" : skillId === "A128" ? "T148" : "T055";
  const now = state.queue.nowUs;
  const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
    (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 400 ** 2).sort((a, b) => a.id - b.id);
  for (const enemy of targets) {
    if (!organicWaveTarget(state, enemy) || !canSeeEnemy(state, enemy)) continue;
    const sourceId = state.nextId++;
    const origin = { x: tower.x, y: tower.y };
    const distance = (enemy.x - origin.x) ** 2 + (enemy.y - origin.y) ** 2;
    if (distance <= 2000 ** 2) {
      launchTrackingProjectile(state, { type: "storm-hammer", towerId: tower.id, sourceId, targetId: enemy.id,
        skillId, visual, position: origin, expiresUs: now + us(1), travelUs: 0, damage }, enemy);
    }
    state.nextId++;
    if (distance <= 5000 ** 2 && !consumeEnemySpellShield(state, enemy)) {
      enemy.stormHammerMarkUntilUs = now + us(5);
      recordBattleAnimation(state, enemy, "B144", "model-effect");
    }
  }
}

function resolveStormHammer(state: Match, event: Extract<MatchEvent, { type: "storm-hammer" }>) {
  const enemy = state.enemies.find(unit => unit.id === event.targetId);
  if (!enemy || !organicWaveTarget(state, enemy) || !trackingProjectileArrived(state, event, enemy) ||
      consumeEnemySpellShield(state, enemy)) return;
  stunEnemy(state, enemy, us(2));
  if (event.visual === "T129") enemy.stormHammerMarkUntilUs = Math.max(enemy.stormHammerMarkUntilUs ?? 0, state.queue.nowUs + us(2));
  recordBattleAnimation(state, enemy, event.visual, "model-effect");
  damageEnemy(state, firingUnit(state, event.towerId), "q001", enemy, event.damage * .8, "magic", event.skillId,
    { ...event.position, id: event.sourceId });
}

function resolveDoomProjectile(state: Match, event: DoomProjectile) {
  const owner = firingUnit(state, event.towerId);
  const now = state.queue.nowUs;
  if (event.spell === "T178") {
    if (!owner || (owner.life?.hp ?? 1) <= 0 || now > (event.expiresUs ?? Infinity) || !trackingProjectileArrived(state, event, owner)) return;
    syncMana(state, owner);
    owner.mana = Math.min(owner.manaMaximum!, owner.mana! + event.mana);
    return;
  }
  const enemy = state.enemies.find(unit => unit.id === event.targetId);
  if (!enemy || now > (event.expiresUs ?? Infinity) || !organicWaveTarget(state, enemy) ||
      !trackingProjectileArrived(state, event, enemy) || consumeEnemySpellShield(state, enemy)) return;
  if (event.spell === "A200") {
    if (event.remaining === 10) stunEnemy(state, enemy, us(.1));
    if (!owner) return;
    const rank = owner.hero?.ranks.A200 ?? 0;
    const staff = hasScepter(state, owner);
    const amount = rank * (combatAttributes(state, owner).INT + 100) * (staff ? 2 : 1);
    const center = { x: enemy.x, y: enemy.y };
    const victims = staff ? state.enemies.filter(unit => organicWaveTarget(state, unit) &&
      (unit.x - center.x) ** 2 + (unit.y - center.y) ** 2 <= 300 ** 2).sort((a, b) => a.id - b.id) : [enemy];
    for (const victim of victims) {
      if (state.phase !== "running") return;
      damageEnemy(state, owner, owner.templateId, victim, amount * .8, "magic", "A200");
    }
    if (state.phase !== "running") return;
    if (state.enemies.includes(enemy) && !consumeEnemySpellShield(state, enemy)) {
      enemy.lichChainSlow = { factor: .7, attackPenalty: .25, untilUs: now + us(2) };
    }
    const next = event.remaining > 1 ? state.enemies.filter(unit => unit.hp > 0 && unit.id !== enemy.id &&
      (unit.x - center.x) ** 2 + (unit.y - center.y) ** 2 <= 600 ** 2).sort((a, b) => a.id - b.id)[0] : undefined;
    if (next && organicWaveTarget(state, next) && canSeeEnemy(state, next)) {
      const source = { ...center, id: state.nextId++ };
      launchTrackingProjectile(state, { ...event, targetId: next.id, source, position: source,
        remaining: event.remaining - 1 }, next);
    }
    return;
  }
  if (event.spell === "T302") {
    stunEnemy(state, enemy, us(.1));
    if (!owner) return;
    const rank = owner.hero?.ranks.T302 ?? 0;
    syncEnemyMana(state, enemy);
    const drained = Math.min(Math.max(0, enemy.mana), 100 * rank);
    enemy.mana -= drained;
    const mana = event.mana + drained;
    const visited = [...event.visited, enemy.id];
    const amount = 2000 * rank * visited.length * (enemy.stoneGaze ? 2 : 1);
    damageEnemy(state, owner, owner.templateId, enemy, amount * .8, "magic", "T302");
    if (state.phase !== "running") return;
    const next = visited.length < 7 ? state.enemies.filter(unit => unit.hp > 0 && !visited.includes(unit.id) &&
      (unit.x - enemy.x) ** 2 + (unit.y - enemy.y) ** 2 <= 600 ** 2).sort((left, right) => left.id - right.id)[0] : undefined;
    const source = { x: enemy.x, y: enemy.y, id: state.nextId++ };
    if (next) {
      if (organicWaveTarget(state, next) && canSeeEnemy(state, next)) {
        launchTrackingProjectile(state, { ...event, source, position: source, targetId: next.id,
          expiresUs: now + us(1), visited, mana }, next);
      }
    } else {
      launchTrackingProjectile(state, { ...event, source, position: source, spell: "T178", targetId: owner.id,
        expiresUs: now + us(10), mana }, owner);
    }
  } else if (event.spell === "T303") {
    stunEnemy(state, enemy, us(event.stun));
    const rank = owner?.hero?.ranks.T303;
    if (rank) damageEnemy(state, owner, "q035", enemy, Math.max(0, 2000 * (rank + 2 - event.stun)) * .8, "magic", "T303", event.source);
  } else if (event.spell === "T230") {
    enemy.doomWave = { amount: 10 + 10 * event.rank, untilUs: now + us(4) };
  } else {
    stunEnemy(state, enemy, us(.01));
    if (owner) damageEnemy(state, owner, owner.templateId, enemy, event.damage * .8, "magic", "T328");
  }
}

function freezingTarget(state: Match, enemy: Enemy, buildings: boolean) {
  return targetable(enemy, buildings ? ["ground", "air", "structure", "mechanical"] : ["ground", "air", "mechanical"], state.queue.nowUs) &&
    !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Aloc" || id === "Avul");
}

function pulseFreezingField(state: Match, fieldId: number, index: number) {
  const field = state.freezingFields?.[fieldId];
  const tower = field && state.structures.find(unit => unit.id === field.towerId);
  if (!field || tower?.freezingFieldId !== fieldId) return;
  let visualSeed = (Math.imul(fieldId, 73856093) ^ Math.imul(index, 19349663)) >>> 0;
  const visualRoll = () => (visualSeed = (Math.imul(visualSeed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const count = [5, 5, 6, 6, 7, 7][field.rank - 1];
  for (let shard = 0; shard < 2 * count - 1; shard++) {
    const angle = visualRoll() * 2 * Math.PI;
    const radius = Math.sqrt(visualRoll()) * 800;
    recordBattleAnimation(state, { x: field.point.x + Math.cos(angle) * radius, y: field.point.y + Math.sin(angle) * radius },
      shard < count ? "q015" : "q001", "ice-shard");
  }
  const candidates = state.enemies.filter(enemy => freezingTarget(state, enemy, true) &&
    (enemy.x - field.point.x) ** 2 + (enemy.y - field.point.y) ** 2 <= 800 ** 2).sort((a, b) => a.id - b.id);
  const amount = Math.min(heroSpells.A016.damage[field.rank - 1], 9_999_999 / candidates.length);
  for (const enemy of candidates) {
    if (state.phase !== "running" || tower.freezingFieldId !== fieldId) break;
    if (!state.enemies.includes(enemy) || !freezingTarget(state, enemy, true)) continue;
    damageEnemy(state, tower, "q015", enemy, amount * .8, "magic", "A016", { ...field.point, id: fieldId });
  }
}

function endFreezingField(state: Match, fieldId: number) {
  const field = state.freezingFields?.[fieldId];
  if (!field) return;
  delete state.freezingFields![fieldId];
  const tower = state.structures.find(unit => unit.id === field.towerId);
  if (tower?.freezingFieldId === fieldId) stopTowerCast(state, tower);
}

function resolveFreezingScepter(state: Match, event: Extract<MatchEvent, { type: "freezing-scepter" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!target || !freezingTarget(state, target, false) || !canSeeEnemy(state, target) ||
      !trackingProjectileArrived(state, event, target)) return;
  stunEnemy(state, target, us(nativeControlHero(target) ? .8 : 1.4));
  const owner = state.structures.find(unit => unit.id === event.towerId);
  damageEnemy(state, owner, "q001", target, heroSpells.A017.damage[event.rank - 1] * 2 * .8,
    "magic", "T063", { ...event.source, id: event.sourceId });
}

function ogreBlastTarget(state: Match, enemy: Enemy) {
  return targetable(enemy, ["ground", "air", "mechanical"], state.queue.nowUs) &&
    canSeeEnemy(state, enemy) && !magicImmune(enemy) && !enemy.abilities?.some(id => id === "Aloc" || id === "Avul");
}

function sendOgreBlast(state: Match, tower: Construction, target: Enemy, rank: number, extra: boolean) {
  const sourceId = extra ? state.nextId++ : undefined;
  if (!ogreBlastTarget(state, target) || (target.x - tower.x) ** 2 + (target.y - tower.y) ** 2 > (extra ? 2000 : 800) ** 2 ||
      consumeEnemySpellShield(state, target)) return;
  const source = { x: tower.x, y: tower.y };
  launchTrackingProjectile(state, { type: "ogre-projectile", towerId: tower.id, targetId: target.id, rank,
    source, position: { ...source }, ...(sourceId === undefined ? {} : { sourceId, expiresUs: state.queue.nowUs + us(2) }), travelUs: 0 }, target);
}

function repeatOgreBlast(state: Match, event: Extract<MatchEvent, { type: "ogre-repeat" }>) {
  const tower = state.structures.find(unit => unit.id === event.towerId);
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  if (!tower || !target || target.hp <= 0 || !event.remaining) return;
  const rank = tower.hero?.ranks.A058;
  if (rank) sendOgreBlast(state, tower, target, rank, true);
  scheduleEvent(state.queue, us(.6), { ...event, remaining: event.remaining - 1 });
}

function resolveOgreBlast(state: Match, event: Extract<MatchEvent, { type: "ogre-projectile" }>) {
  const tower = state.structures.find(unit => unit.id === event.towerId);
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const temporary = event.sourceId !== undefined;
  if ((!tower && !temporary) || !target || !ogreBlastTarget(state, target) || !trackingProjectileArrived(state, event, target)) return;
  stunEnemy(state, target, us(nativeControlHero(target) ? .6 : .8 + event.rank * .2));
  const source = temporary ? { ...event.source, id: event.sourceId! } : tower;
  damageEnemy(state, tower, temporary ? "q001" : tower!.templateId, target, heroSpells.A058.damage[event.rank - 1] * .8,
    "magic", "A058", source);
}

function resolveWraithProjectile(state: Match, event: Extract<MatchEvent, { type: "wraith-projectile" }>) {
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const now = state.queue.nowUs;
  if (!target || !mapBoss(target) || !targetable(target, ["ground", "air"], now) || magicImmune(target) ||
      target.abilities?.some(id => id === "Aloc" || id === "Avul") ||
      !trackingProjectileArrived(state, event, target) || consumeEnemySpellShield(state, target)) return;
  const duration = us(1.5 + event.rank * .5);
  target.wraithMarkUntilUs = now + duration;
  interruptEnemyCast(state, target);
  scheduleEvent(state.queue, duration, { type: "stun-expire", enemyId: target.id });
  recordBattleAnimation(state, event.source, "q001", "spell-link", target);
}

function resolveBoulderProjectile(state: Match, event: Extract<MatchEvent, { type: "boulder-projectile" }>) {
  const tower = state.structures.find(unit => unit.id === event.towerId);
  const target = state.enemies.find(enemy => enemy.id === event.targetId);
  const carrier = event.sourceId !== undefined;
  if ((!tower && !carrier) || !target || !nativeControlTarget(state, target, "boulder", carrier) ||
      !trackingProjectileArrived(state, event, target)) return;
  if (unitTargetType.get(target.unitId) !== "structure") {
    stunEnemy(state, target, us(nativeControlHero(target) ? event.heroStun : event.stun));
  }
  const source = event.sourceId === undefined ? tower : { ...event.source, id: event.sourceId };
  damageEnemy(state, tower, carrier ? "q001" : tower!.templateId, target, event.amount * .8, "magic", event.skillId, source);
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
    if (tower.heroSpellReady?.A093 !== undefined) tower.heroSpellReady.A093 = adjustedSpellCooldown(state, tower, tower.heroSpellReady.A093, 0, "A093");
  }
}

function targetWaveIntervals(sweep: SpellSweep, enemy: Enemy) {
  const span = enemy.routeSpan;
  if (!span) {
    const contact = waveContact(sweep, enemy);
    return contact ? [contact] : [];
  }
  const length = span.untilUs - span.fromUs;
  const velocity = length === 0 ? { x: 0, y: 0 } : {
    x: (span.to.x - span.from.x) * 1_000_000 / length,
    y: (span.to.y - span.from.y) * 1_000_000 / length,
  };
  return movingWaveContacts(sweep, { fromUs: span.fromUs - sweep.startedUs!, untilUs: span.untilUs - sweep.startedUs!,
    position: length === 0 ? span.to : span.from, velocity });
}

function rescheduleSweepContact(state: Match, enemy: Enemy) {
  const now = state.queue.nowUs;
  for (const event of state.queue.pending.filter(({ payload }) => payload.type === "spell-sweep")) {
    const { payload } = event;
    if (payload.type !== "spell-sweep") continue;
    const { sweep } = payload;
    if (sweep.startedUs === undefined || sweep.hit.includes(enemy.id)) continue;
    const interval = targetWaveIntervals(sweep, enemy).find(([, exit]) => sweep.startedUs! + exit >= now);
    if (!interval) continue;
    const due = Math.max(now, sweep.startedUs + interval[0]);
    if (due >= event.dueUs) continue;
    cancelEvent(state.queue, event.timerId);
    scheduleEvent(state.queue, due - now, payload);
  }
}

function* advanceSpellSweep(state: Match, sweep: SpellSweep, order: number): Generator<void> {
  const tower = state.structures.find(entry => entry.id === sweep.towerId && (!entry.pending || entry.pending.upgradeTo));
  if (!tower && sweep.sourceId === undefined || sweep.name === "A082" && !state.ghostFleets?.[sweep.sourceId!]) return;
  const now = state.queue.nowUs;
  if (sweep.aim) {
    if (!tower) return;
    Object.assign(sweep, { x: tower.x, y: tower.y, ...spellDirection(tower, sweep.aim) });
    delete sweep.aim;
  }
  // Older checkpoints saved distance at the preceding look-ahead step.
  sweep.startedUs ??= now - us(sweep.traveled / sweep.speed);
  sweep.order ??= order;
  if (state.movementAnchorUs === undefined) {
    const movement = state.queue.pending.find(entry => entry.payload.type === "movement");
    if (movement && state.enemies.some(enemy => movementRate(enemy) > 0)) {
      state.movementAnchorUs = movement.dueUs;
      yield* publishEnemyRoutes(state);
    }
  }
  const elapsed = now - sweep.startedUs;
  const duration = us(sweep.range / sweep.speed);
  const distance = Math.min(sweep.range, elapsed * sweep.speed / 1_000_000);
  const point = { x: sweep.x + sweep.dx * distance, y: sweep.y + sweep.dy * distance };
  const organic = sweep.lightCarrier !== undefined || sweep.name === "A223" || sweep.name === "N017" || sweep.name === "N018" || sweep.name === "N019" || sweep.name === "A001" || sweep.name === "A162";
  const targets = sweep.targets ?? ["ground", "air", "structure"];
  const eligible = (enemy: Enemy) => organic ? organicWaveTarget(state, enemy) && (sweep.name !== "A162" || canSeeEnemy(state, enemy)) :
    sweep.tide?.excludeId !== enemy.id && (sweep.name !== "A064" || canSeeEnemy(state, enemy)) && targetable(enemy, targets, now) && !magicImmune(enemy) &&
    !enemy.abilities?.some(id => id === "Aloc" || id === "Avul");
  const contacts = state.enemies.filter(enemy => {
    if (sweep.hit.includes(enemy.id) || !eligible(enemy)) return false;
    return targetWaveIntervals(sweep, enemy).some(([entry, exit]) => entry <= elapsed && elapsed <= exit);
  }).sort((left, right) => left.id - right.id);
  if (sweep.name === "A074" && contacts.length) {
    const source = { ...point, id: sweep.sourceId! };
    const victims = state.enemies.filter(enemy => eligible(enemy) &&
      (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 <= 300 ** 2).sort((a, b) => a.id - b.id);
    for (const enemy of victims) {
      if (state.phase !== "running") break;
      if (state.enemies.includes(enemy) && eligible(enemy)) damageEnemy(state, tower, "q001", enemy, sweep.amount * .8, "magic", "A074", source);
    }
    recordBattleAnimation(state, point, "StampedeMissileDeath", "model-effect");
    return;
  }
  for (const enemy of contacts) {
    if (state.phase !== "running" || sweep.budget === 0) return;
    if (!state.enemies.includes(enemy) || !eligible(enemy)) continue;
    sweep.hit.push(enemy.id);
    if (sweep.tide) {
      if (tower) damageEnemy(state, tower, "q054", enemy, sweep.amount, "magic", "T277",
        { ...point, id: sweep.sourceId!, ...(sweep.name === "A217" && { tideRank: sweep.tide.rank }) });
      continue;
    }
    if (sweep.slow !== undefined) {
      if (sweep.budget !== undefined) sweep.budget -= Math.min(sweep.amount, sweep.budget);
      const owner = state.structures.find(entry => entry.id === sweep.towerId && (!entry.pending || entry.pending.upgradeTo));
      if (owner && !consumeEnemySpellShield(state, enemy)) {
        const rank = owner.hero?.ranks.A170 ?? 1;
        const slow = sweep.name === "A170" ? .20 + (rank >= 1 && rank <= 6 ? rank : 1) * .05 : sweep.slow;
        enemy.frost = { factor: 1 - slow, expiresUs: now + us(5) };
        scheduleEvent(state.queue, us(5), { type: "frost-expire", enemyId: enemy.id });
      }
      continue;
    }
    const damage = Math.min(sweep.amount, sweep.budget ?? Infinity);
    if (sweep.lightCarrier) {
      sweep.budget! -= damage;
      if (damage > 0) {
        damageEnemy(state, tower, sweep.lightCarrier, enemy, damage * .8, "magic", sweep.name,
          { ...point, id: sweep.sourceId! });
      } else if (tower && !enemy.oracleEdict) {
        blindLightTarget(state, enemy);
      }
      continue;
    }
    if (damage <= 0) return;
    if (sweep.budget !== undefined) sweep.budget -= damage;
    const owner = state.structures.find(entry => entry.id === sweep.towerId && (!entry.pending || entry.pending.upgradeTo));
    if (sweep.sourceId === undefined && !owner) return;
    if (sweep.name === "A186") {
      damageEnemy(state, owner, "q041", enemy, damage * .8, "magic", sweep.name, { x: sweep.x, y: sweep.y, id: sweep.sourceId! });
    } else if (sweep.name === "A223") {
      recordBattleAnimation(state, enemy, "T297", "model-effect").durationUs = us(.5);
      damageEnemy(state, owner, "q057", enemy, damage * .8, "magic", "A223", { ...point, id: sweep.sourceId! });
    } else if (sweep.name === "A162") {
      damageEnemy(state, owner, "q033", enemy, damage * .8, "magic", sweep.name,
        { x: sweep.x, y: sweep.y, id: sweep.sourceId!, powershotIndex: sweep.hit.length - 1 });
    } else if (sweep.name === "A008") {
      damageEnemy(state, owner, "q006", enemy, damage * .8, "magic", "A008", { x: sweep.x, y: sweep.y, id: sweep.sourceId! });
    } else if (sweep.name === "A001") {
      damageEnemy(state, owner, "q014", enemy, damage * .8, "magic", sweep.name, { x: sweep.x, y: sweep.y, id: sweep.sourceId! });
    } else if (sweep.name === "A082") {
      damageEnemy(state, owner, "q022", enemy, damage * .8, "magic", "A082", { ...point, id: sweep.sourceId! });
    } else if (sweep.name === "A076") {
      damageEnemy(state, owner, "q017", enemy, damage * .8, "magic", sweep.name, { ...point, id: sweep.sourceId! });
    } else if (sweep.name === "i322") {
      damageEnemy(state, owner, "q018", enemy, damage * .8, "magic", "i322",
        { ...point, id: sweep.sourceId ?? sweep.towerId });
    } else {
      const actual = sweep.sourceId === undefined ? owner : { x: sweep.x, y: sweep.y, id: sweep.sourceId };
      const raw = sweep.name === "A152" || sweep.name === "A170" ? damage : damage * .8;
      damageEnemy(state, owner, sweep.sourceId === undefined ? owner!.templateId : "q001", enemy, raw, "magic", sweep.name, actual);
    }
  }
  if (state.phase !== "running" || sweep.budget === 0) return;
  let next = elapsed < duration ? sweep.startedUs + duration : Infinity;
  for (const enemy of state.enemies) {
    if (sweep.hit.includes(enemy.id) || !eligible(enemy)) continue;
    const interval = targetWaveIntervals(sweep, enemy).find(([, exit]) => exit >= elapsed);
    if (interval) next = Math.min(next, Math.max(now, sweep.startedUs + interval[0]));
  }
  if (elapsed >= duration && next !== now) return;
  // Route boundary callbacks re-query only their changed unit. The regular
  // movement anchor also refreshes eligibility for the whole wave.
  const movement = state.queue.pending.find(event => event.payload.type === "movement");
  if (movement) next = Math.min(next, movement.dueUs);
  sweep.traveled = distance;
  scheduleEvent(state.queue, next - now, { type: "spell-sweep", sweep });
}

function launchMarchRobot(state: Match, event: Extract<MatchEvent, { type: "march-robot-launch" }>) {
  const { point, direction, index, amount, towerId, sourceId } = event;
  const offset = -450 + 900 * (index % 24) / 23;
  const { x: dx, y: dy } = direction;
  const origin = { x: point.x - dx * 450 - dy * offset, y: point.y - dy * 450 + dx * offset };
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: { ...origin, dx, dy, towerId, sourceId, name: "A074",
    speed: 700, range: 900, radiusStart: 50, radiusEnd: 50, amount, traveled: 0, hit: [], targets: ["ground", "structure"] } });
  if (index < 143) scheduleEvent(state.queue, us((index + 1) / 24) - us(index / 24), { ...event, index: index + 1 });
}

function fireTinkerLaser(state: Match, tower: Construction, target: Enemy) {
  const path = [target];
  if (hasScepter(state, tower)) {
    const visited = new Set([target.id]);
    while (path.length < 50) {
      const end = path.at(-1)!;
      const next = state.enemies.filter(enemy => enemy.hp > 0 && !visited.has(enemy.id) &&
        (enemy.x - end.x) ** 2 + (enemy.y - end.y) ** 2 <= 400 ** 2).sort((a, b) => a.id - b.id)[0];
      if (!next) break;
      visited.add(next.id);
      path.push(next);
    }
  }
  let previous: Point = tower;
  for (const enemy of path) {
    if (state.phase !== "running") return;
    const source = { x: previous.x, y: previous.y, id: state.nextId++ };
    previous = enemy;
    if (!state.enemies.includes(enemy) || !organicWaveTarget(state, enemy) || !canSeeEnemy(state, enemy) ||
        (enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2 > 1300 ** 2 || consumeEnemySpellShield(state, enemy)) continue;
    recordBattleAnimation(state, source, "T067", "spell-link", enemy);
    damageEnemy(state, tower, "q016", enemy, 1, "magic", "A073", source);
  }
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
  const equipmentHaste = ((tower.bladeStormHasteUs ?? 0) > now ? .8 : 0) + (tower.bearFrenzyBonus ?? tower.bearFrenzy?.amount ?? 0) + (nearbyEquipment(state, tower, ["i217"], 800) ? .20 : 0) +
    (nearbyEquipment(state, tower, ["i228"], 800) ? .10 : 0) + (hasBattleBanner(state, tower) ? .50 : 0) +
    (tower.summon?.speed ?? 0) + ((tower.strafeUntilUs ?? -1) >= now ? 1.5 : 0) +
    ((tower.axeBloodlustUntilUs ?? 0) > now ? .9 : 0);
  const frenzy = (tower.frenzyUntilUs ?? -1) >= now ? tower.frenzyAmount ?? 0 : 0;
  const training = tower.attackSpeedTrainingRank ? [.20, .35, .50, .65, .80, 1][tower.attackSpeedTrainingRank - 1] : 0;
  const form = tower.hero?.divineForm;
  const divineSpeed = form?.id === "P214" ? divineField(form.id, "DataA", form.stars) :
    form?.id === "P215" ? divineField("T114", "DataA", form.stars) : 0;
  return gear.reduce((total, item) => total + (equipmentAttackSpeed.get(item.itemId) ?? 0),
    equipmentHaste + frenzy + training + divineSpeed + ((tower.runeBuffs?.i721 ?? -1) >= now ? .5 : 0) +
    nightHunterBonus(tower.nightHunter?.speedRank, nightSpeed));
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
  const fleetAura = state.ghostFleets ? state.structures.reduce((max, source) => {
    const aura = source.fleetAura;
    return aura && aura.untilUs > now && !source.pending && (source.life?.hp ?? 1) > 0 &&
      (source.x - tower.x) ** 2 + (source.y - tower.y) ** 2 <= 600 ** 2 ? Math.max(max, aura.layers) : max;
  }, 0) : 0;
  const bloodlust = tower.bloodlust && tower.bloodlust.untilUs > now && !towerSpellImmune(tower, now) ? tower.bloodlust.amount : 0;
  const doomBloodlust = tower.doomBloodlust && tower.doomBloodlust.untilUs > now ? tower.doomBloodlust.amount : 0;
  const press = tower.pressTheAttack && tower.pressTheAttack.untilUs > now ? .6 + .1 * tower.pressTheAttack.rank : 0;
  const berserk = tower.berserkerBlood?.tier ? berserkerAttackSpeed[tower.berserkerBlood.tier - 1] : 0;
  const beastmasterRanks = [.15, .20, .25, .30, .35, .40];
  const personalRank = tower.hero?.ranks.A216 ?? tower.summon?.beastmasterHasteRank ?? 0;
  const surroundingRank = state.structures.reduce((rank, source) => {
    const learned = source.hero?.ranks.A216 ?? 0;
    return learned > rank && !source.pending && (source.life?.hp ?? 1) > 0 &&
      (source.x - tower.x) ** 2 + (source.y - tower.y) ** 2 <= 900 ** 2 ? learned : rank;
  }, 0);
  const beastmasterSpeed = (beastmasterRanks[personalRank - 1] ?? 0) + (beastmasterRanks[surroundingRank - 1] ?? 0);
  return 1 + .002 * agility + weaponSpeedBonus(state, tower, gear) + endurance + bloodlust + doomBloodlust + .05 * fleetAura + press + berserk +
    (tower.overpower ? 5 : 0) + (tower.focusFire ? 5 : 0) + (tower.sleight ? 5 : 0) + beastmasterSpeed - clapSlow - untouchableSlow -
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
  } else if (effect === "thunderClap" || effect === "untouchable" || effect === "bloodlust" || effect === "doomBloodlust" || effect === "fleetAura" || effect === "overpower" || effect === "pressTheAttack" || effect === "focusFire") {
    if (tower[effect]?.untilUs !== expiresUs) return;
    delete tower[effect];
  } else {
    if (tower[effect] !== expiresUs) return;
    delete tower[effect];
    if (effect === "frenzyUntilUs") delete tower.frenzyAmount;
  }
  weaponRatesDirty.add(state);
}

function applyOverpower(state: Match, tower: Construction, skillId: "T007" | "T144", rank: number) {
  const sourceId = state.nextId++;
  scheduleEvent(state.queue, us(.5), { type: "ursa-carrier-expire", sourceId, towerId: tower.id,
    skillId, rank, mana: 1000, point: { x: tower.x, y: tower.y } });
  if (towerSpellImmune(tower, state.queue.nowUs)) return;
  const untilUs = state.queue.nowUs + us([2, 2, 3, 3, 4, 4][rank - 1]);
  tower.overpower = { untilUs, sourceId, rank };
  scheduleWeaponRateEnd(state, tower, "overpower", untilUs);
}

function weaponCycleUs(tower: Construction, weapon: Weapon, gear: Item[]) {
  const reduction = tower.summon?.intervalReduction ?? (gear.some(item => item.itemId === "i304") ? .2 : 0);
  return Math.max(1, us(Math.max(0, (tower.bearFormInterval?.seconds ?? weapon.cooldown) - reduction -
    (tower.wispLinked ? .1 : 0) - (tower.bear?.scepter ? .2 : 0))) - (tower.focusCycleReductionUs ?? 0) - (tower.sleight?.cycleDeltaUs ?? 0));
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

function reserveFlakRound(state: Match, tower: Construction) {
  const active = tower.flak;
  if (!active || tower.summon?.illusion) return;
  if (active.remaining === 0) {
    cancelEvent(state.queue, active.timerId);
    delete tower.flak;
    return;
  }
  active.remaining--;
  return active.timerId;
}

function startWeapon(state: Match, tower: Construction) {
  const now = state.queue.nowUs;
  if (tower.pending || tower.attack?.winding || tower.attack?.timing?.cooldown ||
    now < Math.max(tower.attack?.readyUs ?? 0, tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) return;
  const slots = weapons[tower.templateId];
  if (!slots?.length) return;
  if (tower.spiritOrder) {
    const order = tower.spiritOrder;
    const enemy = !order.move && state.enemies.find(unit => unit.id === order.targetId && canSeeEnemy(state, unit));
    if (enemy && inWeaponRange(tower, enemy, slots[0], 0, false, now)) beginWeaponTiming(state, tower, slots[0], [], enemy, enemy.id);
    return;
  }
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
  const flame = attackOrb(tower);
  const manual = flame && state.enemies.find(enemy => enemy.id === tower.flameTarget &&
    flameWeapon(state, tower, enemy, flame));
  if (!manual) delete tower.flameTarget;
  for (const spell of towerSpells.get(tower.templateId) ?? []) {
    if ((spell.effect.kind === "wolves" || spell.effect.kind === "sword-rain") &&
      tower.autoModes?.[spell.id] !== false && beginTowerSpell(state, tower, spell.id, true).ok) return;
  }
  const focus = state.enemies.find(enemy => enemy.id === tower.focusTarget && canSeeEnemy(state, enemy) &&
    slots.some(slot => inWeaponRange(tower, enemy, slot, weaponRange(slot, gear, tower), false, now)));
  if (!focus) delete tower.focusTarget;
  const current = manual || focus || state.enemies.find(enemy => enemy.id === (tower.tauntedTarget ?? tower.attack?.targetId));
  if (!current && tower.tauntedTarget !== undefined) delete tower.tauntedTarget;
  let target: Enemy | undefined;
  let weapon: Weapon | undefined;
  for (const enemy of commanded ? [commanded] : current ? [current, ...state.enemies] : state.enemies) {
    if (!canSeeEnemy(state, enemy)) continue;
    weapon = enemy === manual && flame ? flameWeapon(state, tower, enemy, flame) :
      slots.find(slot => inWeaponRange(tower, enemy, slot, weaponRange(slot, gear, tower), false, now));
    if (weapon) {
      target = enemy;
      break;
    }
  }
  if (target && weapon) {
    const book = necromancyPriority.find(id => gear.some(item => item.itemId === id));
    if (book && tower.autoModes?.[book] !== false) useNecromancy(state, tower, book);
    for (const id of mirrorItems) {
      if (gear.some(item => item.itemId === id) && tower.autoModes?.[id] !== false) useMirror(state, tower, id);
    }
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
  let flakToken = reserveFlakRound(state, tower);
  const hero = tower.hero;
  if (hero && !manual) {
    let focusOrdered = false;
    for (const skillId of heroAutoCastOrder) {
      if ((skillId === "A221" || skillId === "A222") && hero.ranks[skillId] && tower.autoModes?.[skillId] !== false &&
          now >= (tower.heroSpellReady?.[skillId] ?? 0) && !state.enemies.some(enemy => enemy.hp > 0 &&
            (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 600 ** 2)) break;
      if (((skillId === "A010" || skillId === "A239") && tower.dragonShape || skillId === "A110" && tower.alchemistShape ||
          skillId === "A169" && tower.lycanShape) &&
          hero.ranks[skillId] && tower.autoModes?.[skillId] !== false &&
          now >= (tower.heroSpellReady?.[skillId] ?? 0)) {
        syncMana(state, tower);
        if (tower.mana! >= heroSpells[skillId].mana[hero.ranks[skillId] - 1]) break;
      }
      const actual = skillId === "A217" && tower.tideWaveScepter ? "A218" : skillId;
      if (hero.ranks[skillId] && tower.autoModes?.[skillId] !== false &&
          beginHeroSpell(state, tower, actual, true, skillId === "A160" || skillId === "A217" || skillId === "A224" ? { targetId: target.id } : undefined).ok) {
        if (skillId === "A196") {
          flakToken = reserveFlakRound(state, tower);
          break;
        }
        if (skillId === "A163") {
          focusOrdered = true;
          continue;
        }
        if (skillId !== "A024" && skillId !== "A037" && skillId !== "A043" && skillId !== "A126") return;
      }
    }
    if (focusOrdered) return;
  }
  for (const spell of towerSpells.get(tower.templateId) ?? []) {
    if (spell.effect.kind === "wolves" || spell.effect.kind === "sword-rain" || spell.effect.kind === "bloodlust") continue;
    if (tower.autoModes?.[spell.id] !== false && beginTowerSpell(state, tower, spell.id, true).ok && spell.effect.kind !== "frenzy") return;
  }
  if (state.phase !== "running") return;
  if (tower.autoModes?.[tower.templateId === "G059" ? "A149" : "A068"] !== false) activateTreeGrab(state, tower);
  const accuracy = accuracySkill(tower.templateId);
  if (hero?.ranks[accuracy] && tower.autoModes?.[accuracy] !== false) activateAccuracy(state, tower, accuracy);
  if (state.phase !== "running") return;
  triggerDivineEffect(state, tower, "attack");
  const untouchable = [2, 1, 0].find(index => target.abilities?.includes("N70" + (6 + index)));
  if (untouchable !== undefined && !tower.summon?.illusion && !towerSpellImmune(tower, now) && (tower.untouchable?.untilUs ?? -1) < now) {
    // The original q001 has no model or capacity. The queued expiry owns its active lifetime.
    scheduleEvent(state.queue, us(.5), { type: "untouchable-carrier-expire", ownerId: target.id, targetId: tower.id,
      point: { x: tower.x, y: tower.y }, rank: untouchable + 1 });
    tower.untouchable = { attackSlow: [.5, .8, 1.2][untouchable], movement: [.9, .6, .4][untouchable], untilUs: now + us(2) };
    scheduleWeaponRateEnd(state, tower, "untouchable", tower.untouchable.untilUs);
  }
  const { STR: strength } = combatAttributes(state, tower);
  const overpowerRank = hero?.ranks.A022 ?? tower.summon?.overpowerRank;
  if (overpowerRank) {
    const threshold = tower.overpower && !hasScepter(state, tower) ? 0 : [6, 8, 10, 12, 14, 17][overpowerRank - 1];
    if (rollPercent(state) <= threshold) applyOverpower(state, tower, "T007", overpowerRank);
  }
  const stolenOverpowerRank = tower.doomBorrowed?.id === "T316" ? tower.doomBorrowed.rank : tower.summon?.doomOverpowerRank;
  if (stolenOverpowerRank && rollPercent(state) <= [6, 8, 10, 12][stolenOverpowerRank - 1]) {
    applyOverpower(state, tower, "T144", stolenOverpowerRank);
  }
  beginWeaponTiming(state, tower, weapon, gear, target, target.id);
  if (flakToken !== undefined) tower.attack!.flakToken = flakToken;
  countJingu(state, tower);
  if (hero?.ranks.A023 && !tower.summon?.illusion) {
    const prior = tower.furySwipes;
    if (prior) cancelEvent(state.queue, prior.timerId);
    const count = prior?.count ?? 0;
    const canStack = count < (hasScepter(state, tower) ? 450 : 300);
    const untilUs = now + us(6);
    const timerId = scheduleEvent(state.queue, us(6), { type: "fury-swipes-end", towerId: tower.id, expiresUs: untilUs });
    tower.furySwipes = { count: count + Number(canStack), amount: (prior?.amount ?? 0) + (canStack ? hero.ranks.A023 + 2 : 0), untilUs, timerId };
  }
  delete tower.tauntedTarget;
  if (flame && (!flame.cost || manual) && (manual || tower.flameArrows === true) &&
      flameTargetable(state, tower, target, flame.range)) {
    tower.attack!.flameBonus = flame.bonus;
    if (manual) tower.attack!.manualFlame = true;
    delete tower.flameTarget;
  }
  triggerNativeAttackEquipment(state, tower, target, weapon, gear);
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

function triggerNativeAttackEquipment(state: Match, tower: Construction, target: Enemy, weapon: Weapon, gear: Item[]) {
  for (const id of ["i149", "i153"] as const) {
    if (gear.some(item => item.itemId === id)) triggerEquipmentFrost(state, tower, target, id);
  }
  triggerEquipmentLightning(state, tower, target, gear);
  if (weapon.kind !== "normal" && gear.some(item => item.itemId === "i204" || item.itemId === "i282")) {
    triggerEquipmentVolley(state, tower, target, weapon, gear);
  }
}

function triggerAttackEquipment(state: Match, tower: Construction, target: Enemy, weapon: Weapon, gear: Item[]) {
  if (tower.summon?.illusion) return;
  triggerSpecialAttackEquipment(state, tower, target, weapon, gear);
}

function triggerSpecialAttackEquipment(state: Match, tower: Construction, target: Enemy, weapon: Weapon, gear: Item[]) {
  const melee = weapon.kind === "normal";
  const stats = combatAttributes(state, tower);
  const fits = (enemy: Enemy, origin: Point, radius: number) => targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) &&
    !enemy.abilities?.some(id => id === "Aloc" || id === "Avul") &&
    (enemy.x - origin.x) ** 2 + (enemy.y - origin.y) ** 2 <= radius ** 2;

  if (gear.some(item => item.itemId === "i132") && rollPercent(state) <= 20) {
    const firstWeapon = weapons[tower.templateId]?.[0] ?? weapon;
    const average = averageWeaponField(state, tower, firstWeapon, gear);
    const baseDamage = average * 3.6 + syncTowerLife(state, tower).maximum * .15;
    const amount = baseDamage > 0 && tower.focusFire && !hasScepter(state, tower) ? baseDamage * .8 : baseDamage;
    for (const enemy of [...state.enemies]) {
      if (state.phase !== "running") return;
      if (fits(enemy, target, 460)) damageEnemy(state, tower, tower.templateId, enemy,
        physicalDamage(amount, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "i132");
    }
  }
  if (!melee && gear.some(item => item.itemId === "i302") && rollPercent(state) <= 12 &&
      (tower.flak || state.queue.nowUs >= (tower.starfallReadyUs ?? 0))) {
    if (!tower.flak) tower.starfallReadyUs = state.queue.nowUs + us(.3);
    const amount = 13 * stats.AGI * (weapon.max + weaponRange(weapon, gear, tower)) / 1000;
    for (const enemy of [...state.enemies]) {
      if (state.phase !== "running") return;
      if (fits(enemy, target, 425)) damageEnemy(state, tower, tower.templateId, enemy, amount, "divine", "i302");
    }
  }
  if (gear.some(item => item.itemId === "i316") && rollPercent(state) <= (melee ? 25 : 15) &&
      (tower.flak || state.queue.nowUs >= (tower.conquestReadyUs ?? 0))) {
    if (!tower.flak) tower.conquestReadyUs = state.queue.nowUs + us(2);
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
    const critical = activeSoulBurn(enemy, state.queue.nowUs)?.itemId === "i226" ? 1.5 : 1;
    damageEnemy(state, owner, "q007", enemy, physicalDamage(raw * critical, "hero", armorAt(state, enemy), !!enemy.welfare),
      "weapon", itemId, source);
  }
}

function ordinaryMiss(state: Match, enemy: Enemy) {
  if (state.queue.nowUs < (enemy.evasionUntilUs ?? 0)) return true;
  const threshold = enemyHasAbility(enemy, "N524") ? 90 : enemy.abilities?.includes("N523") ? 35 : 0;
  return threshold > 0 && rollPercent(state) <= threshold;
}

const temporaryDamageSources = new Set(["q001", "q006", "q008", "q007", "q010", "q014", "q016", "q017", "q019", "q023", "q025", "q026", "q029", "q032", "q033", "q039", "q041", "q052", "q056", "q057", "q059", "q062", "q064", ...monkeyTemplates]);

function damageEnemy(state: Match, tower: Construction | undefined, sourceTemplate: string, enemy: Enemy, amount: number,
  kind: "weapon" | "physical" | "magic" | "divine", skillId?: string,
  source: (Point & { id: number; weakenedUntilUs?: number; bounty?: { throwId: number; remaining: number };
    cask?: CaskProjectile["source"]["cask"]; spear?: PhantomSpearLink; powershotIndex?: number; razorLinkId?: number;
    tideRank?: number }) | undefined = tower, illusion = false,
  retiredContract?: NonNullable<WeaponShot["summon"]>["contract"], appliedArmorFactor = 1, arcaneOrbPaid = false): number | undefined {
  const now = state.queue.nowUs;
  if (enemy.hp <= 0 || now < (enemy.phaseUntilUs ?? 0) ||
      enemy.abilities?.some(id => id === "Avul" || id === "Aloc") || kind === "magic" && (magicImmune(enemy) || enemy.oracleEdict) ||
      sourceTemplate === "q004" || sourceTemplate === "q005") return;
  if (sourceTemplate === "q054" && skillId === "T277") {
    if (tower && source) {
      const rank = source.tideRank ?? (tower.tideWaveScepter ? tower.hero?.ranks.A217 ?? 1 : 1);
      sendTidePair(state, enemy, enemy, rank, tower.id);
    }
    return;
  }
  if (enemy.sprintUntilUs && now < enemy.sprintUntilUs) amount *= 1.3;
  if (enemy.eggParentId !== undefined) {
    amount = amount > 0 && kind === "weapon" && source === tower && tower?.templateId === sourceTemplate && tower.hero ? 1 : 0;
  }
  syncEnemyMana(state, enemy);
  syncEnemyHealth(state, enemy);
  let magicResistance = 0;
  if (kind === "magic") {
    const resist = [0.15, 0.4, 0.5, 0.6, 0.8, 0.9].reduce((value, factor, index) =>
      enemyHasAbility(enemy, "T0" + (13 + index)) ? value * (1 - factor) : value, 1);
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
  if (skillId && nonlethalCreepSkills.has(skillId)) amount = Math.min(amount, Math.max(0, enemy.hp - 2));
  if (sourceTemplate === "q022" && tower && source) ghostWaveHit(state, tower, enemy, source.id);
  if (amount === 0) return;
  if (sourceTemplate === "q059" && skillId === "A238" && tower) {
    const rank = tower.hero!.ranks.A238;
    const fraction = enemy.unitId === "mBOS" || /^m5[0-7][1-3]$/.test(enemy.unitId) ? .01 : .1;
    amount = 1000 + 500 * rank + (rank === 1 ? enemy.maxHp ?? enemy.hp : enemy.hp) * fraction + (tower.fingerStacks ?? 0) * 150;
  }
  if ((skillId === "A189" && sourceTemplate === "q064") ||
      (skillId === "A191" && (sourceTemplate === "q001" || sourceTemplate === "q062"))) {
    if ((enemy.illuminateBlindUntilUs ?? 0) > now) amount *= 1.6;
    if (tower && sourceTemplate !== "q001") blindLightTarget(state, enemy);
    if (sourceTemplate === "q062" && tower?.hero) {
      const rank = tower.hero.ranks.A191 ?? 0;
      if (rank) {
        const intelligenceDamage = tower.hero.natural.INT * [4, 4, 6, 6, 8, 8][rank - 1];
        damageEnemy(state, tower, tower.templateId, enemy, intelligenceDamage * .8, "magic", "T408");
        if (enemy.hp <= 0 || state.phase !== "running") return;
      }
    }
  }
  if (sourceTemplate === "q039") {
    if (enemy.welfare) {
      addWelfareDamage(state, tower, amount, kind, illusion);
      return;
    }
    return commitEnemyDamage(state, tower, sourceTemplate, enemy, amount, skillId, source);
  }
  if (sourceTemplate === "q011" || sourceTemplate === "q012") {
    if (!tower) return;
    const rank = tower.hero?.ranks.A066 ?? 0;
    if (rank) {
      const raw = [200, 250, 300, 350, 400, 500][rank - 1] +
        combatAttributes(state, tower).INT * [.8, .9, 1, 1.1, 1.2, 1.4][rank - 1];
      damageEnemy(state, tower, tower.templateId, enemy, raw * .8, "magic", "A066");
    }
    syncMana(state, tower);
    tower.mana = Math.min(tower.manaMaximum!, tower.mana! + 13);
    return;
  }
  if (kind === "weapon" && tower && source === tower && tower.hero?.ranks.T082) {
    releaseTidebringer(state, tower, enemy);
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  const spectre = tower?.hero?.ranks.A230 && kind === "weapon" ? spectreSource(state, tower, source) : undefined;
  if (tower && spectre) {
    spectreDesolate(state, tower, spectre, enemy);
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  if (kind === "weapon" && tower && source === tower && tower.doomTotem && tower.doomTotem.untilUs > now) {
    delete tower.doomTotem;
    return commitEnemyDamage(state, tower, sourceTemplate, enemy, amount, skillId, source);
  }
  if (kind === "weapon") {
    const fistRoll = rollPercent(state);
    const infernalRank = source && /^n26[1-6]$/.test(sourceTemplate) ? Number(sourceTemplate.at(-1)) : 0;
    if (infernalRank && fistRoll <= 25) {
      const targets = state.enemies.filter(unit => targetable(unit, ["ground", "air", "structure", "mechanical", "ward"], now) &&
        (unit.x - enemy.x) ** 2 + (unit.y - enemy.y) ** 2 <= 300 ** 2).sort((a, b) => a.id - b.id);
      for (const target of targets) {
        if (state.phase !== "running") return;
        damageEnemy(state, tower, sourceTemplate, target, 500 * infernalRank * .8, "magic", "N" + (141 + infernalRank), source);
      }
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
    const soulRoll = rollPercent(state);
    if (infernalRank === 6 && soulRoll <= 10) {
      damageEnemy(state, tower, sourceTemplate, enemy, enemy.hp * .08 * .8, "magic", "N152", source);
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (kind === "weapon" && /^b16[2-7]$/.test(sourceTemplate)) {
    const hawk = source && firingUnit(state, source.id);
    amount = 0;
    if (hawk && !hawk.pending && (hawk.life?.hp ?? 1) > 0 && now >= (hawk.stunnedUntilUs ?? 0)) {
      const rank = Number(sourceTemplate.slice(1)) - 162;
      chainLightning(state, tower?.id ?? hawk.summon!.ownerId, hawk, enemy, 5000, 5,
        [500, 700, 1000, 1100, 1300, 1500][rank] * .8, "T" + (269 + rank));
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  const gazeRank = source === tower && !illusion ? tower?.hero?.ranks.A007 : undefined;
  if (tower && gazeRank && rollPercent(state) <= ([5, 6, 7, 8, 9, 12][gazeRank - 1] ?? 0)) {
    applyStoneGaze(state, tower, enemy);
  }
  const helixRank = source === tower && kind === "weapon" ? tower?.hero?.ranks.A056 : undefined;
  if (tower && helixRank) {
    const near = state.enemies.filter(enemy => enemy.hp > 0 &&
      (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 700 ** 2).length;
    if (rollPercent(state) <= Math.min(100, 8 + 2 * helixRank + 2 * near)) {
      interruptWeapon(state, tower);
      stopTowerCast(state, tower);
      runAxeHelix(state, tower, helixRank);
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (sourceTemplate === "q056") {
    const rank = tower?.hero?.ranks.A224;
    if (tower && rank) {
      const { AGI, STR } = combatAttributes(state, tower);
      const ratio = boundedMorphRatio(AGI, STR, 3 * rank + 3);
      const boss = enemy.unitId === "mBOS" || challengeTemplates.some(template => template.unitId === enemy.unitId);
      const amount = heroSpells.A224.damage[rank - 1] + Math.max(0, AGI) * ratio + enemy.hp * .01 * ratio * (boss ? .3 : 1);
      damageEnemy(state, tower, tower.templateId, enemy, amount * .8, "magic", "A224");
    }
    return;
  }
  if (sourceTemplate === "q057" && tower) {
    const fields = weaponAttackAndBonus(state, tower);
    const gear = towerGear(state, tower);
    const weapon = weapons[tower.templateId][0];
    triggerNativeAttackEquipment(state, tower, enemy, weapon, gear);
    if (state.phase !== "running") return;
    triggerAttackEquipment(state, tower, enemy, weapon, gear);
    if (state.phase !== "running" || enemy.hp <= 0) return;
    damageEnemy(state, tower, tower.templateId, enemy,
      physicalDamage(fields, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "A223");
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  if (sourceTemplate === "q050") {
    const link = tower?.razorStatic;
    const rank = tower?.hero?.ranks.A205;
    // Earlier carriers keep their own channels without a write to the replaced tower slot.
    if (link && link.id === source?.razorLinkId && rank) link.attack += heroSpells.A205.damage[rank - 1];
    return;
  }
  if (sourceTemplate === "q051") {
    if (tower && source) resolveRazorStormDamage(state, tower, enemy, source);
    return;
  }
  if (sourceTemplate === "q017") {
    amount = 0;
    if (tower && (!tower.pending || tower.pending.upgradeTo)) {
      hitJinguWave(state, tower, enemy);
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (sourceTemplate === "q014" && tower) {
    amount = 0;
    const souls = tower.souls ?? 0;
    if (souls > 0) {
      damageEnemy(state, tower, tower.templateId, enemy, 20 * souls * .8, "magic", "A001");
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (sourceTemplate === "q006" && tower) registerDragonImprint(state, tower, enemy);
  if (sourceTemplate === "q041" && tower) beginMagnusPush(state, tower, enemy);
  if (sourceTemplate === "q016") {
    amount = 0;
    const rank = tower?.hero?.ranks.A073 ?? 0;
    if (tower && rank) damageEnemy(state, tower, tower.templateId, enemy,
      combatAttributes(state, tower).INT * (6 + rank * 2) * .8, "magic", "A073");
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  if (tower && monkeyTemplates.has(sourceTemplate)) countJingu(state, tower);
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
  const wraithShape = (sourceTemplate === "H010" || sourceTemplate === "G046") &&
    (tower?.templateId === "H010" || tower?.templateId === "G046");
  const manaShape = (sourceTemplate === "H040" || sourceTemplate === "G068") &&
    (tower?.templateId === "H040" || tower?.templateId === "G068");
  const astralShape = (sourceTemplate === "H026" || sourceTemplate === "G069") &&
    (tower?.templateId === "H026" || tower?.templateId === "G069");
  const gyroShape = (sourceTemplate === "H051" || sourceTemplate === "G080") &&
    (tower?.templateId === "H051" || tower?.templateId === "G080");
  const windShape = (sourceTemplate === "H041" || sourceTemplate === "G072") &&
    (tower?.templateId === "H041" || tower?.templateId === "G072");
  const actualTower = source === tower && (sourceTemplate === tower?.templateId || wraithShape || manaShape || astralShape || gyroShape || windShape) ? tower :
    state.summons?.find(unit => unit === source && unit.templateId === sourceTemplate);
  if (kind === "weapon" && actualTower?.empower && weapons[actualTower.templateId]?.[0]?.kind === "normal") {
    const ratio = [.50, .60, .70, .80, .90, 1][actualTower.empower.rank - 1];
    const targets = state.enemies.filter(unit => unit !== enemy && unit.hp > 0 &&
      (unit.x - enemy.x) ** 2 + (unit.y - enemy.y) ** 2 <= 520 ** 2).sort((left, right) => left.id - right.id);
    for (const target of targets) {
      if (state.phase !== "running") return;
      const welfare = target.unitId === "m998" || target.unitId === "m999";
      damageEnemy(state, tower, sourceTemplate, target, amount * ratio * (welfare ? .2 : 1), "divine", "A187", actualTower, illusion);
    }
    if (enemy.hp <= 0) return;
  }
  if (sourceTemplate === "q033" && source?.powershotIndex !== undefined) {
    amount = 0;
    const rank = tower?.hero?.ranks.A162;
    const weapon = tower && weapons[tower.templateId]?.[0];
    if (tower && rank && weapon) {
      const gear = towerGear(state, tower);
      const fields = weaponFields(state, tower, weapon, gear);
      const rate = Math.min(3, rawWeaponRate(state, tower, gear, combatAttributes(state, tower).AGI));
      const scale = [1, .9, .8, .7, .6, .5, .4][Math.min(6, source.powershotIndex)];
      const raw = (Math.fround(fields.attack) + Math.fround(fields.bonus)) * rate * scale * heroSpells.A162.damage[rank - 1];
      damageEnemy(state, tower, tower.templateId, enemy, raw * .8, "magic", "A162");
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (kind === "weapon" && actualTower?.focusFire && !hasScepter(state, actualTower)) amount *= .8;
  if (kind === "weapon" && tower?.templateId === "H055" && source && /^b15[6-9]$|^b16[01]$/.test(sourceTemplate)) {
    scheduleEvent(state.queue, 0, { type: "death-ward-area", towerId: tower.id,
      point: { x: enemy.x, y: enemy.y }, amount: .5 * combatAttributes(state, tower).INT });
  }
  if (sourceTemplate === "H034" && actualTower && kind === "weapon") applyBurningSpear(state, actualTower, enemy);
  if (kind === "weapon" && !illusion && actualTower?.flak) {
    triggerAttackEquipment(state, actualTower, enemy, weapons[actualTower.templateId][0], towerGear(state, actualTower));
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  const wraith = actualTower?.hero?.ranks;
  if (wraith?.A034 && (enemy.wraithMarkUntilUs ?? 0) > now) amount *= 1.3;
  const enrageRank = actualTower?.hero?.ranks.A024;
  if (actualTower && enrageRank && kind === "weapon" && now < (actualTower.enrageUntilUs ?? 0)) {
    const raw = syncTowerLife(state, actualTower).maximum * (8 + enrageRank * 2) / 100;
    if (raw > 0) {
      recordBattleAnimation(state, enemy, "Disenchant", "model-effect");
      damageEnemy(state, tower, sourceTemplate, enemy,
        physicalDamage(raw, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", "A024", source, illusion);
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (actualTower && kind === "weapon") {
    const penetration = actualTower.hero?.ranks.A026;
    if (penetration) {
      const armor = armorAt(state, enemy);
      if (armor > 0) amount *= physicalDamage(1, "chaos", armor * (1 - .05 * penetration), false) /
        physicalDamage(1, "chaos", armor, false);
    }
    const rank = actualTower.hero?.ranks.A027 ?? actualTower.summon?.criticalRank;
    if (rank === 6 && Math.floor(roll(state) * 1001) < (illusion ? 1 : 2) && enemy.unitId !== "m998" && enemy.unitId !== "m999") {
      const carrier = { x: actualTower.x, y: actualTower.y, id: state.nextId++ };
      scheduleEvent(state.queue, us(.5), { type: "coup-carrier-expire", sourceId: carrier.id, towerId: actualTower.id,
        point: { x: carrier.x, y: carrier.y } });
      damageEnemy(state, tower, "q025", enemy, 10_000_000, "divine", "A027", carrier);
      if (actualTower.templateId === "G052") {
        for (const effect of ["PhantomAssassin_C1", "PhantomAssassin_C2", "PhantomAssassin_C3A"]) {
          recordBattleAnimation(state, enemy, effect, "model-effect", actualTower);
        }
        recordBattleAnimation(state, actualTower, "AZ_PA_C", "model-effect", enemy);
      } else recordBattleAnimation(state, enemy, "TauntCaster", "model-effect");
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (actualTower?.bear && kind === "weapon") triggerBearEnsnare(state, actualTower, enemy);
  if (actualTower && kind === "weapon") {
    const essence = actualTower.hero?.ranks.A038;
    if (essence && !illusion) {
      changeEssence(state, actualTower, essence);
      scheduleEvent(state.queue, us(18 + essence * 2), { type: "essence-expire", towerId: actualTower.id, amount: essence });
    }
    const imageShadow = actualTower.summon?.shadowDance;
    const shadow = actualTower.hero?.ranks.A039 ?? imageShadow?.rank;
    if (shadow) {
      const { STR, AGI, INT } = combatAttributes(state, actualTower);
      const total = imageShadow?.attributes ?? (STR + AGI + INT);
      if (actualTower.templateId === "G051") recordBattleAnimation(state, actualTower, "XiaoYuRenAtt", "model-effect");
      damageEnemy(state, tower, sourceTemplate, enemy, total * shadow / 10 * (illusion ? .2 : 1),
        "divine", "A039", source, illusion);
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  const swordCleave = actualTower?.hero?.ranks.A062 ?? actualTower?.hero?.ranks.A121 ?? actualTower?.summon?.swordCleaveRank;
  if (actualTower && swordCleave && kind === "weapon") {
    const cleave = amount * (.3 + .1 * swordCleave) * (illusion ? .4 : 1);
    const center = { x: enemy.x, y: enemy.y };
    for (const victim of [...state.enemies].sort((left, right) => left.id - right.id)) {
      if (state.phase !== "running") return;
      if (victim === enemy || victim.hp <= 0 || (victim.x - center.x) ** 2 + (victim.y - center.y) ** 2 > 520 ** 2) continue;
      if (actualTower.templateId === "G049") recordBattleAnimation(state, victim, "SvenFenLie", "model-effect");
      damageEnemy(state, tower, sourceTemplate, victim, cleave * (victim.welfare ? .2 : 1), "divine", "A062", source, illusion);
    }
    if (enemy.hp <= 0) return;
  }
  if (actualTower && wraith?.A036 && kind === "weapon" && sourceTemplate !== "q039") {
    let raw = combatAttributes(state, actualTower).STR * [2, 2.5, 3, 3.5, 4, 5][wraith.A036 - 1];
    if (wraith.A035 && rollPercent(state) <= wraithCriticalChance[wraith.A035 - 1]) raw *= wraithCriticalMultiplier[wraith.A035 - 1];
    if (illusion) raw *= .2;
    const reduced = physicalDamage(raw, "hero", armorAt(state, enemy), !!enemy.welfare);
    damageEnemy(state, tower, sourceTemplate, enemy, reduced, "physical", "A036", source, illusion);
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  if (actualTower && kind === "weapon" && arcaneOrbPaid && (enemy.arcanePoisonUntilUs ?? 0) > now) {
    const rank = actualTower.hero?.ranks.A083;
    if (rank) {
      changeAstralIntelligence(state, actualTower, rank);
      scheduleEvent(state.queue, us(70), { type: "astral-intelligence-end", towerId: actualTower.id, amount: rank });
      const packet = actualTower.mana! * (.06 + rank * .01);
      const victims = hasScepter(state, actualTower) ? state.enemies.filter(target =>
        targetable(target, ["ground", "air", "mechanical", "structure", "ward"], now) &&
        (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= 285 ** 2).sort((a, b) => a.id - b.id) : [enemy];
      for (const target of victims) {
        if (state.phase !== "running") break;
        damageEnemy(state, tower, actualTower.templateId, target, packet, "divine", "A083", actualTower, illusion);
      }
      recoverEssenceMana(state, actualTower, essenceAuraRank(state, actualTower));
      if (state.phase !== "running" || enemy.hp <= 0) return;
    }
  }
  if (tower?.hero && actualTower && kind === "weapon" && enemy.mana > 0 &&
      (actualTower.hero?.ranks.A158 || actualTower.summon?.manaBreak)) {
    const base = Math.min(enemy.mana, (tower.hero.ranks.A158 ?? 0) * 30);
    const rank = tower.hero.ranks.A159;
    if (rank && (actualTower.hero?.ranks.A159 || actualTower.summon?.manaCounter)) {
      const gained = Math.floor(base * [.10, .12, .15, .20, .28, .40][rank - 1] * (actualTower === tower ? 1 : .5));
      if (gained > 0) {
        tower.hero.natural.AGI += gained;
        scheduleEvent(state.queue, us(4), { type: "mana-counter-expire", towerId: tower.id, amount: gained });
        weaponRatesDirty.add(state);
      }
    }
    const bonus = hasScepter(state, tower) ? (enemy.manaMax ?? enemy.mana) * .01 : 0;
    enemy.mana = Math.max(0, enemy.mana - base - bonus);
    recordBattleAnimation(state, enemy, tower.templateId === "G068" ? "AZ_D036" : "SpellBreakerAttack", "model-effect");
  }
  if (tower && isNightHunter(tower)) amount *= 1.8;
  const ownedGear = tower && !illusion ? towerGear(state, tower) : [];
  if (tower && sourceTemplate === "q015" && skillId === "A016" && source && ownedGear.some(item => item.itemId === "i310")) {
    const field = state.freezingFields?.[source.id];
    if (field && rollPercent(state) <= 35) {
      const point = { x: enemy.x, y: enemy.y };
      const sourceId = state.nextId++;
      if (freezingTarget(state, enemy, false) && canSeeEnemy(state, enemy) && !consumeEnemySpellShield(state, enemy)) {
        launchTrackingProjectile(state, { type: "freezing-scepter", towerId: tower.id, targetId: enemy.id,
          sourceId, source: point, position: { ...point }, expiresUs: now + us(1), travelUs: 0, rank: field.rank }, enemy);
      }
    }
  }
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
      if (amount > 0 && contract.red && weapons[sourceTemplate]?.[0]?.kind === "normal") {
        const ignore = [.30, .40, .50][contract.red - 1];
        const split = [.80, 1, 1.20][contract.red - 1];
        const chest = enemy.unitId === "m998" || enemy.unitId === "m999";
        const base = amount / appliedArmorFactor * split * (chest ? .2 : 1);
        amount = 0;
        const victims = state.enemies.filter(target => targetable(target, ["ground", "air", "structure", "ward"], now) &&
          (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= 300 ** 2).sort((left, right) => left.id - right.id);
        for (const target of victims) {
          if (state.phase !== "running") return;
          if (!state.enemies.includes(target)) continue;
          const armor = armorAt(state, target);
          damageEnemy(state, tower, sourceTemplate, target,
            physicalDamage(base, "hero", armor > 0 ? armor * (1 - ignore) : armor, !!target.welfare), "physical", "T085", source);
        }
        if (state.phase !== "running" || enemy.hp <= 0) return;
      }
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
  if (actualTower && sourceTemplate === "n208" && kind === "weapon" && rollPercent(state) <= 12) {
    const maximum = syncTowerLife(state, actualTower).maximum;
    const victims = state.enemies.filter(unit =>
      (unit.x - enemy.x) ** 2 + (unit.y - enemy.y) ** 2 <= 600 ** 2).sort((a, b) => a.id - b.id);
    for (const unit of victims) {
      if (state.phase !== "running") break;
      if (targetable(unit, ["ground", "air", "structure", "mechanical"], now) && state.enemies.includes(unit)) {
        damageEnemy(state, tower, sourceTemplate, unit, physicalDamage(maximum, "chaos", armorAt(state, unit), !!unit.welfare),
          "physical", "N086", actualTower, illusion);
      }
    }
    recordBattleAnimation(state, enemy, sourceTemplate, "stomp-impact");
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  if (tower && source === tower && kind === "weapon" && amount > 0 && (tower.treeGrab?.cleaveUntilUs ?? 0) > now) {
    treeGrabCleave(state, tower, enemy, amount);
    if (state.phase !== "running") return;
  }
  const emitter = kind === "magic" ? "n248" : kind === "divine" ? "n220" : "n198";
  if ((kind === "physical" || kind === "weapon") && enemy.decrepifyUntilUs !== undefined) amount *= .5;
  if ((kind === "physical" || kind === "weapon") && enemy.oracleEdict) {
    amount *= enemy.unitId === "m998" || enemy.unitId === "m999" ? 1.25 : 1.5;
  }
  if ((kind === "physical" || kind === "weapon") && !magicImmune(enemy)) {
    let rank = 0;
    for (const source of state.structures) {
      if ((source.hero?.ranks.A003 ?? 0) <= rank || source.pending || (source.life?.hp ?? 1) <= 0 ||
          (source.x - enemy.x) ** 2 + (source.y - enemy.y) ** 2 > 800 ** 2) continue;
      rank = source.hero!.ranks.A003;
      if (rank === 6) break;
    }
    if (rank) amount *= [1.10, 1.16, 1.22, 1.28, 1.34, 1.40][rank - 1];
  }
  const auraRecipient = actualTower;
  if (auraRecipient && (!auraRecipient.pending || auraRecipient.pending.upgradeTo) && (auraRecipient.life?.hp ?? 1) > 0 &&
      state.structures.some(unit => unit.templateId === emitter && (!unit.pending || unit.pending.upgradeTo) &&
        (unit.life?.hp ?? 1) > 0 && (unit.x - auraRecipient.x) ** 2 + (unit.y - auraRecipient.y) ** 2 <= 500 ** 2)) amount *= 1.10;
  if (kind === "magic") {
    if ((enemy.iceBindingUntilUs ?? 0) > now) amount *= 1.2;
    if (enemy.decrepifyUntilUs !== undefined) amount *= 1.5;
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
    if (source) {
      const emitterRank = state.structures.reduce((rank, caster) =>
        !caster.pending && caster.doomBorrowed?.id === "T307" &&
        (caster.x - source.x) ** 2 + (caster.y - source.y) ** 2 <= 500 ** 2 ?
          Math.max(rank, caster.doomBorrowed.rank) : rank, 0);
      if (emitterRank) amount *= 1 + .05 * emitterRank;
    }
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
  if (tower && hero?.ranks.A072 && kind === "weapon" && source === tower && sourceTemplate === tower.templateId &&
      hasScepter(state, tower)) {
    const candidates = state.enemies.filter(target => target !== enemy &&
      !target.abilities?.includes("Aloc") && state.queue.nowUs >= (target.phaseUntilUs ?? 0) &&
      (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= 350 ** 2).sort((left, right) => left.id - right.id);
    for (const target of candidates) {
      if (state.phase !== "running") return;
      if (!state.enemies.includes(target) || !state.structures.includes(tower)) continue;
      const chest = (enemy.unitId === "m998" || enemy.unitId === "m999") && state.enemies.includes(enemy);
      damageEnemy(state, tower, sourceTemplate, target, amount * (chest ? .51 : .4), "divine", "A072");
    }
    if (enemy.hp <= 0) return;
  }
  if (sourceTemplate === "q026" && tower && enemy.decrepifyUntilUs !== undefined) {
    amount = 0;
    const ratio = enemy.unitId === "mBOS" || /^m5[0-7][1-3]$/.test(enemy.unitId) ? .005 : .05;
    damageEnemy(state, tower, tower.templateId, enemy, (enemy.maxHp ?? enemy.hp) * ratio, "divine", "T099");
    if (state.phase !== "running" || enemy.hp <= 0) return;
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
  if (tower?.wispLinked && source === tower && sourceTemplate === tower.templateId) {
    const wisp = state.structures.find(unit => unit.wispLink?.targetId === tower.id);
    amount *= 1 + .05 * (wisp?.hero?.ranks.A111 ?? 0);
  }
  if (tower?.sleight) amount *= 2.7;
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
  if (sourceTemplate === "q045") amount = Math.max(500, amount - effectiveMoveSpeed(enemy));
  startEnemyReaction(state, enemy, tower, ["N511", "N513", "N514", "N710", "N581"]);
  if (enemyHasAbility(enemy, "N533") && rollPercent(state) <= 40 && sourceTemplate !== "q025") amount = 0;
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
  if ((kind === "physical" || kind === "weapon") && (enemy.stormHammerMarkUntilUs ?? 0) > now) amount *= 1.2;
  startEnemyReaction(state, enemy, tower, ["N520"]);
  if (enemy.abilities?.includes("N709")) {
    const ratio = enemy.hp / (enemy.maxHp ?? enemy.hp);
    const threshold = [.12, .21, .31, .41, .51, .61, .71, .81, .91].findIndex(value => ratio < value);
    enemy.berserkerResistanceRank = threshold < 0 ? 1 : 10 - threshold;
  }
  startEnemyReaction(state, enemy, tower, ["N522"]);
  const impactOrigin = temporaryDamageSources.has(sourceTemplate) ? tower : source;
  if (impactOrigin && enemyHasAbility(enemy, "N525")) {
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
  const forceRank = kind === "weapon" && source === tower && tower?.doomBorrowed?.id === "T325" ?
    tower.doomBorrowed.rank : 0;
  if (tower && forceRank && rollPercent(state) <= 11 + forceRank) {
    const radius = 600;
    const raw = syncTowerLife(state, tower).maximum;
    const targets = state.enemies.filter(target => targetable(target, ["ground", "air", "structure"], now) &&
      (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 <= radius ** 2).sort((left, right) => left.id - right.id);
    for (const target of targets) {
      if (state.phase !== "running") return;
      damageEnemy(state, tower, tower.templateId, target,
        physicalDamage(raw, "chaos", armorAt(state, target), !!target.welfare), "physical", "T325");
    }
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  startEnemyReaction(state, enemy, tower, ["N526", "N575", "N528", "N530", "N531", "N532", "N571", "N576"]);
  if (enemyHasAbility(enemy, "N536") && amount !== 0) {
    if (enemy.shellDamage !== undefined && amount > enemy.hp) delete enemy.shellDamage;
    else {
      enemy.shellDamage = (enemy.shellDamage ?? 0) + amount;
      if (enemy.shellDamage > (enemy.maxHp ?? enemy.hp) * .1) {
        enemy.shellDamage = 0;
        if (enemy.stoneGaze) enemy.stoneGaze.paused = false;
        clearEnemyDebuffs(state, enemy);
      }
    }
  }
  if (enemy.abilities?.includes("N574")) purgeEnemyDebuffs(state, enemy, amount, "N574");
  startEnemyReaction(state, enemy, tower, ["N711", "N712"]);
  if (enemy.overdraftArmor && sourceTemplate !== "q025") amount *= (100 - Math.min(99, (kind === "magic" ? 3.2 : kind === "divine" ? 3.7 : 4.4) * enemy.overdraftArmor)) / 100;
  if (illusion && tower?.hero?.ranks.A232) {
    if (enemy.unitId === "m998" || enemy.unitId === "m999") amount *= state.wave <= 35 ? 1.6 : 1.8;
  }
  if (tower && amount > 0 && tower.spectreRefraction && tower.spectreRefraction.untilUs > now &&
      spectreSource(state, tower, source)) {
    tower.spectreRefraction.total += Math.trunc(amount);
  }
  if (sourceTemplate === "q024" && source?.bounty && tower?.hero?.ranks.A090) {
    shadowWindImpact(state, tower, enemy, source.bounty.throwId, source.bounty.remaining);
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  const spearRank = tower?.hero?.ranks.A122;
  if (sourceTemplate === "q029" && source?.spear && tower && spearRank) {
    phantomSpearLanding(state, tower, enemy, source.spear, spearRank);
  }
  if (kind === "weapon" && actualTower && (actualTower.hero?.ranks.A123 || actualTower.summon?.phantom)) {
    attackWithPhantom(state, tower, actualTower, enemy);
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  if (enemyHasAbility(enemy, "N579")) purgeEnemyDebuffs(state, enemy, amount, "N579");
  if (tower && sourceTemplate !== "q025" && state.fatalBondsCarrier) {
    const linkedKind = kind === "weapon" ? "physical" : kind;
    shareFatalBonds(state, tower, enemy, amount, linkedKind);
    if (state.phase !== "running" || enemy.hp <= 0) return;
  }
  if (enemy.welfare) {
    addWelfareDamage(state, tower, amount, kind, illusion);
    return;
  }
  if (amount > enemy.hp) {
    if (enemy.abilities?.includes("N521")) {
      if (enemy.abilities.includes("T045") && !activeSoulBurn(enemy, now) && now >= Math.max(enemy.spellCastingUntilUs ?? 0,
        enemy.stunUntilUs ?? 0, enemy.wraithMarkUntilUs ?? 0, enemy.iceBindingUntilUs ?? 0, enemy.hexUntilUs ?? 0, enemy.doomUntilUs ?? 0, enemy.graveSpellReadyUs ?? 0)) {
        enemy.graveCastUs = now;
        enemy.graveSpellReadyUs = now + us(1);
      }
      enemy.abilities = enemy.abilities.filter(id => id !== "N521");
      enemy.graveUntilUs = state.queue.nowUs + us(6);
      amount = 0;
    } else if (sourceTemplate !== "q025" && now < (enemy.graveUntilUs ?? 0)) {
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
      if (target.pending || towerSpellImmune(target, now) ||
          (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 > 1000 ** 2) continue;
      target.thunderClap = { amount: slow, untilUs: now + us(4) };
      scheduleWeaponRateEnd(state, target, "thunderClap", target.thunderClap.untilUs);
    }
  }
  const caskRank = tower?.hero?.ranks.A207;
  if (sourceTemplate === "q052" && source?.cask && tower && caskRank) {
    amount = 0;
    const point = { x: enemy.x, y: enemy.y };
    const { castId, jumps } = source.cask;
    const limit = 2 + 2 * caskRank + (hasScepter(state, tower) ? 2 : 0);
    damageEnemy(state, tower, tower.templateId, enemy, heroSpells.A207.damage[caskRank - 1] * .8, "magic", "A207");
    if (state.phase !== "running") return;
    if (jumps < limit) {
      const next = state.enemies.filter(target => target !== enemy && target.hp > 0 && !target.abilities?.includes("Aloc") &&
        canSeeEnemy(state, target) && (target.x - point.x) ** 2 + (target.y - point.y) ** 2 <= 600 ** 2)
        .sort((left, right) => left.id - right.id)[0];
      if (next) launchCask(state, tower, point, next, { castId, jumps: jumps + 1 });
    }
    if (enemy.hp <= 0) return;
  }
  if (tower?.godsStrength && now < tower.godsStrength.untilUs && !mapBoss(enemy)) amount *= 2.5;
  if (tower?.dragonShape) amount *= hasScepter(state, tower) ? 1.2 : 1.1;
  const window = activeSoulBurn(enemy, now);
  if (window && amount > 0) window.total += amount;
  return commitEnemyDamage(state, tower, sourceTemplate, enemy, amount, skillId, source);
}

function addWelfareDamage(state: Match, tower: Construction | undefined, amount: number,
  kind: "weapon" | "physical" | "magic" | "divine", illusion: boolean) {
  const provisionTower = tower && towerLevels.get(tower.templateId)?.bindings.some(binding => binding.skillId === "N159");
  state.welfareDamage = (state.welfareDamage ?? 0) + amount * (illusion ? .8 : 1) *
    (provisionTower ? .2 : 1) * (kind === "magic" ? 1.4 : kind === "divine" ? 1 : .58);
}

function commitEnemyDamage(state: Match, tower: Construction | undefined, sourceTemplate: string, enemy: Enemy,
  amount: number, skillId: string | undefined, source: (Point & { id: number }) | undefined) {
  const now = state.queue.nowUs;
  const hpBefore = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  if (source && enemy.hp < hpBefore) {
    const hits = state.recentHits ??= [];
    if (hits.length >= 64) hits.shift();
    const damageEvents = state.damageEvents ??= [];
    while (damageEvents.length && now - damageEvents[0].atUs > us(1.2)) damageEvents.shift();
    damageEvents.push({ atUs: now, x: enemy.x, y: enemy.y, amount: hpBefore - enemy.hp });
    hits.push({ atUs: now, x: enemy.x, y: enemy.y, targetId: enemy.id, casterId: source.id, ...(tower ? { ownerId: tower.id } : {}),
      sourceTemplate, amount: hpBefore - enemy.hp, ...(enemy.hp === 0 ? { deadUnitId: enemy.unitId } : {}) });
  }
  if (enemy.hp !== 0) return hpBefore - enemy.hp;
  if (sourceTemplate === "q059" && skillId === "A238" && tower && source) {
    tower.fingerStacks = Math.min(800, (tower.fingerStacks ?? 0) + (mapBoss(enemy) ? 5 : 1));
    tower.fingerDisplayUntilUs = now + us(5);
    tower.fingerDisplayPoint = { x: tower.x, y: tower.y };
  }
  if (enemy.unitId === "mBOS") {
    state.finalHit = { towerId: tower?.id, sourceId: source?.id, sourceTemplate, targetId: enemy.id,
      amount, hpBefore, skillId, atUs: state.queue.nowUs };
  }
  removeDeadEnemy(state, enemy.id, source?.id, tower?.id ?? source?.id);
  return hpBefore;
}

function recordBattleAnimation(state: Match, point: Point, unitId: string,
  kind: NonNullable<Match["battleAnimations"]>[number]["kind"], target?: Point, delayUs = 0) {
  const effects = state.battleAnimations ??= [];
  if (effects.length >= 64) effects.shift();
  const effect: typeof effects[number] = { x: point.x, y: point.y, unitId, kind, atUs: state.queue.nowUs + delayUs,
    ...(target ? { target: { x: target.x, y: target.y } } : {}) };
  effects.push(effect);
  return effect;
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
  const nativeCorrosion = enemy.nativeCorrosion;
  const auraEligible = !magicImmune(enemy) && !enemy.abilities?.includes("Aloc") &&
    state.queue.nowUs >= (enemy.phaseUntilUs ?? 0);
  let b008 = auraEligible && nearbyEquipment(state, enemy, ["i269"], 900) ? 90 : 0;
  let b150 = false;
  let divineArmor = 0;
  let acidArmor = 0;
  if (auraEligible && state.acidClouds) for (const cloud of Object.values(state.acidClouds)) {
    if ((cloud.point.x - enemy.x) ** 2 + (cloud.point.y - enemy.y) ** 2 <= 550 ** 2) {
      acidArmor = Math.max(acidArmor, [30, 35, 40, 45, 50, 60][cloud.rank - 1]);
    }
  }
  for (const tower of state.structures) {
    if (tower.pending || (tower.life?.hp ?? 1) <= 0) continue;
    const distance = (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2;
    if (distance <= 900 ** 2 && auraEligible) {
      const rank = tower.hero?.ranks.A033;
      if (rank) b008 = Math.max(b008, [20, 35, 50, 65, 80, 100][rank - 1]);
      b150 ||= !!tower.slardarScepterAura;
    }
    const form = tower.hero?.divineForm;
    if (form?.id === "P219" && distance <= 800 ** 2) {
      divineArmor = Math.min(divineArmor, divineField(form.id, "DataA", form.stars));
    }
  }
  const aura = (nearbyEquipment(state, enemy, ["i217"], 800) ? 30 : 0) + b008 + (b150 ? 50 : 0);
  const wave = enemy.waveArmor;
  const howl = enemy.howlArmor;
  const now = state.queue.nowUs;
  const weave = enemy.doomWeave && enemy.doomWeave.untilUs > now ? enemy.doomWeave.amount : 0;
  const tracking = enemy.doomTrack && enemy.doomTrack.untilUs > now ? enemy.doomTrack.amount : 0;
  const bountyArmor = enemy.bountyArmor?.amount ?? 0;
  const doomWave = enemy.doomWave && enemy.doomWave.untilUs > now ? enemy.doomWave.amount : 0;
  return (enemy.armor ?? 0) - weave - tracking - bountyArmor - doomWave + divineArmor - aura - acidArmor - (howl && howl.expiresUs > state.queue.nowUs ? howl.amount : 0) - (wave && wave.expiresUs > state.queue.nowUs ? wave.amount : 0) + (buff && buff.untilUs > state.queue.nowUs ? buff.value : 0) -
    (corrosion && corrosion.untilUs > state.queue.nowUs ? corrosion.value : 0) -
    (nativeCorrosion && nativeCorrosion.untilUs > state.queue.nowUs ? nativeCorrosion.value : 0) -
    (enemy.tideCorrosion && enemy.tideCorrosion.untilUs > now ? enemy.tideCorrosion.armor : 0) -
    (enemy.bristleGooArmor?.value ?? 0);
}

function syncEnemyMana(state: Match, enemy: Enemy) {
  if (enemy.manaMax === undefined || enemy.manaTickUs === undefined) return;
  const regeneration = unitBalance.get(enemy.unitId)?.regenMana ?? 0;
  const now = state.queue.nowUs;
  enemy.mana = Math.min(enemy.manaMax, enemy.mana + regeneration * (now - enemy.manaTickUs) / 1_000_000);
  enemy.manaTickUs = now;
}

function activeSoulBurn(enemy: Enemy, now: number) {
  const window = enemy.soulBurn;
  return window && !window.dispelled && window.untilUs > now ? window : undefined;
}

function startEnemyReaction(state: Match, enemy: Enemy, attacker: Construction | undefined, skills: EnemySpellId[]) {
  const now = state.queue.nowUs;
  if (enemy.oraclePauseUntilUs || enemy.torrentLift || enemy.ravageLift || enemy.impaleLift || enemy.stoneGaze?.paused || enemy.hexSourceId !== undefined || enemy.leashes?.length || enemy.doomCurse || activeSoulBurn(enemy, now) || now < Math.max(enemy.stunUntilUs ?? 0, enemy.wraithMarkUntilUs ?? 0, enemy.iceBindingUntilUs ?? 0, enemy.doomUntilUs ?? 0,
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
    if (skill === "N519" && (!weaknessTarget || weaknessTarget.pending || weaknessTarget.immune)) continue;
    enemy.spellCastingUntilUs = now + us(spec.cast);
    if (spec.cast === 0) finishEnemyReaction(state, enemy.id, skill, point);
    else scheduleEvent(state.queue, us(spec.cast), { type: "enemy-cast", enemyId: enemy.id, skill, point,
      ...(weaknessTarget ? { targetId: weaknessTarget.id } : {}) });
    break;
  }
}

function weaknessTargets(state: Match) {
  return [
    { id: -1, point: state.worker, untilUs: state.workerWeakUntilUs ?? 0, pending: false, immune: false,
      apply(untilUs: number) { state.workerWeakUntilUs = untilUs; } },
    { id: circleId, point: circle, untilUs: state.circleWeakUntilUs ?? 0, pending: false, immune: false,
      apply(untilUs: number) { state.circleWeakUntilUs = untilUs; } },
    ...[...state.structures, ...(state.summons ?? [])].sort((a, b) => a.id - b.id).map(tower => ({
      id: tower.id, point: tower, untilUs: tower.weakAttackUntilUs ?? 0, pending: !!tower.pending,
      immune: towerSpellImmune(tower, state.queue.nowUs),
      apply(untilUs: number) { tower.weakAttackUntilUs = untilUs; },
    })),
  ];
}

function finishEnemyReaction(state: Match, enemyId: number, skill: EnemySpellId, point: Point, targetId?: number) {
  const enemy = state.enemies.find(entry => entry.id === enemyId);
  const now = state.queue.nowUs;
  if (!enemy || enemy.hp <= 0 || enemy.oraclePauseUntilUs || enemy.torrentLift || enemy.ravageLift || enemy.impaleLift || enemy.stoneGaze?.paused || enemy.hexSourceId !== undefined || enemy.leashes?.length || enemy.doomCurse || activeSoulBurn(enemy, now) ||
      now < Math.max(enemy.stunUntilUs ?? 0, enemy.wraithMarkUntilUs ?? 0, enemy.iceBindingUntilUs ?? 0, enemy.doomUntilUs ?? 0, enemy.hexUntilUs ?? 0)) return;
  syncEnemyMana(state, enemy);
  const spell = enemySpells[skill];
  if (enemy.mana < spell.cost || (skill === "N522" && (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2 > 900 ** 2)) return;
  const weakTarget = skill === "N519" ? weaknessTargets(state).find(target => target.id === targetId) : undefined;
  if (skill === "N519" && (!weakTarget || weakTarget.pending || weakTarget.immune ||
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
    const eligible = [...state.structures, ...(state.summons ?? [])].filter(tower => !tower.pending && !towerSpellImmune(tower, now) &&
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
      if (tower.pending || towerSpellImmune(tower, state.queue.nowUs) ||
          (tower.x - center.x) ** 2 + (tower.y - center.y) ** 2 > radius ** 2) continue;
      const duration = skill === "N514" ? tower.hero ? 1.2 : 1.8 : tower.hero ? 0.5 : 1;
      tower.stunnedUntilUs = Math.max(tower.stunnedUntilUs ?? 0, now + us(duration));
      interruptWeapon(state, tower);
      stopTowerCast(state, tower);
    }
  }
}

function stunNearbyTowers(state: Match, center: Point, radius: number, normal: number, hero: number) {
  for (const tower of [...state.structures, ...(state.summons ?? [])]) {
    if (tower.pending || towerSpellImmune(tower, state.queue.nowUs) ||
          (tower.x - center.x) ** 2 + (tower.y - center.y) ** 2 > radius ** 2) continue;
    tower.stunnedUntilUs = Math.max(tower.stunnedUntilUs ?? 0, state.queue.nowUs + us(tower.hero ? hero : normal));
    interruptWeapon(state, tower);
    stopTowerCast(state, tower);
  }
}

function clearTowerDebuffs(state: Match, tower: Construction) {
  delete tower.weakenedUntilUs;
  delete tower.weakAttackUntilUs;
  delete tower.stunnedUntilUs;
  delete tower.thunderClap;
  delete tower.untouchable;
  delete tower.armorFrostUntilUs;
  weaponRatesDirty.add(state);
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
  if (enemy.firestormBurn) {
    cancelEvent(state.queue, enemy.firestormBurn.timerId);
    delete enemy.firestormBurn;
  }
  if (enemy.soulBurn) enemy.soulBurn.dispelled = true;
  delete enemy.frost;
  delete enemy.coldArrow;
  delete enemy.axeBleed;
  endEnemyLeashes(state, enemy);
  delete enemy.waveArmor;
  delete enemy.doomRoarUntilUs;
  delete enemy.doomPoison;
  delete enemy.doomWeave;
  delete enemy.doomWave;
  delete enemy.doomFrostUntilUs;
  delete enemy.voidSlowUntilUs;
  delete enemy.tideCorrosion;
  delete enemy.lichChainSlow;
  delete enemy.lifeBreakSlowUs;
  delete enemy.doomTrack;
  delete enemy.decrepifyUntilUs;
  delete enemy.illuminateBlindUntilUs;
  delete enemy.phantomSlow;
  if (enemy.bountyArmor) {
    cancelEvent(state.queue, enemy.bountyArmor.timerId);
    delete enemy.bountyArmor;
  }
  delete enemy.howlArmor;
  delete enemy.wraithMarkUntilUs;
  delete enemy.bearRoarUntilUs;
  delete enemy.stormHammerMarkUntilUs;
  delete enemy.clapSlow;
  delete enemy.nativeSlow;
  delete enemy.bristleGooSlow;
  delete enemy.calldownSlow;
  delete enemy.hexUntilUs;
  delete enemy.hexSourceId;
  delete enemy.hexForm;
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
  rescheduleSweepContact(state, enemy);
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
    if (attacker && !towerSpellImmune(attacker, state.queue.nowUs)) {
      attacker.armorFrostUntilUs = state.queue.nowUs + us(1);
      scheduleWeaponRateEnd(state, attacker, "armorFrostUntilUs", attacker.armorFrostUntilUs);
    }
  }
  if (shot.summon) {
    const { id, banner } = shot.summon;
    const unit = firingUnit(state, id);
    const source = unit ?? { ...(shot.summon.point ?? shot.point), id };
    const output = shot.summon.illusion ? shot.summon.output ?? .4 : 1;
    const extra = shot.summon.illusion && primary && !shot.secondary ? (shot.fixedHitBonus ?? 0) * output : 0;
    const armor = armorAt(state, enemy);
    const welfare = !!enemy.welfare;
    const heroMultiplier = monkeyTemplates.has(shot.sourceTemplate) && /^[A-Z]/.test(enemy.unitId) ? 1.25 : 1;
    const raw = unit?.spiritOrder ? shot.raw : physicalDamage((shot.raw + extra) * heroMultiplier * (banner ? 1.2 : 1) * multiplier,
      shot.weapon.attackType, armor, welfare);
    damageEnemy(state, tower?.pending ? undefined : tower, shot.sourceTemplate, enemy, raw, "weapon", shot.summon.skillId ?? "A094", source,
      shot.summon.illusion, unit ? undefined : shot.summon.contract, physicalDamage(1, "chaos", armor, welfare));
    if (primary && !shot.secondary && /^b(?:16[89]|17[0-3])$/.test(shot.sourceTemplate) &&
        targetable(enemy, ["ground", "air"], state.queue.nowUs) && canSeeEnemy(state, enemy) &&
        !enemy.abilities?.some(ability => ["Aloc", "Avul", "Aeth"].includes(ability))) {
      const untilUs = state.queue.nowUs + us(3);
      (enemy.boarVenom ??= {})[id] = { untilUs, rate: (177 - Number(shot.sourceTemplate.slice(1))) / 10 };
      scheduleEvent(state.queue, us(3), { type: "boar-venom-end", sourceId: id, enemyId: enemy.id, untilUs });
    }
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
  const bash = tower.hero?.ranks.A032;
  if (bash && primary && !shot.secondary && !tower.summon?.illusion && canSeeEnemy(state, enemy) &&
      targetable(enemy, ["ground", "air", "structure", "mechanical"], state.queue.nowUs) &&
      !enemy.abilities?.some(id => id === "Aeth" || id === "Aloc" || id === "Avul") && rollPercent(state) <= 10) {
    damage += [220, 460, 700, 1040, 1300, 1600][bash - 1];
    if (unitTargetType.get(enemy.unitId) !== "structure" && !mechanicalEnemy(enemy)) {
      stunEnemy(state, enemy, us(nativeControlHero(enemy) ? .4 : 1));
    }
  }
  if (/^n14[4-6]$/.test(shot.sourceTemplate) &&
      targetable(enemy, ["ground", "structure", "mechanical"], state.queue.nowUs) && rollPercent(state) <= 30) {
    if (unitTargetType.get(enemy.unitId) !== "structure" && !mechanicalEnemy(enemy)) {
      stunEnemy(state, enemy, us(resistantToControl(enemy) ? .01 : .1));
    }
    damage += [260, 550, 850][Number(shot.sourceTemplate.slice(1)) - 144];
  }
  const poison = shot.sourceTemplate === "n219" ? "N093" : shot.sourceTemplate === "n220" ? "N095" :
    shot.sourceTemplate === "E001" || shot.sourceTemplate === "E023" ? "A011" :
    shot.sourceTemplate === "E002" || shot.sourceTemplate === "E024" ? "A012" : undefined;
  if (primary && !shot.secondary && poison && organicPhysicalTarget(state, enemy, ["ground", "air"])) {
    const now = state.queue.nowUs;
    const expiresUs = now + us(poison.startsWith("A") && nativeAttackEffectHero(enemy) ? 3 : 5);
    const poisons = enemy.poison ??= {};
    const infection = poisons[tower.id];
    if (infection) {
      infection.expiresUs = expiresUs;
      infection.skillId = poison;
    } else {
      poisons[tower.id] = { expiresUs, nextUs: now + us(1), skillId: poison };
      scheduleEvent(state.queue, us(1), { type: "poison-tick", towerId: tower.id, enemyId: enemy.id });
    }
    enemy.poisonAttackSlow = { amount: .2, expiresUs: Math.max(expiresUs, ...Object.values(poisons).map(infection => infection.expiresUs)) };
  }
  if (/^E00[56]$|^E02[78]$/.test(shot.sourceTemplate) &&
      targetable(enemy, ["ground", "air", "mechanical"], state.queue.nowUs) &&
      !enemy.abilities?.some(id => id === "Aloc" || id === "Avul" || id === "Aeth")) {
    const duration = us(nativeAttackEffectHero(enemy) ? 2 : 3);
    enemy.dragonFrost = { factor: .6, attackPenalty: .6, expiresUs: state.queue.nowUs + duration };
    scheduleEvent(state.queue, duration, { type: "frost-expire", enemyId: enemy.id });
  }
  if (primary && !shot.secondary && /^n24[0-2]$/.test(shot.sourceTemplate) &&
      targetable(enemy, ["ground", "air", "ward", "structure", "mechanical"], state.queue.nowUs) &&
      !enemy.abilities?.some(id => id === "Aloc" || id === "Avul" || id === "Aeth")) {
    const value = ([10, 25, 40] as const)[Number(shot.sourceTemplate.at(-1))];
    enemy.nativeCorrosion = { value, untilUs: state.queue.nowUs + us(5) };
  }
  if (primary && shot.corrosion && (!enemy.corrosion || enemy.corrosion.untilUs <= state.queue.nowUs ||
      shot.corrosion >= enemy.corrosion.value)) {
    enemy.corrosion = { value: shot.corrosion, untilUs: state.queue.nowUs + us(5) };
  }
  if (primary && (shot.frost || shot.heroFrostRank) && !magicImmune(enemy)) {
    const rank = shot.heroFrostRank;
    const duration = us(rank ? (/^[A-Z]/.test(enemy.unitId) || enemy.abilities?.includes("Arsk") ?
      rank / 2 : Math.ceil(rank / 2)) : 3);
    enemy.coldArrow = { factor: 1 - (rank ? rank / 10 : shot.frost!), expiresUs: state.queue.nowUs + duration };
    scheduleEvent(state.queue, duration, { type: "frost-expire", enemyId: enemy.id });
  }
  const arcaneOrbPaid = shot.arcaneOrbPaid === true && primary && !shot.secondary && organicWaveTarget(state, enemy);
  if (arcaneOrbPaid) {
    const untilUs = state.queue.nowUs + us(.01);
    enemy.arcanePoisonUntilUs = untilUs;
    scheduleEvent(state.queue, us(.01), { type: "arcane-poison-end", enemyId: enemy.id, untilUs });
  }
  damageEnemy(state, tower, shot.sourceTemplate, enemy,
    physicalDamage(damage, shot.weapon.attackType, armorAt(state, enemy), !!enemy.welfare), "weapon",
    undefined, tower, false, undefined, 1, arcaneOrbPaid);
}

function interruptEnemyCast(state: Match, enemy: Enemy) {
  if (enemy.spellCastingUntilUs !== undefined) {
    for (const { timerId, payload } of [...state.queue.pending]) {
      if (payload.type === "enemy-cast" && payload.enemyId === enemy.id) cancelEvent(state.queue, timerId);
    }
    delete enemy.spellCastingUntilUs;
  }
}

function applyStoneGaze(state: Match, tower: Construction, enemy: Enemy) {
  if (enemy.hp <= 0 || enemy.stoneGaze?.paused) return;
  const now = state.queue.nowUs;
  const duration = us(mapBoss(enemy) ? .2 : 1);
  const timerId = scheduleEvent(state.queue, duration, { type: "stone-gaze-end", enemyId: enemy.id });
  const stone = enemy.stoneGaze ??= { paused: false, timers: {} };
  stone.timers[timerId] = now + duration;
  stone.paused = true;
  stone.frozenFrameUs = now;
  stone.crystalline = tower.templateId === "G043";
  interruptEnemyCast(state, enemy);
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
  if (main && !shot.secondary) {
    const lycanRank = lycanFormRanks.get(shot.sourceTemplate);
    if (lycanRank && rollPercent(state) <= 10 + 5 * lycanRank) multiplier = Math.max(multiplier, 4.5);
    if (shot.sourceTemplate === "b155" && rollPercent(state) <= 35) multiplier = Math.max(multiplier, 3);
  }
  if (main && !shot.secondary && shot.blademasterCritRank && rollPercent(state) <= blademasterCriticalChance[shot.blademasterCritRank - 1]) {
    multiplier = Math.max(multiplier, blademasterCriticalMultiplier[shot.blademasterCritRank - 1]);
  }
  const coupRank = shot.coupCritRank ?? shot.summon?.criticalRank;
  if (main && !shot.secondary && coupRank && rollPercent(state) <= 10) {
    multiplier = Math.max(multiplier, [10, 14, 18, 22, 25, 30][coupRank - 1]);
  }
  if (main && !shot.secondary && shot.doomCritRank && rollPercent(state) <= 10) {
    multiplier = Math.max(multiplier, [10, 14, 18, 22][shot.doomCritRank - 1]);
  }
  const wraithRank = shot.wraithCritRank;
  if (main && !shot.secondary && wraithRank && rollPercent(state) <= wraithCriticalChance[wraithRank - 1]) {
    multiplier = Math.max(multiplier, wraithCriticalMultiplier[wraithRank - 1]);
  }
  let sureHit = monkeyTemplates.has(shot.sourceTemplate) ||
    !!(main && !shot.secondary && shot.summon?.trueHit && rollPercent(state) <= shot.summon.trueHit);
  const attacker = main && !shot.secondary && !shot.summon ? firingUnit(state, shot.towerId) : undefined;
  const jingu = attacker ? jinguRank(attacker, state.queue.nowUs) : 0;
  if (jingu && rollPercent(state) <= 100) {
    multiplier = Math.max(multiplier, jinguMultipliers[jingu - 1]);
    sureHit = true;
  }
  let fixedBonus = 0;
  if (main && shot.divineCritical && !shot.secondary && rollPercent(state) <= shot.divineCritical.chance) {
    multiplier = Math.max(multiplier, shot.divineCritical.multiple);
  }
  if (main && !shot.secondary && shot.attackEquipment?.length) {
    const criticalItems = [
      { id: "i141", chance: 70, multiple: 1, bonus: 1, sureHit: true },
      { id: "i213", chance: 20, multiple: 2, bonus: 0, sureHit: false },
      { id: "i215", chance: 25, multiple: 3.8, bonus: 0, sureHit: true },
      { id: "i322", chance: 70, multiple: 1, bonus: 1, sureHit: true },
      { id: "i306", chance: 50, multiple: 1, bonus: 1, sureHit: true },
    ];
    const gear = shot.attackEquipment;
    const checks = coupRank ? gear.flatMap(item => criticalItems.filter(profile => profile.id === item)) :
      criticalItems.flatMap(profile => gear.filter(item => profile.id === item).map(() => profile));
    for (const profile of checks) {
      if (rollPercent(state) > profile.chance) continue;
      multiplier = Math.max(multiplier, profile.multiple);
      fixedBonus += profile.bonus;
      sureHit ||= profile.sureHit;
    }
  }
  return { multiplier, sureHit, fixedBonus };
}

const waterBounceCount = new Map([["n246", 3], ["n247", 4], ["n248", 5]]);

function continueWeaponBounce(state: Match, shot: WeaponShot, from: Point, visited: number[], remaining: number) {
  if (!remaining || state.phase !== "running" || !firingUnit(state, shot.summon?.id ?? shot.towerId)) return;
  const radius = shot.moonGlaiveRank ? 500 : 400;
  const retention = shot.moonGlaiveRank ? [.7, .76, .82, .88, .94, 1][shot.moonGlaiveRank - 1] : .85;
  let next: Enemy | undefined;
  for (const enemy of state.enemies) {
    if ((next && enemy.id > next.id) || visited.includes(enemy.id) ||
        (enemy.x - from.x) ** 2 + (enemy.y - from.y) ** 2 > radius ** 2 ||
        !canSeeEnemy(state, enemy) || !weaponTargetable(enemy, shot.weapon, state.queue.nowUs)) continue;
    next = enemy;
  }
  if (!next) return;
  scheduleWeaponImpact(state, { towerId: shot.towerId, sourceTemplate: shot.sourceTemplate, weapon: shot.weapon,
    ...(shot.summon ? { summon: shot.summon } : {}), targetId: next.id, raw: shot.raw * retention, point: from, destination: { x: next.x, y: next.y },
    ...(shot.moonGlaiveRank ? { moonGlaiveRank: shot.moonGlaiveRank } : {}),
    secondary: true, bounce: { remaining: remaining - 1, visited: [...visited, next.id] } });
}

function finishWeapon(state: Match, shot: WeaponShot) {
  const { weapon } = shot;
  const dragonSplash = weapon.kind === "msplash" && /^E00[3-6]$|^E02[5-8]$/.test(shot.sourceTemplate);
  if (weapon.kind === "artillery") recordBattleAnimation(state, shot.destination, shot.sourceTemplate, "artillery-impact");
  const main = state.enemies.find(enemy => enemy.id === shot.targetId && weaponTargetable(enemy, weapon, state.queue.nowUs));
  if (shot.bounce) {
    if (!main || !canSeeEnemy(state, main) || ordinaryMiss(state, main)) return;
    const from = { x: main.x, y: main.y };
    applyWeaponDamage(state, shot, main, 1);
    continueWeaponBounce(state, shot, from, shot.bounce.visited, shot.bounce.remaining);
    return;
  }
  const { multiplier, sureHit, fixedBonus } = shot.artilleryCritical ?? (dragonSplash && !main ?
    { multiplier: 1, sureHit: false, fixedBonus: 0 } : rollWeaponCritical(state, shot, main));
  const rawBeforeCritical = shot.raw;
  shot.raw *= multiplier;
  const shotAgainst = (enemy: Enemy) => !shot.secondary && multiplier < 1.5 && activeSoulBurn(enemy, state.queue.nowUs)?.itemId === "i226"
    ? { ...shot, raw: rawBeforeCritical * 1.5 } : shot;
  shot.fixedHitBonus = fixedBonus;
  if (!weapon.splash) {
    if (main && (sureHit || !ordinaryMiss(state, main))) {
      const from = { x: main.x, y: main.y };
      const resolved = shotAgainst(main);
      applyWeaponDamage(state, resolved, main, 1);
      const count = !shot.secondary && weapon.kind === "mbounce" ? shot.moonGlaiveRank ? 3 : waterBounceCount.get(shot.sourceTemplate) : undefined;
      if (count) continueWeaponBounce(state, shot.moonGlaiveRank ? shot : resolved, from, [main.id], count);
    }
    return;
  }
  const ring = (point: Point) => weapon.splash!.find(([radius]) =>
    (point.x - shot.destination.x) ** 2 + (point.y - shot.destination.y) ** 2 <= radius ** 2);
  const artilleryVictims = weapon.kind === "artillery" || dragonSplash ? state.enemies.filter(enemy =>
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
      if (sureHit || !shot.artilleryMiss) applyWeaponDamage(state, shotAgainst(main), main, mainBand[1]);
    } else {
      if (!sureHit && ordinaryMiss(state, main)) return;
      applyWeaponDamage(state, shotAgainst(main), main, 1);
    }
  }
  if (artilleryVictims) {
    for (const id of artilleryVictims) {
      if (state.phase !== "running") break;
      const enemy = state.enemies.find(entry => entry.id === id);
      if (!enemy || !weaponTargetable(enemy, weapon, state.queue.nowUs, weapon.splashTargets!)) continue;
      const band = ring(enemy);
      if (band) applyWeaponDamage(state, shotAgainst(enemy), enemy, band[1], false);
    }
    return;
  }
  for (const enemy of [...state.enemies]) {
    if (state.phase !== "running") break;
    if (enemy.id === main?.id || !weaponTargetable(enemy, weapon, state.queue.nowUs, weapon.splashTargets!)) continue;
    const band = ring(enemy);
    if (band) applyWeaponDamage(state, shotAgainst(enemy), enemy, band[1], false);
  }
}

function scheduleWeaponImpact(state: Match, shot: WeaponShot) {
  const distance = Math.hypot(shot.destination.x - shot.point.x, shot.destination.y - shot.point.y);
  const travel = us(distance / shot.weapon.speed);
  const delay = shot.weapon.homing ? Math.min(movementStepUs, travel) : travel;
  scheduleEvent(state.queue, distance > 0 ? Math.max(1, delay) : 0, { type: "weapon-impact", shot, travelUs: delay });
}

function advanceWeaponShot(state: Match, shot: WeaponShot, travelUs: number) {
  if ((!shot.summon || shot.bounce) && !firingUnit(state, shot.summon?.id ?? shot.towerId)) return;
  if (shot.weapon.homing) {
    const target = state.enemies.find(enemy => enemy.id === shot.targetId && weaponTargetable(enemy, shot.weapon, state.queue.nowUs));
    const dragonSplash = shot.weapon.kind === "msplash" && /^E00[3-6]$|^E02[5-8]$/.test(shot.sourceTemplate);
    if (!target && !dragonSplash) {
      if (shot.weapon.splash) finishWeapon(state, shot);
      return;
    }
    if (target) shot.destination = { x: target.x, y: target.y };
    const { x, y } = shot.destination;
    const distance = Math.hypot(x - shot.point.x, y - shot.point.y);
    const step = shot.weapon.speed * travelUs / 1_000_000;
    if (distance > step + shot.weapon.speed / 1_000_000) {
      shot.point.x += (x - shot.point.x) * step / distance;
      shot.point.y += (y - shot.point.y) * step / distance;
      scheduleWeaponImpact(state, shot);
      return;
    }
  }
  finishWeapon(state, shot);
}

function splitArrowRank(tower: Construction) {
  const skillId = tower.templateId === "G035" ? "A099" : tower.templateId === "G043" ? "A097" : "A005";
  return tower.hero?.ranks[skillId] ?? 0;
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
  const manual = tower.attack.manualFlame ? attackOrb(tower) : undefined;
  const artillery = tower.attack.artillery;
  const point = artillery && weapon.kind === "artillery" ? artilleryPoint(state, tower, weapon, artillery) : target;
  if (!point || !artillery && (!target || !canSeeEnemy(state, target) ||
      (tower.attack.manualFlame ? !manual || !flameWeapon(state, tower, target, manual) :
        !inWeaponRange(tower, target, weapon, weaponRange(weapon, gear, tower), true, state.queue.nowUs)))) return;
  const activeFlak = tower.flak;
  const flak = activeFlak && (tower.attack.flakToken === activeFlak.timerId || reserveFlakRound(state, tower) === activeFlak.timerId);
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
  const wraithRank = illusion ? tower.summon?.wraithCritRank : hero?.ranks.A035;
  const coupRank = illusion ? tower.summon?.criticalRank : hero?.ranks.A027;
  const moonGlaiveRank = hero?.ranks.A052 ?? tower.summon?.moonGlaiveRank;
  const blademasterRank = hero?.ranks.A044 ?? tower.summon?.blademasterCritRank;
  const amount = (base + rollDice(state, weapon.dice, weapon.sides)) * (1 + percent) + fixed;
  const frost = /^n00[6-9]$|^n010$/.test(tower.templateId)
    ? [0.06, 0.08, 0.10, 0.12, 0.15][Number(tower.templateId.slice(1)) - 6] : undefined;
  const shot: WeaponShot = {
    towerId: tower.summon?.independent ? towerId : tower.summon?.ownerId ?? towerId,
    ...(frost === undefined ? {} : { frost }),
    ...(wraithRank ? { wraithCritRank: wraithRank } : {}),
    ...(coupRank ? { coupCritRank: coupRank } : {}),
    ...(moonGlaiveRank ? { moonGlaiveRank } : {}),
    ...(blademasterRank ? { blademasterCritRank: blademasterRank } : {}),
    ...(tower.doomBorrowed?.id === "T304" ? { doomCritRank: tower.doomBorrowed.rank } : {}),
    sourceTemplate: tower.templateId, weapon, raw: amount * (illusion ? tower.summon?.output ?? .4 : 1),
    point: { x: tower.x, y: tower.y }, destination: { x: point.x, y: point.y },
  };
  if (tower.summon && !tower.summon.independent) {
    const { skillId } = tower.summon;
    shot.summon = { id: tower.id, point: { ...shot.point }, banner: !illusion && !!banner,
      ...(skillId ? { skillId } : {}), ...(illusion ? { illusion } : {}),
      ...(tower.summon.output === undefined ? {} : { output: tower.summon.output }),
      ...(tower.summon.criticalRank ? { criticalRank: tower.summon.criticalRank } : {}),
      ...(tower.spiritOrder?.sureHit ? { trueHit: 100 } :
        weapon.kind === "normal" && tower.summon.green > 0 ? { trueHit: Math.round(50 * tower.summon.green) } : {}) };
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
  if (coupRank && !illusion) attackEquipment.sort((left, right) => left.id - right.id);
  if (illusion) shot.attackEquipment = tower.summon?.criticalItems;
  else if (attackEquipment.length) shot.attackEquipment = attackEquipment.map(item => item.itemId);
  if (form?.id === "P213") shot.divineCritical = { chance: divineField(form.id, "DataA", form.stars),
    multiple: divineField(form.id, "DataB", form.stars) };
  const corrosion = !flak && targetable(target, ["ground", "air", "ward"], state.queue.nowUs) ?
    gear.some(item => item.itemId === "i188") ? 70 : gear.some(item => item.itemId === "i186") ? 25 : undefined : undefined;
  const flame = flak ? undefined : attackOrb(tower);
  let orb = flak ? undefined : manual;
  if (!flak && manual) shot.orbBonus = manual.bonus;
  else if (corrosion) shot.corrosion = corrosion;
  else if (flame && flameTargetable(state, tower, target, flame.range) &&
      (flame.id !== "A083" || organicWaveTarget(state, target))) {
    if (tower.attack.flameBonus) shot.orbBonus = tower.attack.flameBonus;
    else if (flame.cost && (tower.flameArrows ?? flame.defaultAuto)) {
      syncMana(state, tower);
      if (tower.mana! >= flame.cost) {
        tower.mana! -= flame.cost;
        shot.orbBonus = flame.bonus;
        orb = flame;
      }
    }
  }
  if (orb?.frostRank) shot.heroFrostRank = orb.frostRank;
  if (orb?.id === "A083") shot.arcaneOrbPaid = true;
  if (shot.orbBonus || shot.heroFrostRank || shot.arcaneOrbPaid) shot.weapon = { ...weapon, homing: true, speed: 1500 };
  if (weapon.kind === "artillery") {
    shot.artilleryCritical = rollWeaponCritical(state, shot, target);
    shot.artilleryMiss = !shot.artilleryCritical.sureHit && ordinaryMiss(state, target);
  }
  if (weapon.kind === "normal") finishWeapon(state, { ...shot });
  else scheduleWeaponImpact(state, shot);

  if (flak) {
    const at = state.queue.nowUs;
    const victims = state.enemies.filter(enemy => enemy !== target && canSeeEnemy(state, enemy) && weaponTargetable(enemy, weapon, at) &&
      (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 1000 ** 2).sort((left, right) => left.id - right.id);
    const cannon: Weapon = { ...weapon, speed: 1600, homing: true };
    for (const enemy of victims.slice(0, 9_999_999)) {
      scheduleWeaponImpact(state, { towerId: tower.id, sourceTemplate: tower.templateId, weapon: cannon,
        raw: 1, secondary: true, targetId: enemy.id, point: { ...shot.point }, destination: { x: enemy.x, y: enemy.y } });
      recordBattleAnimation(state, tower, "T217", "model-effect", enemy);
    }
  }

  const splitRank = splitArrowRank(tower);
  const group = tower.summon?.projectileGroup ??
    (splitRank ? { extra: [2, 3, 4, 5, 6, 8][splitRank - 1], range: 1300, speed: 1200, budget: 99_999_999 } :
      /^b13[2-7]$/.test(tower.templateId) ? { extra: 3, range: 700, speed: 900 } : undefined);
  if (group && state.queue.nowUs >= (tower.multishotReadyUs ?? 0)) {
    tower.multishotReadyUs = state.queue.nowUs + us(2);
    const others = state.enemies.filter(enemy => enemy.id !== targetId && canSeeEnemy(state, enemy) &&
      weaponTargetable(enemy, weapon, state.queue.nowUs) && (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= group.range ** 2)
      .sort((left, right) => left.id - right.id);
    let budget = group.budget ?? 9_999_999;
    for (const enemy of others.slice(0, group.extra)) {
      const raw = Math.min(shot.raw, budget);
      if (raw <= 0) break;
      budget -= raw;
      scheduleWeaponImpact(state, { ...shot, raw, secondary: true, targetId: enemy.id, point: { ...shot.point },
        weapon: { ...shot.weapon, speed: group.speed, homing: true }, destination: { x: enemy.x, y: enemy.y } });
      if (tower.summon?.skillId === "A209") recordBattleAnimation(state, tower, "N731", "model-effect", enemy);
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

export const heroSkins = [
  { choice: "S382", unlock: "k178", from: "H060", to: "G078", name: "炼狱魔王",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S322", unlock: "k202", from: "H050", to: "G071", name: "恐惧之主",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S262", unlock: "k164", from: "H046", to: "G065", name: "烈焰双刃",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S402", unlock: "k182", from: "H051", to: "G080", name: "矮人轰炸机",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S372", unlock: "k176", from: "H003", to: "G077", name: "烈焰之鳞",
    skills: { A010: "A239" } as Readonly<Record<string, string>> },
  { ...firelordSkin, name: "火焰领主", skills: firelordSkillSlots },
  { choice: "S282", unlock: "k167", from: "H040", to: "G068", name: "魔法终结者（敌法师）",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S332", unlock: "k203", from: "H041", to: "G072", name: "猫耳奥蕾莉亚",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S072", unlock: "k138", from: "H014", to: "G038", name: "幻灵亡师",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S073", unlock: "k149", from: "H014", to: "G050", name: "死神",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S172", unlock: "k153", from: "H015", to: "G055", name: "玛法里奥",
    skills: { A049: "A130" } as Readonly<Record<string, string>> },
  { choice: "S352", unlock: "k174", from: "H058", to: "G075", name: "变体漩涡",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S342", unlock: "k172", from: "H016", to: "G074", name: "新月骑士",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S162", unlock: "k152", from: "H001", to: "G053", name: "灵魂收割者",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S012", unlock: "k112", from: "H019", to: "G012", name: "蚩尤",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S013", unlock: "k113", from: "H019", to: "G049", name: "奴良陆生",
    skills: { A061: "A119", A062: "A121", A063: "A118" } as Readonly<Record<string, string>> },
  { choice: "S014", unlock: "k114", from: "H019", to: "G054", name: "犬夜叉",
    skills: { A061: "A128" } as Readonly<Record<string, string>> },
  { choice: "S042", unlock: "k135", from: "H002", to: "G035", name: "琴弓媚姬",
    skills: { A005: "A099" } as Readonly<Record<string, string>> },
  { choice: "S043", unlock: "k143", from: "H002", to: "G043", name: "桔梗",
    skills: { A005: "A097" } as Readonly<Record<string, string>> },
  { choice: "S152", unlock: "k151", from: "H007", to: "G052", name: "无双魅影",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S092", unlock: "k140", from: "H013", to: "G040", name: "克劳德",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S093", unlock: "k141", from: "H013", to: "G041", name: "因陀罗",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S062", unlock: "k137", from: "H006", to: "G037", name: "利爪熊将",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S202", unlock: "k144", from: "H009", to: "G044", name: "深海暴徒",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S082", unlock: "k139", from: "H004", to: "G039", name: "冰晶少女",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S142", unlock: "k150", from: "H011", to: "G051", name: "哥布林杀手",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S143", unlock: "k161", from: "H011", to: "G063", name: "暗礁守卫",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S122", unlock: "k147", from: "H008", to: "G047", name: "丛林之半神",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S112", unlock: "k146", from: "H010", to: "G046", name: "冥魂将军",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S032", unlock: "k132", from: "H017", to: "G032", name: "赤色大将",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S033", unlock: "k133", from: "H017", to: "G033", name: "黑兽战魁",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S044", unlock: "k165", from: "H017", to: "G067", name: "武圣",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S102", unlock: "k142", from: "H025", to: "G042", name: "白胡子",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S292", unlock: "k168", from: "H026", to: "G069", name: "黑曜御灵者",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S182", unlock: "k154", from: "H028", to: "G056", name: "情报窃取者",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S222", unlock: "k158", from: "H030", to: "G060", name: "吸血鬼伯爵",
    skills: { A103: "A176" } as Readonly<Record<string, string>> },
  { choice: "S312", unlock: "k169", from: "H045", to: "G070", name: "红袍贤者",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S022", unlock: "k122", from: "H020", to: "G022", name: "冥灵之影",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S362", unlock: "k175", from: "H052", to: "G076", name: "寒霜领主",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S232", unlock: "k159", from: "H042", to: "G061", name: "末日机甲",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S242", unlock: "k160", from: "H037", to: "G062", name: "铁血将军",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S252", unlock: "k163", from: "H039", to: "G064", name: "黑暗教徒",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S392", unlock: "k179", from: "H059", to: "G079", name: "幽萌鬼灵",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S132", unlock: "k148", from: "H031", to: "G048", name: "众神之王",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S052", unlock: "k136", from: "H024", to: "G036", name: "齐天大圣",
    skills: {} as Readonly<Record<string, string>> },
  { choice: "S192", unlock: "k155", from: "H033", to: "G057", name: "森林妖精",
    skills: { A112: "A142" } as Readonly<Record<string, string>> },
  { choice: "S193", unlock: "k156", from: "H033", to: "G058", name: "樱花妖精",
    skills: { A112: "A143" } as Readonly<Record<string, string>> },
  { choice: "S272", unlock: "k545", from: "H022", to: "G066", name: "希尔瓦娜斯",
    skills: { A071: "A184" } as Readonly<Record<string, string>> },
  { choice: "S273", unlock: "k204", from: "H022", to: "G073", name: "夜影游侠",
    skills: { A071: "A211", A070: "A210" } as Readonly<Record<string, string>> },
];

function chooseSkin(state: Match, towerId: number, choice: string): Result {
  const tower = state.structures.find(entry => entry.id === towerId);
  const skin = heroSkins.find(skin => skin.choice === choice && skin.from === tower?.templateId);
  if (!skin || !tower?.hero || tower.pending) return { ok: false, reason: "missing" };
  if (state.queue.nowUs < Math.max(tower.stunnedUntilUs ?? 0, tower.heroCastUntilUs ?? 0)) {
    return { ok: false, reason: "cooldown" };
  }
  syncMana(state, tower);
  const target = tower.hero;
  if (choice === "S292") {
    triggerSpellEquipment(state, tower, choice);
    const rank = target.ranks.A084;
    if (rank) {
      tower.manaOffset = (tower.manaOffset ?? 0) - 250 * rank;
      syncMana(state, tower);
    }
  }
  for (let slot = 0; slot < 6; slot++) {
    const item = state.inventory?.find(entry => entry.towerId === tower.id && entry.slot === slot);
    if (item && item.itemId !== "i310" && item.itemId !== "i304") dropItem(state, item);
  }
  target.natural.STR += 30 + (choice === "S352" ? target.level + 1 : 0);
  target.natural.AGI += 30;
  target.natural.INT += 30;
  for (const [old, replacement] of Object.entries(skin.skills)) {
    if (Object.hasOwn(target.ranks, old)) {
      target.ranks[replacement] = target.ranks[old];
      delete target.ranks[old];
    }
    if (tower.heroSpellReady && Object.hasOwn(tower.heroSpellReady, old)) {
      tower.heroSpellReady[replacement as HeroSpell] = tower.heroSpellReady[old as HeroSpell];
      delete tower.heroSpellReady[old as HeroSpell];
    }
    if (tower.autoModes && Object.hasOwn(tower.autoModes, old)) {
      tower.autoModes[replacement] = tower.autoModes[old];
      delete tower.autoModes[old];
    }
  }
  target.paid = target.paid.map(id => skin.skills[id] ?? id);
  tower.templateId = skin.to;
  weaponRatesDirty.add(state);
  syncMana(state, tower);
  if (tower.life) syncTowerLife(state, tower);
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
      const tower = firingUnit(state, action.towerId);
      const nativeSlow = action.key === "nativeSlow" && tower && /^n(?:199|200|201)$/.test(tower.templateId);
      const nativeBloodlust = action.key === "nativeBloodlust" && tower &&
        (/^n21[4-7]$/.test(tower.templateId) || tower.templateId === "H018" && !!tower.hero?.ranks.A059);
      if (!tower || !nativeSlow && !nativeBloodlust && !bearAbilities(tower).some(ability => ability.id === action.key) && ![...(towerLevels.get(tower.templateId)?.bindings.map(binding => binding.skillId) ?? []),
        ...Object.keys(tower.hero?.ranks ?? {}), ...(state.inventory ?? []).filter(item => item.towerId === tower.id).map(item => item.itemId)].includes(action.key)) return { ok: false, reason: "missing" };
      (tower.autoModes ??= {})[action.key] = action.enabled;
      if (action.key === "A091") scheduleBountyTracking(state, tower);
      return { ok: true };
    }
    case "focus-target": {
      const tower = itemOwner(state, action.towerId);
      if (!tower || tower.pending || energyCircle(tower)) return { ok: false, reason: "missing" };
      if (action.targetId !== undefined && !state.enemies.some(enemy => enemy.id === action.targetId && canSeeEnemy(state, enemy) &&
        weapons[tower.templateId]?.some(weapon => inWeaponRange(tower, enemy, weapon, weaponRange(weapon, towerGear(state, tower), tower), false, state.queue.nowUs)))) return { ok: false, reason: "range" };
      stopLifeDrain(state, tower);
      stopUpheaval(state, tower);
      tower.focusTarget = action.targetId;
      if (tower.rearmTimer !== undefined || canReplaceFocusCast(state, tower)) stopTowerCast(state, tower);
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
    case "buy-event-box": {
      const box = eventBoxOffers.get(action.offer);
      if (!box) return { ok: false, reason: "missing" };
      if ((state.activityScore ?? 0) < eventBoxCost) return { ok: false, reason: "resources" };
      state.activityScore! -= eventBoxCost;
      return { ok: true, createdId: deliverItem(state, box.usableItem, 1) };
    }
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
      if (previousTower) withdrawBearGear(state, previousTower, item.id);
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
    case "sell-item": {
      const item = state.inventory?.find(item => item.id === action.itemId);
      if (!item) return { ok: false, reason: "missing" };
      const gold = itemSaleQuote(state, item, action.shop);
      if (gold === undefined) return { ok: false, reason: "missing" };
      state.gold += gold;
      removeItem(state, item);
      return { ok: true };
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
      const tower = firingUnit(state, action.towerId);
      if (tower?.bear) return beginBearCast(state, tower, action.skillId);
      return tower ? beginTowerSpell(state, tower, action.skillId, false, action.targetId, action.point) : { ok: false, reason: "missing" };
    }
    case "stop-tower-cast": {
      const tower = firingUnit(state, action.towerId);
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
      const effect = tower && attackOrb(tower);
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
      const tower = itemOwner(state, action.towerId);
      const book = tower && towerGear(state, tower).find(item => item.id === action.itemId);
      if (!tower || !book || tower.pending) return { ok: false, reason: "missing" };
      if (book.itemId === "i255") return useGuldanSkull(state, tower, book);
      if (book.itemId === "i232") return useBlackKingBar(state, tower);
      if (book.itemId === "i272" || book.itemId === "i274") return useMirror(state, tower, book.itemId);
      if (book.itemId === "i207" || book.itemId === "i230") return useTeleportEquipment(state, tower, book, book.itemId, action.point);
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
      const effect = tower && attackOrb(tower);
      if (!tower || !effect || tower.pending) return { ok: false, reason: "missing" };
      tower.flameArrows = !(tower.flameArrows ?? effect.defaultAuto);
      return { ok: true };
    }
    case "toggle-morph": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      return tower ? toggleMorph(state, tower, action.attribute) : { ok: false, reason: "missing" };
    }
    case "cast-hero": {
      const tower = state.structures.find(entry => entry.id === action.towerId);
      if (!tower) return { ok: false, reason: "missing" };
      const { skillId } = action;
      if (skillId === "A068" || skillId === "A149") return activateTreeGrab(state, tower, skillId);
      if (isAccuracySkill(skillId)) return activateAccuracy(state, tower, skillId);
      if (isWispOverload(skillId)) return toggleWispOverload(state, tower, skillId);
      return beginHeroSpell(state, tower, skillId, false, action);
    }
    case "learn-skill": {
      const tower = state.structures.find(tower => tower.id === action.towerId);
      if (!tower?.hero || tower.pending) return { ok: false, reason: "missing" };
      if (!learnHeroSkill(tower.hero, tower.templateId, action.skillId)) return { ok: false, reason: "learning" };
      weaponRatesDirty.add(state);
      if (action.skillId === "A225" && tower.life) syncTowerLife(state, tower);
      if (action.skillId === "A040") tower.flameArrows = true;
      if (action.skillId === "A025") tower.attackSpeedTrainingRank = tower.hero.ranks.A025;
      if (action.skillId === "A193") learnHunterInTheNight(state, tower);
      if (action.skillId === "A127") {
        const bear = currentSpiritBear(state, tower);
        if (bear) bear.permanentAttack = 50 * tower.hero.ranks.A127;
      }
      if (action.skillId === "A006") tower.hero.ranks.T002 = tower.hero.ranks.A006;
      if (action.skillId === "A081") {
        if (tower.hero.ranks.A081 === 1) tower.hero.ranks.T082 = 1;
        if (tower.hero.ranks.T082) tower.permanentAttack = (tower.permanentAttack ?? 0) + 400;
      }
      if (action.skillId === "A084") {
        syncMana(state, tower);
        tower.manaOffset = (tower.manaOffset ?? 0) + 500;
        syncMana(state, tower);
        tower.mana! += 500;
      }
      if (action.skillId === "A164") tower.hero.ranks.T329 = tower.hero.ranks.A164;
      if (action.skillId === "A047") {
        if (tower.heartstopperTimer !== undefined) cancelEvent(state.queue, tower.heartstopperTimer);
        tower.heartstopperTimer = scheduleEvent(state.queue, us(.5), { type: "heartstopper-tick", towerId: tower.id }, us(.5));
      }
      if (action.skillId === "A109") creditGoblinGold(state, tower, 80 * Math.max(1, state.wave));
      if (action.skillId === "A116" && tower.hero.ranks.A116 === 1) {
        if (tower.berserkerBlood) cancelEvent(state.queue, tower.berserkerBlood.timerId);
        const timerId = scheduleEvent(state.queue, us(1), { type: "berserker-blood", towerId: tower.id }, us(1));
        tower.berserkerBlood = { timerId, tier: 0 };
      }
      if (action.skillId === "A030") {
        if (tower.novaTimer !== undefined) cancelEvent(state.queue, tower.novaTimer);
        tower.novaTimer = scheduleEvent(state.queue, us(1), { type: "nova-tick", towerId: tower.id }, us(1));
      }
      if (isWispOverload(action.skillId) && tower.wispOverload) {
        toggleWispOverload(state, tower, action.skillId);
        toggleWispOverload(state, tower, action.skillId);
      }
      if (action.skillId === "A018") refreshManaAuras(state, tower);
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
      if (tower.spiritBear) detachSpiritBear(state, tower);
      if (tower.deathWardId !== undefined) clearDeathWardShots(state, tower.deathWardId);
      if (tower.vacuum) cancelEvent(state.queue, tower.vacuum.timerId);
      if (state.ionShells) {
        for (const [targetId, shell] of Object.entries(state.ionShells)) {
          if (shell.towerId === tower.id || Number(targetId) === tower.id) removeIonShell(state, Number(targetId));
        }
      }
      if (tower.oraclePromise) cancelEvent(state.queue, tower.oraclePromise.timerId);
      if (tower.exorcismToken !== undefined) clearExorcism(state, tower.id, tower.exorcismToken);
      stopLifeDrain(state, tower);
      stopUpheaval(state, tower);
      if (tower.omnislash) endOmnislash(state, tower);
      if (tower.eclipse) endEclipse(state, tower);
      if (tower.berserkerBlood) cancelEvent(state.queue, tower.berserkerBlood.timerId);
      if (tower.innerVitality) cancelEvent(state.queue, tower.innerVitality.timerId);
      const transformation = tower.dragonShape ?? tower.alchemistShape ?? tower.lycanShape;
      if (transformation) {
        cancelEvent(state.queue, transformation.timerId);
        if (transformation.rangeTimerId !== undefined) cancelEvent(state.queue, transformation.rangeTimerId);
      }
      if (tower.goblinGreed) cancelEvent(state.queue, tower.goblinGreed.timerId);
      if (tower.prophetTeleportTimer !== undefined) cancelEvent(state.queue, tower.prophetTeleportTimer);
      if (tower.rearmTimer !== undefined) cancelEvent(state.queue, tower.rearmTimer);
      if (tower.searingChains) cancelEvent(state.queue, tower.searingChains.timerId);
      if (tower.flameGuard) cancelEvent(state.queue, tower.flameGuard.timerId);
      if (tower.firestorm) cancelEvent(state.queue, tower.firestorm.timerId);
      if (tower.pit) cancelEvent(state.queue, tower.pit.timerId);
      if (tower.sleight) cancelEvent(state.queue, tower.sleight.timerId);
      state.structures.splice(index, 1);
      if (emitsManaAura(tower)) refreshManaAuras(state, tower);
      if (diseaseCloudSources.has(tower.templateId) || tower.templateId === "n219" || tower.templateId === "n220" || tower.hero?.ranks.A010 || tower.hero?.ranks.A239) {
        for (const enemy of state.enemies) {
          if (enemy.diseaseClouds) delete enemy.diseaseClouds[tower.id];
          clearPoisonSource(enemy, tower.id);
        }
      }
      interruptWeapon(state, tower);
      if (tower.attack?.timing?.cooldown) cancelEvent(state.queue, tower.attack.timing.cooldown.timerId);
      weaponRatesDirty.add(state);
      if (tower.spellWindup !== undefined) cancelEvent(state.queue, tower.spellWindup);
      if (tower.snow) cancelEvent(state.queue, tower.snow.token);
      if (tower.doomDigestTimer !== undefined) cancelEvent(state.queue, tower.doomDigestTimer);
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
      if (!canChooseOpening(state) || !state.openingCandidates.includes(action.card)) return { ok: false, reason: "opening" };
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
      if (!card || card.bound || summonCards.get(card.card)?.itemFields.droppable !== 1) return { ok: false, reason: "missing" };
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
    case "exchange-hero": {
      const offer = heroExchangeOffers.get(action.offer);
      if (!offer) return { ok: false, reason: "closed" };
      if (offer.cost) {
        if (state.scoreHeroClaimed) return { ok: false, reason: "stock" };
        if (offer.cost > spendableScore(state)) return { ok: false, reason: "resources" };
      } else {
        const claims = state.mallHeroClaims ?? [];
        if (claims.length >= mallHeroLimit(state.wave) || claims.includes(action.offer)) return { ok: false, reason: "stock" };
      }
      const material = state.cards.filter(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === 13)
        .sort((left, right) => left.slot! - right.slot!)[0];
      if (!material) return { ok: false, reason: "materials" };
      state.cards.splice(state.cards.indexOf(material), 1);
      if (offer.cost) {
        state.scoreHeroClaimed = true;
        state.spentScore = (state.spentScore ?? 0) + offer.cost;
      } else (state.mallHeroClaims ??= []).push(action.offer);
      creditTask(state, "spring", 9);
      return { ok: true, createdId: deliverCard(state, offer.card, state.worker, undefined,
        action.offer === "i546" ? true : undefined) };
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
        else deliverCard(state, consumedCard.card, tower, consumedCard.hp, consumedCard.bound);
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

function* moveWorker(state: Match): Generator<void> {
  const approach = state.approach;
  if (!approach) return;
  const range = approach.range ?? 100;
  const worker: Mobile = { ...state.worker, id: 0, layer: "fly", radius: 1,
    speed: 350 * (hasEnduranceAura(state, state.worker) ? 1.1 : 1),
    waypoint: 0, previousWaypoint: null, initialOverlaps: [] };
  const sweep = movementSweep(worker, state.enemies);
  let budget = worker.speed / 32;
  if (!approach.path.length || !sweep(worker, approach.path[0])) {
    approach.path = (approach.command.action.type === "move-worker" ? (yield* findPathSteps(worker, approach.point, sweep))?.points :
      yield* findApproachPathSteps(worker, approach.point, range, sweep)) ?? [];
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
    ...state.structures.map(({ id, x, y, radius }) => ({ id, x, y, radius, layer: "ground" as const })),
    ...(state.summons ?? []).filter(unit => unit.summon?.independent || unit.bear || treantTemplates.has(unit.templateId))
      .map(({ id, x, y, radius, templateId }) => ({ id, x, y, radius: unitBalance.get(templateId)?.collision ?? radius, layer: "ground" as const })),
  ];
}

const synchronizedMotionUs = new WeakMap<Match, number>();

function syncEnemyRoutes(state: Match) {
  const now = state.queue.nowUs;
  if (state.movementAnchorUs === undefined || synchronizedMotionUs.get(state) === now) return;
  for (const enemy of state.enemies) {
    const span = enemy.routeSpan;
    if (!span) continue;
    const { from, to, fromUs, untilUs } = span;
    if (now >= untilUs) {
      enemy.x = to.x;
      enemy.y = to.y;
    } else if (now <= fromUs || from === to) {
      enemy.x = from.x;
      enemy.y = from.y;
    } else {
      const ratio = (now - fromUs) / (untilUs - fromUs);
      enemy.x = from.x + (to.x - from.x) * ratio;
      enemy.y = from.y + (to.y - from.y) * ratio;
    }
  }
  synchronizedMotionUs.set(state, now);
}

function* publishEnemyRoutes(state: Match, corner?: Enemy): Generator<void> {
  const now = state.queue.nowUs;
  const anchor = state.movementAnchorUs;
  const enemies = corner ? [corner] : [...state.enemies].sort((left, right) => left.id - right.id);
  refreshShadowWind(state, enemies);
  refreshUpheavalSlows(state, enemies);
  yield;
  const waiting = new Set<number>();
  for (const enemy of enemies) {
    const previous = enemy.routeSpan;
    if (anchor !== undefined && previous?.untilUs === now && previous.endsAt !== undefined &&
        previous.timerId !== undefined && state.queue.pending.some(event => event.timerId === previous.timerId && event.dueUs === now)) {
      waiting.add(enemy.id);
    }
  }
  const proposed: { enemy: Enemy; plan: RoutePlan; overlaps: number[]; blocked: boolean }[] = [];

  if (anchor !== undefined) {
    const ground = enemies.some(enemy => enemy.layer === "ground");
    const phasing = new Set(state.enemies.filter(enemy => enemyIsInvisible(enemy, now)).map(enemy => enemy.id));
    const solidEnemies = state.enemies.filter(enemy => !phasing.has(enemy.id));
    const obstacles = ground ? [...solidEnemies, ...groundAllies(state)] : solidEnemies;
    const blocked = ground ? state.structures.filter(tower => footprintTowers.has(tower.templateId)).map(buildFootprint) : [];
    const candidates = movementCandidates(obstacles);
    const byId = new Map(obstacles.map(unit => [unit.id, unit]));
    const published = new Map<number, { enemy: Enemy; span: RouteSpan }>();
    if (corner) for (const enemy of solidEnemies) {
      if (enemy !== corner && enemy.routeSpan) published.set(enemy.id, { enemy, span: enemy.routeSpan });
    }
    // Only already published paths can intersect a proposed span. Their remaining displacement bounds the spatial query.
    let expansion = 0;
    if (typeof candidates === "function") for (const { enemy, span: { to } } of published.values()) {
      expansion = Math.max(expansion, Math.hypot(to.x - enemy.x, to.y - enemy.y));
    }
    for (const enemy of enemies) {
      yield;
      if (waiting.has(enemy.id)) continue;
      const phased = phasing.has(enemy.id);
      const firstOverlaps = enemy.initialOverlaps.length ? enemy.initialOverlaps.filter(id => {
        const other = byId.get(id);
        return other !== undefined && overlaps(enemy, other);
      }) : enemy.initialOverlaps;
      const plan = yield* planRouteSpan(enemy, phased ? [] : candidates, blocked, firstOverlaps, now, anchor);
      const { span } = plan;
      if (phased) span.phased = true;
      let conflict = false;
      if (span.from.x !== span.to.x || span.from.y !== span.to.y) {
        const padding = enemy.radius + expansion;
        const neighbors = typeof candidates === "function" ? candidates(enemy.layer,
          Math.min(span.from.x, span.to.x) - padding, Math.min(span.from.y, span.to.y) - padding,
          Math.max(span.from.x, span.to.x) + padding, Math.max(span.from.y, span.to.y) + padding) : obstacles;
        if (!phased) for (const neighbor of neighbors) {
          const other = published.get(neighbor.id);
          if (other?.enemy.layer === enemy.layer && routeSpansOverlap(enemy, span, other.enemy, other.span)) {
            conflict = true;
            break;
          }
        }
        if (conflict) {
          plan.span = { from: span.from, to: span.from, fromUs: now, untilUs: anchor, rate: span.rate };
        } else if (!phased) {
          published.set(enemy.id, { enemy, span });
          if (typeof candidates === "function") expansion = Math.max(expansion, Math.hypot(span.to.x - span.from.x, span.to.y - span.from.y));
        }
      }
      proposed.push({ enemy, plan, overlaps: firstOverlaps, blocked: conflict });
    }
  }
  yield;
  for (const enemy of enemies) {
    if (enemy.shadowWindTimer !== undefined) {
      cancelEvent(state.queue, enemy.shadowWindTimer);
      delete enemy.shadowWindTimer;
    }
    if (waiting.has(enemy.id)) continue;
    if (enemy.routeSpan?.timerId !== undefined) cancelEvent(state.queue, enemy.routeSpan.timerId);
    delete enemy.routeSpan;
  }
  if (anchor === undefined) return;
  for (const { enemy, plan, overlaps: firstOverlaps, blocked } of proposed) {
    if (enemy.initialOverlaps.length) enemy.initialOverlaps = firstOverlaps;
    if (plan.regions) enemy.insideRegions = plan.regions;
    if (plan.path) enemy.path = plan.path.points;
    const { span } = plan;
    if (span.endsAt !== undefined && span.untilUs < anchor) {
      span.timerId = scheduleEvent(state.queue, span.untilUs - now, { type: "move-route", enemyId: enemy.id });
    }
    enemy.routeSpan = span;
    if (!blocked && (state.shadowWindAuras || state.upheavalAuras)) scheduleSlowAuraBoundary(state, enemy, span);
  }
  if (corner) {
    rescheduleSweepContact(state, corner);
    return;
  }
  // A changed route can add an earlier contact than any pending sweep query.
  const pending = state.queue.pending.flatMap(({ payload, dueUs, timerId }) =>
    payload.type === "spell-sweep" && dueUs > now ? [{ payload, timerId }] : []);
  pending.sort((left, right) => (left.payload.sweep.order ?? left.timerId) - (right.payload.sweep.order ?? right.timerId));
  for (const { payload, timerId } of pending) {
    cancelEvent(state.queue, timerId);
    scheduleEvent(state.queue, 0, payload);
  }
}

function routeNeedsPublication(state: Match, enemy: Enemy) {
  const now = state.queue.nowUs;
  const span = enemy.routeSpan;
  if (!span || span.rate !== movementRate(enemy) || !!span.phased !== !!enemyIsInvisible(enemy, now)) return true;
  const { from, to, fromUs, untilUs } = span;
  if (now >= untilUs) return to.x !== enemy.x || to.y !== enemy.y;
  if (now <= fromUs || from === to) return from.x !== enemy.x || from.y !== enemy.y;
  const ratio = (now - fromUs) / (untilUs - fromUs);
  return from.x + (to.x - from.x) * ratio !== enemy.x || from.y + (to.y - from.y) * ratio !== enemy.y;
}

function routeObstacleKey(state: Match) {
  let key = "";
  for (const tower of state.structures) key += `${tower.id}:${tower.templateId}:${tower.x}:${tower.y}:${tower.radius};`;
  for (const unit of state.summons ?? []) if (unit.summon?.independent || unit.bear) {
    key += `${unit.id}:${unit.templateId}:${unit.x}:${unit.y}:${unit.radius};`;
  }
  return key;
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

// Finish each event, including route publication, before any same-time event
// or input can change the queue. Checkpoints are made only at those boundaries.
type EventWork = { steps: Generator<void, void | false>; inputs: { dueUs: number; command: Command }[] };
const pendingEvent = new WeakMap<Match, EventWork>();

export function eventInProgress(state: Match) {
  return pendingEvent.has(state);
}

function resumeEvent(state: Match, work: EventWork, shouldYield?: () => boolean) {
  let step = work.steps.next();
  while (!step.done) {
    if (shouldYield?.()) {
      pendingEvent.set(state, work);
      return "yield";
    }
    step = work.steps.next();
  }
  pendingEvent.delete(state);
  if (step.value === false) return false;
  for (const { dueUs, command } of work.inputs) {
    scheduleEvent(state.queue, dueUs - state.queue.nowUs, { type: "command", command });
  }
}

export function enqueue(state: Match, command: Command) {
  if (state.phase !== "running" || state.matchId !== command.matchId) return false;
  if (Object.hasOwn(state.commandResults, command.id) || state.approach?.command.id === command.id || state.queue.pending.some(
    ({ payload }) => (payload.type === "command" || payload.type === "commit-talent") && payload.command.id === command.id,
  )) return false;
  // Inputs received during catch-up apply after all already credited time.
  const dueUs = state.clock.targetUs + 1;
  const work = pendingEvent.get(state);
  if (work) {
    if (work.inputs.some(input => input.command.id === command.id)) return false;
    work.inputs.push({ dueUs, command: structuredClone(command) });
  } else {
    scheduleEvent(state.queue, dueUs - state.queue.nowUs, { type: "command", command: structuredClone(command) });
  }
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
  const work = pendingEvent.get(state);
  let stopped = false;
  if (work) {
    const result = resumeEvent(state, work, shouldYield);
    if (result === "yield") return "pending";
    stopped = result === false;
    if (!stopped && shouldYield?.()) return "pending";
  } else if (state.movementAnchorUs !== undefined && state.enemies.some(enemy => routeNeedsPublication(state, enemy))) {
    const result = resumeEvent(state, { steps: publishEnemyRoutes(state), inputs: [] }, shouldYield);
    if (result === "yield") return "pending";
  }
  const advanced = stopped ? "stopped" : advanceEvents(state.queue, state.clock.targetUs, eventLimit, ({ payload, timerId }) =>
    resumeEvent(state, { steps: dispatchEvent(state, payload, timerId), inputs: [] }, shouldYield), shouldYield);
  if (eventInProgress(state)) return "pending";
  syncEnemyRoutes(state);
  if (advanced === "stopped") {
    state.queue.pending.length = 0;
    state.clock.targetUs = state.queue.nowUs;
    state.clock.fractionUs = 0;
    state.spawner = null;
    state.approach = null;
  }
  return advanced;
}

function* dispatchEvent(state: Match, event: MatchEvent, timerId: number): Generator<void, void | false> {
    syncEnemyRoutes(state);
    const terrain = state.movementAnchorUs !== undefined && state.enemies.some(enemy => enemy.layer === "ground") &&
      (event.type === "command" || event.type === "hero-spell" || event.type === "tower-spell" || event.type === "equipment-teleport" ||
       event.type === "wisp-relocate" || event.type === "scepter-swap" || event.type === "summon-expire" || event.type === "bear-cast" ||
       event.type === "doom-blink" || event.type === "finish-construction" || event.type === "sleight-of-fist") ? routeObstacleKey(state) : undefined;
    let refreshRoutes = false;
    let routeCorner: Enemy | undefined;
    switch (event.type) {
      case "worker-benefit": grantWorkerBenefit(state, "J006"); break;
      case "world-night-change": changeWorldNight(state); break;
      case "dark-ascension-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.nightHunter?.personalTimer !== timerId) break;
        delete tower.nightHunter.personalTimer;
        tower.nightHunter.marks = tower.nightHunter.marks.filter(mark =>
          mark !== "T215" && (tower.templateId !== "G071" || (mark !== "T256" && mark !== "T258")));
        switchNightRanks(state, tower);
        break;
      }
      case "void-slow": commitVoidSlow(state, event); break;
      case "void-carrier-expire": break;
      case "void-slow-end": {
        const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (enemy?.voidSlowUntilUs === event.untilUs) delete enemy.voidSlowUntilUs;
        break;
      }
      case "tide-projectile": resolveTideProjectile(state, event); break;
      case "tide-wave-expire":
      case "tide-carrier-expire": break;
      case "tide-corrosion-end": {
        const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (enemy?.tideCorrosion?.untilUs === event.untilUs) delete enemy.tideCorrosion;
        break;
      }
      case "ravage-step": {
        let active = false;
        for (const enemy of state.enemies) {
          if (enemy.ravageLift?.token !== event.token || !event.targets.includes(enemy.id)) continue;
          active = true;
          if (event.step === 80) {
            delete enemy.ravageLift;
            if (event.stuns.includes(enemy.id)) stunEnemy(state, enemy, us(.7 + .3 * event.rank));
          } else enemy.ravageLift.height += event.step <= 40 ? 20 : -20;
        }
        if (active && event.step < 80) scheduleEvent(state.queue, us(.02), { ...event, step: event.step + 1 });
        break;
      }
      case "impale-lift": {
        let active = false;
        for (const enemy of state.enemies) {
          if (enemy.impaleLift?.token !== event.token || !event.targets.includes(enemy.id)) continue;
          active = true;
          if (event.step === 80) delete enemy.impaleLift;
          else enemy.impaleLift.height += event.step <= 40 ? 20 : -20;
        }
        if (active && event.step < 80) scheduleEvent(state.queue, us(.02), { ...event, step: event.step + 1 });
        break;
      }
      case "lion-carrier-expire": break;
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
        yield* moveWorker(state);
        reconcileEquipmentBurn(state);
        const shivasGuard = state.inventory?.some(item => item.itemId === "i155" && item.slot !== null && (item.towerId ?? 0) > 0);
        const freezingFields = Object.values(state.freezingFields ?? {}).filter(field => state.queue.nowUs < field.endsUs);
        for (const enemy of state.enemies) {
          if (freezingFields.length && freezingTarget(state, enemy, true) && freezingFields.some(({ point }) =>
            (point.x - enemy.x) ** 2 + (point.y - enemy.y) ** 2 <= 800 ** 2)) enemy.freezingFieldSlow = true;
          else if (enemy.freezingFieldSlow) delete enemy.freezingFieldSlow;
          if (enemy.poison && !organicPhysicalTarget(state, enemy, ["ground", "air"])) {
            delete enemy.poison;
            delete enemy.poisonAttackSlow;
          }
          if (enemy.doomUntilUs !== undefined && enemy.doomUntilUs <= state.queue.nowUs) delete enemy.doomUntilUs;
          if (enemy.wraithMarkUntilUs !== undefined && enemy.wraithMarkUntilUs <= state.queue.nowUs) delete enemy.wraithMarkUntilUs;
          if (enemy.lichChainSlow && enemy.lichChainSlow.untilUs <= state.queue.nowUs) delete enemy.lichChainSlow;
          if (enemy.doomFrostUntilUs !== undefined && enemy.doomFrostUntilUs <= state.queue.nowUs) delete enemy.doomFrostUntilUs;
          if (enemy.doomWave && enemy.doomWave.untilUs <= state.queue.nowUs) delete enemy.doomWave;
          if (enemy.doomRoarUntilUs !== undefined && enemy.doomRoarUntilUs <= state.queue.nowUs) delete enemy.doomRoarUntilUs;
          if (enemy.bearRoarUntilUs !== undefined && enemy.bearRoarUntilUs <= state.queue.nowUs) delete enemy.bearRoarUntilUs;
          if (enemy.bearRootUntilUs !== undefined && enemy.bearRootUntilUs <= state.queue.nowUs) delete enemy.bearRootUntilUs;
          if (enemy.iceBindingUntilUs !== undefined && enemy.iceBindingUntilUs <= state.queue.nowUs) delete enemy.iceBindingUntilUs;
          if (enemy.hexSourceId === undefined && enemy.hexUntilUs !== undefined && enemy.hexUntilUs <= state.queue.nowUs) delete enemy.hexUntilUs;
          if (enemy.purge) {
            if (state.queue.nowUs >= enemy.purge.endUs || magicImmune(enemy)) delete enemy.purge;
            else if (state.queue.nowUs >= enemy.purge.middleUs) enemy.purge.factor = .5;
          }
          if (enemy.clapSlow && (enemy.clapSlow.untilUs <= state.queue.nowUs || magicImmune(enemy))) delete enemy.clapSlow;
          if (enemy.nativeSlow && (enemy.nativeSlow.untilUs <= state.queue.nowUs || magicImmune(enemy))) delete enemy.nativeSlow;
          if (enemy.bristleGooSlow && magicImmune(enemy)) delete enemy.bristleGooSlow;
          if (enemy.calldownSlow && magicImmune(enemy)) delete enemy.calldownSlow;
          if (enemy.voidSlowUntilUs && magicImmune(enemy)) delete enemy.voidSlowUntilUs;
          if (enemy.tideCorrosion && magicImmune(enemy)) delete enemy.tideCorrosion;
          if (enemy.nativeCorrosion && enemy.nativeCorrosion.untilUs <= state.queue.nowUs) delete enemy.nativeCorrosion;
          if (enemy.howlArmor && (enemy.howlArmor.expiresUs <= state.queue.nowUs || magicImmune(enemy))) delete enemy.howlArmor;
          if (enemy.coldArrow && magicImmune(enemy)) delete enemy.coldArrow;
          if (shivasGuard && nearbyEquipment(state, enemy, ["i155"], 900)) enemy.auraSpeed = .65;
          else if (enemy.auraSpeed !== undefined) delete enemy.auraSpeed;
        }
        const now = state.queue.nowUs;
        if (state.movementAnchorUs !== undefined) {
          for (const enemy of state.enemies) {
            const span = enemy.routeSpan;
            if (span && span.untilUs === now && span.timerId === undefined) completeRouteSpan(enemy, span, () => roll(state));
          }
          const movement = state.queue.pending.find(entry => entry.payload.type === "movement");
          if (movement) {
            state.movementAnchorUs = movement.dueUs;
            refreshRoutes = true;
          } else {
            delete state.movementAnchorUs;
            yield* publishEnemyRoutes(state);
          }
        } else {
          const phasing = new Set(state.enemies.filter(enemy => enemyIsInvisible(enemy, now)).map(enemy => enemy.id));
          if (state.enemies.some(enemy => enemy.layer === "ground")) {
            moveUnits(state.enemies, () => roll(state),
              state.structures.filter(tower => footprintTowers.has(tower.templateId)).map(buildFootprint),
              groundAllies(state), phasing);
          } else {
            moveUnits(state.enemies, () => roll(state), [], [], phasing);
          }
        }
        reconcileDiseaseClouds(state);
        for (const tower of state.structures) {
          scanBountyTracking(state, tower);
          startWeapon(state, tower);
        }
        for (const summon of state.summons ?? []) {
          if (summon.summon?.independent) {
            const { x, y } = summon;
            moveWolf(state, summon);
            if (summon.x !== x || summon.y !== y) {
              refreshWeaponTiming(state, summon);
              if (summon.manaLastUs !== undefined) syncMana(state, summon);
            }
          }
          if (summon.bear) autoBearRoar(state, summon);
          if (summon.spiritOrder) moveExorcismSpirit(state, summon);
          startWeapon(state, summon);
        }
        break;
      }
      case "move-route": {
        const enemy = state.enemies.find(unit => unit.id === event.enemyId);
        const span = enemy?.routeSpan;
        if (enemy && span?.timerId === timerId) {
          completeRouteSpan(enemy, span, () => roll(state));
          delete span.timerId;
          routeCorner = enemy;
        }
        break;
      }
      case "hero-spell":
        finishHeroSpell(state, event);
        if (event.skillId === "A174") refreshRoutes = true;
        break;
      case "fatal-bonds-expire":
        delete state.fatalBonds?.[event.groupId];
        if (state.fatalBonds && !Object.keys(state.fatalBonds).length) delete state.fatalBonds;
        break;
      case "fatal-bonds-carrier-expire":
        if (state.fatalBondsCarrier?.id === event.carrierId) delete state.fatalBondsCarrier;
        break;
      case "upheaval-progress": {
        const aura = state.upheavalAuras?.[event.auraId];
        const tower = aura && firingUnit(state, aura.towerId);
        if (!aura || !tower || tower.upheavalId !== event.auraId || aura.progressTimer !== timerId || (tower.life?.hp ?? 1) <= 0) {
          if (tower?.upheavalId === event.auraId) stopUpheaval(state, tower);
          else cancelEvent(state.queue, timerId);
          break;
        }
        aura.stage = Math.min(3, aura.stage + 1);
        recordBattleAnimation(state, aura, aura.visual, "model-effect").durationUs = us(1);
        refreshUpheavalSlows(state);
        refreshRoutes = true;
        break;
      }
      case "upheaval-expire": {
        const aura = state.upheavalAuras?.[event.auraId];
        if (!aura) break;
        const tower = firingUnit(state, aura.towerId);
        if (tower?.upheavalId === event.auraId) stopUpheaval(state, tower);
        delete state.upheavalAuras![event.auraId];
        refreshUpheavalSlows(state);
        if (!Object.keys(state.upheavalAuras!).length) delete state.upheavalAuras;
        refreshRoutes = true;
        break;
      }
      case "infernal-land": infernalLand(state, event); break;
      case "infernal-immolation": infernalImmolation(state, event.unitId, timerId); break;
      case "nether-blast": {
        const tower = firingUnit(state, event.towerId);
        if (!tower) break;
        recordBattleAnimation(state, event.point, event.visual, "model-effect");
        const targets = state.enemies.filter(enemy =>
          targetable(enemy, ["ground", "air", "structure", "mechanical", "ward"], state.queue.nowUs) &&
          (enemy.x - event.point.x) ** 2 + (enemy.y - event.point.y) ** 2 <= 500 ** 2).sort((a, b) => a.id - b.id);
        for (const enemy of targets) {
          if (state.phase !== "running") break;
          damageEnemy(state, tower, tower.templateId, enemy, event.damage * .8, "magic", "A101");
        }
        break;
      }
      case "decrepify-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.decrepifyUntilUs === event.untilUs) delete target.decrepifyUntilUs;
        break;
      }
      case "life-drain-tick": tickLifeDrain(state, event.towerId, timerId); break;
      case "phantom-spear": resolvePhantomSpear(state, event); break;
      case "phantom-illusion": resolvePhantomIllusion(state, event); break;
      case "phantom-slow-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.phantomSlow?.untilUs === event.untilUs) delete target.phantomSlow;
        break;
      }
      case "bounty-projectile":
        if (resolveBountyProjectile(state, event)) refreshRoutes = true;
        break;
      case "bounty-mark-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.bountyMark?.timerId === timerId) delete target.bountyMark;
        break;
      }
      case "bounty-armor-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.bountyArmor?.timerId === timerId) delete target.bountyArmor;
        break;
      }
      case "bounty-track-scan": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.bountyTrackTimer === timerId) {
          delete tower.bountyTrackTimer;
          scanBountyTracking(state, tower);
        }
        break;
      }
      case "shadow-wind-expire":
        if (state.shadowWindAuras?.[event.auraId]) {
          delete state.shadowWindAuras[event.auraId];
          refreshShadowWind(state);
          if (!Object.keys(state.shadowWindAuras).length) delete state.shadowWindAuras;
          refreshRoutes = true;
        }
        break;
      case "shadow-wind-boundary": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.shadowWindTimer === timerId) {
          delete target.shadowWindTimer;
          refreshShadowWind(state, [target]);
          refreshUpheavalSlows(state, [target]);
          routeCorner = target;
        }
        break;
      }
      case "vacuum-tick": pulseVacuum(state, event.towerId, timerId); break;
      case "vacuum-carrier-expire": break;
      case "ion-shell-tick": pulseIonShell(state, event.targetId, timerId); break;
      case "replica-expire": {
        const enemy = state.enemies.find(unit => unit.id === event.enemyId && unit.replica);
        if (enemy) {
          enemy.hp = 0;
          removeDeadEnemy(state, enemy.id);
        }
        break;
      }
      case "magnus-push": {
        const enemy = state.enemies.find(unit => unit.id === event.enemyId);
        const push = enemy?.magnusPush;
        if (!enemy || enemy.hp <= 0 || push?.timerId !== timerId) {
          cancelEvent(state.queue, timerId);
          break;
        }
        placeMagnusTarget(state, enemy, { x: enemy.x + push.dx * 40, y: enemy.y + push.dy * 40 });
        if (--push.remaining === 0) {
          cancelEvent(state.queue, timerId);
          delete enemy.magnusPush;
        }
        break;
      }
      case "empower-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.empower?.timerId === timerId) delete tower.empower;
        break;
      }
      case "magnus-carrier-expire": break;
      case "oracle-flame-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.oracleFlame?.timerId === timerId) delete target.oracleFlame;
        break;
      }
      case "oracle-edict-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.oracleEdict?.timerId === timerId) delete target.oracleEdict;
        break;
      }
      case "oracle-promise": pulseOraclePromise(state, event.towerId, timerId); break;
      case "oracle-purge-step": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.purge?.endUs === event.untilUs && target.purge.middleUs === event.untilUs) {
          if (event.factor === 1 || magicImmune(target)) delete target.purge;
          else target.purge.factor = event.factor;
        }
        break;
      }
      case "oracle-pause-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.oraclePauseUntilUs === event.untilUs) delete target.oraclePauseUntilUs;
        break;
      }
      case "oracle-carrier-expire": break;
      case "searing-chains":
      case "flame-guard": {
        const tower = firingUnit(state, event.towerId);
        if (tower) pulseEmberSpell(state, tower, event.type === "searing-chains" ? "A178" : "A179", timerId);
        break;
      }
      case "searing-chains-release": {
        const enemy = state.enemies.find(unit => unit.id === event.enemyId);
        if (enemy?.searingChainsUntilUs === event.untilUs) delete enemy.searingChainsUntilUs;
        break;
      }
      case "sleight-of-fist": {
        const tower = firingUnit(state, event.towerId);
        if (tower) advanceSleight(state, tower, event.sequence);
        break;
      }
      case "wild-axes": moveWildAxes(state, event.castId); break;
      case "pit-pulse": {
        const tower = firingUnit(state, event.towerId);
        if (tower) pulsePitSpell(state, tower, event.skillId, timerId);
        break;
      }
      case "firestorm-impact": {
        const tower = firingUnit(state, event.towerId);
        const source = tower ?? { ...event.source, id: event.towerId };
        const template = tower?.templateId ?? "H060";
        recordBattleAnimation(state, event.point, template === "G078" ? "A233G078" : "A233", "model-effect");
        const targets = state.enemies.filter(enemy => enemy.hp > 0 &&
          (enemy.x - event.point.x) ** 2 + (enemy.y - event.point.y) ** 2 <= 600 ** 2).sort((left, right) => left.id - right.id);
        for (const enemy of targets) {
          if (state.phase !== "running") break;
          damageEnemy(state, tower, template, enemy, event.amount * .8, "magic", "A233", source);
        }
        break;
      }
      case "firestorm-projectile": hitFirestormProjectile(state, event); break;
      case "firestorm-burn": {
        const enemy = state.enemies.find(unit => unit.id === event.enemyId);
        const active = enemy?.firestormBurn;
        if (!enemy || active?.timerId !== timerId) break;
        const now = state.queue.nowUs;
        if (now === active.nextUs) {
          damageEnemy(state, firingUnit(state, active.towerId), "q001", enemy, active.rank * 80, "magic", "T403", active.source);
          active.nextUs += us(1);
        }
        if (now >= active.untilUs) delete enemy.firestormBurn;
        else if (enemy.hp > 0 && enemy.firestormBurn === active) active.timerId = scheduleEvent(state.queue,
          Math.min(active.nextUs, active.untilUs) - now, event);
        break;
      }
      case "pit-net-end": {
        const enemy = state.enemies.find(unit => unit.id === event.enemyId);
        if (enemy?.pitNetUntilUs === event.untilUs) delete enemy.pitNetUntilUs;
        break;
      }
      case "death-aura-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower) tower.permanentAttack = (tower.permanentAttack ?? 0) - event.amount;
        break;
      }
      case "boar-venom-end": {
        const venom = state.enemies.find(enemy => enemy.id === event.enemyId)?.boarVenom;
        if (venom?.[event.sourceId]?.untilUs === event.untilUs) delete venom[event.sourceId];
        break;
      }
      case "bristle-goo-carrier-end": break;
      case "bristle-goo-projectile": {
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (!target || !trackingProjectileArrived(state, event, target) || !bristleGooTarget(state, target) ||
            consumeEnemySpellShield(state, target)) break;
        const untilUs = state.queue.nowUs + us(5);
        target.bristleGooSlow = { factor: (100 - 8 * event.stacks) / 100, untilUs };
        scheduleEvent(state.queue, us(5), { type: "bristle-goo-slow-end", enemyId: target.id, untilUs });
        break;
      }
      case "bristle-goo-armor-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.bristleGoo?.[event.towerId]?.timerId !== timerId) break;
        delete target.bristleGoo[event.towerId];
        if (!Object.keys(target.bristleGoo).length) delete target.bristleGoo;
        delete target.bristleGooArmor;
        delete target.bristleGooSlow;
        break;
      }
      case "bristle-goo-slow-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.bristleGooSlow?.untilUs === event.untilUs) delete target.bristleGooSlow;
        break;
      }
      case "quill-layers-end": {
        const stacks = state.enemies.find(enemy => enemy.id === event.enemyId)?.quills;
        if (stacks?.[event.towerId]?.timerId === timerId) delete stacks[event.towerId];
        break;
      }
      case "cask-projectile": {
        const target = state.enemies.find(enemy => enemy.id === event.targetId && ogreBlastTarget(state, enemy));
        if (target && state.queue.nowUs < event.expiresUs && trackingProjectileArrived(state, event, target) &&
            !consumeEnemySpellShield(state, target)) {
          stunEnemy(state, target, us(1.5));
          damageEnemy(state, firingUnit(state, event.towerId), "q052", target, 100 * .8, "magic", "T231", event.source);
        }
        break;
      }
      case "witch-curse": pulseWitchCurse(state, event.curseId, event.final); break;
      case "death-ward-area": {
        const tower = firingUnit(state, event.towerId);
        if (!tower) break;
        for (const enemy of [...state.enemies].sort((left, right) => left.id - right.id)) {
          if (state.phase !== "running") break;
          if (targetable(enemy, ["ground", "air", "structure", "mechanical"], state.queue.nowUs) &&
              (enemy.x - event.point.x) ** 2 + (enemy.y - event.point.y) ** 2 <= 150 ** 2)
            damageEnemy(state, tower, tower.templateId, enemy, event.amount * .8, "magic", "A209");
        }
        break;
      }
      case "shackle-projectile": {
        const target = state.enemies.find(enemy => enemy.id === event.targetId && ogreBlastTarget(state, enemy));
        if (firingUnit(state, event.towerId) && target && trackingProjectileArrived(state, event, target) &&
            !consumeEnemySpellShield(state, target)) stunEnemy(state, target, us(.1));
        break;
      }
      case "focus-restore": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.focusRestoreTimer === timerId) {
          delete tower.focusRestoreTimer;
          tower.focusCycleReductionUs! -= 200_000;
          if (tower.focusCycleReductionUs === 0) delete tower.focusCycleReductionUs;
          weaponRatesDirty.add(state);
        }
        break;
      }
      case "focus-carrier-expire": break;
      case "barrage-launch": launchGyroBarrage(state, event, timerId); break;
      case "barrage-rocket": {
        const tower = firingUnit(state, event.towerId);
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (tower && target && ogreBlastTarget(state, target) && trackingProjectileArrived(state, event, target)) {
          damageEnemy(state, tower, tower.templateId, target, event.amount * .8, "magic", "A195");
        }
        break;
      }
      case "flak-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.flak?.timerId === timerId) delete tower.flak;
        break;
      }
      case "calldown": resolveCalldown(state, event, timerId); break;
      case "calldown-damage": commitCalldownDamage(state, event); break;
      case "calldown-slow-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.calldownSlow?.untilUs === event.untilUs) delete target.calldownSlow;
        break;
      }
      case "calldown-carrier-expire": break;
      case "mana-void-projectile": {
        const tower = firingUnit(state, event.towerId);
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (tower && target && eligibleHeroTarget(state, tower, target, Infinity, "A160") &&
            trackingProjectileArrived(state, event, target) && !consumeEnemySpellShield(state, target)) stunEnemy(state, target, us(1));
        break;
      }
      case "mana-counter-expire": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.hero) {
          tower.hero.natural.AGI -= event.amount;
          weaponRatesDirty.add(state);
        }
        break;
      }
      case "hero-spell-end": {
        const tower = firingUnit(state, event.towerId);
        if (event.skillId === "A163" && tower?.focusRecoveryUntilUs === state.queue.nowUs) delete tower.focusRecoveryUntilUs;
        if (event.skillId === "A001" && tower?.requiemFollowTimer === timerId) delete tower.requiemFollowTimer;
        const slot = event.skillId === "A218" ? "A217" : event.skillId;
        const ready = tower?.heroSpellReady?.[slot];
        if (tower?.heroSpellReady && ready !== undefined) {
          const floor = event.skillId === "A066" || event.skillId === "A206" ? 16 : 0;
          const adjusted = adjustedSpellCooldown(state, tower, ready, floor, slot);
          tower.heroSpellReady[slot] = floor ? Math.max(state.queue.nowUs + us(floor), adjusted) : adjusted;
          if (event.skillId === "A091") scheduleBountyTracking(state, tower);
        }
        break;
      }
      case "tower-spell": resolveTowerSpell(state, event); break;
      case "sword-rain-emit": emitSwordRain(state, event); break;
      case "sword-rain-travel": advanceSwordRain(state, event); break;
      case "spell-sweep": yield* advanceSpellSweep(state, event.sweep, timerId); break;
      case "morph-shift": tickMorphShift(state, event.towerId, timerId); break;
      case "morph-bolt": resolveMorphBolt(state, event); break;
      case "razor-plasma": pulseRazorPlasma(state, event); break;
      case "razor-static-tick": tickRazorStatic(state, event); break;
      case "razor-static-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.razorStatic?.id === event.linkId) delete tower.razorStatic;
        break;
      }
      case "razor-storm-shot": shootRazorStorm(state, event.stormId); break;
      case "razor-storm-impact": hitRazorStorm(state, event); break;
      case "illuminate-timeout": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.illuminateCharge?.timerId === timerId) releaseIlluminate(state, tower);
        break;
      }
      case "spirit-wave": {
        const tower = firingUnit(state, event.towerId);
        const rank = tower?.hero?.ranks.A191;
        if (tower && rank) launchLightWave(state, tower, event.aim, "A191",
          heroSpells.A191.damage[rank - 1], hasScepter(state, tower) ? "q062" : "q001");
        break;
      }
      case "illuminate-blind-end": {
        const enemy = state.enemies.find(entry => entry.id === event.enemyId);
        if (enemy?.illuminateBlindUntilUs === event.untilUs) delete enemy.illuminateBlindUntilUs;
        break;
      }
      case "freezing-pulse": pulseFreezingField(state, event.fieldId, event.index); break;
      case "freezing-end": endFreezingField(state, event.fieldId); break;
      case "freezing-scepter": resolveFreezingScepter(state, event); break;
      case "storm-hammer": resolveStormHammer(state, event); break;
      case "wraith-projectile": resolveWraithProjectile(state, event); break;
      case "boulder-projectile": resolveBoulderProjectile(state, event); break;
      case "native-slow-scan": scanNativeSlow(state, event.towerId); break;
      case "bloodlust-scan": scanBloodlust(state, event.towerId); break;
      case "ogre-projectile": resolveOgreBlast(state, event); break;
      case "ogre-repeat": repeatOgreBlast(state, event); break;
      case "essence-expire": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.hero) changeEssence(state, tower, -event.amount);
        break;
      }
      case "dark-pact-start": {
        const tower = firingUnit(state, event.towerId);
        if (!tower) break;
        recordBattleAnimation(state, tower, "superdarkflash", "model-effect");
        for (let tick = 1; tick <= 11; tick++) scheduleEvent(state.queue, tick * us(.1), { type: "dark-pact-tick", towerId: tower.id });
        break;
      }
      case "dark-pact-tick": {
        const tower = firingUnit(state, event.towerId);
        if (!tower?.hero) break;
        const { STR, AGI, INT } = combatAttributes(state, tower);
        const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure", "ward"], state.queue.nowUs) &&
          (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= 500 ** 2).sort((a, b) => a.id - b.id);
        for (const enemy of targets) {
          if (state.phase !== "running") break;
          damageEnemy(state, tower, tower.templateId, enemy, (STR + AGI + INT) * 12 / 11, "divine", "A037");
        }
        clearTowerDebuffs(state, tower);
        break;
      }
      case "nova-tick": {
        const tower = firingUnit(state, event.towerId);
        if (!tower || tower.novaTimer !== timerId) {
          cancelEvent(state.queue, timerId);
          break;
        }
        const rank = tower.hero?.ranks.A030;
        if (!rank) break;
        const scepter = hasScepter(state, tower);
        const radius = scepter ? 1000 : 500;
        const raw = (2 * combatAttributes(state, tower).INT + [200, 300, 400, 500, 600, 750][rank - 1]) * (scepter ? 2 : 1);
        const targets = state.enemies.filter(enemy => (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 <= radius ** 2)
          .sort((a, b) => a.id - b.id);
        for (const enemy of targets) {
          if (state.phase !== "running" || !state.structures.includes(tower)) break;
          if (!state.enemies.includes(enemy) || enemy.hp <= 0) continue;
          recordBattleAnimation(state, enemy, tower.templateId === "G047" ? "MCXX1" : "DoomDeath", "model-effect");
          damageEnemy(state, tower, tower.templateId, enemy, raw, "magic", "A030");
        }
        break;
      }
      case "wisp-link-tick": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.wispLink?.timer === timerId) updateWispLink(state, tower);
        break;
      }
      case "wisp-overload-tick": {
        const tower = firingUnit(state, event.towerId);
        if (!tower || tower.wispOverload?.timer !== timerId) break;
        const rank = tower.hero?.ranks[wispOverload(tower.templateId)] ?? 0;
        syncMana(state, tower);
        const cost = [0, 10, 20, 30, 40, 50, 70][rank];
        tower.mana = Math.max(0, tower.mana! - cost);
        if (!rank || tower.mana === 0) toggleWispOverload(state, tower, tower.wispOverload.buff);
        break;
      }
      case "wisp-relocate": {
        const source = firingUnit(state, event.towerId);
        if (!source || source.wispRelocateTimer !== timerId) break;
        delete source.wispRelocateTimer;
        if (source.templateId === "G057" || source.templateId === "G058") {
          recordBattleAnimation(state, source, source.templateId, "relocation-impact");
        }
        const target = source.wispLink && firingUnit(state, source.wispLink.targetId);
        if (!target) {
          relocation(state, source, event.point, false);
          recordBattleAnimation(state, source, source.templateId, "relocation-impact");
          break;
        }
        relocation(state, target, event.point, false);
        const candidates = Array.from({ length: 13 }, (_, index) => {
          const angle = index * Math.PI / 6;
          return { x: event.point.x + 400 * Math.cos(angle), y: event.point.y + 400 * Math.sin(angle) };
        });
        relocation(state, source, candidates.find(terrainAllowsConstruction) ?? candidates[12], false);
        recordBattleAnimation(state, source, source.templateId, "relocation-impact");
        creditTask(state, "spring", 3);
        break;
      }
      case "accuracy-expire": {
        const target = firingUnit(state, event.towerId);
        if (target?.accuracy && target.accuracy.untilUs <= state.queue.nowUs) {
          delete target.accuracy;
          weaponRatesDirty.add(state);
        }
        break;
      }
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
      case "doom-digest": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.doomDigestTimer === timerId) {
          delete tower.doomDigestTimer;
          state.gold += event.gold;
        }
        break;
      }
      case "doom-retry": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.heroSpellReady) tower.heroSpellReady.A164 = state.queue.nowUs;
        break;
      }
      case "doom-scorch": tickDoomScorch(state, event); break;
      case "doom-curse": tickDoomCurse(state, event); break;
      case "doom-projectile": resolveDoomProjectile(state, event); break;
      case "exorcism": progressExorcism(state, event); break;
      case "torrent-step": stepTorrent(state, event); break;
      case "astral-intelligence-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.hero) changeAstralIntelligence(state, tower, -event.amount);
        break;
      }
      case "arcane-poison-end": {
        const target = state.enemies.find(enemy => enemy.id === event.enemyId);
        if (target?.arcanePoisonUntilUs === event.untilUs) delete target.arcanePoisonUntilUs;
        break;
      }
      case "tidebringer-ready": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.hero && tower.tidebringerTimer === timerId) {
          delete tower.tidebringerTimer;
          tower.hero.ranks.T082 = 1;
          tower.permanentAttack = (tower.permanentAttack ?? 0) + 400 * (tower.hero.ranks.A081 ?? 0);
        }
        break;
      }
      case "fleet-release": releaseGhostWave(state, event.fleetId); break;
      case "fleet-expire": {
        const fleet = state.ghostFleets?.[event.fleetId];
        if (fleet) {
          const tower = firingUnit(state, fleet.towerId);
          if (tower?.fleetFollowId === event.fleetId) delete tower.fleetFollowId;
          delete state.ghostFleets![event.fleetId];
        }
        break;
      }
      case "doom-infernal": tickDoomInfernal(state, event); break;
      case "stone-gaze-end": {
        const enemy = state.enemies.find(entry => entry.id === event.enemyId);
        const stone = enemy?.stoneGaze;
        if (!enemy || !stone?.timers[timerId]) break;
        delete stone.timers[timerId];
        stone.paused = false;
        delete stone.frozenFrameUs;
        delete stone.crystalline;
        if (!Object.keys(stone.timers).length) delete enemy.stoneGaze;
        break;
      }
      case "doom-frost": tickDoomFrost(state, event); break;
      case "doom-frost-hit": {
        const tower = firingUnit(state, event.towerId);
        const targets = state.enemies.filter(enemy => targetable(enemy, ["ground", "air", "structure"], state.queue.nowUs) &&
          (enemy.x - event.source.x) ** 2 + (enemy.y - event.source.y) ** 2 <= 800 ** 2);
        for (const enemy of targets) {
          if (state.phase !== "running") break;
          damageEnemy(state, tower, "q045", enemy, event.damage * .8, "magic", event.skillId ?? "T318", event.source);
        }
        break;
      }
      case "doom-drain": tickDoomDrain(state, event); break;
      case "doom-drain-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower && tower.doomDrain?.untilUs === event.untilUs) clearDoomDrain(tower);
        break;
      }
      case "doom-poison-cast": {
        const enemy = state.enemies.find(unit => unit.id === event.targetId);
        if (!enemy || !organicWaveTarget(state, enemy) || !canSeeEnemy(state, enemy) ||
            (enemy.x - event.source.x) ** 2 + (enemy.y - event.source.y) ** 2 > 1000 ** 2 || consumeEnemySpellShield(state, enemy)) break;
        (enemy.doomPoison ??= {})[event.towerId] = event.source.id;
        scheduleEvent(state.queue, us(1), { ...event, type: "doom-poison", remaining: 10 });
        break;
      }
      case "doom-poison": {
        const enemy = state.enemies.find(unit => unit.id === event.targetId);
        if (enemy?.doomPoison?.[event.towerId] !== event.source.id) break;
        const tower = firingUnit(state, event.towerId);
        damageEnemy(state, tower, "q001", enemy, event.damage * .8, "magic", "T174", event.source);
        if (state.phase === "running" && event.remaining > 1 && enemy.doomPoison?.[event.towerId] === event.source.id &&
            state.enemies.includes(enemy)) {
          scheduleEvent(state.queue, us(1), { ...event, remaining: event.remaining - 1 });
        } else if (enemy.doomPoison?.[event.towerId] === event.source.id) delete enemy.doomPoison[event.towerId];
        break;
      }
      case "doom-blink": {
        const tower = firingUnit(state, event.towerId);
        if (tower && !tower.pending && relocation(state, tower, event.point)) {
          recordBattleAnimation(state, tower, tower.templateId, "relocation-impact");
        }
        break;
      }
      case "spectre-refraction": finishSpectreRefraction(state, event.towerId, timerId); break;
      case "zeus-cloud": tickZeusCloud(state, event); break;
      case "zeus-wrath-rebate": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.hero?.ranks.A107 && tower.heroSpellReady) {
          tower.heroSpellReady.A107 = state.queue.nowUs + us(Math.max(7, 16 - event.count));
        }
        break;
      }
      case "axe-bleed-impact": advanceAxeBleed(state, event); break;
      case "axe-bleed-tick": tickAxeBleed(state, event); break;
      case "axe-cull-rebate": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.axeRebateTimer === timerId) {
          delete tower.axeRebateTimer;
          const now = state.queue.nowUs;
          if (tower.heroSpellReady?.A057 !== undefined) {
            const remaining = Math.max(0, tower.heroSpellReady.A057 - now);
            tower.heroSpellReady.A057 = now + Math.round(.5 * remaining);
          }
          if ((tower.life?.hp ?? 1) > 0) tower.axeHelixUntilUs = now + us(20);
        }
        break;
      }
      case "jingu-expire": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.jingu?.untilUs === event.untilUs) delete tower.jingu;
        break;
      }
      case "jingu-hammer": resolveJinguHammer(state, event); break;
      case "soul-burn-end": {
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        const window = target?.soulBurn;
        if (target && window?.timerId === timerId) {
          delete target.soulBurn;
          const caster = firingUnit(state, window.casterId);
          if (target.hp > 0 && window.total > 0) {
            damageEnemy(state, caster, window.casterTemplate, target, window.total * .3, "divine", window.itemId,
              caster ?? { ...window.casterPoint, id: window.casterId });
          }
        }
        break;
      }
      case "soul-burn-focus": {
        const tower = firingUnit(state, event.towerId);
        if (tower && !tower.pending && state.enemies.some(enemy => enemy.id === event.targetId && enemy.hp > 0)) {
          tower.focusTarget = event.targetId;
          startWeapon(state, tower);
        }
        break;
      }
      case "equipment-teleport": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.teleportTimer === timerId) {
          delete tower.teleportTimer;
          relocation(state, tower, event.point);
        }
        break;
      }
      case "spell-immunity-expire": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.spellImmunity?.sourceId === event.sourceId) delete tower.spellImmunity;
        break;
      }
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
      case "death-pulse": hitDeathPulse(state, event); break;
      case "lycan-restore-range":
      case "alchemist-restore-range":
      case "dragon-restore-range": {
        const tower = firingUnit(state, event.towerId);
        const shape = tower?.dragonShape ?? tower?.alchemistShape ?? tower?.lycanShape;
        if (shape?.timerId === event.formTimer) {
          delete shape.rangeTimerId;
          if (shape.lance) shape.rangeDelta += weapons[tower!.templateId][0].kind === "normal" ? 100 : 200;
        }
        break;
      }
      case "lycan-end":
      case "alchemist-end":
      case "dragon-end": {
        const tower = firingUnit(state, event.towerId);
        const shape = tower?.dragonShape ?? tower?.alchemistShape ?? tower?.lycanShape;
        if (tower && shape?.timerId === event.formTimer) endHeroTransformation(state, tower, shape);
        break;
      }
      case "acid-cloud-tick": pulseAcidCloud(state, state.acidClouds![event.cloudId]); break;
      case "acid-cloud-end": delete state.acidClouds![event.cloudId]; break;
      case "goblin-greed-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.goblinGreed?.timerId === timerId) delete tower.goblinGreed;
        break;
      }
      case "dragon-imprint": pulseDragonImprint(state, event.imprintId); break;
      case "dragon-imprint-end": {
        const mark = state.dragonImprints![event.imprintId];
        cancelEvent(state.queue, mark.period);
        delete state.dragonImprints![event.imprintId];
        break;
      }
      case "duel-projectile": {
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (!target || !mapBoss(target) || !organicWaveTarget(state, target) ||
            !trackingProjectileArrived(state, event, target) || consumeEnemySpellShield(state, target)) break;
        const untilUs = state.queue.nowUs + us(5);
        target.duelLockUntilUs = untilUs;
        scheduleEvent(state.queue, us(5), { type: "duel-unlock", targetId: target.id, untilUs });
        break;
      }
      case "duel-unlock": {
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (target?.duelLockUntilUs === event.untilUs) delete target.duelLockUntilUs;
        break;
      }
      case "duel-observe": {
        const tower = state.structures.find(unit => unit.id === event.towerId);
        const duel = tower?.duel;
        if (tower && duel?.timerId === timerId) {
          if (duel.dead) tower.duelWins = Math.min(150, (tower.duelWins ?? 0) + (hasScepter(state, tower) ? 2 : 1));
          else if (state.queue.nowUs < duel.untilUs && state.enemies.some(enemy => enemy.id === duel.targetId)) break;
          delete tower.duel;
        }
        cancelEvent(state.queue, timerId);
        break;
      }
      case "heartstopper-tick": pulseHeartstopper(state, event.towerId, timerId); break;
      case "burning-spear": tickBurningSpear(state, event); break;
      case "march-robot-launch": launchMarchRobot(state, event); break;
      case "rearm-finish": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.rearmTimer !== timerId) break;
        delete tower.rearmTimer;
        tower.heroCastUntilUs = state.queue.nowUs;
        tower.heroSpellReady!.A075 = adjustedSpellCooldown(state, tower, tower.heroSpellReady!.A075!, 0, "A075", true);
        if (!tower.hero?.ranks.A075 || tower.pending || tower.life?.hp === 0 || state.queue.nowUs < (tower.stunnedUntilUs ?? 0)) break;
        for (const spell of ["A073", "A074"] as const) {
          if (tower.heroSpellReady?.[spell] !== undefined) tower.heroSpellReady[spell] = state.queue.nowUs;
        }
        if (tower.teleportReadyUs?.i230 !== undefined && towerGear(state, tower).some(item => item.itemId === "i230")) {
          tower.teleportReadyUs.i230 = state.queue.nowUs;
        }
        triggerAshHood(state, tower);
        break;
      }
      case "inner-vitality": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.innerVitality?.timerId !== timerId) {
          cancelEvent(state.queue, timerId);
          break;
        }
        const life = syncTowerLife(state, tower);
        if (life.hp > 0) life.hp = Math.min(life.maximum, life.hp + Math.floor(.2 * life.maximum));
        if (--tower.innerVitality.remaining === 0) {
          cancelEvent(state.queue, timerId);
          delete tower.innerVitality;
        }
        break;
      }
      case "berserker-blood": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.berserkerBlood?.timerId !== timerId) {
          cancelEvent(state.queue, timerId);
          break;
        }
        const life = syncTowerLife(state, tower);
        const slices = [4, 6, 8, 12, 16, 20][(tower.hero?.ranks.A116 ?? 0) - 1] ?? 0;
        const tier = Math.max(1, Math.min(20, Math.ceil((life.maximum - life.hp) * slices / life.maximum)));
        if (tower.berserkerBlood.tier !== tier) {
          tower.berserkerBlood.tier = tier;
          weaponRatesDirty.add(state);
        }
        break;
      }
      case "life-break-slow-end": {
        const target = state.enemies.find(enemy => enemy.id === event.targetId);
        if (target?.lifeBreakSlowUs === event.untilUs) delete target.lifeBreakSlowUs;
        break;
      }
      case "prophet-teleport": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.prophetTeleportTimer !== timerId) break;
        delete tower.prophetTeleportTimer;
        relocation(state, tower, event.point);
        recordBattleAnimation(state, tower, "A050", "model-effect");
        break;
      }
      case "eclipse-tick": eclipseTick(state, event.towerId, timerId); break;
      case "eclipse-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.eclipse?.end === timerId) endEclipse(state, tower);
        break;
      }
      case "eclipse-hammer": {
        const enemy = state.enemies.find(target => target.id === event.targetId);
        if (!enemy || !organicWaveTarget(state, enemy) || !canSeeEnemy(state, enemy) || consumeEnemySpellShield(state, enemy)) break;
        stunEnemy(state, enemy, us(.5));
        recordBattleAnimation(state, event.point, "T120", "model-effect");
        break;
      }
      case "blade-storm-tick": bladeStormTick(state, event.id); break;
      case "blade-storm-end": delete state.bladeStorms![event.id]; break;
      case "omnislash-tick": advanceOmnislash(state, event.towerId, event.id, timerId); break;
      case "omnislash-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.omnislash?.id === event.id) endOmnislash(state, tower);
        break;
      }
      case "bear-update": updateSpiritBear(state, event.unitId, timerId); break;
      case "bear-form-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.bearFormInterval?.timerId === timerId) {
          delete tower.bearFormInterval;
          weaponRatesDirty.add(state);
        }
        break;
      }
      case "bear-cast": finishBearCast(state, event.unitId, event.skillId); break;
      case "bear-frenzy-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.bearFrenzy?.timerId === timerId) clearBearFrenzy(state, tower);
        break;
      }
      case "summon-expire": {
        const unit = state.summons?.find(unit => unit.id === event.unitId);
        if (unit) {
          const shell = state.ionShells?.[unit.id];
          if (shell) shell.corpsePoint = { x: unit.x, y: unit.y };
          if (unit.bear) expireSpiritBear(state, unit);
          interruptWeapon(state, unit);
          if (unit.attack?.timing?.cooldown) cancelEvent(state.queue, unit.attack.timing.cooldown.timerId);
          const summon = unit.summon!;
          if (summon.phantom?.forkRank) {
            const owner = firingUnit(state, summon.ownerId);
            if (owner?.hero) {
              owner.hero.natural.AGI -= 20;
              weaponRatesDirty.add(state);
            }
          }
          if (!summon.independent && !summon.illusion && (summon.red || summon.green || summon.blue)) {
            const fields = weaponFields(state, unit, weapons[unit.templateId][0], towerGear(state, unit));
            const contract = { red: summon.red, green: summon.green, blue: summon.blue, baseAttack: Math.fround(fields.attack) + Math.fround(fields.bonus) };
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
        const tower = itemOwner(state, event.towerId);
        if (tower?.snow?.token === event.token) finishSnow(state, tower);
        break;
      }
      case "auto-control-equipment": {
        const tower = itemOwner(state, event.towerId);
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
      case "lion-hex-tail":
      case "equipment-hex-damage": {
        const tower = state.structures.find(entry => entry.id === event.towerId);
        if (!tower) break;
        const lion = event.type === "lion-hex-tail";
        for (const enemy of [...state.enemies].sort((left, right) => left.id - right.id)) {
          if (state.phase !== "running") break;
          if ((enemy.x - event.point.x) ** 2 + (enemy.y - event.point.y) ** 2 > (lion ? 600 : 700) ** 2 ||
              !targetable(enemy, ["ground", "air", "structure", "mechanical"], state.queue.nowUs)) continue;
          damageEnemy(state, tower, tower.templateId, enemy, physicalDamage(1, "hero", armorAt(state, enemy), !!enemy.welfare), "physical", lion ? "A237" : "T049");
        }
        break;
      }
      case "equipment-hex-end": {
        const enemy = state.enemies.find(entry => entry.id === event.enemyId);
        if (enemy?.hexSourceId === event.sourceId) {
          delete enemy.hexUntilUs;
          delete enemy.hexSourceId;
          delete enemy.hexForm;
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
      case "fury-swipes-end": {
        const tower = firingUnit(state, event.towerId);
        if (tower?.furySwipes?.untilUs === event.expiresUs) delete tower.furySwipes;
        break;
      }
      case "ursa-carrier-expire":
      case "requiem-carrier-expire":
      case "coup-carrier-expire": break;
      case "weapon-impact": advanceWeaponShot(state, event.shot, event.travelUs); break;
      case "disease-tick": tickDiseaseCloud(state, event.towerId, event.enemyId); break;
      case "poison-tick": tickTowerPoison(state, event.towerId, event.enemyId); break;
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
        if (enemy?.wraithMarkUntilUs && enemy.wraithMarkUntilUs <= state.queue.nowUs) delete enemy.wraithMarkUntilUs;
        if (enemy?.iceBindingUntilUs && enemy.iceBindingUntilUs <= state.queue.nowUs) delete enemy.iceBindingUntilUs;
        if (enemy?.phaseUntilUs === state.queue.nowUs) rescheduleSweepContact(state, enemy);
        break;
      }
      case "enemy-cast": finishEnemyReaction(state, event.enemyId, event.skill, event.point, event.targetId); break;
      case "untouchable-carrier-expire": break;
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
        rescheduleSweepContact(state, parent);
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
        if (enemy?.dragonFrost && enemy.dragonFrost.expiresUs <= state.queue.nowUs) delete enemy.dragonFrost;
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
        if ((tower.templateId.startsWith("H") || tower.templateId === "n208") && tower.qualification === null) {
          const ids = [...qualificationChains.keys()];
          tower.qualification = ids[Math.floor(roll(state) * ids.length)];
        }
        if (!tower.hero) {
          const hero = newHero(tower.templateId);
          if (hero) tower.hero = hero;
        }
        tower.pending = null;
        if (tower.templateId === "H022") creditTask(state, "summer", 1);
        if (tower.templateId === "H033") creditTask(state, "spring", 1);
        if (tower.templateId === "n199" && !upgradeTo) scheduleEvent(state.queue, 0, { type: "native-slow-scan", towerId: tower.id });
        if ((tower.templateId === "n214" || tower.templateId === "H018") && !upgradeTo) {
          scheduleEvent(state.queue, 0, { type: "bloodlust-scan", towerId: tower.id });
        }
        if (tower.templateId === "H018") delete tower.autoModes?.nativeBloodlust;
        if (diseaseCloudSources.has(tower.templateId)) reconcileDiseaseClouds(state);
        if (emitsManaAura(tower)) refreshManaAuras(state, tower);
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
    if (state.lifeDrains) for (const [towerId, link] of Object.entries(state.lifeDrains)) {
      const tower = firingUnit(state, Number(towerId));
      if (tower && !lifeDrainTarget(state, tower, link)) stopLifeDrain(state, tower);
    }
    if (state.movementAnchorUs !== undefined && (refreshRoutes ||
        terrain !== undefined && terrain !== routeObstacleKey(state) || state.enemies.some(enemy => routeNeedsPublication(state, enemy)))) {
      yield* publishEnemyRoutes(state);
    } else if (routeCorner) yield* publishEnemyRoutes(state, routeCorner);
    if (weaponRatesDirty.delete(state)) {
      for (const tower of state.structures) refreshWeaponTiming(state, tower);
      for (const summon of state.summons ?? []) refreshWeaponTiming(state, summon);
    }
}
