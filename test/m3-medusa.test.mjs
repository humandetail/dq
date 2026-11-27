import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { learnableSkills, newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function seedFor(percent) {
  for (let seed = 0; ; seed++) {
    let next = seed;
    for (let draw = 0; draw < 3; draw++) next = (Math.imul(next, 1664525) + 1013904223) >>> 0;
    if (Math.floor(next / 2 ** 32 * 100) + 1 === percent) return seed;
  }
}

function fixture() {
  const state = newMatch("m3-medusa-controlled", 730);
  state.queue.pending = [];
  const tower = { ...map.worker, id: 900, templateId: "H002", radius: 72,
    qualification: null, pending: null, hero: newHero("H002") };
  state.structures = [tower];
  const target = { ...map.worker, x: tower.x + 100, id: 910, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [target];
  return { state, tower, target };
}

function strike(state, tower, target, raw = 100, percentile = 5) {
  state.randomState = seedFor(percentile);
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: tower.id, sourceTemplate: tower.templateId, targetId: target.id, raw,
    weapon: { ...weapons[tower.templateId][0], homing: false }, point: target, destination: target,
  } });
  advance(state, state.queue.nowUs + 1);
}

test("A006 grants its independent T002 rank, and the two engineering forms preserve the split-arrow slot without resetting locks", () => {
  for (const [choice, form, split] of [["S042", "G035", "A099"], ["S043", "G043", "A097"]]) {
    const { state, tower } = fixture();
    assert.ok(command(state, "learn", { type: "learn-skill", towerId: tower.id, skillId: "A006" }).ok);
    assert.equal(tower.hero.ranks.A006, 1);
    assert.equal(tower.hero.ranks.T002, 1);
    tower.hero.ranks.A005 = 2;
    tower.hero.paid.push("A005", "A005");
    tower.multishotReadyUs = 2_000_000;
    assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice }).ok);
    assert.equal(tower.templateId, form);
    assert.equal(tower.hero.ranks[split], 2);
    assert.equal(tower.hero.ranks.A005, undefined);
    assert.equal(tower.hero.ranks.T002, 1);
    assert.equal(tower.multishotReadyUs, 2_000_000);
    assert.deepEqual(tower.hero.paid.slice(-2), [split, split]);
    assert.ok(learnableSkills(form).some(skill => skill.skillId === split));
  }
});

test("A098/A100 add exactly two fixed attack without split-arrow learning or percentage amplification", () => {
  function launch(choice, commandAura, exit = false, image = false) {
    const { state, tower, target } = fixture();
    if (choice) assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice }).ok);
    if (exit) tower.templateId = "H002";
    if (commandAura) state.structures.push({ ...tower, id: 903, templateId: "n213", hero: undefined,
      x: tower.x - 500, attack: { readyUs: 10_000_000 } });
    const weapon = weapons[tower.templateId][0];
    let casterId = tower.id;
    if (image) {
      state.inventory.push({ id: 940, itemId: "i722", slot: null, point: state.worker, charges: 0 });
      assert.ok(command(state, "mirror", { type: "pick-up-item", itemId: 940 }).ok);
      const [illusion] = state.summons;
      casterId = illusion.id;
      assert.equal(illusion.summon.attack, tower.hero.natural.AGI * 1.4);
    }
    const restored = JSON.parse(JSON.stringify(state));
    scheduleEvent(restored.queue, 1, { type: "weapon-ready", towerId: casterId });
    advance(restored, restored.queue.nowUs + 1);
    const release = restored.queue.pending.find(event => event.payload.type === "weapon-fire");
    assert.equal(release.payload.targetId, target.id);
    assert.equal(release.payload.slot, weapon.slot);
    advance(restored, release.dueUs);
    const shot = restored.queue.pending.find(event => event.payload.type === "weapon-impact").payload.shot;
    return shot.raw / (image ? .4 : 1);
  }
  for (const choice of ["S042", "S043"]) {
    const sameStats = launch(choice, false, true);
    assert.equal(launch(choice, false) - sameStats, 2);
    assert.equal(launch(choice, true) - launch(choice, true, true), 2);
    assert.ok(Math.abs(launch(choice, false, false, true) - sameStats - 2) < 1e-8);
  }
});

