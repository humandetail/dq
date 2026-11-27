// Runs ordinary commands from a fresh match. Reports failures as well as any
// candidate A10 result. No enemy, inventory, RNG or queue entries are injected.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentVersion, configuration, cardTemplates, qualificationChains, towerLevels, ordinaryGoods, recipes, itemFields, summonCards, waveRewards } from "../src/game/m2/content.ts";
import { contains, gridSize, map, mapVersion } from "../src/game/m2/map.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { circleId, containmentPoints, controlEquipmentTargets, creditTime, drain, enqueue, heroAllySpellTargets, heroSpellTargets, inspectBuildPlacement, newMatch, qualified, spendableScore, transmuteTargets } from "../src/game/m2/match.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { learnableSkills, learningLevel } from "../src/game/m2/hero.ts";
import { heroExchangeOffers, mallHeroLimit } from "../src/game/m2/hero-exchange.ts";
import { recordPeakSnapshots } from "./m3-peak-snapshots.mjs";

import { waves as mainline } from "../src/game/m2/waves.ts";

const second = 1_000_000;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const m3 = process.env.M3_VERIFY === "1";
const collectPeaks = process.env.M2_PEAK_SELECTION === "1";
const masteryPilot = process.env.M3_R03_MASTERY === "1";
const masteryOffers = ["i549", "i548", "i547"];
assert.ok(!masteryPilot || m3, "R03 mastery is an M3-only normal scenario");
const version = m3 ? await import("../src/game/m2/m3-version.ts") : undefined;
const terminalDirectory = process.env.M3_TERMINAL_SNAPSHOT_DIR;
const masteryDirectory = process.env.M3_R03_SNAPSHOT_DIR;
if (masteryDirectory) {
  assert.ok(m3 && process.env.M2_REPLAY && !process.env.M2_RESUME_PEAK, "R03 export requires complete normal input replay");
  await mkdir(masteryDirectory, { recursive: true });
}
const a18Directory = process.env.M3_A18_SNAPSHOT_DIR;
const a17Directory = process.env.M3_A17_SNAPSHOT_DIR;
const r05Directory = process.env.M3_R05_SNAPSHOT_DIR;
if (terminalDirectory) {
  assert.ok(m3 && process.env.M2_REPLAY && !process.env.M2_RESUME_PEAK, "Terminal export requires a complete M3 replay");
  await mkdir(terminalDirectory, { recursive: true });
}
if (a18Directory) {
  assert.ok(m3 && process.env.M2_REPLAY && !process.env.M2_RESUME_PEAK, "A18 export requires a complete M3 replay");
  await mkdir(a18Directory, { recursive: true });
}
if (a17Directory) {
  assert.ok(m3 && process.env.M2_REPLAY && !process.env.M2_RESUME_PEAK, "A17 export requires a complete M3 replay");
  await mkdir(a17Directory, { recursive: true });
}
if (r05Directory) {
  assert.ok(m3 && process.env.M2_REPLAY && !process.env.M2_RESUME_PEAK, "R05 export requires a complete M3 replay");
  await mkdir(r05Directory, { recursive: true });
}
const eventShop = process.env.M3_R05 === "1" ? await import("../src/game/m2/event-boxes.ts") : undefined;
const eventBalances = match => ({ activityScore: match.activityScore ?? 0, fragments: match.fragments ?? 0,
  eventScore: match.eventScore ?? 0, openGiftNum: match.openGiftNum ?? 0 });
const openingOrder = ["i564", "i581", "i569", "i576"];
const seeds = process.argv.slice(2).length ? process.argv.slice(2).map(Number) :
  m3 ? [14, 47, 811, 1709, 20261124] : [47, 811, 1709, 20261124];
const entryOpening = process.env.M2_LAYOUT === "entry";
const initialSites = [
  ...entryOpening ? [{ x: -288, y: -1024 }, { x: 288, y: -1024 }, { x: -288, y: -640 }] :
    [{ x: -288, y: -160 }, { x: 192, y: -224 }, { x: 192, y: -32 }],
];
const fieldSites = map.buildAreas.flatMap(area => {
  const points = [];
  for (let y = Math.ceil((area.minY + 72) / gridSize) * gridSize; y <= area.maxY - 72; y += 3 * gridSize) {
    for (let x = Math.ceil((area.minX + 72) / gridSize) * gridSize; x <= area.maxX - 72; x += 3 * gridSize) {
      points.push({ x, y });
    }
  }
  return points;
});
const preferredSites = [...initialSites, ...fieldSites];
const roadSamples = map.waypoints.flatMap(waypoint => waypoint.next.flatMap(index => {
  const target = map.waypoints[index];
  return [.25, .5, .75].map(t => ({ x: waypoint.x * (1 - t) + target.x * t, y: waypoint.y * (1 - t) + target.y * t }));
}));

const buildIndex = await readFile(new URL("../dist/m2.html", import.meta.url), "utf8").catch(() => "");
const bundlePath = buildIndex.match(/src="\.?((?:\/assets\/)m2-[^"]+\.js)"/)?.[1];
const bundle = bundlePath && await readFile(new URL("../dist" + bundlePath, import.meta.url));
const bundleSha256 = bundle && sha256(bundle);

