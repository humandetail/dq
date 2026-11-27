// R04 normal continuation. The fixed policy only acts on visible match state.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { effectiveAttributes } from "../src/game/m2/combat.ts";
import { ordinaryGoods, qualificationChains, summonCards, towerLevels } from "../src/game/m2/content.ts";
import { learningLevel } from "../src/game/m2/hero.ts";
import { map, gridSize, mapVersion } from "../src/game/m2/map.ts";
import { containmentPoints, creditTime, drain, enqueue, heroAllySpellTargets, inspectBuildPlacement, newMatch, qualified } from "../src/game/m2/match.ts";
import { m3ConfigVersion, m3ContentVersion } from "../src/game/m2/m3-version.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { waves } from "../src/game/m2/waves.ts";

const [recordPath, outputPath] = process.argv.slice(2);
assert.ok(recordPath && outputPath, "Pass a registered normal archive and a new result path");
const second = 1_000_000;
const lastWaveStart = waves[54].startUs;
const goldReserve = 15_000;
const sha = value => createHash("sha256").update(value).digest("hex");
const trace = {
  kind: "normal-r04-reciprocal-wisp", recordPath, configurationVersion: m3ConfigVersion,
  contentVersion: m3ContentVersion, mapVersion, prefix: { verified: 0 }, actions: [], progress: [], grants: [],
};
let match;
let record;
let prefixLength;

function advance(atUs) {
  atUs = Math.min(atUs, lastWaveStart);
  if (atUs <= match.queue.nowUs || match.phase !== "running") return;
  creditTime(match, (atUs - match.queue.nowUs) / 1000);
  while (drain(match, 10_000) === "pending") {}
}

function balances() {
  return { atUs: match.queue.nowUs, wave: match.wave, gold: match.gold, lumber: match.lumber,
    population: match.population, populationLimit: match.populationLimit, containment: containmentPoints(match) };
}

function send(action) {
  if (match.phase !== "running" || match.wave >= 55) return;
  const id = String(prefixLength + trace.actions.length + 1);
  const before = balances();
  const receipt = { id, action, before };
  trace.actions.push(receipt);
  if (enqueue(match, { id, matchId: match.matchId, action })) {
    advance(before.atUs + 1);
    for (let attempt = 0; attempt < 44 && match.phase === "running" && match.wave < 55 && !match.commandResults[id]; attempt++)
      advance(match.queue.nowUs + second / 4);
    receipt.outcome = match.commandResults[id];
    const card = match.cards.find(entry => entry.id === receipt.outcome?.createdId);
    if (card) receipt.createdCard = { id: card.id, card: card.card, charges: card.charges, slot: card.slot };
  }
  receipt.after = balances();
  return receipt.outcome;
}

