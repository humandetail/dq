import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("m3-windranger", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H041");
  hero.natural = { STR: 0, AGI: 100, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H041", radius: 72, pending: null, population: 20,
    qualification: "P006", hero, autoModes: { A161: false, A162: false, A163: false } };
  state.structures = [tower];
  const template = state.enemies[0];
  const enemy = (id, dx, dy = 0, overrides = {}) => ({ ...template, id, x: tower.x + dx, y: tower.y + dy,
    speed: 0, hp: 100_000, maxHp: 100_000, armor: 0, abilities: [], ...overrides });
  state.enemies = [];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const cast = (skillId, options = {}) => {
    assert.ok(command(skillId + "-" + state.queue.nowUs, { type: "cast-hero", towerId: tower.id, skillId, ...options }).ok);
    const dueUs = state.queue.nowUs + 300_000;
    advance(state, dueUs);
    return dueUs;
  };
  return { state, tower, enemy, command, cast };
}

test("A161 links a selected ally as a waypoint without harming it and delivers separate native carrier stuns", () => {
  const { state, tower, enemy, command, cast } = fixture();
  tower.hero.ranks.A161 = 1;
  assert.ok(command("skin", { type: "choose-skin", towerId: tower.id, choice: "S332" }).ok);
  assert.equal(tower.templateId, "G072");
  const ally = { id: 20, templateId: "n001", x: tower.x + 520, y: tower.y, radius: 32, pending: null, population: 2 };
  state.structures.push(ally);
  const first = enemy(21, 300, 0, { abilities: ["N535"] });
  const skipped = enemy(30, 360);
  const last = enemy(22, 820);
  const outside = enemy(23, 1100, 270);
  state.enemies = [skipped, last, first, outside];
  const effectUs = cast("A161", { targetId: first.id });
  assert.equal(first.spellShieldReadyUs, effectUs + 6_000_000);
  assert.equal(first.stunUntilUs, undefined);
  assert.equal(last.stunUntilUs, effectUs + 3_000_000);
  assert.equal(skipped.stunUntilUs, undefined);
  assert.equal(outside.stunUntilUs, undefined);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.sourceTemplate]), [[last.id, "q001"]]);
  const carriers = state.queue.pending.filter(({ payload }) => payload.type === "focus-carrier-expire").map(({ payload }) => payload);
  assert.deepEqual(carriers.map(row => [row.skillId, row.point.x, row.mana]), [
    ["T261", first.x, 998], ["T261", ally.x, 1000], ["T261", last.x, 998],
  ]);
  assert.deepEqual(state.battleAnimations.filter(effect => effect.unitId === "MFPB").map(effect => effect.durationUs), [2_000_000, 2_000_000]);
  advance(state, effectUs + 100_000);
  assert.equal(first.stunUntilUs, effectUs + 200_000);
  assert.equal(first.hp, 100_000);
});

test("A161 preserves the non-wrapping strict angle test near the western seam", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A161 = 1;
  const first = enemy(21, -300, 2);
  const wrapped = enemy(22, -500, -2);
  const remaining = enemy(23, -550, 3);
  state.enemies = [wrapped, remaining, first];
  cast("A161", { targetId: first.id });
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [first.id, remaining.id]);
});

