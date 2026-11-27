import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, goal) {
  state.clock.targetUs = goal;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, action) {
  const id = `tinker-${state.queue.nowUs}`;
  assert.ok(enqueue(state, { id, action, matchId: state.matchId }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("tinker", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const hero = newHero("H023");
  hero.level = 30;
  hero.points = 20;
  hero.natural = { STR: 100, AGI: 100, INT: 100 };
  const tower = { id: 900, templateId: "H023", hero, x: -288, y: -128, radius: 72, pending: null, qualification: null,
    autoModes: { A073: false, A074: false, A075: false } };
  state.structures = [tower];
  const base = state.enemies[0];
  state.enemies = [];
  const enemy = (id, x, y = 0, abilities = []) => ({ ...base, id, x: tower.x + x, y: tower.y + y,
    hp: 100_000, maxHp: 100_000, armor: 0, speed: 0, abilities });
  const learn = skillId => assert.ok(issue(state, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  const begin = (skillId, aim = {}) => assert.ok(issue(state, { type: "cast-hero", towerId: tower.id, skillId, ...aim }).ok);
  const cast = (skillId, aim = {}) => {
    begin(skillId, aim);
    advance(state, state.queue.nowUs + 530_000);
    return state.queue.nowUs;
  };
  function equip(itemId, slot = 0) {
    if (!tower.qualification) {
      tower.qualification = "P001";
      state.structures.push({ id: 901, templateId: "n189", x: -480, y: -140, radius: 72, pending: null });
    }
    const id = state.nextId++;
    state.inventory.push({ id, itemId, slot, point: state.worker, charges: 0 });
    assert.ok(issue(state, { type: "transfer-item", itemId: id, towerId: tower.id }).ok);
    return id;
  }
  return { state, tower, enemy, learn, begin, cast, equip };
}

test("A073 makes a path first and a blocked segment keeps later independently admitted laser targets", () => {
  const { state, enemy, learn, cast, equip } = fixture();
  learn("A073");
  equip("i310");
  state.enemies = [enemy(301, 300), enemy(302, 600, 0, ["N535"]), enemy(303, 1000), enemy(304, 1401)];
  cast("A073", { targetId: 301 });
  assert.ok(state.enemies[1].spellShieldReadyUs > 0);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [301, 303]);
  assert.equal(state.recentHits[0].amount, state.recentHits[1].amount);
  const links = state.battleAnimations.filter(effect => effect.unitId === "T067");
  assert.equal(links[1].x, state.enemies[1].x);
  assert.equal(links[1].target.x, state.enemies[2].x);
});

test("A074 emits exactly 144 independent robots across 24 tracks with restored absolute birth cadence", () => {
  const { state, tower, learn, cast } = fixture();
  learn("A074");
  const start = cast("A074", { point: { x: tower.x + 200, y: tower.y } });
  const reopened = JSON.parse(JSON.stringify(state));
  const rows = [];
  for (let index = 0; index < 144; index++) {
    advance(reopened, start + Math.round(index * 1_000_000 / 24));
    const births = reopened.queue.pending.filter(({ payload }) => payload.type === "spell-sweep" &&
      payload.sweep.name === "A074" && payload.sweep.startedUs === reopened.queue.nowUs);
    assert.equal(births.length, 1);
    rows.push(births[0].payload.sweep.y);
  }
  assert.equal(new Set(rows.slice(0, 24)).size, 24);
  assert.equal(rows[0], tower.y - 450);
  assert.equal(rows[23], tower.y + 450);
  assert.deepEqual(rows.slice(0, 24), rows.slice(120));
  advance(reopened, start + 8_000_000);
  assert.equal(reopened.queue.pending.length, 0);
});

test("A074 detonates at contact time with independent ground and closed area checks", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  learn("A074");
  const castPoint = { x: tower.x + 200, y: tower.y };
  const collisionX = -250 + 142_857 * 700 / 1_000_000;
  state.enemies = [enemy(301, -100, -450), enemy(302, collisionX, -150), enemy(303, collisionX, -149.999),
    { ...enemy(304, -151, -450), layer: "fly", unitId: "b143" }];
  const start = cast("A074", { point: castPoint });
  const contactUs = start + 142_857;
  advance(state, contactUs - 1);
  assert.equal(state.recentHits, undefined);
  advance(state, contactUs);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [301, 302]);
  assert.ok(state.recentHits.every(hit => hit.sourceTemplate === "q001" && hit.atUs === contactUs));
});

test("A075 cancels independently before and after effect and only natural completion clears the three live cooldowns", () => {
  const { state, tower, enemy, learn, begin, cast, equip } = fixture();
  for (const skill of ["A073", "A074", "A075"]) learn(skill);
  equip("i318", 0);
  const boots = equip("i230", 1);
  state.enemies = [enemy(301, 220)];
  cast("A073", { targetId: 301 });
  advance(state, state.queue.nowUs + 100_000);
  cast("A074", { point: { x: tower.x + 600, y: tower.y } });
  advance(state, state.queue.nowUs + 100_000);
  assert.ok(issue(state, { type: "cast-equipment", towerId: tower.id, itemId: boots, point: { x: tower.x, y: tower.y } }).ok);
  advance(state, state.queue.nowUs + 300_001);
  assert.ok(tower.teleportReadyUs.i230 > state.queue.nowUs);
  const original = { laser: tower.heroSpellReady.A073, march: tower.heroSpellReady.A074, boots: tower.teleportReadyUs.i230, marks: tower.ashMarks };
  begin("A075");
  const mana = tower.mana;
  assert.ok(issue(state, { type: "stop-tower-cast", towerId: tower.id }).ok);
  assert.equal(tower.mana, mana);
  assert.equal(tower.rearmTimer, undefined);
  cast("A075");
  assert.ok(tower.mana < mana);
  assert.ok(issue(state, { type: "focus-target", towerId: tower.id, targetId: 301 }).ok);
  assert.deepEqual([tower.heroSpellReady.A073, tower.heroSpellReady.A074, tower.teleportReadyUs.i230, tower.ashMarks],
    [original.laser, original.march, original.boots, original.marks]);
  const start = cast("A075");
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, start + 4_500_000);
  const current = restored.structures[0];
  assert.deepEqual([current.heroSpellReady.A073, current.heroSpellReady.A074, current.teleportReadyUs.i230],
    [restored.queue.nowUs, restored.queue.nowUs, restored.queue.nowUs]);
  assert.equal(current.ashMarks, original.marks + 1);
});
