import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, due) {
  state.clock.targetUs = due;
  while (drain(state, 1_000) === "pending") {}
}

function issue(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture(seed = 47) {
  const state = newMatch("prophet", seed);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const tower = { x: -288, y: -128, id: 900, templateId: "H015", hero: newHero("H015"), radius: 45,
    pending: null, qualification: null, population: 20, autoModes: { A049: false } };
  tower.hero.level = 20;
  tower.hero.points = 6;
  tower.hero.natural = { STR: 100, AGI: 100, INT: 100 };
  state.structures = [tower];
  const base = state.enemies[0];
  const enemy = (id, dx, dy, abilities = []) => ({ ...base, id, x: tower.x + dx, y: tower.y + dy,
    hp: 100_000, maxHp: 100_000, armor: 0, abilities, speed: 0 });
  function learn(skillId) {
    assert.ok(issue(state, "learn-" + skillId, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  }
  return { state, tower, enemy, learn };
}

test("A049 and A130 replace only the active treant formation and keep birth stats after reloading", () => {
  const { state, tower, learn } = fixture();
  learn("A049");
  state.inventory.push({ id: 960, itemId: "i327", towerId: tower.id, slot: 0, charges: 0, point: tower });
  assert.ok(issue(state, "summon", { type: "cast-hero", towerId: tower.id, skillId: "A049" }).ok);
  advance(state, state.queue.nowUs + 400_000);
  assert.deepEqual(state.summons.map(unit => [unit.templateId, unit.life.hp, unit.summon.attack]), [
    ["b100", 300, 148], ["b100", 300, 148],
  ]);
  const original = state.summons.map(unit => unit.id);
  assert.ok(issue(state, "form", { type: "choose-skin", towerId: tower.id, choice: "S172" }).ok);
  assert.equal(tower.hero.ranks.A130, 1);
  assert.deepEqual(state.summons.map(unit => unit.id), original);
  const copied = JSON.parse(JSON.stringify(state));
  const owner = copied.structures[0];
  advance(copied, owner.heroSpellReady.A130);
  assert.deepEqual(copied.summons.map(unit => unit.id), original);
  assert.ok(issue(copied, "summon-new", { type: "cast-hero", towerId: owner.id, skillId: "A130" }).ok);
  advance(copied, copied.queue.nowUs + 300_000);
  assert.deepEqual(copied.summons.map(unit => [unit.templateId, unit.summon.attack]), [["b144", 156], ["b144", 156]]);
  assert.ok(copied.summons.every(unit => !original.includes(unit.id)));
});

test("A050 relocates at +.1 after commit, and an in-flight teleport is not replayed", () => {
  const { state, tower, learn } = fixture();
  learn("A050");
  const destination = { x: -256, y: 224 };
  assert.ok(issue(state, "tp", { type: "cast-hero", towerId: tower.id, skillId: "A050", point: destination }).ok);
  const committed = state.queue.nowUs + 300_000;
  advance(state, committed);
  assert.equal(tower.x, -288);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, committed + 99_999);
  assert.equal(restored.structures[0].x, -288);
  advance(restored, committed + 100_000);
  assert.deepEqual({ x: restored.structures[0].x, y: restored.structures[0].y }, destination);
  assert.equal(restored.structures[0].prophetTeleportTimer, undefined);
});

test("A051 applies N535 only to the primary and captures a distinct increasing random chain", () => {
  for (const blocked of [false, true]) {
    const { state, tower, learn, enemy } = fixture();
    learn("A051");
    state.enemies = [enemy(1, 300, 0, blocked ? ["N535"] : []), enemy(2, 600, 0, ["N535"]),
      enemy(3, 900, 0), enemy(4, 1200, 0), enemy(5, 1500, 0)];
    assert.ok(issue(state, "wrath", { type: "cast-hero", towerId: tower.id, skillId: "A051", targetId: 1 }).ok);
    advance(state, state.queue.nowUs + 300_000);
    if (blocked) {
      assert.equal(state.recentHits, undefined);
      assert.ok(state.enemies[0].spellShieldReadyUs);
    } else {
      assert.equal(state.recentHits[0].targetId, 1);
      const ids = state.recentHits.map(hit => hit.targetId);
      assert.equal(ids.length, new Set(ids).size);
      assert.ok(ids.length >= 3);
      assert.ok(state.recentHits.every(hit => hit.sourceTemplate === "q023"));
      assert.equal(state.enemies[1].spellShieldReadyUs, undefined);
      assert.ok(state.recentHits.every((hit, index) => Math.abs(hit.amount / state.recentHits[0].amount - 1.1 ** index) < .00001));
    }
  }
});


test("A051 scepter creates its own temporary treants on hits, with live rank and separate expiry", () => {
  const { state, tower, learn, enemy } = fixture(47);
  learn("A049");
  learn("A051");
  assert.ok(issue(state, "transform", { type: "choose-skin", towerId: tower.id, choice: "S172" }).ok);
  state.inventory.push({ id: 960, itemId: "i310", towerId: tower.id, slot: 0, charges: 0, point: tower });
  state.enemies = Array.from({ length: 10 }, (_, index) => enemy(index + 1, 350, index * 70));
  assert.ok(issue(state, "chain", { type: "cast-hero", towerId: tower.id, skillId: "A051", targetId: 1 }).ok);
  const commit = state.queue.nowUs + 300_000;
  advance(state, commit);
  assert.ok(state.recentHits.length > 0);
  const treants = (state.summons ?? []).map(unit => [unit.id, unit.templateId, unit.summon.skillId]);
  assert.ok(treants.length > 0);
  assert.ok(treants.every(([, template, source]) => template === "b147" && source === "A051"));
  const copied = JSON.parse(JSON.stringify(state));
  advance(copied, commit + 9_999_999);
  assert.equal(copied.summons.length, treants.length);
  advance(copied, commit + 10_000_000);
  assert.equal(copied.summons.length, 0);
});
