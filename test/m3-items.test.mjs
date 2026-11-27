import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { ordinaryGoods, recipes } from "../src/game/m2/content.ts";
import { physicalDamage, weapons } from "../src/game/m2/combat.ts";
import { map } from "../src/game/m2/map.ts";
import { artilleryItems, drain, enqueue, itemSaleQuote, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.clock.targetUs + 1);
  const result = state.commandResults[id];
  assert.ok(result?.ok, `${id}: ${JSON.stringify(result)}`);
  return result;
}

test("L05 pawns a bought instance once at the real vendor without changing other resources or stock", () => {
  const state = newMatch("m3-pawn", 47);
  const { shop } = ordinaryGoods.get("i101");
  const { createdId } = command(state, "buy", { type: "buy-item", itemId: "i101" });
  const item = state.inventory.find(item => item.id === createdId);
  assert.equal(itemSaleQuote(state, item, shop), 312);
  assert.equal(itemSaleQuote(state, item, "挑战商店"), undefined);
  const { gold, lumber, activityScore } = state;
  const stock = structuredClone(state.shopRestock);
  for (const id of ["sale", "repeat"]) {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action: { type: "sell-item", itemId: item.id, shop } }));
  }
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, state.queue.nowUs + 1);
  assert.equal(restored.commandResults.sale.ok, true);
  assert.equal(restored.commandResults.repeat.ok, false);
  assert.equal(restored.gold, gold + 312);
  assert.equal(restored.lumber, lumber);
  assert.equal(restored.activityScore, activityScore);
  assert.deepEqual(restored.shopRestock, stock);
  assert.ok(!restored.inventory.some(entry => entry.id === item.id));
});

test("L05 settles current charges and instance permission at commit time", () => {
  const state = newMatch("m3-pawn-charges", 47);
  const shop = ordinaryGoods.get("i101").shop;
  const staff = { id: state.nextId++, itemId: "i207", slot: 5, point: state.worker, charges: 1 };
  state.inventory.push(staff);
  assert.equal(itemSaleQuote(state, staff, shop), 450);
  assert.ok(enqueue(state, { id: "pawn", matchId: state.matchId, action: { type: "sell-item", itemId: staff.id, shop } }));
  staff.charges = 3;
  const gold = state.gold;
  advance(state, 1);
  assert.equal(state.gold - gold, 1350);
  assert.equal(itemSaleQuote(state, { ...staff, pawnable: false }, shop), undefined);
  assert.equal(itemSaleQuote(state, { ...staff, slot: null }, shop), undefined);
  assert.equal(itemSaleQuote(state, { ...staff, towerId: 77 }, shop), undefined);
});

test("Soul Ring is bought as ordinary materials, crafted, and repaid after transfer and snapshot", () => {
  const state = newMatch("m3-soul-ring", 47);
  const gift = state.inventory.find(item => item.itemId === "i004");
  command(state, "open", { type: "use-item", itemId: gift.id });
  const card = command(state, "choose", { type: "choose-opening", card: state.openingCandidates[0] });
  const built = command(state, "deploy", {
    type: "build-card", cardId: card.createdId, point: { x: -288, y: -160 },
  });
  advance(state, 1_000_004);
  const tower = state.structures.find(unit => unit.id === built.createdId);
  assert.ok(tower.hero && !tower.pending);
  const before = state.gold;
  for (const itemId of ["i239", "i101"]) {
    const purchase = command(state, "buy-" + itemId, { type: "buy-item", itemId });
    command(state, "give-" + itemId, { type: "transfer-item", itemId: purchase.createdId, towerId: tower.id });
  }
  const last = command(state, "buy-i190", { type: "buy-item", itemId: "i190" });
  const craft = command(state, "combine", { type: "transfer-item", itemId: last.createdId, towerId: tower.id });
  assert.equal(state.gold, before - 1325);
  assert.equal(state.inventory.find(item => item.id === craft.createdId).itemId, "i238");
  assert.ok(!state.inventory.some(item => ["i239", "i101", "i190"].includes(item.itemId)));
  assert.equal(state.inventory.find(item => item.id === craft.createdId).towerId, tower.id);
  command(state, "borrow", { type: "cast-equipment", itemId: craft.createdId, towerId: tower.id });
  const equippedRate = tower.manaRegen;
  const payment = state.queue.pending.find(event => event.payload.type === "mana-debt");
  assert.equal(payment.payload.towerId, tower.id);
  assert.ok(payment.payload.amount > 0 && payment.payload.amount <= 250);
  assert.equal(payment.dueUs, state.queue.nowUs + 7_000_000);
  command(state, "remove", { type: "transfer-item", itemId: craft.createdId });
  assert.ok(Math.abs(tower.manaRegen * 1.7 - equippedRate) < 1e-9);
  const restored = structuredClone(state);
  const restoredTower = restored.structures.find(unit => unit.id === built.createdId);
  advance(restored, payment.dueUs);
  assert.ok(!restored.queue.pending.some(event => event.payload.type === "mana-debt"));
  assert.ok(restoredTower.mana <= restoredTower.manaMaximum - payment.payload.amount);
});