test("A162 uses the closed transverse wave, live fields and capped raw attack rate for each successive hit", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A162 = 1;
  const first = enemy(21, 300, 200, { abilities: ["N535"] });
  const others = [22, 23, 24, 25, 26, 27, 28, 29].map((id, index) => enemy(id, 600 + 150 * index));
  const outside = enemy(30, 900, 201);
  state.enemies = [outside, ...others.toReversed(), first];
  const effectUs = cast("A162", { point: { x: tower.x + 900, y: tower.y } });
  advance(state, effectUs + 99_999);
  assert.equal(state.recentHits, undefined);
  advance(state, effectUs + 100_000);
  assert.equal(state.recentHits[0].targetId, first.id);
  assert.ok(Math.abs(state.recentHits[0].amount - 143 * 1.2 * 1.5 * .8 * 1.1) < 1e-8);
  assert.equal(first.spellShieldReadyUs, undefined);
  tower.hero.ranks.A162 = 2;
  tower.hero.natural.AGI = 1100;
  tower.hero.natural.INT = 200;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, effectUs + 666_667);
  const expected = 283 * 3 * 1.9 * .8 * 1.2;
  assert.deepEqual(restored.recentHits.map(hit => hit.targetId), [21, 22, 23, 24, 25, 26, 27, 28, 29]);
  assert.ok(restored.recentHits.slice(1).every((hit, index) => Math.abs(hit.amount -
    expected * [.9, .8, .7, .6, .5, .4, .4, .4][index]) < 1e-7));
  assert.equal(restored.enemies.find(unit => unit.id === outside.id).hp, 100_000);
});

test("A163 accepted alternate cast unwinds the preparatory windup, rejected command does not, and S332 uses H120", () => {
  const { state, tower, enemy, command, cast } = fixture();
  tower.hero.ranks = { A161: 1, A163: 1 };
  assert.ok(command("skin", { type: "choose-skin", towerId: tower.id, choice: "S332" }).ok);
  const victim = enemy(21, 320);
  state.enemies = [victim];
  const focus = () => command("focus-" + state.queue.nowUs, { type: "cast-hero", towerId: tower.id, skillId: "A163" });
  assert.ok(focus().ok);
  assert.equal(command("bad", { type: "cast-hero", towerId: tower.id, skillId: "A161", targetId: 1000 }).reason, "range");
  const focusTimer = tower.spellWindup;
  assert.ok(state.queue.pending.some(row => row.timerId === focusTimer));
  assert.ok(command("replace", { type: "cast-hero", towerId: tower.id, skillId: "A161", targetId: victim.id }).ok);
  assert.ok(!state.queue.pending.some(row => row.timerId === focusTimer));
  advance(state, 1_000_000);
  assert.equal(tower.heroSpellReady.A163, undefined);
  assert.equal(tower.focusFire, undefined);
  const effect = cast("A163");
  const aura = state.battleAnimations.find(animation => animation.unitId === "H120");
  assert.deepEqual([aura.atUs, aura.durationUs], [effect, 3_000_000]);
  assert.equal(tower.focusCycleReductionUs, 200_000);
  assert.equal(tower.focusFire.untilUs, effect + 3_000_000);
  assert.ok(command("skip-recovery", { type: "focus-target", towerId: tower.id, targetId: victim.id }).ok);
  assert.equal(tower.focusRecoveryUntilUs, undefined);
  assert.equal(tower.heroCastUntilUs, state.queue.nowUs);
  assert.ok(tower.focusFire);
});

test("A163 original cooldown table retains a forced stale callback, restores one C decrement, and keeps B060 separate", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A163 = 1;
  state.enemies = [enemy(21, 500)];
  const first = cast("A163");
  const priorRestore = tower.focusRestoreTimer;
  advance(state, first + 700_000);
  tower.heroSpellReady.A163 = 0;
  const second = cast("A163");
  assert.equal(tower.focusCycleReductionUs, 400_000);
  assert.ok(state.queue.pending.some(row => row.timerId === priorRestore));
  assert.equal(tower.focusFire.untilUs, second + 3_000_000);
  const resumed = JSON.parse(JSON.stringify(state));
  advance(resumed, first + 3_000_000);
  assert.equal(resumed.structures[0].focusCycleReductionUs, 400_000);
  assert.ok(resumed.structures[0].focusFire);
  advance(resumed, second + 3_000_000);
  assert.equal(resumed.structures[0].focusCycleReductionUs, 200_000);
  assert.equal(resumed.structures[0].focusRestoreTimer, undefined);
  assert.equal(resumed.structures[0].focusFire, undefined);
});

