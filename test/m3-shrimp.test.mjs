import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("shrimp", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const target = (id, dx, dy = 0, props = {}) => ({ ...state.enemies[0], id, x: map.worker.x + dx, y: map.worker.y + dy,
    armor: 0, speed: 0, hp: 100_000, abilities: [], ...props });
  const tower = (id, templateId, dx = 0) => ({ ...map.worker, x: map.worker.x + dx, id, templateId, population: 5,
    radius: 72, pending: null, qualification: null });
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  return { state, target, tower, command };
}

for (const rank of [0, 1, 2]) {
  test(`N${108 + rank} uses true point aim, timed contact, and ground/air geometry`, () => {
    const { state, target, tower, command } = fixture();
    const actor = tower(900, "n" + (243 + rank));
    state.structures = [actor];
    state.enemies = [target(21, 480), target(22, 480, 0, { unitId: "m888", layer: "fly", abilities: ["N535"] }),
      target(23, 480, 0, { abilities: ["Amim"] }), target(24, 900, 300), target(25, 900, 301)];
    const action = { type: "cast-tower", towerId: actor.id, skillId: "N" + (108 + rank), point: { x: actor.x + 801, y: actor.y } };
    assert.deepEqual(command("outside", action), { ok: false, reason: "range" });
    assert.ok(command("aim", { ...action, point: { x: actor.x + 500, y: actor.y } }).ok);
    advance(state, 550_003);
    assert.equal(actor.manaMaximum - actor.mana, 30);
    assert.equal(actor.towerSpellReady[action.skillId], 550_003 + (10 - rank) * 1_000_000);
    advance(state, 714_000);
    const contact = 550_003 + Math.round(180 / 1100 * 1_000_000);
    const byId = state.recentHits.filter(hit => hit.targetId === 21 || hit.targetId === 22);
    assert.deepEqual(byId.map(({ targetId, atUs, amount }) => [targetId, atUs, amount]),
      [21, 22].map(id => [id, contact, [400, 560, 720][rank]]));
    assert.equal(state.enemies[1].spellShieldReadyUs, undefined);
    const restored = JSON.parse(JSON.stringify(state));
    advance(restored, 550_003 + Math.round(900 / 1100 * 1_000_000));
    assert.deepEqual(restored.recentHits.map(hit => hit.targetId), [21, 22, 24]);
  });
}

test("I230 begins on completed upgrade, uses a closed radius and removes only its own group", () => {
  const { state, tower, command } = fixture();
  const shrimp = tower(900, "n244");
  const mage = tower(901, "H005", 800);
  mage.hero = newHero("H005");
  mage.hero.natural.INT = 100;
  mage.hero.ranks.A019 = 1;
  const arcane = tower(902, "H004", 900);
  arcane.hero = { ...mage.hero, ranks: { A018: 1 } };
  state.structures = [shrimp, mage, arcane];
  state.enemies = [];
  assert.ok(command("mana-spend", { type: "cast-hero", towerId: mage.id, skillId: "A019", point: { x: mage.x, y: mage.y } }).ok);
  advance(state, 300_002);
  const mana = mage.mana;
  const baseRate = mage.manaRegen;
  const due = state.queue.nowUs + 300_000;
  const timer = scheduleEvent(state.queue, 300_000, { type: "finish-construction", towerId: shrimp.id });
  shrimp.pending = { timer, upgradeTo: "n245", cost: { gold: 0, wood: 0, populationDelta: 0, population: 0 } };
  advance(state, due);
  assert.ok(Math.abs(mage.mana - mana - baseRate * .3) < 1e-6);
  assert.equal(mage.manaRegen, baseRate + 3);
  const beforeRecycle = mage.mana;
  advance(state, due + 100_000);
  assert.ok(command("recycle-aura", { type: "recycle-tower", towerId: shrimp.id }).ok);
  assert.ok(Math.abs(mage.mana - beforeRecycle - (baseRate + 3) * .100001) < 1e-6);
  assert.equal(mage.manaRegen, baseRate);
});
