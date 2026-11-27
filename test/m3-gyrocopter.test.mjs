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
  const state = newMatch("m3-gyrocopter", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H051");
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H051", radius: 72, population: 20, pending: null,
    qualification: "P001", hero, autoModes: { A195: false, A196: false, A197: false } };
  state.structures = [tower];
  const sample = state.enemies[0];
  const enemy = (id, dx, dy = 0, overrides = {}) => ({ ...sample, id, x: tower.x + dx, y: tower.y + dy, speed: 0, armor: 0,
    hp: 100_000, maxHp: 100_000, abilities: [], ...overrides });
  state.enemies = [];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const cast = (skillId, options = {}) => command(skillId + "-" + state.queue.nowUs, { type: "cast-hero", skillId, towerId: tower.id, ...options });
  return { state, tower, enemy, command, cast };
}

test("A195 fires exactly 30 independent contacts, while N535 remains untouched and JSON restores the repeating timer", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A195 = 1;
  const target = enemy(21, 0, 0, { abilities: ["N535"] });
  state.enemies = [target, enemy(22, 50, 0, { abilities: ["ACmi"] })];
  assert.ok(cast("A195").ok);
  advance(state, 110_001);
  assert.equal(state.recentHits, undefined);
  advance(state, 110_002);
  assert.deepEqual([state.recentHits[0].targetId, state.recentHits[0].atUs, state.recentHits[0].amount], [21, 110_002, 176]);
  const checkpoint = JSON.parse(JSON.stringify(state));
  advance(checkpoint, 3_110_002);
  advance(state, 3_110_002);
  assert.deepEqual(checkpoint, JSON.parse(JSON.stringify(state)));
  assert.equal(checkpoint.structures[0].barrageTimer, undefined);
  assert.equal(checkpoint.recentHits.length, 30);
  assert.equal(checkpoint.recentHits.at(-1).atUs, 3_010_002);
  assert.equal(checkpoint.enemies[0].spellShieldReadyUs, undefined);
});

test("A195 a blank interval skips the draw and never delays the next voluntary firing opportunity", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A195 = 1;
  const target = enemy(21, 801);
  state.enemies = [target];
  assert.ok(cast("A195").ok);
  advance(state, 10_002);
  const random = state.randomState;
  advance(state, 1_010_002);
  assert.equal(state.randomState, random);
  assert.equal(state.recentHits, undefined);
  target.x = tower.x;
  advance(state, 1_110_002);
  assert.equal(state.recentHits.length, 1);
  assert.equal(state.recentHits[0].atUs, 1_110_002);
  advance(state, 3_110_002);
  assert.equal(state.recentHits.length, 20);
});

test("A196 starts instantly and emits 1600-speed side rockets through the actual closed 1000 radius", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A196 = 1;
  const main = enemy(21, 400);
  const edge = enemy(22, 1000, 0, { abilities: ["ACmi", "N535"] });
  const outside = enemy(23, 1001);
  state.enemies = [main, edge, outside];
  state.inventory.push({ id: 920, itemId: "i188", towerId: tower.id, slot: 0, point: map.worker, charges: 0 });
  assert.ok(cast("A196").ok);
  assert.equal(tower.flak.remaining, 3);
  assert.equal(tower.heroSpellReady.A196, 10_000_002);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 3);
  assert.equal(tower.flak.remaining, 2);
  assert.equal(tower.attack.flakToken, tower.flak.timerId);
  advance(state, tower.attack.timing.windup.dueUs);
  const shots = state.queue.pending.filter(entry => entry.payload.type === "weapon-impact").map(entry => entry.payload.shot);
  assert.deepEqual(shots.map(shot => [shot.targetId, shot.weapon.speed, shot.secondary]), [[21, 3000, undefined], [22, 1600, true]]);
  assert.equal(shots[0].corrosion, undefined);
  assert.equal(shots[1].raw, 1);
  advance(state, 1_200_000);
  assert.ok(state.recentHits.some(hit => hit.targetId === 21 && hit.amount > 1.4));
  assert.ok(Math.abs(state.recentHits.find(hit => hit.targetId === 22).amount - 1.4) < 1e-8);
  assert.equal(edge.spellShieldReadyUs, undefined);
  assert.equal(outside.hp, 100_000);
});

