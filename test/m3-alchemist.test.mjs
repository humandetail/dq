import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage, weapons } from "../src/game/m2/combat.ts";
import { alchemistForms } from "../src/game/m2/content.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch, removeDeadEnemy } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, action) {
  const id = `alchemist-${state.queue.nowUs}`;
  assert.ok(enqueue(state, { id, action, matchId: state.matchId }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("alchemist", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const hero = newHero("H032");
  hero.level = 30;
  hero.points = 20;
  hero.natural = { STR: 100, AGI: 100, INT: 100 };
  const tower = { id: 900, templateId: "H032", hero, x: -288, y: -128, radius: 72, pending: null, qualification: null,
    autoModes: { A108: false, A110: false } };
  state.structures = [tower];
  const base = state.enemies[0];
  state.enemies = [];
  const enemy = (id, x, y = 0, abilities = []) => ({ ...base, id, x: tower.x + x, y: tower.y + y,
    hp: 100_000, maxHp: 100_000, armor: 90, speed: 0, abilities });
  const learn = skillId => assert.ok(issue(state, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  const cast = (skillId, aim = {}) => {
    assert.ok(issue(state, { type: "cast-hero", towerId: tower.id, skillId, ...aim }).ok);
    if (skillId === "A108") advance(state, state.queue.nowUs + 400_000);
    return state.queue.nowUs;
  };
  return { state, tower, enemy, learn, cast };
}

test("A110 enters all six original templates immediately and restores intact hero, HP and both weapons after twenty seconds", () => {
  for (const [rank, template] of alchemistForms.entries()) {
    const { state, tower, learn, cast } = fixture();
    for (let i = 0; i <= rank; i++) learn("A110");
    const castUs = cast("A110");
    assert.equal(tower.templateId, template);
    assert.equal(tower.alchemistShape.rank, rank + 1);
    assert.equal(tower.manaMaximum - tower.mana, 20 + 10 * rank);
    assert.equal(tower.heroSpellReady.A110, castUs + (40 - 3 * rank) * 1_000_000);
    assert.equal(weapons[template][0].cooldown, [1.15, 1.1, 1.05, 1, .95, .9][rank]);
    assert.equal(weapons[template][1].cooldown, 2.5);
    const restored = JSON.parse(JSON.stringify(state));
    advance(restored, castUs + 20_000_000);
    const [returned] = restored.structures;
    assert.equal(returned.id, tower.id);
    assert.equal(returned.templateId, "H032");
    assert.equal(returned.alchemistShape, undefined);
    assert.equal(tower.life.maximum - returned.life.maximum, 500);
    assert.ok(Math.abs(tower.manaRegen - returned.manaRegen - 3 * (rank + 1)) < 1e-8);
    assert.deepEqual(returned.hero, tower.hero);
  }
});

test("A108 divides captured gold by the two actual alchemists, then applies the independent armor zone around six fixed pulses", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  learn("A108");
  state.structures.push({ ...tower, id: 901, x: -490, y: -210, hero: newHero("H032") });
  state.gold = 10_000;
  state.enemies = [enemy(301, 500, 0, ["Amim"]), enemy(302, 500.001), enemy(303, 0, 500)];
  const castUs = cast("A108", { point: tower });
  const initial = physicalDamage(650, "hero", 90, false) * 1.06;
  const later = physicalDamage(650, "hero", 60, false) * 1.06;
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [301, 303]);
  assert.ok(Math.abs(state.recentHits[0].amount - initial) < 1e-8);
  assert.equal(Object.values(state.acidClouds)[0].amount, 650);
  state.gold = 55_000;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, castUs + 5_000_000);
  const immune = restored.recentHits.filter(hit => hit.targetId === 301);
  const vulnerable = restored.recentHits.filter(hit => hit.targetId === 303);
  const expected = Array.from({ length: 6 }, (_, i) => castUs + i * 1_000_000);
  assert.deepEqual(immune.map(hit => hit.atUs), expected);
  assert.deepEqual(vulnerable.map(hit => hit.atUs), expected);
  assert.ok(immune.every(hit => Math.abs(hit.amount - initial) < 1e-8));
  assert.ok(vulnerable.slice(1).every(hit => Math.abs(hit.amount - later) < 1e-8));
  assert.deepEqual(restored.acidClouds, {});
});

test("A109 rewards first learning and live credited kills with a dynamic transformation cap, then expires only its own streak", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  const startGold = state.gold;
  learn("A109");
  assert.equal(state.gold - startGold, 80);
  assert.equal(tower.goblinGreedGold, 80);
  learn("A110");
  const kill = (targetState, id) => {
    const victim = enemy(id, 200);
    victim.hp = 0;
    targetState.enemies = [victim];
    assert.ok(removeDeadEnemy(targetState, id, tower.id));
  };
  for (const id of [301, 302, 303, 304]) kill(state, id);
  assert.deepEqual(tower.goblinGreed.accumulated, 5);
  assert.equal(tower.goblinGreedGold - 80, 3 + 4 + 5 + 5);
  cast("A110");
  kill(state, 305);
  kill(state, 306);
  assert.equal(tower.goblinGreed.accumulated, 7);
  assert.equal(tower.goblinGreedGold - 80, 3 + 4 + 5 + 5 + 6 + 7);
  const restored = JSON.parse(JSON.stringify(state));
  const due = restored.queue.pending.find(event => event.payload.type === "goblin-greed-end").dueUs;
  advance(restored, due);
  assert.equal(restored.structures[0].goblinGreed, undefined);
  kill(restored, 307);
  assert.equal(restored.structures[0].goblinGreed.accumulated, 3);
});
