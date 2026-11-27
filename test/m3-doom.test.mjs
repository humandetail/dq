import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch, removeDeadEnemy } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function cast(state, tower, id, skillId, target = null) {
  assert.ok(command(state, id, { type: "cast-hero", towerId: tower.id, skillId, targetId: target?.id }).ok);
  const next = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(next.dueUs - state.queue.nowUs, tower.templateId === "H042" ? 750_000 : 300_000);
  advance(state, next.dueUs);
  return next.dueUs;
}

function fixture(templateId = "H042") {
  const state = newMatch("m3-doom-controlled", 738);
  state.queue.pending = [];
  const hero = newHero(templateId);
  hero.natural.INT = 100;
  const tower = { ...map.worker, id: 900, templateId, radius: 72, qualification: null, pending: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, x: tower.x + 100, id: 910, unitId: "m001", layer: "ground",
    hp: 1000, maxHp: 1000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2,
    initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

test("Devour's pending reward survives round-trip; Steal has a separate slot and digest lock", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A164 = 1;
  tower.hero.ranks.T329 = 1;
  const gold = state.gold;
  const devourAt = cast(state, tower, "devour", "A164", enemy);
  assert.equal(enemy.hp, 0);
  assert.equal(state.gold, gold + 4);
  const afterKillGold = state.gold;
  assert.ok(tower.doomDigestTimer);
  const next = { ...enemy, id: 911, unitId: "m026", hp: 1000 };
  state.enemies.push(next);
  advance(state, devourAt + 100_000);
  assert.equal(command(state, "blocked", { type: "cast-hero", towerId: tower.id, skillId: "A164", targetId: next.id }).reason, "cooldown");
  state.overdraftPoints = 13;
  cast(state, tower, "steal", "T329", next);
  assert.equal(next.hp, 1000);
  assert.equal(tower.doomBorrowed.id, "T317");
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, devourAt + 5_000_000 - 1);
  assert.equal(restored.gold, afterKillGold);
  advance(restored, devourAt + 5_000_000);
  assert.equal(restored.gold, afterKillGold + 140);
  assert.equal(restored.structures[0].doomDigestTimer, undefined);
});

test("Scorched Earth pulses immediately, samples dynamic ranks, and includes the exact radius", () => {
  const { state, tower, enemy } = fixture("G061");
  tower.hero.ranks.A165 = 1;
  enemy.x = tower.x + 500;
  enemy.hp = enemy.maxHp = 100000;
  const beyond = { ...enemy, id: 912, x: enemy.x + 1 };
  state.enemies.push(beyond);
  const at = cast(state, tower, "earth", "A165");
  assert.equal(state.recentHits.length, 1);
  const first = state.recentHits.at(-1).amount;
  tower.hero.ranks.A165 = 2;
  advance(state, at + 1_000_000);
  assert.ok(Math.abs(state.recentHits.at(-1).amount - first * 5 / 3) < 1e-9);
  advance(state, at + 10_000_000);
  assert.equal(tower.doomScorchToken, undefined);
  assert.equal(beyond.hp, beyond.maxHp);
});

test("Doom consumes a spell shield before the curse and its tenth tick clears only its own state", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A166 = 1;
  Object.assign(enemy, { unitId: "mBOS", hp: 200000, maxHp: 200000, abilities: ["N534", "N535"] });
  cast(state, tower, "block-doom", "A166", enemy);
  assert.ok(enemy.spellShieldReadyUs > state.queue.nowUs);
  assert.equal(enemy.doomCurse, undefined);
  advance(state, tower.heroSpellReady.A166);
  enemy.abilities = ["N534"];
  const at = cast(state, tower, "doom", "A166", enemy);
  assert.ok(enemy.doomCurse);
  advance(state, at + 9_000_000);
  const afterNine = enemy.hp;
  assert.ok(enemy.doomCurse);
  advance(state, at + 10_000_000);
  assert.ok(enemy.hp < afterNine);
  assert.equal(enemy.doomCurse, undefined);
});