function run(seed, trace) {
  const supportedSeasonChallenges = process.env.M3_R04_CHALLENGES === "support";
  const seasonalChallenges = supportedSeasonChallenges || process.env.M3_R04_CHALLENGES === "1";
  const seasonPilot = !seasonalChallenges && process.env.M3_R04 === "1";
  const archive = startSeasons();
  const match = newMatch(`normal-${seed}`, seed, archive.seasons);
  if (seasonPilot) match.startingScore = archive.score;
  const initialStateSha256 = sha256(JSON.stringify(match));
  const candidates = match.openingCandidates;
  assert.equal(!!candidates, m3, "Set M3_VERIFY=1 for the M3 workspace. Run historical M2 from its archived source.");
  const bossSupport = process.env.M3_A10_SUPPORT === "1";
  const finalBossGear = bossSupport || process.env.M3_A10_FINAL_GEAR === "1";
  const bossMobility = finalBossGear || process.env.M3_A10_BOSS_MOBILITY === "1";
  const mobilityOpenings = bossMobility ? ["i572", "i588", "i576"] : [];
  const preferences = [...new Set([process.env.M2_OPENING, ...(seasonPilot ? ["i565"] : []), ...mobilityOpenings, ...openingOrder].filter(Boolean))];
  const opening = m3 ? preferences.find(card => candidates.includes(card)) ?? candidates[0] :
    process.env.M2_OPENING ?? "i564";
  Object.assign(trace, { initialStateSha256, candidates, opening, preferences });
  const qualificationRealAssignment = process.env.M3_QUAL_REAL_ASSIGNMENT === "1";
  let qualificationTarget = process.env.M2_QUALIFICATION;
  assert.ok(!qualificationTarget || qualificationChains.has(qualificationTarget), "Unknown requested qualification chain");
  assert.ok(!qualificationRealAssignment || m3 && !qualificationTarget, "Use the actual qualification in a separate M3 scenario");
  const qualificationScenario = qualificationRealAssignment || !!qualificationTarget;
  const bristleTrial = process.env.M3_R02_BRISTLE === "1" ? {} : undefined;
  assert.ok(!bristleTrial || m3 && opening === "i584", "Bristleback normal trace needs its actual opening offer");
  let maxProvider;
  let assignedQualification;
  const oracleDraw = process.env.M3_R02_SR === "i577";
  assert.ok(!process.env.M3_R02_SR || m3 && oracleDraw && !process.env.M2_SSR && configuration.cardPools.SR.includes("i577"),
    "Oracle SR observation requires the M3 SR pool and no SSR target");
  const ssrTarget = process.env.M2_SSR ?? (oracleDraw ? "i577" : undefined);
  const bossReserveWave = Number(process.env.M2_BOSS_RESERVE ?? Infinity);
  const scepterBankUntil = Number(process.env.M2_SCEPTER_BANK_UNTIL ?? Infinity);
  const bossFocus = process.env.M3_A10_BOSS_FOCUS === "1";
  assert.ok(!ssrTarget || oracleDraw || configuration.cardPools.SSR.includes(ssrTarget), "Unknown requested SSR card");
  const doomExchange = process.env.M3_R02_DOOM_EXCHANGE === "1";
  assert.ok(!doomExchange || m3 && ssrTarget === "i509", "Doom skill trial uses the existing i547 exchange");
  const ssrRoot = ssrTarget && cardTemplates.get(ssrTarget).root;
  let doomDraw;
  let doomChallenge;
  let ssrRun;
  const passiveSsr = ssrTarget === "i504";
  const requiemSsr = ssrTarget === "i501";
  const tinkerSsr = ssrTarget === "i505";
  const alchemistSsr = ssrTarget === "i507";
  const extraSsrSkills = { i506: ["A076", "A079"], i508: ["A104", "A107"], i509: ["A164", "A165", "A166"],
    i510: ["A231", "A232"] };
  const ssrAppearance = passiveSsr ? { selection: "S152", target: "G052" } : requiemSsr ? { selection: "S162", target: "G053" } :
    oracleDraw ? { selection: "S252", target: "G064" } : undefined;
  const ssrSkills = ssrTarget === "i502" ? ["A019", "A020"] : passiveSsr ? ["A025", "A026", "A027"] :
    requiemSsr ? ["A001", "A002", "A003"] : tinkerSsr ? ["A073", "A074", "A075"] : alchemistSsr ? ["A108", "A109", "A110"] :
    oracleDraw ? ["A155", "A156", "A157"] : extraSsrSkills[ssrTarget] ?? ["A041", "A042"];
  const seekChallenge = process.env.M2_A17 === "1";
  assert.ok(!eventShop || m3 && !seekChallenge, "Run R05 as a separate M3 scenario");
  const eventEvidence = eventShop && { initial: eventBalances(match), challenges: [], purchases: [], opened: [] };
  const bankForChallenge = seekChallenge && process.env.M2_A17_BANK === "1";
  const challengeBankWave = Number(process.env.M2_A17_BANK_WAVE ?? 28);
  const challengeMaterialWave = Number(process.env.M2_A17_MATERIAL_WAVE ?? Infinity);
  const seekChest = process.env.M2_A18 === "1";
  const wishForChests = seekChest && process.env.M2_CHEST_WISH === "1";
  const retryChestPickup = seekChest && process.env.M3_A18_PICKUP_RETRY === "1";
  const forgeRequest = process.env.M2_A18_FORGE;
  const stopAfterForge = process.env.M3_A18_FORGE_STOP === "1";
  const brokenBlades = { i132: "i131", i134: "i133", i263: "i262" };
  assert.ok(!forgeRequest || forgeRequest === "any" || Object.hasOwn(brokenBlades, forgeRequest), "Unknown A18 forge target");
  const forgeEvidence = forgeRequest && { request: forgeRequest, target: forgeRequest === "any" ? undefined : forgeRequest,
    brokenBlade: brokenBlades[forgeRequest], crossings: [] };
  let forgeSample;
  const settlementScenario = process.env.M2_A11;
  const secondHeroCard = process.env.M2_SECOND_HERO ?? (seasonPilot || bossSupport && opening === "i576" ? "i571" : undefined);
  assert.ok(!secondHeroCard || configuration.cardPools.SR.includes(secondHeroCard), "Unknown second hero card");
  assert.ok(!settlementScenario || ["charm", "timeout"].includes(settlementScenario));
  let charmClaim;
  let charmSettlement;
  const challengeUnits = ["m521", "m522", "m523"];
  const challengeEvidence = [];
  let challengeProduct;
  let challengeClosure;
  const challengeMaterials = [];
  const challengeMysteryStock = [];
  let lastChallengeStock;
  const chestEvidence = { drops: {}, opens: [], ...(retryChestPickup ? { pickups: [] } : {}) };
  const attemptedLoot = new Set();
  const scepterPlan = process.env.M2_PLAN === "scepter" && opening === "i576";
  const { inputs, waves } = trace;
  const usedSsr = [];
  const mastery = masteryPilot && { claims: [], before41: null, repeats: [], refusedThird: null };
  function masteryExchange(offer) {
    const atUs = match.queue.nowUs;
    const wave = match.wave;
    const materials = match.cards.filter(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === 13)
      .sort((left, right) => left.slot - right.slot).map(({ id, card, slot }) => ({ id, card, slot }));
    const beforeClaims = [...match.mallHeroClaims ?? []];
    const beforeScore = spendableScore(match);
    const spring9 = match.seasons.spring.counts[9] ?? 0;
    const result = command({ type: "exchange-hero", offer });
    return { atUs, wave, offer, materials, beforeClaims, beforeScore, spring9, result,
      afterClaims: [...match.mallHeroClaims ?? []], afterScore: spendableScore(match),
      finalSpring9: match.seasons.spring.counts[9] ?? 0,
      consumed: materials.filter(material => !match.cards.some(card => card.id === material.id)),
      received: match.cards.find(card => card.id === result?.createdId) };
  }
  const seasonEvidence = seasonPilot && { initialScore: archive.score, initial: archive.seasons, transitions: [], wisp: [] };
  const summerChallengeTrail = seasonalChallenges ? [] : undefined;
  let observedSeasonRevision = 0;
  let breakthrough = null;
  let bossHealth = null;
  let peak = { enemies: 0, events: 0, bytes: 0 };
  const peaks = {};
  const sampled = () => {
    const challenge = summerChallengeTrail?.at(-1);
    if (challenge && !challenge.cleared && match.challengeShopOpen && !match.challenges?.[challenge.id]) {
      challenge.cleared = { atUs: match.queue.nowUs, wave: match.wave, stock: { ...match.challengeStock },
        unlocks: match.seasonalChallengeUnlocks ?? 0, summer8: match.seasons?.summer.counts[8] ?? 0 };
    }
    if (seasonEvidence && (match.seasonRevision ?? 0) !== observedSeasonRevision) {
      observedSeasonRevision = match.seasonRevision;
      seasonEvidence.transitions.push({ atUs: match.queue.nowUs, wave: match.wave, revision: observedSeasonRevision,
        welfareGold: match.lastWelfareGold, pointsAwarded: match.seasonScore ?? 0, progress: structuredClone(match.seasons) });
    }
    if (collectPeaks) recordPeakSnapshots(peaks, match, { seed, caseId: "normal", nextInput: inputs.length });
    if (eventEvidence) {
      const last = eventEvidence.challenges.at(-1);
      if (last && !last.cleared && match.challengeShopOpen && !match.challenges?.[last.id]) {
        const after = eventBalances(match);
        const spent = eventEvidence.purchases.filter(entry => entry.atUs > last.atUs)
          .reduce((total, entry) => total + entry.before.activityScore - entry.after.activityScore, 0);
        last.cleared = { atUs: match.queue.nowUs, wave: match.wave, after, spent,
          earned: after.activityScore - last.before.activityScore + spent };
      }
    }
    if (forgeEvidence) {
      const blades = match.inventory.filter(item => item.towerId === circleId && item.slot !== null &&
        Object.values(brokenBlades).includes(item.itemId)).sort((first, second) => first.slot - second.slot);
      if (!forgeEvidence.brokenBlade && blades.length) {
        const [target, broken] = Object.entries(brokenBlades).find(([, id]) => id === blades[0].itemId);
        forgeEvidence.target = target;
        forgeEvidence.brokenBlade = broken;
      }
      const blade = blades.find(item => item.itemId === forgeEvidence.brokenBlade);
      const progress = match.seasons?.spring.counts[4] ?? 0;
      forgeEvidence.source ??= blade && { instanceId: blade.id, wave: match.wave, atUs: match.queue.nowUs };
      if (forgeSample && !blade && !match.inventory.some(item => item.id === forgeSample.instanceId)) {
        const finished = match.inventory.find(item => item.towerId === circleId && item.itemId === forgeEvidence.target &&
          !forgeSample.previousFinished.includes(item.id));
        if (finished) forgeEvidence.crossings.push({ from: forgeSample, atUs: match.queue.nowUs, wave: match.wave,
          to: { instanceId: finished.id, itemId: finished.itemId, progress } });
      }
      forgeSample = blade && { instanceId: blade.id, souls: blade.charges, progress, atUs: match.queue.nowUs,
        previousFinished: match.inventory.filter(item => item.itemId === forgeEvidence.target).map(item => item.id) };
      forgeEvidence.last = forgeSample ?? forgeEvidence.last;
    }
    if (challengeClosure) {
      const active = match.enemies.filter(enemy => enemy.challengeId === challengeClosure.reservationId);
      const pending = match.queue.pending.some(event => event.payload.type === "challenge-spawn" &&
        event.payload.challengeId === challengeClosure.reservationId);
      if (match.challengeShopOpen) {
        challengeClosure.arrivals = Math.max(challengeClosure.arrivals, active.length);
        challengeClosure.pendingBeforeClose ||= pending;
      } else {
        challengeClosure.closed ??= { atUs: match.queue.nowUs, wave: match.wave, active: active.length, pending,
          registered: !!match.challenges?.[challengeClosure.reservationId] };
      }
    }
    if (seekChallenge && match.mysteryShopOpen) {
      const stock = JSON.stringify(match.mysteryStock);
      if (stock !== lastChallengeStock) {
        lastChallengeStock = stock;
        challengeMysteryStock.push({ wave: match.wave, atUs: match.queue.nowUs, stock: { ...match.mysteryStock } });
      }
    }
    const boss = match.enemies.find(enemy => enemy.unitId === "mBOS");
    if (boss && (bossHealth === null || boss.hp < bossHealth.hp)) {
      bossHealth = { hp: boss.hp, maximum: boss.maxHp, atUs: match.queue.nowUs };
    }
    if (seekChest) for (const item of match.inventory.filter(entry =>
      entry.slot === null && ["i404", "i414"].includes(entry.itemId) && !Object.hasOwn(chestEvidence.drops, entry.id))) {
      chestEvidence.drops[item.id] = { id: item.id, item: item.itemId, wave: match.wave, atUs: match.queue.nowUs, point: item.point };
    }
    for (const attempt of challengeEvidence) {
      for (const enemy of match.enemies) {
        if (enemy.challengeId === attempt.id && !attempt.enemies.includes(enemy.id)) attempt.enemies.push(enemy.id);
      }
      if (attempt.cleared || !match.challengeShopOpen || match.challenges?.[attempt.id]) continue;
      attempt.cleared = { atUs: match.queue.nowUs, wave: match.wave, gold: match.gold, lumber: match.lumber,
        bookStock: match.challengeStock?.i266 ?? 0 };
    }
    for (const card of match.cards) {
      if (cardTemplates.get(card.card)?.rarity === "SSR" && !usedSsr.includes(card.card)) usedSsr.push(card.card);
    }
    const ssrTower = ssrRoot && match.structures.find(entry => !entry.pending &&
      (entry.templateId === ssrRoot || entry.id === ssrRun?.id));
    if (ssrTower && !ssrRun) ssrRun = { id: ssrTower.id, unitId: ssrRoot, builtWave: match.wave, learned: {}, casts: {}, hits: 0 };
    if (ssrTower && ssrRun) {
      ssrRun.learned = { ...ssrTower.hero.ranks };
      if (ssrAppearance) {
        const forms = ssrRun.forms ??= {};
        const entry = forms[ssrTower.templateId] ??= { wave: match.wave, atUs: match.queue.nowUs, learned: {} };
        entry.learned = { ...ssrRun.learned };
        if (oracleDraw) {
          const skin = ssrTower.templateId === "G064";
          const art = { A155: skin ? "HAJT1" : "darkmending", A156: "fatesedict", A157: skin ? "HAJT2" : "shenYuZhe" };
          for (const skill of ssrSkills) {
            if (entry[skill]) continue;
            for (const effect of match.battleAnimations ?? []) {
              if (effect.unitId !== art[skill] || effect.atUs < entry.atUs) continue;
              if (skill === "A156") {
                const target = match.enemies.find(unit => unit.id === effect.enemyId && unit.oracleEdict);
                if (target) entry[skill] = { atUs: effect.atUs, enemyId: target.id, timerId: target.oracleEdict.timerId };
              } else {
                const packet = match.recentHits?.find(hit => hit.atUs === effect.atUs && hit.ownerId === ssrTower.id &&
                  hit.sourceTemplate === ssrTower.templateId);
                if (packet) entry[skill] = packet;
              }
              if (entry[skill]) break;
            }
          }
        }
        if (ssrTower.attackSpeedTrainingRank && ssrTower.attack?.timing) {
          entry.training ??= { atUs: match.queue.nowUs, rank: ssrTower.attackSpeedTrainingRank, rawRate: ssrTower.attack.timing.rawRate };
        }
        if (ssrSkills.every(id => ssrRun.learned[id])) {
          entry.allLearnedUs ??= match.queue.nowUs;
          const recent = match.recentHits?.find(hit => hit.casterId === ssrTower.id &&
            hit.sourceTemplate === ssrTower.templateId && hit.atUs > entry.allLearnedUs);
          if (recent) entry.attack ??= recent;
          if (requiemSsr && ssrTower.souls > 0) {
            entry.souls ??= { amount: ssrTower.souls, atUs: match.queue.nowUs };
            const ray = match.queue.pending.find(({ payload }) => payload.type === "spell-sweep" &&
              payload.sweep.name === "A001" && payload.sweep.towerId === ssrTower.id &&
              payload.sweep.startedUs >= entry.allLearnedUs && payload.sweep.hit.length)?.payload.sweep;
            if (ray) entry.rayHit ??= { carrierId: ray.sourceId, targets: [...ray.hit], castUs: ray.startedUs, atUs: match.queue.nowUs };
          }
        }
      } else {
        for (const id of ssrSkills) {
          if (ssrTower.heroSpellReady?.[id]) ssrRun.casts[id] ??= { wave: match.wave, readyUs: ssrTower.heroSpellReady[id] };
        }
      }
      if (tinkerSsr) {
        const laser = match.battleAnimations?.find(effect => effect.unitId === "T067");
        const robot = match.recentHits?.find(hit => hit.ownerId === ssrTower.id && hit.sourceTemplate === "q001");
        if (laser) ssrRun.laser ??= laser;
        if (robot) ssrRun.robot ??= robot;
        if (ssrTower.rearmTimer !== undefined) {
          const dueUs = match.queue.pending.find(event => event.timerId === ssrTower.rearmTimer)?.dueUs;
          if (dueUs !== undefined) ssrRun.rearmDueUs = dueUs;
        } else if (ssrRun.rearmDueUs && ["A073", "A074"].every(id => ssrTower.heroSpellReady?.[id] === ssrRun.rearmDueUs)) {
          ssrRun.rearmFinished ??= { atUs: ssrRun.rearmDueUs, castBy: ssrTower.id };
        }
      }
      if (alchemistSsr) {
        if (ssrTower.alchemistShape) ssrRun.chemicalRage ??= { atUs: match.queue.nowUs, templateId: ssrTower.templateId,
          rank: ssrTower.alchemistShape.rank, manaRegen: ssrTower.manaRegen };
        if (ssrTower.goblinGreed) ssrRun.greed ??= { atUs: match.queue.nowUs, earned: ssrTower.goblinGreedGold,
          streak: ssrTower.goblinGreed.accumulated };
      }
      if (ssrTarget === "i506") {
        if (ssrTower.jingu?.rank) ssrRun.jingu ??= { ...ssrTower.jingu, atUs: match.queue.nowUs };
        const clone = match.summons?.find(unit => unit.summon?.skillId === "A079" && unit.summon.ownerId === ssrTower.id);
        if (clone) ssrRun.army ??= { id: clone.id, templateId: clone.templateId, atUs: match.queue.nowUs };
      }
      if (ssrTarget === "i509") {
        if (ssrTower.doomDigestTimer !== undefined) ssrRun.digestion ??= { timerId: ssrTower.doomDigestTimer, atUs: match.queue.nowUs };
        const curse = match.queue.pending.find(({ payload }) => payload.type === "doom-curse" && payload.towerId === ssrTower.id);
        if (curse) {
          const enemy = match.enemies.find(entry => entry.id === curse.payload.targetId);
          ssrRun.doom ??= { ...curse.payload, atUs: match.queue.nowUs, target: enemy?.unitId, untilUs: enemy?.doomCurse?.untilUs };
        }
      }
      if (ssrTarget === "i510") {
        if (ssrTower.spectreDesolateReadyUs) ssrRun.desolate ??= { atUs: match.queue.nowUs, readyUs: ssrTower.spectreDesolateReadyUs };
        if (ssrTower.spectreRefraction?.total > 0) ssrRun.refraction ??= { ...ssrTower.spectreRefraction, atUs: match.queue.nowUs };
        const haunt = match.summons?.find(unit => unit.summon?.skillId === "A232" && unit.summon.ownerId === ssrTower.id);
        if (haunt) ssrRun.haunt ??= { id: haunt.id, templateId: haunt.templateId, atUs: match.queue.nowUs };
      }
      ssrRun.hits = Math.max(ssrRun.hits, match.recentHits?.filter(hit => hit.casterId === ssrTower.id).length ?? 0);
    }
    if (qualificationScenario && !assignedQualification) {
      assignedQualification = match.structures.find(tower => tower.hero)?.qualification;
      if (qualificationRealAssignment && assignedQualification) qualificationTarget = assignedQualification;
    }
    if (qualificationTarget && !maxProvider) {
      const chain = qualificationChains.get(qualificationTarget);
      const provider = match.structures.find(tower => !tower.pending && tower.templateId === chain.requireUnit);
      if (provider) maxProvider = { id: provider.id, templateId: provider.templateId, atUs: match.queue.nowUs, wave: match.wave };
    }
    if (!breakthrough && match.wave < 55) {
      const hero = match.structures.find(tower => tower.hero?.level >= 21 && qualified(match, tower.id));
      if (hero) breakthrough = { wave: match.wave, atUs: match.queue.nowUs, tower: hero.templateId, towerId: hero.id,
        level: hero.hero.level, qualification: hero.qualification };
    }
    if (bristleTrial) {
      const actor = match.structures.find(tower => tower.templateId === "H047" && !tower.pending);
      if (actor) {
        const target = match.enemies.find(enemy => enemy.bristleGoo?.[actor.id] && enemy.bristleGooSlow);
        if (target) bristleTrial.goo ??= { wave: match.wave, atUs: match.queue.nowUs, targetId: target.id,
          armor: target.bristleGooArmor, slow: target.bristleGooSlow };
        const hammer = match.recentHits?.find(hit => hit.ownerId === actor.id && hit.sourceTemplate === "q001" &&
          match.battleAnimations?.some(effect => effect.unitId === "T197" && effect.atUs === hit.atUs && effect.x === hit.x && effect.y === hit.y));
        if (hammer) bristleTrial.hammer ??= { wave: match.wave, rank: actor.hero.ranks.A183, ...hammer };
        for (const enemy of match.enemies) {
          const mark = enemy.quills?.[actor.id];
          if (!mark) continue;
          if (mark.stacks > (bristleTrial.maxLayers?.stacks ?? 0)) {
            bristleTrial.maxLayers = { wave: match.wave, atUs: match.queue.nowUs, targetId: enemy.id,
              unitId: enemy.unitId, stacks: mark.stacks, rank: actor.hero.ranks.A183 };
          }
          if (mark.stacks < 5 || !enemy.stunUntilUs || bristleTrial.hammerControl) continue;
          const effect = match.battleAnimations?.find(entry => entry.unitId === "T197" &&
            entry.atUs + second === enemy.stunUntilUs && (entry.x - enemy.x) ** 2 + (entry.y - enemy.y) ** 2 <= 50 ** 2);
          if (effect) bristleTrial.hammerControl = { wave: match.wave, targetId: enemy.id, unitId: enemy.unitId,
            welfare: !!enemy.welfare, stacks: mark.stacks, stunnedUntilUs: enemy.stunUntilUs, effect };
        }
      }
    }
    peak.enemies = Math.max(peak.enemies, match.enemies.length);
    peak.events = Math.max(peak.events, match.queue.pending.length);
  };

  function advance(deltaUs) {
    creditTime(match, deltaUs / 1000);
    // At the threshold, sample each event without changing its ordering or time.
    if (alchemistSsr && ssrRun && !ssrRun.acidHit) {
      for (;;) {
        const event = match.queue.pending[0];
        const before = match.recentHits?.at(-1);
        const result = drain(match, 1);
        if (event?.payload.type === "acid-cloud-tick" && event.dueUs === match.queue.nowUs && match.recentHits?.at(-1) !== before) {
          const hit = match.recentHits.at(-1);
          if (hit.ownerId === ssrRun.id) ssrRun.acidHit = hit;
        }
        if (result !== "pending") break;
      }
    } else if (forgeSample?.souls >= 1300) {
      while (drain(match, 1) === "pending") sampled();
    } else {
      while (drain(match, 10_000) === "pending") {}
    }
    sampled();
  }

  function command(action) {
    const id = String(inputs.length + 1);
    const atUs = match.queue.nowUs;
    const wave = match.wave;
    let acquisition;
    if (qualificationScenario) {
      if (action.type === "build-card") {
        const card = match.cards.find(entry => entry.id === action.cardId);
        if (card) acquisition = { card: card.card, root: cardTemplates.get(card.card).root };
      } else if (action.type === "upgrade-tower") {
        const tower = match.structures.find(entry => entry.id === action.towerId);
        if (tower) acquisition = { from: tower.templateId, ...towerLevels.get(tower.templateId)?.upgrade };
      } else if (action.type === "exchange") {
        const materials = match.cards.filter(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === 12)
          .sort((a, b) => a.slot - b.slot).slice(0, 5);
        acquisition = { materials: materials.map(card => ({ id: card.id, card: card.card, slot: card.slot })) };
      } else if (action.type === "draw") acquisition = { gold: ordinaryGoods.get(action.draw).gold };
    }
    if (!enqueue(match, { id, matchId: match.matchId, action })) return;
    advance(1);
    for (let i = 0; i < 44 && match.phase === "running" && !match.commandResults[id]; i++) advance(second / 4);
    const outcome = match.commandResults[id];
    if ((qualificationScenario || ssrTarget) && outcome?.createdId && ["draw", "exchange", "exchange-hero", "use-item"].includes(action.type)) {
      const card = match.cards.find(entry => entry.id === outcome.createdId);
      if (card) acquisition = { ...acquisition, obtainedCard: card.card, receivedId: card.id };
    }
    inputs.push({ atUs, action, ...(outcome ? { outcome } : {}), ...((qualificationScenario || ssrTarget) ? { wave, acquisition } : {}) });
    return outcome;
  }

  function build(action) {
    const available = preferredSites.filter(point => inspectBuildPlacement(match, { ...action, point }).ok);
    const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    const card = action.type === "build-card" && match.cards.find(entry => entry.id === action.cardId);
    const radius = card && ["i606", "i609", "i608"].includes(card.card) ? 1000 : 600;
    const existing = match.structures.filter(tower => !tower.pending);
    const weighted = roadSamples.map(sample => [sample, 1 / (1 + existing.filter(tower => d2(tower, sample) <= radius ** 2).length)]);
    const score = point => weighted.reduce((total, [sample, weight]) => total + (d2(sample, point) <= radius ** 2 ? weight : 0), 0);
    const point = match.structures.length < 3 ? available[0] :
      available.map(point => [point, score(point)]).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (point) return command({ ...action, point });
  }
  function upgrade(tower) {
    const next = towerLevels.get(tower.templateId)?.upgrade;
    if (tower.pending || !next || next.gold > match.gold || next.wood > match.lumber ||
        next.populationDelta + match.population > match.populationLimit) return false;
    return command({ type: "upgrade-tower", towerId: tower.id })?.ok;
  }
  function recycleTower(tower) {
    if (m3 && Math.hypot(tower.x - match.worker.x, tower.y - match.worker.y) > 1000) {
      const reached = command({ type: "move-worker", point: { x: tower.x, y: tower.y } });
      if (!reached?.ok) return;
    }
    return command({ type: "recycle-tower", towerId: tower.id });
  }

  const carriedItem = id => match.inventory.find(item => item.itemId === id && item.towerId === undefined && item.slot !== null);
  const equipped = id => match.inventory.some(item => item.itemId === id && item.towerId > 0 && item.slot !== null);
  const savingForScepter = () => scepterPlan && match.wave >= 30 && match.wave < scepterBankUntil && !equipped("i310");
  function shoppingList(id, available) {
    const count = available.get(id) ?? 0;
    if (count > 0) {
      available.set(id, count - 1);
      return [];
    }
    if (ordinaryGoods.has(id) || match.mysteryStock?.[id] > 0) return [id];
    const recipe = recipes.get(id);
    return recipe ? recipe.flatMap(part => shoppingList(part, available)) : [id];
  }

  function acquireAndEquip(id, tower, reserve, keepWithWorker = false) {
    if (!keepWithWorker && (!tower || tower.pending || equipped(id) ||
        match.inventory.filter(item => item.towerId === tower.id && item.slot !== null).length >= 6)) return;
    if (carriedItem(id)) return keepWithWorker ? undefined : command({ type: "transfer-item", itemId: carriedItem(id).id, towerId: tower.id });
    const available = new Map();
    for (const item of match.inventory) {
      if (item.slot !== null && item.towerId === undefined) {
        available.set(item.itemId, (available.get(item.itemId) ?? 0) + 1);
      }
    }
    const ingredients = shoppingList(id, available);
    const slotsUsed = () => match.cards.filter(card => card.slot !== null).length +
      match.inventory.filter(item => item.slot !== null && item.towerId === undefined).length + match.books.length;
    if (ingredients.some(part => !ordinaryGoods.has(part) && !match.mysteryStock?.[part])) return;
    const cost = ingredients.reduce((total, part) => total + (ordinaryGoods.get(part)?.gold ?? itemFields.get(part).goldcost ?? 0), 0);
    if (match.gold < cost + reserve) return;
    if (scepterPlan && id === "i310" && qualified(match, tower.id)) {
      for (const card of match.cards.filter(entry => entry.slot !== null && !entry.card.startsWith("c"))) {
        if (ingredients.length <= 6 - slotsUsed()) break;
        command({ type: "drop-card", cardId: card.id });
      }
    }
    if (ingredients.length > 6 - slotsUsed()) return;
    for (const part of ingredients) {
      const buy = ordinaryGoods.has(part) ? { type: "buy-item", itemId: part } :
        { type: "buy-special", shop: "mystery", itemId: part };
      if (!command(buy)?.ok) return;
    }
    const item = carriedItem(id);
    if (item && !keepWithWorker) return command({ type: "transfer-item", itemId: item.id, towerId: tower.id });
  }

  function openBossItemSlot(tower, dropCrystal) {
    const loadout = match.inventory.filter(item => item.towerId === tower.id && item.slot !== null);
    if (loadout.length < 6) return;
    const offering = loadout.find(item => item.itemId === "i198");
    const recipient = offering && match.structures.find(unit => unit !== tower && !unit.pending &&
      Math.hypot(unit.x - tower.x, unit.y - tower.y) <= 800 &&
      match.inventory.filter(item => item.towerId === unit.id && item.slot !== null).length < 6);
    if (recipient) command({ type: "transfer-item", itemId: offering.id, towerId: recipient.id });
    else if (dropCrystal) {
      const crystal = loadout.find(item => item.itemId === "i135");
      if (crystal) command({ type: "drop-item", itemId: crystal.id });
    }
  }

  command({ type: "choose-talent", choice: process.env.M2_TALENT ?? (wishForChests ? "W004" : "W005") });
  command({ type: "use-item", itemId: match.inventory.find(item => item.itemId === "i004").id });
  const hero = command({ type: "choose-opening", card: opening });
  assert.ok(hero?.ok, "Normal opening was rejected: " + JSON.stringify({ candidates, opening, hero }));
  if (doomExchange) {
    const exchange = command({ type: "exchange-hero", offer: "i547" });
    assert.ok(exchange?.ok && inputs.at(-1).acquisition?.obtainedCard === "i547", "Expected a normal i547 exchange");
    const placement = build({ type: "build-card", cardId: exchange.createdId });
    assert.ok(placement?.ok, "Normal Doom placement was rejected");
    doomDraw = { exchange: inputs.at(-2), placement: inputs.at(-1) };
  } else build({ type: "build-card", cardId: hero.createdId });
  build({ type: "build-worker-tower", tower: "n021" });
  build({ type: "build-worker-tower", tower: "n001" });
  const starterBlade = carriedItem("i006");
  if (starterBlade) command({ type: "use-item", itemId: starterBlade.id });
  const tierOneKey = carriedItem("i411");
  if (tierOneKey && carriedItem("i401")) command({ type: "use-item", itemId: tierOneKey.id });
  for (const item of [...match.inventory]) if (item.slot !== null && !["i412", "i001"].includes(item.itemId)) {
    command({ type: "transfer-item", itemId: item.id, towerId: 0 });
  }

  function hasQualificationTower(tower) {
    if (!tower) return false;
    const chain = qualificationChains.get(tower.qualification);
    return match.structures.some(entry => chain?.levels.some(level => level.id === entry.templateId));
  }

  let decision = match.queue.nowUs;
  let lastWave = 0;
  const ssrFormComplete = template => {
    const entry = ssrRun?.forms?.[template];
    if (oracleDraw) return ssrSkills.every(skill => entry?.[skill]);
    return requiemSsr ? !!(entry?.souls && entry?.rayHit) : !!(entry?.attack && entry?.training);
  };
  const ssrComplete = () => ssrRun?.hits > 0 && (ssrAppearance ? ssrFormComplete(ssrAppearance.target) :
    alchemistSsr ? !!(ssrRun.acidHit && ssrRun.greed && ssrRun.chemicalRage) : ssrSkills.every(id => ssrRun.casts[id])) &&
    (!tinkerSsr || !!(ssrRun.laser && ssrRun.robot && ssrRun.rearmFinished)) &&
    (ssrTarget !== "i506" || !!(ssrRun.jingu && ssrRun.army)) &&
    (ssrTarget !== "i509" || !!(ssrRun.digestion && ssrRun.doom)) &&
    (ssrTarget !== "i510" || !!(ssrRun.desolate && ssrRun.refraction && ssrRun.haunt));
  while (match.phase === "running" && (!qualificationTarget || breakthrough?.qualification !== qualificationTarget) &&
      (!eventEvidence || eventEvidence.opened.length < eventShop.eventBoxOffers.size)) {
    if (summerChallengeTrail && (match.seasons?.summer.counts[8] || match.wave >= 54)) break;
    if (stopAfterForge && forgeEvidence?.crossings.length) break;
    if (bristleTrial && (bristleTrial.hammer || match.wave >= 33)) break;
    if (mastery && match.wave >= 44) break;
    if (mastery?.refusedThird) break;
    if (ssrTarget && !settlementScenario && (ssrComplete() || match.wave >= (doomExchange ? 55 : oracleDraw || process.env.M2_SSR_RESERVE ? 38 : 30))) break;
    if (qualificationTarget && assignedQualification && assignedQualification !== qualificationTarget) break;
    if (match.queue.nowUs >= decision) {
      decision = match.queue.nowUs + 4 * second;
      if (process.env.M2_WORKER_BENEFIT === "1" && match.queue.nowUs >= (match.workerBenefitReadyUs ?? 0)) {
        command({ type: "claim-worker-benefit" });
      }
      for (const tower of match.structures) {
        if (!tower.hero || tower.pending) continue;
        for (const skill of learnableSkills(tower.templateId)) {
          const required = learningLevel(tower.hero, tower.templateId, skill.skillId);
          if (tower.hero.points > 0 && required !== undefined && tower.hero.level >= required)
            command({ type: "learn-skill", towerId: tower.id, skillId: skill.skillId });
        }
      }

      for (const [slot, status] of (match.waveRewardSlots ?? []).entries()) {
        // The base policy opens tier-one and tier-two boxes and uses SSR-free draws.
        if (status !== 2) continue;
        const reward = command({ type: "claim-wave", slot });
        if (settlementScenario === "charm" && waveRewards[slot].itemId === "i278" && reward?.ok) {
          charmClaim = { instanceId: reward.createdId, wave: match.wave, input: inputs.at(-1) };
        }
      }
      if (charmClaim && !carriedItem("i278")) {
        const loot = match.inventory.find(item => item.id === charmClaim.instanceId && item.slot === null);
        if (loot) command({ type: "pick-up-item", itemId: loot.id });
      }
      const tierTwoKey = carriedItem("i412");
      if (tierTwoKey && carriedItem("i402")) command({ type: "use-item", itemId: tierTwoKey.id });
      const drawSsr = ssrTarget && !doomExchange && !seekChest && !ssrRun && !match.cards.some(card => card.card === ssrTarget);
      const seekingMasteryMaterial = mastery && !mastery.refusedThird &&
        !match.cards.some(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === 13);
      for (const item of match.inventory) {
        if (item.slot !== null && item.towerId === undefined &&
            (["i001", "i002", "i006"].includes(item.itemId) || (drawSsr || seekingMasteryMaterial) && ["i003", "i005"].includes(item.itemId)))
          command({ type: "use-item", itemId: item.id });
      }
      const activeQualification = match.structures.find(tower => tower.hero)?.qualification;
      const providers = qualificationChains.get(activeQualification)?.levels.map(level => level.id) ?? [];
      for (const tower of match.structures.filter(tower => providers.includes(tower.templateId))) upgrade(tower);
      const savingChallengeGold = bankForChallenge && match.wave >= challengeBankWave && !carriedItem("i265");
      const savingBossGold = match.wave >= bossReserveWave && !equipped("i217");
      const spendingFloor = savingForScepter() ? 11300 :
        match.wave >= 29 && !equipped("i137") && !equipped("i138") ? 8250 : 3500;
      for (const tower of match.structures.filter(tower => !providers.includes(tower.templateId))) {
        const cutoff = drawSsr && process.env.M2_SSR_RESERVE && match.wave >= 10 ? 6500 :
          (tower.templateId.startsWith("n00") || tower.templateId.startsWith("n02")) && match.wave >= 26
          ? spendingFloor : 0;
        if (!savingChallengeGold && !savingBossGold && match.gold >= cutoff) upgrade(tower);
      }

      const activeHero = match.structures.find(tower => tower.hero);
      if (bossSupport && activeHero && qualified(match, activeHero.id) && match.wave >= 38 && !equipped("i217") &&
          match.gold >= ordinaryGoods.get("i217").gold + (savingForScepter() ? 11_300 : 0)) {
        openBossItemSlot(activeHero, true);
        acquireAndEquip("i217", activeHero, 0);
      }
      if (supportedSeasonChallenges && activeHero?.hero.ranks.A151 && equipped("i310") &&
          match.queue.nowUs >= Math.max(activeHero.heroCastUntilUs ?? 0, activeHero.heroSpellReady?.A151 ?? 0)) {
        const target = heroSpellTargets(match, activeHero.id, "A151").find(enemy => enemy.challengeId !== undefined);
        if (target) command({ type: "cast-hero", towerId: activeHero.id, skillId: "A151", targetId: target.id });
      }
      if (mastery) {
        let material = match.cards.find(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === 13);
        if (!material && !match.approach) {
          const grounded = match.cards.find(card => card.slot === null && summonCards.get(card.card)?.itemFields.Level === 13 &&
            Math.hypot(card.point.x - match.worker.x, card.point.y - match.worker.y) <= 400);
          if (grounded && command({ type: "pick-up-card", cardId: grounded.id })?.ok) material = grounded;
        }
        if (material && !mastery.claims.length) {
          const witness = masteryExchange(masteryOffers[0]);
          if (witness.result?.ok) {
            mastery.claims.push(witness);
            mastery.repeats.push(masteryExchange(masteryOffers[0]));
          }
        } else if (material && mastery.claims.length === 1) {
          if (match.wave < 41) mastery.before41 ??= masteryExchange(masteryOffers[1]);
          else {
            mastery.repeats.push(masteryExchange(masteryOffers[0]));
            const witness = masteryExchange(masteryOffers[1]);
            if (witness.result?.ok) mastery.claims.push(witness);
          }
        } else if (material && mastery.claims.length === 2 && !mastery.refusedThird) {
          mastery.refusedThird = masteryExchange(masteryOffers[2]);
        }
        for (const claim of mastery.claims) {
          const card = match.cards.find(entry => entry.id === claim.received.id);
          if (card && card.slot !== null && match.gold >= 5100 && match.population + card.hp <= match.populationLimit) {
            const placement = build({ type: "build-card", cardId: card.id });
            if (placement?.ok) claim.build = { id: placement.createdId, wave: match.wave, atUs: match.queue.nowUs };
          }
        }
      }
      if (seasonEvidence) {
        if (match.wave >= 8 && match.gold >= 5500 && !carriedItem("i256")) {
          acquireAndEquip("i256", undefined, 2600, true);
        }
        const transmute = carriedItem("i256");
        if (transmute && match.queue.nowUs >= (match.transmuteReadyUs ?? 0)) {
          const target = transmuteTargets(match)[0];
          if (target) command({ type: "use-item", itemId: transmute.id, targetId: target.id });
        }
        if (match.wave === 46 && match.overdraftOpen && !match.overdraftPoints) command({ type: "overdraft" });
        const material = match.cards.filter(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === 13)
          .sort((a, b) => a.slot - b.slot)[0];
        const claims = match.mallHeroClaims ?? [];
        const offer = [...heroExchangeOffers].find(([id, quote]) => !quote.cost && !claims.includes(id))?.[0];
        if (material && material.card !== secondHeroCard && offer && claims.length < mallHeroLimit(match.wave))
          command({ type: "exchange-hero", offer });
      }
      if (doomExchange && activeHero?.hero.ranks.A166) {
        if (!doomChallenge && match.challengeShopOpen && containmentPoints(match) < 35) {
          const reservation = command({ type: "reserve-challenge", unitId: "m501" });
          if (reservation?.ok) doomChallenge = inputs.at(-1);
        }
        const readyUs = activeHero.heroSpellReady?.A166 ?? 0;
        const mana = [170, 190, 210, 230, 250, 270][activeHero.hero.ranks.A166 - 1];
        if (Math.max(readyUs, activeHero.heroCastUntilUs ?? 0) <= match.queue.nowUs && activeHero.mana >= mana) {
          const target = heroSpellTargets(match, activeHero.id, "A166")[0];
          if (target) command({ type: "cast-hero", towerId: activeHero.id, skillId: "A166", targetId: target.id });
        }
      }
      if (bossFocus && match.wave === 55) {
        const boss = match.enemies.find(enemy => enemy.unitId === "mBOS");
        if (boss) {
          for (const tower of match.structures) {
            if (tower.pending || tower.focusTarget === boss.id) continue;
            const range = Math.hypot(tower.x - boss.x, tower.y - boss.y);
            if (weapons[tower.templateId]?.some(weapon => range >= weapon.min && range <= weapon.max)) {
              command({ type: "focus-target", towerId: tower.id, targetId: boss.id });
            }
          }
        }
      }
      if (bossMobility && match.wave === 55 && activeHero?.hero) {
        const boss = match.enemies.find(enemy => enemy.unitId === "mBOS");
        if (boss) {
          const lifeBreak = activeHero.hero.ranks.A117 > 0;
          const boots = match.inventory.find(item => item.itemId === "i230" && item.towerId === activeHero.id && item.slot !== null);
          const distance = point => Math.hypot(point.x - boss.x, point.y - boss.y);
          if (finalBossGear) {
            const ready = id => (activeHero.heroSpellReady?.[id] ?? 0) <= match.queue.nowUs &&
              (activeHero.heroCastUntilUs ?? 0) <= match.queue.nowUs;
            const staff = match.inventory.some(item => item.itemId === "i310" && item.towerId === activeHero.id && item.slot !== null);
            if (staff && activeHero.hero.ranks.A151 && ready("A151") &&
                heroSpellTargets(match, activeHero.id, "A151").some(target => target.id === boss.id)) {
              command({ type: "cast-hero", towerId: activeHero.id, skillId: "A151", targetId: boss.id });
            } else if (activeHero.hero.ranks.A197 && ready("A197") && distance(activeHero) <= 1400) {
              command({ type: "cast-hero", towerId: activeHero.id, skillId: "A197", point: { x: boss.x, y: boss.y } });
            }
            const bloodthorn = match.inventory.find(item => item.itemId === "i226" && item.towerId === activeHero.id && item.slot !== null);
            if (bloodthorn && (activeHero.soulBurnReadyUs ?? 0) <= match.queue.nowUs &&
                controlEquipmentTargets(match, activeHero.id, "i226").some(target => target.id === boss.id)) {
              command({ type: "cast-equipment", towerId: activeHero.id, itemId: bloodthorn.id, targetId: boss.id });
            }
          }
          if (lifeBreak && (activeHero.heroSpellReady?.A117 ?? 0) <= match.queue.nowUs &&
              heroSpellTargets(match, activeHero.id, "A117").some(target => target.id === boss.id)) {
            command({ type: "cast-hero", towerId: activeHero.id, skillId: "A117", targetId: boss.id });
          } else if (boots && distance(activeHero) > (lifeBreak ? 600 : 800) &&
              (activeHero.teleportReadyUs?.i230 ?? 0) <= match.queue.nowUs) {
            const point = preferredSites.filter(candidate =>
              map.buildAreas.some(area => contains(area, candidate)) &&
              !map.obstacles.some(area => contains(area, candidate)) &&
              !match.structures.some(tower => Math.hypot(tower.x - candidate.x, tower.y - candidate.y) < tower.radius + activeHero.radius))
              .sort((a, b) => distance(a) - distance(b))[0];
            if (point && distance(point) + 100 < distance(activeHero)) {
              command({ type: "cast-equipment", itemId: boots.id, towerId: activeHero.id, point });
            }
          }
        }
      }
      if (process.env.M2_PICK_RUNES === "1") {
        const rune = match.inventory.find(item => item.slot === null && /^i7(?:18|19|20|21|22|23)$/.test(item.itemId));
        if (rune && !match.approach) command({ type: "pick-up-item", itemId: rune.id });
      }
      if (process.env.M2_BOSS_SWAP === "1" && match.wave === 55 && activeHero?.scepterSwap) {
        const boss = match.enemies.find(enemy => enemy.unitId === "mBOS");
        if (boss) {
          const distance = tower => Math.hypot(tower.x - boss.x, tower.y - boss.y);
          if (distance(activeHero) > 850) {
            const relay = match.structures.filter(tower => tower !== activeHero && !tower.pending)
              .sort((a, b) => distance(a) - distance(b) || a.id - b.id)[0];
            if (relay && distance(relay) < distance(activeHero) - 180) {
              command({ type: "cast-scepter-swap", towerId: activeHero.id, targetId: relay.id });
            }
          }
        }
      }
      if (process.env.M2_SWARM_SWAP === "1" && match.wave >= 45 && match.wave < 55 &&
          activeHero?.scepterSwap && activeHero.scepterSwap.readyUs <= match.queue.nowUs && containmentPoints(match) >= 65) {
        const inReach = tower => match.enemies.filter(enemy =>
          (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 850 ** 2).length;
        const relay = match.structures.filter(tower => tower !== activeHero && !tower.pending)
          .map(tower => ({ id: tower.id, nearby: inReach(tower) }))
          .sort((a, b) => b.nearby - a.nearby || a.id - b.id)[0];
        if (relay && relay.nearby >= inReach(activeHero) + 5) {
          command({ type: "cast-scepter-swap", towerId: activeHero.id, targetId: relay.id });
        }
      }
      const chain = activeHero && qualificationChains.get(activeHero.qualification);
      const readySsr = ssrTarget && match.cards.find(card => card.card === ssrTarget && card.slot !== null);
      if (readySsr && !ssrRun) {
        if (match.population + readySsr.hp <= match.populationLimit) {
          build({ type: "build-card", cardId: readySsr.id });
        } else if (match.wave >= 11) {
          const starter = match.structures.find(tower => !tower.hero && !tower.pending && tower.templateId.startsWith("n02"));
          if (starter) recycleTower(starter);
        }
      }
      if (ssrAppearance && ssrFormComplete(ssrRoot) && !ssrRun.forms[ssrAppearance.target]) {
        command({ type: "choose-skin", towerId: ssrRun.id, choice: ssrAppearance.selection });
      }
      const cardPriority = [...new Set([
        ...(qualificationTarget && chain ? [chain.card] : []),
        ...(bossSupport && !match.structures.some(tower => /^n24[3-5]$/.test(tower.templateId)) ? ["i712"] : []),
        "i601", "i606", "i609", "i603", "i608", "i604",
      ])];
      for (const card of match.cards.filter(card => card.slot !== null)) {
        if (mastery && (summonCards.get(card.card)?.itemFields.Level === 13 || mastery.claims.some(claim => claim.received.id === card.id))) continue;
        if (card.card !== ssrTarget && (card.card !== secondHeroCard || match.wave < 34) && !card.card.startsWith("c") && cardTemplates.get(card.card)?.rarity !== "R") {
          command({ type: "drop-card", cardId: card.id });
        }
      }
      const secondHero = secondHeroCard && match.structures.find(tower => tower !== activeHero &&
        cardTemplates.get(secondHeroCard).root === tower.templateId);
      if ((seasonEvidence || bossSupport && secondHeroCard) && match.wave >= 34 && !secondHero && !match.approach &&
          !match.cards.some(card => card.card === "i571" && card.slot !== null)) {
        const groundedWisp = match.cards.find(card => card.card === "i571" && card.slot === null &&
          Math.hypot(card.point.x - match.worker.x, card.point.y - match.worker.y) <= 400);
        if (groundedWisp) command({ type: "pick-up-card", cardId: groundedWisp.id });
      }
      const spareHeroCard = secondHeroCard && !secondHero && match.wave >= 38 &&
        match.cards.find(card => card.card === secondHeroCard && card.slot !== null);
      if (spareHeroCard) {
        if (match.population + spareHeroCard.hp <= match.populationLimit) {
          const action = { type: "build-card", cardId: spareHeroCard.id };
          if (bossSupport && activeHero) {
            const point = preferredSites.find(site => Math.hypot(site.x - activeHero.x, site.y - activeHero.y) <= 750 &&
              inspectBuildPlacement(match, { ...action, point: site }).ok);
            if (point) command({ ...action, point });
          } else build(action);
        } else {
          const ordinary = [...match.structures].reverse().find(tower => !tower.pending &&
            /^n02[1-5]$/.test(tower.templateId) && Math.hypot(tower.x - match.worker.x, tower.y - match.worker.y) <= 1000);
          if (ordinary) recycleTower(ordinary);
        }
      }
      if (secondHero && !secondHero.pending && secondHero.hero?.level < 15 && match.gold >= 6000) {
        const purchase = command({ type: "buy-book", bookId: "i128" });
        if (purchase?.ok) command({ type: "use-book", itemId: purchase.createdId, towerId: secondHero.id });
      }
      if ((seasonEvidence || bossSupport) && secondHero?.hero && !secondHero.pending) {
        const ready = id => match.queue.nowUs >= Math.max(secondHero.heroCastUntilUs ?? 0, secondHero.heroSpellReady?.[id] ?? 0);
        if (secondHero.hero.ranks.A111 && !secondHero.wispLink && ready("A111")) {
          const target = heroAllySpellTargets(match, secondHero, "A111").find(ally => ally.id === activeHero?.id);
          if (target) command({ type: "cast-hero", towerId: secondHero.id, skillId: "A111", targetId: target.id });
        }
        if (secondHero.wispLink && secondHero.hero.ranks.A112 && !secondHero.wispOverload &&
            match.queue.nowUs >= (secondHero.wispOverloadReadyUs ?? 0)) {
          command({ type: "cast-hero", towerId: secondHero.id, skillId: "A112" });
        }
        const amount = secondHero.wispLink?.boost?.amount ?? 0;
        if (seasonEvidence && amount > (seasonEvidence.wisp.at(-1)?.amount ?? -1)) {
          seasonEvidence.wisp.push({ atUs: match.queue.nowUs, wave: match.wave, caster: secondHero.id,
            level: secondHero.hero.level, ...secondHero.wispLink?.boost, amount });
        }
        if (seasonEvidence && secondHero.wispLink && secondHero.hero.ranks.A113 && ready("A113")) {
          const ally = match.structures.find(tower => tower.id === secondHero.wispLink.targetId);
          if (ally) {
            const point = preferredSites.find(site => Math.hypot(site.x - ally.x, site.y - ally.y) >= 160 &&
              Math.hypot(site.x - ally.x, site.y - ally.y) <= 450 &&
              !map.obstacles.some(obstacle => contains(obstacle, site)) &&
              !match.structures.some(tower => Math.hypot(tower.x - site.x, tower.y - site.y) < tower.radius + ally.radius));
            if (point) command({ type: "cast-hero", towerId: secondHero.id, skillId: "A113", point });
          }
        }
      }
      const anchorTower = match.structures.some(tower => cardPriority.some(id => cardTemplates.get(id).levels.some(level => level.id === tower.templateId)));
      const highAttackCard = match.cards.filter(card => card.slot !== null && cardPriority.includes(card.card))
        .sort((a, b) => cardPriority.indexOf(a.card) - cardPriority.indexOf(b.card))[0];
      if ((!anchorTower || hasQualificationTower(activeHero)) && highAttackCard &&
          match.populationLimit - match.population >= highAttackCard.hp + (hasQualificationTower(activeHero) ? 0 : 5)) {
        build({ type: "build-card", cardId: highAttackCard.id });
      }
      if (chain && match.qualificationShopOpen && !qualified(match, activeHero.id)) {
        const qualificationBuilt = match.structures.some(tower => chain.levels.some(level => level.id === tower.templateId));
        const targeted = match.cards.find(card => card.card === chain.targetedCard);
        if (!qualificationBuilt && targeted?.slot != null) build({ type: "build-card", cardId: targeted.id });
        if (!qualificationBuilt && !targeted) {
          const materials = match.cards.filter(card => cardTemplates.get(card.card)?.rarity === "R" && card.slot !== null);
          if (materials.length >= 5) command({ type: "exchange", qualification: chain.id });
        }
      }
      const space = match.populationLimit - match.population;
      const hasActiveProvider = !!activeHero && qualified(match, activeHero.id);
      const reservedPopulation = hasActiveProvider ? 0 : 5;
      const currentTowers = match.structures.filter(tower => !tower.hero);
      const lateCard = match.wave >= 25 && !!highAttackCard && hasQualificationTower(activeHero);
      if (lateCard && space < highAttackCard.hp + (hasActiveProvider ? 0 : 5)) {
        const basicTower = [...currentTowers].reverse().find(tower =>
          /^n02[1-5]$/.test(tower.templateId) && !tower.pending && !providers.includes(tower.templateId));
        if (basicTower) recycleTower(basicTower);
      }
      const hasUnfinishedTowers = currentTowers.some(tower => tower.pending || towerLevels.get(tower.templateId)?.upgrade);
      if (!savingChallengeGold && !savingBossGold && !(readySsr && !ssrRun) && !lateCard && match.wave >= 5 && space >= 5 + reservedPopulation &&
          (!hasUnfinishedTowers && match.gold >= (match.wave >= 26 ? spendingFloor : 1700) ||
            currentTowers.length < 3 && match.gold >= 600)) {
        build({ type: "build-worker-tower", tower: match.wave < 24 || currentTowers.length % 2 === 0 ? "n021" : "n001" });
      }
      if (!savingChallengeGold && activeHero && match.wave >= 11 && !savingForScepter()) {
        acquireAndEquip("i198", activeHero, 1800);
        const archer = match.structures.find(tower => /^n00[1-5]$/.test(tower.templateId));
        if (activeHero.templateId === "H021") acquireAndEquip("i115", activeHero, 1200);
        if (match.wave >= 16) acquireAndEquip("i173", archer, 1700);
        if (match.wave >= 20) acquireAndEquip("i186", archer, 1800);
        if (match.wave >= 20 && match.wave < 32) acquireAndEquip("i135", activeHero, 1300);
        if (match.wave >= 26 && activeHero.templateId !== "H021") acquireAndEquip("i204", activeHero, 1300);
        if (match.wave >= 29) acquireAndEquip("i228", archer, 1200);
        if (match.wave >= 36) acquireAndEquip("i206", archer, 1700);
      }
      if (settlementScenario === "charm" && process.env.M2_A11_ITEM && match.wave >= Number(process.env.M2_A11_ITEM_WAVE ?? 49)) {
        const itemId = process.env.M2_A11_ITEM;
        const archer = match.structures.find(tower => tower.templateId === "n005");
        const carrier = (itemFields.get(itemId)?.Level ?? 0) <= 3
          ? archer : hasActiveProvider ? activeHero : undefined;
        if (carrier && !equipped(itemId)) {
          const loadout = match.inventory.filter(item => item.towerId === carrier.id && item.slot !== null);
          if (loadout.length === 6) {
            const redundant = loadout.some(item => item.itemId === "i209") && loadout.find(item => item.itemId === "i115");
            const aura = carrier !== archer && loadout.find(item => item.itemId === "i198");
            if (redundant) command({ type: "drop-item", itemId: redundant.id });
            else if (archer && aura) command({ type: "transfer-item", itemId: aura.id, towerId: archer.id });
          }
          acquireAndEquip(itemId, carrier, 0);
        }
      }
      if (!savingChallengeGold && activeHero && match.wave >= 26 && !equipped("i138") && !savingForScepter()) acquireAndEquip("i137", activeHero, 100);
      if (hasActiveProvider) {
        for (const id of ["i132", "i134", "i263"]) {
          const sword = match.inventory.find(item => item.itemId === id && item.towerId === 0);
          if (sword) command({ type: "transfer-item", itemId: sword.id, towerId: activeHero.id });
        }
        if (!savingChallengeGold && activeHero.templateId === "H021") acquireAndEquip("i209", activeHero, 1700);
        if (!savingChallengeGold) acquireAndEquip("i138", activeHero, 400);
        if (!savingChallengeGold && (activeHero.templateId === "H038" || activeHero.templateId === "H029")) {
          const saving = savingForScepter();
          if (saving && match.gold >= 11300 && !match.mysteryStock?.i311 && !match.mysteryRefreshed) {
            command({ type: "buy-special", shop: "mystery", itemId: "i399" });
          }
          if (bossSupport && !equipped("i310") && match.gold >= 11_300 && (carriedItem("i311") || match.mysteryStock?.i311))
            openBossItemSlot(activeHero, true);
          acquireAndEquip("i310", activeHero, saving ? 0 : 1700);
        }
        if (!savingChallengeGold && !savingForScepter() && (equipped("i137") || equipped("i138"))) {
          acquireAndEquip("i217", activeHero, savingBossGold ? 0 : 1400);
          if (match.wave >= 36) acquireAndEquip("i188", activeHero, 1800);
          if (match.wave >= 39) acquireAndEquip("i177", activeHero, 1900);
        }
        if (bossMobility && match.wave >= 51 && ["H034", "H051"].includes(activeHero.templateId) &&
            !equipped("i230") && match.gold >= ordinaryGoods.get("i230").gold + 1200) {
          const loadout = match.inventory.filter(item => item.towerId === activeHero.id && item.slot !== null);
          const aura = loadout.find(item => item.itemId === "i198");
          if (loadout.length === 6 && aura) {
            const support = match.structures.find(tower => tower.id !== activeHero.id && !tower.pending &&
              Math.hypot(tower.x - activeHero.x, tower.y - activeHero.y) <= 1000 &&
              match.inventory.filter(item => item.towerId === tower.id && item.slot !== null).length < 6);
            if (support) command({ type: "transfer-item", itemId: aura.id, towerId: support.id });
          }
          acquireAndEquip("i230", activeHero, 1200);
        }
        if (bossSupport && match.wave >= 46 && ["H038", "H051"].includes(activeHero.templateId) && !equipped("i327") &&
            match.gold >= ordinaryGoods.get("i327").gold + 1500 && (opening !== "i576" || equipped("i310"))) {
          openBossItemSlot(activeHero, true);
          acquireAndEquip("i327", activeHero, 1500);
        }
        if (finalBossGear && match.wave >= 50 && !equipped("i226") && match.gold >= 10_200 &&
            (opening !== "i576" || equipped("i310"))) {
          const loadout = match.inventory.filter(item => item.towerId === activeHero.id && item.slot !== null);
          if (loadout.length === 6) {
            const offering = loadout.find(item => item.itemId === "i198");
            const recipient = offering && match.structures.find(tower => tower !== activeHero && !tower.pending &&
              Math.hypot(tower.x - activeHero.x, tower.y - activeHero.y) <= 1000 &&
              match.inventory.filter(item => item.towerId === tower.id && item.slot !== null).length < 6);
            if (recipient) command({ type: "transfer-item", itemId: offering.id, towerId: recipient.id });
            else {
              const crystal = loadout.find(item => item.itemId === "i135");
              if (crystal) command({ type: "drop-item", itemId: crystal.id });
            }
          }
          acquireAndEquip("i226", activeHero, 1200);
        }
      }
      if (activeHero && (hasActiveProvider || activeHero.hero.level < 18)) {
        for (const book of [...match.books]) command({ type: "use-book", itemId: book.id, towerId: activeHero.id });
      }
      if (hasActiveProvider && activeHero.hero.level < 21 && match.gold >= 3800 && match.wave >= 25) {
        const purchase = command({ type: "buy-book", bookId: "i128" });
        if (purchase?.ok) command({ type: "use-book", itemId: purchase.createdId, towerId: activeHero.id });
      }
      const keep = new Set(["i001", "i002", "i006", "i278", ...(match.wave < 5 ? ["i412"] : []),
        ...(seasonEvidence ? ["i256", "i257", "i175"] : []),
        ...(eventShop ? eventShop.eventBoxes.keys() : []),
        ...(seekChallenge ? ["i265", "i266", "i308", "i309"] : []),
        ...(challengeProduct ? ["i102", "i163", "i164", "i171", "i172", "i190", "i191", "i192", "i200", "i201"] : []),
        ...(seekChest ? ["i404", "i414"] : [])]);
      const nonCards = match.inventory.filter(item => item.slot !== null && item.towerId === undefined && !keep.has(item.itemId));
      if (nonCards.some(item => ["i131", "i133", "i262"].includes(item.itemId))) {
        const broken = nonCards.find(item => ["i131", "i133", "i262"].includes(item.itemId));
        command({ type: "transfer-item", itemId: broken.id, towerId: 0 });
      }
      if (match.wave >= 5 && nonCards.length > 0) {
        const move = command({ type: "transfer-item", itemId: nonCards[0].id, towerId: 0 });
        if (move?.reason === "full" || move?.reason === "equipment") command({ type: "drop-item", itemId: nonCards[0].id });
      }
      const cardCount = match.cards.filter(card => card.slot !== null).length;
      const occupied = cardCount + match.inventory.filter(item => item.slot !== null && item.towerId === undefined).length + match.books.length;
      if (secondHeroCard && !secondHero && !spareHeroCard && match.wave >= 38 && match.gold >= 17_000 && occupied < 5) {
        command({ type: "draw", draw: "i005" });
      } else if (seekingMasteryMaterial && match.wave >= 37 && match.gold >= 18_000 && occupied < 6) {
        command({ type: "draw", draw: "i005" });
      } else if ((drawSsr || seekingMasteryMaterial) && match.wave >= 11 && match.gold >= 6500 && occupied < 6) {
        command({ type: "draw", draw: "i003" });
      } else if (!savingChallengeGold && !savingBossGold && !(drawSsr && process.env.M2_SSR_RESERVE && match.wave >= 10) && match.wave >= 9 &&
          match.gold >= (hasActiveProvider ? (match.wave >= 26 ? spendingFloor : 3800) : 3100) && occupied < 6 && cardCount < 5) {
        command({ type: "draw", draw: "i002" });
      }
      if (eventEvidence) {
        const attempts = eventEvidence.challenges;
        const unitId = ["m501", "m502", "m503"][attempts.length];
        if (unitId && match.challengeShopOpen && (!attempts.length || attempts.at(-1).cleared) &&
            (match.challengeReadyUs ?? 0) <= match.queue.nowUs && containmentPoints(match) < 40 &&
            (match.activityScore ?? 0) < (eventShop.eventBoxOffers.size - eventEvidence.purchases.length) * eventShop.eventBoxCost) {
          const before = eventBalances(match);
          const { nowUs: atUs } = match.queue;
          const result = command({ type: "reserve-challenge", unitId });
          if (result?.ok) attempts.push({ id: result.createdId, unitId, atUs, wave: match.wave, before });
        }
        const [offer, box] = [...eventShop.eventBoxOffers][eventEvidence.opened.length];
        if (!eventEvidence.purchases.some(entry => entry.offer === offer) &&
            (match.activityScore ?? 0) >= eventShop.eventBoxCost) {
          const before = eventBalances(match);
          const result = command({ type: "buy-event-box", offer });
          if (result?.ok) eventEvidence.purchases.push({ offer, itemId: box.usableItem, instanceId: result.createdId,
            wave: match.wave, atUs: match.queue.nowUs, before, after: eventBalances(match) });
        }
        const bought = eventEvidence.purchases.find(entry => entry.offer === offer);
        const item = bought && match.inventory.find(entry => entry.id === bought.instanceId);
        if (item?.slot === null) command({ type: "pick-up-item", itemId: item.id });
        if (item && item.slot !== null) {
          const before = eventBalances(match);
          const chargesBefore = item.charges;
          const result = command({ type: "use-item", itemId: item.id });
          if (result?.ok) eventEvidence.opened.push({ offer, itemId: box.usableItem, instanceId: item.id,
            wave: match.wave, atUs: match.queue.nowUs, before, after: eventBalances(match), reward: result.eventReward,
            chargesBefore, chargesAfter: match.inventory.find(entry => entry.id === item.id)?.charges ?? 0 });
        }
      } else if (seekChallenge && match.challengeShopOpen && (match.challengeReadyUs ?? 0) <= match.queue.nowUs && containmentPoints(match) < 40) {
        const unitId = challengeUnits[challengeEvidence.length];
        if (unitId && (!challengeEvidence.length || challengeEvidence.at(-1).cleared)) {
          const atUs = match.queue.nowUs;
          const result = command({ type: "reserve-challenge", unitId });
          if (result?.ok) challengeEvidence.push({ id: result.createdId, unitId, atUs, wave: match.wave, enemies: [] });
        }
      } else if (summerChallengeTrail && match.challengeShopOpen && (match.challengeReadyUs ?? 0) <= match.queue.nowUs &&
          containmentPoints(match) < 35 && (!summerChallengeTrail.length || summerChallengeTrail.at(-1).cleared)) {
        const sequence = supportedSeasonChallenges ? ["m551", "m541", "m552", "m542", "m553", "m543"] :
          ["m521", "m522", "m523", "m531", "m532", "m533"];
        const unitId = sequence[summerChallengeTrail.length];
        if (unitId) {
          const result = command({ type: "reserve-challenge", unitId });
          if (result?.ok) summerChallengeTrail.push({ id: result.createdId, unitId, atUs: inputs.at(-1).atUs, wave: match.wave });
        }
      } else if (!summerChallengeTrail && !seekChallenge && match.wave >= 13 && match.wave <= 25 && match.challengeShopOpen && (match.challengeReadyUs ?? 0) <= match.queue.nowUs &&
          containmentPoints(match) < 15) {
        const family = [2, 3, 4].find(family => (match.challengeStages?.[family] ?? 0) === 0);
        if (family !== undefined) command({ type: "reserve-challenge", unitId: "m5" + family + "1" });
      }
      const beforeChallengeClose = mainline[53].startUs - match.queue.nowUs;
      if (seekChallenge && challengeProduct?.crafted && !challengeClosure && match.challengeShopOpen &&
          beforeChallengeClose > 18 * second && beforeChallengeClose <= 30 * second) {
        const reservation = command({ type: "reserve-challenge", unitId: "m531" });
        if (reservation?.ok) challengeClosure = { reservationId: reservation.createdId, atUs: match.queue.nowUs,
          arrivals: 0, pendingBeforeClose: false };
      }
      if (seekChallenge && !challengeProduct && match.challengeStock?.i266 && match.gold >= (itemFields.get("i266").goldcost ?? 0)) {
        const beforeGold = match.gold;
        const purchase = command({ type: "buy-special", shop: "challenge", itemId: "i266" });
        if (purchase?.ok) challengeProduct = { purchase, wave: match.wave, beforeGold, afterGold: match.gold,
          remainingStock: match.challengeStock.i266, crafted: !!carriedItem("i265") };
      }
      if (bankForChallenge && match.wave >= challengeMaterialWave && !challengeProduct &&
          !carriedItem("i309") && match.mysteryStock?.i309 > 0) {
        const gold = match.gold;
        acquireAndEquip("i309", undefined, 0, true);
        const acquired = carriedItem("i309");
        if (acquired) challengeMaterials.push({ item: "i309", instance: acquired.id, wave: match.wave, goldSpent: gold - match.gold });
      }
      if (bankForChallenge && carriedItem("i266") && !carriedItem("i265")) {
        if (!carriedItem("i309") && !match.mysteryStock?.i309 && !match.mysteryRefreshed) {
          command({ type: "buy-special", shop: "mystery", itemId: "i399" });
        }
        if (carriedItem("i309") || match.mysteryStock?.i309 > 0) {
          // Build intermediate recipes independently so the full ingredient list
          // is never required to fit in all six slots at once.
          for (const card of match.cards.filter(entry => entry.slot !== null)) {
            command({ type: "drop-card", cardId: card.id });
          }
          for (const id of ["i309", "i200", "i163", "i191"]) {
            if (carriedItem("i265")) break;
            if (id === "i163" && carriedItem("i191")) continue;
            const existing = carriedItem(id);
            const before = match.gold;
            if (!existing) acquireAndEquip(id, undefined, 0, true);
            const acquired = carriedItem(id);
            if (!existing && (acquired || carriedItem("i265"))) {
              challengeMaterials.push({ item: id, instance: acquired?.id, wave: match.wave, goldSpent: before - match.gold });
            }
            if (!acquired && !carriedItem("i265")) break;
          }
        }
        const crafted = carriedItem("i265");
        if (crafted) challengeProduct.crafted = { id: crafted.id, wave: match.wave, atUs: match.queue.nowUs };
      }
      if (seekChest && match.wave >= 30) {
        const chestLoot = () => match.inventory.find(item => item.slot === null && !attemptedLoot.has(item.id) &&
          (item.itemId === "i404" && !carriedItem("i404") || item.itemId === "i414" && !carriedItem("i414")));
        if (retryChestPickup) {
          const loot = chestLoot();
          const slotsUsed = match.cards.filter(card => card.slot !== null).length +
            match.books.filter(book => book.slot !== null).length +
            match.inventory.filter(item => item.slot !== null && item.towerId === undefined).length;
          if (loot && slotsUsed < 6) {
            const result = command({ type: "pick-up-item", itemId: loot.id });
            chestEvidence.pickups.push({ id: loot.id, itemId: loot.itemId, wave: match.wave, slotsUsed, result });
            if (result?.reason !== "full") attemptedLoot.add(loot.id);
          }
        }
        if (wishForChests && match.talent?.id === "W014" && match.queue.nowUs >= match.talent.readyUs &&
            (!carriedItem("i404") || !carriedItem("i414"))) {
          command({ type: "cast-talent" });
        }
        const box = match.inventory.filter(item => item.itemId === "i404" && item.slot !== null && item.towerId === undefined)
          .sort((left, right) => left.slot - right.slot)[0];
        const key = carriedItem("i414");
        if (box && key) {
          const forging = match.seasons?.spring.counts[4] ?? 0;
          const opened = match.openedChests ?? 0;
          const lumber = match.lumber;
          const result = command({ type: "use-item", itemId: key.id });
          if (result?.ok && (match.openedChests ?? 0) > opened) {
            chestEvidence.opens.push({ boxId: box.id, keyId: key.id, result, wave: match.wave,
              output: match.inventory.find(item => item.id === result.createdId)?.itemId ??
                match.cards.find(card => card.id === result.createdId)?.card ?? null,
              lumberGain: match.lumber - lumber,
              forgedBefore: forging, forgedAfter: match.seasons?.spring.counts[4] ?? 0,
              consumed: !match.inventory.some(item => item.id === box.id || item.id === key.id) });
          }
        } else if (box && (match.mysteryStock?.i414 ?? 0) > 0) {
          command({ type: "buy-special", shop: "mystery", itemId: "i414" });
        } else if (box && match.mysteryShopOpen && !match.mysteryRefreshed) {
          command({ type: "buy-special", shop: "mystery", itemId: "i399" });
        } else if (!retryChestPickup) {
          const loot = chestLoot();
          if (loot) {
            attemptedLoot.add(loot.id);
            command({ type: "pick-up-item", itemId: loot.id });
          }
        }
      }
    }
    if (match.wave !== lastWave) {
      lastWave = match.wave;
      waves.push({ wave: match.wave, atUs: match.queue.nowUs, kills: match.kills ?? 0, gold: match.gold, lumber: match.lumber,
        containment: containmentPoints(match), hero: match.structures.find(tower => tower.hero)?.hero?.level ?? 0 });
      peak.bytes = Math.max(peak.bytes, Buffer.byteLength(JSON.stringify(match)));
      if (process.env.M2_PROGRESS && match.wave % 5 === 0) console.error(JSON.stringify({ seed, ...waves.at(-1),
        equipment: match.inventory.filter(item => item.towerId > 0 && item.slot !== null).map(item => item.itemId) }));
    }
    const nextWave = mainline[match.wave];
    const charm = carriedItem("i278");
    if (settlementScenario === "charm" && charm && match.wave === 55 && !charmSettlement &&
        match.enemies.some(enemy => enemy.unitId === "mBOS")) {
      const before = { kills: match.kills ?? 0, gold: match.gold, score: match.killScore ?? 0 };
      command({ type: "use-item", itemId: charm.id });
      charmSettlement = { itemId: charm.id, before, input: inputs.at(-1), after: {
        kills: match.kills ?? 0, gold: match.gold, score: match.killScore ?? 0, phase: match.phase,
        remaining: match.enemies.length, creditedFinisher: match.finalHit?.towerId ?? null,
      } };
    } else if (settlementScenario !== "charm" && charm && match.wave >= 45 && match.wave < 55 && nextWave &&
        nextWave.startUs - match.queue.nowUs < second &&
        containmentPoints(match) + nextWave.points * nextWave.unitsPerBatch > 100) {
      command({ type: "use-item", itemId: charm.id });
    }
    advance(second / 2);
  }

  const qualifiedHeroAtEnd = breakthrough && match.structures.find(tower => tower.id === breakthrough.towerId);
  const clearedA10 = !ssrTarget && match.result?.reason === "boss-killed" && !!match.finalHit?.towerId &&
    qualifiedHeroAtEnd?.hero?.level >= 21 && qualified(match, qualifiedHeroAtEnd.id) &&
    breakthrough.atUs < (match.bossArrivalUs ?? 0) && usedSsr.length === 0 &&
    match.finalHit.atUs <= match.bossDeadlineUs;
  peak.bytes = Math.max(peak.bytes, Buffer.byteLength(JSON.stringify(match)));
  const chain = qualificationChains.get(qualificationTarget);
  const providerBuild = maxProvider && inputs.find(entry => entry.action.type === "build-card" && entry.outcome?.createdId === maxProvider.id);
  const upgrades = maxProvider ? inputs.filter(entry => entry.action.type === "upgrade-tower" &&
    entry.action.towerId === maxProvider.id && entry.outcome?.ok) : [];
  const designatedExchange = providerBuild && inputs.find(entry => entry.action.type === "exchange" &&
    entry.outcome?.createdId === providerBuild.action.cardId);
  const inputLogSha256 = sha256(JSON.stringify(inputs));
  for (const point of Object.values(peaks)) point.inputLogSha256 = inputLogSha256;
  if (eventEvidence) {
    const expectedRanges = [[30, 120], [100, 260], [240, 400]];
    eventEvidence.end = eventBalances(match);
    eventEvidence.verification = {
      startedFromZero: eventEvidence.initial.activityScore === 0,
      challengeGrants: eventEvidence.challenges.every(({ cleared }, index) =>
        cleared && cleared.earned >= expectedRanges[index][0] && cleared.earned <= expectedRanges[index][1]),
      purchases: eventEvidence.purchases.every(purchase =>
        purchase.before.activityScore - purchase.after.activityScore === eventShop.eventBoxCost),
      opening: eventEvidence.opened.every(opening => {
        const box = eventShop.eventBoxOffers.get(opening.offer);
        const { currency, amount } = opening.reward ?? {};
        const [low, high] = (currency === "fragments" ? box.currencyFallback.skinPiece : box.currencyFallback.score).amountInclusive;
        const rewardField = currency === "fragments" ? "fragments" : "eventScore";
        const otherField = currency === "fragments" ? "eventScore" : "fragments";
        return opening.chargesBefore - opening.chargesAfter === 1 && amount >= low && amount <= high &&
          opening.after[rewardField] - opening.before[rewardField] === amount &&
          opening.after[otherField] === opening.before[otherField] &&
          opening.after.activityScore === opening.before.activityScore && opening.after.openGiftNum === opening.before.openGiftNum;
      }),
    };
    eventEvidence.status = eventEvidence.opened.length === eventShop.eventBoxOffers.size &&
      Object.values(eventEvidence.verification).every(Boolean) ? "completed" : "not-completed";
  }
  return { seed, opening, ...(m3 ? { candidates, preferences, openingFallback: "first-saved-candidate" } : {}),
    strategy: scepterPlan ? "scepter" : "default", layout: entryOpening ? "entry" : "center",
    ...(Number.isFinite(scepterBankUntil) ? { scepterBankUntil } : {}), ...(bossFocus ? { bossFocus } : {}),
    ...(bossMobility ? { bossMobility } : {}),
    ...(finalBossGear ? { finalBossGear } : {}),
    ...(bossSupport ? { bossSupport, supportRoster: match.structures.filter(tower => tower.templateId === "H033" ||
      /^n24[3-5]$/.test(tower.templateId)).map(({ id, templateId, hero, wispLink }) => ({ id, templateId, level: hero?.level, wispLink })) } : {}),
    ...(seasonEvidence ? { seasonEvidence } : {}),
    ...(summerChallengeTrail ? { summerChallengeTrail, endUs: match.queue.nowUs, seasonProgress: match.seasons } : {}),
    ...(mastery ? { mastery: { ...mastery, completed: mastery.claims.length === 2 &&
      mastery.claims[0].wave < 41 && mastery.claims[1].wave >= 41 && mastery.before41?.result?.reason === "stock" &&
      mastery.before41.consumed.length === 0 && mastery.before41.materials[0].id === mastery.claims[1].consumed[0]?.id &&
      mastery.repeats.every(witness => witness.result?.reason === "stock" && witness.consumed.length === 0) &&
      mastery.claims.every(witness => witness.consumed.length === 1 && witness.consumed[0].id === witness.materials[0].id &&
        witness.received?.card === witness.offer && witness.finalSpring9 === witness.spring9 + 1 &&
        witness.beforeScore === witness.afterScore) && mastery.refusedThird?.result?.reason === "stock" &&
      mastery.refusedThird.consumed.length === 0 }, endUs: match.queue.nowUs } : {}),
    ...(settlementScenario ? { settlementEvidence: { scenario: settlementScenario, claim: charmClaim ?? null, charm: charmSettlement ?? null,
      charmRemaining: !!carriedItem("i278"), phase: match.phase, killScore: match.killScore ?? 0,
      bossAtEnd: match.enemies.some(enemy => enemy.unitId === "mBOS") } } : {}),
    ...(seekChallenge ? { challengeEvidence, challengeProduct: challengeProduct ?? null, challengeMaterials, challengeMysteryStock,
      challengeClosure: challengeClosure ?? null } : {}),
    ...(seekChest ? { chestEvidence } : {}),
    ...(forgeEvidence ? { forgeEvidence } : {}),
    ...(stopAfterForge && forgeEvidence?.crossings.length ? { stop: "forge-crossing", endUs: match.queue.nowUs } : {}),
    ...(collectPeaks ? { peaks } : {}),
    ...(eventEvidence ? { endUs: match.queue.nowUs, eventEvidence } : {}),
    ...(ssrTarget ? { [oracleDraw ? "oracleEvidence" : "ssrEvidence"]: { requested: ssrTarget, ...(doomExchange ? { exchangeRoute: doomDraw, challenge: doomChallenge } : {}), ...ssrRun, completed: !!ssrComplete() } } : {}),
    ...(bristleTrial ? { bristleTrial, endUs: match.queue.nowUs } : {}),
    ...(qualificationScenario ? { qualificationEvidence: {
      ...(qualificationRealAssignment ? { actualAssignment: true } : {}),
      requested: qualificationTarget, assigned: assignedQualification, maxProvider, providerBuild, designatedExchange, upgrades,
      directUpgradeCost: { gold: upgrades.reduce((sum, entry) => sum + entry.acquisition.gold, 0),
        wood: upgrades.reduce((sum, entry) => sum + entry.acquisition.wood, 0) },
      completed: !!chain && breakthrough?.qualification === qualificationTarget && maxProvider?.templateId === chain.requireUnit,
    } } : {}), result: match.result, wave: match.wave, kills: match.kills ?? 0, capital: { gold: match.gold, lumber: match.lumber },
    roster: match.structures.map(tower => ({ templateId: tower.templateId, x: tower.x, y: tower.y, level: tower.hero?.level,
      items: match.inventory.filter(item => item.towerId === tower.id).map(item => item.itemId) })),
    initialStateSha256, breakthrough, finalHit: match.finalHit ?? null, usedSsr, clearedA10, bossArrivalUs: match.wave === 55 ? match.bossArrivalUs : null, bossDeadlineUs: match.bossDeadlineUs, bossHealth, peak, waves, survivors: Object.fromEntries([...new Set(match.enemies.map(enemy => enemy.unitId))]
      .map(id => [id, match.enemies.filter(enemy => enemy.unitId === id).length])), inputs, inputLogSha256 };
}

async function replay(record, checkpoint) {
  const match = checkpoint ? structuredClone(checkpoint.snapshot) : newMatch(`normal-${record.seed}`, record.seed, startSeasons().seasons);
  if (!checkpoint && record.seasonEvidence) match.startingScore = startSeasons().score;
  assert.equal(sha256(JSON.stringify(match)), checkpoint?.snapshotSha256 ?? record.initialStateSha256);
  assert.equal(sha256(JSON.stringify(record.inputs)), record.inputLogSha256);
  const peaks = {};
  let sampleAt = 2 * second;
  let processedInputs = 0;
  let a18Proof;
  let a18Before;
  let a18Snapshot;
  let a17Proof;
  let a17Snapshot;
  if (a17Directory) {
    const { challengeClosure, challengeProduct, challengeEvidence } = record;
    assert.deepEqual(challengeEvidence.map(entry => [entry.unitId, entry.enemies.length, !!entry.cleared]),
      [["m521", 12, true], ["m522", 12, true], ["m523", 12, true]]);
    assert.equal(challengeProduct.beforeGold - challengeProduct.afterGold, 18_600);
    assert.equal(challengeProduct.remainingStock, 0);
    assert.ok(challengeProduct.crafted && challengeClosure.pendingBeforeClose && challengeClosure.arrivals > 0);
    assert.deepEqual(challengeClosure.closed, { atUs: mainline[53].startUs, wave: 54, active: 0, pending: false, registered: false });
    a17Proof = { atUs: challengeClosure.atUs + 500_000, closesUs: challengeClosure.closed.atUs,
      challengeId: challengeClosure.reservationId, productId: challengeProduct.crafted.id };
  }
  const masterySnapshots = new Map();
  const masteryWitnesses = masteryDirectory && new Map([
    ["before-41", record.mastery?.before41], ["second-claim", record.mastery?.claims[1]],
  ]);
  if (masteryDirectory) assert.equal(record.mastery?.completed, true);
  if (a18Directory) {
    const itemId = process.env.M3_A18_SNAPSHOT_ITEM;
    const method = process.env.M3_A18_SNAPSHOT_METHOD;
    assert.ok(["i132", "i134", "i263"].includes(itemId), "Select an A18 sword for snapshot export");
    assert.ok(!method || method === "forge" || method === "direct", "Select a valid A18 acquisition method");
    const crossing = record.forgeEvidence?.crossings.find(row => row.to.itemId === itemId && row.from.souls === 1399);
    const opened = record.chestEvidence?.opens.find(row => row.output === itemId && row.consumed);
    if (method === "forge" || !method && crossing) {
      assert.ok(crossing, "The input trace did not forge this sword from 1399 souls");
      assert.equal(crossing.to.progress, crossing.from.progress + 1);
      a18Proof = { method: "forge", itemId, instanceId: crossing.to.instanceId, milestoneUs: crossing.atUs,
        before: crossing.from.progress, after: crossing.to.progress, consumedIds: [crossing.from.instanceId],
        beforeUs: crossing.from.atUs, sourceItems: [record.forgeEvidence.brokenBlade] };
    } else {
      assert.ok(opened, "The input trace did not acquire this sword through a qualifying A18 route");
      const command = record.inputs.find(entry => entry.action.type === "use-item" &&
        entry.action.itemId === opened.keyId && entry.outcome?.createdId === opened.result.createdId);
      assert.ok(command);
      assert.equal(opened.forgedBefore, opened.forgedAfter);
      a18Proof = { method: "direct", itemId, instanceId: opened.result.createdId, milestoneUs: command.atUs + 1,
        before: opened.forgedBefore, after: opened.forgedAfter, consumedIds: [opened.boxId, opened.keyId],
        beforeUs: command.atUs, sourceItems: ["i404", "i414"] };
    }
  }
  function sample() {
    recordPeakSnapshots(peaks, match, { seed: record.seed, caseId: "normal",
      nextInput: processedInputs, inputLogSha256: record.inputLogSha256 });
  }
  function advanceTo(atUs) {
    if (atUs <= match.queue.nowUs || match.phase !== "running") return;
    if (collectPeaks || checkpoint) {
      // The archived inputs use 1x and integer microseconds. Sampling inserts
      // intermediate targets without changing event deadlines or command order.
      while (collectPeaks && sampleAt < atUs && match.phase === "running") {
        match.clock.targetUs = sampleAt;
        while (drain(match, 10_000) === "pending") {}
        sample();
        sampleAt += 2 * second;
      }
      if (match.phase !== "running") return;
      match.clock.targetUs = atUs;
    } else {
      creditTime(match, (atUs - match.queue.nowUs) / 1000);
    }
    while (drain(match, 10_000) === "pending") {}
    if (collectPeaks) {
      sample();
      if (sampleAt <= atUs) sampleAt += 2 * second;
    }
  }
  function sampleA18(atUs) {
    if (!a18Proof || a18Snapshot) return;
    if (!a18Before && a18Proof.beforeUs <= atUs) {
      advanceTo(a18Proof.beforeUs);
      assert.equal(match.queue.nowUs, a18Proof.beforeUs);
      const items = a18Proof.consumedIds.map(id => match.inventory.find(item => item.id === id));
      assert.deepEqual(items.map(item => item?.itemId), a18Proof.sourceItems);
      if (a18Proof.method === "forge") assert.equal(items[0].charges, 1399);
      const spring4 = match.seasons?.spring.counts[4] ?? 0;
      assert.equal(spring4, a18Proof.before);
      a18Before = { atUs: match.queue.nowUs, spring4,
        inputs: items.map(({ id, itemId, charges, slot, towerId }) => ({ id, itemId, charges, slot, towerId })) };
    }
    if (a18Proof.milestoneUs > atUs) return;
    advanceTo(a18Proof.milestoneUs);
    const item = match.inventory.find(entry => entry.id === a18Proof.instanceId);
    assert.equal(item?.itemId, a18Proof.itemId);
    assert.ok(a18Proof.consumedIds.every(id => !match.inventory.some(entry => entry.id === id)));
    assert.equal(match.seasons?.spring.counts[4] ?? 0, a18Proof.after);
    a18Snapshot = JSON.parse(JSON.stringify(match));
  }
  function sampleA17(atUs) {
    if (!a17Proof || a17Snapshot || a17Proof.atUs > atUs) return;
    advanceTo(a17Proof.atUs);
    const { challengeId, productId } = a17Proof;
    assert.equal(match.queue.nowUs, a17Proof.atUs);
    assert.equal(match.challengeShopOpen, true);
    assert.ok(match.queue.pending.some(event => event.payload.type === "challenge-spawn" && event.payload.challengeId === challengeId));
    assert.ok(match.inventory.some(item => item.itemId === "i265" && item.id === productId));
    a17Snapshot = JSON.parse(JSON.stringify(match));
  }
  const enqueued = new Set(match.queue.pending.filter(event => event.payload.type === "command").map(event => event.payload.command.id));
  for (const [index, entry] of record.inputs.entries()) {
    const id = String(index + 1);
    if (checkpoint && (Object.hasOwn(match.commandResults, id) || enqueued.has(id))) continue;
    if (checkpoint) assert.ok(entry.atUs >= checkpoint.atUs, `unrecorded input ${index + 1} before checkpoint`);
    sampleA18(entry.atUs);
    sampleA17(entry.atUs);
    advanceTo(entry.atUs);
    if (masteryWitnesses && entry.action.type === "exchange-hero") {
      for (const [phase, witness] of masteryWitnesses) {
        if (witness.atUs !== entry.atUs || witness.offer !== entry.action.offer) continue;
        assert.deepEqual(match.mallHeroClaims, ["i549"]);
        assert.equal(match.wave, witness.wave);
        assert.ok(match.cards.some(card => card.id === witness.materials[0].id && card.slot !== null));
        masterySnapshots.set(phase, { material: witness.materials[0].id, offer: witness.offer, wave: witness.wave,
          expected: entry.outcome, snapshot: JSON.parse(JSON.stringify(match)) });
      }
    }
    assert.ok(enqueue(match, { id, matchId: match.matchId, action: entry.action }), `command ${id}`);
    processedInputs = index + 1;
  }
  const endUs = record.endUs ?? record.result.atUs;
  sampleA18(endUs);
  sampleA17(endUs);
  advanceTo(endUs);
  for (const [index, entry] of record.inputs.entries()) {
    assert.deepEqual(match.commandResults[String(index + 1)], entry.outcome, `command outcome ${index + 1}`);
  }
  assert.deepEqual(match.result, record.result);
  assert.equal(match.wave, record.wave);
  assert.equal(match.kills ?? 0, record.kills);
  assert.deepEqual(JSON.parse(JSON.stringify(match.finalHit ?? null)), record.finalHit);
  if (masteryWitnesses) {
    assert.equal(masterySnapshots.size, masteryWitnesses.size);
    for (const [phase, proof] of masterySnapshots) {
      const artifact = { kind: "replayed-normal-engine-r03", seed: record.seed, contentVersion: version.m3ContentVersion,
        configVersion: version.m3ConfigVersion, mapVersion, initialStateSha256: record.initialStateSha256,
        inputLogSha256: record.inputLogSha256, snapshotSha256: sha256(JSON.stringify(proof.snapshot)), phase, ...proof };
      await writeFile(join(masteryDirectory, `seed-${record.seed}-${phase}.json`), JSON.stringify(artifact, null, 2) + "\n", { flag: "wx" });
    }
  }
  if (record.eventEvidence) assert.deepEqual(eventBalances(match), record.eventEvidence.end);
  if (r05Directory && record.eventEvidence?.status === "completed") {
    const snapshot = JSON.parse(JSON.stringify(match));
    await writeFile(join(r05Directory, `seed-${record.seed}.json`), JSON.stringify({
      kind: "replayed-normal-engine-r05", seed: record.seed, contentVersion: version.m3ContentVersion,
      configVersion: version.m3ConfigVersion, mapVersion, initialStateSha256: record.initialStateSha256,
      inputLogSha256: record.inputLogSha256, snapshotSha256: sha256(JSON.stringify(snapshot)),
      balances: record.eventEvidence.end, consumed: record.eventEvidence.opened.map(box => box.instanceId), snapshot,
    }, null, 2) + "\n", { flag: "wx" });
  }
  let terminal;
  if (terminalDirectory) {
    assert.ok(match.phase === "won" || match.phase === "failed", "Replayed match has no terminal result");
    const snapshot = JSON.parse(JSON.stringify(match));
    terminal = { path: join(terminalDirectory, `terminal-${record.seed}.json`), sha256: sha256(JSON.stringify(snapshot)) };
    const evidence = { kind: "replayed-normal-engine-terminal", seed: record.seed, contentVersion: version.m3ContentVersion,
      configVersion: version.m3ConfigVersion, mapVersion, initialStateSha256: record.initialStateSha256,
      inputLogSha256: record.inputLogSha256, snapshotSha256: terminal.sha256, snapshot };
    await writeFile(terminal.path, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  }
  let a18;
  if (a18Proof) {
    assert.ok(a18Snapshot, "A18 proof timestamp is outside the replay");
    a18 = { path: join(a18Directory, `${a18Proof.method}-${a18Proof.itemId}-${record.seed}.json`),
      sha256: sha256(JSON.stringify(a18Snapshot)) };
    const evidence = { kind: "replayed-normal-engine-a18", seed: record.seed, proof: a18Proof, before: a18Before,
      contentVersion: version.m3ContentVersion, configVersion: version.m3ConfigVersion, mapVersion,
      initialStateSha256: record.initialStateSha256, inputLogSha256: record.inputLogSha256,
      snapshotSha256: a18.sha256, snapshot: a18Snapshot };
    await writeFile(a18.path, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  }
  let a17;
  if (a17Proof) {
    assert.ok(a17Snapshot && !match.challengeShopOpen && !Object.hasOwn(match.challenges, a17Proof.challengeId));
    assert.ok(!match.enemies.some(enemy => enemy.challengeId === a17Proof.challengeId));
    assert.ok(!match.queue.pending.some(event => event.payload.type === "challenge-spawn"));
    a17 = { path: join(a17Directory, `before-close-${record.seed}.json`), sha256: sha256(JSON.stringify(a17Snapshot)) };
    const evidence = { kind: "replayed-normal-engine-a17", seed: record.seed, proof: a17Proof,
      contentVersion: version.m3ContentVersion, configVersion: version.m3ConfigVersion, mapVersion,
      initialStateSha256: record.initialStateSha256, inputLogSha256: record.inputLogSha256,
      snapshotSha256: a17.sha256, snapshot: a17Snapshot };
    await writeFile(a17.path, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  }
  return { seed: record.seed, result: match.result, kills: match.kills ?? 0, status: "replay-matched",
    ...(terminal && { terminal }),
    ...(a17 && { a17 }),
    ...(a18 && { a18 }),
    ...(record.eventEvidence && { eventBalances: eventBalances(match) }),
    ...(record.settlementEvidence && { settlementEvidence: record.settlementEvidence }),
    seasonProgress: match.seasons, ...(collectPeaks ? { peaks } : {}) };
}

const configText = await readFile(new URL("../docs/m2-configuration.json", import.meta.url));
const targetConfig = m3 ? await readFile(new URL("../docs/m3-configuration.json", import.meta.url)) : undefined;
const updatedPolicy = process.env.M2_SCEPTER_BANK_UNTIL !== undefined ||
  process.env.M3_A10_BOSS_FOCUS === "1" || process.env.M3_A18_FORGE_STOP === "1";
const strategyVersion = masteryPilot ? "m3-r03-mastery-1" : process.env.M3_R04 === "1" ? "m3-season-pilot-1" :
  process.env.M3_R04_CHALLENGES === "support" ? "m3-season-challenges-2" :
  process.env.M3_R04_CHALLENGES === "1" ? "m3-season-challenges-1" :
  process.env.M3_A18_PICKUP_RETRY === "1" ? "m3-a18-pickup-1" :
  process.env.M3_A10_SUPPORT === "1" ? "m3-normal-6" :
  process.env.M3_A10_FINAL_GEAR === "1" ? "m3-normal-5" :
  process.env.M3_A10_BOSS_MOBILITY === "1" ? "m3-normal-4" : updatedPolicy ? "m3-normal-3" : "m3-normal-2";
const summary = { contentVersion: version?.m3ContentVersion ?? contentVersion,
  configurationVersion: version?.m3ConfigVersion ?? configuration.version, configSha256: sha256(configText),
  ...(m3 ? { kind: "normal-engine-source", runtimeConfig: "docs/m2-configuration.json",
    targetConfigSha256: sha256(targetConfig), strategyVersion } :
    { bundlePath, bundleSha256 }), mapVersion, runs: [] };
const runDirectory = m3 ? process.env.M3_RUN_DIR : undefined;
if (runDirectory) await mkdir(runDirectory, { recursive: true });
async function recordRun(result) {
  summary.runs.push(result);
  if (runDirectory) {
    const evidence = JSON.stringify({ ...summary, runs: [result] }, null, 2);
    await writeFile(join(runDirectory, `seed-${result.seed}.json`), evidence + "\n", { flag: "wx" });
  }
}
if (process.env.M2_REPLAY) {
  const saved = JSON.parse(await readFile(process.env.M2_REPLAY, "utf8"));
  for (const key of ["configurationVersion", "configSha256", "mapVersion"]) {
    assert.equal(saved[key], summary[key], key);
  }
  if (process.env.M2_REPLAY_BASELINE === "1") {
    assert.ok(!process.env.M2_RESUME_PEAK, "Cross-build replay must start from a normal new match");
    summary.baseline = { contentVersion: saved.contentVersion, bundleSha256: saved.bundleSha256,
      inputLogSha256: saved.runs.map(record => ({ seed: record.seed, sha256: record.inputLogSha256 })) };
  } else {
    for (const key of ["contentVersion", m3 ? "targetConfigSha256" : "bundleSha256"]) assert.equal(saved[key], summary[key], key);
    if (m3 && saved.strategyVersion) summary.strategyVersion = saved.strategyVersion;
  }
  if (process.env.M2_RESUME_PEAK) {
    const { selected } = JSON.parse(await readFile(process.env.M2_RESUME_PEAK, "utf8"));
    for (const [criterion, checkpoint] of Object.entries(selected)) {
      const run = saved.runs.find(run => run.seed === checkpoint.seed);
      assert.equal(checkpoint.inputLogSha256, run.inputLogSha256);
      summary.runs.push({ criterion, checkpointAtUs: checkpoint.atUs, ...await replay(run, checkpoint) });
    }
  } else {
    for (const run of saved.runs.filter(run => !process.argv[2] || seeds.includes(run.seed))) summary.runs.push(await replay(run));
  }
} else {
  for (const seed of seeds) {
    let result;
    const trace = { inputs: [], waves: [] };
    try {
      result = run(seed, trace);
    } catch (error) {
      await recordRun({ seed, status: "harness-error", message: error.message, stack: error.stack, ...trace });
      console.error(error);
      process.exitCode = 1;
      continue;
    }
    console.error(JSON.stringify({ seed, result: result.result, wave: result.wave, kills: result.kills, breakthrough: result.breakthrough,
      roster: result.roster, capital: result.capital,
      successfulPurchases: result.inputs.filter(entry => entry.outcome?.ok && ["draw", "exchange", "buy-item"].includes(entry.action.type)).length }));
    await recordRun(result);
  }
}
console.log(JSON.stringify(summary, null, 2));