test("A196 automatically spends its first allowance and cancelling that windup does not refund it", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks = { A196: 1, A197: 1 };
  tower.autoModes.A196 = true;
  state.enemies = [enemy(21, 400)];
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 2);
  assert.equal(tower.flak.remaining, 2);
  assert.equal(tower.attack.flakToken, tower.flak.timerId);
  assert.equal(tower.attack.winding, true);
  assert.ok(cast("A197", { point: tower }).ok);
  assert.equal(tower.flak.remaining, 2);
  assert.equal(tower.attack.winding, false);
  assert.equal(state.queue.pending.some(row => row.payload.type === "weapon-fire"), false);
});

test("A196 late secondary keeps the gear's physical multiplier but does not roll its T217 special", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A196 = 1;
  state.inventory.push({ id: 920, itemId: "i132", towerId: tower.id, slot: 0, point: map.worker, charges: 0 });
  const main = enemy(21, 400);
  const side = enemy(22, 1000);
  state.enemies = [main, side];
  assert.ok(cast("A196").ok);
  scheduleEvent(state.queue, 2_400_000, { type: "movement" });
  advance(state, 2_400_002);
  advance(state, tower.attack.timing.windup.dueUs);
  assert.ok(state.queue.pending.some(({ payload }) => payload.type === "weapon-impact" && payload.shot.secondary));
  advance(state, 3_000_002);
  assert.equal(tower.flak, undefined);
  advance(state, 3_700_000);
  const sideHit = state.recentHits.find(hit => hit.targetId === side.id);
  assert.ok(sideHit.atUs > 3_000_002);
  assert.ok(Math.abs(sideHit.amount - 1.4 * 1.25 * (1 + 70 * .0006)) < 1e-8);
  assert.equal(state.recentHits.filter(hit => hit.targetId === side.id).length, 1);
});

test("A196 a base-form rocket already in flight reads live T217 and i132 after S402", () => {
  const { state, tower, enemy, cast, command } = fixture();
  tower.hero.ranks.A196 = 1;
  tower.qualification = "P006";
  state.structures.push({ ...map.worker, x: tower.x + 3000, id: 901, templateId: "n167", pending: null });
  state.inventory.push({ id: 920, itemId: "i132", towerId: tower.id, slot: 0, point: map.worker, charges: 0 });
  const side = enemy(22, 1000);
  state.enemies = [enemy(21, 400), side];
  assert.ok(cast("A196").ok);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 3);
  advance(state, tower.attack.timing.windup.dueUs);
  const rocket = state.queue.pending.find(({ payload }) => payload.type === "weapon-impact" && payload.shot.secondary);
  assert.equal(rocket.payload.shot.sourceTemplate, "H051");
  const contactUs = state.queue.nowUs + 625_000;
  assert.ok(command("skin", { type: "choose-skin", towerId: tower.id, choice: "S402" }).ok);
  assert.ok(command("pickup", { type: "pick-up-item", itemId: 920 }).ok);
  assert.ok(command("gear", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  advance(state, contactUs - 1);
  assert.equal(tower.templateId, "G080");
  assert.ok(tower.flak);
  state.randomState = 1972;
  advance(state, contactUs);
  const packets = state.recentHits.filter(hit => hit.targetId === side.id && hit.atUs === contactUs);
  assert.deepEqual(packets.map(hit => hit.sourceTemplate), ["G080", "H051"]);
  assert.ok(packets[0].amount > 500);
  assert.ok(Math.abs(packets[1].amount - 1.4 * 1.25 * (1 + 100 * .0006)) < 1e-8);
});

test("A196 the last reserved round still launches, then the next start clears the marker without a fourth rocket", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A196 = 1;
  tower.hero.natural.AGI = 900;
  state.enemies = [enemy(21, 50), enemy(22, 80)];
  assert.ok(cast("A196").ok);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 3);
  for (const remaining of [2, 1, 0]) {
    assert.equal(tower.flak.remaining, remaining);
    advance(state, tower.attack.timing.windup.dueUs);
    const missile = state.queue.pending.find(({ payload }) =>
      payload.type === "weapon-impact" && payload.shot.secondary && payload.shot.targetId === 22);
    assert.ok(missile);
    assert.equal(tower.flak.remaining, remaining);
    advance(state, tower.attack.timing.cooldown.dueUs);
  }
  assert.equal(tower.flak, undefined);
  assert.equal(state.recentHits.filter(hit => hit.targetId === 22).length, 3);
  advance(state, tower.attack.timing.windup.dueUs);
  assert.equal(state.queue.pending.some(({ payload }) => payload.type === "weapon-impact" && payload.shot.secondary), false);
});