test("Borrowing replaces the prior actionable slot and Sacrifice restores mana from target maximum life", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T329 = 1;
  enemy.unitId = "m005";
  const first = cast(state, tower, "chakra", "T329", enemy);
  assert.equal(tower.hero.ranks.T300, tower.doomBorrowed.rank);
  tower.mana = 200;
  tower.manaRegen = 0;
  advance(state, first + 100_000);
  const chakraAt = cast(state, tower, "chakra-self", "T300", tower);
  const rank = tower.hero.ranks.T300;
  assert.equal(tower.mana, Math.min(tower.manaMaximum,
    200 + tower.manaRegen * .75 + [300, 400, 500 + .05 * tower.manaMaximum, 600 + .1 * tower.manaMaximum][rank - 1]));
  advance(state, tower.heroSpellReady.T329);
  enemy.unitId = "m026";
  const stealAt = cast(state, tower, "sacrifice-slot", "T329", enemy);
  assert.equal(tower.hero.ranks.T300, undefined);
  assert.ok(tower.hero.ranks.T317 > 0);
  assert.ok(stealAt > chakraAt);
  advance(state, stealAt + 100_000);
  tower.mana = 100;
  tower.manaRegen = 0;
  cast(state, tower, "sacrifice", "T317", enemy);
  assert.equal(enemy.hp, 0);
  assert.equal(tower.mana, 300 + tower.manaRegen * .75);
});

test("Stomp's hit and strength-scaled auxiliary stun stay within the exact 1200 radius", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T310 = 1;
  tower.hero.natural.STR = 1000;
  enemy.hp = enemy.maxHp = 100000;
  enemy.x = tower.x + 1200;
  const beyond = { ...enemy, id: 911, x: enemy.x + 1 };
  state.enemies.push(beyond);
  const at = cast(state, tower, "hoof-stomp", "T310");
  assert.equal(enemy.stunUntilUs, at + 2_200_000);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(beyond.stunUntilUs, undefined);
  assert.equal(beyond.hp, beyond.maxHp);
});

test("Mystic Snake carries only the actual extracted mana through both hops and the restored return flight", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T302 = 2;
  enemy.hp = enemy.maxHp = 100000;
  enemy.mana = 250;
  const second = { ...enemy, id: 911, x: tower.x + 250, mana: 70 };
  state.enemies.push(second);
  const at = cast(state, tower, "snake", "T302", enemy);
  const manaAfterCast = tower.mana;
  advance(state, at + 312_500);
  assert.deepEqual([enemy.mana, second.mana], [50, 0]);
  assert.equal(tower.mana, manaAfterCast);
  const flight = state.queue.pending.filter(event => event.payload.type === "doom-projectile");
  assert.equal(flight.length, 1);
  assert.equal(flight[0].payload.mana, 270);
  assert.equal(flight[0].payload.spell, "T178");
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, at + 624_999);
  assert.equal(restored.structures[0].mana, manaAfterCast);
  advance(restored, at + 625_000);
  assert.ok(restored.structures[0].mana >= manaAfterCast + 270);
  assert.ok(restored.structures[0].mana < manaAfterCast + 273);
  assert.ok(!restored.queue.pending.some(event => event.payload.type === "doom-projectile"));
});

test("Chaos Bolt holds its launch stun after Steal changes and skips the late rank-based damage", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T303 = 2;
  enemy.hp = enemy.maxHp = 100000;
  const at = cast(state, tower, "chaos", "T303", enemy);
  const queued = state.queue.pending.find(event => event.payload.type === "doom-projectile");
  assert.ok(queued.payload.stun >= 1 && queued.payload.stun <= 3);
  delete tower.hero.ranks.T303;
  advance(state, at + 100_000);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(enemy.stunUntilUs, at + 100_000 + queued.payload.stun * 1_000_000);
});

test("Tidal Surge keeps two independent projectiles through one shield and applies the later armor window", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T328 = 2;
  enemy.hp = enemy.maxHp = 100000;
  enemy.x = tower.x + 140;
  enemy.abilities = ["N535"];
  const at = cast(state, tower, "surge", "T328", enemy);
  assert.equal(state.queue.pending.filter(event => event.payload.type === "doom-projectile").length, 2);
  advance(state, at + 100_000);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(enemy.stunUntilUs, undefined);
  assert.deepEqual(enemy.doomWave, { amount: 30, untilUs: at + 4_100_000 });
});

