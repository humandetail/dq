// R02 normal opening for heroes with an appearance and battle proof. Uses only offered choices and legal actions.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cardTemplates, qualificationChains, towerLevels } from "../src/game/m2/content.ts";
import { gridSize, map } from "../src/game/m2/map.ts";
import { creditTime, drain, enqueue, heroSpellTargets, inspectBuildPlacement, newMatch } from "../src/game/m2/match.ts";
import { learnableSkills, learningLevel } from "../src/game/m2/hero.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { m3ConfigVersion, m3ContentVersion } from "../src/game/m2/m3-version.ts";

const seeds = [14, 47, 811, 1709, 20261124];
const cardId = process.argv[2] ?? "i553";
const reserveDraw = process.argv.includes("--sr-reserve");
const openingContinuation = process.argv.includes("--continue-opening");
const bristleSupport = cardId === "i584" && process.argv.includes("--bristle-support");
const continuationFlag = process.argv.findIndex(arg => arg === "--continue-drawn" || arg === "--continue-opening");
const continuedRun = continuationFlag >= 0 && JSON.parse(readFileSync(process.argv[continuationFlag + 1], "utf8")).runs[0];
const manualVoid = cardId === "i578" && process.argv.includes("--manual-void");
const profile = {
  i551: { from: "H003", to: "G077", skin: "S372", skills: ["A008", "A009", "A010", "A239"],
    attacks: ["A008", "A009", "dragon"], label: "m3-r02-dragon-knight-1" },
  i580: { from: "H043", to: "H043", skills: ["A167", "A168", "A169"],
    attacks: ["A167", "A168", "A169"], label: "m3-r02-lycan-1" },
  i583: { from: "H046", to: "G065", skin: "S262", skills: ["A178", "A179", "A180"],
    attacks: ["A178", "A179", "A180"], label: "m3-r02-ember-1" },
  i584: { from: "H047", to: "H047", skills: ["A181", "A182", "A183"],
    attacks: ["A181", "A182", "A183"], label: "m3-r02-bristleback-1" },
  i593: { from: "H056", to: "H056", skills: ["A214", "A215", "A216"],
    attacks: ["A214", "A215", "A216"], label: "m3-r02-beastmaster-1" },
  i596: { from: "H060", to: "G078", skin: "S382", skills: ["A233", "A234", "A235"],
    attacks: ["A233", "A234", "A235"], label: "m3-r02-pit-lord-1" },
  i552: { from: "H002", to: "G035", skin: "S042", skills: ["A005", "A006", "A007"], attacks: ["Split", "A007"], learnedProof: "A006", label: "m3-r02-medusa-1" },
  i589: { from: "H052", to: "G076", skin: "S362", skills: ["A198", "A199", "A200"], attacks: ["A198", "A199", "A200"], label: "m3-r02-lich-1" },
  i553: { from: "H004", to: "G039", skin: "S082", skills: ["A016", "A017", "A018"], attacks: ["A016", "A017"], learnedProof: "A018", label: "m3-r02-crystal-1" },
  i554: { from: "H006", to: "G037", skin: "S062", skills: ["A022", "A023", "A024"], attacks: ["A022", "A023", "A024"], label: "m3-r02-ursa-1" },
  i556: { from: "H009", to: "G044", skin: "S202", skills: ["A031", "A032", "A033"], attacks: ["A031"], learnedProof: "A033", label: "m3-r02-slardar-1" },
  i578: { from: "H040", to: "G068", skin: "S282", skills: ["A158", "A159", "A160"], attacks: ["A158", "A159", "A160"], label: "m3-r02-antimage-1" },
  i579: { from: "H041", to: "G072", skin: "S332", skills: ["A161", "A162", "A163"],
    attacks: ["A161", "A162", "A163"], label: "m3-r02-windranger-1" },
  i585: { from: "H048", to: "H048", skills: ["A186", "A187", "A188"],
    attacks: ["A186", "A187", "A188"], label: "m3-r02-magnus-1" },
  i590: { from: "H053", to: "H053", skills: ["A201", "A202", "A203"],
    attacks: ["A201", "A202", "A203"], label: "m3-r02-dark-seer-1" },
  i597: { from: "H061", to: "H061", skills: ["A236", "A237", "A238"],
    attacks: ["A236", "A237", "A238"], label: "m3-r02-lion-1" },
  i586: { from: "H049", to: "H049", skills: ["A189", "A190", "A191"],
    attacks: ["A189", "A190", "A191"], label: "m3-r02-keeper-light-1" },
  i591: { from: "H054", to: "H054", skills: ["A204", "A205", "A206"],
    attacks: ["A204", "A205", "A206"], label: "m3-r02-razor-1" },
  i595: { from: "H058", to: "G075", skin: "S352", skills: ["A223", "A224", "A225"],
    attacks: ["A223", "A224", "A225/STR", "A225/AGI"], label: "m3-r02-morphling-1" },
  i587: { from: "H050", to: "G071", skin: "S322", skills: ["A192", "A193", "A194"],
    attacks: ["A192", "A193", "A194"], label: "m3-r02-night-stalker-1" },
  i588: { from: "H051", to: "G080", skin: "S402", skills: ["A195", "A196", "A197"], attacks: ["A195", "A196", "A197"], label: "m3-r02-gyrocopter-1" },
  i592: { from: "H055", to: "H055", skills: ["A207", "A208", "A209"],
    attacks: ["A207", "A208/first", "A208/second", "A209"], label: "m3-r02-witch-doctor-1" },
  i594: { from: "H057", to: "H057", skills: ["A217", "A221", "A222"],
    attacks: ["A217/T276", "A217/T278", "A221", "A222"], label: "m3-r02-tidehunter-1" },
}[cardId];
if (!profile || !cardTemplates.has(cardId)) throw new Error(`R02 hero ${cardId} is not yet open`);
const digest = value => createHash("sha256").update(value).digest("hex");
const source = ["src/game/m2/match.ts", "src/game/m2/content.ts", "src/game/m2/combat.ts", "src/game/m2/movement.ts",
  "src/game/m2/hero-spells.ts", "src/game/m2/weapons.json", "docs/m3-configuration.json"].map(path => [path, digest(readFileSync(path))]);

