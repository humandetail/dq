import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, heroSpellTargets, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture(templateId) {
  const state = newMatch("m3-skeleton", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const actor = { ...map.worker, id: 900, templateId, population: 5, radius: 72, pending: null, qualification: null };
  state.structures = [actor];
  const basic = { ...state.enemies[0], ...map.worker, id: 100, hp: 10_000, maxHp: 10_000, speed: 0, armor: 0, abilities: [] };
  state.enemies = [basic];
  const send = (action, id = action.type) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  return { state, actor, basic, send };
}
function weaponHit(state, tower, enemy, extra = {}) {
  const shot = { towerId: tower.id, sourceTemplate: tower.templateId, targetId: enemy.id, raw: 100,
    weapon: { ...weapons[tower.templateId][0], attackType: "chaos", homing: false },
    point: { x: enemy.x, y: enemy.y }, destination: { x: enemy.x, y: enemy.y }, ...extra };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
  advance(state, state.queue.nowUs + 1);
}

function seedFor(first, second = undefined) {
  const next = state => (Math.imul(state, 1664525) + 1013904223) >>> 0;
  const percent = state => 1 + Math.floor(state / 2 ** 32 * 100);
  for (let seed = 0; ; seed++) {
    const native = next(seed);
    const fist = next(native);
    const soul = next(fist);
    if (percent(native) === first && (second === undefined || percent(next(soul)) === second)) return seed;
  }
}

test("N096–102 use the checked 20% cutoff and each native level's multiplier", () => {
  for (const [index, expected] of [120, 140, 160, 180, 200, 230, 260].entries()) {
    const { state, actor, basic } = fixture("n" + (221 + index));
    state.randomState = seedFor(20);
    weaponHit(state, actor, basic);
    assert.ok(Math.abs(state.recentHits.at(-1).amount - expected) < 1e-8);
    state.randomState = seedFor(21);
    weaponHit(state, actor, basic);
    assert.equal(state.recentHits.at(-1).amount, 100);
  }
});

test("A034 is boss-only, launches after .5 s, and restores its delayed marker and actual-source amplification", () => {
  const { state, actor, basic, send } = fixture("H010");
  actor.hero = newHero("H005");
  actor.hero.natural = { STR: 0, AGI: 0, INT: 100 };
  actor.hero.ranks.A034 = 6;
  const boss = { ...basic, id: 101, unitId: "ma01", abilities: ["N534"], x: actor.x + 400 };
  state.enemies.push(boss);
  assert.deepEqual(heroSpellTargets(state, actor.id, "A034").map(unit => unit.id), [boss.id]);
  assert.ok(send({ type: "cast-hero", towerId: actor.id, skillId: "A034", targetId: boss.id }).ok);
  advance(state, 500_001);
  assert.equal(state.queue.pending.some(({ payload }) => payload.type === "wraith-projectile"), false);
  advance(state, 500_002);
  assert.equal(actor.heroSpellReady.A034, 13_500_002);
  assert.equal(actor.mana, actor.manaMaximum);
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, 900_001);
  assert.equal(saved.enemies[1].wraithMarkUntilUs, undefined);
  advance(saved, 900_002);
  const restoredBoss = saved.enemies[1];
  assert.equal(restoredBoss.wraithMarkUntilUs, 5_400_002);
  weaponHit(saved, saved.structures[0], restoredBoss);
  assert.equal(saved.recentHits.at(-1).amount, 130);
  advance(saved, 5_400_002);
  assert.equal(restoredBoss.wraithMarkUntilUs, undefined);
  weaponHit(saved, saved.structures[0], restoredBoss);
  assert.equal(saved.recentHits.at(-1).amount, 100);
});

test("A034 spell shield intercepts the mark only on projectile contact, including the G046 form", () => {
  const { state, actor, basic, send } = fixture("G046");
  actor.hero = newHero("H005");
  actor.hero.natural = { STR: 0, AGI: 0, INT: 100 };
  actor.hero.ranks.A034 = 1;
  const boss = { ...basic, id: 101, unitId: "ma01", abilities: ["N534", "N535"], x: actor.x + 400 };
  state.enemies = [boss];
  assert.ok(send({ type: "cast-hero", towerId: actor.id, skillId: "A034", targetId: boss.id }).ok);
  advance(state, 900_001);
  assert.equal(boss.spellShieldReadyUs, undefined);
  advance(state, 900_002);
  assert.equal(boss.wraithMarkUntilUs, undefined);
  assert.equal(boss.spellShieldReadyUs, 6_900_002);
});

test("A035 and the independent A036 rating use separate rolls and child damage precedes the main packet", () => {
  const { state, actor, basic } = fixture("H010");
  actor.hero = newHero("H005");
  actor.hero.natural = { STR: 100, AGI: 0, INT: 0 };
  actor.hero.ranks = { A035: 1, A036: 1 };
  for (const [native, child, expected] of [[10, 11, [296.8, 159]], [11, 10, [445.2, 106]]]) {
    state.randomState = seedFor(native, child);
    weaponHit(state, actor, basic, { wraithCritRank: 1 });
    assert.ok(state.recentHits.slice(-2).every(({ amount }, index) => Math.abs(amount - expected[index]) < 1e-8));
  }
});

test("S112 keeps the actual hero and all learned skeleton ranks across G046 transformation and restore", () => {
  const { state, actor, basic, send } = fixture("H010");
  actor.hero = newHero("H010");
  const start = { ...actor.hero.natural };
  actor.hero.ranks = { A034: 2, A035: 3, A036: 4 };
  actor.hero.paid = ["A034", "A035", "A036"];
  actor.heroSpellReady = { A034: 8_000_000 };
  actor.autoModes = { A034: false };
  assert.deepEqual(send({ type: "choose-skin", towerId: actor.id, choice: "S112" }), { ok: true });
  assert.equal(actor.templateId, "G046");
  const saved = JSON.parse(JSON.stringify(state));
  const hero = saved.structures[0].hero;
  for (const stat of ["STR", "AGI", "INT"]) assert.equal(hero.natural[stat], start[stat] + 30);
  assert.deepEqual(hero.ranks, { A034: 2, A035: 3, A036: 4 });
  assert.deepEqual(hero.paid, ["A034", "A035", "A036"]);
  assert.equal(saved.structures[0].heroSpellReady.A034, 8_000_000);
  assert.equal(saved.structures[0].autoModes.A034, false);
  const target = saved.enemies.find(enemy => enemy.id === basic.id);
  target.wraithMarkUntilUs = 8_000_000;
  weaponHit(saved, saved.structures[0], target, { sourceTemplate: "H010" });
  assert.equal(saved.recentHits.length, 2);
});
