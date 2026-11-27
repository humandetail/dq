import assert from "node:assert/strict";
import { test } from "node:test";
import { physicalDamage } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults[id].ok, JSON.stringify(state.commandResults[id]));
  return state.queue.nowUs;
}

function fixture() {
  const state = newMatch("m3-razor-controlled", 74);
  state.queue.pending = [];
  const hero = newHero("H054");
  const tower = { ...map.worker, id: 900, templateId: "H054", radius: 72, pending: null, qualification: "P001", hero,
    autoModes: { A204: false, A205: false, A206: false } };
  const provider = { ...map.worker, x: tower.x - 300, id: 901, templateId: "n189", radius: 72, pending: null };
  state.structures = [tower, provider];
  const enemy = { ...map.worker, id: 910, x: tower.x + 500, unitId: "m001", layer: "ground",
    hp: 1000000, maxHp: 1000000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

function cast(state, tower, id, skillId, selection = {}) {
  return command(state, id, { type: "cast-hero", towerId: tower.id, skillId, ...selection });
}

function gear(state, tower, itemId) {
  const id = state.nextId++;
  state.inventory.push({ id, itemId, slot: 0, point: state.worker, charges: 0 });
  command(state, "give-" + itemId, { type: "transfer-item", itemId: id, towerId: tower.id });
  return id;
}

test("A204 uses four independent shell visits, legal edge 1120 and a captured live weapon field through restore", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A204 = 6;
  const center = { ...enemy, x: tower.x, id: 911 };
  const edge = { ...enemy, x: tower.x + 1120, id: 912, abilities: ["N535"] };
  const outside = { ...edge, x: edge.x + 1, id: 913 };
  state.enemies.push(center, edge, outside);
  const staff = gear(state, tower, "i310");
  const started = cast(state, tower, "plasma", "A204");
  const queued = state.queue.pending.find(entry => entry.payload.type === "razor-plasma");
  assert.equal(queued.dueUs, started + 50_000);
  const captured = queued.payload.amount;
  command(state, "withdraw", { type: "transfer-item", itemId: staff });
  tower.permanentAttack = 50000;
  advance(state, started + 2_300_000);
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, started + 4_600_000);
  const counts = [enemy, center, edge, outside].map(unit => saved.recentHits.filter(hit => hit.targetId === unit.id).length);
  assert.deepEqual(counts, [4, 4, 4, 0]);
  const boost = 1 + tower.hero.natural.INT * .001;
  assert.ok(saved.recentHits.every(hit => Math.abs(hit.amount - captured * .8 * boost) < 1e-7));
  assert.equal(saved.enemies.find(unit => unit.id === edge.id).spellShieldReadyUs, undefined);
  assert.equal(saved.queue.pending.some(entry => entry.payload.type === "razor-plasma"), false);
});

test("A205 collects five live-rank beats, keeps independent stopped channels, preserves empty recast and expires the exact S18 bonus", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A205 = 2;
  const shielded = { ...enemy, y: enemy.y + 15, id: 911, abilities: ["N535"] };
  const leaves = { ...enemy, y: enemy.y - 15, id: 912 };
  state.enemies.push(shielded, leaves);
  const started = cast(state, tower, "static", "A205", { point: enemy });
  assert.equal(tower.razorStatic.untilUs, started + 13_000_000);
  assert.equal(shielded.spellShieldReadyUs, started + 6_000_000);
  assert.equal(state.queue.pending.filter(entry => entry.payload.type === "razor-static-tick").length, 2);
  advance(state, started + 1_000_000);
  assert.equal(tower.razorStatic.attack, 36);
  leaves.x = tower.x + 1001;
  tower.hero.ranks.A205 = 3;
  tower.permanentAttack = 55;
  advance(state, started + 5_000_000);
  assert.equal(tower.razorStatic.attack, 36 + 4 * 21);
  assert.equal(state.recentHits?.length ?? 0, 0);
  advance(state, started + 12_000_000);
  const initial = tower.razorStatic.id;
  const empty = { x: tower.x - 600, y: tower.y };
  cast(state, tower, "empty", "A205", { point: empty });
  assert.equal(tower.razorStatic.id, initial);
  advance(state, started + 13_000_000);
  assert.equal(tower.razorStatic, undefined);
  assert.equal(tower.permanentAttack, 55);
});

test("A206 lands after native travel, only strips the selected target, and keeps the final projectile past carrier expiry", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A206 = 1;
  const near = { ...enemy, x: enemy.x + 250, id: 911 };
  const far = { ...enemy, x: enemy.x + 251, id: 912 };
  state.enemies.push(near, far);
  const started = cast(state, tower, "storm", "A206");
  const storm = Object.values(state.razorStorms)[0];
  assert.equal(storm.intervalUs, 500_000);
  advance(state, started + 749_999);
  assert.equal(enemy.armor, 0);
  assert.equal(state.recentHits?.length ?? 0, 0);
  advance(state, started + 750_000);
  assert.equal(enemy.armor, -1);
  assert.equal(near.armor, 0);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [enemy.id, near.id]);
  assert.ok(state.recentHits.every(hit => hit.sourceTemplate === "H054" && hit.ownerId === tower.id));
  const raw = Math.trunc(30 + 1.4 * tower.hero.natural.AGI) + 400;
  const expected = physicalDamage(raw, "hero", 0, false) * (1 + .0006 * tower.hero.natural.STR);
  assert.ok(Math.abs(state.recentHits[0].amount - expected) < 1e-7);
  advance(state, started + 15_000_000);
  assert.equal(storm.inFlight, 1);
  assert.equal(enemy.armor, -29);
  advance(state, started + 15_250_000);
  assert.equal(enemy.armor, -30);
  assert.equal(state.razorStorms[storm.id], undefined);
});

test("A206 captures staff cadence, retains cooldown floor, and A204 uses live B210 equipment entry without an extra weapon packet", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A204 = 1;
  tower.hero.ranks.A206 = 6;
  const staff = gear(state, tower, "i310");
  gear(state, tower, "i327");
  gear(state, tower, "i132");
  const started = cast(state, tower, "staff-storm", "A206");
  const storm = Object.values(state.razorStorms)[0];
  assert.equal(storm.intervalUs, 300_000);
  command(state, "withdraw-staff", { type: "transfer-item", itemId: staff });
  advance(state, started + 100_000);
  assert.equal(tower.heroSpellReady.A206, started + 16_100_000);
  assert.equal(storm.intervalUs, 300_000);
  // The first ring hit precedes a storm attack on this target, proving the distinct Special entry.
  enemy.x = tower.x + 25;
  const castAt = cast(state, tower, "field", "A204");
  state.randomState = 1972; // First uniform percent is <=20.
  advance(state, castAt + 50_000);
  assert.equal(enemy.armor, 0);
  assert.equal(state.recentHits.length, 2);
  assert.equal(state.recentHits[0].atUs, castAt + 50_000);
  assert.equal(state.recentHits[1].atUs, castAt + 50_000);
});
