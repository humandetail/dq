import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { attackOrb, drain, enqueue, newMatch } from "../src/game/m2/match.ts";

const second = 1_000_000;
function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 10_000) === "pending") {}
}
function issue(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}
function fixture() {
  const state = newMatch("dark-ranger", 14);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const tower = { ...map.worker, id: 900, templateId: "H022", radius: 72, pending: null,
    population: 20, qualification: null, hero: newHero("H022") };
  state.structures = [tower];
  return { state, tower };
}

test("A070 uses 3 mana only at committed flight and applies target-specific frost on arrival", () => {
  const { state, tower } = fixture();
  assert.ok(issue(state, "learn", { type: "learn-skill", towerId: tower.id, skillId: "A070" }).ok);
  assert.equal(attackOrb(tower).defaultAuto, false);
  const [target] = state.enemies;
  Object.assign(target, { x: tower.x + 600, y: tower.y, layer: "ground", armor: 0, hp: 100_000, maxHp: 100_000, abilities: ["Arsk"] });
  assert.ok(issue(state, "manual", { type: "cast-flame-arrow", towerId: tower.id, targetId: target.id }).ok);
  advance(state, 31_250);
  // Existing movement dispatch starts attack windup.
  if (!tower.attack?.winding) {
    scheduleEvent(state.queue, 1, { type: "movement" });
    advance(state, state.queue.nowUs + 1);
  }
  const fire = state.queue.pending.find(event => event.payload.type === "weapon-fire");
  assert.ok(fire, "Expected real weapon windup");
  const initialMana = tower.mana;
  advance(state, fire.dueUs);
  const projectile = state.queue.pending.find(event => event.payload.type === "weapon-impact");
  assert.equal(projectile.payload.shot.heroFrostRank, 1);
  assert.equal(projectile.payload.shot.weapon.speed, 1500);
  assert.ok(initialMana - tower.mana > 2.9 && initialMana - tower.mana <= 3);
  const restored = structuredClone(state);
  advance(restored, fire.dueUs + 410_000);
  const frost = restored.enemies[0].coldArrow;
  assert.equal(frost.factor, .9);
  const hitUs = restored.recentHits.at(-1).atUs;
  assert.equal(frost.expiresUs - hitUs, 500_000);
  advance(restored, frost.expiresUs);
  assert.equal(restored.enemies[0].coldArrow, undefined);
});

test("A071 and A072 survive forms and reload without replaying paid gains", () => {
  const { state, tower } = fixture();
  tower.hero.level = 20;
  tower.hero.points = 3;
  tower.hero.natural.AGI = 100;
  const ranged = { ...tower, id: 901, templateId: "n236", hero: undefined, x: tower.x + 800 };
  const melee = { ...ranged, id: 902, templateId: "n230" };
  const outside = { ...ranged, id: 903, x: tower.x + 800.001 };
  state.structures.push(ranged, melee, outside);
  state.inventory.push({ id: 950, itemId: "i310", slot: 0, towerId: tower.id, charges: 0, point: tower });
  for (const skillId of ["A070", "A071", "A072"]) assert.ok(issue(state, skillId, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  assert.equal(tower.hero.natural.AGI, 150);
  assert.ok(issue(state, "cast", { type: "cast-hero", towerId: tower.id, skillId: "A071" }).ok);
  assert.deepEqual([tower.accuracy.attack, tower.accuracy.agility, tower.accuracy.armor], [19, 100, 5]);
  assert.deepEqual([ranged.accuracy.attack, ranged.accuracy.agility], [10, 0]);
  assert.equal(melee.accuracy, undefined);
  assert.equal(outside.accuracy, undefined);
  assert.ok(issue(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S273" }).ok);
  assert.equal(tower.templateId, "G073");
  assert.deepEqual(tower.hero.ranks, { A210: 1, A211: 1, A072: 1 });
  assert.equal(tower.hero.natural.AGI, 180);
  assert.equal(tower.accuracy.attack, 19);
  assert.equal(state.inventory.find(item => item.id === 950).towerId, tower.id);
  assert.equal(attackOrb(tower).id, "A210");
  const restored = structuredClone(state);
  advance(restored, state.queue.nowUs + 10 * second);
  assert.equal(restored.structures[0].accuracy, undefined);
  assert.equal(restored.structures[0].hero.natural.AGI, 180);
  assert.equal(restored.structures[1].accuracy, undefined);
});
