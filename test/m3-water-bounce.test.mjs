import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 1000) === "pending") {}
}

function fixture(rank) {
  const state = newMatch("water-bounce", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const tower = { ...map.worker, templateId: "n" + (245 + rank), id: 900, radius: 72, pending: null, qualification: null, population: 5 };
  const create = (id, dx, options = {}) => ({ ...state.enemies[0], id, x: tower.x + dx, y: tower.y,
    hp: 1000, maxHp: 1000, armor: 0, abilities: [], ...options });
  state.enemies = [create(107, 210), create(106, 200), create(105, 190), create(104, 180), create(103, 170),
    create(102, 400, { abilities: ["Amim"] }), create(101, 0, { hp: 50 })];
  state.structures = [tower];
  const shot = { towerId: tower.id, sourceTemplate: tower.templateId, targetId: 101, raw: 100,
    weapon: { ...weapons[tower.templateId][0], attackType: "chaos" }, point: map.worker, destination: map.worker,
    artilleryCritical: { multiplier: 2, sureHit: true, fixedBonus: 7 } };
  scheduleEvent(state.queue, 0, { type: "weapon-impact", shot, travelUs: 0 });
  return { state, tower, create };
}

for (const rank of [1, 2, 3]) {
  test(`water bounce rank ${rank} propagates after lethal main hit, with independent contact times and 15% raw falloff`, () => {
    const { state } = fixture(rank);
    advance(state, 1);
    const projectile = state.queue.pending[0];
    assert.equal(projectile.payload.shot.targetId, 102);
    assert.deepEqual(projectile.payload.shot.bounce, { remaining: rank + 1, visited: [101, 102] });
    assert.equal(projectile.payload.shot.raw, 170);
    advance(state, 307_692);
    assert.equal(state.recentHits.length, 1);
    const restored = JSON.parse(JSON.stringify(state));
    advance(restored, 2_000_000);
    assert.deepEqual(restored.recentHits.map(hit => hit.targetId), [101, 102, 103, 104, 105, 106].slice(0, rank + 3));
    assert.ok(restored.recentHits.slice(1).every((hit, index) => Math.abs(hit.amount - 200 * .85 ** (index + 1)) < 1e-8));
    assert.equal(restored.recentHits[1].atUs, 307_693);
  });
}

test("an invalidated next target stops the chain instead of choosing a replacement", () => {
  const { state } = fixture(3);
  advance(state, 1);
  state.enemies.find(enemy => enemy.id === 102).phaseUntilUs = 1_000_000;
  advance(state, 450_000);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [101]);
});

test("recycling the real source cancels an in-flight bounce", () => {
  const { state, tower } = fixture(3);
  advance(state, 1);
  assert.ok(enqueue(state, { id: "recycle", matchId: state.matchId, action: { type: "recycle-tower", towerId: tower.id } }));
  advance(state, 500_000);
  assert.equal(state.commandResults.recycle.ok, true);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [101]);
});

test("N134 boosts nearby actual magical sources once without borrowing aura from another owner", () => {
  const { state, tower, create } = fixture(1);
  state.queue.pending = [];
  state.structures.push({ ...tower, id: 901, templateId: "n248", x: tower.x + 500 },
    { ...tower, id: 902, templateId: "n248", x: tower.x + 400 });
  state.enemies = [create(102, 0)];
  const cast = sourceId => {
    scheduleEvent(state.queue, 1, { type: "spell-sweep", sweep: {
      x: tower.x, y: tower.y, dx: 1, dy: 0, speed: 2000, range: 1500, radiusStart: 200, radiusEnd: 200,
      amount: 100, name: "A019", towerId: tower.id, sourceId, traveled: 0, hit: [], targets: ["ground"],
    } });
    advance(state, state.queue.nowUs + 1);
    return state.recentHits.at(-1).amount;
  };
  assert.equal(cast(undefined), 88);
  assert.equal(cast(999), 80);
  state.structures = [tower];
  assert.equal(cast(undefined), 80);
});
