import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { bearAbilities, drain, enqueue, newMatch } from "../src/game/m2/match.ts";

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
  const state = newMatch("spirit-bear", 14);
  state.queue.pending.length = 0;
  const tower = { ...map.worker, x: -224, y: -160, id: 900, templateId: "H036", pending: null,
    qualification: null, radius: 72, population: 20, hero: newHero("H036"), autoModes: { A126: false } };
  tower.hero.level = 25;
  tower.hero.points = 10;
  tower.hero.natural = { STR: 100, AGI: 100, INT: 100 };
  state.structures = [tower];
  const learn = id => assert.ok(issue(state, "learn-" + id + "-" + state.queue.nowUs, {
    type: "learn-skill", towerId: tower.id, skillId: id }).ok);
  const cast = id => assert.ok(issue(state, "cast-" + id + "-" + state.queue.nowUs, {
    type: "cast-hero", towerId: tower.id, skillId: id }).ok);
  return { state, tower, learn, cast };
}

test("A125 learns without replacing the bearer, then transfers original items and preserves engine timers across a reload", () => {
  const { state, tower, learn, cast } = fixture();
  learn("A125");
  learn("A127");
  cast("A125");
  advance(state, state.queue.nowUs + 300_000);
  const [first] = state.summons;
  assert.equal(first.templateId, "n255");
  assert.equal(first.permanentAttack, 50);
  assert.equal(first.bear.inheritedAttack, 0);
  assert.equal(first.mana, 300);
  assert.equal(state.queue.pending.some(event => event.payload.type === "summon-expire" && event.payload.unitId === first.id), false);
  const { id } = first;
  state.inventory.push({ id: 920, itemId: "i310", charges: 0, slot: 2, towerId: id, point: first },
    { id: 921, itemId: "i225", charges: 0, slot: 5, towerId: id, point: first });
  learn("A125");
  assert.equal(first.templateId, "n255");
  const bornFirst = state.queue.pending.find(event => event.payload.type === "bear-update");
  advance(state, bornFirst.dueUs);
  assert.equal(first.bear.inheritedAttack, 210);
  assert.equal(first.bear.scepter, false);
  advance(state, tower.heroSpellReady.A125);
  cast("A125");
  advance(state, state.queue.nowUs + 300_000);
  const [next] = state.summons;
  assert.equal(next.templateId, "n256");
  assert.notEqual(next.id, first.id);
  assert.equal(next.bear.inheritedAttack, 0);
  assert.deepEqual(state.inventory.filter(item => [920, 921].includes(item.id)).map(item =>
    [item.id, item.towerId, item.slot]), [[920, next.id, 0], [921, next.id, 1]]);
  assert.deepEqual(bearAbilities(next).map(ability => ability.id), ["N138"]);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, restored.queue.nowUs + second);
  assert.equal(restored.summons[0].bear.inheritedAttack, 210);
  assert.equal(restored.queue.pending.filter(event => event.payload.type === "bear-update").length, 1);
});

test("Q70 withdraws only the matching birth instance, and frenzy waits on the captured bear", () => {
  const { state, tower, learn, cast } = fixture();
  learn("A125");
  learn("A126");
  Object.assign(state.worker, { x: tower.x, y: tower.y });
  state.inventory.push({ id: 930, itemId: "i240", slot: 1, towerId: tower.id, charges: 0, point: tower });
  cast("A125");
  advance(state, state.queue.nowUs + 300_000);
  const [first] = state.summons;
  assert.equal(first.summon.speed, .3);
  assert.deepEqual(first.bear.gear, { 930: .3 });
  state.inventory.push({ id: 931, itemId: "i240", slot: 2, towerId: tower.id, charges: 0, point: tower });
  assert.ok(issue(state, "later-drop", { type: "drop-item", itemId: 931 }).ok);
  assert.equal(first.summon.speed, .3);
  assert.ok(issue(state, "actual-drop", { type: "drop-item", itemId: 930 }).ok);
  assert.equal(first.summon.speed, 0);
  advance(state, tower.heroCastUntilUs);
  cast("A126");
  assert.equal(tower.bearFrenzy.amount, .4);
  assert.equal(first.bearFrenzyBonus, .4);
  assert.equal(tower.bearFrenzy.unitId, first.id);
  advance(state, state.queue.nowUs + 7 * second);
  assert.equal(tower.bearFrenzy, undefined);
  assert.equal(first.bearFrenzyBonus, undefined);
  assert.ok(issue(state, "recycle", { type: "recycle-tower", towerId: tower.id }).ok);
  assert.ok(state.summons.includes(first));
  assert.equal(state.queue.pending.some(event => event.payload.type === "bear-update"), false);
});

