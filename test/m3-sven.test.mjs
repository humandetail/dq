import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { learningLevel, newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, due) {
  state.clock.targetUs = due;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("sven", 14);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const tower = { ...map.worker, id: 900, templateId: "H019", hero: newHero("H019"), radius: 72,
    pending: null, qualification: null, population: 20, autoModes: { A061: false, A063: false } };
  tower.hero.level = 20;
  tower.hero.points = 6;
  tower.hero.natural = { STR: 100, AGI: 100, INT: 100 };
  state.structures = [tower];
  const origin = state.enemies[0];
  const enemy = (id, x, y = 0, abilities = []) => ({ ...origin, id, x: tower.x + x, y: tower.y + y,
    hp: 100_000, maxHp: 100_000, armor: 0, abilities, speed: 0 });
  function learn(skillId) {
    assert.ok(issue(state, "learn-" + skillId, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  }
  return { state, tower, enemy, learn };
}

test("A061 commits to a closed point and each hammer can survive independent dispel and restore", () => {
  const { state, tower, enemy, learn } = fixture();
  state.enemies = [enemy(1, 600), enemy(2, 200, 400, ["N535"]), enemy(3, 200, 400.001)];
  learn("A061");
  assert.ok(issue(state, "hammer", { type: "cast-hero", towerId: tower.id, skillId: "A061",
    point: { x: tower.x + 200, y: tower.y } }).ok);
  const committed = state.queue.nowUs + 300_000;
  advance(state, committed);
  assert.equal(state.enemies[0].stormHammerMarkUntilUs, committed + 5_000_000);
  assert.equal(state.enemies[1].stormHammerMarkUntilUs, undefined);
  assert.equal(state.enemies[1].spellShieldReadyUs, committed + 6_000_000);
  assert.equal(state.recentHits, undefined);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, committed + 520_000);
  assert.deepEqual(restored.recentHits.map(hit => hit.targetId), [2, 1]);
  assert.equal(restored.enemies[0].stunUntilUs, committed + 2_500_000);
  assert.equal(restored.enemies[2].stunUntilUs, undefined);
});

test("S013 remaps three skill slots and cooldown while S014 remaps only Storm Hammer", () => {
  for (const [choice, template, ranks] of [["S012", "G012", { A061: 1, A062: 1, A063: 1 }],
    ["S013", "G049", { A119: 1, A121: 1, A118: 1 }],
    ["S014", "G054", { A128: 1, A062: 1, A063: 1 }]]) {
    const { state, tower, learn } = fixture();
    for (const skillId of ["A061", "A062", "A063"]) learn(skillId);
    assert.ok(issue(state, "try-hammer", { type: "cast-hero", towerId: tower.id, skillId: "A061", point: tower }).ok);
    advance(state, state.queue.nowUs + 1_300_000);
    const ready = tower.heroSpellReady.A061;
    assert.ok(issue(state, choice, { type: "choose-skin", towerId: tower.id, choice }).ok);
    assert.equal(tower.templateId, template);
    assert.deepEqual(tower.hero.ranks, ranks);
    const [hammer] = Object.keys(ranks);
    assert.equal(tower.heroSpellReady[hammer], ready);
    assert.ok(learningLevel(tower.hero, tower.templateId, hammer));
  }
});

test("A062 uses the primary event and max radius, and A063 only amplifies during its twelve-second window", () => {
  const { state, tower, enemy, learn } = fixture();
  learn("A062");
  learn("A063");
  state.enemies = [enemy(1, 250), enemy(2, 250, 520), enemy(3, 250, 520.001)];
  assert.ok(issue(state, "cast-roar", { type: "cast-hero", towerId: tower.id, skillId: "A063" }).ok);
  advance(state, state.queue.nowUs + 400_000);
  const until = tower.godsStrength.untilUs;
  assert.ok(issue(state, "focus", { type: "focus-target", towerId: tower.id, targetId: 1 }).ok);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, state.queue.nowUs + 1);
  const fire = state.queue.pending.find(event => event.payload.type === "weapon-fire");
  assert.ok(fire);
  advance(state, fire.dueUs);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [2, 1]);
  const activeDamage = state.recentHits[1].amount;
  const natural = structuredClone(state);
  const now = natural.queue.nowUs;
  scheduleEvent(natural.queue, 31_250, { type: "movement" }, 31_250);
  advance(natural, until + 3_000_000);
  const later = natural.recentHits.find(hit => hit.atUs > Math.max(until, now) && hit.targetId === 1);
  assert.ok(later);
  assert.ok(activeDamage > later.amount * 5);
});
