import assert from "node:assert/strict";
import { test } from "node:test";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, heroSpellTargets, newMatch } from "../src/game/m2/match.ts";
import { effectiveMoveSpeed } from "../src/game/m2/movement.ts";

function advance(state, targetUs, limit = 10_000) {
  state.clock.targetUs = targetUs;
  let result = drain(state, limit);
  while (limit > 1 && result === "pending") result = drain(state, limit);
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("night-stalker-controlled", 47);
  state.queue.pending = state.queue.pending.filter(event => event.payload.type === "world-night-change");
  const hero = newHero("H050");
  hero.level = 20;
  hero.points = 12;
  hero.natural.INT = 200;
  const tower = { ...map.worker, id: 900, templateId: "H050", radius: 72, pending: null, qualification: null, hero };
  const enemy = { ...map.worker, x: tower.x + 100, id: 910, unitId: "m001", hp: 100_000, maxHp: 100_000,
    layer: "ground", mana: 0, armor: 0, points: 0, speed: 200, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.structures = [tower];
  state.enemies = [enemy];
  return { state, tower, enemy };
}

function learn(state, tower, skillId) {
  assert.ok(command(state, "learn-" + state.queue.nextSequence, { type: "learn-skill", towerId: tower.id, skillId }).ok);
}

function cast(state, tower, skillId, target) {
  assert.ok(command(state, "cast-" + state.queue.nextSequence, { type: "cast-hero", towerId: tower.id,
    skillId, ...(target && { targetId: target.id }) }).ok);
  const event = state.queue.pending.find(({ payload }) => payload.type === "hero-spell" && payload.skillId === skillId);
  assert.equal(event.dueUs - state.queue.nowUs, 300_000);
  return event.dueUs;
}

test("A192 day deals one physical packet before its saved zero-delay carrier command", () => {
  const { state, tower, enemy } = fixture();
  const other = { ...enemy, id: 911, x: enemy.x + 50 };
  state.enemies.push(other);
  learn(state, tower, "A192");
  const at = cast(state, tower, "A192", enemy);
  const initialMana = tower.mana;
  const restoredWindup = JSON.parse(JSON.stringify(state));
  advance(state, at, 1);
  const carrier = state.queue.pending.find(event => event.payload.type === "void-carrier-expire");
  assert.deepEqual([carrier.dueUs, carrier.payload.mana, carrier.payload.targetId], [at + 1_000_000, 1000, enemy.id]);
  assert.equal(state.battleAnimations.at(-1).unitId, "A192");
  assert.equal(enemy.voidSlowUntilUs, undefined);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [enemy.id]);
  assert.equal(other.hp, other.maxHp);
  assert.equal(tower.mana, initialMana - 20);
  const restored = JSON.parse(JSON.stringify(state));
  for (const current of [state, restored, restoredWindup]) advance(current, at);
  assert.deepEqual(restored, state);
  assert.deepEqual(restoredWindup, state);
  assert.equal(carrier.payload.mana, 990);
  assert.equal(effectiveMoveSpeed(enemy), 100);
  advance(state, at + 3_000_000);
  assert.equal(effectiveMoveSpeed(enemy), 200);
});

test("A192 still attempts slow if its damage kills and pays for a shielded slow on a living target", () => {
  for (const lethal of [true, false]) {
    const { state, tower, enemy } = fixture();
    if (lethal) enemy.hp = enemy.maxHp = 1;
    else enemy.abilities = ["N535"];
    learn(state, tower, "A192");
    const at = cast(state, tower, "A192", enemy);
    advance(state, at);
    const { payload } = state.queue.pending.find(event => event.payload.type === "void-carrier-expire");
    assert.equal(payload.mana, lethal ? 1000 : 990);
    assert.equal(payload.targetId, enemy.id);
    assert.equal(enemy.voidSlowUntilUs, undefined);
    assert.equal(state.recentHits[0].targetId, enemy.id);
    if (lethal) assert.ok(!state.enemies.includes(enemy));
    else assert.equal(enemy.spellShieldReadyUs, at + 6_000_000);
  }
});

