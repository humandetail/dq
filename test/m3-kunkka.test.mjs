import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { nearestSpawn } from "../src/game/m2/pathfinding.ts";
import { weapons } from "../src/game/m2/combat.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function cast(state, tower, id, skillId, point) {
  assert.ok(command(state, id, { type: "cast-hero", towerId: tower.id, skillId, point }).ok);
  const event = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(event.dueUs - state.queue.nowUs, 500_000);
  advance(state, event.dueUs);
  return event.dueUs;
}

function fixture() {
  const state = newMatch("m3-kunkka-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H025");
  hero.natural.INT = 300;
  const tower = { ...map.worker, id: 900, templateId: "H025", radius: 72, pending: null, qualification: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, id: 910, x: tower.x + 100, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

test("Torrent damages at the closed radius and restores its shield-independent two-second lift", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A080 = 1;
  const point = { x: tower.x + 500, y: tower.y };
  Object.assign(enemy, { x: point.x + 350, abilities: ["N535"] });
  const outside = { ...enemy, id: 911, x: point.x + 351 };
  state.enemies.push(outside);
  const at = cast(state, tower, "torrent", "A080", point);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(enemy.spellShieldReadyUs, undefined);
  assert.equal(enemy.torrentLift.height, 0);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(outside.torrentLift, undefined);
  advance(state, at + 1_000_000);
  assert.equal(enemy.torrentLift.height, 800);
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, at + 1_975_000);
  assert.equal(saved.enemies[0].torrentLift.height, 20);
  advance(saved, at + 2_000_000);
  assert.equal(saved.enemies[0].torrentLift, undefined);
});

test("Tidebringer spends only its own raw attack bonus on impact and restores the new learned rank across S102", () => {
  const { state, tower, enemy } = fixture();
  const edge = { ...enemy, id: 911, y: enemy.y + 650 };
  const outside = { ...enemy, id: 912, y: enemy.y + 651 };
  state.enemies.push(edge, outside);
  tower.permanentAttack = 37;
  assert.ok(command(state, "rank-one", { type: "learn-skill", towerId: tower.id, skillId: "A081" }).ok);
  assert.equal(tower.hero.ranks.T082, 1);
  assert.equal(tower.permanentAttack, 437);
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: tower.id, sourceTemplate: tower.templateId, targetId: enemy.id, raw: 200,
    weapon: { ...weapons[tower.templateId][0], homing: false }, point: enemy, destination: enemy,
  } });
  const impactAt = state.queue.nowUs + 1;
  advance(state, impactAt);
  assert.ok(edge.hp < edge.maxHp);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(tower.hero.ranks.T082, undefined);
  assert.equal(tower.permanentAttack, 37);
  tower.hero.level = 4;
  tower.hero.points = 1;
  assert.ok(command(state, "rank-two", { type: "learn-skill", towerId: tower.id, skillId: "A081" }).ok);
  assert.ok(command(state, "whitebeard", { type: "choose-skin", towerId: tower.id, choice: "S102" }).ok);
  assert.equal(tower.templateId, "G042");
  assert.equal(tower.hero.ranks.T082, undefined);
  assert.equal(tower.permanentAttack, 37);
  advance(state, impactAt + 6_499_999);
  assert.equal(tower.permanentAttack, 37);
  advance(state, impactAt + 6_500_000);
  assert.equal(tower.hero.ranks.T082, 1);
  assert.equal(tower.permanentAttack, 837);
});

test("Ghost Fleet retains three captured scepter waves without counting repeats as fresh aura collisions", () => {
  const { state, tower, enemy } = fixture();
  tower.qualification = "P006";
  tower.hero.ranks.A082 = 1;
  state.structures.push({ ...map.worker, x: tower.x + 500, id: 901, templateId: "n167", radius: 72, pending: null });
  state.inventory = [{ id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command(state, "scepter", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  const point = { x: tower.x + 600, y: tower.y };
  const source = nearestSpawn({ ...point, x: point.x - 1800 }, 0, "ground");
  Object.assign(enemy, source, { abilities: ["N535"] });
  const at = cast(state, tower, "fleet", "A082", point);
  advance(state, at + 1000);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.ok(enemy.spellShieldReadyUs > at);
  assert.equal(enemy.stunUntilUs, undefined);
  assert.equal(state.recentHits.filter(hit => hit.sourceTemplate === "q022").length, 1);
  assert.deepEqual(tower.fleetAura, { layers: 1, untilUs: at + 5_000_000 });
  assert.ok(command(state, "withdraw", { type: "transfer-item", itemId: 940 }).ok);
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, at + 2_001_000);
  assert.equal(saved.recentHits.filter(hit => hit.sourceTemplate === "q022").length, 2);
  assert.ok(saved.enemies[0].stunUntilUs > at + 2_000_000);
  assert.deepEqual(saved.structures[0].fleetAura, { layers: 1, untilUs: at + 5_000_000 });
  saved.enemies.push({ ...enemy, id: 911, abilities: [], spellShieldReadyUs: undefined });
  advance(saved, at + 4_001_000);
  assert.equal(saved.recentHits.filter(hit => hit.sourceTemplate === "q022").length, 4);
  assert.deepEqual(saved.structures[0].fleetAura, { layers: 2, untilUs: at + 9_000_000 });
  advance(saved, at + 9_000_000);
  assert.equal(saved.structures[0].fleetAura, undefined);
  advance(saved, at + 10_000_000);
  assert.deepEqual(saved.ghostFleets, {});
});

test("Tidebringer uses the stronger equipped cleave first and keeps its own closed-circle damage", () => {
  const { state, tower, enemy } = fixture();
  tower.qualification = "P006";
  state.structures.push({ ...map.worker, x: tower.x + 500, id: 901, templateId: "n167", radius: 72, pending: null });
  state.inventory = [
    { id: 940, itemId: "i115", slot: 0, point: map.worker, charges: 0 },
    { id: 941, itemId: "i209", slot: 1, point: map.worker, charges: 0 },
  ];
  assert.ok(command(state, "first-cleave", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  assert.ok(command(state, "second-cleave", { type: "transfer-item", itemId: 941, towerId: tower.id }).ok);
  assert.ok(command(state, "learn", { type: "learn-skill", towerId: tower.id, skillId: "A081" }).ok);
  const edge = { ...enemy, id: 911, y: enemy.y + 520 };
  const outside = { ...enemy, id: 912, y: enemy.y + 521 };
  state.enemies.push(edge, outside);
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: tower.id, sourceTemplate: tower.templateId, targetId: enemy.id, raw: 200,
    weapon: { ...weapons[tower.templateId][0], homing: false }, point: enemy, destination: enemy,
  } });
  advance(state, state.queue.nowUs + 1);
  const ratio = (small, large) => Math.abs(small / large - .9) < 1e-9;
  const primary = state.recentHits.filter(hit => hit.targetId === enemy.id);
  const strongerCircle = state.recentHits.filter(hit => hit.targetId === edge.id);
  const mainCircle = state.recentHits.filter(hit => hit.targetId === outside.id);
  assert.equal(primary.length, 3);
  assert.ok(ratio(primary[0].amount, primary[1].amount));
  assert.ok(ratio(strongerCircle[0].amount, strongerCircle[1].amount));
  assert.equal(mainCircle.length, 1);
  assert.equal(mainCircle[0].amount, primary[1].amount);
});
