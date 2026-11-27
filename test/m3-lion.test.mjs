import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { effectiveMoveSpeed, movementRate } from "../src/game/m2/movement.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("m3-lion", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H061");
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H061", radius: 72, pending: null, population: 20,
    qualification: "P006", hero, autoModes: { A236: false, A237: false, A238: false } };
  state.structures = [tower];
  const template = state.enemies[0];
  const enemy = (id, dx, dy = 0, overrides = {}) => ({ ...template, id, x: tower.x + dx, y: tower.y + dy,
    speed: 0, hp: 100_000, maxHp: 100_000, armor: 0, abilities: [], ...overrides });
  state.enemies = [];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const cast = (skillId, selection) => {
    assert.ok(command(skillId + "-" + state.queue.nowUs, { type: "cast-hero", towerId: tower.id, skillId, ...selection }).ok);
    const effect = state.queue.nowUs + 400_000;
    advance(state, effect);
    return effect;
  };
  const scepter = () => {
    state.structures.push({ ...map.worker, x: tower.x + 4000, id: 901, templateId: "n167", pending: null });
    state.inventory.push({ id: 920, itemId: "i310", slot: 3, point: map.worker, charges: 0 });
    assert.ok(command("equip", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  };
  return { state, tower, enemy, command, cast, scepter };
}

test("A236 uses six fixed circles, hits once, and owns an independent 80-step pause", () => {
  const { state, tower, enemy, command } = fixture();
  tower.hero.ranks.A236 = 1;
  const target = enemy(21, 400, 0, { abilities: ["N535"] });
  const air = enemy(22, 600, 0, { layer: "fly", unitId: "echm" });
  const far = enemy(23, 1400);
  const outside = enemy(24, 1401);
  state.enemies = [outside, far, air, target];
  assert.ok(command("impale", { type: "cast-hero", towerId: tower.id, skillId: "A236", targetId: target.id }).ok);
  const effect = state.queue.nowUs + 400_000;
  target.y += 100;
  advance(state, effect - 1);
  assert.equal(state.recentHits, undefined);
  advance(state, effect);
  assert.deepEqual(state.battleAnimations.map(entry => [entry.unitId, entry.x - tower.x, entry.y]), [200, 400, 600, 800, 1000, 1200]
    .map(offset => ["ImpaleMissTarget", offset, tower.y]));
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.amount]), [[target.id, 264], [far.id, 264]]);
  assert.equal(target.spellShieldReadyUs, undefined);
  assert.ok(air.impaleLift);
  assert.equal(outside.impaleLift, undefined);
  target.speed = 250;
  assert.equal(movementRate(target, effect), 0);
  advance(state, effect + 20_000);
  assert.equal(target.impaleLift.height, 20);
  const save = JSON.parse(JSON.stringify(state));
  const restored = save.enemies.find(unit => unit.id === target.id);
  restored.stunUntilUs = effect + 2_000_000;
  advance(save, effect + 800_000);
  assert.equal(restored.impaleLift.height, 800);
  advance(save, effect + 1_580_000);
  assert.equal(restored.impaleLift.height, 20);
  advance(save, effect + 1_600_000);
  assert.equal(restored.impaleLift, undefined);
  assert.equal(restored.stunUntilUs, effect + 2_000_000);
});

test("A237 creates each T406 carrier, sets native form and independently reevaluates the tail radius", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A237 = 1;
  const target = enemy(21, 400);
  const shield = enemy(22, 600, 0, { abilities: ["N535"] });
  const immune = enemy(23, 700, 0, { abilities: ["Amim"] });
  const air = enemy(24, 800, 0, { layer: "fly", unitId: "echm" });
  const newcomer = enemy(25, 1001);
  state.enemies = [newcomer, air, immune, shield, target];
  const effect = cast("A237", { point: target });
  const carriers = state.queue.pending.filter(event => event.payload.type === "lion-carrier-expire");
  assert.deepEqual(carriers.map(event => [event.payload.targetId, event.payload.skillId, event.payload.mana, event.dueUs]),
    [21, 22, 23, 24].map(id => [id, "T406", 1000, effect + 1_000_000]));
  assert.equal(new Set(carriers.map(event => event.payload.sourceId)).size, carriers.length);
  assert.ok(carriers.every(event => event.payload.point.x === target.x));
  assert.equal(target.hexUntilUs, effect + 3_000_000);
  assert.equal(target.hexForm, "nsno");
  assert.ok(["npig", "nsea", "ncrb", "nhmc", "nrat", "nfro", "necr", "nrac"].includes(air.hexForm));
  target.speed = 250;
  assert.equal(effectiveMoveSpeed(target), 100);
  assert.equal(shield.hexUntilUs, undefined);
  assert.equal(shield.spellShieldReadyUs, effect + 6_000_000);
  assert.equal(immune.hexUntilUs, undefined);
  newcomer.x--;
  advance(state, effect + 199_999);
  assert.equal(state.recentHits, undefined);
  advance(state, effect + 200_000);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [21, 22, 23, 24, 25]);
  assert.ok(state.recentHits.every(hit => Math.abs(hit.amount - 1.4) < 1e-9));
  advance(state, effect + 1_000_000);
  assert.equal(target.hexUntilUs, effect + 3_000_000);
  advance(state, effect + 3_000_000);
  assert.equal(target.hexForm, undefined);
});

