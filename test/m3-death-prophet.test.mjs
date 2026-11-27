import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
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

function cast(state, tower, id, skillId, point) {
  assert.ok(command(state, id, { type: "cast-hero", towerId: tower.id, skillId, point }).ok);
  const event = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(event.dueUs - state.queue.nowUs, 300_000);
  advance(state, event.dueUs);
  return event.dueUs;
}

function fixture() {
  const state = newMatch("m3-death-prophet-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H020");
  hero.natural.INT = 300;
  const tower = { ...map.worker, id: 900, templateId: "H020", radius: 72, pending: null, qualification: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, id: 910, x: tower.x + 100, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

test("Carrion Swarm expands continuously and does not consume a target's spell shield", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A064 = 2;
  Object.assign(enemy, { x: tower.x + 400, y: tower.y + 380, abilities: ["N535"] });
  const outside = { ...enemy, id: 911, y: tower.y + 501 };
  state.enemies.push(outside);
  const at = cast(state, tower, "swarm", "A064", { x: tower.x + 600, y: tower.y });
  advance(state, at + 363_635);
  assert.equal(enemy.hp, enemy.maxHp);
  advance(state, at + 363_637);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(enemy.spellShieldReadyUs, undefined);
  assert.equal(outside.hp, outside.maxHp);
  advance(state, at + 1_000_000);
  assert.equal(state.recentHits.length, 1);
});

test("Spirit Siphon creates separate shielded links with captured intervals and retracts its exact temporary intelligence", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A065 = 2;
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S022" }).ok);
  assert.equal(tower.templateId, "G022");
  const blocked = { ...enemy, id: 911, x: enemy.x + 20, abilities: ["N535"] };
  state.enemies.push(blocked);
  const before = tower.hero.natural.INT;
  const at = cast(state, tower, "drain", "A065", enemy);
  assert.ok(blocked.spellShieldReadyUs > at);
  assert.equal(state.queue.pending.filter(event => event.payload.type === "doom-drain").length, 1);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, at + 5_000_000);
  assert.equal(restored.recentHits.length, 5);
  assert.ok(restored.recentHits.every(hit => hit.sourceTemplate === "q013" && hit.ownerId === tower.id));
  assert.equal(restored.structures[0].hero.natural.INT, before + 35);
  advance(restored, at + 8_000_000);
  assert.equal(restored.structures[0].hero.natural.INT, before);
});

test("Exorcism uses each live flying spirit to attack, submits a separate magic hit and returns mana", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A066 = 1;
  const at = cast(state, tower, "spirits", "A066");
  advance(state, at + 99_999);
  assert.equal(state.summons?.length ?? 0, 0);
  advance(state, at + 100_000);
  assert.equal(state.summons.length, 1);
  const spirit = state.summons[0];
  assert.equal(spirit.templateId, "q011");
  const start = { x: spirit.x, y: spirit.y };
  scheduleEvent(state.queue, 31_250, { type: "movement" }, 31_250);
  advance(state, at + 460_000);
  assert.ok(spirit.x > start.x);
  assert.ok(state.recentHits.some(hit => hit.sourceTemplate === "H020" && hit.ownerId === tower.id && hit.atUs < at + 460_001));
  assert.ok(tower.mana > tower.manaMaximum - 120 + 13);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.ok(!state.recentHits.some(hit => hit.sourceTemplate === "q011"));
});

test("Exorcism captures count once, samples each birth's skin and Scepter, then retires and removes at fifteen/sixteen seconds", () => {
  const { state, tower } = fixture();
  state.enemies = [];
  tower.qualification = "P006";
  tower.hero.ranks.A066 = 1;
  state.structures.push({ ...map.worker, x: tower.x + 500, id: 901, templateId: "n167", radius: 72, pending: null });
  state.inventory = [{ id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command(state, "scepter", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  const at = cast(state, tower, "exorcism", "A066");
  advance(state, at + 100_000);
  assert.equal(state.summons[0].spiritOrder.sureHit, true);
  assert.ok(command(state, "withdraw", { type: "transfer-item", itemId: 940 }).ok);
  advance(state, at + 510_000);
  assert.equal(state.summons[1].spiritOrder.sureHit, false);
  assert.ok(command(state, "change-form", { type: "choose-skin", towerId: tower.id, choice: "S022" }).ok);
  advance(state, at + 1_300_000);
  assert.equal(state.summons.length, 13);
  assert.equal(state.summons[5].templateId, "q012");
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, at + 15_000_000);
  assert.ok(restored.summons.every(unit => unit.spiritOrder.move.kind === "retire"));
  assert.ok(!restored.queue.pending.some(event => event.payload.type === "exorcism" && event.payload.stage === "control"));
  advance(restored, at + 16_000_000);
  assert.equal(restored.summons.length, 0);
  assert.equal(restored.structures[0].exorcismToken, undefined);
});

test("Exorcism control returns only spirits beyond 900, and surviving idle spirits receive an Atwa roam", () => {
  const { state, tower } = fixture();
  tower.hero.ranks.A066 = 1;
  state.enemies = [];
  const at = cast(state, tower, "spirits", "A066");
  advance(state, at + 1_300_000);
  const [edge, outside, idle] = state.summons;
  edge.x = tower.x + 900;
  outside.x = tower.x + 901;
  advance(state, at + 2_000_000);
  assert.equal(edge.spiritOrder.move, undefined);
  assert.deepEqual(outside.spiritOrder.move, { kind: "return", point: { x: tower.x, y: tower.y } });
  const id = idle.id;
  const birth = { x: idle.x, y: idle.y };
  scheduleEvent(state.queue, 31_250, { type: "movement" }, 31_250);
  advance(state, at + 5_450_000);
  const spirit = state.summons.find(entry => entry.id === id);
  assert.equal(spirit.spiritOrder.move.kind, "roam");
  assert.notDeepEqual({ x: spirit.x, y: spirit.y }, birth);
});
