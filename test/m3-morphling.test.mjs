import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage, weapons } from "../src/game/m2/combat.ts";
import { heroThresholds, newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, grantHeroExperience, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 10_000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults[id].ok, JSON.stringify(state.commandResults[id]));
  return state.queue.nowUs;
}

function fixture(skill = {}) {
  const state = newMatch("m3-morphling", 14);
  state.queue.pending = [];
  const hero = newHero("H058");
  Object.assign(hero.ranks, skill);
  const tower = { ...map.worker, id: 900, templateId: "H058", radius: 72, pending: null, qualification: "P001", hero,
    autoModes: { A223: false, A224: false } };
  const provider = { ...map.worker, x: tower.x - 300, id: 901, templateId: "n189", radius: 72, pending: null };
  state.structures = [tower, provider];
  const enemy = { ...map.worker, x: tower.x + 550, id: 910, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

function cast(state, tower, id, skillId, selection) {
  return command(state, id, { type: "cast-hero", towerId: tower.id, skillId, ...selection });
}

function equip(state, tower, itemId) {
  const id = state.nextId++;
  state.inventory.push({ id, itemId, slot: 0, point: state.worker, charges: 0 });
  command(state, "give-" + itemId, { type: "transfer-item", itemId: id, towerId: tower.id });
}

test("A223 does not displace the tower, launches the q057 wave, and executes the equipment and physical child before its magic mother", () => {
  const { state, tower, enemy } = fixture({ A223: 2 });
  equip(state, tower, "i132");
  const strength = tower.hero.natural.STR;
  const original = { x: tower.x, y: tower.y };
  const started = cast(state, tower, "wave", "A223", { point: enemy });
  const visual = state.battleAnimations.find(effect => effect.unitId === "q055");
  assert.deepEqual(visual.target, { x: original.x + 960, y: original.y });
  assert.equal(visual.durationUs, 780_000);
  assert.deepEqual({ x: tower.x, y: tower.y }, original);
  const sweep = state.queue.pending.find(entry => entry.payload.type === "spell-sweep");
  assert.equal(sweep.payload.sweep.amount, 1000);
  assert.equal(sweep.payload.sweep.speed, 1100);
  tower.hero.natural.AGI += 100;
  state.randomState = 1972;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, started + 950_000);
  assert.deepEqual(restored.recentHits.map(hit => hit.sourceTemplate), ["H058", "H058", "q057"]);
  const [equipment, child, mother] = restored.recentHits;
  const weapon = weapons.H058[0];
  const fields = Math.trunc(weapon.base + 1.4 * tower.hero.natural.AGI);
  const estimatedMinimum = physicalDamage(fields, "hero", 0, false) * 1.25 * (1 + strength * .0006);
  assert.ok(child.amount > estimatedMinimum);
  assert.ok(equipment.amount > child.amount);
  assert.ok(Math.abs(mother.amount - 1000 * .8 * (1 + tower.hero.natural.INT * .001)) < 1e-8);
});

test("A224 stamps stun at release but uses live attributes, rank and boss-only life scale at arrival", () => {
  const { state, tower, enemy } = fixture({ A224: 1 });
  tower.hero.natural.STR = 100;
  tower.hero.natural.AGI = 20;
  enemy.unitId = "mBOS";
  const started = cast(state, tower, "bolt", "A224", { targetId: enemy.id });
  const projectile = state.queue.pending.find(entry => entry.payload.type === "morph-bolt");
  assert.equal(projectile.payload.stun, 2);
  tower.hero.natural.STR = 40;
  tower.hero.natural.AGI = 200;
  tower.hero.ranks.A224 = 2;
  advance(state, started + 550_000);
  const [hit] = state.recentHits;
  assert.equal(hit.sourceTemplate, "H058");
  assert.ok(Math.abs(hit.amount - (600 + 200 * 5 + 100000 * .01 * 5 * .3) * .8 * (1 + tower.hero.natural.INT * .001)) < 1e-7);
  assert.equal(enemy.stunUntilUs, started + 550_000 + 2_000_000);
});

test("A225 applies paid ranks, reverses a running shift, rebases S352 growth, and stops at one donor point", () => {
  const { state, tower } = fixture();
  tower.hero.level = 30;
  tower.hero.points = 6;
  const start = { ...tower.hero.natural };
  for (let rank = 1; rank <= 6; rank++) command(state, "learn-" + rank, { type: "learn-skill", towerId: tower.id, skillId: "A225" });
  assert.equal(tower.hero.natural.STR, start.STR + 210);
  assert.equal(tower.hero.natural.AGI, start.AGI + 210);
  const begin = command(state, "toward-agi", { type: "toggle-morph", towerId: tower.id, attribute: "AGI" });
  advance(state, begin + 200_000);
  assert.equal(tower.hero.natural.STR, start.STR + 198);
  assert.equal(tower.hero.natural.AGI, start.AGI + 222);
  const prior = tower.morphShift.timerId;
  const reverse = command(state, "toward-str", { type: "toggle-morph", towerId: tower.id, attribute: "STR" });
  assert.ok(!state.queue.pending.some(entry => entry.timerId === prior));
  command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S352" });
  assert.equal(tower.templateId, "G075");
  assert.equal(tower.hero.natural.STR, start.STR + 198 + 30 + 31);
  const restored = JSON.parse(JSON.stringify(state));
  const morphling = restored.structures[0];
  morphling.hero.natural.AGI = 3;
  advance(restored, reverse + 100_000);
  assert.equal(morphling.hero.natural.AGI, 1);
  assert.equal(morphling.hero.natural.STR, start.STR + 198 + 30 + 31 + 2);
  advance(restored, reverse + 200_000);
  assert.equal(morphling.morphShift, undefined);
});

test("A225 enforces strict life and mana gates and does not retain T299 after level gains", () => {
  const { state, tower } = fixture({ A225: 1 });
  const start = { ...tower.hero.natural };
  const begin = command(state, "begin", { type: "toggle-morph", towerId: tower.id, attribute: "AGI" });
  advance(state, begin + 100_000);
  tower.life.hp = 500;
  tower.life.regen = 0;
  advance(state, begin + 200_000);
  assert.equal(tower.morphShift, undefined);
  assert.equal(tower.hero.natural.STR, start.STR - 1);
  tower.mana = 3;
  tower.manaRegen = 0;
  const attempt = command(state, "budget", { type: "toggle-morph", towerId: tower.id, attribute: "STR" });
  advance(state, attempt + 100_000);
  assert.equal(tower.morphShift, undefined);
  assert.equal(tower.mana, 3);
  assert.equal(tower.hero.natural.STR, start.STR - 1);
  const beforeMax = tower.life.maximum;
  grantHeroExperience(state, tower.id, heroThresholds[1]);
  assert.equal(tower.hero.level, 2);
  assert.equal(tower.life.maximum, beforeMax + 5 * 15);
  assert.equal(tower.lifeOffset, undefined);
});

test("A225 mirror-copy protection gives each actual i272 image the full temporary health and leaves the original intact", () => {
  const { state, tower } = fixture({ A225: 1 });
  equip(state, tower, "i272");
  const item = state.inventory.find(item => item.itemId === "i272" && item.towerId === tower.id);
  const before = tower.life?.maximum;
  command(state, "mirror", { type: "cast-equipment", itemId: item.id, towerId: tower.id });
  assert.equal(state.summons.length, 2);
  assert.equal(tower.life.maximum, before ?? tower.life.staticMaximum);
  assert.ok(state.summons.every(image => image.life.maximum === tower.life.maximum + 1000 && image.lifeOffset === 1000));
});

test("A224 then A223 are considered in native auto-cast order from an actual attack step", () => {
  const { state, tower, enemy } = fixture({ A223: 1, A224: 1 });
  tower.autoModes = {};
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advance(state, 1);
  assert.equal(tower.heroSpellReady.A224, 15_000_001);
  assert.equal(tower.heroSpellReady.A223, undefined);
  assert.ok(state.queue.pending.some(entry => entry.payload.type === "morph-bolt" && entry.payload.targetId === enemy.id));
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advance(state, 2);
  assert.equal(tower.heroSpellReady.A223, 9_000_002);
});