test("Dragon Lance retains both copies of its repeated recipe material and expands artillery range", () => {
  assert.deepEqual(recipes.get("i282"), ["i283", "i204", "i110", "i110"]);
  assert.equal(ordinaryGoods.get("i282").gold, 10600);
  assert.equal(ordinaryGoods.get("i283").gold, 5000);
  const state = newMatch("m3-lance-controlled-range", 47);
  const tower = { id: 900, x: 0, y: 0, templateId: "n156", radius: 72, qualification: null, pending: null };
  // A controlled artillery boundary fixture isolates the shared weapon range hook.
  state.structures = [tower];
  state.inventory = [
    { id: 901, itemId: "i282", slot: 0, towerId: tower.id, point: tower, charges: 0 },
    { id: 902, itemId: "i110", slot: null, point: { x: 1200, y: 0 }, charges: 0 },
    { id: 903, itemId: "i110", slot: null, point: { x: 1201, y: 0 }, charges: 0 },
  ];
  assert.deepEqual(artilleryItems(state, tower.id).map(item => item.id), [902]);
  command(state, "fire", { type: "attack-ground-item", towerId: tower.id, objectId: 902 });
  const restored = structuredClone(state);
  const [restoredTower] = restored.structures;
  advance(restored, restoredTower.attack.timing.windup.dueUs);
  const impact = restored.queue.pending.find(event => event.payload.type === "weapon-impact");
  assert.deepEqual(impact.payload.shot.destination, { x: 1200, y: 0 });
  command(restored, "remove-lance", { type: "transfer-item", itemId: 901 });
  assert.deepEqual(artilleryItems(restored, tower.id), []);
});

test("Black King Bar pays mana once, blocks hostile control, and expires after a saved handoff", () => {
  assert.deepEqual(recipes.get("i232"), ["i233", "i110", "i176"]);
  assert.equal(ordinaryGoods.get("i233").gold, 2150);
  const state = newMatch("m3-bkb-controlled-effects", 47);
  const gift = state.inventory.find(item => item.itemId === "i004");
  command(state, "open", { type: "use-item", itemId: gift.id });
  const chosen = command(state, "choose", { type: "choose-opening", card: state.openingCandidates[0] });
  const built = command(state, "deploy", {
    type: "build-card", cardId: chosen.createdId, point: { x: -288, y: -160 },
  });
  advance(state, 1_000_004);
  const tower = state.structures.find(unit => unit.id === built.createdId);
  // Controlled effect coverage. Normal equipment acquisition has its own acceptance case.
  state.inventory = [{ id: 900, itemId: "i232", slot: 0, towerId: tower.id, point: tower, charges: 0 }];
  command(state, "protect", { type: "cast-equipment", itemId: 900, towerId: tower.id });
  const castUs = state.queue.nowUs;
  assert.equal(tower.mana, tower.manaMaximum - 50);
  assert.equal(tower.blackKingBarReadyUs, castUs + 30_000_000);
  assert.deepEqual(tower.spellImmunity, {
    sourceId: tower.spellImmunity.sourceId, carrierUntilUs: castUs + 1_000_000, untilUs: castUs + 6_000_000,
  });
  assert.notEqual(tower.spellImmunity.sourceId, tower.id);
  command(state, "remove-bkb", { type: "transfer-item", itemId: 900 });

  const enemy = {
    ...map.worker, id: 901, unitId: "m020", layer: "walk", hp: 100_000, maxHp: 100_000,
    mana: 200, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: ["N514"], wave: 24,
  };
  state.enemies.push(enemy);
  scheduleEvent(state.queue, 2, { type: "enemy-cast", enemyId: enemy.id, skill: "N514", point: tower });
  advance(state, state.queue.nowUs + 2);
  assert.equal(tower.stunnedUntilUs, undefined);

  const restored = structuredClone(state);
  const [restoredTower] = restored.structures;
  const expiry = tower.spellImmunity.untilUs;
  assert.deepEqual(restoredTower.spellImmunity, tower.spellImmunity);
  scheduleEvent(restored.queue, expiry - restored.queue.nowUs, {
    type: "enemy-cast", enemyId: enemy.id, skill: "N514", point: restoredTower,
  });
  advance(restored, expiry);
  assert.equal(restoredTower.spellImmunity, undefined);
  assert.equal(restoredTower.stunnedUntilUs, expiry + 1_200_000);
  assert.equal(restoredTower.blackKingBarReadyUs, castUs + 30_000_000);
});

