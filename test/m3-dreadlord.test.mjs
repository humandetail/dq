import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
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
  const state = newMatch("m3-dreadlord-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H030");
  hero.natural.INT = 300;
  const tower = { ...map.worker, id: 900, templateId: "H030", radius: 72, pending: null, qualification: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, id: 910, x: tower.x + 100, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 2000, manaMax: 2000, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

function cast(state, tower, id, skillId, selection) {
  assert.ok(command(state, id, { type: "cast-hero", towerId: tower.id, skillId, ...selection }).ok);
  const event = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(event.dueUs - state.queue.nowUs, 300_000);
  advance(state, event.dueUs);
  return event.dueUs;
}

test("Nether Blast captures its dose and uses form-specific .8/.2 second commits on a closed 500 radius", () => {
  for (const [form, delay, visual] of [["H030", 800_000, "WispExplode"], ["G060", 200_000, "PsiWave"]]) {
    const { state, tower, enemy } = fixture();
    tower.hero.ranks.A101 = 1;
    if (form === "G060") assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S222" }).ok);
    assert.equal(tower.templateId, form);
    const point = { x: tower.x + 200, y: tower.y };
    Object.assign(enemy, { x: point.x + 500, abilities: ["N535"] });
    const outside = { ...enemy, id: 911, x: point.x + 501 };
    state.enemies.push(outside);
    const at = cast(state, tower, "blast", "A101", { point });
    tower.hero.ranks.A101 = 6;
    advance(state, at + delay - 1);
    assert.equal(enemy.hp, enemy.maxHp);
    const saved = structuredClone(state);
    advance(saved, at + delay);
    const [edge, beyond] = saved.enemies;
    assert.ok(edge.maxHp - edge.hp < 800);
    assert.ok(edge.hp < edge.maxHp);
    assert.equal(edge.spellShieldReadyUs, undefined);
    assert.equal(beyond.hp, beyond.maxHp);
    assert.ok(saved.battleAnimations.some(animation => animation.unitId === visual && animation.atUs === at + delay));
  }
});

test("Decrepify has independent shield checks and gives exact half weapon and one-and-a-half magic until expiry", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A101 = tower.hero.ranks.A102 = 1;
  const point = { x: enemy.x, y: enemy.y };
  const shielded = { ...enemy, id: 911, y: enemy.y + 100, abilities: ["N535"] };
  const edge = { ...enemy, id: 912, y: enemy.y - 300 };
  const beyond = { ...enemy, id: 913, y: enemy.y - 301 };
  state.enemies.push(shielded, edge, beyond);
  const at = cast(state, tower, "slow", "A102", { point });
  assert.equal(enemy.decrepifyUntilUs, at + 5_000_000);
  assert.equal(edge.decrepifyUntilUs, at + 5_000_000);
  assert.equal(shielded.decrepifyUntilUs, undefined);
  assert.ok(shielded.spellShieldReadyUs > at);
  assert.equal(beyond.decrepifyUntilUs, undefined);
  const ally = { ...map.worker, id: 901, templateId: "n230", radius: 72, pending: null };
  state.structures.push(ally);
  for (const target of [enemy, shielded]) {
    scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
      towerId: ally.id, sourceTemplate: ally.templateId, targetId: target.id, raw: 200,
      weapon: { ...weapons[ally.templateId][0], homing: false }, point: target, destination: target,
    } });
  }
  advance(state, at + 1);
  assert.equal(state.recentHits[0].amount * 2, state.recentHits[1].amount);
  advance(state, at + 100_000);
  const blastAt = cast(state, tower, "blast", "A101", { point });
  advance(state, blastAt + 800_000);
  const magic = state.recentHits.filter(hit => hit.sourceTemplate === tower.templateId);
  assert.ok(Math.abs(magic[0].amount / magic[1].amount - 1.5) < 1e-9);
  advance(state, at + 5_000_000);
  assert.equal(enemy.decrepifyUntilUs, undefined);
});