test("A005 fires two ordered secondary arrows at 1200, includes the 1300 edge and starts one two-second lock", () => {
  const { state, tower, target } = fixture();
  tower.hero.ranks.A005 = 1;
  const one = { ...target, id: 911, x: tower.x + 200 };
  const two = { ...target, id: 912, x: tower.x + 1300 };
  const three = { ...target, id: 913, x: tower.x + 1301 };
  const phased = { ...target, id: 901, x: tower.x + 250, abilities: ["Aloc"] };
  state.enemies.push(three, two, one, phased);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 1);
  const release = state.queue.pending.find(event => event.payload.type === "weapon-fire");
  assert.ok(release);
  advance(state, release.dueUs);
  const arrows = state.queue.pending.filter(event => event.payload.type === "weapon-impact");
  assert.deepEqual(arrows.map(event => event.payload.shot.targetId), [target.id, one.id, two.id]);
  assert.equal(new Set(arrows.map(event => event.payload.shot.raw)).size, 1);
  assert.ok(arrows.every(event => event.payload.shot.weapon.speed === 1200 && event.payload.shot.weapon.homing));
  assert.equal(tower.multishotReadyUs, release.dueUs + 2_000_000);
});

test("A007 exact probability and shared pause survive replay, and an old end releases a later record", () => {
  const { state, tower, target } = fixture();
  tower.hero.ranks.A007 = 1;
  target.abilities = ["N536"];
  strike(state, tower, target, 100, 6);
  assert.equal(target.stoneGaze, undefined);
  strike(state, tower, target);
  assert.equal(target.stoneGaze.paused, true);
  const firstUntil = Object.values(target.stoneGaze.timers)[0];
  strike(state, tower, target);
  assert.deepEqual(Object.values(target.stoneGaze.timers), [firstUntil]);
  advance(state, 400_000);
  // Shell takes one ordinary hit over 10% maximum HP and writes the shared pause off.
  strike(state, tower, target, 11_000);
  assert.equal(target.stoneGaze.paused, false);
  assert.equal(target.stoneGaze.frozenFrameUs, 2);
  strike(state, tower, target);
  assert.equal(target.stoneGaze.paused, true);
  const secondUntil = Object.values(target.stoneGaze.timers).at(-1);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, firstUntil);
  const enemy = restored.enemies[0];
  assert.equal(enemy.stoneGaze.paused, false);
  assert.equal(enemy.stoneGaze.frozenFrameUs, undefined);
  assert.deepEqual(Object.values(enemy.stoneGaze.timers), [secondUntil]);
  advance(restored, secondUntil);
  assert.equal(enemy.stoneGaze, undefined);
});

test("A007 table membership doubles the actual T302 projectile, independently of Shell's early pause release", () => {
  function sample(stone) {
    const { state, tower, target } = fixture();
    target.abilities = ["N536"];
    const doom = { ...tower, id: 902, templateId: "H042", hero: newHero("H042") };
    doom.hero.ranks.T302 = 1;
    doom.hero.natural.INT = 100;
    state.structures.push(doom);
    if (stone) tower.hero.ranks.A007 = 1;
    strike(state, tower, target, 11_000);
    if (stone) {
      assert.equal(target.stoneGaze.paused, false);
      assert.ok(Object.keys(target.stoneGaze.timers).length);
    }
    assert.ok(command(state, "snake", { type: "cast-hero", towerId: doom.id, skillId: "T302", targetId: target.id }).ok);
    advance(state, state.queue.nowUs + 875_000);
    return state.recentHits.at(-1).amount;
  }
  assert.ok(Math.abs(sample(true) / sample(false) - 2) < 1e-8);
});
