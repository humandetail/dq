import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, heroAllySpellTargets, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture(templateId = "H018") {
  const state = newMatch("m3-ogre", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const tower = (id, templateId, dx = 0) => ({ ...map.worker, x: map.worker.x + dx, id, templateId, population: 5,
    radius: 72, pending: null, qualification: null });
  const actor = tower(900, templateId);
  if (templateId === "H018") {
    actor.hero = newHero("H005");
    actor.hero.natural = { STR: 0, AGI: 0, INT: 100 };
  }
  state.structures = [actor];
  const enemy = state.enemies[0];
  Object.assign(enemy, { x: actor.x + 300, y: actor.y, speed: 0, armor: 0, hp: 100_000, maxHp: 100_000, abilities: [] });
  state.enemies = [enemy];
  function command(id, action) {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  }
  return { state, actor, tower, enemy, command };
}

function seedFor(roll) {
  for (let seed = 0; ; seed++) {
    const value = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    if (Math.floor(value / 2 ** 32 * 100) + 1 === roll) return seed;
  }
}

test("N089–92 share latest Bloodlust, start after real windup, consume mana once and expire", () => {
  for (const [index, amount] of [.2, .3, .4, .5].entries()) {
    const { state, actor, tower, command } = fixture("n" + (214 + index));
    const ally = tower(901, "n001", 576);
    state.structures.push(ally);
    const skillId = "N0" + (89 + index);
    assert.ok(command(skillId, { type: "cast-tower", towerId: actor.id, skillId, targetId: ally.id }).ok);
    advance(state, 560_001);
    assert.equal(ally.bloodlust, undefined);
    advance(state, 560_002);
    assert.equal(actor.manaMaximum - actor.mana, 30);
    assert.equal(actor.towerSpellReady[skillId], 2_560_002);
    assert.deepEqual(ally.bloodlust, { untilUs: 5_560_002, amount });
    const restored = JSON.parse(JSON.stringify(state));
    advance(restored, 5_560_002);
    assert.equal(restored.structures[1].bloodlust, undefined);
  }
});

test("native Bloodlust chooses the nearest active ally before the caster, ignores a nearer idle ally and can be disabled", () => {
  const { state, actor, tower, enemy } = fixture("n214");
  const idle = tower(901, "n001", 40);
  const active = tower(902, "n001", 100);
  active.attack = { targetId: enemy.id, winding: false, readyUs: Number.MAX_SAFE_INTEGER };
  state.structures.push(idle, active);
  scheduleEvent(state.queue, 0, { type: "bloodlust-scan", towerId: actor.id });
  advance(state, 560_001);
  assert.equal(idle.bloodlust, undefined);
  assert.equal(actor.bloodlust, undefined);
  assert.equal(active.bloodlust.amount, .2);
  actor.autoModes = { nativeBloodlust: false };
  advance(state, 11_500_000);
  assert.equal(active.bloodlust, undefined);
});

test("A058 multicast reads the live rank for additional T053, uses its own source and survives reload", () => {
  const { state, actor, enemy, command } = fixture();
  actor.hero.ranks = { A058: 1, A060: 1 };
  state.randomState = seedFor(100);
  assert.ok(command("blast", { type: "cast-hero", towerId: actor.id, skillId: "A058", targetId: enemy.id }).ok);
  advance(state, 300_002);
  assert.equal(actor.manaMaximum - actor.mana, 50);
  assert.equal(actor.heroSpellReady.A058, 12_300_002);
  assert.deepEqual(actor.ogreMulticast, { count: 2, atUs: 300_002 });
  const resumed = JSON.parse(JSON.stringify(state));
  resumed.structures[0].hero.ranks.A058 = 2;
  advance(resumed, 399_000);
  assert.equal(resumed.recentHits?.length ?? 0, 0);
  advance(resumed, 1_000_002);
  assert.deepEqual(resumed.recentHits.map(({ atUs, sourceTemplate, amount }) => [atUs, sourceTemplate, Math.round(amount)]),
    [[400_002, "H018", 1320], [1_000_002, "q001", 1584]]);
  assert.equal(resumed.queue.pending.find(({ payload }) => payload.type === "ogre-repeat").payload.remaining, 0);
  assert.equal(resumed.enemies[0].stunUntilUs, 2_200_002);
});

test("A059 main selection is hero-only, multicast can add an ordinary ally at the closed 600 boundary", () => {
  const { state, actor, tower, command } = fixture();
  actor.hero.ranks = { A059: 6, A060: 6 };
  const ally = tower(901, "H005", 100);
  const ordinary = tower(902, "n001", 700);
  const outside = tower(903, "n001", 701);
  state.structures.push(ally, ordinary, outside);
  state.randomState = seedFor(100);
  assert.deepEqual(heroAllySpellTargets(state, actor, "A059").map(tower => tower.id), [900, 901]);
  assert.ok(command("lust", { type: "cast-hero", towerId: actor.id, skillId: "A059", targetId: ally.id }).ok);
  advance(state, 300_002);
  assert.deepEqual(actor.ogreMulticast, { count: 7, atUs: 300_002 });
  assert.equal(actor.manaMaximum - actor.mana, 50);
  assert.equal(actor.heroSpellReady.A059, 5_300_002);
  for (const recipient of [actor, ally, ordinary]) assert.deepEqual(recipient.bloodlust, { amount: 1, untilUs: 7_300_002 });
  assert.equal(outside.bloodlust, undefined);
  assert.equal(state.queue.pending.some(({ payload }) => payload.type === "ogre-repeat"), false);
});
