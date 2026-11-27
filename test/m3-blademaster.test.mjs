import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

const second = 1_000_000;
function advance(state, due) {
  state.clock.targetUs = due;
  while (drain(state, 1_000) === "pending") {}
}

function issue(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("blademaster", 14);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const tower = { ...map.worker, id: 900, templateId: "H013", pending: null, qualification: null,
    radius: 72, population: 20, hero: newHero("H013") };
  tower.hero.level = 20;
  tower.hero.points = 6;
  tower.hero.natural = { STR: 100, AGI: 100, INT: 100 };
  state.structures = [tower];
  const origin = state.enemies[0];
  const enemy = (id, distance, layer = "ground", abilities = []) => ({ ...origin, id, unitId: layer === "fly" ? "m013" : "m001",
    x: tower.x + distance, y: tower.y, layer, hp: 100_000, maxHp: 100_000, armor: 0, abilities });
  const learn = skillId => assert.ok(issue(state, "learn-" + skillId,
    { type: "learn-skill", towerId: tower.id, skillId }).ok);
  return { state, tower, enemy, learn };
}

test("A043 uses native ground targeting for five pulses and keeps the carrier after owner recycling", () => {
  const { state, tower, enemy, learn } = fixture();
  state.enemies = [enemy(1, 600, "fly", ["N535"]), enemy(2, 600.001),
    { ...enemy(3, 100, "fly"), unitId: "ehpr" }];
  learn("A043");
  assert.ok(issue(state, "storm", { type: "cast-hero", towerId: tower.id, skillId: "A043" }).ok);
  const castUs = state.queue.nowUs;
  assert.equal(tower.bladeStormHasteUs, castUs + 5 * second);
  assert.equal(state.recentHits[0].sourceTemplate, "q008");
  assert.ok(issue(state, "remove-owner", { type: "recycle-tower", towerId: tower.id }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, castUs + 6 * second);
  assert.deepEqual(restored.recentHits.map(hit => hit.targetId), [1, 1, 1, 1, 1]);
  assert.deepEqual(restored.recentHits.map(hit => hit.atUs - castUs), [0, second, 2 * second, 3 * second, 4 * second]);
  assert.equal(restored.enemies[0].spellShieldReadyUs, undefined);
  assert.deepEqual(restored.bladeStorms, {});
});

test("A045 moves its proxy instead of the hero, changes packet with a live scepter and resumes without repeating the first hit", () => {
  const { state, tower, enemy, learn } = fixture();
  state.enemies = [enemy(1, 500, "ground", ["N535"]), enemy(2, 700), enemy(3, 700.001)];
  learn("A044");
  learn("A045");
  assert.ok(issue(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S093" }).ok);
  assert.ok(issue(state, "slash", { type: "cast-hero", towerId: tower.id, skillId: "A045", targetId: 1 }).ok);
  const committedUs = state.queue.nowUs + 300_000;
  advance(state, committedUs - 1);
  assert.equal(state.recentHits, undefined);
  advance(state, committedUs);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [1]);
  assert.equal(state.enemies[0].spellShieldReadyUs, undefined);
  assert.equal(tower.omnislash.templateId, "q021");
  assert.equal(tower.omnislash.x, state.enemies[0].x);
  assert.equal(tower.x, map.worker.x);
  const repeat = state.queue.pending.find(event => event.payload.type === "omnislash-tick");
  assert.ok(repeat.periodUs >= 100_000);
  state.enemies[1].x = tower.x + 620;
  state.enemies[2].x = tower.x + 900.001;
  state.inventory.push({ id: 950, itemId: "i310", slot: 1, towerId: tower.id, charges: 0, point: tower });
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, repeat.dueUs);
  const hits = restored.recentHits.slice(1);
  assert.ok(hits.length >= 1);
  assert.ok(hits.every(hit => hit.casterId === tower.omnislash.id && hit.atUs === repeat.dueUs));
  assert.ok(hits.some(hit => hit.amount > state.recentHits[0].amount));
  advance(restored, committedUs + 8_300_000);
  assert.equal(restored.structures[0].omnislash, undefined);
  assert.equal(restored.queue.pending.some(event => event.payload.type === "omnislash-tick"), false);
});

test("A044 native hit rolls full 20% and 2.3× once, separate from the slash", () => {
  const { state, tower, enemy, learn } = fixture();
  state.enemies = [enemy(1, 300)];
  learn("A044");
  assert.ok(issue(state, "focus", { type: "focus-target", towerId: tower.id, targetId: 1 }).ok);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, state.queue.nowUs + 1);
  const fire = state.queue.pending.find(event => event.payload.type === "weapon-fire");
  assert.ok(fire);
  const die = randomState => (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  const positive = new Map();
  for (let s = 1; s <= 10_000; s++) {
    const first = die(s);
    const second = die(first);
    const dieResult = Math.floor(first / 2 ** 32 * 4) + Math.floor(second / 2 ** 32 * 4);
    const critical = 1 + Math.floor(die(second) / 2 ** 32 * 100);
    if (critical === 20 || critical === 21) positive.set(`${dieResult}/${critical}`, s);
  }
  const [critSeed, baseSeed] = [20, 21].map(chance => positive.get(`3/${chance}`));
  assert.ok(critSeed && baseSeed);
  const values = [];
  for (const randomState of [critSeed, baseSeed]) {
    const snapshot = structuredClone(state);
    snapshot.randomState = randomState;
    advance(snapshot, fire.dueUs);
    values.push(snapshot.recentHits[0].amount);
  }
  assert.ok(Math.abs(values[0] / values[1] - 2.3) < 1e-7, String(values));
});
