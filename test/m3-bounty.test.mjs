import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { canSeeEnemy, drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("m3-bounty-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H028");
  hero.natural.INT = 300;
  const tower = { ...map.worker, id: 900, templateId: "H028", radius: 72, pending: null, qualification: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, id: 910, x: tower.x + 100, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

function cast(state, tower, id, skillId, target) {
  assert.ok(command(state, id, { type: "cast-hero", towerId: tower.id, skillId, targetId: target.id }).ok);
  const event = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(event.dueUs - state.queue.nowUs, 300_000);
  advance(state, event.dueUs);
  return event.dueUs;
}

test("Shadow Wind resolves its closed stomp, independent nonstacking aura and all six Scepter-marked rebounds across restore", () => {
  const { state, tower, enemy } = fixture();
  tower.qualification = "P006";
  tower.hero.ranks.A089 = tower.hero.ranks.A090 = tower.hero.ranks.A091 = 1;
  state.structures.push({ ...map.worker, x: tower.x + 700, id: 901, templateId: "n167", radius: 72, pending: null });
  state.inventory = [{ id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command(state, "scepter", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  const next = { ...enemy, id: 911, x: enemy.x + 320 };
  const edge = { ...enemy, id: 912, y: enemy.y + 275 };
  const beyond = { ...enemy, id: 913, y: enemy.y + 276 };
  const auraEdge = { ...enemy, id: 914, y: enemy.y + 400 };
  const auraOut = { ...enemy, id: 915, y: enemy.y + 401 };
  state.enemies.push(next, edge, beyond, auraEdge, auraOut);
  const trackedAt = cast(state, tower, "track-next", "A091", next);
  assert.equal(next.bountyArmor.amount, 20);
  advance(state, trackedAt + 100_000);
  const at = cast(state, tower, "throw", "A089", enemy);
  assert.ok(enemy.bountyMark);
  assert.equal(enemy.bountyArmor, undefined);
  advance(state, at + 100_000);
  assert.equal(enemy.stunUntilUs, at + 2_100_000);
  assert.equal(edge.stunUntilUs, at + 2_100_000);
  assert.equal(beyond.stunUntilUs, undefined);
  assert.equal(auraEdge.shadowWindSlow, true);
  assert.equal(auraOut.shadowWindSlow, undefined);
  const restored = structuredClone(state);
  advance(restored, at + 2_100_000);
  assert.deepEqual(restored.recentHits.filter(hit => hit.sourceTemplate === "q024").map(hit => hit.targetId),
    [enemy.id, next.id, enemy.id, next.id, enemy.id, next.id, enemy.id]);
  assert.equal(Object.values(restored.shadowWindAuras).length, 7);
  advance(restored, at + 6_100_000);
  assert.equal(restored.shadowWindAuras, undefined);
  assert.ok(restored.enemies.every(target => target.shadowWindSlow === undefined));
});

test("Tracking armor and visibility obey the native shield while the script marker pays the mark owner's live rank", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A091 = 1;
  enemy.abilities = ["N535"];
  const at = cast(state, tower, "shielded", "A091", enemy);
  assert.equal(enemy.bountyArmor, undefined);
  assert.ok(enemy.bountyMark);
  assert.ok(enemy.spellShieldReadyUs > at);
  enemy.windwalk = { invisibleUs: at, endUs: at + 5_000_000, speed: 1 };
  assert.equal(canSeeEnemy(state, enemy), false);
  delete enemy.windwalk;
  tower.hero.ranks.A091 = 2;
  const ally = { ...map.worker, id: 901, templateId: "n230", radius: 72, pending: null };
  state.structures.push(ally);
  let rng = state.randomState;
  for (let draw = 0; draw < 5; draw++) rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  const expected = 15 + Math.floor(rng / 2 ** 32 * 46);
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: ally.id, sourceTemplate: ally.templateId, targetId: enemy.id, raw: 200_000,
    weapon: { ...weapons[ally.templateId][0], homing: false }, point: enemy, destination: enemy,
  } });
  advance(state, state.queue.nowUs + 1);
  assert.equal(enemy.hp, 0);
  assert.equal(enemy.bountyMark, undefined);
  assert.equal(tower.bountyTrackingGold, expected);
  assert.equal(ally.bountyTrackingGold, undefined);
});

test("Tracking starts in manual mode and its own native toggle can start a chosen long-range target without an attack", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A091 = 1;
  enemy.x = tower.x + 1200;
  assert.ok(command(state, "form", { type: "choose-skin", towerId: tower.id, choice: "S182" }).ok);
  assert.equal(tower.templateId, "G056");
  assert.equal(tower.autoModes?.A091, undefined);
  assert.ok(command(state, "switch", { type: "set-auto-mode", towerId: tower.id, key: "A091", enabled: true }).ok);
  const castEvent = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(castEvent.payload.targetId, enemy.id);
  advance(state, castEvent.dueUs);
  enemy.windwalk = { invisibleUs: castEvent.dueUs, endUs: castEvent.dueUs + 11_000_000, speed: 1 };
  assert.equal(canSeeEnemy(state, enemy), true);
  assert.ok(enemy.bountyArmor);
  assert.ok(enemy.bountyMark);
  assert.ok(command(state, "stop", { type: "set-auto-mode", towerId: tower.id, key: "A091", enabled: false }).ok);
  advance(state, castEvent.dueUs + 10_000_000);
  assert.equal(canSeeEnemy(state, enemy), false);
  assert.equal(enemy.bountyArmor, undefined);
  assert.equal(enemy.bountyMark, undefined);
});

test("A089 gives the earlier T090 packet its own N535 check before the zero-damage outer stun", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A089 = tower.hero.ranks.A090 = 1;
  enemy.abilities = ["N535"];
  const at = cast(state, tower, "shield-throw", "A089", enemy);
  advance(state, at + 100_000);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(state.shadowWindAuras, undefined);
  assert.equal(enemy.spellShieldReadyUs, at + 6_100_000);
  assert.equal(enemy.stunUntilUs, at + 200_000);
});

test("Shadow Wind leaves the exact route boundary between movement frames", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A089 = tower.hero.ranks.A090 = 1;
  const walker = { ...enemy, id: 911, speed: 100, x: enemy.x + 398, waypoint: 0,
    previousWaypoint: null, path: [{ x: enemy.x + 800, y: enemy.y }] };
  state.enemies.push(walker);
  const at = cast(state, tower, "route-throw", "A089", enemy);
  const hitAt = at + 100_000;
  advance(state, hitAt);
  assert.equal(walker.shadowWindSlow, true);
  state.movementAnchorUs = hitAt + 31_250;
  scheduleEvent(state.queue, 31_250, { type: "movement" }, 31_250);
  advance(state, hitAt + 28_571);
  assert.equal(walker.shadowWindSlow, true);
  assert.equal(walker.routeSpan.rate, 70);
  advance(state, hitAt + 28_572);
  assert.equal(walker.shadowWindSlow, undefined);
  assert.equal(walker.routeSpan.rate, 100);
});
