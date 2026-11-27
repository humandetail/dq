import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, newMatch } from "../src/game/m2/match.ts";
import { routeSpansOverlap } from "../src/game/m2/movement.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture(across = false) {
  const state = newMatch("m3-moving-runtime", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const target = state.enemies[0];
  Object.assign(target, {
    x: map.worker.x + 20, y: map.worker.y + (across ? 145 : 0), speed: 320, armor: 0,
    hp: 100_000, maxHp: 100_000, abilities: [], layer: "fly",
    path: [across ? { x: map.worker.x + 20, y: map.worker.y - 100 } : { x: map.worker.x - 100, y: map.worker.y }],
  });
  state.enemies = [target];
  scheduleEvent(state.queue, 31_250, { type: "movement" });
  const wave = (at = map.worker, sourceId = 901) => scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: {
    ...at, name: "i279", towerId: 900, sourceId, dx: 1, dy: 0, speed: 1050, range: 600,
    radiusStart: 125, radiusEnd: 600, amount: 2500, traveled: 0, hit: [], budget: 9_999_999,
  } });
  return { state, target, wave };
}

test("published movement yields exact longitudinal/lateral wave contacts and survives JSON mid-flight", () => {
  for (const [across, expected] of [[false, 14_600], [true, 19_049]]) {
    const { state, wave } = fixture(across);
    wave();
    advance(state, 10_001);
    const checkpoint = JSON.parse(JSON.stringify(state));
    assert.ok(checkpoint.enemies[0].routeSpan);
    advance(checkpoint, expected - 1);
    assert.equal(checkpoint.recentHits, undefined);
    advance(checkpoint, expected);
    assert.equal(checkpoint.recentHits[0].atUs, expected);
    advance(checkpoint, 31_251);
    advance(state, 31_251);
    assert.deepEqual(checkpoint, JSON.parse(JSON.stringify(state)));
  }
});

test("interposed N006 stun commits earlier travel and cancels a now-impossible lateral hit", () => {
  const { state, target, wave } = fixture(true);
  state.structures = [{ ...map.worker, id: 902, templateId: "n146", pending: null, radius: 72, population: 10 }];
  wave();
  scheduleEvent(state.queue, 10_000, { type: "tower-spell", towerId: 902, skillId: "N006", point: map.worker });
  advance(state, 10_001);
  assert.equal(target.stunUntilUs, 1_210_001);
  assert.ok(Math.abs(target.y - (map.worker.y + 141.8)) < 1e-9);
  assert.deepEqual(target.routeSpan.from, target.routeSpan.to);
  advance(state, 31_251);
  assert.deepEqual(state.recentHits.map(hit => hit.sourceTemplate), ["n146"]);
  assert.ok(Math.abs(target.y - (map.worker.y + 141.8)) < 1e-9);
});

test("a planned waypoint consumes its route draw only when the unit actually enters", () => {
  const { state, target, wave } = fixture();
  Object.assign(target, { x: -20, y: -448, waypoint: 0, previousWaypoint: null, insideRegions: [], path: [{ x: 0, y: -448 }] });
  const before = state.randomState;
  wave({ x: -4000, y: -4000 });
  advance(state, 25_000);
  assert.equal(state.randomState, before);
  assert.equal(target.previousWaypoint, null);
  assert.ok(target.x < -12);
  advance(state, 25_001);
  assert.equal(target.previousWaypoint, 0);
  assert.equal(target.x, -12);
  assert.equal(state.randomState, (Math.imul(before, 1664525) + 1013904223) >>> 0);
});

test("synchronously crossing circular trajectories cannot reserve the same path", () => {
  const unit = { id: 1, x: -10, y: 0, radius: 2, initialOverlaps: [] };
  const other = { id: 2, x: 0, y: -10, radius: 2 };
  const crossing = { from: { x: -10, y: 0 }, to: { x: 10, y: 0 }, fromUs: 0, untilUs: 100, rate: 200_000 };
  const vertical = { from: { x: 0, y: -10 }, to: { x: 0, y: 10 }, fromUs: 0, untilUs: 100, rate: 200_000 };
  assert.equal(routeSpansOverlap(unit, crossing, other, vertical), true);
  assert.equal(routeSpansOverlap(unit, crossing, other, { ...vertical, untilUs: 30 }), false);
});

test("two transverse waves crossing on the same microsecond keep creation order after replanning", () => {
  const { state, target, wave } = fixture();
  state.structures = [{ ...map.worker, id: 902, templateId: "n146", pending: null, radius: 72, population: 10 }];
  wave(map.worker, 911);
  wave(map.worker, 910);
  scheduleEvent(state.queue, 10_000, { type: "tower-spell", towerId: 902, skillId: "N006", point: map.worker });
  advance(state, 16_001);
  const contacts = state.recentHits.filter(hit => hit.sourceTemplate === "q001");
  assert.deepEqual(contacts.map(hit => [hit.casterId, hit.targetId, hit.atUs]), [[911, target.id, 16_001], [910, target.id, 16_001]]);
});

test("a solid ground blocker prevents a predicted premature crossing", () => {
  const { state, target, wave } = fixture();
  target.layer = "ground";
  target.radius = 3;
  state.structures = [{ x: target.x - 3, y: target.y, id: 902, templateId: "w000", pending: null, radius: 5, population: 0 }];
  wave();
  advance(state, 14_600);
  assert.equal(state.recentHits, undefined);
  assert.deepEqual(target.routeSpan.from, target.routeSpan.to);
  advance(state, 19_049);
  assert.equal(state.recentHits[0].atUs, 19_049);
});