test("Battle shout locks ground movement independently and loads its poison only after the carrier windup", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T301 = 2;
  enemy.hp = enemy.maxHp = 100000;
  enemy.x = tower.x + 600;
  const at = cast(state, tower, "shout", "T301");
  assert.equal(enemy.doomRoarUntilUs, at + 1_600_000);
  assert.equal(enemy.stunUntilUs, undefined);
  advance(state, at + 1_999_999);
  assert.equal(enemy.hp, enemy.maxHp);
  advance(state, at + 2_000_000);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.ok(enemy.doomPoison[tower.id]);
});

test("Frost Shield observes its recipient's later position and has no effect before the first scheduled pulse", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T318 = 1;
  enemy.hp = enemy.maxHp = 100000;
  enemy.x = tower.x + 1000;
  const at = cast(state, tower, "shield", "T318", tower);
  tower.x += 200;
  advance(state, at + 1_499_999);
  assert.equal(enemy.doomFrostUntilUs, undefined);
  assert.equal(enemy.hp, enemy.maxHp);
  advance(state, at + 1_500_000);
  assert.equal(enemy.doomFrostUntilUs, at + 3_500_000);
  assert.equal(enemy.hp, enemy.maxHp);
  advance(state, at + 1_700_000);
  assert.ok(enemy.hp < enemy.maxHp);
});

test("Life Drain keeps an immutable pulse amount while crediting only the currently borrowed rank", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T323 = 2;
  enemy.hp = enemy.maxHp = 100000;
  const natural = tower.hero.natural.INT;
  const at = cast(state, tower, "drain", "T323", enemy);
  advance(state, at + 1_000_000);
  assert.equal(tower.hero.natural.INT, natural + 7);
  assert.equal(tower.doomDrain.bonus, 7);
  delete tower.hero.ranks.T323;
  const firstHit = enemy.hp;
  advance(state, at + 2_000_000);
  assert.ok(enemy.hp < firstHit);
  assert.equal(tower.hero.natural.INT, natural + 7);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, at + 8_000_000);
  assert.equal(restored.structures[0].hero.natural.INT, natural);
  assert.equal(restored.structures[0].doomDrain, undefined);
});

test("Borrowed wolves use their exact template, count and contract before normal expiry", () => {
  const { state, tower } = fixture();
  tower.hero.ranks.T326 = 3;
  state.inventory = [{ id: 940, itemId: "i243", slot: 0, towerId: tower.id, charges: 0, point: tower }];
  const at = cast(state, tower, "wolves", "T326");
  assert.equal(state.summons.length, 3);
  assert.ok(state.summons.every(unit => unit.templateId === "b153" && unit.summon.ownerId === tower.id &&
    unit.summon.red === 1 && unit.summon.speed === .5 && unit.summon.attack > 0));
  advance(state, at + 25_000_000);
  assert.equal(state.summons.length, 0);
});

function seedFor(percent, draw = 1) {
  for (let seed = 0; ; seed++) {
    let next = seed;
    for (let index = 0; index < draw; index++) next = (Math.imul(next, 1664525) + 1013904223) >>> 0;
    if (Math.floor(next / 2 ** 32 * 100) + 1 === percent) return seed;
  }
}

function hit(state, tower, enemy, fields = {}) {
  const weapon = { ...weapons[tower.templateId][0], homing: false };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
    towerId: tower.id, sourceTemplate: tower.templateId, targetId: enemy.id,
    raw: 100, weapon, point: enemy, destination: enemy, ...fields,
  } });
  advance(state, state.queue.nowUs + 1);
}

test("Borrowed native crit respects the exact 10% threshold and Force deals the actual wielder's maximum-life splash", () => {
  const { state, tower, enemy } = fixture();
  enemy.hp = enemy.maxHp = 100000;
  state.randomState = seedFor(10);
  hit(state, tower, enemy, { doomCritRank: 4 });
  const critical = state.recentHits.at(-1).amount;
  state.randomState = seedFor(11);
  hit(state, tower, enemy, { doomCritRank: 4 });
  assert.ok(Math.abs(critical / state.recentHits.at(-1).amount - 22) < 1e-8);
  tower.doomBorrowed = { id: "T325", rank: 4 };
  const splash = { ...enemy, id: 911, x: enemy.x + 600 };
  const beyond = { ...enemy, id: 912, x: enemy.x + 601 };
  state.enemies.push(splash, beyond);
  const outsideHp = beyond.hp;
  state.randomState = seedFor(15, 5);
  hit(state, tower, enemy);
  assert.ok(tower.life.maximum > 0);
  assert.ok(state.recentHits.at(-2).amount > 100);
  assert.equal(state.recentHits.at(-2).targetId, splash.id);
  assert.equal(beyond.hp, outsideHp);
});

