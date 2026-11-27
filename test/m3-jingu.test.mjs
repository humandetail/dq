import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { map } from "../src/game/m2/map.ts";
import { nearestSpawn } from "../src/game/m2/pathfinding.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 10000) === "pending") {}
}

function action(state, id, input) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action: input }));
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults[id]?.ok, JSON.stringify(state.commandResults[id]));
}

function fixture(templateId = "H024") {
  const state = newMatch("m3-jingu-controlled", 47);
  state.queue.pending = [];
  const hero = newHero(templateId);
  hero.natural.INT = 100;
  const tower = { ...map.worker, id: 900, templateId, radius: 72, qualification: null, pending: null, hero };
  state.structures = [tower];
  return { state, tower };
}

test("Boundless Strike hits at contact, then activates Jingu without changing the activating hit", () => {
  const { state, tower } = fixture();
  tower.hero.ranks.A076 = 1;
  tower.hero.ranks.A077 = 1;
  tower.jingu = { count: 59, displayUntilUs: 1_500_000 };
  const enemy = {
    ...map.worker, id: 911, unitId: "m001", layer: "ground", hp: 100000, maxHp: 100000,
    mana: 0, armor: 0, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: ["N535"], wave: 1,
  };
  state.enemies = [{ ...enemy, x: tower.x + 700 }, { ...enemy, id: 912, x: tower.x + 1000, abilities: [] }];
  action(state, "strike", { type: "cast-hero", towerId: tower.id, skillId: "A076", point: { x: tower.x + 400, y: tower.y } });
  const firstContact = 300_001 + Math.round(200 / 3000 * 1_000_000);
  advance(state, firstContact - 1);
  assert.equal(state.recentHits, undefined);
  const restored = structuredClone(state);
  advance(restored, firstContact);
  const [restoredTower] = restored.structures;
  const [first, second] = restored.enemies;
  assert.equal(first.spellShieldReadyUs, firstContact + 6_000_000);
  assert.equal(first.stunUntilUs, undefined);
  assert.equal(second.hp, second.maxHp);
  assert.deepEqual(restoredTower.jingu, { count: 0, rank: 1, untilUs: firstContact + 4_000_000 });
  const secondContact = 300_001 + Math.round(500 / 3000 * 1_000_000);
  advance(restored, secondContact);
  assert.equal(second.stunUntilUs, secondContact + 2_000_000);
  assert.equal(restored.recentHits.length, 2);
  const [ordinary, critical] = restored.recentHits;
  assert.equal(ordinary.sourceTemplate, "H024");
  assert.equal(critical.sourceTemplate, "q019");
  assert.ok(Math.abs(critical.amount / ordinary.amount - 3.5) < 1e-9);
  advance(restored, firstContact + 4_000_000);
  assert.equal(restoredTower.jingu, undefined);
});

test("Monkey formation creates independent two-ring members, current skin and current scepter", () => {
  const { state, tower } = fixture();
  tower.hero.ranks.A079 = 1;
  state.inventory = [{ itemId: "i310", id: 925, towerId: tower.id, slot: 0, charges: 0, point: tower }];
  action(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S052" });
  assert.equal(tower.templateId, "G036");
  assert.equal(tower.hero.ranks.A079, 1);
  const center = { x: 0, y: 0 };
  action(state, "formation", { type: "cast-hero", towerId: tower.id, skillId: "A079", point: center });
  const appearanceAt = state.queue.nowUs + 300_000;
  advance(state, appearanceAt);
  assert.equal(state.summons.length, 14);
  assert.equal(new Set(state.summons.map(unit => unit.id)).size, 14);
  assert.equal(weapons.b140[0].max, 800);
  assert.equal(weapons.b140[0].cooldown, 1.3);
  const firstRingPoint = nearestSpawn({ x: 400 * Math.cos(2 * Math.PI / 5), y: 400 * Math.sin(2 * Math.PI / 5) }, 1, "ground");
  assert.deepEqual([state.summons[0].x, state.summons[0].y], [firstRingPoint.x, firstRingPoint.y]);
  for (const member of state.summons) {
    assert.equal(member.templateId, "b140");
    assert.equal(member.summon.speed, .25);
    assert.equal(member.summon.ownerId, tower.id);
    assert.equal(member.life.maximum, 450);
    assert.deepEqual(member.lastAttackTarget, center);
  }
  action(state, "remove-scepter", { type: "transfer-item", itemId: 925 });
  const restored = structuredClone(state);
  advance(restored, appearanceAt + 13_000_000 - 1);
  assert.equal(restored.summons.length, 14);
  assert.ok(restored.summons.every(unit => unit.templateId === "b140" && unit.summon.speed === .25));
  advance(restored, appearanceAt + 13_000_000);
  assert.deepEqual(restored.summons, []);
});

test("Jingu counts ordinary attack start and applies live sure-hit to the primary", () => {
  const { state, tower } = fixture();
  tower.hero.ranks.A077 = 1;
  tower.jingu = { count: 59 };
  const enemy = {
    ...map.worker, x: tower.x + 400, id: 912, unitId: "m001", layer: "ground", hp: 100000, maxHp: 100000,
    mana: 0, armor: 0, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: ["N524"], wave: 1,
  };
  state.enemies = [enemy];
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advance(state, 1);
  assert.deepEqual(tower.jingu, { count: 0, rank: 1, untilUs: 4_000_001 });
  assert.equal(enemy.hp, enemy.maxHp);
  advance(state, tower.attack.timing.windup.dueUs);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(tower.jingu.count, 0);
  assert.equal(tower.jingu.untilUs, 4_000_001);
});

test("Monkey hits count once, apply the native hero modifier only, and survive owner removal", () => {
  const { state, tower } = fixture();
  tower.hero.ranks.A077 = 1;
  tower.hero.ranks.A079 = 1;
  action(state, "formation", { type: "cast-hero", towerId: tower.id, skillId: "A079", point: { x: 0, y: 0 } });
  advance(state, state.queue.nowUs + 300_000);
  const monkey = state.summons[0];
  assert.equal(monkey.templateId, "b117");
  const enemy = {
    ...map.worker, id: 910, unitId: "m001", layer: "ground", hp: 100000, maxHp: 100000,
    mana: 0, armor: 0, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: ["N524"], wave: 1,
  };
  const hero = { ...enemy, id: 911, unitId: "H005" };
  state.enemies = [enemy, hero];
  const strike = (run, target) => {
    const shot = { towerId: tower.id, sourceTemplate: monkey.templateId, targetId: target.id,
      summon: { id: monkey.id, banner: false, skillId: "A079" },
      weapon: { ...weapons.b117[0], homing: false }, raw: 100, point: monkey, destination: target };
    scheduleEvent(run.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
    advance(run, run.queue.nowUs + 1);
  };
  strike(state, enemy);
  strike(state, hero);
  assert.equal(tower.jingu.count, 2);
  const [normalHit, heroHit] = state.recentHits;
  assert.ok(Math.abs(heroHit.amount / normalHit.amount - 1.25) < 1e-9);
  assert.equal(normalHit.casterId, monkey.id);
  assert.equal(normalHit.ownerId, tower.id);
  state.structures = [];
  const restored = structuredClone(state);
  strike(restored, restored.enemies[0]);
  assert.equal(restored.recentHits.at(-1).casterId, monkey.id);
  assert.equal(restored.recentHits.at(-1).ownerId, undefined);
});
