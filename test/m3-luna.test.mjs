import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
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

function fixture() {
  const state = newMatch("luna", 14);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const origin = { x: -288, y: -128 };
  const tower = { ...origin, id: 900, templateId: "H016", hero: newHero("H016"), radius: 72,
    pending: null, qualification: null, population: 20, autoModes: { A054: false } };
  tower.hero.level = 20;
  tower.hero.points = 6;
  tower.hero.natural = { STR: 100, AGI: 100, INT: 100 };
  state.structures = [tower];
  const source = state.enemies[0];
  const enemy = (id, x, y = 0, abilities = []) => ({ ...source, id, x: origin.x + x, y: origin.y + y,
    hp: 100_000, maxHp: 100_000, armor: 0, abilities, speed: 0 });
  const learn = skillId => assert.ok(issue(state, "learn-" + skillId, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  return { state, tower, enemy, learn };
}

test("A052 launches at most three 500-radius hops with the firing rank preserved across reload", () => {
  const { state, tower, enemy, learn } = fixture();
  state.enemies = Array.from({ length: 5 }, (_, index) => enemy(index + 1, 100 + index * 500));
  learn("A052");
  assert.ok(issue(state, "focus", { type: "focus-target", towerId: tower.id, targetId: 1 }).ok);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, state.queue.nowUs + 1);
  const fire = state.queue.pending.find(event => event.payload.type === "weapon-fire");
  assert.ok(fire);
  advance(state, fire.dueUs);
  const fired = state.queue.pending.find(event => event.payload.type === "weapon-impact");
  assert.equal(fired.payload.shot.moonGlaiveRank, 1);
  tower.hero.ranks.A052 = 6;
  const restored = JSON.parse(JSON.stringify(state));
  restored.queue.pending = restored.queue.pending.filter(event => event.payload.type === "weapon-impact");
  advance(restored, fired.dueUs + 2_500_000);
  const hits = restored.recentHits.map(({ targetId, amount }) => [targetId, amount]);
  assert.deepEqual(hits.map(([id]) => id), [1, 2, 3, 4]);
  for (let index = 1; index <= 3; index++) {
    assert.ok(Math.abs(hits[index][1] / hits[0][1] - .7 ** index) < .00001);
  }
});

test("A053 contributes the strongest flat blessing once, without replacing other spell rules", () => {
  const { state, tower, enemy } = fixture();
  const shoot = support => {
    const copy = structuredClone(state);
    const shooter = copy.structures[0];
    copy.enemies = [enemy(1, 100)];
    // Two legal aura sources are both beneficial; only the stronger one is used.
    for (const [id, rank, x] of support) {
      const templateId = "G074";
      const hero = newHero(templateId);
      hero.ranks.A053 = rank;
      copy.structures.push({ ...shooter, id, x, templateId, hero, attack: { readyUs: Number.MAX_SAFE_INTEGER } });
    }
    scheduleEvent(copy.queue, 1, { type: "movement" });
    advance(copy, copy.queue.nowUs + 1);
    const fire = copy.queue.pending.find(event => event.payload.type === "weapon-fire");
    assert.ok(fire);
    advance(copy, fire.dueUs);
    return copy.queue.pending.find(event => event.payload.type === "weapon-impact").payload.shot.raw;
  };
  const without = shoot([]);
  assert.equal(shoot([[901, 1, tower.x], [902, 3, tower.x + 500]]) - without, 160);
  assert.equal(shoot([[901, 4, tower.x + 500.001]]) - without, 0);
});

test("A054 ends before tick ten, restores nine pulses and uses a separate zero-damage T120", () => {
  const { state, tower, enemy, learn } = fixture();
  state.enemies = [enemy(1, 100, 0, ["N535"])];
  learn("A054");
  assert.ok(issue(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S342" }).ok);
  assert.equal(tower.templateId, "G074");
  state.inventory.push({ id: 940, itemId: "i310", towerId: tower.id, slot: 0, charges: 0, point: tower });
  assert.ok(issue(state, "eclipse", { type: "cast-hero", towerId: tower.id, skillId: "A054" }).ok);
  const commit = state.queue.nowUs + 300_000;
  advance(state, commit + 599_999);
  assert.equal(state.recentHits, undefined);
  advance(state, commit + 600_000);
  assert.equal(state.recentHits.length, 1);
  assert.ok(state.enemies[0].spellShieldReadyUs);
  assert.equal(state.enemies[0].stunUntilUs, undefined);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, commit + 1_200_000);
  assert.equal(restored.enemies[0].stunUntilUs, commit + 1_700_000);
  advance(restored, commit + 6_000_000);
  assert.deepEqual(restored.recentHits.map(hit => hit.atUs - commit),
    Array.from({ length: 9 }, (_, index) => 600_000 * (index + 1)));
  assert.equal(restored.structures[0].eclipse, undefined);
  assert.equal(weapons.G074[0].speed, 900);
});
