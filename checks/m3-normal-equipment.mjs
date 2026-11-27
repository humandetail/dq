// R01 normal acquisition. No initial inventory, resources, or wave state are modified.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { cardTemplates, itemFields, ordinaryGoods, qualificationChains, recipes, towerLevels } from "../src/game/m2/content.ts";
import { canMoveItem, controlEquipmentTargets, creditTime, drain, enqueue, inspectBuildPlacement,
  isTargetedEquipment, itemSaleQuote, newMatch, qualified } from "../src/game/m2/match.ts";
import { learnableSkills, learningLevel } from "../src/game/m2/hero.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { m3ConfigVersion, m3ContentVersion } from "../src/game/m2/m3-version.ts";

const seeds = [14, 47, 811, 1709, 20261124];
const selectedSeed = process.env.M3_R01_SAMPLE_SEED;
const samples = selectedSeed ? seeds.filter(seed => String(seed) === selectedSeed) : seeds;
if (!samples.length) throw new Error("Only a preregistered seed can be selected");
const followup = process.env.M3_R01_FOLLOWUP;
const policy = followup === "qualified" ? "m3-r01-qualified-2" :
  followup ? `m3-r01-${followup}-1` : "m3-r01-equipment-1";
const sourceItems = JSON.parse(readFileSync(new URL("../src/game/m2/m3-items.json", import.meta.url)));
const goods = new Set(sourceItems.map(row => row.id));
const allRoutes = sourceItems.flatMap(({ id }) => [
  ...(ordinaryGoods.has(id) ? [`${id}:vendor`] : []),
  ...(recipes.has(id) ? [`${id}:recipe`] : []),
]);
const unavailable = sourceItems.filter(({ id }) => !ordinaryGoods.has(id) && !recipes.has(id));
if (unavailable.length) throw new Error(`Missing R01 routes: ${unavailable.map(row => row.id).join(", ")}`);
const routeKeys = process.argv.slice(2);
const requested = routeKeys.includes("all") ? allRoutes : routeKeys;
if (!requested.length || requested.some(entry => !allRoutes.includes(entry))) {
  throw new Error("Pass all or one or more registered routes iNNN:vendor / iNNN:recipe");
}
if (followup && !["sale", "effects", "inventory", "qualified"].includes(followup)) throw new Error("Unknown follow-up");
if (followup === "inventory" && requested.some(route => route !== "i208:vendor")) {
  throw new Error("Inventory stress requires the preregistered i208:vendor route");
}
const qualifiedRoutes = new Set(["i226:vendor", "i230:recipe", "i249:recipe", "i250:recipe", "i251:recipe",
  "i252:recipe", "i253:recipe", "i254:recipe", "i272:vendor", "i282:vendor"]);
if (followup === "qualified" && requested.some(route => !qualifiedRoutes.has(route))) {
  throw new Error("Qualification effects require the preregistered high-tier routes");
}

const active = new Set(["i207", "i230", "i232", "i238", "i272", "i274"]);
const contracts = new Set(["i243", "i245", "i247", "i249", "i250", "i251", "i252", "i253", "i254"]);
const sites = [{ x: -288, y: -160 }, { x: 192, y: -224 }, { x: 192, y: -32 }];
const qualificationSites = [{ x: -288, y: 160 }, { x: 240, y: 160 }, { x: -288, y: 640 }];
const digest = value => createHash("sha256").update(value).digest("hex");
const source = [
  "checks/m3-normal-equipment.mjs",
  "src/game/event-queue.ts",
  "reference/map-6.25/units_unitbalance.json",
  "reference/map-6.25/units_unitdata.json",
  ...readdirSync("src/game/m2").filter(file => /\.(ts|json)$/.test(file)).sort().map(file => `src/game/m2/${file}`),
  ...readdirSync("docs").filter(file => /^(m2|m3)-.*\.json$/.test(file)).sort().map(file => `docs/${file}`),
].map(path => [path, digest(readFileSync(path))]);

