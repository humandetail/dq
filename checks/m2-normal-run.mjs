// Runs ordinary commands from a fresh match. Reports failures as well as any
// candidate A10 result. No enemy, inventory, RNG or queue entries are injected.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { contentVersion, configuration, cardTemplates, qualificationChains, towerLevels, ordinaryGoods, recipes, itemFields, summonCards } from "../src/game/m2/content.ts";
import { gridSize, map, mapVersion } from "../src/game/m2/map.ts";
import { containmentPoints, creditTime, drain, enqueue, inspectBuildPlacement, newMatch, qualified } from "../src/game/m2/match.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { learnableSkills, learningLevel } from "../src/game/m2/hero.ts";

import { waves as mainline } from "../src/game/m2/waves.ts";

const second = 1_000_000;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const seeds = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [47, 811, 1709, 20261124];
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

function run(seed) {
  const match = newMatch(`normal-${seed}`, seed, startSeasons().seasons);
  const initialStateSha256 = sha256(JSON.stringify(match));
  const opening = process.env.M2_OPENING ?? "i564";
  const qualificationTarget = process.env.M2_QUALIFICATION;
  assert.ok(!qualificationTarget || qualificationChains.has(qualificationTarget), "Unknown requested qualification chain");
  let maxProvider;
  let assignedQualification;
  const ssrTarget = process.env.M2_SSR;
  const bossReserveWave = Number(process.env.M2_BOSS_RESERVE ?? Infinity);
  assert.ok(!ssrTarget || configuration.cardPools.SSR.includes(ssrTarget), "Unknown requested SSR card");
  const ssrRoot = ssrTarget && cardTemplates.get(ssrTarget).root;
  let ssrRun;
  const ssrSkills = ssrTarget === "i502" ? ["A019", "A020"] : ["A041", "A042"];
  const seekChallenge = process.env.M2_A17 === "1";
  const bankForChallenge = seekChallenge && process.env.M2_A17_BANK === "1";
  const challengeBankWave = Number(process.env.M2_A17_BANK_WAVE ?? 28);
  const challengeMaterialWave = Number(process.env.M2_A17_MATERIAL_WAVE ?? Infinity);
  const seekChest = process.env.M2_A18 === "1";
  const wishForChests = seekChest && process.env.M2_CHEST_WISH === "1";
  const settlementScenario = process.env.M2_A11;
  const secondHeroCard = process.env.M2_SECOND_HERO;
  assert.ok(!secondHeroCard || configuration.cardPools.SR.includes(secondHeroCard), "Unknown second hero card");
  assert.ok(!settlementScenario || ["charm", "timeout"].includes(settlementScenario));
  let charmSettlement;
  const challengeUnits = ["m521", "m522", "m523"];
  const challengeEvidence = [];
  let challengeProduct;
  let challengeClosure;
  const challengeMaterials = [];
  const challengeMysteryStock = [];
  let lastChallengeStock;
  const chestEvidence = { drops: {}, opens: [] };
  const attemptedLoot = new Set();
  const scepterPlan = process.env.M2_PLAN === "scepter" && opening === "i576";
  const inputs = [];
  const waves = [];
  const usedSsr = [];
  let breakthrough = null;
  let bossHealth = null;
  let peak = { enemies: 0, events: 0, bytes: 0 };
  const sampled = () => {
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
    const ssrTower = ssrRoot && match.structures.find(entry => entry.templateId === ssrRoot && !entry.pending);
    if (ssrTower && !ssrRun) ssrRun = { id: ssrTower.id, unitId: ssrRoot, builtWave: match.wave, learned: {}, casts: {}, hits: 0 };
    if (ssrTower && ssrRun) {
      ssrRun.learned = { ...ssrTower.hero.ranks };
      for (const id of ssrSkills) {
        if (ssrTower.heroSpellReady?.[id]) ssrRun.casts[id] ??= { wave: match.wave, readyUs: ssrTower.heroSpellReady[id] };
      }
      ssrRun.hits = Math.max(ssrRun.hits, match.recentHits?.filter(hit => hit.casterId === ssrTower.id).length ?? 0);
    }
    if (qualificationTarget && !assignedQualification) assignedQualification = match.structures.find(tower => tower.hero)?.qualification;
    if (qualificationTarget && !maxProvider) {
      const chain = qualificationChains.get(qualificationTarget);
      const provider = match.structures.find(tower => !tower.pending && tower.templateId === chain.requireUnit);
      if (provider) maxProvider = { id: provider.id, templateId: provider.templateId, atUs: match.queue.nowUs, wave: match.wave };
    }
    if (!breakthrough && match.wave < 55) {
      const hero = match.structures.find(tower => tower.hero?.level >= 21 && qualified(match, tower.id));
      if (hero) breakthrough = { wave: match.wave, atUs: match.queue.nowUs, tower: hero.templateId, level: hero.hero.level, qualification: hero.qualification };
    }
    peak.enemies = Math.max(peak.enemies, match.enemies.length);
    peak.events = Math.max(peak.events, match.queue.pending.length);
  };

  function advance(deltaUs) {
    creditTime(match, deltaUs / 1000);
    while (drain(match, 10_000) === "pending") {}
    sampled();
  }

  function command(action) {
    const id = String(inputs.length + 1);
    const atUs = match.queue.nowUs;
    const wave = match.wave;
    let acquisition;
    if (qualificationTarget) {
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
    if ((qualificationTarget || ssrTarget) && outcome?.createdId && ["draw", "exchange", "use-item"].includes(action.type)) {
      const card = match.cards.find(entry => entry.id === outcome.createdId);
      if (card) acquisition = { ...acquisition, obtainedCard: card.card, receivedId: card.id };
    }
    inputs.push({ atUs, action, ...(outcome ? { outcome } : {}), ...((qualificationTarget || ssrTarget) ? { wave, acquisition } : {}) });
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

  const carriedItem = id => match.inventory.find(item => item.itemId === id && item.towerId === undefined && item.slot !== null);
  const equipped = id => match.inventory.some(item => item.itemId === id && item.towerId > 0 && item.slot !== null);
  const savingForScepter = () => scepterPlan && match.wave >= 30 && !equipped("i310");
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

  command({ type: "choose-talent", choice: process.env.M2_TALENT ?? (wishForChests ? "W004" : "W005") });
  command({ type: "use-item", itemId: match.inventory.find(item => item.itemId === "i004").id });
  const hero = command({ type: "choose-opening", card: opening });
  build({ type: "build-card", cardId: hero.createdId });
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
  const ssrComplete = () => ssrRun?.hits > 0 && ssrSkills.every(id => ssrRun.casts[id]);
  while (match.phase === "running" && (!qualificationTarget || breakthrough?.qualification !== qualificationTarget)) {
    if (ssrTarget && !settlementScenario && (ssrComplete() || match.wave >= (process.env.M2_SSR_RESERVE ? 38 : 30))) break;
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
        // The policy uses only tier-one and tier-two boxes and SSR-free draws.
        if (status === 2) command({ type: "claim-wave", slot });
      }
      const tierTwoKey = carriedItem("i412");
      if (tierTwoKey && carriedItem("i402")) command({ type: "use-item", itemId: tierTwoKey.id });
      const drawSsr = ssrTarget && !seekChest && !ssrRun && !match.cards.some(card => card.card === ssrTarget);
      for (const item of match.inventory) {
        if (item.slot !== null && item.towerId === undefined &&
            (["i001", "i002", "i006"].includes(item.itemId) || drawSsr && ["i003", "i005"].includes(item.itemId)))
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
          if (starter) command({ type: "recycle-tower", towerId: starter.id });
        }
      }
      const cardPriority = [...new Set([
        ...(qualificationTarget && chain ? [chain.card] : []), "i601", "i606", "i609", "i603", "i608", "i604",
      ])];
      for (const card of match.cards.filter(card => card.slot !== null)) {
        if (card.card !== ssrTarget && (card.card !== secondHeroCard || match.wave < 34) && !card.card.startsWith("c") && cardTemplates.get(card.card)?.rarity !== "R") {
          command({ type: "drop-card", cardId: card.id });
        }
      }
      const secondHero = secondHeroCard && match.structures.find(tower => tower !== activeHero &&
        cardTemplates.get(secondHeroCard).root === tower.templateId);
      const spareHeroCard = secondHeroCard && !secondHero && match.wave >= 38 &&
        match.cards.find(card => card.card === secondHeroCard && card.slot !== null);
      if (spareHeroCard) {
        if (match.population + spareHeroCard.hp <= match.populationLimit) {
          build({ type: "build-card", cardId: spareHeroCard.id });
        } else {
          const ordinary = [...match.structures].reverse().find(tower => !tower.pending &&
            /^n02[1-5]$/.test(tower.templateId) && Math.hypot(tower.x - match.worker.x, tower.y - match.worker.y) <= 1000);
          if (ordinary) command({ type: "recycle-tower", towerId: ordinary.id });
        }
      }
      if (secondHero && !secondHero.pending && secondHero.hero?.level < 15 && match.gold >= 6000) {
        const purchase = command({ type: "buy-book", bookId: "i128" });
        if (purchase?.ok) command({ type: "use-book", itemId: purchase.createdId, towerId: secondHero.id });
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
        if (basicTower) command({ type: "recycle-tower", towerId: basicTower.id });
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
          acquireAndEquip("i310", activeHero, saving ? 0 : 1700);
        }
        if (!savingChallengeGold && !savingForScepter() && (equipped("i137") || equipped("i138"))) {
          acquireAndEquip("i217", activeHero, savingBossGold ? 0 : 1400);
          if (match.wave >= 36) acquireAndEquip("i188", activeHero, 1800);
          if (match.wave >= 39) acquireAndEquip("i177", activeHero, 1900);
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
      } else if (drawSsr && match.wave >= 11 && match.gold >= 6500 && occupied < 6) {
        command({ type: "draw", draw: "i003" });
      } else if (!savingChallengeGold && !savingBossGold && !(drawSsr && process.env.M2_SSR_RESERVE && match.wave >= 10) && match.wave >= 9 &&
          match.gold >= (hasActiveProvider ? (match.wave >= 26 ? spendingFloor : 3800) : 3100) && occupied < 6 && cardCount < 5) {
        command({ type: "draw", draw: "i002" });
      }
      if (seekChallenge && match.challengeShopOpen && (match.challengeReadyUs ?? 0) <= match.queue.nowUs && containmentPoints(match) < 40) {
        const unitId = challengeUnits[challengeEvidence.length];
        if (unitId && (!challengeEvidence.length || challengeEvidence.at(-1).cleared)) {
          const atUs = match.queue.nowUs;
          const result = command({ type: "reserve-challenge", unitId });
          if (result?.ok) challengeEvidence.push({ id: result.createdId, unitId, atUs, wave: match.wave, enemies: [] });
        }
      } else if (!seekChallenge && match.wave >= 13 && match.wave <= 25 && match.challengeShopOpen && (match.challengeReadyUs ?? 0) <= match.queue.nowUs &&
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
        if (wishForChests && match.talent?.id === "W014" && match.queue.nowUs >= match.talent.readyUs &&
            (!carriedItem("i404") || !carriedItem("i414"))) {
          command({ type: "cast-talent" });
        }
        const box = carriedItem("i404");
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
        } else {
          const loot = match.inventory.find(item => item.slot === null && !attemptedLoot.has(item.id) &&
            (item.itemId === "i404" && !box || item.itemId === "i414" && !key));
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

  const clearedA10 = !ssrTarget && match.result?.reason === "boss-killed" && !!match.finalHit?.towerId && !!breakthrough &&
    breakthrough.atUs < (match.bossArrivalUs ?? 0) && usedSsr.length === 0 &&
    match.finalHit.atUs <= match.bossDeadlineUs;
  peak.bytes = Math.max(peak.bytes, Buffer.byteLength(JSON.stringify(match)));
  const chain = qualificationChains.get(qualificationTarget);
  const providerBuild = maxProvider && inputs.find(entry => entry.action.type === "build-card" && entry.outcome?.createdId === maxProvider.id);
  const upgrades = maxProvider ? inputs.filter(entry => entry.action.type === "upgrade-tower" &&
    entry.action.towerId === maxProvider.id && entry.outcome?.ok) : [];
  const designatedExchange = providerBuild && inputs.find(entry => entry.action.type === "exchange" &&
    entry.outcome?.createdId === providerBuild.action.cardId);
  return { seed, opening, strategy: scepterPlan ? "scepter" : "default", layout: entryOpening ? "entry" : "center",
    ...(settlementScenario ? { settlementEvidence: { scenario: settlementScenario, charm: charmSettlement ?? null,
      charmRemaining: !!carriedItem("i278"), phase: match.phase, killScore: match.killScore ?? 0,
      bossAtEnd: match.enemies.some(enemy => enemy.unitId === "mBOS") } } : {}),
    ...(seekChallenge ? { challengeEvidence, challengeProduct: challengeProduct ?? null, challengeMaterials, challengeMysteryStock,
      challengeClosure: challengeClosure ?? null } : {}),
    ...(seekChest ? { chestEvidence } : {}),
    ...(ssrTarget ? { ssrEvidence: { requested: ssrTarget, ...ssrRun, completed: !!ssrComplete() } } : {}),
    ...(qualificationTarget ? { qualificationEvidence: {
      requested: qualificationTarget, assigned: assignedQualification, maxProvider, providerBuild, designatedExchange, upgrades,
      directUpgradeCost: { gold: upgrades.reduce((sum, entry) => sum + entry.acquisition.gold, 0),
        wood: upgrades.reduce((sum, entry) => sum + entry.acquisition.wood, 0) },
      completed: !!chain && breakthrough?.qualification === qualificationTarget && maxProvider?.templateId === chain.requireUnit,
    } } : {}), result: match.result, wave: match.wave, kills: match.kills ?? 0, capital: { gold: match.gold, lumber: match.lumber },
    roster: match.structures.map(tower => ({ templateId: tower.templateId, x: tower.x, y: tower.y, level: tower.hero?.level,
      items: match.inventory.filter(item => item.towerId === tower.id).map(item => item.itemId) })),
    initialStateSha256, breakthrough, finalHit: match.finalHit ?? null, usedSsr, clearedA10, bossArrivalUs: match.wave === 55 ? match.bossArrivalUs : null, bossDeadlineUs: match.bossDeadlineUs, bossHealth, peak, waves, survivors: Object.fromEntries([...new Set(match.enemies.map(enemy => enemy.unitId))]
      .map(id => [id, match.enemies.filter(enemy => enemy.unitId === id).length])), inputs, inputLogSha256: sha256(JSON.stringify(inputs)) };
}

function replay(record, checkpoint) {
  const match = checkpoint ? structuredClone(checkpoint.snapshot) : newMatch(`normal-${record.seed}`, record.seed, startSeasons().seasons);
  assert.equal(sha256(JSON.stringify(match)), checkpoint?.snapshotSha256 ?? record.initialStateSha256);
  assert.equal(sha256(JSON.stringify(record.inputs)), record.inputLogSha256);
  const collectPeaks = process.env.M2_PEAK_SELECTION === "1";
  const peaks = {};
  let sampleAt = 2 * second;
  let processedInputs = 0;
  function sample() {
    const serialized = JSON.stringify(match);
    const load = {
      snapshotBytes: Buffer.byteLength(serialized),
      queuedEvents: match.queue.pending.length,
      entities: match.structures.length + match.enemies.length + (match.summons?.length ?? 0) + (match.detectors?.length ?? 0),
      enemies: match.enemies.length, allies: match.structures.length,
      summons: match.summons?.length ?? 0, detectors: match.detectors?.length ?? 0,
      containment: containmentPoints(match),
      projectiles: match.queue.pending.filter(event => event.payload.type === "weapon-impact").length,
    };
    for (const criterion of ["snapshotBytes", "queuedEvents", "entities"]) {
      if (!peaks[criterion] || load[criterion] > peaks[criterion].load[criterion]) {
        peaks[criterion] = { seed: record.seed, atUs: match.queue.nowUs, nextInput: processedInputs, load, snapshotSha256: sha256(serialized),
          inputLogSha256: record.inputLogSha256, snapshot: JSON.parse(serialized) };
      }
    }
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
  const enqueued = new Set(match.queue.pending.filter(event => event.payload.type === "command").map(event => event.payload.command.id));
  for (const [index, entry] of record.inputs.entries()) {
    const id = String(index + 1);
    if (checkpoint && (Object.hasOwn(match.commandResults, id) || enqueued.has(id))) continue;
    if (checkpoint) assert.ok(entry.atUs >= checkpoint.atUs, `unrecorded input ${index + 1} before checkpoint`);
    advanceTo(entry.atUs);
    assert.ok(enqueue(match, { id, matchId: match.matchId, action: entry.action }), `command ${id}`);
    processedInputs = index + 1;
  }
  advanceTo(record.result.atUs);
  for (const [index, entry] of record.inputs.entries()) {
    assert.deepEqual(match.commandResults[String(index + 1)], entry.outcome, `command outcome ${index + 1}`);
  }
  assert.deepEqual(match.result, record.result);
  assert.equal(match.wave, record.wave);
  assert.equal(match.kills ?? 0, record.kills);
  assert.deepEqual(JSON.parse(JSON.stringify(match.finalHit ?? null)), record.finalHit);
  return { seed: record.seed, result: match.result, kills: match.kills ?? 0, status: "replay-matched",
    seasonProgress: match.seasons, ...(collectPeaks ? { peaks } : {}) };
}

const configText = await readFile(new URL("../docs/m2-configuration.json", import.meta.url));
const summary = { contentVersion, configurationVersion: configuration.version, configSha256: sha256(configText),
  mapVersion, bundlePath, bundleSha256, runs: [] };
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
    for (const key of ["contentVersion", "bundleSha256"]) assert.equal(saved[key], summary[key], key);
  }
  if (process.env.M2_RESUME_PEAK) {
    const { selected } = JSON.parse(await readFile(process.env.M2_RESUME_PEAK, "utf8"));
    for (const [criterion, checkpoint] of Object.entries(selected)) {
      const run = saved.runs.find(run => run.seed === checkpoint.seed);
      assert.equal(checkpoint.inputLogSha256, run.inputLogSha256);
      summary.runs.push({ criterion, checkpointAtUs: checkpoint.atUs, ...replay(run, checkpoint) });
    }
  } else {
    for (const run of saved.runs.filter(run => !process.argv[2] || seeds.includes(run.seed))) summary.runs.push(replay(run));
  }
} else {
  for (const seed of seeds) {
    const result = run(seed);
    console.error(JSON.stringify({ seed, result: result.result, wave: result.wave, kills: result.kills, breakthrough: result.breakthrough,
      roster: result.roster, capital: result.capital,
      successfulPurchases: result.inputs.filter(entry => entry.outcome?.ok && ["draw", "exchange", "buy-item"].includes(entry.action.type)).length }));
    summary.runs.push(result);
  }
}
console.log(JSON.stringify(summary, null, 2));
