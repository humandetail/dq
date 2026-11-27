import assert from "node:assert/strict";
import { test } from "node:test";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults[id]?.ok, JSON.stringify(state.commandResults[id]));
}

function cast(state, tower, id, skillId, selection) {
  command(state, id, { type: "cast-hero", towerId: tower.id, skillId, ...selection });
  const next = state.queue.pending.find(event => event.payload.type === "hero-spell" && event.payload.towerId === tower.id);
  assert.equal(next.dueUs - state.queue.nowUs, 400_000);
  advance(state, next.dueUs);
  return next.dueUs;
}

function fixture() {
  const state = newMatch("m3-zeus-controlled", 47);
  state.queue.pending = [];
  const hero = newHero("H031");
  hero.natural.INT = 960;
  const tower = { ...map.worker, id: 900, templateId: "H031", radius: 72,
    qualification: "P006", pending: null, hero };
  const maxTower = { ...map.worker, x: tower.x + 500, id: 901, templateId: "n167",
    radius: 72, qualification: null, pending: null };
  state.structures = [tower, maxTower];
  const enemy = { ...map.worker, x: tower.x + 100, id: 910, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 1, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  return { state, tower, enemy };
}

test("Zeus applies Static Field before Arc Lightning and only the primary consumes N535", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A104 = 1;
  tower.hero.ranks.A105 = 1;
  const next = { ...enemy, id: 911, x: enemy.x + 500, abilities: ["N535"] };
  const outside = { ...enemy, id: 912, x: next.x + 501 };
  state.enemies = [next, enemy, outside];
  const at = cast(state, tower, "arc", "A104", { targetId: enemy.id });
  assert.equal(tower.heroSpellReady.A104, at + 3_500_000);
  assert.equal(tower.manaMaximum - tower.mana, 20);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.sourceTemplate]),
    [[enemy.id, "H031"], [enemy.id, "H031"], [next.id, "H031"], [next.id, "H031"],
      [enemy.id, "q001"], [next.id, "q001"]]);
  assert.equal(next.spellShieldReadyUs, undefined);
  assert.equal(outside.hp, outside.maxHp);
  const secondCast = tower.heroSpellReady.A104;
  advance(state, secondCast);
  enemy.abilities.push("N535");
  const before = state.recentHits.length;
  cast(state, tower, "shielded-arc", "A104", { targetId: enemy.id });
  assert.ok(enemy.spellShieldReadyUs > state.queue.nowUs);
  assert.ok(state.recentHits.slice(before).every(hit => hit.sourceTemplate === "H031"));
});

test("Zeus scepter only grants Cloud on pickup, and restored overlapping clouds run every pulse", () => {
  const { state, tower, enemy } = fixture();
  const elder = { ...tower, id: 902, x: tower.x + 110, hero: newHero("H031") };
  state.structures.push(elder);
  state.inventory = [
    { id: 940, itemId: "i310", slot: 0, point: map.worker, charges: 0 },
    { id: 941, itemId: "i310", slot: 1, point: map.worker, charges: 0 },
  ];
  command(state, "premature-scepter", { type: "transfer-item", itemId: 940, towerId: tower.id });
  tower.hero.ranks.A105 = 1;
  assert.equal(tower.hero.ranks.A106, undefined);
  command(state, "remove-scepter", { type: "transfer-item", itemId: 940 });
  command(state, "equip-scepter", { type: "transfer-item", itemId: 940, towerId: tower.id });
  elder.hero.ranks.A105 = 1;
  command(state, "elder-scepter", { type: "transfer-item", itemId: 941, towerId: elder.id });
  assert.equal(tower.hero.ranks.A106, 1);
  assert.equal(tower.heroSpellReady.A106 + 1, elder.heroSpellReady.A106);
  advance(state, elder.heroSpellReady.A106);
  const point = { x: enemy.x, y: enemy.y };
  for (const [id, source] of [["first-cloud", tower], ["second-cloud", elder]]) {
    assert.ok(enqueue(state, { id, matchId: state.matchId,
      action: { type: "cast-hero", towerId: source.id, skillId: "A106", point } }));
  }
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults["first-cloud"].ok && state.commandResults["second-cloud"].ok);
  const start = state.queue.nowUs + 400_000;
  advance(state, start);
  command(state, "remove-after-commit", { type: "transfer-item", itemId: 940 });
  assert.equal(tower.hero.ranks.A106, undefined);
  state.enemies = [{ ...enemy, hp: 1000000, maxHp: 1000000, abilities: ["N535"] }];
  advance(state, start + 1_000_000);
  const restored = structuredClone(state);
  assert.equal(new Set(restored.queue.pending.filter(event => event.payload.type === "zeus-cloud")
    .map(event => event.payload.cloudId)).size, 2);
  advance(restored, start + 10_000_000);
  const pulses = restored.recentHits.filter(hit => hit.sourceTemplate === "q001");
  assert.deepEqual(pulses.reduce((counts, hit) => ({ ...counts, [hit.ownerId]: (counts[hit.ownerId] ?? 0) + 1 }), {}),
    { [tower.id]: 8, [elder.id]: 10 });
  assert.ok(!restored.queue.pending.some(event => event.payload.type === "zeus-cloud"));
});

test("Thundergod's Wrath uses distinct boss centers and applies a delayed cooldown even with overlap", () => {
  const { state, tower, enemy } = fixture();
  tower.hero.ranks.A107 = 1;
  const center = { ...enemy, unitId: "mBOS", x: tower.x + 1400, abilities: ["N534"] };
  const other = { ...center, id: 911, x: tower.x + 1500 };
  state.enemies = [center, other];
  const at = cast(state, tower, "wrath", "A107", {});
  assert.equal(tower.heroSpellReady.A107, at + 16_000_000);
  assert.equal(state.recentHits.length, 4);
  assert.ok(Math.abs(state.recentHits[2].amount / state.recentHits[0].amount - 300 / 850) < 1e-9);
  const restored = structuredClone(state);
  advance(restored, at + 100_000);
  assert.equal(restored.structures[0].heroSpellReady.A107, at + 14_100_000);
});
