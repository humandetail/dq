import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { unitBalance, weapons } from "../src/game/m2/combat.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture(templateId) {
  const state = newMatch("m3-rock-golem", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const tower = { ...map.worker, id: 900, templateId, population: 5, radius: 72, pending: null, qualification: null,
    attack: { readyUs: Number.MAX_SAFE_INTEGER } };
  state.structures = [tower];
  const sample = state.enemies[0];
  const enemy = (id, dx, dy = 0, overrides = {}) => ({ ...sample, id, x: tower.x + dx, y: tower.y + dy,
    hp: 100_000, maxHp: 100_000, armor: 0, speed: 0, abilities: [], ...overrides });
  const send = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const cast = (skillId, extra = {}) => send(skillId, { type: "cast-tower", towerId: tower.id, skillId, ...extra });
  return { state, tower, enemy, cast, send };
}

test("N076–78 separates native autocast, permits mechanical targets and respects spell shield at commit", () => {
  for (const [index, factor] of [.8, .6, .4].entries()) {
    const { state, tower, enemy } = fixture("n" + (199 + index));
    const skill = "N0" + (76 + index);
    tower.autoModes = { [skill]: false };
    state.enemies = [enemy(22, 450, 0, { abilities: ["Amec", "Arsk"] }), enemy(21, 650, 0, { abilities: ["N535"] })];
    scheduleEvent(state.queue, 0, { type: "native-slow-scan", towerId: tower.id });
    advance(state, 470_001);
    assert.equal(state.enemies[1].spellShieldReadyUs, 6_470_001);
    assert.equal(state.enemies[1].nativeSlow, undefined);
    state.enemies.splice(1, 1);
    advance(state, 8_470_001);
    assert.equal(state.queue.pending.some(({ payload }) => payload.type === "tower-spell"), false);
    advance(state, 8_970_001);
    assert.deepEqual(state.enemies[0].nativeSlow, { untilUs: 10_970_001, factor, attackPenalty: .25 });
  }
});

test("single boulders hit only at impact with the proper hero stun", () => {
  for (const [index, rank] of [0, 1, 2].entries()) {
    const { state, enemy, cast } = fixture("n" + (202 + rank));
    const target = enemy(21, 400, 0, { abilities: ["Arsk"] });
    state.enemies = [target];
    assert.ok(cast("N0" + (79 + rank), { targetId: 21 }).ok);
    advance(state, 870_001);
    assert.equal(state.recentHits?.length ?? 0, 0);
    advance(state, 870_002);
    assert.equal(state.recentHits[0].amount, [320, 400, 480][index]);
    assert.equal(target.stunUntilUs, 870_002 + (index ? 1_000_000 : 500_000));
  }
});

test("N082–85 snapshot center and launch distinct q001 carriers retaining targets after owner recycle", () => {
  for (let rank = 0; rank < 4; rank++) {
    const { state, tower, enemy, cast, send } = fixture("n" + (205 + rank));
    state.population = 5;
    const radius = 200 + 100 * rank;
    const left = enemy(21, 600 - radius);
    const right = enemy(22, 600 + radius);
    const shielded = enemy(23, 599, 0, { abilities: ["N535"] });
    const outside = enemy(24, 601 + radius);
    state.enemies = [outside, shielded, right, left];
    assert.ok(cast("N0" + (82 + rank), { point: { x: tower.x + 600, y: tower.y } }).ok);
    advance(state, 470_002);
    const rocks = state.queue.pending.filter(({ payload }) => payload.type === "boulder-projectile");
    assert.equal(new Set(rocks.map(({ payload }) => payload.sourceId)).size, 2);
    assert.equal(shielded.spellShieldReadyUs, 6_470_002);
    assert.ok(send("recycle", { type: "recycle-tower", towerId: tower.id }).ok);
    const resumed = JSON.parse(JSON.stringify(state));
    advance(resumed, 1_800_000);
    assert.deepEqual(resumed.recentHits.map(({ targetId, amount, sourceTemplate, ownerId }) => [targetId, amount, sourceTemplate, ownerId]),
      [21, 22].map(id => [id, [80, 240, 400, 1200][rank], "q001", undefined]));
  }
});

test("N087 preserves ground-only circular geometry and applies separate two-channel slow after damage", () => {
  const { state, enemy, cast } = fixture("n208");
  state.enemies = [enemy(21, 1000, 0, { abilities: ["Amec"] }), enemy(22, 1001), enemy(23, 1, 0, { unitId: "m888", layer: "fly" })];
  assert.ok(cast("N087").ok);
  advance(state, 470_002);
  assert.deepEqual(state.recentHits.map(({ targetId, amount }) => [targetId, amount]), [[21, 3600]]);
  assert.deepEqual(state.enemies[0].clapSlow, { factor: .5, attackPenalty: .25, untilUs: 3_470_002 });
});

test("N086 uses actual source current maximum life, damage circle centered on target, and retains parent attack", () => {
  const { state, tower, enemy } = fixture("n208");
  const main = enemy(21, 400);
  state.enemies = [main, enemy(22, 1000, 0, { abilities: ["Amim"] }), enemy(23, 1001)];
  const next = value => (Math.imul(value, 1664525) + 1013904223) >>> 0;
  const stompRoll = seed => {
    for (let previous = 0; previous < 4; previous++) seed = next(seed);
    return 1 + Math.floor(next(seed) / 2 ** 32 * 100);
  };
  for (let seed = 0; ; seed++) {
    if (stompRoll(seed) === 12) {
      state.randomState = seed;
      break;
    }
  }
  tower.lifeOffset = 120;
  const shot = { towerId: tower.id, sourceTemplate: tower.templateId, targetId: main.id, raw: 100,
    weapon: { ...weapons.n208[0], attackType: "chaos", homing: false }, point: { x: main.x, y: main.y }, destination: { x: main.x, y: main.y } };
  scheduleEvent(state.queue, 0, { type: "weapon-impact", shot, travelUs: 0 });
  advance(state, 1);
  const expected = unitBalance.get("n208").HP + 120;
  assert.deepEqual(state.recentHits.map(({ targetId, amount }) => [targetId, amount]), [[21, expected], [22, expected], [21, 100]]);
  assert.equal(state.battleAnimations.at(-1).kind, "stomp-impact");
});