test("Force Staff uses bought materials, replaces an invalid cast's item, then teleports after a snapshot", () => {
  const state = newMatch("m3-force-staff", 47);
  const gift = state.inventory.find(item => item.itemId === "i004");
  command(state, "open", { type: "use-item", itemId: gift.id });
  const chosen = command(state, "choose", { type: "choose-opening", card: state.openingCandidates[0] });
  const built = command(state, "deploy", {
    type: "build-card", cardId: chosen.createdId, point: { x: -288, y: -160 },
  });
  advance(state, 1_000_004);
  const tower = state.structures.find(unit => unit.id === built.createdId);
  const before = state.gold;
  const book = command(state, "buy-recipe", { type: "buy-item", itemId: "i208" });
  command(state, "give-recipe", { type: "transfer-item", itemId: book.createdId, towerId: tower.id });
  const component = command(state, "buy-i122", { type: "buy-item", itemId: "i122" });
  const staff = command(state, "combine", { type: "transfer-item", itemId: component.createdId, towerId: tower.id });
  assert.equal(state.gold, before - 900);
  assert.equal(state.inventory.find(item => item.id === staff.createdId).itemId, "i207");

  const refund = command(state, "invalid-terrain", {
    type: "cast-equipment", towerId: tower.id, itemId: staff.createdId, point: { x: 500, y: 0 },
  });
  assert.notEqual(refund.createdId, staff.createdId);
  assert.ok(!state.inventory.some(item => item.id === staff.createdId));
  assert.equal(state.inventory.find(item => item.id === refund.createdId).charges, 1);
  assert.equal(tower.teleportTimer, undefined);
  assert.deepEqual([tower.x, tower.y], [-288, -160]);

  advance(state, tower.teleportReadyUs.i207);
  const destination = { x: -288, y: 640 };
  command(state, "valid-terrain", {
    type: "cast-equipment", towerId: tower.id, itemId: refund.createdId, point: destination,
  });
  assert.ok(!state.inventory.some(item => item.id === refund.createdId));
  assert.deepEqual([tower.x, tower.y], [-288, -160]);
  const restored = structuredClone(state);
  advance(restored, state.queue.nowUs + 100_000);
  const [after] = restored.structures;
  assert.deepEqual([after.x, after.y], [destination.x, destination.y]);
  assert.equal(after.teleportTimer, undefined);
});

