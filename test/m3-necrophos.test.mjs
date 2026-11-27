import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch, removeDeadEnemy } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture(seed = 47) {
  const state = newMatch("necrophos", seed);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const tower = { id: 900, x: -288, y: -128, templateId: "H014", hero: newHero("H014"), pending: null,
    qualification: null, radius: 72, population: 20 };
  tower.hero.level = 20;
  tower.hero.points = 6;
  tower.hero.natural = { STR: 100, AGI: 100, INT: 100 };
  state.structures = [tower];
  const base = state.enemies[0];
  const enemy = (id, distance, abilities = []) => ({ ...base, id, x: tower.x + distance, y: tower.y,
    hp: 100_000, maxHp: 100_000, armor: 0, abilities, speed: 0 });
  const learn = skillId => assert.ok(issue(state, "learn-" + state.queue.nowUs, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  return { state, tower, enemy, learn };
}

test("A046 uses 640-speed missiles, current intelligence, strict carrier range and independent shields", () => {
  const { state, tower, enemy, learn } = fixture();
  learn("A046");
  state.enemies = [enemy(1, 640), enemy(2, 320, ["N535"]), enemy(3, 700.001)];
  assert.ok(issue(state, "pulse", { type: "cast-hero", towerId: tower.id, skillId: "A046" }).ok);
  const committed = state.queue.nowUs + 300_000;
  advance(state, committed + 600_000);
  assert.ok(state.enemies[1].spellShieldReadyUs);
  assert.equal(state.recentHits, undefined);
  tower.hero.natural.INT += 100;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, committed + 1_000_000);
  assert.deepEqual(restored.recentHits.map(hit => hit.targetId), [1]);
  assert.ok(Math.abs(restored.recentHits[0].amount - 360) < .001);
});

test("A047 maintains one timer per source, reads the current stats and reaches a closed boundary", () => {
  const { state, tower, enemy, learn } = fixture();
  state.enemies = [enemy(1, 1000), enemy(2, 900, ["Amim"]), enemy(3, 1000.001)];
  learn("A047");
  advance(state, 450_000);
  learn("A047");
  tower.hero.natural.INT = 200;
  advance(state, 950_000);
  assert.equal(state.recentHits, undefined);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, 950_001);
  assert.equal(restored.recentHits.length, 1);
  assert.equal(restored.recentHits[0].targetId, 1);
  assert.ok(Math.abs(restored.recentHits[0].amount - 72) < .001);
  assert.equal(restored.queue.pending.filter(event => event.payload.type === "heartstopper-tick").length, 1);
});

test("A048 keeps half credit through skin and reload, respects the cap and only adds earned integers", () => {
  const { state, tower, enemy, learn } = fixture();
  learn("A048");
  const victim = enemy(1, 240);
  victim.hp = 0;
  state.enemies = [victim];
  assert.ok(removeDeadEnemy(state, victim.id, tower.id));
  assert.equal(tower.hero.natural.INT, 100);
  assert.deepEqual(tower.sadist, { half: true, gained: 0 });
  assert.ok(issue(state, "reaper", { type: "choose-skin", towerId: tower.id, choice: "S073" }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  const next = enemy(2, 240);
  next.hp = 0;
  restored.enemies = [next];
  assert.ok(removeDeadEnemy(restored, next.id, tower.id));
  assert.deepEqual(restored.structures[0].sadist, { half: false, gained: 1 });
  assert.equal(restored.structures[0].hero.natural.INT, 131);
  const reaper = restored.structures[0];
  reaper.sadist.gained = 100;
  const kill = id => {
    const unit = enemy(id, 240);
    unit.hp = 0;
    restored.enemies = [unit];
    assert.ok(removeDeadEnemy(restored, id, tower.id));
  };
  kill(3);
  kill(4);
  assert.deepEqual(reaper.sadist, { half: false, gained: 100 });
  assert.equal(reaper.hero.natural.INT, 131);
  reaper.qualification = "P001";
  restored.structures.push({ id: 901, templateId: "n189", x: -380, y: -180, radius: 72, pending: null });
  const scepter = restored.nextId++;
  restored.inventory.push({ id: scepter, itemId: "i310", slot: 0, point: restored.worker, charges: 0 });
  assert.ok(issue(restored, "equip", { type: "transfer-item", itemId: scepter, towerId: reaper.id }).ok);
  kill(5);
  kill(6);
  assert.deepEqual(reaper.sadist, { half: false, gained: 101 });
  assert.equal(reaper.hero.natural.INT, 132);
  assert.ok(issue(restored, "unequip", { type: "transfer-item", itemId: scepter }).ok);
  kill(7);
  kill(8);
  assert.deepEqual(reaper.sadist, { half: false, gained: 101 });
  assert.equal(reaper.hero.natural.INT, 132);
});

test("A046 uses the skin projectile and doubles at the true effective-scepter branch", () => {
  const { state, tower, enemy, learn } = fixture();
  learn("A046");
  assert.ok(issue(state, "reaper", { type: "choose-skin", towerId: tower.id, choice: "S073" }).ok);
  const target = enemy(1, 320);
  state.enemies = [target];
  const scepter = state.nextId++;
  state.inventory.push({ id: scepter, itemId: "i310", towerId: tower.id, slot: 0, point: tower, charges: 0 });
  const before = state.queue.nowUs;
  assert.ok(issue(state, "pulse", { type: "cast-hero", towerId: tower.id, skillId: "A046" }).ok);
  advance(state, before + 300_001);
  assert.equal(state.queue.pending.find(event => event.payload.type === "death-pulse").payload.visual, "T133");
  state.randomState = 1;
  advance(state, before + 800_001);
  assert.equal(state.recentHits.length, 1);
  assert.ok(state.recentHits[0].amount > 2 * (100 + tower.hero.natural.INT));
  assert.equal(target.stunUntilUs, before + 800_001 + 1_500_000);
});