test("A193 natural B05 edges and saved marker state implement Q43 and skip absent or dead units", () => {
  const { state, tower } = fixture();
  const second = { ...tower, id: 911, hero: structuredClone(tower.hero) };
  state.structures.push(second);
  learn(state, tower, "A193");
  assert.deepEqual(tower.nightHunter, { registered: true, marks: [], attackRank: 1, speedRank: 1 });
  advance(state, 119_999_999);
  assert.equal(state.worldNight, false);
  advance(state, 120_000_000);
  assert.equal(state.worldNight, true);
  assert.deepEqual(tower.nightHunter.marks, ["T214"]);
  assert.equal(tower.nightHunter.speedRank, 7);
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: second.id, choice: "S322" }).ok);
  learn(state, second, "A193");
  assert.deepEqual(second.nightHunter.marks, ["T255", "T257"]);
  assert.equal(second.nightHunter.attackRank, 7);
  tower.life = { hp: 0, maximum: 1, staticMaximum: 1, lastUs: state.queue.nowUs, regen: 0 };
  const restored = JSON.parse(JSON.stringify(state));
  for (const current of [state, restored]) advance(current, 240_000_000);
  assert.deepEqual(restored, state);
  assert.equal(state.worldNight, false);
  assert.deepEqual(tower.nightHunter.marks, ["T214"]);
  assert.deepEqual(second.nightHunter.marks, []);
  assert.equal(second.nightHunter.speedRank, 1);
  assert.equal(state.queue.pending[0].dueUs, 360_000_000);
});

test("A194 refresh replaces its timer, keeps skin identity and colors separate from natural night", () => {
  const { state, tower } = fixture();
  learn(state, tower, "A193");
  learn(state, tower, "A194");
  const first = cast(state, tower, "A194");
  advance(state, first + 100_000);
  const oldTimer = tower.nightHunter.personalTimer;
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S322" }).ok);
  assert.deepEqual(tower.nightHunter.marks, ["T215"]);
  tower.heroSpellReady.A194 = 0;
  const second = cast(state, tower, "A194");
  advance(state, second);
  assert.deepEqual(tower.nightHunter.marks, ["T215", "T256", "T258"]);
  assert.notEqual(tower.nightHunter.personalTimer, oldTimer);
  assert.ok(!state.queue.pending.some(event => event.timerId === oldTimer));
  advance(state, first + 15_000_000);
  assert.equal(tower.nightHunter.attackRank, 7);
  advance(state, second + 15_000_000);
  assert.deepEqual(tower.nightHunter.marks, []);
  assert.equal(tower.nightHunter.attackRank, 1);
});

test("A192 night hits the closed circle in B04 order and reevaluates separate live slow targets", () => {
  const { state, tower, enemy } = fixture();
  learn(state, tower, "A192");
  learn(state, tower, "A193");
  const day = cast(state, tower, "A192", enemy);
  advance(state, day);
  const dayAmount = state.recentHits[0].amount;
  advance(state, 120_000_000);
  const edge = { ...enemy, id: 911, x: enemy.x + 350, abilities: ["Amim"] };
  const hidden = { ...enemy, id: 912, x: enemy.x + 300, invisibleFromUs: state.queue.nowUs, speedBuffUntilUs: 130_000_000 };
  const dead = { ...enemy, id: 913, x: enemy.x + 100, hp: 1 };
  const outside = { ...enemy, id: 914, x: enemy.x + 351 };
  state.enemies.push(outside, dead, hidden, edge);
  assert.ok(heroSpellTargets(state, tower.id, "A192").includes(edge));
  assert.ok(!heroSpellTargets(state, tower.id, "A192").includes(hidden));
  const at = cast(state, tower, "A192", enemy);
  advance(state, at);
  const hits = state.recentHits.filter(hit => hit.atUs === at);
  assert.deepEqual(hits.map(hit => hit.targetId), [enemy.id, edge.id, hidden.id, dead.id]);
  assert.ok(Math.abs(hits[0].amount - dayAmount * 1.8) < .00001);
  assert.equal(state.battleAnimations.at(-1).unitId, "A192Night");
  const carriers = state.queue.pending.filter(event => event.payload.type === "void-carrier-expire");
  assert.deepEqual(carriers.map(event => [event.payload.targetId, event.payload.mana, event.dueUs]),
    [[enemy.id, 990, at + 2_000_000], [edge.id, 1000, at + 2_000_000], [hidden.id, 1000, at + 2_000_000]]);
  assert.equal(enemy.voidSlowUntilUs, at + 3_000_000);
  assert.equal(edge.voidSlowUntilUs, undefined);
  assert.equal(hidden.voidSlowUntilUs, undefined);
});