test("Borrowed Dragon Blood grows maximum life only, and Track rewards its actual marked owner and current rank", () => {
  const { state, tower, enemy } = fixture();
  const ally = { ...tower, id: 901, hero: newHero("H042") };
  ally.doomBorrowed = { id: "T320", rank: 3 };
  state.structures.push(ally);
  tower.hero.ranks.T319 = 2;
  tower.doomBorrowed = { id: "T319", rank: 2 };
  cast(state, tower, "track", "T319", enemy);
  assert.equal(enemy.doomTrack.casterId, tower.id);
  assert.equal(enemy.doomTrack.amount, 30);
  enemy.hp = 0;
  const goldBefore = state.gold;
  assert.ok(removeDeadEnemy(state, enemy.id, ally.id));
  assert.ok(state.gold >= goldBefore + 4 + 15 && state.gold <= goldBefore + 4 + 60);
  assert.equal(ally.lifeOffset, 6);
  assert.equal(ally.life.maximum - ally.life.hp, 6);
});

test("Borrowed Fury and ordinary Bloodlust have their distinct lifetimes and can overlap", () => {
  const { state, tower } = fixture();
  const source = { ...tower, id: 901, x: tower.x + 50, hero: newHero("H042") };
  state.structures.push(source);
  tower.hero.ranks.T311 = 2;
  source.hero.ranks.T321 = 3;
  const furyAt = cast(state, tower, "fury", "T311");
  assert.deepEqual(tower.doomBloodlust, { untilUs: furyAt + 3_000_000, amount: 1.5 });
  const hasteAt = cast(state, source, "lust", "T321", tower);
  assert.equal(tower.bloodlust.untilUs, hasteAt + 7_000_000);
  assert.equal(Math.round(tower.bloodlust.amount * 10), 7);
  advance(state, furyAt + 3_000_000);
  assert.equal(tower.doomBloodlust, undefined);
  assert.ok(tower.bloodlust);
});

test("Infernal Blade reads each pulse's health and live rank, with a separately shielded stun", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T314 = 2;
  enemy.hp = enemy.maxHp = 100000;
  enemy.abilities = ["N535"];
  const at = cast(state, tower, "infernal", "T314", enemy);
  assert.equal(enemy.stunUntilUs, undefined);
  assert.ok(enemy.hp < enemy.maxHp);
  tower.hero.ranks.T314 = 1;
  advance(state, at + 1_000_000);
  assert.ok(state.recentHits[1].amount < state.recentHits[0].amount / 2);
  advance(state, at + 4_000_000);
  assert.equal(state.recentHits.length, 5);
  assert.equal(tower.doomInfernalToken, undefined);
});

test("Weave only reduces armor inside its closed radius and holds its own expiry", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T313 = 4;
  enemy.hp = enemy.maxHp = 100000;
  const outside = { ...enemy, id: 911, x: enemy.x + 501 };
  state.enemies.push(outside);
  const at = cast(state, tower, "weave", "T313", enemy);
  assert.deepEqual(enemy.doomWeave, { untilUs: at + 5_000_000, amount: 60 });
  assert.equal(outside.doomWeave, undefined);
  hit(state, tower, enemy);
  const weak = state.recentHits.at(-1).amount;
  advance(state, at + 5_000_000);
  hit(state, tower, enemy);
  assert.ok(state.recentHits.at(-1).amount < weak);
});

test("Overwhelming Odds weights each mapped boss fivefold and excludes a target just outside 400", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.T315 = 1;
  enemy.hp = enemy.maxHp = 100000;
  const boss = { ...enemy, id: 911, unitId: "m005", abilities: ["N534"], x: enemy.x + 400 };
  const outside = { ...enemy, id: 912, x: enemy.x + 401 };
  const base = JSON.parse(JSON.stringify(state));
  cast(base, base.structures[0], "base", "T315", base.enemies[0]);
  state.enemies.push(boss, outside);
  cast(state, tower, "weighted", "T315", enemy);
  assert.ok(Math.abs(state.recentHits[0].amount / base.recentHits[0].amount - 6) < 1e-8);
  assert.equal(outside.hp, outside.maxHp);
});