test("A237 latest BOhx owns expiry and an empty casting circle still issues the tail", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A237 = 1;
  const late = enemy(21, 601);
  state.enemies = [late];
  const effect = cast("A237", { point: tower });
  assert.equal(state.queue.pending.filter(event => event.payload.type === "lion-carrier-expire").length, 0);
  late.x--;
  scheduleEvent(state.queue, 1_000_000, { type: "hero-spell", towerId: tower.id, targetId: 0, skillId: "A237", point: map.worker });
  scheduleEvent(state.queue, 2_000_000, { type: "hero-spell", towerId: tower.id, targetId: 0, skillId: "A237", point: map.worker });
  advance(state, effect + 200_000);
  assert.equal(state.recentHits.at(-1).targetId, late.id);
  assert.equal(late.hexSourceId, undefined);
  advance(state, effect + 1_000_000);
  const oldHex = late.hexSourceId;
  assert.equal(late.hexUntilUs, effect + 4_000_000);
  advance(state, effect + 4_000_000);
  assert.notEqual(late.hexSourceId, oldHex);
  assert.equal(late.hexUntilUs, effect + 5_000_000);
  advance(state, effect + 5_000_000);
  assert.equal(late.hexSourceId, undefined);
});

test("A238 rewrites the actual q059 parent using rank-one max HP and rank-two current HP", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A238 = 1;
  const target = enemy(21, 500, 0, { hp: 10_000, maxHp: 20_000 });
  const nearby = enemy(22, 510);
  state.enemies = [nearby, target];
  const effect = cast("A238", { targetId: target.id });
  const carrier = state.queue.pending.find(event => event.payload.type === "lion-carrier-expire");
  assert.equal(carrier.dueUs, effect + 1_000_000);
  assert.equal(carrier.payload.mana, 1000);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.casterId, hit.ownerId, hit.sourceTemplate, hit.amount]),
    [[target.id, carrier.payload.sourceId, tower.id, "q059", 3850]]);
  assert.equal(tower.fingerStacks, undefined);
  tower.hero.ranks.A238 = 2;
  const challenge = enemy(23, 500, 0, { unitId: "m501", hp: 30_000, maxHp: 50_000 });
  state.enemies = [challenge];
  scheduleEvent(state.queue, 500_000, { type: "hero-spell", skillId: "A238", towerId: tower.id, targetId: challenge.id, point: map.worker });
  advance(state, effect + 500_000);
  assert.equal(state.recentHits.at(-1).amount, 2530);
});

test("A238 scepter candidates and N535 are per carrier, with live kill stacks and permanent cap", () => {
  const { state, tower, enemy, cast, scepter } = fixture();
  tower.hero.ranks.A238 = 1;
  scepter();
  tower.fingerStacks = 798;
  const normal = enemy(21, 420, 0, { hp: 100, maxHp: 100 });
  const boss = enemy(22, 400, 0, { unitId: "m501", abilities: ["N534"], hp: 100, maxHp: 100 });
  const shielded = enemy(23, 425, 0, { abilities: ["N535"] });
  const edge = enemy(24, 790, 0, { hp: 500_000, maxHp: 500_000 });
  const outside = enemy(25, 791);
  state.enemies = [outside, edge, shielded, boss, normal];
  const effect = cast("A238", { targetId: boss.id });
  assert.deepEqual(state.queue.pending.filter(event => event.payload.type === "lion-carrier-expire")
    .map(event => event.payload.targetId), [21, 22, 23, 24]);
  assert.equal(shielded.spellShieldReadyUs, effect + 6_000_000);
  assert.equal(tower.fingerStacks, 800);
  assert.equal(tower.fingerDisplayUntilUs, effect + 5_000_000);
  const anchor = { x: tower.x, y: tower.y };
  assert.deepEqual(tower.fingerDisplayPoint, anchor);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [21, 22, 24]);
  assert.ok(Math.abs(state.recentHits.at(-1).amount - (51_500 + 800 * 150) *
    (1 + (tower.hero.natural.INT + 40) / 1000)) < 1e-8);
  tower.x += 256;
  const save = JSON.parse(JSON.stringify(state));
  assert.deepEqual(save.structures[0].fingerDisplayPoint, anchor);
  advance(save, effect + 5_000_000);
  assert.equal(save.structures[0].fingerStacks, 800);
  assert.equal(save.recentHits.filter(hit => hit.deadUnitId).length, 2);
});

test("A238 grants no stack until the original q059 packet gets past actual death protection", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A238 = 1;
  const protectedEnemy = enemy(21, 500, 0, { hp: 120, maxHp: 120, abilities: ["N521", "T045"] });
  state.enemies = [protectedEnemy];
  const effect = cast("A238", { targetId: protectedEnemy.id });
  assert.equal(protectedEnemy.graveUntilUs, effect + 6_000_000);
  assert.equal(protectedEnemy.hp, 120);
  assert.equal(tower.fingerStacks, undefined);
  assert.equal(tower.fingerDisplayUntilUs, undefined);
  advance(state, effect + 20_000_000);
  const kill = cast("A238", { targetId: protectedEnemy.id });
  assert.equal(state.enemies.includes(protectedEnemy), false);
  assert.equal(tower.fingerStacks, 1);
  assert.equal(tower.fingerDisplayUntilUs, kill + 5_000_000);
});