test("Life Drain applies sixteen timed life and mana packets and preserves its ordinary rank across reload", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A103 = 1;
  const at = cast(state, tower, "drain", "A103", { targetId: enemy.id });
  advance(state, at + 499_999);
  assert.equal(enemy.hp, enemy.maxHp);
  advance(state, at + 500_000);
  assert.equal(enemy.mana, 1950);
  tower.life = { hp: 15, maximum: 500, staticMaximum: 500, lastUs: at + 500_000, regen: 0 };
  tower.mana = 0;
  const restored = structuredClone(state);
  advance(restored, at + 1_000_000);
  assert.ok(restored.structures[0].life.hp > 15);
  assert.ok(restored.structures[0].mana >= 50 && restored.structures[0].mana < 60);
  advance(restored, at + 8_000_000);
  assert.equal(restored.enemies[0].mana, 1200);
  assert.equal(restored.recentHits.filter(hit => hit.sourceTemplate === "H030").length, 16);
  assert.equal(restored.lifeDrains, undefined);
});

test("A Scepter auxiliary owns one target, converts only with live B100 and stops on actual stop command", () => {
  const { state, tower, enemy } = fixture();
  tower.qualification = "P006";
  tower.hero.ranks.A102 = tower.hero.ranks.A103 = 1;
  state.structures.push({ ...map.worker, x: tower.x + 700, id: 901, templateId: "n167", radius: 72, pending: null });
  const other = { ...tower, id: 902, y: tower.y + 80, hero: newHero("H030") };
  other.hero.ranks.A103 = 1;
  state.structures.push(other);
  state.inventory = [{ id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 },
    { id: 941, itemId: "i310", slot: 1, point: map.worker, charges: 0 }];
  assert.ok(command(state, "scepter", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  assert.ok(command(state, "second-scepter", { type: "transfer-item", itemId: 941, towerId: other.id }).ok);
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S222" }).ok);
  const agedAt = cast(state, tower, "age", "A102", { point: enemy });
  assert.equal(tower.hero.ranks.A176, 1);
  advance(state, agedAt + 100_000);
  const at = cast(state, tower, "drain", "A176", { targetId: enemy.id });
  const nextAt = cast(state, other, "other", "A103", { targetId: enemy.id });
  assert.ok(state.lifeDrains[tower.id].carrier.active);
  assert.equal(state.lifeDrains[other.id].carrier, undefined);
  assert.ok(command(state, "withdraw", { type: "transfer-item", itemId: 940 }).ok);
  advance(state, at + 500_000);
  const first = state.recentHits.filter(hit => hit.ownerId === tower.id);
  assert.deepEqual(first.map(hit => hit.sourceTemplate), ["G060", "G060"]);
  assert.ok(first[1].amount >= 5000 && first[1].amount < 6000);
  assert.equal(enemy.mana, 1950);
  advance(state, nextAt + 500_000);
  assert.equal(enemy.mana, 1900);
  advance(state, agedAt + 5_000_000);
  advance(state, at + 5_000_000);
  assert.ok(state.recentHits.some(hit => hit.sourceTemplate === "q026" && hit.ownerId === tower.id));
  const hits = state.recentHits.filter(hit => hit.ownerId === tower.id).length;
  assert.ok(command(state, "stop", { type: "stop-tower-cast", towerId: tower.id }).ok);
  assert.equal(state.lifeDrains[tower.id], undefined);
  advance(state, at + 6_000_000);
  assert.equal(state.recentHits.filter(hit => hit.ownerId === tower.id).length, hits);
  assert.ok(state.lifeDrains[other.id]);
});

test("A shield prevents the whole main channel and leaving 1000 cancels pending packets", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A103 = 1;
  enemy.abilities = ["N535"];
  const blocked = cast(state, tower, "blocked", "A103", { targetId: enemy.id });
  assert.ok(enemy.spellShieldReadyUs > blocked);
  assert.equal(state.lifeDrains, undefined);
  advance(state, blocked + 12_000_000);
  tower.hero.ranks.A102 = 1;
  const shieldSpent = cast(state, tower, "spend-second-shield", "A102", { point: enemy });
  assert.equal(enemy.decrepifyUntilUs, undefined);
  advance(state, shieldSpent + 100_000);
  const at = cast(state, tower, "again", "A103", { targetId: enemy.id });
  assert.ok(state.lifeDrains?.[tower.id]);
  enemy.x = tower.x + 1001;
  advance(state, at + 500_000);
  assert.equal(state.lifeDrains, undefined);
  assert.equal(enemy.hp, enemy.maxHp);
});