test("A163 uses actual live i310 qualification at impact and applies its separate +5 R and −0.2 C", () => {
  const { state, tower, enemy, command, cast } = fixture();
  tower.hero.ranks.A163 = 1;
  const target = enemy(21, 90);
  state.enemies = [target];
  const effectUs = cast("A163");
  advance(state, effectUs + 510_000);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, effectUs + 510_001);
  assert.equal(tower.attack.timing.cycleUs, 1_000_000);
  assert.equal(tower.attack.timing.rawRate, 6.2);
  const windup = tower.attack.timing.windup.dueUs;
  advance(state, windup);
  const shots = () => state.queue.pending.filter(row => row.payload.type === "weapon-impact").map(row => row.payload.shot);
  const first = shots().find(shot => shot.targetId === target.id);
  advance(state, windup + 100_000);
  assert.ok(Math.abs(state.recentHits[0].amount - first.raw * 1.4 * .8) < 1e-8);

  const nextStartUs = tower.attack.timing.cooldown.dueUs;
  advance(state, nextStartUs);
  const secondWindup = tower.attack.timing.windup.dueUs;
  advance(state, secondWindup);
  const second = shots().find(shot => shot.targetId === target.id);
  state.structures.push({ ...map.worker, x: tower.x + 3000, id: 901, templateId: "n167", pending: null });
  state.inventory.push({ id: 920, itemId: "i310", slot: 3, point: map.worker, charges: 0 });
  assert.ok(command("scepter", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  advance(state, secondWindup + 100_000);
  const enhanced = state.recentHits.at(-1);
  assert.equal(enhanced.atUs, secondWindup + 100_000);
  assert.ok(Math.abs(enhanced.amount - second.raw * 1.4 * 1.024) < 1e-8);
  assert.equal(tower.focusFire.untilUs, effectUs + 3_000_000);
});

test("A163 continues auto selection and a subsequent accepted A162 replaces its uncommitted command", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks = { A162: 1, A163: 1 };
  tower.autoModes = {};
  state.enemies = [enemy(21, 450)];
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 2);
  assert.deepEqual(state.queue.pending.filter(({ payload }) => payload.type === "hero-spell").map(({ payload }) => payload.skillId), ["A162"]);
  advance(state, 300_002);
  assert.equal(tower.heroSpellReady.A163, undefined);
  assert.equal(tower.heroSpellReady.A162, 15_300_002);
  assert.equal(tower.focusCycleReductionUs, undefined);
});

test("A162 lands at its analytical contact when a flying target enters the width between movement events", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A162 = 1;
  const target = enemy(21, 20, 202, {
    layer: "fly", speed: 320, path: [{ x: tower.x + 20, y: tower.y - 100 }],
  });
  state.enemies = [target];
  scheduleEvent(state.queue, 331_251, { type: "movement" });
  const effect = cast("A162", { point: { x: tower.x + 600, y: tower.y } });
  advance(state, effect + 6_666);
  assert.equal(state.recentHits, undefined);
  assert.ok(target.y < tower.y + 200);
  advance(state, effect + 6_667);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.atUs]), [[target.id, effect + 6_667]]);
});

test("A163 magic immunity blocks T171 without undoing committed resource, cycle reduction or restoration", () => {
  const { state, tower, cast } = fixture();
  tower.hero.ranks.A163 = 1;
  tower.spellImmunity = { untilUs: 10_000_000 };
  const effect = cast("A163");
  assert.equal(tower.heroSpellReady.A163, effect + 12_000_000);
  assert.equal(tower.focusFire, undefined);
  assert.equal(tower.focusCycleReductionUs, 200_000);
  assert.ok(state.queue.pending.some(({ payload }) => payload.type === "focus-carrier-expire" && payload.skillId === "T171"));
  advance(state, effect + 3_000_000);
  assert.equal(tower.focusRestoreTimer, undefined);
  assert.equal(tower.focusCycleReductionUs, undefined);
});
