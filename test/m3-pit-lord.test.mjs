import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { addHeroExperience, newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch, removeDeadEnemy } from "../src/game/m2/match.ts";

function advance(state, now) {
  state.clock.targetUs = now;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("pit-lord", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const base = state.enemies[0];
  const tower = { id: 900, templateId: "H060", hero: newHero("H060"), x: -288, y: -128,
    radius: 72, pending: null, qualification: null, autoModes: { A233: false, A234: false } };
  addHeroExperience(tower.hero, tower.templateId, 500_000, () => true);
  state.structures = [tower];
  state.enemies = [];
  const enemy = (id, x = tower.x + 200, abilities = []) => ({ ...base, id, x, y: tower.y, hp: 1_000_000,
    maxHp: 1_000_000, speed: 0, armor: 0, abilities });
  const act = action => {
    const id = `pit-${state.queue.nowUs}`;
    assert.ok(enqueue(state, { id, action: { ...action, towerId: tower.id }, matchId: state.matchId }));
    advance(state, state.queue.nowUs + 1);
    assert.ok(state.commandResults[id].ok, JSON.stringify(state.commandResults[id]));
  };
  const learn = skillId => act({ type: "learn-skill", skillId });
  const cast = (skillId, point = tower) => {
    act({ type: "cast-hero", skillId, point });
    advance(state, state.queue.nowUs + 500_000);
    return state.queue.nowUs;
  };
  return { state, tower, enemy, learn, cast, act };
}

test("A233 schedules six fixed damage waves while T403 shares one refreshed two-second burn per real target", () => {
  const { state, tower, enemy, learn, cast, act } = fixture();
  learn("A233");
  act({ type: "choose-skin", choice: "S382" });
  const target = enemy(601, tower.x + 175);
  const shielded = enemy(602, tower.x + 350, ["N535"]);
  state.enemies = [target, shielded];
  const now = cast("A233");
  assert.equal(state.recentHits?.length ?? 0, 0);
  advance(state, now + 125_000);
  assert.equal(target.firestormBurn.nextUs, now + 1_125_000);
  advance(state, now + 250_000);
  assert.equal(shielded.firestormBurn, undefined);
  assert.ok(shielded.spellShieldReadyUs > state.queue.nowUs);
  const next = target.firestormBurn.nextUs;
  advance(state, now + 1_124_999);
  assert.equal(state.recentHits.filter(hit => hit.targetId === 601 && hit.sourceTemplate === "G078").length, 1);
  advance(state, now + 1_125_000);
  assert.ok(target.firestormBurn.nextUs > next);
  assert.equal(state.queue.pending.filter(({ payload }) => payload.type === "firestorm-burn" && payload.enemyId === target.id).length, 1);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, now + 7_125_000);
  const observed = restored.recentHits.filter(hit => hit.targetId === 601);
  assert.deepEqual(observed.filter(hit => hit.sourceTemplate === "G078").map(hit => hit.atUs),
    Array.from({ length: 6 }, (_, i) => now + (i + 1) * 1_000_000));
  assert.equal(observed.filter(hit => hit.sourceTemplate === "q001").length, 7);
  assert.equal(restored.enemies[0].firestormBurn, undefined);
});

test("A234 submits damage first, then separate short nets run through the eighth pulse", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  learn("A234");
  const shielded = enemy(601, tower.x + 180, ["N535"]);
  const held = enemy(602, tower.x + 190);
  state.enemies = [held, shielded];
  const now = cast("A234");
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [601, 602]);
  assert.equal(shielded.pitNetUntilUs, undefined);
  assert.equal(held.pitNetUntilUs, now + 300_000);
  assert.equal(held.stunUntilUs, undefined);
  advance(state, now + 300_000);
  assert.equal(held.pitNetUntilUs, undefined);
  advance(state, now + 7_000_000);
  assert.equal(state.recentHits.filter(hit => hit.targetId === held.id).length, 8);
  assert.equal(tower.pit, undefined);
  assert.equal(held.pitNetUntilUs, now + 7_300_000);
});

test("A235 rewards nearby living towers without the killing blow and only each temporary amount expires", () => {
  const { state, tower, enemy, learn } = fixture();
  learn("A235");
  const neighbour = { ...structuredClone(tower), id: 901, x: tower.x + 30 };
  state.structures.push(neighbour);
  const deaths = [enemy(601, tower.x + 700), enemy(602, tower.x + 600), enemy(603, tower.x - 701)];
  state.enemies = [...deaths];
  const before = state.queue.nowUs;
  for (const target of deaths) {
    target.hp = 0;
    assert.ok(removeDeadEnemy(state, target.id));
    advance(state, state.queue.nowUs + 1_000_000);
  }
  assert.equal(tower.permanentAttack, 14);
  assert.equal(neighbour.permanentAttack, 14);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, before + 20_000_000);
  assert.deepEqual(restored.structures.map(unit => unit.permanentAttack), [9, 9]);
  advance(restored, before + 21_000_000);
  assert.deepEqual(restored.structures.map(unit => unit.permanentAttack), [4, 4]);
  assert.deepEqual(restored.structures.map(unit => unit.deathAuraCount), [4, 4]);
});