test("A197 separates area from individual shield/slow, uses live second rank and preserves saved S402 effects", () => {
  const { state, tower, enemy, command, cast } = fixture();
  tower.hero.ranks.A197 = 1;
  assert.ok(command("skin", { type: "choose-skin", towerId: tower.id, choice: "S402" }).ok);
  assert.equal(tower.templateId, "G080");
  const center = { x: tower.x + 700, y: tower.y };
  const shielded = enemy(21, 700, 0, { abilities: ["N535"] });
  const inner = enemy(22, 1200);
  const outer = enemy(23, 1300);
  const outside = enemy(24, 1301);
  state.enemies = [outside, outer, inner, shielded];
  assert.ok(cast("A197", { point: center }).ok);
  const effect = state.queue.nowUs + 10_000;
  advance(state, effect + 1_999_999);
  assert.equal(state.recentHits, undefined);
  advance(state, effect + 2_000_000);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [21, 22, 23]);
  assert.equal(shielded.spellShieldReadyUs, effect + 8_000_000);
  assert.equal(shielded.calldownSlow, undefined);
  assert.deepEqual(inner.calldownSlow, { untilUs: effect + 4_000_000, factor: .5 });
  assert.equal(outer.calldownSlow, undefined);
  const boundaryCarrier = state.queue.pending.find(row => row.payload.type === "calldown-carrier-expire" && row.payload.targetId === outer.id);
  assert.equal(boundaryCarrier.payload.mana, 1000);
  assert.ok(state.battleAnimations.some(animation => animation.unitId === "jijie"));
  tower.hero.ranks.A197 = 6;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, effect + 4_000_000);
  const newer = restored.enemies.find(unit => unit.id === inner.id);
  assert.deepEqual(newer.calldownSlow, { untilUs: effect + 9_000_000, factor: .8 });
  assert.equal(Math.round(restored.recentHits.at(-1).amount), Math.round(3000 * .8 * 1.13));
  assert.equal(restored.enemies.find(unit => unit.id === outside.id).hp, 100_000);
  advance(restored, effect + 9_000_000);
  assert.equal(newer.calldownSlow, undefined);
});

test("A197 replaces only unfired impacts and keeps the first impact's prior slow", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A197 = 1;
  const initial = enemy(21, 800);
  const next = enemy(22, -800);
  state.enemies = [initial, next];
  assert.ok(cast("A197", { point: initial }).ok);
  advance(state, 2_010_002);
  assert.equal(state.recentHits[0].targetId, initial.id);
  assert.deepEqual(initial.calldownSlow, { untilUs: 4_010_002, factor: .5 });
  const cancelledSecond = tower.calldown.second;
  // Isolate the substitution contract from the ordinary fifteen-second cooldown.
  tower.heroSpellReady.A197 = 0;
  assert.ok(cast("A197", { point: next }).ok);
  advance(state, 2_020_003);
  assert.equal(state.queue.pending.some(row => row.timerId === cancelledSecond), false);
  assert.equal(initial.calldownSlow.factor, .5);
  advance(state, 4_010_002);
  assert.equal(initial.calldownSlow, undefined);
  assert.equal(state.recentHits.length, 1);
  advance(state, 6_020_003);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.atUs]), [[21, 2_010_002], [22, 4_020_003], [22, 6_020_003]]);
});
