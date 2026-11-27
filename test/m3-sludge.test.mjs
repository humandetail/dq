import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function setup() {
  const state = newMatch("m3-sludge", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const baseEnemy = state.enemies[0];
  const enemy = (id, x, overrides = {}) => ({ ...baseEnemy, id, x: map.worker.x + x, y: map.worker.y,
    speed: 0, hp: 100_000, maxHp: 100_000, abilities: [], ...overrides });
  const tower = (id, templateId, x = 0) => ({ ...map.worker, x: map.worker.x + x, id, templateId, population: 5,
    radius: 72, pending: null, qualification: null, attack: { readyUs: Number.MAX_SAFE_INTEGER } });
  const send = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  return { state, enemy, tower, send };
}

test("disease clouds independently infect eligible ground units and restore tick order", () => {
  const { state, enemy, tower } = setup();
  state.structures = [tower(901, "n197"), tower(900, "n196")];
  const target = enemy(101, 500, { abilities: ["Amim"] });
  state.enemies = [enemy(105, 501), enemy(104, 450, { unitId: "uabo" }),
    enemy(103, 470, { abilities: ["Aeth"] }), enemy(102, 470, { unitId: "m888", layer: "fly" }), target];
  scheduleEvent(state.queue, 0, { type: "movement" });
  advance(state, 1);
  assert.deepEqual(Object.keys(target.diseaseClouds), ["900", "901"]);
  assert.ok(state.enemies.slice(0, 4).every(unit => unit.diseaseClouds === undefined));
  target.x += 100;
  const checkpoint = JSON.parse(JSON.stringify(state));
  advance(checkpoint, 1_000_000);
  assert.equal(checkpoint.recentHits?.length ?? 0, 0);
  advance(checkpoint, 1_000_001);
  assert.deepEqual(checkpoint.recentHits.map(({ casterId, amount }) => [casterId, amount]), [[900, 12], [901, 24]]);
  advance(checkpoint, 100_000_001);
  assert.deepEqual(checkpoint.enemies.find(unit => unit.id === 101).diseaseClouds, {});
  assert.equal(checkpoint.enemies.find(unit => unit.id === 101).hp, 96_400);
});

test("disease caps at two life before event modifiers and recycling immediately removes its infections", () => {
  const { state, enemy, tower, send } = setup();
  const target = enemy(101, 10, { hp: 7, maxHp: 7 });
  state.structures = [tower(900, "n196")];
  state.population = 5;
  state.enemies = [target];
  scheduleEvent(state.queue, 0, { type: "movement" });
  advance(state, 1_000_001);
  assert.equal(target.hp, 2);
  advance(state, 2_000_001);
  assert.equal(state.recentHits.length, 1);
  assert.equal(send("recycle", { type: "recycle-tower", towerId: 900 }).ok, true);
  assert.deepEqual(target.diseaseClouds, {});
  advance(state, 3_000_001);
  assert.equal(state.recentHits.length, 1);
});

test("N133 buffs actual physical damage at 500 once, even with two sources, and stops when they leave", () => {
  const { state, enemy, tower, send } = setup();
  const actor = tower(900, "n001");
  state.structures = [actor, tower(901, "n198", 500), tower(902, "n198", 200)];
  state.enemies = [enemy(101, 0)];
  const impact = () => {
    const shot = { towerId: 900, sourceTemplate: actor.templateId, targetId: 101, raw: 100,
      weapon: { ...weapons.n001[0], attackType: "chaos" }, point: map.worker, destination: map.worker };
    scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
    advance(state, state.queue.nowUs + 1);
    return state.recentHits.at(-1).amount;
  };
  assert.ok(Math.abs(impact() - 110) < 1e-6);
  assert.ok(send("recycle-first", { type: "recycle-tower", towerId: 902 }).ok);
  assert.ok(Math.abs(impact() - 110) < 1e-6);
  state.structures[1].x += 1;
  assert.equal(impact(), 100);
});

test("N093/N095 refresh and stack their damage but not attack slow, preserving phases through restore", () => {
  const { state, enemy, tower } = setup();
  const first = tower(900, "n219");
  const second = tower(901, "n220");
  state.structures = [first, second];
  const target = enemy(101, 0, { abilities: ["Amim"] });
  state.enemies = [target];
  const shot = actor => ({ towerId: actor.id, sourceTemplate: actor.templateId, targetId: target.id, raw: 10,
    weapon: { ...weapons[actor.templateId][0], attackType: "chaos" }, point: map.worker, destination: map.worker });
  scheduleEvent(state.queue, 0, { type: "weapon-impact", shot: shot(first), travelUs: 0 });
  scheduleEvent(state.queue, 100_000, { type: "weapon-impact", shot: shot(second), travelUs: 0 });
  scheduleEvent(state.queue, 250_000, { type: "weapon-impact", shot: shot(first), travelUs: 0 });
  advance(state, 300_000);
  assert.deepEqual(target.poisonAttackSlow, { amount: .2, expiresUs: 5_250_001 });
  assert.deepEqual(Object.values(target.poison).map(({ nextUs, expiresUs, skillId }) => [nextUs, expiresUs, skillId]),
    [[1_000_001, 5_250_001, "N093"], [1_100_001, 5_100_001, "N095"]]);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, 1_100_001);
  assert.deepEqual(restored.recentHits.slice(3).map(({ amount, casterId }) => [amount, casterId]), [[60, 900], [180, 901]]);
  advance(restored, 5_250_001);
  assert.equal(restored.enemies[0].poison, undefined);
  assert.equal(restored.enemies[0].poisonAttackSlow, undefined);
  assert.equal(restored.recentHits.length, 13);
});

