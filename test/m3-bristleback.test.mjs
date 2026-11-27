import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage } from "../src/game/m2/combat.ts";
import { addHeroExperience, newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { effectiveMoveSpeed } from "../src/game/m2/movement.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 1000) === "pending") {}
}

function fixture(warpath = 6, spell = 1) {
  const state = newMatch("bristleback", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const original = state.enemies[0];
  const tower = { id: 900, templateId: "H047", hero: newHero("H047"), x: -288, y: -128,
    radius: 72, pending: null, qualification: null, autoModes: { A182: false } };
  addHeroExperience(tower.hero, tower.templateId, 500_000, () => true);
  state.structures = [tower];
  state.enemies = [];
  const enemy = (id, distance = 400, abilities = []) => ({ ...original, x: tower.x + distance, y: tower.y, id,
    hp: 1_000_000, maxHp: 1_000_000, armor: 0, speed: 0, abilities });
  const issue = (run, actor, type, skillId) => {
    const at = run.queue.nowUs;
    const id = `bristle-${at}`;
    assert.ok(enqueue(run, { id, action: { type, towerId: actor.id, skillId }, matchId: run.matchId }));
    advance(run, at + 1);
    assert.equal(run.commandResults[id].ok, true, JSON.stringify(run.commandResults[id]));
  };
  for (let i = 0; i < spell; i++) issue(state, tower, "learn-skill", "A182");
  for (let i = 0; i < warpath; i++) issue(state, tower, "learn-skill", "A183");
  const cast = (run = state, actor = tower, skill = "A182") => {
    if (actor.heroSpellReady?.[skill]) advance(run, Math.max(run.queue.nowUs, actor.heroSpellReady[skill]));
    issue(run, actor, "cast-hero", skill);
    advance(run, run.queue.nowUs + 400_000);
    return run.queue.nowUs;
  };
  return { state, tower, enemy, cast, issue };
}

test("A181 writes T203 at the closed radius and N535 protects only against the tracked T204 slow", () => {
  const { state, tower, enemy, cast, issue } = fixture(0);
  issue(state, tower, "learn-skill", "A181");
  const edge = enemy(301, 550);
  const shielded = enemy(302, 160, ["N535"]);
  const immune = enemy(303, 300, ["Amim"]);
  const outside = enemy(304, 550.001);
  state.enemies = [outside, immune, shielded, edge];
  const effect = cast(state, tower, "A181");
  assert.equal(tower.heroSpellReady.A181, effect + 2_500_000);
  const carriers = state.queue.pending.filter(event => event.payload.type === "bristle-goo-carrier-end");
  assert.deepEqual(carriers.map(event => [event.payload.targetId, event.dueUs]), [301, 302, 303].map(id => [id, effect + 1_000_000]));
  assert.equal(new Set(carriers.map(event => event.payload.sourceId)).size, 3);
  for (const target of [edge, shielded, immune]) {
    assert.deepEqual(target.bristleGooArmor, { level: 1, value: 5 });
    assert.equal(target.bristleGoo[tower.id].stacks, 1);
    assert.equal(target.bristleGooSlow, undefined);
  }
  assert.equal(outside.bristleGooArmor, undefined);
  advance(state, effect + 200_000);
  assert.equal(shielded.spellShieldReadyUs, effect + 6_200_000);
  assert.equal(shielded.bristleGooSlow, undefined);
  const loaded = JSON.parse(JSON.stringify(state));
  const victim = loaded.enemies.find(unit => unit.id === edge.id);
  advance(loaded, effect + 687_499);
  assert.equal(victim.bristleGooSlow, undefined);
  advance(loaded, effect + 687_500);
  assert.deepEqual(victim.bristleGooSlow, { factor: .92, untilUs: effect + 5_687_500 });
  victim.speed = 250;
  assert.equal(effectiveMoveSpeed(victim), 230);
  advance(loaded, effect + 5_687_500);
  assert.equal(effectiveMoveSpeed(victim), 250);
  assert.deepEqual(victim.bristleGooArmor, { level: 1, value: 5 });
  assert.equal(loaded.enemies.find(unit => unit.id === immune.id).bristleGooSlow, undefined);
  advance(loaded, effect + 12_000_000);
  assert.equal(victim.bristleGoo, undefined);
  assert.equal(victim.bristleGooArmor, undefined);
});

test("A181 caps each caster, selects the shared encoded armor stage and expires it on any source timer", () => {
  const { state, tower, enemy, cast, issue } = fixture(0);
  const stronger = { ...tower, id: 902, hero: newHero("H047") };
  addHeroExperience(stronger.hero, stronger.templateId, 500_000, () => true);
  state.structures.push(stronger);
  issue(state, tower, "learn-skill", "A181");
  for (let i = 0; i < 6; i++) issue(state, stronger, "learn-skill", "A181");
  const target = enemy(301, 0);
  state.enemies = [target];
  const first = cast(state, tower, "A181");
  advance(state, first + 8_000_000);
  const second = cast(state, stronger, "A181");
  assert.deepEqual(target.bristleGooArmor, { level: 22, value: 20 });
  assert.deepEqual(Object.keys(target.bristleGoo), ["900", "902"]);
  assert.equal(target.bristleGooSlow.untilUs, second + 5_000_000);
  advance(state, first + 12_000_000);
  assert.equal(target.bristleGooArmor, undefined);
  assert.equal(target.bristleGooSlow, undefined);
  assert.equal(target.bristleGoo[stronger.id].stacks, 1);
  for (let i = 0; i < 5; i++) cast(state, stronger, "A181");
  assert.equal(target.bristleGoo[stronger.id].stacks, 5);
  assert.deepEqual(target.bristleGooArmor, { level: 26, value: 100 });
  assert.equal(target.bristleGooSlow.factor, .6);
});

test("A181 automated self cast checks 450 and precedes the ordinary quill order", () => {
  const automatic = distance => {
    const { state, tower, enemy, issue } = fixture(0);
    issue(state, tower, "learn-skill", "A181");
    tower.autoModes.A182 = true;
    state.enemies = [enemy(301, distance)];
    scheduleEvent(state.queue, 1, { type: "movement" });
    advance(state, state.queue.nowUs + 1);
    return state.queue.pending.find(event => event.payload.type === "hero-spell")?.payload.skillId;
  };
  assert.equal(automatic(450), "A181");
  assert.equal(automatic(450.001), "A182");
});

test("A182 samples its closed circle in engine order and only positive physical packets write independent layers", () => {
  const { state, tower, enemy, cast } = fixture(0);
  const immune = enemy(301, 800, ["Amim"]);
  const outside = enemy(302, 800.001);
  const protectedUnit = enemy(303, 100, ["Avul"]);
  const shielded = enemy(304, 120, ["N535"]);
  shielded.barrier = { hits: 1, untilUs: 7_000_000 };
  const hidden = enemy(305, 200);
  hidden.invisibleFromUs = 0;
  hidden.speedBuffUntilUs = 12_000_000;
  state.enemies = [shielded, outside, hidden, protectedUnit, immune];
  cast();
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [301]);
  assert.equal(immune.quills[tower.id].stacks, 1);
  assert.equal(shielded.quills, undefined);
  assert.equal(shielded.spellShieldReadyUs, undefined);
  const second = cast();
  assert.equal(shielded.quills[tower.id].stacks, 1);
  assert.equal(immune.quills[tower.id].stacks, 2);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, second + 7_999_999);
  assert.equal(restored.enemies.find(unit => unit.id === 301).quills[tower.id].stacks, 2);
  advance(restored, second + 8_000_000);
  assert.equal(restored.enemies.find(unit => unit.id === 301).quills[tower.id], undefined);
});

