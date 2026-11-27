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
  const state = newMatch("tormented-soul", 14);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const caster = { ...map.worker, id: 900, templateId: "H008", pending: null, qualification: null,
    radius: 72, population: 20, hero: newHero("H008") };
  caster.hero.natural.INT = 100;
  caster.hero.level = 20;
  caster.hero.points = 6;
  state.structures = [caster];
  const baseline = state.enemies[0];
  const enemy = (id, x, y = 0, layer = "ground", abilities = []) => ({ ...baseline,
    id, x: caster.x + x, y: caster.y + y, layer, abilities, maxHp: 100_000, hp: 100_000, armor: 0 });
  return { state, caster, enemy };
}

test("A028 uses native ground targeting, a .7 second commit and closed radius without consuming N535", () => {
  const { state, caster, enemy } = fixture();
  state.enemies = [enemy(1, 300, 0, "fly", ["N535"]), enemy(2, 300, 0.1),
    { ...enemy(3, 100, 0, "fly"), unitId: "ehpr" }];
  issue(state, "learn", { type: "learn-skill", towerId: caster.id, skillId: "A028" });
  assert.ok(issue(state, "cast", { type: "cast-hero", towerId: caster.id, skillId: "A028", point: caster }).ok);
  const due = state.queue.nowUs + 700_000;
  advance(state, due - 1);
  assert.equal(state.enemies[0].hp, 100_000);
  advance(state, due);
  assert.equal(state.recentHits[0].targetId, 1);
  assert.equal(state.enemies[0].stunUntilUs, due + 1_000_000);
  assert.equal(state.enemies[0].spellShieldReadyUs, undefined);
  assert.equal(state.enemies[1].hp, 100_000);
  assert.equal(state.enemies[2].hp, 100_000);
});

test("A029 visits no more than six distinct targets at rank one and gates the whole chain on the first shield", () => {
  for (const shield of [true, false]) {
    const { state, caster, enemy } = fixture();
    state.enemies = Array.from({ length: 7 }, (_, index) =>
      enemy(index + 1, 200 + index * 300, 0, "ground", index === 0 && shield ? ["N535"] : []));
    issue(state, "learn", { type: "learn-skill", towerId: caster.id, skillId: "A029" });
    assert.ok(issue(state, "cast", { type: "cast-hero", towerId: caster.id, skillId: "A029", targetId: 1 }).ok);
    advance(state, state.queue.nowUs + 700_000);
    if (shield) assert.equal(state.recentHits, undefined);
    else assert.deepEqual(state.recentHits.map(hit => hit.targetId), [1, 2, 3, 4, 5, 6]);
  }
});

test("A030 learns one renewing timer and restores live scepter thresholds without duplicate pulses", () => {
  const { state, caster, enemy } = fixture();
  state.enemies = [enemy(1, 500), enemy(2, 1000), enemy(3, 1000.001)];
  assert.ok(issue(state, "first-learn", { type: "learn-skill", towerId: caster.id, skillId: "A030" }).ok);
  advance(state, 500_001);
  assert.ok(issue(state, "second-learn", { type: "learn-skill", towerId: caster.id, skillId: "A030" }).ok);
  assert.equal(state.queue.pending.filter(event => event.payload.type === "nova-tick").length, 1);
  advance(state, 1_000_002);
  assert.equal(state.recentHits, undefined);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, 1_500_002);
  assert.deepEqual(restored.recentHits.map(hit => hit.targetId), [1]);
  const basic = restored.recentHits[0].amount;
  restored.inventory.push({ id: 988, itemId: "i310", slot: 0, towerId: caster.id, charges: 0, point: caster });
  advance(restored, 2_500_002);
  assert.deepEqual(restored.recentHits.map(hit => hit.targetId), [1, 1, 2]);
  assert.ok(restored.recentHits[1].amount > basic * 2);
  assert.equal(restored.enemies[2].hp, 100_000);
});
