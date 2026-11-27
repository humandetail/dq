import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults[id]?.ok, JSON.stringify(state.commandResults[id]));
  return state.queue.nowUs;
}

function fixture() {
  const state = newMatch("m3-spectre-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H059");
  hero.natural.INT = 100;
  const tower = { ...map.worker, id: 900, templateId: "H059", radius: 72,
    qualification: null, pending: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, x: tower.x + 100, id: 910, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  return { state, tower, enemy };
}

function strike(state, source, target, raw = 100) {
  const shot = { towerId: source.summon?.ownerId ?? source.id, sourceTemplate: source.templateId,
    targetId: target.id, raw, point: target, destination: target, weapon: { ...weapons[source.templateId][0], homing: false },
    ...(source.summon ? { summon: { id: source.id, banner: false, illusion: true, output: source.summon.output } } : {}) };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
  advance(state, state.queue.nowUs + 1);
}

test("Desolate rechecks isolation at the closed 150 radius and keeps a separate 0.5s source lock", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A230 = 1;
  state.enemies = [enemy];
  strike(state, tower, enemy);
  const isolated = state.recentHits[0].amount;
  assert.equal(state.recentHits.length, 2);
  const ready = tower.spectreDesolateReadyUs;
  strike(state, tower, enemy);
  assert.equal(state.recentHits.length, 3);
  assert.equal(tower.spectreDesolateReadyUs, ready);
  state.enemies.push({ ...enemy, id: 911, x: enemy.x + 150 });
  advance(state, ready - 1);
  strike(state, tower, enemy);
  assert.equal(state.recentHits.length, 5);
  assert.notEqual(state.recentHits[3].amount, isolated);
  assert.equal(tower.spectreDesolateReadyUs, ready + 500_000);
});

test("Refraction saves pre-lethal committed damage and resolves the 900 boundary once", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A231 = 2;
  enemy.hp = 1;
  enemy.abilities = ["N521"];
  const edge = { ...enemy, id: 911, x: tower.x + 900, hp: 100000, abilities: [] };
  const outside = { ...edge, id: 912, x: edge.x + 1 };
  state.enemies = [enemy, edge, outside];
  const at = command(state, "refraction", { type: "cast-hero", towerId: tower.id, skillId: "A231" });
  assert.equal(tower.spectreRefraction.untilUs, at + 4_000_000);
  strike(state, tower, enemy, 1000);
  assert.equal(enemy.hp, 1);
  assert.ok(tower.spectreRefraction.total > 1000);
  const restored = structuredClone(state);
  advance(restored, at + 4_000_000);
  assert.equal(restored.structures[0].spectreRefraction, undefined);
  assert.ok(restored.enemies.find(target => target.id === edge.id).hp < 100000);
  assert.equal(restored.enemies.find(target => target.id === outside.id).hp, 100000);
});

test("Haunt creates one full-output image per qualifying boss and images can feed an existing Refraction", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A231 = 1;
  tower.hero.ranks.A232 = 1;
  command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S392" });
  assert.equal(tower.templateId, "G079");
  const boss = { ...enemy, unitId: "mBOS", radius: 20, x: tower.x + 250, abilities: ["N534"],
    path: [{ x: tower.x + 400, y: tower.y }] };
  const second = { ...boss, id: 911, y: boss.y + 300, path: [{ x: tower.x + 400, y: boss.y + 300 }] };
  state.enemies = [boss, second, { ...enemy, id: 912 }];
  const at = command(state, "haunt", { type: "cast-hero", towerId: tower.id, skillId: "A232" });
  assert.equal(state.summons.length, 2);
  const [image] = state.summons;
  assert.equal(image.templateId, "G079");
  assert.equal(image.focusTarget, boss.id);
  assert.ok(image.x < boss.x);
  assert.equal(image.summon.output, 1);
  assert.equal(image.summon.damageTaken, 1);
  command(state, "aggregate-images", { type: "cast-hero", towerId: tower.id, skillId: "A231" });
  strike(state, image, boss);
  assert.ok(tower.spectreRefraction.total > 0);
  const restored = structuredClone(state);
  advance(restored, at + 4_000_000);
  assert.deepEqual(restored.summons, []);
});
