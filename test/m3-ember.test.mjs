import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { addHeroExperience, newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, now) {
  state.clock.targetUs = now;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, action) {
  const id = `ember-${state.queue.nowUs}`;
  assert.ok(enqueue(state, { id, action, matchId: state.matchId }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture(skin = false) {
  const state = newMatch("ember", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const base = state.enemies[0];
  const tower = { id: 900, templateId: "H046", hero: newHero("H046"), x: -288, y: -128, radius: 72,
    pending: null, qualification: null, autoModes: { A178: false, A179: false, A180: false } };
  addHeroExperience(tower.hero, tower.templateId, 500_000, () => true);
  state.structures = [tower];
  state.enemies = [];
  if (skin) assert.ok(issue(state, { type: "choose-skin", towerId: tower.id, choice: "S262" }).ok);
  const enemy = (id, x, y, abilities = []) => ({ ...base, id, x, y, hp: 1_000_000, maxHp: 1_000_000, speed: 0, armor: 0, abilities });
  const learn = skillId => assert.ok(issue(state, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  const cast = (skillId, point) => {
    const result = issue(state, { type: "cast-hero", towerId: tower.id, skillId, point });
    assert.ok(result.ok, JSON.stringify(result));
    advance(state, state.queue.nowUs + 10_000);
    return state.queue.nowUs;
  };
  return { state, tower, enemy, learn, cast };
}

test("A178 snapshots the first four members, shields only control, and keeps ticking moved targets at live rank", () => {
  const { state, tower, enemy, learn, cast } = fixture(true);
  learn("A178");
  const boundary = enemy(301, tower.x + 650, tower.y);
  const shield = enemy(302, tower.x + 80, tower.y, ["N535"]);
  const immune = enemy(303, tower.x + 110, tower.y, ["Amim"]);
  const held = enemy(304, tower.x, tower.y + 180);
  const fifth = enemy(305, tower.x + 5, tower.y);
  state.enemies = [fifth, shield, immune, held, boundary];
  const now = cast("A178");
  assert.deepEqual(tower.searingChains.targets, [301, 302, 303, 304]);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [301, 302, 304]);
  assert.equal(shield.searingChainsUntilUs, undefined);
  assert.equal(shield.spellShieldReadyUs, now + 6_000_000);
  assert.equal(held.searingChainsUntilUs, now + 4_000_000);
  assert.ok(state.battleAnimations.some(art => art.unitId === "A178G065" && art.enemyId === 304));
  const first = state.recentHits[0].amount;
  learn("A178");
  boundary.x += 500;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, now + 4_000_000);
  assert.equal(restored.enemies.find(unit => unit.id === 304).searingChainsUntilUs, undefined);
  assert.equal(restored.structures[0].searingChains, undefined);
  const hits = restored.recentHits.filter(hit => hit.targetId === 301);
  assert.deepEqual(hits.map(hit => hit.atUs), [0, 1, 2, 3, 4].map(sec => now + sec * 1_000_000));
  assert.ok(hits.slice(1).every(hit => Math.abs(hit.amount - 2 * first) < 1e-8));
  assert.equal(restored.recentHits.some(hit => hit.targetId === 305), false);
});

test("A179 follows the live tower and advances exactly 15 independent pulses through a reload", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  learn("A179");
  const old = enemy(301, tower.x - 790, tower.y);
  const next = enemy(302, tower.x + 801, tower.y);
  state.enemies = [old, next];
  const now = cast("A179");
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [301]);
  tower.x += 200;
  learn("A179");
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, now + 14_000_000);
  assert.equal(restored.structures[0].flameGuard, undefined);
  assert.deepEqual(restored.recentHits.slice(1).map(hit => hit.atUs), Array.from({ length: 14 }, (_, index) => now + (index + 1) * 1_000_000));
  assert.ok(restored.recentHits.slice(1).every(hit => hit.targetId === 302 && Math.abs(hit.amount - 2 * state.recentHits[0].amount) < 1e-8));
});

test("A180 holds a real attack queue, advances each listed enemy and restores the saved position after the last target", () => {
  const { state, tower, enemy, learn, cast } = fixture(true);
  learn("A180");
  const origin = { x: tower.x, y: tower.y };
  const first = enemy(301, tower.x + 150, tower.y + 130);
  const second = enemy(302, tower.x + 215, tower.y + 170);
  state.enemies = [second, first, enemy(303, tower.x + 405, tower.y + 130)];
  const focus = { x: first.x - 2, y: first.y };
  const now = cast("A180", focus);
  assert.deepEqual(tower.sleight.targets, [301, 302]);
  assert.equal(tower.sleight.visual, "q043");
  advance(state, now + 9_999);
  assert.equal(tower.attack, undefined);
  advance(state, now + 10_000);
  assert.equal(tower.attack.targetId, 301);
  assert.equal(tower.attack.timing.cycleUs, 300_000);
  assert.ok(tower.attack.timing.rawRate > 6);
  assert.ok(tower.x !== origin.x || tower.y !== origin.y);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, now + 249_999);
  assert.equal(restored.structures[0].sleight.next, 1);
  const firstStop = { x: restored.structures[0].x, y: restored.structures[0].y };
  advance(restored, now + 250_000);
  assert.equal(restored.structures[0].sleight.next, 2);
  assert.notDeepEqual({ x: restored.structures[0].x, y: restored.structures[0].y }, firstStop);
  advance(restored, now + 500_000);
  const actor = restored.structures[0];
  assert.equal(actor.sleight, undefined);
  assert.deepEqual({ x: actor.x, y: actor.y }, origin);
  assert.equal(restored.recentHits[0].targetId, 301);
  assert.equal(restored.recentHits.some(hit => hit.targetId === 303), false);
  assert.ok(restored.battleAnimations.some(art => art.unitId === "A180G065"));
});