test("A183 executes the fifth, seventh, tenth and repeating twelfth layers in order with live attributes", () => {
  const { state, tower, enemy, cast } = fixture();
  const target = enemy(301);
  const protectedTarget = enemy(302, 500, ["N535"]);
  state.enemies = [target, protectedTarget];
  for (let layer = 1; layer <= 13; layer++) {
    const time = cast();
    assert.equal(target.quills[tower.id].stacks, Math.min(layer, 12));
    const hits = state.recentHits.filter(hit => hit.targetId === target.id && hit.atUs === time);
    if (layer === 5) {
      assert.equal(target.stunUntilUs, time + 1_000_000);
      assert.equal(protectedTarget.stunUntilUs, undefined);
      assert.equal(protectedTarget.spellShieldReadyUs, time + 6_000_000);
      assert.deepEqual(hits.map(hit => hit.sourceTemplate), [tower.templateId, "q001"]);
    } else if (layer === 7) assert.equal(hits[0].amount, hits[1].amount);
    else if (layer === 10) assert.ok(hits[1].amount > hits[0].amount);
    else if (layer >= 12) {
      const raw = target.maxHp * (4 + Math.floor(tower.hero.natural.INT / 30)) / 100;
      const expected = physicalDamage(raw, "hero", 0, false) * (1 + tower.hero.natural.STR * .0006);
      assert.ok(Math.abs(hits[1].amount - expected) < 1e-8);
    } else assert.equal(hits.length, 1);
  }
});

test("rank-five execution is a q025 packet below the threshold and the capped eleventh cast does not retrigger", () => {
  const { state, tower, enemy, cast } = fixture(5);
  const target = enemy(301);
  const survivor = enemy(302, 500);
  state.enemies = [target, survivor];
  for (let i = 0; i < 9; i++) cast();
  target.hp = target.maxHp * .199;
  const tenth = cast();
  assert.equal(state.enemies.includes(target), false);
  assert.equal(state.recentHits.find(hit => hit.atUs === tenth && hit.deadUnitId)?.sourceTemplate, "q025");
  assert.equal(survivor.quills[tower.id].stacks, 10);
  const next = cast();
  assert.equal(state.recentHits.filter(hit => hit.atUs === next && hit.targetId === survivor.id).length, 1);
});
