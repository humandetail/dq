import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("m3-phantom-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H035");
  hero.natural.INT = 300;
  const tower = { ...map.worker, id: 900, templateId: "H035", radius: 72, pending: null, qualification: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, id: 910, x: tower.x + 100, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

function castSpear(state, tower, enemy) {
  assert.ok(command(state, "spear", { type: "cast-hero", towerId: tower.id, skillId: "A122", targetId: enemy.id }).ok);
  const event = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(event.dueUs - state.queue.nowUs, 300_000);
  advance(state, event.dueUs);
  return event.dueUs;
}

function seedForAttack(...percentiles) {
  for (let seed = 0; ; seed++) {
    let rng = seed;
    let ok = true;
    for (const percentile of percentiles) {
      for (let draw = 0; draw < 5; draw++) rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      if (Math.floor(rng / 2 ** 32 * 100) + 1 !== percentile) {
        ok = false;
        break;
      }
    }
    if (ok) return seed;
  }
}

function queueStrike(state, tower, target, image) {
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: tower.id, sourceTemplate: tower.templateId, targetId: target.id, raw: 500,
    weapon: { ...weapons[tower.templateId][0], homing: false }, point: image ?? tower, destination: target,
    ...(image ? { summon: { id: image.id, point: image, banner: false, illusion: true, output: image.summon.output } } : {}),
  } });
}

test("Spear's three captured contacts can revisit the first target, and its replicas survive loading with separate lifetimes", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A122 = tower.hero.ranks.A123 = 1;
  tower.qualification = "P006";
  state.structures.push({ ...map.worker, x: tower.x + 700, id: 901, templateId: "n167", radius: 72, pending: null });
  state.inventory = [{ id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command(state, "scepter", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  const next = { ...enemy, id: 911, x: enemy.x + 399 };
  const beyond = { ...enemy, id: 912, x: enemy.x + 850 };
  state.enemies.push(next, beyond);
  const agility = tower.hero.natural.AGI;
  const at = castSpear(state, tower, enemy);
  advance(state, at + 100_000);
  assert.equal(state.summons.length, 1);
  assert.equal(state.summons[0].summon.phantom.counted, false);
  assert.equal(tower.hero.natural.AGI, agility + 20);
  assert.equal(enemy.phantomSlow.attackPenalty, .25);
  const saved = structuredClone(state);
  advance(saved, at + 898_003);
  assert.deepEqual(saved.recentHits.filter(hit => hit.sourceTemplate === "q029").map(hit => hit.targetId),
    [enemy.id, next.id, enemy.id]);
  assert.equal(saved.structures[0].hero.natural.AGI, agility + 60);
  assert.deepEqual(saved.summons.map(unit => unit.summon.skillId), ["T132", "T132", "T132"]);
  assert.deepEqual(saved.summons.map(unit => unit.summon.phantom.agility),
    [saved.summons[0].summon.phantom.agility, saved.summons[0].summon.phantom.agility + 20, saved.summons[0].summon.phantom.agility + 40]);
  advance(saved, at + 3_100_000);
  assert.equal(saved.structures[0].hero.natural.AGI, agility + 40);
  advance(saved, at + 3_898_003);
  assert.equal(saved.summons.length, 0);
  assert.equal(saved.structures[0].hero.natural.AGI, agility);
  assert.equal(saved.enemies[2].hp, beyond.maxHp);
});

test("The paid spear can be shielded, while a lethal unshielded hit still produces a replica at its corpse position", () => {
  for (const blocked of [true, false]) {
    const { state, tower, enemy } = fixture();
    tower.hero.ranks.A122 = 1;
    enemy.hp = 25;
    if (blocked) enemy.abilities = ["N535"];
    const at = castSpear(state, tower, enemy);
    advance(state, at + 100_000);
    if (blocked) {
      assert.equal(enemy.hp, 25);
      assert.ok(enemy.spellShieldReadyUs > at);
      assert.equal(state.summons, undefined);
    } else {
      assert.equal(enemy.hp, 0);
      assert.equal(state.summons.length, 1);
      assert.equal(state.summons[0].x, enemy.x);
      assert.equal(state.summons[0].focusTarget, undefined);
    }
  }
});

test("Juxtapose reserves one available place across simultaneous successful attacks and uses A124's inclusive bonus", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A123 = 1;
  tower.hero.ranks.A124 = 1;
  const agility = tower.hero.natural.AGI;
  state.randomState = seedForAttack(11, 11);
  queueStrike(state, tower, enemy);
  queueStrike(state, tower, enemy);
  advance(state, 1);
  assert.equal(state.summons.length, 1);
  assert.equal(state.summons[0].summon.phantom.counted, true);
  assert.equal(tower.hero.natural.AGI, agility + 20);
  advance(state, 10_000_001);
  assert.equal(tower.hero.natural.AGI, agility);
  state.randomState = seedForAttack(12);
  queueStrike(state, tower, enemy);
  advance(state, 10_000_002);
  assert.equal(state.summons.length, 0);
});

test("Real Manta illusions each take a fresh agility snapshot and deal divine damage from that actual snapshot", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A123 = 1;
  tower.qualification = "P006";
  state.structures.push({ ...map.worker, x: tower.x + 700, id: 901, templateId: "n167", radius: 72, pending: null });
  state.inventory = [{ id: 940, itemId: "i272", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command(state, "manta", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  const natural = tower.hero.natural.AGI;
  assert.ok(command(state, "cast-manta", { type: "cast-equipment", itemId: 940, towerId: tower.id }).ok);
  const [first, second] = state.summons;
  assert.equal(tower.hero.natural.AGI, natural + 40);
  assert.ok(!first.summon.phantom.counted && !second.summon.phantom.counted);
  assert.equal(second.summon.phantom.agility - first.summon.phantom.agility, 20);
  tower.hero.ranks.A124 = 6;
  state.randomState = seedForAttack(1);
  queueStrike(state, tower, enemy, first);
  advance(state, state.queue.nowUs + 1);
  assert.equal(state.summons.length, 2);
  assert.equal(first.summon.phantom.edgeRank, 0);
  assert.equal(state.recentHits[0].casterId, first.id);
  const firstDivine = state.recentHits[0].amount;
  state.randomState = seedForAttack(1);
  queueStrike(state, tower, enemy, second);
  advance(state, state.queue.nowUs + 1);
  const secondDivine = state.recentHits.filter(hit => hit.casterId === second.id)[0].amount;
  assert.ok(Math.abs(secondDivine / firstDivine - second.summon.phantom.agility / first.summon.phantom.agility) < 1e-9);
  advance(state, state.queue.nowUs + 7_000_000);
  assert.equal(state.summons.length, 0);
  assert.equal(tower.hero.natural.AGI, natural);
});

test("The first spear image applies the exact A124 2/3 threshold for its own spell-origin attacks", () => {
  for (const [percentile, expected] of [[2, 2], [3, 1]]) {
    const { state, tower, enemy } = fixture();
    tower.hero.ranks.A122 = tower.hero.ranks.A123 = tower.hero.ranks.A124 = 1;
    const at = castSpear(state, tower, enemy);
    advance(state, at + 100_000);
    const [spearImage] = state.summons;
    state.randomState = seedForAttack(percentile);
    queueStrike(state, tower, enemy, spearImage);
    advance(state, state.queue.nowUs + 1);
    assert.equal(state.summons.length, expected);
    assert.equal(state.summons.filter(unit => unit.summon.phantom.counted).length, expected - 1);
    assert.ok(state.recentHits.some(hit => hit.casterId === spearImage.id));
  }
});
