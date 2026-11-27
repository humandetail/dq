import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, action) {
  const id = `huskar-${state.queue.nowUs}`;
  assert.ok(enqueue(state, { id, action, matchId: state.matchId }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("huskar", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const hero = newHero("H034");
  hero.level = 30;
  hero.points = 20;
  const tower = { id: 900, templateId: "H034", hero, x: -288, y: -128, radius: 72, pending: null, qualification: null,
    autoModes: { A117: false } };
  state.structures = [tower];
  const enemy = state.enemies[0];
  Object.assign(enemy, { x: tower.x + 150, y: tower.y, hp: 100_000, maxHp: 100_000, armor: 0, speed: 0, abilities: [] });
  const learn = skillId => assert.ok(issue(state, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  function attack() {
    scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
      towerId: tower.id, targetId: enemy.id, sourceTemplate: "H034", weapon: weapons.H034[0], raw: 50,
      point: { x: enemy.x, y: enemy.y }, destination: { x: enemy.x, y: enemy.y },
    } });
    advance(state, state.queue.nowUs + 1);
  }
  function equipScepter() {
    tower.qualification = "P001";
    state.structures.push({ id: 901, templateId: "n189", x: -480, y: -150, radius: 72, pending: null });
    const id = state.nextId++;
    state.inventory.push({ id, itemId: "i310", slot: 0, point: state.worker, charges: 0 });
    assert.ok(issue(state, { type: "transfer-item", itemId: id, towerId: tower.id }).ok);
    return id;
  }
  return { state, tower, enemy, attack, learn, equipScepter };
}

test("actual H034 weapon damage costs one percent before learning and keeps each spear's six ticks independent", () => {
  const { state, tower, enemy, attack, learn, equipScepter } = fixture();
  attack();
  assert.equal(tower.life.maximum - tower.life.hp, Math.floor(tower.life.maximum * .01));
  assert.ok(!state.queue.pending.some(event => event.payload.type === "burning-spear"));
  learn("A115");
  attack();
  const first = state.queue.nowUs;
  advance(state, first + 500_000);
  attack();
  assert.equal(state.queue.pending.filter(event => event.payload.type === "burning-spear").length, 2);
  advance(state, first + 1_000_000);
  const magicTick = state.recentHits.at(-1).amount;
  assert.ok(magicTick > 80);
  equipScepter();
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, first + 1_500_001);
  assert.ok(restored.recentHits.at(-1).amount > magicTick);
  assert.equal(restored.recentHits.at(-1).targetId, enemy.id);
  advance(restored, first + 6_500_001);
  assert.ok(!restored.queue.pending.some(event => event.payload.type === "burning-spear"));
});

test("a low-life attack starts one eight-tick recovery and no self cost before the first tick", () => {
  const { state, tower, attack } = fixture();
  attack();
  tower.life.hp = tower.life.maximum * .02;
  tower.life.regen = 0;
  attack();
  const started = state.queue.nowUs;
  const before = tower.life.hp;
  const timer = tower.innerVitality.timerId;
  tower.life.regen = 0;
  attack();
  assert.equal(tower.life.hp, before);
  assert.equal(tower.innerVitality.timerId, timer);
  advance(state, started + 1_000_000);
  assert.ok(tower.life.hp >= before + Math.floor(tower.life.maximum * .2));
  assert.equal(tower.innerVitality.remaining, 7);
  advance(state, started + 8_000_000);
  assert.equal(tower.life.hp, tower.life.maximum);
  assert.equal(tower.innerVitality, undefined);
});

test("A116 preserves one periodic timestamp across level changes and writes the live HP tier after a reload", () => {
  const { state, tower, attack, learn } = fixture();
  attack();
  learn("A116");
  const firstTimerId = tower.berserkerBlood.timerId;
  const firstDue = state.queue.pending.find(event => event.timerId === firstTimerId).dueUs;
  for (let i = 1; i < 6; i++) learn("A116");
  assert.equal(tower.berserkerBlood.timerId, firstTimerId);
  assert.equal(tower.berserkerBlood.tier, 0);
  tower.life.hp = tower.life.maximum * .13;
  tower.life.regen = 0;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, firstDue);
  const current = restored.structures[0];
  assert.equal(current.berserkerBlood.tier, 18);
  current.life.hp = current.life.maximum;
  advance(restored, firstDue + 1_000_000);
  assert.equal(current.berserkerBlood.tier, 1);
});

test("A117's shielded cast still pays current life and damages, while Roche's fraction halves", () => {
  function use(unitId, shield, scepter) {
    const { state, tower, enemy, learn, equipScepter } = fixture();
    learn("A117");
    if (scepter) equipScepter();
    enemy.unitId = unitId;
    enemy.abilities = shield ? ["N535"] : [];
    assert.ok(issue(state, { type: "cast-hero", towerId: tower.id, skillId: "A117", targetId: enemy.id }).ok);
    const castUs = state.queue.nowUs + 300_000;
    advance(state, castUs);
    const remaining = scepter ? .34 : .45;
    assert.ok(Math.abs(tower.life.hp / tower.life.maximum - remaining) < 1e-8);
    assert.equal(tower.mana, tower.manaMaximum);
    assert.equal(enemy.lifeBreakSlowUs, shield ? undefined : castUs + 5_000_000);
    if (shield) assert.ok(enemy.spellShieldReadyUs > castUs);
    return state.recentHits[0].amount;
  }
  const ordinary = use("m001", true, false);
  assert.ok(Math.abs(use("mBOS", false, false) * 2 - ordinary) < 1e-8);
  assert.ok(use("m001", true, true) > ordinary * 1.2);
});
