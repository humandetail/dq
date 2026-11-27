import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { effectiveAttributes, weapons } from "../src/game/m2/combat.ts";
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
  const state = newMatch("m3-outworld-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H026");
  hero.natural.INT = 300;
  const tower = { ...map.worker, id: 900, templateId: "H026", radius: 72, pending: null, qualification: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, id: 910, x: tower.x + 500, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

function seedFor(percentile, count = 1) {
  for (let seed = 0; ; seed++) {
    let next = seed;
    for (let draw = 0; draw < count; draw++) next = (Math.imul(next, 1664525) + 1013904223) >>> 0;
    if (Math.floor(next / 2 ** 32 * 100) + 1 === percentile) return seed;
  }
}

function scepter(state, tower) {
  tower.qualification = "P006";
  state.structures.push({ ...map.worker, x: tower.x + 500, id: 901, templateId: "n167", radius: 72, pending: null });
  state.inventory = [{ id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command(state, "scepter", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
}

test("Arcane Orb pays on its actual weapon commit and only that homing shot gains intelligence after restore", () => {
  const { state, tower, enemy } = fixture();
  assert.ok(command(state, "learn", { type: "learn-skill", towerId: tower.id, skillId: "A083" }).ok);
  enemy.x = tower.x + 1250;
  const immune = { ...enemy, id: 911, abilities: ["Amim"] };
  state.enemies.push(immune);
  assert.equal(command(state, "immune", { type: "cast-flame-arrow", towerId: tower.id, targetId: immune.id }).reason, "range");
  assert.ok(command(state, "arrow", { type: "cast-flame-arrow", towerId: tower.id, targetId: enemy.id }).ok);
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advance(state, state.queue.nowUs + 1);
  const fire = state.queue.pending.find(event => event.payload.type === "weapon-fire");
  const before = tower.mana;
  advance(state, fire.dueUs);
  const { shot } = state.queue.pending.find(event => event.payload.type === "weapon-impact").payload;
  assert.equal(shot.arcaneOrbPaid, true);
  assert.equal(shot.weapon.speed, 1500);
  assert.ok(before - tower.mana > 99 && before - tower.mana <= 100);
  assert.equal(tower.hero.natural.INT, 300);
  const restored = structuredClone(state);
  const flying = restored.queue.pending.find(event => event.payload.type === "weapon-impact");
  // Restore only this shot until its arrival is established.
  advance(restored, fire.dueUs + 840_000);
  const [caster] = restored.structures;
  const [target] = restored.enemies;
  assert.equal(caster.hero.natural.INT, 301);
  const at = restored.recentHits[0].atUs;
  assert.ok(at > flying.dueUs && restored.recentHits.length >= 2);
  assert.equal(target.arcanePoisonUntilUs, at + 10_000);
  scheduleEvent(restored.queue, 0, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: caster.id, sourceTemplate: caster.templateId, targetId: target.id, raw: 200,
    weapon: { ...weapons[caster.templateId][0], homing: false }, point: target, destination: target,
  } });
  advance(restored, restored.queue.nowUs);
  assert.equal(caster.hero.natural.INT, 301);
  advance(restored, at + 10_000);
  assert.equal(target.arcanePoisonUntilUs, undefined);
  target.poisonAttackSlow = { amount: .2, expiresUs: at + 1_000_000 };
  scheduleEvent(restored.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: caster.id, sourceTemplate: caster.templateId, targetId: target.id, raw: 200,
    weapon: { ...weapons[caster.templateId][0], homing: false }, point: target, destination: target,
  } });
  advance(restored, restored.queue.nowUs + 1);
  assert.equal(caster.hero.natural.INT, 301);
  advance(restored, at + 70_000_000);
  assert.equal(caster.hero.natural.INT, 300);
});

test("Essence Aura changes current and maximum mana once per learning and uses fallback and exact 30/31 across the boundary", () => {
  const { state, tower } = fixture();
  assert.ok(command(state, "orb", { type: "learn-skill", towerId: tower.id, skillId: "A083" }).ok);
  assert.ok(command(state, "mana-init", { type: "cast-flame-arrow", towerId: tower.id, targetId: 910 }).ok);
  const maximum = tower.manaMaximum;
  tower.mana = 100;
  tower.hero.level = 4;
  tower.hero.points = 1;
  assert.ok(command(state, "aura-learn", { type: "learn-skill", towerId: tower.id, skillId: "A084" }).ok);
  assert.equal(tower.manaMaximum, maximum + 500);
  assert.ok(tower.mana >= 600 && tower.mana < 600.001);
  const stronger = { ...tower, id: 902, x: tower.x + 900, hero: newHero("H026") };
  stronger.hero.ranks.A084 = 6;
  state.structures.push(stronger);
  tower.hero.ranks.A085 = 1;
  const original = structuredClone(state);
  for (const [roll, distance, percent] of [[30, 900, .30], [30, 901, .05], [31, 900, 0]]) {
    const run = structuredClone(original);
    const [caster, second] = run.structures;
    second.x = caster.x + distance;
    run.randomState = seedFor(roll);
    assert.ok(command(run, "eclipse", { type: "cast-hero", towerId: caster.id, skillId: "A085", point: caster }).ok);
    const event = run.queue.pending.find(event => event.payload.type === "hero-spell");
    assert.equal(event.dueUs - run.queue.nowUs, 530_000);
    const before = caster.mana;
    advance(run, event.dueUs);
    assert.ok(Math.abs(caster.mana - (before + caster.manaRegen * .53 - 100 + percent * caster.manaMaximum)) < .001);
  }
  state.randomState = seedFor(31);
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S292" }).ok);
  assert.equal(tower.templateId, "G069");
  assert.equal(tower.manaOffset, 250);
});

