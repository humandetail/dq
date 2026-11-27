import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage, weapons } from "../src/game/m2/combat.ts";
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
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("m3-warlock-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H045");
  hero.natural.INT = 300;
  const tower = { ...map.worker, id: 900, templateId: "H045", radius: 72, pending: null, qualification: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, id: 910, x: tower.x + 100, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

function cast(state, tower, id, skillId, selection) {
  assert.ok(command(state, id, { type: "cast-hero", towerId: tower.id, skillId, ...selection }).ok);
  const event = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(event.dueUs - state.queue.nowUs, 500_000);
  advance(state, event.dueUs);
  return event.dueUs;
}

function weaponHit(state, tower, enemy, summon) {
  const unit = summon ?? tower;
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: tower.id, sourceTemplate: unit.templateId, targetId: enemy.id, raw: 200,
    weapon: { ...weapons[unit.templateId][0], homing: false }, point: unit, destination: enemy,
    ...(summon ? { summon: { id: summon.id, point: summon, banner: false, skillId: "A175" } } : {}),
  } });
  advance(state, state.queue.nowUs + 1);
}

function rngNext(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function seedFor(first, second) {
  for (let seed = 0; ; seed++) {
    const firstDraw = rngNext(seed);
    if (Math.floor(firstDraw / 2 ** 32 * 100) + 1 === first &&
        Math.floor(rngNext(firstDraw) / 2 ** 32 * 100) + 1 === second) return seed;
  }
}

test("Fatal Bonds forwards each overlap at the same 25% through the latest actual q039 and expires groups independently", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A173 = 1;
  const other = { ...tower, id: 901, x: tower.x + 150, hero: newHero("H045") };
  other.hero.ranks.A173 = 1;
  const attacker = { ...map.worker, id: 902, templateId: "n230", radius: 72, pending: null };
  state.structures.push(other, attacker);
  const edge = { ...enemy, id: 911, y: enemy.y + 300 };
  const outside = { ...enemy, id: 912, y: enemy.y + 301 };
  state.enemies.push(edge, outside);
  const first = cast(state, tower, "first", "A173", { targetId: enemy.id });
  const last = cast(state, other, "second", "A173", { targetId: enemy.id });
  assert.equal(Object.keys(state.fatalBonds).length, 2);
  assert.ok(Object.values(state.fatalBonds).every(group => group.members.join(",") === "910,911"));
  const carrier = state.fatalBondsCarrier.id;
  const saved = structuredClone(state);
  weaponHit(saved, attacker, saved.enemies[0]);
  const hits = saved.recentHits;
  assert.deepEqual(hits.map(hit => hit.sourceTemplate), ["q039", "q039", "n230"]);
  assert.ok(hits.slice(0, 2).every(hit => hit.casterId === carrier && hit.ownerId === attacker.id && hit.targetId === edge.id));
  const transmitted = physicalDamage(hits[2].amount * .25, "hero", edge.armor, false);
  assert.deepEqual(hits.slice(0, 2).map(hit => hit.amount), [transmitted, transmitted]);
  advance(saved, first + 6_000_000);
  weaponHit(saved, attacker, saved.enemies[0]);
  assert.equal(saved.recentHits.filter(hit => hit.sourceTemplate === "q039").length, 3);
  advance(saved, last + 6_000_000);
  weaponHit(saved, attacker, saved.enemies[0]);
  assert.equal(saved.recentHits.filter(hit => hit.sourceTemplate === "q039").length, 3);
});