test("Boots of Travel replaces the same tower's queued Force Staff cast and has its own cooldown", () => {
  assert.deepEqual(recipes.get("i230"), ["i231", "i207", "i207"]);
  assert.equal(ordinaryGoods.get("i230").gold, 4100);
  const state = newMatch("m3-travel-boots-controlled", 47);
  const gift = state.inventory.find(item => item.itemId === "i004");
  command(state, "open", { type: "use-item", itemId: gift.id });
  const chosen = command(state, "choose", { type: "choose-opening", card: state.openingCandidates[0] });
  const built = command(state, "deploy", {
    type: "build-card", cardId: chosen.createdId, point: { x: -288, y: -160 },
  });
  advance(state, 1_000_004);
  const [tower] = state.structures;
  state.inventory = ["i207", "i230"].map((itemId, slot) => ({
    id: 900 + slot, itemId, slot, towerId: tower.id, point: tower, charges: slot === 0 ? 1 : 0,
  }));
  command(state, "staff", {
    type: "cast-equipment", towerId: tower.id, itemId: 900, point: { x: -288, y: 640 },
  });
  const firstTimer = tower.teleportTimer;
  const staffReady = tower.teleportReadyUs.i207;
  command(state, "boots", {
    type: "cast-equipment", towerId: tower.id, itemId: 901, point: { x: 288, y: 160 },
  });
  assert.notEqual(tower.teleportTimer, firstTimer);
  assert.ok(!state.queue.pending.some(event => event.timerId === firstTimer));
  assert.equal(tower.teleportReadyUs.i207, staffReady);
  assert.equal(tower.teleportReadyUs.i230, state.queue.nowUs + 25_000_000);
  advance(state, state.queue.nowUs + 100_000);
  assert.deepEqual([tower.x, tower.y], [288, 160]);
  assert.ok(state.inventory.some(item => item.id === 901));
});

test("Bloodthorn shares Orchid cooldown and settles exactly one final-damage window after handoff", () => {
  const state = newMatch("m3-soul-burn-controlled", 47);
  const gift = state.inventory.find(item => item.itemId === "i004");
  command(state, "open", { type: "use-item", itemId: gift.id });
  const chosen = command(state, "choose", { type: "choose-opening", card: state.openingCandidates[0] });
  const built = command(state, "deploy", {
    type: "build-card", cardId: chosen.createdId, point: { x: -288, y: -160 },
  });
  advance(state, 1_000_004);
  const [caster] = state.structures;
  const enemy = {
    ...map.worker, x: caster.x + 700, id: 910, unitId: "m026", layer: "ground", hp: 10000, maxHp: 10000,
    mana: 500, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: ["N517"], wave: 30,
  };
  state.enemies.push(enemy);
  state.inventory = ["i226", "i224"].map((itemId, slot) => ({
    id: 900 + slot, itemId, slot, towerId: caster.id, point: caster, charges: 0,
  }));
  enemy.spellCastingUntilUs = state.queue.nowUs + 300_000;
  const windup = scheduleEvent(state.queue, 300_000, { type: "enemy-cast", enemyId: enemy.id, skill: "N517", point: enemy });
  command(state, "bloodthorn", { type: "cast-equipment", towerId: caster.id, itemId: 900, targetId: enemy.id });
  const effectUs = state.queue.nowUs;
  assert.equal(caster.manaMaximum - caster.mana, 70);
  assert.equal(caster.soulBurnReadyUs, effectUs + 25_000_000);
  assert.ok(!state.queue.pending.some(event => event.timerId === windup));
  assert.equal(enemy.soulBurn.untilUs, effectUs + 5_000_000);
  assert.ok(enqueue(state, { id: "orchid", matchId: state.matchId,
    action: { type: "cast-equipment", towerId: caster.id, itemId: 901, targetId: enemy.id } }));
  advance(state, state.queue.nowUs + 1);
  assert.deepEqual(state.commandResults.orchid, { ok: false, reason: "cooldown" });

  const attacker = { ...map.worker, id: 911, templateId: "n001", qualification: null, pending: null };
  state.structures.push(attacker);
  const shot = { towerId: attacker.id, sourceTemplate: "n001", targetId: enemy.id,
    weapon: { ...weapons.n001[0], attackType: "chaos", homing: false },
    raw: 100, point: enemy, destination: enemy };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
  advance(state, state.queue.nowUs + 1);
  assert.equal(enemy.hp, 9850);
  assert.equal(enemy.soulBurn.total, 150);
  assert.equal(enemy.spellCastingUntilUs, undefined);
  // Remove the original caster before the prior window's same-unit timeout.
  state.structures = [];
  const restored = structuredClone(state);
  advance(restored, effectUs + 5_000_000);
  assert.equal(restored.enemies[0].hp, 9805);
  assert.equal(restored.enemies[0].soulBurn, undefined);
  assert.equal(restored.recentHits.at(-1).casterId, caster.id);
  assert.equal(restored.recentHits.at(-1).ownerId, undefined);
});