test("form keeps stable IDs and absolute mana, and Q59 roar restrains movement without stunning", () => {
  const { state, tower, learn, cast } = fixture();
  learn("A125");
  learn("A125");
  learn("A125");
  learn("A127");
  cast("A125");
  advance(state, state.queue.nowUs + 400_000);
  const [bear] = state.summons;
  assert.equal(bear.templateId, "n257");
  tower.mana = 150;
  cast("A127");
  advance(state, state.queue.nowUs + 300_000);
  assert.equal(tower.templateId, "E016");
  assert.ok(tower.mana >= 150 && tower.mana < 155);
  assert.equal(tower.spiritBear.id, bear.id);
  assert.equal(tower.hero.ranks.A127, 1);
  assert.ok(issue(state, "auto-off", { type: "set-auto-mode", towerId: bear.id, key: "N140", enabled: false }).ok);
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, state.queue.nowUs + 1);
  const enemy = state.enemies[0];
  assert.equal(enemy.layer, "fly");
  Object.assign(enemy, { x: bear.x + 500, y: bear.y, maxHp: 100_000, hp: 100_000, abilities: [] });
  const air = { ...enemy, id: 1800, unitId: "ehpr", x: bear.x + 300 };
  state.enemies.push(air);
  assert.ok(issue(state, "roar", { type: "cast-tower", towerId: bear.id, skillId: "N140" }).ok);
  advance(state, state.queue.nowUs + 300_000);
  assert.equal(enemy.bearRoarUntilUs, state.queue.nowUs + 1_500_000,
    JSON.stringify({ enemy: enemy.unitId, dx: enemy.x - bear.x, mana: bear.mana, effects: state.battleAnimations }));
  assert.equal(enemy.stunUntilUs, undefined);
  assert.equal(air.bearRoarUntilUs, undefined);
  const mana = bear.mana;
  assert.ok(mana < bear.manaMaximum && bear.manaMaximum - mana >= 45);
});

test("a real birth tick applies and removes the owner's scepter without copying bearer equipment", () => {
  const { state, tower, learn, cast } = fixture();
  learn("A125");
  state.inventory.push({ id: 940, itemId: "i310", slot: 1, towerId: tower.id, charges: 0, point: tower });
  cast("A125");
  advance(state, state.queue.nowUs + 300_000);
  const [bear] = state.summons;
  assert.equal(bear.bear.scepter, false);
  const due = state.queue.pending.find(event => event.payload.type === "bear-update").dueUs;
  advance(state, due);
  assert.equal(bear.bear.scepter, true);
  const inherited = Math.floor(.7 * Object.values(tower.hero.natural).reduce((a, b) => a + b, 0));
  assert.ok(bear.bear.inheritedAttack > inherited);
  assert.ok(issue(state, "give-scepter", { type: "transfer-item", towerId: bear.id, itemId: 940 }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, due + second);
  assert.equal(restored.summons[0].bear.scepter, false);
  assert.equal(restored.summons[0].bear.inheritedAttack, inherited);
  assert.equal(restored.inventory.find(item => item.id === 940).towerId, bear.id);
});

test("N136 comes from the bear's real melee hit and holds a separate movement lock", () => {
  const { state, tower, learn, cast } = fixture();
  learn("A125");
  cast("A125");
  advance(state, state.queue.nowUs + 400_000);
  const [bear] = state.summons;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, state.queue.nowUs + 1);
  const enemy = state.enemies[0];
  Object.assign(enemy, { x: bear.x + 100, y: bear.y, speed: 0, maxHp: 1_000_000, hp: 1_000_000, abilities: [] });
  scheduleEvent(state.queue, 1, { type: "movement" }, 31_250);
  // The first successful roll follows four shared weapon proc draws on actual hits.
  advance(state, 3_430_003);
  assert.equal(enemy.bearRootUntilUs, undefined);
  advance(state, 3_430_004);
  assert.ok(enemy.bearRootUntilUs);
  assert.equal(enemy.bearRootUntilUs, state.queue.nowUs + 1_500_000);
  assert.equal(enemy.bearRootUntilUs, enemy.bearRootLockUntilUs);
  assert.equal(enemy.stunUntilUs, undefined);
  assert.ok(state.recentHits.some(hit => hit.casterId === bear.id && hit.ownerId === tower.id));
  assert.ok(state.battleAnimations.some(effect => effect.unitId === "B136"));
});