test("Upheaval stops growing on command, keeps its independent aura for five seconds, and uses the G070 presentation", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A174 = 6;
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S312" }).ok);
  assert.equal(tower.templateId, "G070");
  Object.assign(enemy, { x: tower.x + 500 });
  const outside = { ...enemy, id: 911, x: enemy.x + 1 };
  const immune = { ...enemy, id: 912, x: enemy.x - 100, abilities: ["Amim"] };
  state.enemies.push(outside, immune);
  const at = cast(state, tower, "upheaval", "A174", { point: tower });
  assert.equal(enemy.upheavalSlow, .8);
  assert.equal(outside.upheavalSlow, undefined);
  assert.equal(immune.upheavalSlow, undefined);
  assert.equal(state.battleAnimations.at(-1).unitId, "q044");
  advance(state, at + 1_000_000);
  assert.equal(enemy.upheavalSlow, .6);
  advance(state, at + 2_000_000);
  assert.ok(Math.abs(enemy.upheavalSlow - .3) < 1e-9);
  assert.ok(command(state, "stop-chant", { type: "stop-tower-cast", towerId: tower.id }).ok);
  assert.equal(tower.upheavalId, undefined);
  const saved = structuredClone(state);
  advance(saved, at + 4_999_999);
  assert.ok(Math.abs(saved.enemies[0].upheavalSlow - .3) < 1e-9);
  advance(saved, at + 5_000_000);
  assert.equal(saved.enemies[0].upheavalSlow, undefined);
  assert.equal(saved.upheavalAuras, undefined);
});

test("Rain of Chaos lands as two independent T189 orders at one second, and each unit pulses until its own expiry", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A175 = 6;
  tower.qualification = "P006";
  state.structures.push({ ...map.worker, x: tower.x + 700, id: 901, templateId: "n167", radius: 72, pending: null });
  state.inventory = [{ id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command(state, "scepter", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  const point = { x: tower.x + 150, y: tower.y };
  enemy.x = point.x + 300;
  const edge = { ...enemy, id: 911, x: point.x + 500 };
  state.enemies.push(edge);
  const at = cast(state, tower, "rain", "A175", { point });
  advance(state, at + 999_999);
  assert.equal(state.summons, undefined);
  advance(state, at + 1_000_000);
  assert.equal(state.summons.length, 2);
  assert.ok(state.summons.every(unit => unit.templateId === "n266" && unit.summon.ownerId === tower.id));
  const impact = state.recentHits.filter(hit => hit.targetId === edge.id);
  assert.equal(impact.length, 2);
  assert.notEqual(impact[0].casterId, impact[1].casterId);
  assert.equal(enemy.stunUntilUs, at + 2_000_000);
  advance(state, at + 2_000_000);
  assert.equal(state.recentHits.filter(hit => hit.sourceTemplate === "n266").length, 2);
  assert.equal(state.recentHits.filter(hit => hit.sourceTemplate === "n266" && hit.targetId === edge.id).length, 0);
  advance(state, at + 16_000_000);
  assert.equal(state.summons.length, 0);
});

test("Infernal rolls use inclusive 25 and 10, with the second effect reading life after the first, and precede ordinary attack draws", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A175 = 6;
  const at = cast(state, tower, "rain", "A175", { point: enemy });
  advance(state, at + 1_000_000);
  const [infernal] = state.summons;
  const base = structuredClone(state);
  for (const [first, second, expected] of [[25, 10, 3], [26, 11, 1]]) {
    const run = structuredClone(base);
    const [caster] = run.structures;
    const [victim] = run.enemies;
    const before = victim.hp;
    const start = run.recentHits.length;
    const seed = seedFor(first, second);
    run.randomState = seed;
    weaponHit(run, caster, victim, run.summons.find(unit => unit.id === infernal.id));
    const hits = run.recentHits.slice(start);
    assert.equal(hits.length, expected);
    let rng = seed;
    for (let draw = 0; draw < 4; draw++) rng = rngNext(rng);
    assert.equal(run.randomState, rng);
    if (expected === 3) {
      assert.ok(hits.every(hit => hit.sourceTemplate === "n266" && hit.casterId === infernal.id && hit.ownerId === tower.id));
      const spellScale = hits[0].amount / (3000 * .8);
      assert.ok(Math.abs(hits[1].amount - (before - hits[0].amount) * .08 * .8 * spellScale) < .001);
    }
  }
  const ordinary = { ...map.worker, id: 902, templateId: "n230", radius: 72, pending: null };
  state.structures.push(ordinary);
  const seed = seedFor(25, 10);
  state.randomState = seed;
  let expected = seed;
  for (let draw = 0; draw < 4; draw++) expected = rngNext(expected);
  const start = state.recentHits.length;
  weaponHit(state, ordinary, enemy);
  assert.equal(state.randomState, expected);
  assert.deepEqual(state.recentHits.slice(start).map(hit => hit.sourceTemplate), ["n230"]);
});