test("Mirror items snapshot their count, output, independent lifetime and common cooldown", () => {
  for (const [id, count, output, mana] of [["i272", 2, .5, 100], ["i274", 1, .3, 60]]) {
    const state = newMatch("m3-mirrors-" + id, 47);
    const gift = state.inventory.find(item => item.itemId === "i004");
    command(state, "open", { type: "use-item", itemId: gift.id });
    const chosen = command(state, "choose", { type: "choose-opening", card: state.openingCandidates[0] });
    const built = command(state, "deploy", {
      type: "build-card", cardId: chosen.createdId, point: { x: -288, y: -160 },
    });
    advance(state, 1_000_004);
    const [tower] = state.structures;
    tower.hero.ranks.A225 = 1;
    state.inventory = [id, id === "i272" ? "i274" : "i272", "i213"].map((itemId, slot) => ({
      id: 900 + slot, itemId, slot, towerId: tower.id, point: tower, charges: 0,
    }));
    command(state, "mirror", { type: "cast-equipment", towerId: tower.id, itemId: 900 });
    const at = state.queue.nowUs;
    assert.equal(tower.manaMaximum - tower.mana, mana);
    assert.equal(tower.mirrorReadyUs, at + 15_000_000);
    const images = state.summons;
    assert.equal(images.length, count);
    for (const image of images) {
      assert.equal(image.summon.output, output);
      assert.equal(image.summon.damageTaken, 1);
      assert.deepEqual(image.summon.criticalItems, ["i213"]);
      assert.equal(image.life.maximum, tower.life.maximum + 1000);
    }
    assert.equal(new Set(images.map(unit => unit.id)).size, count);
    assert.ok(enqueue(state, { id: "other-item", matchId: state.matchId,
      action: { type: "cast-equipment", towerId: tower.id, itemId: 901 } }));
    advance(state, state.queue.nowUs + 1);
    assert.deepEqual(state.commandResults["other-item"], { ok: false, reason: "cooldown" });
    command(state, "return-critical", { type: "transfer-item", itemId: 902 });
    assert.ok(images.every(image => image.summon.criticalItems.includes("i213")));
    const restored = structuredClone(state);
    advance(restored, at + 6_999_999);
    assert.equal(restored.summons.length, count);
    advance(restored, at + 7_000_000);
    assert.deepEqual(restored.summons, []);
  }
});

test("Red summon contract replaces the parent with separate armor-ignoring child packets", () => {
  const state = newMatch("m3-red-summon-contract-controlled", 47);
  const owner = { ...map.worker, id: 900, templateId: "n001", qualification: null, pending: null };
  const source = { ...map.worker, id: 901, templateId: "n144", qualification: null, pending: null,
    summon: { ownerId: owner.id, attack: 0, speed: 0, red: 1, green: 0, blue: 0 } };
  state.structures = [owner];
  state.summons = [source];
  const near = {
    ...map.worker, x: map.worker.x + 500, id: 910, unitId: "m001", layer: "ground", hp: 10000,
    maxHp: 10000, mana: 0, armor: 100, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1,
  };
  const side = { ...near, id: 911, x: near.x + 300, armor: 200 };
  const outside = { ...near, id: 912, x: near.x + 301, armor: 200 };
  state.enemies = [side, near, outside];
  const shot = { towerId: owner.id, sourceTemplate: source.templateId, targetId: near.id,
    summon: { id: source.id, banner: false }, raw: 280, point: near, destination: near,
    weapon: { ...weapons[source.templateId][0], attackType: "chaos", homing: false } };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
  advance(state, 1);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [near.id, side.id]);
  assert.ok(Math.abs(10000 - near.hp - physicalDamage(224, "hero", 70, false)) < 1e-8);
  assert.ok(Math.abs(10000 - side.hp - physicalDamage(224, "hero", 140, false)) < 1e-8);
  assert.equal(outside.hp, 10000);
});