test("Sanity's Eclipse counts shield and immune targets for separate Scepter gains, reads the gained intelligence, and expires each cast independently", () => {
  const { state, tower, enemy } = fixture();
  scepter(state, tower);
  tower.hero.ranks.A083 = 2;
  tower.hero.ranks.A085 = 1;
  const point = { x: tower.x + 210, y: tower.y };
  Object.assign(enemy, { x: point.x + 550, abilities: ["N535"] });
  const immune = { ...enemy, id: 911, x: point.x + 20, abilities: ["Amim"] };
  const out = { ...enemy, id: 912, x: point.x + 551 };
  state.enemies.push(immune, out);
  assert.ok(command(state, "first", { type: "cast-hero", towerId: tower.id, skillId: "A085", point }).ok);
  let castAt = state.queue.pending.find(event => event.payload.type === "hero-spell").dueUs;
  advance(state, castAt);
  const firstAt = castAt;
  assert.equal(tower.hero.natural.INT, 304);
  assert.equal(enemy.hp < enemy.maxHp, true);
  assert.equal(enemy.spellShieldReadyUs, undefined);
  assert.equal(immune.hp, immune.maxHp);
  assert.equal(out.hp, out.maxHp);
  advance(state, firstAt + 16_000_000);
  assert.ok(command(state, "second", { type: "cast-hero", towerId: tower.id, skillId: "A085", point }).ok);
  castAt = state.queue.pending.find(event => event.payload.type === "hero-spell").dueUs;
  advance(state, castAt);
  assert.equal(tower.hero.natural.INT, 308);
  assert.ok(state.recentHits[1].amount > state.recentHits[0].amount);
  assert.ok(command(state, "remove", { type: "transfer-item", itemId: 940 }).ok);
  const saved = structuredClone(state);
  advance(saved, firstAt + 70_000_000);
  assert.equal(saved.structures[0].hero.natural.INT, 304);
  advance(saved, castAt + 70_000_000);
  assert.equal(saved.structures[0].hero.natural.INT, 300);
});

test("Arcane Orb with a live Scepter delivers one 285-circle packet before its sole Essence recovery draw", () => {
  const { state, tower, enemy } = fixture();
  scepter(state, tower);
  tower.hero.ranks.A083 = 2;
  tower.hero.ranks.A084 = 2;
  const edge = { ...enemy, id: 911, y: enemy.y + 285 };
  const outside = { ...enemy, id: 912, y: enemy.y + 286 };
  state.enemies.push(edge, outside);
  assert.ok(command(state, "toggle", { type: "toggle-flame-arrows", towerId: tower.id }).ok);
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advance(state, state.queue.nowUs + 1);
  const fire = state.queue.pending.find(event => event.payload.type === "weapon-fire");
  advance(state, fire.dueUs);
  const initial = tower.manaMaximum;
  assert.equal(state.queue.pending.find(event => event.payload.type === "weapon-impact").payload.shot.arcaneOrbPaid, true);
  tower.mana = initial / 2;
  state.randomState = seedFor(30, 3);
  let expectedRandom = state.randomState;
  // The two Infernal draws lead, followed by Essence and the two later common weapon draws.
  for (let draw = 0; draw < 5; draw++) expectedRandom = (Math.imul(expectedRandom, 1664525) + 1013904223) >>> 0;
  advance(state, fire.dueUs + 340_000);
  assert.equal(state.randomState, expectedRandom);
  assert.equal(tower.hero.natural.INT, 302);
  assert.equal(tower.manaMaximum, initial + 24);
  const edgeHits = state.recentHits.filter(hit => hit.targetId === edge.id);
  const mainHits = state.recentHits.filter(hit => hit.targetId === enemy.id);
  assert.equal(edgeHits.length, 1);
  assert.equal(mainHits.length, 2);
  assert.equal(mainHits[0].amount, edgeHits[0].amount);
  const beforeRecovery = tower.mana - .10 * tower.manaMaximum;
  const { AGI } = effectiveAttributes(tower.hero, ["i310"]);
  assert.ok(Math.abs(edgeHits[0].amount - beforeRecovery * .08 * (1 + .0005 * AGI)) < .001);
  assert.equal(outside.hp, outside.maxHp);
});
