import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, heroSpellTargets, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function cast(state, tower, id, skillId, target) {
  assert.ok(command(state, id, { type: "cast-hero", towerId: tower.id, skillId, targetId: target.id }).ok);
  const event = state.queue.pending.find(event => event.payload.type === "hero-spell");
  assert.equal(event.dueUs - state.queue.nowUs, 500_000);
  advance(state, event.dueUs);
  return event.dueUs;
}

function fixture() {
  const state = newMatch("m3-lich-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H052");
  hero.natural.INT = 200;
  const tower = { ...map.worker, id: 900, templateId: "H052", radius: 72, pending: null, qualification: null, hero };
  state.structures = [tower];
  const enemy = { ...map.worker, id: 910, x: tower.x + 100, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  return { state, tower, enemy };
}

test("Dark Ritual uses normal kill ownership and restores the skill's mana gain, excluding map bosses", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A198 = 6;
  const boss = { ...enemy, id: 911, unitId: "m005", abilities: ["N534"] };
  state.enemies.push(boss);
  assert.equal(command(state, "boss", { type: "cast-hero", towerId: tower.id, skillId: "A198", targetId: boss.id }).reason, "range");
  assert.ok(command(state, "sacrifice", { type: "cast-hero", towerId: tower.id, skillId: "A198", targetId: enemy.id }).ok);
  tower.mana = 20;
  const started = state.queue.nowUs;
  advance(state, started + 500_000);
  assert.equal(enemy.hp, 0);
  assert.equal(state.recentHits.at(-1).sourceTemplate, "q025");
  assert.equal(tower.mana, Math.min(tower.manaMaximum, 3020 + tower.manaRegen * .5));
  assert.equal(boss.hp, boss.maxHp);
});

test("Frost Armor submits its first and four future damage packets while the slow independently checks N535", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A199 = 2;
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S362" }).ok);
  assert.equal(tower.templateId, "G076");
  enemy.x = tower.x + 800;
  enemy.abilities = ["N535"];
  const outside = { ...enemy, id: 911, x: enemy.x + 1, abilities: [] };
  state.enemies.push(outside);
  const at = cast(state, tower, "frost", "A199", tower);
  assert.equal(enemy.doomFrostUntilUs, undefined);
  assert.ok(enemy.spellShieldReadyUs > at);
  assert.equal(enemy.hp, enemy.maxHp);
  advance(state, at + 200_000);
  assert.ok(enemy.hp < enemy.maxHp);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, at + 6_200_000);
  const hits = restored.recentHits.filter(hit => hit.targetId === enemy.id);
  assert.equal(hits.length, 5);
  assert.deepEqual(hits.map(hit => hit.atUs - at), [200000, 1700000, 3200000, 4700000, 6200000]);
  assert.ok(hits.every(hit => hit.sourceTemplate === "q045"));
  assert.equal(restored.enemies[1].hp, outside.maxHp);
});

test("Chain Frost has ten real ordered contacts, revisits candidates, and stuns only its first target", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A200 = 1;
  const second = { ...enemy, id: 911, x: enemy.x + 100 };
  const third = { ...enemy, id: 912, x: enemy.x + 601 };
  state.enemies.push(third, second);
  const at = cast(state, tower, "chain", "A200", enemy);
  advance(state, at + 125_000);
  assert.equal(enemy.stunUntilUs, at + 225_000);
  assert.equal(second.stunUntilUs, undefined);
  assert.ok(enemy.lichChainSlow);
  advance(state, at + 1_250_000);
  assert.equal(state.recentHits.length, 10);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), Array.from({ length: 10 }, (_, i) => i % 2 ? second.id : enemy.id));
  assert.equal(third.hp, third.maxHp);
});

test("A real Scepter widens each Chain Frost contact to a 300-area packet", () => {
  const { state, tower, enemy } = fixture();
  tower.qualification = "P006";
  state.structures.push({ ...map.worker, x: tower.x + 500, id: 901, templateId: "n167",
    radius: 72, pending: null, qualification: null });
  tower.hero.ranks.A200 = 2;
  state.inventory = [{ id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command(state, "scepter", { type: "transfer-item", itemId: 940, towerId: tower.id }).ok);
  const edge = { ...enemy, id: 911, x: enemy.x + 300 };
  const outside = { ...enemy, id: 912, x: enemy.x + 301 };
  state.enemies.push(outside, edge);
  const at = cast(state, tower, "chain-scepter", "A200", enemy);
  advance(state, at + 125_000);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [enemy.id, edge.id]);
  assert.equal(state.recentHits[0].amount, state.recentHits[1].amount);
  assert.ok(state.recentHits[0].amount > 1000);
  assert.equal(outside.hp, outside.maxHp);
});

test("Dark Ritual and stolen Dark Ritual exclude the real welfare unit identities from manual and automatic targeting", () => {
  for (const [skillId, template] of [["A198", "H052"], ["T317", "H042"]]) {
    const { state, tower, enemy } = fixture();
    tower.templateId = template;
    tower.hero = newHero(template);
    tower.hero.ranks[skillId] = 1;
    if (skillId === "T317") tower.doomBorrowed = { id: "T317", rank: 1 };
    const welfare = ["m998", "m999"].map((unitId, index) =>
      ({ ...enemy, id: 911 + index, unitId, welfare: true, abilities: [] }));
    state.enemies = [...welfare, enemy];
    assert.deepEqual(heroSpellTargets(state, tower.id, skillId).map(target => target.id), [enemy.id]);
    for (const target of welfare) {
      const rejected = command(state, target.unitId, { type: "cast-hero", towerId: tower.id, skillId, targetId: target.id });
      assert.equal(rejected.reason, "range");
    }
    if (skillId === "A198") {
      scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
      advance(state, state.queue.nowUs + 1);
      assert.equal(state.queue.pending.find(event => event.payload.type === "hero-spell").payload.targetId, enemy.id);
    }
    for (const target of welfare) assert.equal(target.hp, target.maxHp);
  }
});