function replayDrawnCard(record) {
  const state = newMatch(`normal-${record.seed}`, record.seed, startSeasons().seasons);
  assert.equal(digest(JSON.stringify(state)), record.initialStateSha256);
  assert.equal(digest(JSON.stringify(record.inputs)), record.inputLogSha256);
  const draw = record.inputs.findIndex(entry => entry.outcome?.ok && (openingContinuation ?
    entry.action.type === "choose-opening" && entry.action.card === cardId : entry.acquisition?.obtainedCard === cardId));
  const claim = record.mastery?.claims.find(claim => claim.consumed[0].card === cardId);
  assert.ok(draw >= 0 || claim, "The recorded normal match never drew this card");
  const instance = draw >= 0 ? record.inputs[draw].outcome.createdId : claim.consumed[0].id;
  const openingBuild = openingContinuation && record.inputs.find(entry => entry.action.type === "build-card" &&
    entry.action.cardId === instance && entry.outcome?.ok);
  const openingHeroId = openingBuild?.outcome.createdId;
  const stop = openingContinuation ? record.inputs.findIndex(entry => entry.action.type === "learn-skill" &&
    entry.action.towerId === openingHeroId) : draw >= 0 ? draw + 1 :
    record.inputs.findIndex(({ atUs, action }) => atUs === claim.atUs && action.type === "exchange-hero" && action.offer === claim.offer);
  assert.ok(stop > 0 && (!openingContinuation || openingHeroId && record.opening === cardId));
  const continuationUs = record.inputs[stop].atUs;
  for (const [index, entry] of record.inputs.slice(0, stop).entries()) {
    creditTime(state, (entry.atUs - state.queue.nowUs) / 1000);
    while (drain(state, 10_000) === "pending") {}
    assert.ok(enqueue(state, { id: String(index + 1), matchId: state.matchId, action: entry.action }));
  }
  creditTime(state, (continuationUs - state.queue.nowUs) / 1000);
  while (drain(state, 10_000) === "pending") {}
  for (const [index, entry] of record.inputs.slice(0, stop).entries())
    assert.deepEqual(state.commandResults[String(index + 1)], entry.outcome);
  if (openingHeroId) {
    assert.equal(state.openingCard, cardId);
    assert.equal(state.structures.find(unit => unit.id === openingHeroId)?.templateId, profile.from);
    return { state, instance, heroId: openingHeroId, prefixInputs: stop, inputLogSha256: record.inputLogSha256, wave: state.wave };
  }
  const card = state.cards.find(card => card.id === instance);
  assert.equal(card?.card, cardId);
  assert.notEqual(card.slot, null);
  return { state, card, instance, prefixInputs: stop, inputLogSha256: record.inputLogSha256, wave: state.wave };
}

