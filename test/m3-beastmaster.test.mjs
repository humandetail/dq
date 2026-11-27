import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { addHeroExperience, newHero } from "../src/game/m2/hero.ts";
import { canSeeEnemy, drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, now) {
  state.clock.targetUs = now;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, action) {
  const id = `beastmaster-${state.queue.nowUs}`;
  assert.ok(enqueue(state, { id, action, matchId: state.matchId }));
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults[id].ok, JSON.stringify(state.commandResults[id]));
}

function fixture() {
  const state = newMatch("beastmaster", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const base = state.enemies[0];
  const tower = { id: 900, templateId: "H056", hero: newHero("H056"), x: -288, y: -128, radius: 72,
    pending: null, qualification: "P001", autoModes: { A214: false, A215: false } };
  addHeroExperience(tower.hero, tower.templateId, 500_000, () => true);
  state.structures = [tower, { id: 901, templateId: "n189", x: -520, y: -128, radius: 72, pending: null }];
  state.enemies = [];
  const enemy = (id, x, y, abilities = []) => ({ ...base, id, x, y, hp: 1_000_000, maxHp: 1_000_000, speed: 0, armor: 0, abilities });
  const learn = (skillId, count = 1) => {
    for (let level = 0; level < count; level++) issue(state, { type: "learn-skill", towerId: tower.id, skillId });
  };
  const cast = (skillId, point) => {
    issue(state, { type: "cast-hero", towerId: tower.id, skillId, point });
    advance(state, state.queue.nowUs + 500_000);
    return state.queue.nowUs;
  };
  const hit = (summon, target, secondary = false) => {
    scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0,
      shot: { towerId: tower.id, targetId: target.id, sourceTemplate: summon.templateId,
        weapon: weapons[summon.templateId][0], raw: 100, point: summon, destination: target,
        summon: { id: summon.id, banner: false, skillId: "A215" }, ...(secondary ? { secondary: true } : {}) } });
    advance(state, state.queue.nowUs + 1);
  };
  return { state, tower, enemy, learn, cast, hit };
}

test("A214 samples both actual axes independently at .03s and rereads a scepter on return at 1.92s", () => {
  const { state, tower, learn, cast, enemy } = fixture();
  learn("A214");
  const target = enemy(601, tower.x + 1180, tower.y, ["N535"]);
  state.enemies = [target];
  const castUs = cast("A214", { x: tower.x + 1200, y: tower.y });
  const [axes] = Object.values(state.wildAxes);
  advance(state, castUs + 30_000);
  assert.equal(axes.step, 1);
  assert.ok(Math.abs(axes.axes[0].x - (tower.x + 400 / 12)) < 1e-10);
  assert.equal(axes.axes[1].y, tower.y + 12.5);
  const itemId = state.nextId++;
  state.inventory.push({ id: itemId, itemId: "i310", slot: 0, charges: 0, point: state.worker });
  issue(state, { type: "transfer-item", itemId, towerId: tower.id });
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, castUs + 960_000);
  const [resumed] = Object.values(restored.wildAxes);
  assert.ok(Math.abs(resumed.axes[0].x - (tower.x + 400 + 800 * 21 / 22)) < 1e-10);
  assert.ok(resumed.axes.every(axe => axe.hit.includes(target.id)));
  assert.equal(restored.recentHits.filter(hit => hit.targetId === target.id).length, 2);
  assert.equal(restored.enemies[0].spellShieldReadyUs, undefined);
  advance(restored, castUs + 1_919_999);
  assert.equal(restored.structures[0].heroSpellReady.A214, castUs + 12_000_000);
  advance(restored, castUs + 1_920_000);
  assert.deepEqual(restored.wildAxes, {});
  assert.equal(restored.structures[0].heroSpellReady.A214, castUs + 1_920_000);
  assert.equal(restored.recentHits.filter(hit => hit.targetId === target.id).length, 2);
});

test("A215 grants actual paired templates, detector and persistent birth haste; groups coexist for two seconds", () => {
  const { state, tower, learn, cast, enemy } = fixture();
  learn("A215", 3);
  learn("A216");
  const first = cast("A215");
  const [hawk, boar] = state.summons;
  assert.deepEqual([hawk.templateId, boar.templateId], ["b164", "b170"]);
  assert.equal(boar.summon.projectileGroup.extra, 3);
  assert.equal(weapons.b170[0].base, 450);
  assert.equal(weapons.b170[0].dice, 0);
  assert.ok(state.summons.every(unit => unit.summon.beastmasterHasteRank === 1));
  learn("A216", 2);
  assert.ok(state.summons.every(unit => unit.summon.beastmasterHasteRank === 1));
  const hidden = enemy(601, hawk.x + 1000, hawk.y);
  hidden.invisibleFromUs = 0;
  hidden.speedBuffUntilUs = first + 20_000_000;
  assert.ok(canSeeEnemy(state, hidden));
  assert.equal(canSeeEnemy(state, { ...hidden, x: hidden.x + .001 }), false);
  advance(state, first + 10_000_000);
  cast("A215");
  assert.deepEqual(state.summons.map(unit => unit.summon.beastmasterHasteRank), [1, 1, 3, 3]);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, first + 12_000_000);
  assert.equal(restored.summons.length, 2);
  assert.ok(restored.summons.every(unit => unit.id !== hawk.id && unit.id !== boar.id));
  assert.equal(tower.hero.ranks.A216, 3);
});

test("hawk weapon damage becomes a real lightning chain while boar venom applies only to main impacts", () => {
  const { state, tower, learn, cast, enemy, hit } = fixture();
  learn("A215", 3);
  cast("A215");
  const [hawk, boar] = state.summons;
  const primary = enemy(601, tower.x + 200, tower.y, ["N535"]);
  const next = enemy(602, tower.x + 400, tower.y, ["N535"]);
  state.enemies = [next, primary];
  hit(hawk, primary);
  assert.equal(state.recentHits?.length ?? 0, 0);
  assert.ok(primary.spellShieldReadyUs > state.queue.nowUs);
  assert.equal(next.spellShieldReadyUs, undefined);
  hit(hawk, primary);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.sourceTemplate, hit.casterId]), [[601, "b164", hawk.id], [602, "b164", hawk.id]]);
  assert.ok(state.recentHits.every(hit => Math.abs(hit.amount - 800 * (1 + tower.hero.natural.INT * .001)) < 1e-8));
  hit(boar, primary);
  hit(boar, next, true);
  assert.equal(primary.boarVenom[boar.id].rate, .7);
  assert.equal(next.boarVenom, undefined);
  advance(state, primary.boarVenom[boar.id].untilUs);
  assert.equal(primary.boarVenom[boar.id], undefined);
});