async function run() {
  const evidence = JSON.parse(await readFile(recordPath, "utf8"));
  [record] = evidence.runs;
  const registered = {
    73037: { opening: "i568", main: "H028", wisp: 828, prefixLength: 122 },
    73011: { opening: "i570", main: "H030", wisp: 968, prefixLength: 123 },
  }[record.seed];
  assert.ok(registered, "The normal continuation must be registered");
  trace.seed = record.seed;
  assert.equal(record.opening, registered.opening);
  const wispCardId = registered.wisp;
  const prefix = record.inputs.filter(input => input.atUs < record.breakthrough.atUs);
  prefixLength = prefix.length;
  assert.equal(prefixLength, registered.prefixLength);
  assert.equal(evidence.contentVersion, m3ContentVersion);
  assert.equal(evidence.configurationVersion, m3ConfigVersion);
  assert.equal(evidence.mapVersion, mapVersion);
  assert.equal(evidence.configSha256, sha(await readFile(new URL("../docs/m2-configuration.json", import.meta.url))));
  assert.equal(evidence.targetConfigSha256, sha(await readFile(new URL("../docs/m3-configuration.json", import.meta.url))));
  trace.prefix.inputLogSha256 = sha(JSON.stringify(record.inputs));
  assert.equal(trace.prefix.inputLogSha256, record.inputLogSha256);
  match = newMatch(`normal-${record.seed}`, record.seed, startSeasons().seasons);
  trace.prefix.initialSha256 = sha(JSON.stringify(match));
  trace.prefix.candidates = match.openingCandidates;
  assert.deepEqual(match.openingCandidates, record.candidates);
  assert.equal(trace.prefix.initialSha256, record.initialStateSha256);
  for (const [index, input] of prefix.entries()) {
    advance(input.atUs);
    trace.prefix.nextInput = index + 1;
    assert.equal(match.queue.nowUs, input.atUs);
    assert.ok(enqueue(match, { id: String(index + 1), matchId: match.matchId, action: input.action }));
  }
  advance(record.breakthrough.atUs);
  for (const [index, input] of prefix.entries()) {
    const actual = match.commandResults[String(index + 1)];
    trace.prefix.nextReceipt = index + 1;
    assert.deepEqual(actual, input.outcome);
    trace.prefix.verified++;
  }
  const originalWisp = match.cards.find(card => card.id === wispCardId && card.card === "i571");
  assert.ok(originalWisp?.slot === null && originalWisp.charges === 1);
  trace.prefix.handoff = { ...balances(), snapshotSha256: sha(JSON.stringify(match)), wisp: structuredClone(originalWisp) };
  const main = match.structures.find(unit => unit.id === record.breakthrough.towerId);
  assert.ok(main?.templateId === registered.main && qualified(match, main.id));
  const initialSpring = structuredClone(match.seasons.spring);
  assert.equal(initialSpring.counts[2] ?? 0, 0);
  const sites = [];
  for (const area of map.buildAreas) {
    for (let y = area.minY; y <= area.maxY; y += gridSize)
      for (let x = area.minX; x <= area.maxX; x += gridSize) sites.push({ x, y });
  }
  const distance = (one, two) => Math.hypot(one.x - two.x, one.y - two.y);
  sites.sort((a, b) => distance(a, main) - distance(b, main));
  const pairIds = [];
  const wispCards = new Set([wispCardId]);
  const usedPromotions = [];
  let redAttempts = 0;
  let blueAttempts = 0;
  let loadouts;
  let springBeforeOverload;
  let scoreBeforeOverload;
  let secondWispShortfall = false;
  let latestDecisionWave = -1;

  const pair = () => pairIds.map(id => match.structures.find(unit => unit.id === id)).filter(Boolean);
  const gear = unit => match.inventory.filter(item => item.towerId === unit.id && item.slot !== null);
  const chainFor = unit => qualificationChains.get(unit.qualification);
  const workerSlots = () => match.cards.filter(card => card.slot !== null).length + match.books.length +
    match.inventory.filter(item => item.slot !== null && item.towerId === undefined).length;
  const heldR = () => match.cards.filter(card => card.slot !== null && summonCards.get(card.card)?.itemFields.Level === 12);
  function makeWorkerSlot(keepR) {
    if (workerSlots() < 6) return true;
    const expendable = match.cards.find(card => card.slot !== null && !card.bound && card.card !== "i571" &&
      summonCards.get(card.card)?.itemFields.droppable === 1 &&
      !card.card.startsWith("c") && (!keepR || !heldR().includes(card)) &&
      !pair().some(unit => chainFor(unit)?.card === card.card));
    if (expendable) send({ type: "drop-card", cardId: expendable.id });
    return workerSlots() < 6;
  }
  function collectCard(card, keepR) {
    if (card.slot !== null) return true;
    if (!makeWorkerSlot(keepR)) return false;
    return send({ type: "pick-up-card", cardId: card.id })?.ok === true;
  }
  function buildCard(card, origin, range = Infinity) {
    const action = { type: "build-card", cardId: card.id };
    const point = sites.find(site => distance(origin, site) <= range && inspectBuildPlacement(match, { ...action, point: site }).ok);
    return point && send({ ...action, point })?.createdId;
  }
  function learn(unit, ids) {
    for (const skillId of ids) {
      const required = learningLevel(unit.hero, unit.templateId, skillId);
      if (required !== undefined && unit.hero.level >= required && unit.hero.points > 0) {
        send({ type: "learn-skill", towerId: unit.id, skillId });
        return;
      }
    }
  }
  function readWisp(unit) {
    return { id: unit.id, level: unit.hero?.level, ranks: unit.hero && { ...unit.hero.ranks }, qualification: unit.qualification,
      qualified: qualified(match, unit.id), mana: unit.mana, gear: gear(unit).map(({ id, itemId }) => ({ id, itemId })),
      base: unit.hero && effectiveAttributes(unit.hero, gear(unit).map(item => item.itemId)),
      link: unit.wispLink && structuredClone(unit.wispLink), overload: unit.wispOverload };
  }

  while (match.phase === "running" && match.wave < 55) {
    const wisps = pair();
    if (match.wave !== latestDecisionWave) {
      latestDecisionWave = match.wave;
      trace.progress.push({ ...balances(), wispCards: [...wispCards], wisps: wisps.map(readWisp) });
    }
    if (match.seasons.spring.counts[2]) {
      assert.equal(match.seasons.spring.counts[2], 1680);
      assert.equal(match.seasons.spring.points, springBeforeOverload.points + 20);
      const settled = structuredClone(match.seasons.spring);
      const score = match.seasonScore ?? 0;
      trace.award = { ...balances(), before: springBeforeOverload, after: settled, awardedScore: score - scoreBeforeOverload,
        wisps: wisps.map(readWisp) };
      advance(match.queue.nowUs + 2 * second);
      assert.deepEqual(match.seasons.spring, settled);
      assert.equal(match.seasonScore ?? 0, score);
      trace.status = "observed";
      return;
    }
    if (!match.approach && !match.cards.find(card => card.id === wispCardId && card.slot !== null) && pairIds.length === 0) {
      const card = match.cards.find(card => card.id === wispCardId);
      if (card) collectCard(card, false);
    }
    if (wispCards.size < 2 && !match.approach) {
      const black = usedPromotions.length < 2 && match.inventory.find(item => item.itemId === "i005" && item.charges > 0);
      let outcome;
      if (black) {
        if (black.slot === null) {
          if (makeWorkerSlot(false)) send({ type: "pick-up-item", itemId: black.id });
        } else if (black.towerId !== undefined) {
          if (makeWorkerSlot(false)) send({ type: "transfer-item", itemId: black.id });
        } else {
          outcome = send({ type: "use-item", itemId: black.id });
          if (outcome?.ok) usedPromotions.push(black.id);
        }
      } else if (match.wave >= 31 && redAttempts < 4 && match.gold >= goldReserve + ordinaryGoods.get("i003").gold && makeWorkerSlot(false)) {
        redAttempts++;
        outcome = send({ type: "draw", draw: "i003" });
      }
      const created = match.cards.find(card => card.id === outcome?.createdId && card.card === "i571");
      if (created) wispCards.add(created.id);
    }
    if (wispCards.size === 2 && pairIds.length < 2 && !match.approach) {
      const card = match.cards.find(card => wispCards.has(card.id) && card.card === "i571");
      if (card && match.populationLimit - match.population >= card.hp * (2 - pairIds.length) && collectCard(card, false)) {
        const id = buildCard(card, wisps[0] ?? main, 750);
        if (id) pairIds.push(id);
      } else if (card && match.populationLimit - match.population < card.hp * (2 - pairIds.length)) {
        // Keep every hero provider and equipped tower. Recycle an unneeded basic tower only with both cards secured.
        const providers = [main, ...wisps].flatMap(unit => chainFor(unit)?.levels.map(level => level.id) ?? []);
        const spare = match.structures.find(unit => !unit.hero && !unit.pending && /^n02[1-5]$/.test(unit.templateId) &&
          !providers.includes(unit.templateId) && gear(unit).length === 0);
        if (spare && match.wave >= 31) {
          if (distance(match.worker, spare) > 1000) send({ type: "move-worker", point: { x: spare.x, y: spare.y } });
          else send({ type: "recycle-tower", towerId: spare.id });
        }
      }
    }
    if (wisps.length === 2 && wisps.every(unit => unit.hero && !unit.pending)) {
      for (const unit of wisps) {
        learn(unit, [...(unit.hero.ranks.A111 ? [] : ["A111"]), "A112", "T000"]);
        if (unit.hero.level < 16 && qualified(match, unit.id) && match.gold >= goldReserve + ordinaryGoods.get("i128").gold &&
            makeWorkerSlot(true)) {
          const book = send({ type: "buy-book", bookId: "i128" });
          if (book?.ok) send({ type: "use-book", itemId: book.createdId, towerId: unit.id });
        }
        if (qualified(match, unit.id) || match.approach) continue;
        const chain = chainFor(unit);
        const provider = match.structures.find(candidate => chain.levels.some(level => level.id === candidate.templateId));
        if (provider) {
          const upgrade = towerLevels.get(provider.templateId)?.upgrade;
          if (!provider.pending && upgrade && match.gold >= goldReserve + upgrade.gold) send({ type: "upgrade-tower", towerId: provider.id });
          continue;
        }
        const providerCard = match.cards.find(entry => [chain.card, chain.targetedCard].includes(entry.card));
        if (providerCard) {
          if (match.populationLimit - match.population >= providerCard.hp && collectCard(providerCard, true))
            buildCard(providerCard, main);
        } else if (heldR().length >= 5) {
          send({ type: "exchange", qualification: chain.id });
        } else {
          const material = match.cards.find(entry => entry.slot === null && summonCards.get(entry.card)?.itemFields.Level === 12);
          if (material) collectCard(material, true);
          else if (blueAttempts < 12 && match.gold >= goldReserve + ordinaryGoods.get("i001").gold && makeWorkerSlot(true)) {
            blueAttempts++;
            send({ type: "draw", draw: "i001" });
          }
        }
      }
      if (!loadouts && wisps.every(unit => unit.hero.ranks.A112 === 6 && unit.hero.ranks.T000 === 6 && qualified(match, unit.id))) {
        const lower = wisps.every(unit => unit.hero.level >= 26);
        const purchasePrice = lower ? 91_600 : 101_000;
        if (match.gold >= purchasePrice) {
          loadouts = [[...Array(lower ? 3 : 4).fill("i202"), "i157", "i157"], Array(6).fill("i202")];
          trace.loadoutDecision = { ...balances(), purchasePrice, loadouts };
        }
      }
      if (loadouts) {
        for (const [index, unit] of wisps.entries()) {
          const expected = loadouts[index];
          const equipped = gear(unit);
          const missing = expected.find(itemId => equipped.filter(item => item.itemId === itemId).length <
            expected.filter(id => id === itemId).length);
          if (missing && qualified(match, unit.id) && !match.approach) {
            const carried = match.inventory.find(item => item.itemId === missing && item.towerId === undefined && item.slot !== null);
            const shop = ordinaryGoods.get(missing);
            const mightRestock = match.shopRestock[missing]?.every(atUs => atUs <= match.queue.nowUs) ?? true;
            const purchase = !carried && mightRestock && match.gold >= shop.gold && makeWorkerSlot(true) ?
              send({ type: "buy-item", itemId: missing }) : undefined;
            const itemId = carried?.id ?? purchase?.createdId;
            if (itemId !== undefined) send({ type: "transfer-item", itemId, towerId: unit.id });
          }
        }
        const ready = wisps.every((unit, index) => qualified(match, unit.id) && (unit.mana ?? 0) >= 445 &&
          gear(unit).map(item => item.itemId).sort().join(",") === loadouts[index].toSorted().join(","));
        if (ready) {
          for (const [index, unit] of wisps.entries()) {
            const partner = wisps[1 - index];
            if (!unit.wispLink && heroAllySpellTargets(match, unit, "A111").some(target => target.id === partner.id)) {
              send({ type: "cast-hero", towerId: unit.id, skillId: "A111", targetId: partner.id });
              advance(match.queue.nowUs + second / 2);
            }
          }
          if (wisps.every((unit, index) => unit.wispLink?.targetId === wisps[1 - index].id)) {
            springBeforeOverload ??= structuredClone(match.seasons.spring);
            scoreBeforeOverload ??= match.seasonScore ?? 0;
            for (const unit of wisps) if (!unit.wispOverload && (unit.wispOverloadReadyUs ?? 0) <= match.queue.nowUs)
              send({ type: "cast-hero", towerId: unit.id, skillId: "A112" });
          }
        }
      }
    }
    if (match.phase === "running" && !match.approach && !loadouts && containmentPoints(match) >= 55) {
      const upgrade = match.structures.find(unit => {
        const cost = towerLevels.get(unit.templateId)?.upgrade;
        return !unit.hero && !unit.pending && cost && cost.gold + goldReserve <= match.gold && cost.wood <= match.lumber &&
          match.population + cost.populationDelta <= match.populationLimit;
      });
      if (upgrade) send({ type: "upgrade-tower", towerId: upgrade.id });
    }
    if (!secondWispShortfall && wispCards.size < 2 && match.wave >= 40 && usedPromotions.length === 2 && redAttempts === 4) {
      secondWispShortfall = true;
      trace.secondWispShortfall = { ...balances(), cards: [...wispCards], redAttempts, promotions: [...usedPromotions] };
      await writeFile(outputPath + ".acquisition-exhausted.json", JSON.stringify(trace, null, 2) + "\n", { flag: "wx" });
    }
    advance(match.queue.nowUs + (loadouts ? second / 4 : 2 * second));
    if (loadouts) {
      for (const unit of wisps) {
        const grant = unit.wispLink?.boost;
        const previous = trace.grants.findLast(entry => entry.id === unit.id);
        if (grant && (grant.stat !== previous?.stat || grant.amount !== previous?.amount))
          trace.grants.push({ ...balances(), id: unit.id, targetId: unit.wispLink.targetId, ...grant });
      }
    }
  }
  trace.status = wispCards.size < 2 ? "second-wisp-not-acquired" : "threshold-not-observed";
  trace.readiness = { wispCards: [...wispCards], redAttempts, blueAttempts, promotions: [...usedPromotions],
    wisps: pair().map(readWisp) };
}

try {
  await run();
} catch (error) {
  trace.status = trace.prefix.handoff ? "continuation-error" : "prefix-mismatch";
  trace.error = { message: error.message, expected: error.expected, actual: error.actual, stack: error.stack };
  process.exitCode = 1;
}
if (match) trace.end = { ...balances(), phase: match.phase, result: match.result, seasons: match.seasons,
  score: match.seasonScore ?? 0, remainingWispCards: match.cards.filter(card => card.card === "i571") };
await writeFile(outputPath, JSON.stringify(trace, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: trace.status, prefixVerified: trace.prefix.verified, outputPath }));