function ingredients(id, throughRecipe = false) {
  if (!throughRecipe && ordinaryGoods.has(id)) return [id];
  const parts = recipes.get(id);
  if (!parts) throw new Error(`Missing shop and recipe for ${id}`);
  // Assemble nested pieces before keeping books and other small materials in the pack.
  return parts.map(part => ingredients(part)).sort((a, b) => b.length - a.length).flat();
}

function run(route, seed) {
  const [target, mode] = route.split(":");
  const shopping = ingredients(target, mode === "recipe");
  const goldCost = shopping.reduce((sum, itemId) => sum + ordinaryGoods.get(itemId).gold, 0);
  const lumberCost = shopping.reduce((sum, itemId) => sum + ordinaryGoods.get(itemId).lumber, 0);
  const state = newMatch(`normal-r01-${route}-${seed}`, seed, startSeasons().seasons);
  const initialStateSha256 = digest(JSON.stringify(state));
  const needQualification = followup === "qualified";
  const openingOrder = needQualification ? ["i581", "i564", "i569", "i576"] : ["i564", "i581", "i569", "i576"];
  const opening = openingOrder.find(id => state.openingCandidates.includes(id)) ?? state.openingCandidates[0];
  const commands = [];
  const transactions = [];
  const carried = id => state.inventory.find(item => item.itemId === id && item.towerId === undefined && item.slot !== null);
  const instance = id => state.inventory.find(item => item.id === id);
  const balances = () => ({ gold: state.gold, lumber: state.lumber });
  const placement = (action, point) => inspectBuildPlacement(state, { ...action, point }).ok && send({ ...action, point });
  function advance(ms) {
    creditTime(state, ms);
    while (drain(state, 10000) === "pending") {}
  }
  function sendTogether(actions) {
    const atUs = state.queue.nowUs;
    const ids = actions.map((action, index) => {
      const id = String(commands.length + index + 1);
      if (!enqueue(state, { id, matchId: state.matchId, action })) throw new Error(`Rejected order ${id}`);
      return id;
    });
    advance(.001);
    for (let attempt = 0; attempt < 44 && state.phase === "running" && ids.some(id => !state.commandResults[id]); attempt++) {
      advance(250);
    }
    return ids.map((id, index) => {
      const result = state.commandResults[id];
      commands.push({ atUs, action: actions[index], result });
      return result;
    });
  }
  function send(action) {
    return sendTogether([action])[0];
  }
  function sellTwice(item, shop) {
    const quote = itemSaleQuote(state, item, shop);
    const before = balances();
    const action = { type: "sell-item", itemId: item.id, shop };
    const results = sendTogether([action, action]);
    return { quote, charges: item.charges, before, after: balances(), results, removed: !instance(item.id) };
  }
  send({ type: "choose-talent", choice: "W005" });
  send({ type: "use-item", itemId: carried("i004").id });
  const choice = send({ type: "choose-opening", card: opening });
  if (!choice?.ok || !cardTemplates.has(opening)) throw new Error(`Opening failed for ${seed}`);
  const heroId = placement({ type: "build-card", cardId: choice.createdId }, sites[0])?.createdId;
  placement({ type: "build-worker-tower", tower: "n021" }, sites[1]);
  placement({ type: "build-worker-tower", tower: "n001" }, sites[2]);
  for (const itemId of ["i006", "i411", "i001"]) {
    const item = carried(itemId);
    if (item) send({ type: "use-item", itemId: item.id });
  }
  const blade = state.inventory.find(item => ["i131", "i133", "i262"].includes(item.itemId) && item.slot !== null);
  if (heroId && blade) send({ type: "transfer-item", itemId: blade.id, towerId: heroId });
  for (const item of [...state.inventory]) {
    if (item.towerId === undefined && item.slot !== null && canMoveItem(item.itemId)) send({ type: "drop-item", itemId: item.id });
  }
  for (const card of [...state.cards]) {
    if (card.slot !== null) send({ type: "drop-card", cardId: card.id });
  }
  let position = 0;
  let obtained;
  let equipped;
  let use;
  let logistics;
  let sale;
  let fullPack;
  let qualification;
  let exclusion;
  let supportPurchase = 0;
  let lastDefenseWave = 0;
  const canUpgrade = tower => {
    const next = towerLevels.get(tower.templateId)?.upgrade;
    return !tower.pending && next && state.gold >= next.gold && state.lumber >= next.wood &&
      state.population + next.populationDelta <= state.populationLimit;
  };
  while (state.phase === "running" && state.wave < (needQualification ? 38 : 26)) {
    if (state.queue.nowUs >= (state.workerBenefitReadyUs ?? 0)) send({ type: "claim-worker-benefit" });
    const hero = state.structures.find(tower => tower.id === heroId && !tower.pending);
    if (hero?.hero) {
      for (const { skillId } of learnableSkills(hero.templateId)) {
        const required = learningLevel(hero.hero, hero.templateId, skillId);
        if (hero.hero.points > 0 && required !== undefined && hero.hero.level >= required) {
          send({ type: "learn-skill", towerId: heroId, skillId });
        }
      }
    }
    if (needQualification && hero && !qualified(state, heroId)) {
      const chain = qualificationChains.get(hero.qualification);
      if (chain) {
        for (const item of state.inventory.filter(entry => entry.towerId === undefined && entry.slot !== null &&
            (entry.itemId === "i003" || entry.itemId === "i005"))) {
          send({ type: "drop-item", itemId: item.id });
        }
        const provider = state.structures.find(tower => chain.levels.some(level => level.id === tower.templateId));
        if (provider) {
          const next = towerLevels.get(provider.templateId).upgrade;
          if (canUpgrade(provider)) send({ type: "upgrade-tower", towerId: provider.id });
          else if (!provider.pending && next?.wood > state.lumber && state.gold >= ordinaryGoods.get("i261").gold) {
            send({ type: "buy-item", itemId: "i261" });
          }
        } else {
          const held = state.cards.filter(card => card.slot !== null);
          const matching = held.find(card => card.card === chain.targetedCard || card.card === chain.card);
          if (matching) {
            qualificationSites.some(point => placement({ type: "build-card", cardId: matching.id }, point)?.ok);
          } else {
            for (const card of held.filter(card => cardTemplates.get(card.card)?.rarity !== "R")) {
              send({ type: "drop-card", cardId: card.id });
            }
            const rare = held.filter(card => cardTemplates.get(card.card)?.rarity === "R");
            if (rare.length >= 5 && state.qualificationShopOpen) send({ type: "exchange", qualification: chain.id });
            else if (rare.length < 5 && state.wave >= 7 && state.gold >= 3100) {
              const draw = send({ type: "draw", draw: "i002" });
              const landed = state.cards.find(card => card.id === draw?.createdId && card.slot === null);
              if (landed && (landed.card === chain.card || cardTemplates.get(landed.card)?.rarity === "R")) {
                send({ type: "pick-up-card", cardId: landed.id });
              }
            }
          }
        }
      }
    }
    const allowed = !needQualification || qualified(state, heroId);
    if (needQualification && allowed && !qualification) {
      const chain = qualificationChains.get(hero.qualification);
      const provider = state.structures.find(tower => tower.templateId === chain.requireUnit);
      qualification = { path: chain.id, providerId: provider.id, unit: provider.templateId, atUs: state.queue.nowUs, wave: state.wave };
      for (const card of state.cards.filter(card => card.slot !== null)) send({ type: "drop-card", cardId: card.id });
    }
    if (allowed && !obtained && (position || state.gold >= goldCost && state.lumber >= lumberCost)) {
      const itemId = shopping[position];
      const good = ordinaryGoods.get(itemId);
      const stockBefore = (state.shopRestock?.[itemId] ?? []).filter(time => time > state.queue.nowUs);
      if (stockBefore.length < good.stock) {
        const inventoryBefore = state.inventory.map(item => ({ id: item.id, itemId: item.itemId, charges: item.charges }));
        const balanceBefore = balances();
        const result = send({ type: "buy-item", itemId });
        const delivered = instance(result?.createdId);
        transactions.push({
          atUs: commands.at(-1).atUs, wave: state.wave, itemId, result,
          balanceBefore, balanceAfter: balances(), cost: { gold: good.gold, lumber: good.lumber },
          stockBefore, stockAfter: state.shopRestock?.[itemId],
          delivered: delivered && { id: delivered.id, itemId: delivered.itemId, charges: delivered.charges, slot: delivered.slot },
          consumedOrReduced: inventoryBefore.map(item => ({ ...item, remainingCharges: instance(item.id)?.charges }))
            .filter(item => item.remainingCharges !== item.charges),
        });
        if (!result?.ok) break;
        position++;
        if (position === shopping.length && delivered?.itemId === target) {
          obtained = { id: delivered.id, wave: state.wave, atUs: state.queue.nowUs, kind: mode };
          if (canMoveItem(target)) {
            const drop = send({ type: "drop-item", itemId: delivered.id });
            const pickup = drop?.ok && send({ type: "pick-up-item", itemId: delivered.id });
            logistics = { drop, pickup };
          }
        }
        if (position === shopping.length && !obtained) break;
      }
    }
    if (obtained) {
      const item = instance(obtained.id);
      if (followup === "inventory") {
        const copies = [item.id];
        for (let index = 0; index < 5; index++) {
          const restock = state.shopRestock.i208[0];
          advance((restock - state.queue.nowUs) / 1000);
          const result = send({ type: "buy-item", itemId: "i208" });
          if (!result?.ok) break;
          copies.push(result.createdId);
        }
        const before = balances();
        const purchase = { type: "buy-item", itemId: "i225" };
        const full = send(purchase);
        const after = balances();
        const dropped = send({ type: "drop-item", itemId: item.id });
        const afterDrop = send(purchase);
        const pickup = send({ type: "pick-up-item", itemId: item.id });
        fullPack = { copies, full, before, after, dropped, afterDrop, pickup, remainsOnGround: item.slot === null };
        break;
      }
      if (followup === "sale" && target === "i208") {
        const good = ordinaryGoods.get(target);
        const restockAtUs = state.shopRestock[target][0];
        const ordinary = sellTwice(item, good.shop);
        const buyAgain = { type: "buy-item", itemId: target };
        const soldOut = send(buyAgain);
        advance((restockAtUs - state.queue.nowUs) / 1000);
        const afterRestock = send(buyAgain);
        sale = { ordinary, restockAtUs, soldOut, afterRestock };
        break;
      }
      if (!hero || !item || !canMoveItem(target) || itemFields.get(target).Level > 3 && !qualified(state, heroId)) break;
      if (!equipped) {
        if (Math.hypot(hero.x - state.worker.x, hero.y - state.worker.y) > 1000) {
          send({ type: "move-worker", point: { x: hero.x, y: hero.y } });
        }
        const result = send({ type: "transfer-item", itemId: item.id, towerId: heroId });
        equipped = { result, retained: instance(item.id)?.towerId === heroId };
      }
      if (needQualification && target === "i282" && equipped.retained) {
        if (state.gold >= ordinaryGoods.get(target).gold && state.shopRestock[target].every(due => due <= state.queue.nowUs)) {
          const second = send({ type: "buy-item", itemId: target });
          const transferred = second?.ok && send({ type: "transfer-item", itemId: second.createdId, towerId: heroId });
          const extra = instance(second?.createdId);
          exclusion = { second, transferred, firstStillEquipped: instance(item.id)?.towerId === heroId,
            secondOnGround: extra?.slot === null, secondPoint: extra?.point };
          break;
        }
        advance(4000);
        continue;
      }
      const effectSample = followup === "effects" || needQualification;
      const targeted = effectSample && isTargetedEquipment(target);
      const contract = effectSample && contracts.has(target);
      if (!equipped.retained || !(active.has(target) || targeted || contract)) break;
      const enemy = targeted ? controlEquipmentTargets(state, heroId, target)[0] : undefined;
      if (targeted && !enemy) {
        advance(1000);
        continue;
      }
      const point = target === "i207" || target === "i230" ? { x: -288, y: 640 } : undefined;
      const before = { mana: hero.mana, position: { x: hero.x, y: hero.y }, charges: item.charges };
      let castItemId = item.id;
      if (contract) {
        const supportIds = ingredients("i193");
        const part = supportIds[supportPurchase];
        if (part) {
          const good = ordinaryGoods.get(part);
          if (state.gold >= good.gold && state.lumber >= good.lumber) {
            const purchase = send({ type: "buy-item", itemId: part });
            if (!purchase?.ok) break;
            supportPurchase++;
          }
          if (supportPurchase < supportIds.length) {
            advance(1000);
            continue;
          }
        }
        const support = state.inventory.find(entry => entry.itemId === "i193" && entry.slot !== null);
        if (!support) break;
        if (support.towerId !== heroId && !send({ type: "transfer-item", itemId: support.id, towerId: heroId })?.ok) break;
        castItemId = support.id;
      }
      const result = send({ type: "cast-equipment", itemId: castItemId, towerId: heroId, point, targetId: enemy?.id });
      if (result?.ok) {
        advance(150);
        use = { result, before, after: { mana: hero.mana, position: { x: hero.x, y: hero.y }, charges: instance(item.id)?.charges,
          immunity: hero.spellImmunity, soulRingReadyUs: hero.soulRingReadyUs, mirrorReadyUs: hero.mirrorReadyUs,
          createdIllusions: state.summons?.filter(unit => unit.summon?.ownerId === heroId &&
            unit.summon.illusion && unit.summon.skillId === target).map(unit => unit.id),
          summon: contract ? state.summons?.find(unit => unit.id === result.createdId)?.summon : undefined,
          soulBurn: enemy?.soulBurn,
        } };
        if (followup === "sale" && target === "i207") {
          const good = ordinaryGoods.get("i326");
          const purchase = send({ type: "buy-item", itemId: good.id });
          const potion = instance(purchase?.createdId);
          if (!potion) {
            sale = { purchase };
            break;
          }
          const delivery = send({ type: "transfer-item", itemId: potion.id, towerId: heroId });
          const spent = delivery?.ok && send({ type: "cast-equipment", itemId: potion.id, towerId: heroId });
          sale = { purchase, delivery, spent, ...(spent?.ok ? { rechargeAdjusted: sellTwice(potion, good.shop) } : {}) };
        }
        break;
      }
      if (!["resources", "cooldown"].includes(result?.reason)) break;
    }
    if (state.wave > lastDefenseWave && !position && state.enemies.length >= 18) {
      lastDefenseWave = state.wave;
      const tower = state.structures.find(canUpgrade);
      if (tower) send({ type: "upgrade-tower", towerId: tower.id });
    }
    // During procurement, check replenishment before paying for another copy of a component.
    advance(position ? 1000 : 4000);
  }
  const heroAssignment = state.structures.find(tower => tower.id === heroId)?.qualification;
  const workerPack = needQualification ? {
    items: state.inventory.filter(item => item.slot !== null && item.towerId === undefined),
    cards: state.cards.filter(card => card.slot !== null), books: state.books,
  } : undefined;
  return { route, seed, candidates: state.openingCandidates, opening, heroId, initialStateSha256,
    budget: { gold: goldCost, lumber: lumberCost }, shopping, commands, transactions, obtained, logistics,
    heroAssignment, qualification, equipped, use, sale, fullPack, exclusion, workerPack,
    status: obtained ? "acquired" : position === shopping.length ? "incorrect-output" : "not-acquired",
    end: { phase: state.phase, wave: state.wave, atUs: state.queue.nowUs, balances: balances(), result: state.result } };
}

console.log(JSON.stringify({
  policy, version: m3ContentVersion, configuration: m3ConfigVersion, source,
  scope: { targetIds: goods.size, vendorRoutes: allRoutes.filter(route => route.endsWith(":vendor")).length,
    recipeRoutes: allRoutes.filter(route => route.endsWith(":recipe")).length },
  samples: requested.flatMap(route => samples.map(seed => run(route, seed))),
}, null, 2));