test("The strongest closed-radius spell aura wins, and damage updates when the emitter leaves", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A165 = 1;
  enemy.hp = enemy.maxHp = 100000;
  tower.doomBorrowed = { id: "T307", rank: 2 };
  const ally = { ...tower, id: 911, x: tower.x + 500, hero: newHero("H042"), doomBorrowed: { id: "T307", rank: 4 } };
  state.structures.push(ally);
  const at = cast(state, tower, "field", "A165");
  const first = state.recentHits.at(-1).amount;
  ally.x += 1;
  advance(state, at + 1_000_000);
  const second = state.recentHits.at(-1).amount;
  assert.ok(Math.abs(first / second - 1.2 / 1.1) < 1e-9);
});

test("Borrowed Overpower shares the carrier and rate, and Totem releases on the first accepted hit", () => {
  const { state, tower, enemy } = fixture();
  tower.doomBorrowed = { id: "T316", rank: 4 };
  enemy.hp = enemy.maxHp = 100000;
  state.randomState = seedFor(12);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 1);
  assert.equal(tower.overpower.untilUs, 3_000_001);
  assert.ok(state.queue.pending.some(event => event.payload.type === "ursa-carrier-expire" && event.payload.skillId === "T144"));

  const other = fixture();
  other.tower.hero.ranks.T322 = 3;
  other.enemy.hp = other.enemy.maxHp = 100000;
  const at = cast(other.state, other.tower, "totem", "T322");
  assert.deepEqual(other.tower.doomTotem, { untilUs: at + 14_000_000, scale: 9 });
  hit(other.state, other.tower, other.enemy);
  assert.equal(other.tower.doomTotem, undefined);
  assert.equal(other.state.recentHits.length, 1);
  assert.ok(other.state.recentHits[0].amount > 0);
});

test("Slithereen Crush stuns for the specified duration and Whirlwind reads health before the first packet", () => {
  const crush = fixture();
  crush.tower.hero.ranks.T324 = 3;
  crush.enemy.hp = crush.enemy.maxHp = 100000;
  crush.enemy.x = crush.tower.x + 800;
  const at = cast(crush.state, crush.tower, "crush", "T324");
  assert.equal(crush.enemy.stunUntilUs, at + 1_400_000);
  assert.ok(crush.enemy.hp < crush.enemy.maxHp);

  const cyclone = fixture();
  cyclone.tower.hero.ranks.T327 = 2;
  cyclone.enemy.hp = cyclone.enemy.maxHp = 100000;
  cast(cyclone.state, cyclone.tower, "whirlwind", "T327");
  assert.equal(cyclone.state.recentHits.length, 2);
  const expected = 10000 * (1 + cyclone.tower.hero.natural.AGI * .0005);
  assert.ok(Math.abs(cyclone.state.recentHits[1].amount - expected) < 1e-8);
});

test("Doom's skin preserves the stolen slot and Blink uses its selected rank, windup and delayed relocation", () => {
  const { state, tower } = fixture();
  Object.assign(tower, { x: -288, y: -160 });
  tower.hero.ranks.T329 = 2;
  tower.hero.ranks.T312 = 1;
  tower.doomBorrowed = { id: "T312", rank: 1 };
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S232" }).ok);
  assert.equal(tower.templateId, "G061");
  assert.equal(tower.hero.ranks.T329, 2);
  assert.deepEqual(tower.doomBorrowed, { id: "T312", rank: 1 });
  const point = { x: -288, y: 640 };
  const blink = { type: "cast-hero", towerId: tower.id, skillId: "T312", point };
  assert.equal(command(state, "rank-one", blink).reason, "range");
  tower.hero.ranks.T312 = 2;
  tower.doomBorrowed.rank = 2;
  assert.ok(command(state, "rank-two", blink).ok);
  const at = state.queue.nowUs + 300_000;
  advance(state, at + 99_999);
  assert.deepEqual([tower.x, tower.y], [-288, -160]);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, at + 100_000);
  assert.deepEqual([restored.structures[0].x, restored.structures[0].y], [point.x, point.y]);
});