function run(seed) {
  const continued = continuedRun && replayDrawnCard(continuedRun);
  const state = continued?.state ?? newMatch(`normal-${cardId}-${seed}`, seed, startSeasons().seasons);
  const opening = continued ? state.openingCard : [cardId, "i564", "i581", "i569", "i576"].find(card => state.openingCandidates.includes(card)) ?? state.openingCandidates[0];
  const initialStateSha256 = digest(JSON.stringify(state));
  const commands = [];
  const effects = {};
  const acquisition = [];
  const gyroCasts = new Set();
  const windFocusGrants = new Map();
  let heroId = continued?.heroId;
  function advance(ms) {
    creditTime(state, ms);
    for (;;) {
      const event = state.queue.pending[0];
      const lastHit = state.recentHits?.at(-1);
      const before = cardId === "i554" || cardId === "i578" ? state.structures.find(unit => unit.id === heroId) : undefined;
      const priorOverpower = before?.overpower;
      const priorSwipes = before?.furySwipes;
      const priorAgility = before?.hero?.natural.AGI;
      const priorRazorAttack = cardId === "i591" ? state.structures.find(unit => unit.id === heroId)?.razorStatic?.attack : undefined;
      const priorMorph = cardId === "i595" ? state.structures.find(unit => unit.id === heroId) : undefined;
      const priorMorphStrength = priorMorph?.hero?.natural.STR;
      const priorMorphAgility = priorMorph?.hero?.natural.AGI;
      const attacking = cardId === "i578" && event?.payload.type === "weapon-fire" && event.payload.towerId === heroId ?
        state.enemies.find(unit => unit.id === event.payload.targetId) : undefined;
      const priorMana = attacking?.mana;
      const result = drain(state, heroId ? 1 : 1000);
      const hit = state.recentHits?.at(-1);
      const actor = state.structures.find(unit => unit.id === heroId);
      if (actor && event?.dueUs === state.queue.nowUs) {
        const payload = event.payload;
        const actualHit = hit && hit !== lastHit && hit.ownerId === heroId && hit.atUs === event.dueUs;
        const logicalHero = actor.dragonShape?.normal ?? actor.lycanShape?.normal ?? actor.templateId;
        const key = ability => `${logicalHero}/${ability}`;
        if (cardId === "i551") {
          if (actualHit && payload.type === "spell-sweep" && payload.sweep.name === "A008") effects[key("A008")] ??= hit;
          if (actualHit && hit.deadUnitId && actor.lifeOffset) effects[key("A009")] ??= { ...hit, lifeOffset: actor.lifeOffset };
          if (actor.dragonShape) effects[key("dragon")] ??= { templateId: actor.templateId, atUs: state.queue.nowUs };
        }
        if (cardId === "i580") {
          if (actor.lycanShape) effects[key("A169")] ??= { templateId: actor.templateId, atUs: state.queue.nowUs };
          if (actualHit && /^b15[0-5]$/.test(hit.sourceTemplate)) {
            effects[key("A167")] ??= hit;
            const wolf = state.summons.find(unit => unit.id === hit.casterId);
            if (wolf?.summon.wildHowlRank) effects[key("A168")] ??= { ...hit, rank: wolf.summon.wildHowlRank };
          }
        }
        if (cardId === "i583" && actualHit) {
          if (payload.type === "searing-chains" && payload.towerId === heroId) effects[key("A178")] ??= hit;
          if (payload.type === "flame-guard" && payload.towerId === heroId) effects[key("A179")] ??= hit;
          if (actor.sleight && hit.sourceTemplate === actor.templateId && ["weapon-fire", "weapon-impact"].includes(payload.type))
            effects[key("A180")] ??= { ...hit, targetList: actor.sleight.targets, step: actor.sleight.next };
        }
        if (cardId === "i584") {
          if (payload.type === "bristle-goo-projectile") {
            const target = state.enemies.find(unit => unit.id === payload.targetId);
            if (target?.bristleGoo?.[heroId] && target.bristleGooSlow?.untilUs === event.dueUs + 5_000_000)
              effects[key("A181")] ??= { atUs: event.dueUs, targetId: target.id, sourceId: payload.sourceId,
                armor: target.bristleGooArmor, slow: target.bristleGooSlow };
          }
          if (payload.type === "hero-spell" && payload.skillId === "A182" && payload.towerId === heroId && actualHit) {
            const packets = state.recentHits.slice(state.recentHits.indexOf(lastHit) + 1)
              .filter(packet => packet.ownerId === heroId && packet.atUs === event.dueUs);
            const spray = packets.find(packet => packet.sourceTemplate === actor.templateId);
            if (spray) effects[key("A182")] ??= spray;
            const hammer = packets.find(packet => packet.sourceTemplate === "q001" &&
              state.enemies.some(unit => unit.id === packet.targetId && unit.quills?.[heroId]?.stacks === 5 &&
                unit.stunUntilUs === event.dueUs + 1_000_000));
            if (hammer) effects[key("A183")] ??= { ...hammer, stacks: 5 };
          }
        }
        if (cardId === "i593" && actualHit) {
          if (payload.type === "wild-axes") effects[key("A214")] ??= hit;
          const beast = state.summons?.find(unit => unit.id === hit.casterId && unit.summon?.skillId === "A215");
          if (beast) {
            effects[key("A215")] ??= hit;
            if (beast.summon.beastmasterHasteRank && beast.attack?.timing)
              effects[key("A216")] ??= { templateId: beast.templateId, rank: beast.summon.beastmasterHasteRank, rawRate: beast.attack.timing.rawRate, atUs: hit.atUs };
          }
        }
        if (cardId === "i596") {
          if (actualHit && payload.type === "firestorm-impact" && payload.towerId === heroId) effects[key("A233")] ??= hit;
          if (actualHit && payload.type === "pit-pulse" && payload.skillId === "A234" && payload.towerId === heroId) effects[key("A234")] ??= hit;
          if (actor.deathAuraCount) effects[key("A235")] ??= { atUs: state.queue.nowUs, count: actor.deathAuraCount, attack: actor.permanentAttack };
        }
      }
      if (actor && event?.dueUs === state.queue.nowUs) {
        if (cardId === "i586" && event.payload.type === "hero-spell" && event.payload.towerId === heroId &&
            event.payload.skillId === "A190" && actor.lastCastUs === event.dueUs) {
          const recipient = state.structures.find(unit => unit.id === actor.chakraTargetId);
          const token = recipient?.chakraToken;
          if (token?.untilUs === event.dueUs + 25_000_000)
            effects["H049/A190"] ??= { atUs: event.dueUs, recipientId: recipient.id, mana: recipient.mana, token };
        }
        if (cardId === "i591" && event.payload.type === "razor-static-tick" && event.payload.towerId === heroId &&
            actor.razorStatic?.attack > (priorRazorAttack ?? 0))
          effects["H054/A205"] ??= { atUs: event.dueUs, targetId: event.payload.targetId, before: priorRazorAttack, ...actor.razorStatic };
        if (cardId === "i595" && event.payload.type === "morph-shift" && event.payload.towerId === heroId &&
            actor.hero.natural.STR !== priorMorphStrength && actor.hero.natural.AGI !== priorMorphAgility) {
          const attribute = actor.morphShift?.attribute;
          if (attribute) effects[`${actor.templateId}/A225/${attribute}`] ??= {
            atUs: event.dueUs, before: { STR: priorMorphStrength, AGI: priorMorphAgility },
            after: { STR: actor.hero.natural.STR, AGI: actor.hero.natural.AGI },
          };
        }
      }
      if (cardId === "i594" && actor && event?.dueUs === state.queue.nowUs) {
        const payload = event.payload;
        if (payload.type === "tide-projectile") {
          const target = state.enemies.find(enemy => enemy.id === payload.targetId);
          if (payload.skillId === "T276" && target?.tideCorrosion?.untilUs === event.dueUs + 4_000_000)
            effects["H057/A217/T276"] ??= { targetId: target.id, sourceId: payload.source.id, atUs: event.dueUs, ...target.tideCorrosion };
          if (payload.skillId === "T278" && hit && hit !== lastHit && hit.casterId === payload.source.id && hit.atUs === event.dueUs)
            effects["H057/A217/T278"] ??= hit;
        }
        if (payload.type === "hero-spell" && payload.towerId === heroId && actor.lastCastUs === event.dueUs) {
          if (payload.skillId === "A221" && hit && hit !== lastHit && hit.ownerId === heroId && hit.atUs === event.dueUs)
            effects["H057/A221"] ??= hit;
          if (payload.skillId === "A222") {
            const lift = state.queue.pending.find(entry => entry.payload.type === "ravage-step" && entry.dueUs === event.dueUs + 20_000);
            if (lift) effects["H057/A222"] ??= lift.payload;
          }
        }
      }
      if (cardId === "i590" && actor && event?.dueUs === state.queue.nowUs && event.payload.type === "hero-spell" &&
          event.payload.skillId === "A203" && event.payload.towerId === heroId) {
        const replicas = state.enemies.filter(enemy => enemy.replica).map(enemy => ({ id: enemy.id, unitId: enemy.unitId, hp: enemy.hp,
          dueUs: state.queue.pending.find(row => row.payload.type === "replica-expire" && row.payload.enemyId === enemy.id)?.dueUs }));
        if (replicas.some(replica => replica.dueUs === event.dueUs + 10_000_000))
          effects["H053/A203"] ??= { atUs: event.dueUs, replicas };
      }
      if (cardId === "i587" && actor?.nightHunter && event?.dueUs === state.queue.nowUs &&
          event.payload.type === "hero-spell" && event.payload.skillId === "A194" &&
          event.payload.towerId === heroId && actor.lastCastUs === event.dueUs) {
        const { marks, personalTimer } = actor.nightHunter;
        effects[`${actor.templateId}/A194`] ??= { atUs: event.dueUs, worldNight: state.worldNight, marks, personalTimer };
      }
      if (cardId === "i585" && actor && hit && hit !== lastHit && hit.atUs === event?.dueUs) {
        if (event.payload.type === "hero-spell" && event.payload.skillId === "A188" && event.payload.towerId === heroId &&
            hit.sourceTemplate === "q001" && hit.ownerId === undefined)
          effects["H048/A188"] ??= hit;
        if (event.payload.type === "weapon-fire" && event.payload.towerId === heroId && actor.empower) {
          const packets = state.recentHits.slice(state.recentHits.indexOf(lastHit) + 1)
            .filter(packet => packet.ownerId === heroId && packet.sourceTemplate === "H048");
          if (packets.some(packet => packet.targetId !== event.payload.targetId))
            effects["H048/A187"] ??= { atUs: event.dueUs, rank: actor.empower.rank, packets };
        }
      }
      if (cardId === "i588" && actor && event?.dueUs === state.queue.nowUs && event.payload.type === "hero-spell" &&
          event.payload.towerId === heroId && ["A195", "A197"].includes(event.payload.skillId))
        gyroCasts.add(`${actor.templateId}/${event.payload.skillId}`);
      if (cardId === "i579" && actor?.focusFire && event?.dueUs === state.queue.nowUs && event.payload.type === "hero-spell" &&
          event.payload.towerId === heroId && event.payload.skillId === "A163" &&
          !windFocusGrants.has(actor.focusFire.sourceId))
        windFocusGrants.set(actor.focusFire.sourceId, actor.templateId);
      if (cardId === "i578" && actor && attacking && state.queue.nowUs === event.dueUs) {
        if (attacking.mana < priorMana) effects[`${actor.templateId}/A158`] ??= { atUs: event.dueUs, targetId: attacking.id,
          before: priorMana, after: attacking.mana };
        if (actor.hero.natural.AGI > priorAgility) effects[`${actor.templateId}/A159`] ??= { atUs: event.dueUs,
          before: priorAgility, after: actor.hero.natural.AGI };
      }
      if (cardId === "i554" && actor && event?.dueUs === state.queue.nowUs) {
        if (actor.overpower && actor.overpower !== priorOverpower) effects[`${actor.templateId}/A022`] ??= { atUs: event.dueUs, ...actor.overpower };
        if (actor.furySwipes && actor.furySwipes !== priorSwipes) effects[`${actor.templateId}/A023`] ??= { atUs: event.dueUs, ...actor.furySwipes };
        const enrage = state.battleAnimations?.at(-1);
        if (hit !== lastHit && hit?.atUs === event.dueUs && enrage?.unitId === "Disenchant" && enrage.atUs === event.dueUs) {
          const recent = state.recentHits.slice(state.recentHits.indexOf(lastHit) + 1);
          const packet = recent.find(entry => entry.casterId === heroId && entry.x === enrage.x && entry.y === enrage.y);
          if (packet) effects[`${actor.templateId}/A024`] ??= packet;
        }
      }
      if (actor && hit && hit !== lastHit && hit.ownerId === heroId && hit.atUs === event?.dueUs) {
        if (cardId === "i586" && event.payload.type === "spell-sweep" && ["A189", "A191"].includes(event.payload.sweep.name)) {
          const target = state.enemies.find(unit => unit.id === hit.targetId);
          effects[`H049/${event.payload.sweep.name}`] ??= { ...hit, blindUntilUs: target?.illuminateBlindUntilUs };
        }
        if (cardId === "i591" && event.payload.type === "razor-plasma" && event.payload.towerId === heroId)
          effects["H054/A204"] ??= { ...hit, tick: event.payload.tick };
        if (cardId === "i591" && event.payload.type === "razor-storm-impact" && hit.sourceTemplate === actor.templateId) {
          const target = state.enemies.find(unit => unit.id === event.payload.targetId);
          effects["H054/A206"] ??= { ...hit, selectedTargetId: event.payload.targetId, armor: target?.armor };
        }
        if (cardId === "i595" && event.payload.type === "spell-sweep" && event.payload.sweep.name === "A223" && hit.sourceTemplate === "q057")
          effects[`${actor.templateId}/A223`] ??= hit;
        if (cardId === "i595" && event.payload.type === "morph-bolt" && hit.sourceTemplate === actor.templateId)
          effects[`${actor.templateId}/A224`] ??= { ...hit, stun: event.payload.stun };
        if (cardId === "i587" && hit.sourceTemplate === actor.templateId) {
          if (event.payload.type === "hero-spell" && event.payload.skillId === "A192")
            effects[`${actor.templateId}/A192`] ??= { ...hit, worldNight: state.worldNight, marks: actor.nightHunter?.marks };
          if ((event.payload.type === "weapon-fire" || event.payload.type === "weapon-impact") && actor.nightHunter?.attackRank) {
            const key = `${actor.templateId}/A193`;
            const sample = { ...hit, worldNight: state.worldNight, ...actor.nightHunter };
            (effects[key] ??= {})[actor.nightHunter.attackRank > 6 ? "night" : "day"] ??= sample;
          }
        }
        const skillId = event.payload.type === "freezing-pulse" ? "A016" :
          event.payload.type === "hero-spell" && ["A017", "A031", "A160"].includes(event.payload.skillId) ? event.payload.skillId : null;
        if (skillId) effects[`${actor.templateId}/${skillId}`] ??= hit;
        if (cardId === "i552" && event.payload.type === "weapon-impact") {
          if (event.payload.shot.secondary) effects[`${actor.templateId}/Split`] ??= hit;
          const target = state.enemies.find(unit => unit.id === hit.targetId);
          if (target?.stoneGaze?.frozenFrameUs === hit.atUs) effects[`${actor.templateId}/A007`] ??= { ...hit, stoneGaze: target.stoneGaze };
        }
        if (cardId === "i589") {
          if (event.payload.type === "hero-spell" && event.payload.skillId === "A198" && hit.sourceTemplate === "q025")
            effects[`${actor.templateId}/A198`] ??= hit;
          if (event.payload.type === "doom-frost-hit" && event.payload.skillId === "A199")
            effects[`${actor.templateId}/A199`] ??= hit;
          if (event.payload.type === "doom-projectile" && event.payload.spell === "A200")
            effects[`${actor.templateId}/A200`] ??= hit;
        }
        if (cardId === "i588") {
          const hitSkill = event.payload.type === "barrage-rocket" && event.payload.towerId === heroId ? "A195" :
            event.payload.type === "calldown-damage" && event.payload.sourceTemplate === actor.templateId ? "A197" :
            event.payload.type === "weapon-impact" && event.payload.shot.sourceTemplate === actor.templateId &&
                event.payload.shot.secondary && event.payload.shot.weapon.speed === 1600 && event.payload.shot.raw === 1 ? "A196" : null;
          const key = `${actor.templateId}/${hitSkill}`;
          if (hitSkill && (hitSkill === "A196" || gyroCasts.has(key))) effects[key] ??= hit;
        }
        if (cardId === "i592") {
          if (event.payload.type === "cask-projectile" && event.payload.towerId === heroId && hit.sourceTemplate === actor.templateId)
            effects[`${actor.templateId}/A207`] ??= { ...hit, castId: event.payload.source.cask.castId, jumps: event.payload.source.cask.jumps };
          if (event.payload.type === "witch-curse" && hit.sourceTemplate === actor.templateId) {
            const phase = event.payload.final ? "second" : "first";
            effects[`${actor.templateId}/A208/${phase}`] ??= { ...hit, curseId: event.payload.curseId };
          }
          if (event.payload.type === "death-ward-area" && hit.sourceTemplate === actor.templateId)
            effects[`${actor.templateId}/A209`] ??= { ...hit, wardId: actor.deathWardId };
        }
        if (cardId === "i579") {
          if (event.payload.type === "hero-spell" && event.payload.skillId === "A161" && hit.sourceTemplate === "q001")
            effects[`${actor.templateId}/A161`] ??= hit;
          if (event.payload.type === "spell-sweep" && event.payload.sweep.name === "A162" && hit.sourceTemplate === actor.templateId)
            effects[`${actor.templateId}/A162`] ??= { ...hit, sourceId: event.payload.sweep.sourceId };
          if (event.payload.type === "weapon-impact" && event.payload.shot.sourceTemplate === actor.templateId && actor.focusFire &&
              windFocusGrants.get(actor.focusFire.sourceId) === actor.templateId)
            effects[`${actor.templateId}/A163`] ??= { ...hit, focusFire: actor.focusFire };
        }
        if (cardId === "i585" && event.payload.type === "spell-sweep" && event.payload.sweep.name === "A186" && hit.sourceTemplate === "q041")
          effects["H048/A186"] ??= hit;
        if (cardId === "i590" && event.payload.type === "vacuum-tick")
          effects["H053/A201"] ??= hit;
        if (cardId === "i590" && event.payload.type === "ion-shell-tick")
          effects["H053/A202"] ??= { ...hit, recipientId: event.payload.targetId };
        if (cardId === "i597" && event.payload.type === "hero-spell" && event.payload.towerId === heroId) {
          if (event.payload.skillId === "A236") {
            const lifting = state.queue.pending.find(row => row.dueUs === event.dueUs + 20_000 && row.payload.type === "impale-lift");
            if (lifting) effects["H061/A236"] ??= { ...hit, lifted: lifting.payload.targets };
          }
          if (event.payload.skillId === "A238" && hit.sourceTemplate === "q059")
            effects["H061/A238"] ??= { ...hit, stacks: actor.fingerStacks };
        }
        if (cardId === "i597" && event.payload.type === "lion-hex-tail" && event.payload.towerId === heroId) {
          const transformed = state.enemies.find(unit => unit.hexUntilUs === event.dueUs + 2_800_000 && unit.hexForm);
          if (transformed) effects["H061/A237"] ??= { ...hit, hexTarget: transformed.id, form: transformed.hexForm };
        }
        if (cardId === "i556" && event.payload.type === "weapon-fire" && actor.hero?.ranks.A032) {
          const target = state.enemies.find(unit => unit.id === hit.targetId);
          if (target?.stunUntilUs === hit.atUs + 1_000_000 || target?.stunUntilUs === hit.atUs + 400_000)
            effects[`${actor.templateId}/A032`] ??= hit;
        }
      }
      if (result !== "pending") return;
    }
  }
  function send(action) {
    const id = String((continued?.prefixInputs ?? 0) + commands.length + 1);
    const atUs = state.queue.nowUs;
    if (!enqueue(state, { id, matchId: state.matchId, action })) return;
    advance(.001);
    for (let retry = 0; retry < 44 && state.phase === "running" && !state.commandResults[id]; retry++) advance(250);
    const result = state.commandResults[id];
    commands.push({ atUs, action, result });
    return result;
  }
  function use(id) {
    const item = state.inventory.find(entry => entry.itemId === id && entry.slot !== null && entry.towerId === undefined);
    if (item) return send({ type: "use-item", itemId: item.id });
  }
  function build(action, points) {
    const point = points.find(point => inspectBuildPlacement(state, { ...action, point }).ok);
    if (point) return send({ ...action, point });
  }
  let openingHero;
  if (openingContinuation) {
    openingHero = heroId;
  } else if (continued) {
    const sites = [{ x: 288, y: -640 }, { x: -288, y: -352 }, { x: 192, y: -32 }, { x: 288, y: 448 }];
    for (const area of map.buildAreas) {
      for (let y = Math.ceil((area.minY + 72) / gridSize) * gridSize; y <= area.maxY - 72; y += 3 * gridSize) {
        for (let x = Math.ceil((area.minX + 72) / gridSize) * gridSize; x <= area.maxX - 72; x += 3 * gridSize)
          sites.push({ x, y });
      }
    }
    while (!heroId && state.phase === "running" && state.wave <= continued.wave + 2) {
      heroId = build({ type: "build-card", cardId: continued.card.id }, sites)?.createdId;
      if (heroId) break;
      if (state.queue.nowUs >= (state.workerBenefitReadyUs ?? 0)) send({ type: "claim-worker-benefit" });
      if (state.population + continued.card.hp > state.populationLimit) {
        const providerIds = new Set(state.structures.filter(unit => unit.hero).flatMap(unit =>
          qualificationChains.get(unit.qualification)?.levels.map(level => level.id) ?? []));
        const starters = state.structures.filter(unit => !unit.pending && !unit.hero && unit.population > 0 &&
          !providerIds.has(unit.templateId)).sort((left, right) => {
          const priority = unit => /^n02[1-5]$/.test(unit.templateId) ? 0 : /^n00[1-5]$/.test(unit.templateId) ? 2 : 1;
          return priority(left) - priority(right) || left.id - right.id;
        });
        const starter = starters.find(unit => Math.hypot(unit.x - state.worker.x, unit.y - state.worker.y) <= 1000);
        if (starter) send({ type: "recycle-tower", towerId: starter.id });
        else if (starters[0] && !state.approach) send({ type: "move-worker", point: { x: starters[0].x, y: starters[0].y } });
      }
      advance(1000);
    }
    openingHero = heroId;
  } else {
    send({ type: "choose-talent", choice: "W005" });
    use("i004");
    const selection = send({ type: "choose-opening", card: opening });
    if ((opening === cardId || reserveDraw) && selection?.ok) {
      openingHero = build({ type: "build-card", cardId: selection.createdId }, [{ x: -288, y: -1024 }])?.createdId;
      if (opening === cardId) heroId = openingHero;
      if (openingHero) {
        build({ type: "build-worker-tower", tower: "n021" }, [{ x: 288, y: -1024 }]);
        build({ type: "build-worker-tower", tower: "n001" }, [{ x: -288, y: -640 }]);
        use("i006");
        use("i411");
        const blade = state.inventory.find(item => ["i131", "i133", "i262"].includes(item.itemId) && item.slot !== null);
        if (blade) send({ type: "transfer-item", itemId: blade.id, towerId: openingHero });
      }
    }
  }
  if (openingHero) {
    while (state.phase === "running" && state.wave <= (continued && !openingContinuation ? continued.wave + 7 : reserveDraw ? 38 : 17)) {
      if (bristleSupport) {
        for (const unit of state.structures.filter(unit => !unit.hero && !unit.pending && /^n0(?:0[1-5]|2[1-5])$/.test(unit.templateId))) {
          const upgrade = towerLevels.get(unit.templateId).upgrade;
          if (upgrade && state.gold >= upgrade.gold && state.lumber >= upgrade.wood &&
              state.population + upgrade.populationDelta <= state.populationLimit)
            send({ type: "upgrade-tower", towerId: unit.id });
        }
      }
      if (reserveDraw && opening !== cardId) {
        if (state.queue.nowUs >= (state.workerBenefitReadyUs ?? 0)) send({ type: "claim-worker-benefit" });
        const defense = state.structures.find(unit => unit.id === openingHero && !unit.pending);
        if (defense?.hero?.points > 0) for (const { skillId } of learnableSkills(defense.templateId)) {
          const required = learningLevel(defense.hero, defense.templateId, skillId);
          if (!defense.hero.ranks[skillId] && required !== undefined && defense.hero.level >= required)
            send({ type: "learn-skill", towerId: defense.id, skillId });
        }
        const archer = state.structures.find(unit => !unit.pending && /^n00[1-4]$/.test(unit.templateId));
        const upgrade = archer && towerLevels.get(archer.templateId).upgrade;
        if (upgrade && state.gold >= Math.max(1800, upgrade.gold + 600) && state.lumber >= upgrade.wood &&
            state.population + upgrade.populationDelta <= state.populationLimit)
          send({ type: "upgrade-tower", towerId: archer.id });
        if (!heroId) {
          const target = state.cards.find(card => card.card === cardId);
          const gold = state.gold;
          if (target) {
            if (target.slot === null) send({ type: "pick-up-card", cardId: target.id });
            if (target.slot !== null) heroId = build({ type: "build-card", cardId: target.id },
              [{ x: 288, y: -640 }, { x: -288, y: -352 }, { x: 192, y: -32 }])?.createdId;
          } else {
            for (const card of state.cards.filter(card => card.slot !== null)) send({ type: "drop-card", cardId: card.id });
            const bonus = ["i003", "i005"].find(id => state.inventory.some(item => item.itemId === id && item.slot !== null && item.towerId === undefined));
            const draw = bonus ? use(bonus) : state.wave >= 11 && state.gold >= 6500 ? send({ type: "draw", draw: "i003" }) : undefined;
            if (draw) acquisition.push({ wave: state.wave, atUs: state.queue.nowUs, beforeGold: gold, afterGold: state.gold,
              draw: bonus ?? "i003", card: state.cards.find(card => card.id === draw.createdId)?.card, result: draw });
          }
        }
      }
      const actor = state.structures.find(unit => unit.id === heroId && !unit.pending);
      if (actor?.hero) {
        for (const skillId of profile.skills) {
          if (actor.hero.ranks[skillId] || actor.hero.points < 1) continue;
          const required = learningLevel(actor.hero, actor.templateId, skillId);
          if (learnableSkills(actor.templateId).some(skill => skill.skillId === skillId) &&
              required !== undefined && actor.hero.level >= required) {
            send({ type: "learn-skill", towerId: heroId, skillId });
            if (skillId === profile.learnedProof) {
              effects[skillId] = { rank: actor.hero.ranks[skillId], manaRegen: actor.manaRegen, atUs: state.queue.nowUs,
                ...(skillId === "A006" && { T002: actor.hero.ranks.T002 }) };
            }
          }
        }
        if (cardId === "i595" && actor.hero.ranks.A225) {
          const needed = ["AGI", "STR"].find(attribute => !effects[`${actor.templateId}/A225/${attribute}`]);
          if (needed && actor.morphShift?.attribute !== needed)
            send({ type: "toggle-morph", towerId: heroId, attribute: needed });
          else if (!needed && actor.morphShift)
            send({ type: "toggle-morph", towerId: heroId, attribute: actor.morphShift.attribute });
        }
        const readyToChange = profile.attacks.every(skillId => effects[`${profile.from}/${skillId}`]) &&
          (!profile.learnedProof || effects[profile.learnedProof]) && (cardId !== "i556" || effects[`${profile.from}/A032`]);
        if (profile.skin && actor.templateId === profile.from && readyToChange && !actor.sleight &&
            state.queue.nowUs >= Math.max(actor.heroCastUntilUs ?? 0, actor.stunnedUntilUs ?? 0)) {
          send({ type: "choose-skin", towerId: heroId, choice: profile.skin });
        }
        if (manualVoid && actor.hero.ranks.A160 && !effects[`${actor.templateId}/A160`] &&
            state.queue.nowUs >= Math.max(actor.heroCastUntilUs ?? 0, actor.stunnedUntilUs ?? 0, actor.heroSpellReady?.A160 ?? 0)) {
          const depleted = heroSpellTargets(state, actor.id, "A160").find(enemy => (enemy.manaMax ?? 0) > enemy.mana);
          if (depleted) send({ type: "cast-hero", towerId: heroId, skillId: "A160", targetId: depleted.id });
        }
        if (profile.attacks.every(skillId => effects[`${profile.to}/${skillId}`])) break;
      }
      advance(1000);
    }
  }
  return { seed, source, initialStateSha256, candidates: state.openingCandidates, opening, heroId, effects, commands, ...(reserveDraw && { acquisition }),
    ...(continued && { continuation: { cardInstance: continued.instance, wave: continued.wave, prefixInputs: continued.prefixInputs,
      inputLogSha256: continued.inputLogSha256 } }),
    end: { phase: state.phase, wave: state.wave, atUs: state.queue.nowUs, result: state.result },
    status: profile.attacks.every(skillId => effects[`${profile.to}/${skillId}`]) ? "passed" : opening === cardId || reserveDraw || continued ? "failed" : "candidate-not-offered" };
}

console.log(JSON.stringify({ version: m3ContentVersion, configuration: m3ConfigVersion,
  policy: continuedRun ? `${profile.label}-actual-${openingContinuation ? "opening" : "draw"}-continuation${bristleSupport ? "-support" : ""}` : reserveDraw ? `${profile.label}-sr-reserve` : manualVoid ? `${profile.label}-manual` : profile.label, cardId, samples: (continuedRun ? [continuedRun.seed] : seeds).map(run) }, null, 2));