test("N093/N095 never poison secondary, ethereal or dead targets, and drop on source recycle", () => {
  const { state, enemy, tower, send } = setup();
  const first = tower(900, "n219");
  state.structures = [first];
  state.population = 5;
  const hits = [enemy(101, 0), enemy(102, 0), enemy(103, 0, { abilities: ["Aeth"] }),
    enemy(104, 0, { hp: 7, maxHp: 7 })];
  state.enemies = hits;
  for (const target of hits) {
    const shot = { towerId: first.id, sourceTemplate: first.templateId, targetId: target.id, raw: 10,
      weapon: { ...weapons.n219[0], attackType: "chaos" }, point: map.worker, destination: map.worker,
      secondary: target.id === 102 };
    scheduleEvent(state.queue, 0, { type: "weapon-impact", shot, travelUs: 0 });
  }
  advance(state, 1);
  assert.ok(hits[0].poison);
  assert.equal(hits[1].poison, undefined);
  assert.equal(hits[2].poison, undefined);
  assert.ok(!state.enemies.includes(hits[3]));
  assert.ok(send("recycle-poison", { type: "recycle-tower", towerId: first.id }).ok);
  assert.equal(hits[0].poison, undefined);
  advance(state, 2_000_001);
  assert.ok(!state.recentHits.some(hit => hit.atUs > 1));
});

test("N135 buffs actual divine direct damage and ignores temporary sources and physical packets", () => {
  const { state, enemy, tower } = setup();
  const actor = tower(900, "n001");
  actor.treeGrab = { readyUs: 0, cleaveUntilUs: 50_000, strength: {} };
  const emitter = tower(901, "n220", 499);
  state.structures = [actor, emitter];
  const target = enemy(101, 0);
  const bystander = enemy(102, 1);
  state.enemies = [target, bystander];
  const shot = () => ({ towerId: 900, sourceTemplate: actor.templateId, targetId: target.id, raw: 100,
    weapon: { ...weapons.n001[0], attackType: "chaos" }, point: map.worker, destination: map.worker });
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot: shot(), travelUs: 0 });
  advance(state, 2);
  assert.deepEqual(state.recentHits.map(({ targetId, amount }) => [targetId, Math.round(amount)]), [[102, 55], [101, 100]]);
  scheduleEvent(state.queue, 1, { type: "spell-sweep", sweep: {
    ...map.worker, name: "i322", towerId: actor.id, sourceId: 930, dx: 1, dy: 0, speed: 2500, range: 900,
    radiusStart: 300, radiusEnd: 300, amount: 10, traveled: 0, hit: [], targets: ["ground"],
  } });
  advance(state, 3);
  const damageWithAura = state.recentHits.findLast(hit => hit.targetId === target.id).amount;
  emitter.x += 2;
  scheduleEvent(state.queue, 1, { type: "spell-sweep", sweep: {
    ...map.worker, name: "i322", towerId: actor.id, sourceId: 931, dx: 1, dy: 0, speed: 2500, range: 900,
    radiusStart: 300, radiusEnd: 300, amount: 10, traveled: 0, hit: [], targets: ["ground"],
  } });
  advance(state, 4);
  const damageWithoutAura = state.recentHits.findLast(hit => hit.targetId === target.id).amount;
  assert.equal(damageWithAura, damageWithoutAura);
});
