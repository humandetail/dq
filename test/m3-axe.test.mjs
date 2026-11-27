import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage, weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 10000) === "pending") {}
}

function cast(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults[id]?.ok, JSON.stringify(state.commandResults[id]));
  const next = state.queue.pending.find(event => event.payload.type === "hero-spell");
  advance(state, next.dueUs);
  return next.dueUs;
}

function fixture(count = 1) {
  const state = newMatch("m3-axe-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H017");
  hero.natural.INT = 100;
  const tower = { ...map.worker, id: 900, templateId: "H017", radius: 72,
    qualification: null, pending: null, hero };
  state.structures = [tower];
  state.enemies = Array.from({ length: count }, (_, index) => ({
    ...map.worker, x: tower.x + 360, id: 950 + index, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1,
  }));
  return { state, tower };
}

test("Berserker's Call stuns immediately and tracks ten independent damage ticks after refresh", () => {
  const { state, tower } = fixture(2);
  tower.hero.ranks.A055 = 2;
  state.enemies[1].abilities = ["N535"];
  const effect = cast(state, "call", { type: "cast-hero", towerId: tower.id, skillId: "A055" });
  const [first, second] = state.enemies;
  assert.equal(first.stunUntilUs, effect + 1_200_000);
  assert.equal(second.stunUntilUs, effect + 1_200_000);
  advance(state, effect + 199_999);
  assert.equal(first.axeBleed, undefined);
  const restored = structuredClone(state);
  advance(restored, effect + 200_000);
  const [victim, shielded] = restored.enemies;
  assert.equal(victim.axeBleed.untilUs, effect + 10_200_000);
  assert.equal(shielded.spellShieldReadyUs, effect + 6_200_000);
  assert.equal(shielded.axeBleed, undefined);
  advance(restored, effect + 10_200_000);
  assert.equal(victim.axeBleed, undefined);
  assert.equal(restored.recentHits.length, 10);
  assert.ok(restored.recentHits.every(hit => hit.targetId === victim.id && hit.sourceTemplate === "q001"));
});

test("Counter Helix's active does not silence attack-triggered Helix during its cooldown", () => {
  const { state, tower } = fixture(40);
  tower.hero.ranks.A056 = 6;
  const effect = cast(state, "helix", { type: "cast-hero", towerId: tower.id, skillId: "A056" });
  const victim = state.enemies[0];
  assert.equal(state.recentHits.length, 40);
  assert.equal(tower.heroSpellReady.A056, effect + 5_000_000);
  const previous = victim.hp;
  const amount = state.recentHits[0].amount;
  const rawShot = { towerId: tower.id, sourceTemplate: tower.templateId, targetId: victim.id, raw: 100,
    point: victim, destination: victim, weapon: { ...weapons.H017[0], homing: false } };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot: rawShot, travelUs: 0 });
  advance(state, state.queue.nowUs + 1);
  assert.ok(previous - victim.hp > amount);
  assert.equal(tower.heroSpellReady.A056, effect + 5_000_000);
});

test("Culling Blade preserves failed Scepter attempts, then halves the live cooldown on success", () => {
  const { state, tower } = fixture(2);
  const [first, side] = state.enemies;
  side.x += 500;
  tower.hero.ranks.A057 = 1;
  state.inventory = [{ itemId: "i310", id: 940, towerId: tower.id, slot: 0, charges: 0, point: tower }];
  const failedAt = cast(state, "fail", { type: "cast-hero", towerId: tower.id, skillId: "A057", targetId: first.id });
  assert.equal(tower.axeFailures, 1);
  assert.equal(tower.axeBloodlustUntilUs, failedAt + 6_000_000);
  const failedBase = physicalDamage(tower.life.maximum * .8, "hero", 0, false);
  assert.ok(100000 - first.hp >= failedBase);
  advance(state, tower.heroSpellReady.A057);
  first.hp = 1;
  first.maxHp = 1100;
  first.abilities = ["Amim"];
  first.graveUntilUs = state.queue.nowUs + 6_000_000;
  const successfulAt = cast(state, "succeed", { type: "cast-hero", towerId: tower.id, skillId: "A057", targetId: first.id });
  assert.ok(!state.enemies.includes(first));
  assert.ok(side.hp < 100000);
  assert.equal(tower.axeFailures, 0);
  assert.equal(tower.axeBloodlustUntilUs, successfulAt + 3_000_000);
  assert.equal(tower.axeHelixUntilUs, undefined);
  const restored = structuredClone(state);
  advance(restored, successfulAt + 100_000);
  const [after] = restored.structures;
  assert.equal(after.heroSpellReady.A057, successfulAt + 10_050_000);
  assert.equal(after.axeHelixUntilUs, successfulAt + 20_100_000);
  assert.equal(after.axeRebateTimer, undefined);
});
