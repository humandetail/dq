import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("slark", 14);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const tower = { ...map.worker, id: 900, templateId: "H011", pending: null, qualification: null,
    radius: 72, population: 20, hero: newHero("H011") };
  tower.hero.level = 20;
  tower.hero.points = 6;
  tower.hero.natural = { STR: 100, AGI: 100, INT: 100 };
  state.structures = [tower];
  const baseline = state.enemies[0];
  const enemy = (id, offset) => ({ ...baseline, id, x: tower.x + offset, y: tower.y,
    layer: "ground", armor: 0, hp: 100_000, maxHp: 100_000, abilities: [] });
  return { state, tower, enemy };
}

test("A037 is instant and persists eleven independently sampled closed-radius pulses", () => {
  const { state, tower, enemy } = fixture();
  state.enemies = [enemy(1, 500), enemy(2, 500.001)];
  assert.ok(issue(state, "learn", { type: "learn-skill", towerId: tower.id, skillId: "A037" }).ok);
  assert.ok(issue(state, "cast", { type: "cast-hero", towerId: tower.id, skillId: "A037" }).ok);
  const castUs = state.queue.nowUs;
  assert.equal(tower.lastCastUs, castUs);
  assert.equal(tower.heroSpellReady.A037 - castUs, 10_000_000);
  tower.weakenedUntilUs = tower.stunnedUntilUs = castUs + 2_000_000;
  advance(state, castUs + 599_999);
  assert.equal(state.recentHits, undefined);
  assert.ok(tower.weakenedUntilUs);
  advance(state, castUs + 600_000);
  assert.equal(tower.weakenedUntilUs, undefined);
  assert.equal(tower.stunnedUntilUs, undefined);
  tower.hero.natural.STR += 110;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, castUs + 1_800_000);
  assert.deepEqual(restored.recentHits.map(hit => hit.atUs - castUs),
    Array.from({ length: 11 }, (_, index) => 600_000 + index * 100_000));
  assert.ok(restored.recentHits.every(hit => hit.targetId === 1));
  const damage = restored.recentHits.reduce((sum, hit) => sum + hit.amount, 0);
  const preCleanseReduction = 300 * (12 / 11) * 1.05 * .5;
  assert.ok(Math.abs(damage - ((3600 + 1200) * 1.05 - preCleanseReduction)) < .01, String(damage));
});

test("A038 heals and expires one independent layer, and A039 reads the layer in the same weapon event", () => {
  const { state, tower, enemy } = fixture();
  state.enemies = [enemy(1, 400)];
  for (const skillId of ["A038", "A039"]) assert.ok(issue(state, skillId, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  tower.life = { hp: 2, maximum: 3000, staticMaximum: 3000, lastUs: state.queue.nowUs, regen: 0 };
  assert.ok(issue(state, "focus", { type: "focus-target", towerId: tower.id, targetId: 1 }).ok);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, state.queue.nowUs + 1);
  const fire = state.queue.pending.find(event => event.payload.type === "weapon-fire");
  assert.ok(fire);
  advance(state, fire.dueUs);
  assert.deepEqual(tower.hero.natural, { STR: 101, AGI: 101, INT: 101 });
  assert.equal(tower.life.hp, tower.life.maximum);
  assert.ok(Math.abs(state.recentHits[0].amount - 30.3 * 1.0505) < .001);
  assert.ok(issue(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S142" }).ok);
  assert.equal(tower.templateId, "G051");
  assert.deepEqual(tower.hero.natural, { STR: 131, AGI: 131, INT: 131 });
  const restored = JSON.parse(JSON.stringify(state));
  restored.queue.pending = restored.queue.pending.filter(event => event.payload.type === "essence-expire");
  advance(restored, fire.dueUs + 20_000_000);
  assert.deepEqual(restored.structures[0].hero.natural, { STR: 130, AGI: 130, INT: 130 });
  assert.equal(restored.structures[0].life.hp, restored.structures[0].life.maximum);
});
