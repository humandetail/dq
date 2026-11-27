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

function fixture(templateId, skillId) {
  const state = newMatch("m3-wave-contact", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero(templateId);
  hero.natural.INT = 100;
  hero.ranks[skillId] = 1;
  const tower = { ...map.worker, id: 900, templateId, population: 20, radius: 72,
    pending: null, qualification: null, hero };
  state.structures = [tower];
  const first = state.enemies[0];
  const target = (id, dx, dy = 0, abilities = []) => ({
    ...first, id, x: tower.x + dx, y: tower.y + dy, hp: 100_000, maxHp: 100_000, armor: 0, abilities,
  });
  state.enemies = [];
  const cast = () => enqueue(state, { id: skillId, matchId: state.matchId, action: {
    type: "cast-hero", towerId: tower.id, skillId, point: { x: tower.x + 480, y: tower.y },
  } });
  return { state, tower, target, cast };
}

test("A019 contacts at the calculated time, in ID order, including a closed terminal tangent", () => {
  const { state, target, cast } = fixture("H005", "A019");
  state.enemies = [target(22, 480), target(21, 480), target(20, 1500, 200), target(19, 1701)];
  assert.ok(cast());
  advance(state, 440_001);
  assert.equal(state.recentHits?.length ?? 0, 0);
  const resumed = JSON.parse(JSON.stringify(state));
  advance(resumed, 440_002);
  assert.deepEqual(resumed.recentHits.map(({ targetId, atUs }) => [targetId, atUs]), [[21, 440_002], [22, 440_002]]);
  advance(resumed, 1_050_002);
  assert.deepEqual(resumed.recentHits.map(({ targetId, atUs }) => [targetId, atUs]),
    [[21, 440_002], [22, 440_002], [20, 1_050_002]]);
});

test("A152 uses its own carrier after the owner is removed and preserves the exact queue time on restore", () => {
  const { state, target, cast } = fixture("H038", "A152");
  state.enemies = [target(21, 480)];
  assert.ok(cast());
  advance(state, 300_002);
  const carrier = state.queue.pending.find(event => event.payload.type === "spell-sweep").payload.sweep.sourceId;
  state.structures = [];
  const resumed = JSON.parse(JSON.stringify(state));
  advance(resumed, 390_001);
  assert.equal(resumed.recentHits?.length ?? 0, 0);
  advance(resumed, 390_002);
  assert.deepEqual(resumed.recentHits.map(({ atUs, casterId, ownerId }) => [atUs, casterId, ownerId]),
    [[390_002, carrier, undefined]]);
});

test("A170 fire and ice have separate wave times and only ice consumes spell shields", () => {
  const { state, tower, target, cast } = fixture("H044", "A170");
  state.enemies = [target(21, 420, 320), target(22, 420, -320, ["N535"]), target(23, 701)];
  assert.ok(cast());
  advance(state, 700_001);
  assert.equal(state.recentHits?.length ?? 0, 0);
  advance(state, 700_002);
  assert.deepEqual(state.recentHits.map(({ targetId, atUs }) => [targetId, atUs]), [[21, 700_002], [22, 700_002]]);
  assert.equal(state.enemies[1].spellShieldReadyUs, undefined);
  const resumed = JSON.parse(JSON.stringify(state));
  advance(resumed, 1_000_001);
  assert.equal(resumed.enemies[0].frost, undefined);
  advance(resumed, 1_000_002);
  assert.deepEqual(resumed.enemies[0].frost, { factor: .75, expiresUs: 6_000_002 });
  assert.equal(resumed.enemies[1].frost, undefined);
  assert.equal(resumed.enemies[1].spellShieldReadyUs, 7_000_002);
  assert.equal(resumed.structures[0].id, tower.id);
  advance(resumed, 1_400_000);
  assert.equal(resumed.enemies[2].hp, 100_000);
  assert.equal(resumed.enemies[2].frost, undefined);
});

test("i279 expands from its source to a closed 600-unit terminal plane", () => {
  const { state, tower, target } = fixture("H021", "A068");
  state.enemies = [target(21, 0, 125), target(22, 600, 600), target(23, 600, 601), target(24, 700)];
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: {
    x: tower.x, y: tower.y, dx: 1, dy: 0, speed: 1050, range: 600, radiusStart: 125, radiusEnd: 600,
    amount: 2500, name: "i279", towerId: tower.id, sourceId: 901, traveled: 0, hit: [], budget: 9_999_999,
  } });
  advance(state, 1);
  assert.deepEqual(state.recentHits.map(({ targetId }) => targetId), [21]);
  advance(state, 571_429);
  assert.equal(state.recentHits.length, 1);
  advance(state, 571_430);
  assert.deepEqual(state.recentHits.map(({ targetId }) => targetId), [21, 22]);
});

test("A019 updates contact when a prior event relocates a live target", () => {
  const { state, target, cast } = fixture("H005", "A019");
  const parent = { ...target(21, 800), phaseUntilUs: 500_002, stunUntilUs: 500_002 };
  const egg = { ...target(22, 540), abilities: ["Avul"] };
  state.enemies = [parent, egg];
  scheduleEvent(state.queue, 500_000, { type: "enemy-egg-end", enemyId: parent.id, eggId: egg.id });
  assert.ok(cast());
  advance(state, 470_001);
  assert.equal(state.recentHits?.length ?? 0, 0);
  advance(state, 500_001);
  assert.deepEqual(state.recentHits.map(({ targetId, atUs }) => [targetId, atUs]), [[21, 500_001]]);
});

test("A019 cancels an already launched cast when the actual source is removed", () => {
  const { state, target, cast } = fixture("H005", "A019");
  state.enemies = [target(21, 480)];
  assert.ok(cast());
  advance(state, 300_002);
  state.structures = [];
  advance(state, 1_100_000);
  assert.equal(state.recentHits?.length ?? 0, 0);
  assert.equal(state.queue.pending.some(({ payload }) => payload.type === "spell-sweep"), false);
});

test("ordinary shockwaves spend the last partial budget in contact and creation order", () => {
  const { state, tower, target } = fixture("H005", "A019");
  tower.templateId = "n250";
  delete tower.hero;
  state.enemies = [target(21, 500), target(22, 480), target(23, 470), target(20, 480)];
  scheduleEvent(state.queue, 0, { type: "spell-sweep", sweep: {
    x: tower.x, y: tower.y, dx: 1, dy: 0, speed: 1050, range: 800, radiusStart: 300, radiusEnd: 300,
    amount: 100, name: "N111", towerId: tower.id, traveled: 0, hit: [], budget: 250, targets: ["ground", "structure"],
  } });
  advance(state, 171_429);
  assert.deepEqual(state.recentHits.map(({ targetId }) => targetId), [23]);
  advance(state, 171_430);
  assert.deepEqual(state.recentHits.map(({ targetId, amount }) => [targetId, amount]), [[23, 80], [20, 80], [22, 40]]);
  advance(state, 800_000);
  assert.equal(state.enemies[0].hp, 100_000);
});
