import assert from "node:assert/strict";
import { test } from "node:test";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { activeHeroSkill, drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { effectiveMoveSpeed, movementRate } from "../src/game/m2/movement.ts";

function advance(state, nowUs) {
  state.clock.targetUs = nowUs;
  while (drain(state, 1000) === "pending") {}
}

function command(state, action) {
  const id = String(state.queue.nextSequence);
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("tidehunter-controlled", 14);
  state.queue.pending = state.queue.pending.filter(entry => entry.payload.type === "world-night-change");
  const hero = newHero("H057");
  hero.natural.INT = 400;
  hero.ranks = { A217: 2, A221: 1, A222: 1 };
  const tower = { ...map.worker, id: 900, templateId: "H057", radius: 72, pending: null, population: 20,
    qualification: "P006", hero };
  state.structures = [tower];
  const enemy = (id, dx, dy = 0, options = {}) => ({ id, unitId: "m001", x: tower.x + dx, y: tower.y + dy, layer: "ground",
    hp: 100_000, maxHp: 100_000, mana: 0, armor: 0, speed: 200, points: 0, radius: 2, initialOverlaps: [],
    abilities: [], wave: 1, ...options });
  const cast = (skillId, target, caster = tower) => {
    assert.ok(command(state, { type: "cast-hero", towerId: caster.id, skillId, ...(target && { targetId: target.id }) }).ok);
    const event = state.queue.pending.find(entry => entry.payload.type === "hero-spell" && entry.payload.skillId === skillId);
    assert.equal(event.dueUs - state.queue.nowUs, skillId === "A111" ? 300_000 : 500_000);
    advance(state, event.dueUs);
    return event.dueUs;
  };
  const staff = () => {
    state.structures.push({ ...map.worker, x: tower.x + 4000, id: 902, templateId: "n167", pending: null });
    state.inventory.push({ id: 1000, itemId: "i310", charges: 0, slot: 4, point: state.worker });
    assert.ok(command(state, { type: "transfer-item", itemId: 1000, towerId: tower.id }).ok);
  };
  return { state, tower, enemy, cast, staff };
}

test("A217 primary twin projectiles follow independent shields and the truncated side wave keeps attribution", () => {
  const { state, tower, enemy, cast } = fixture();
  const main = enemy(21, 900, 0, { abilities: ["N535"] });
  const side = enemy(22, 450);
  const beyond = enemy(23, 1250);
  state.enemies = [main, beyond, side];
  const at = cast("A217", main);
  const { sweep } = state.queue.pending.find(event => event.payload.type === "spell-sweep").payload;
  assert.equal(sweep.range, 900);
  assert.equal(sweep.radiusEnd, 319);
  assert.equal(sweep.tide.excludeId, main.id);
  const carrierIds = state.queue.pending.filter(entry => entry.payload.type === "tide-carrier-expire").map(entry => entry.payload.sourceId);
  assert.equal(carrierIds.length, 2);
  assert.equal(new Set(carrierIds).size, 2);
  const saved = JSON.parse(JSON.stringify(state));
  for (const run of [state, saved]) advance(run, at + 1_000_000);
  assert.deepEqual(saved, state);
  assert.equal(main.tideCorrosion, undefined);
  assert.ok(main.spellShieldReadyUs > at);
  assert.ok(main.hp < main.maxHp);
  assert.equal(beyond.hp, beyond.maxHp);
  assert.equal(side.tideCorrosion.armor, 30);
  assert.equal(effectiveMoveSpeed(side), 120);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.ownerId, hit.sourceTemplate]),
    [[side.id, tower.id, "q001"], [main.id, undefined, "q001"]]);
  advance(state, side.tideCorrosion.untilUs);
  assert.equal(side.tideCorrosion, undefined);
  assert.equal(effectiveMoveSpeed(side), 200);
});

test("Physical i310 swaps the active slot and keeps paid rank and cooldown while its full wave rereads rank", () => {
  const { state, tower, enemy, cast, staff } = fixture();
  const primary = enemy(21, 300);
  const tail = enemy(22, 1170);
  state.enemies = [primary, tail];
  tower.hero.paid = ["A217", "A217"];
  tower.heroSpellReady = { A217: 1_000_000 };
  staff();
  assert.equal(activeHeroSkill(tower, "A217"), "A218");
  assert.deepEqual(tower.hero.paid, ["A217", "A217"]);
  assert.equal(command(state, { type: "cast-hero", towerId: tower.id, skillId: "A218", targetId: primary.id }).reason, "cooldown");
  advance(state, 1_000_000);
  const at = cast("A218", primary);
  assert.deepEqual(state.queue.pending.filter(entry => entry.payload.type === "tide-wave-expire").map(entry => entry.dueUs), [at + 10_000_000]);
  const cool = tower.heroSpellReady.A217;
  advance(state, at + 400_000);
  assert.equal(primary.tideCorrosion.armor, 30);
  assert.ok(command(state, { type: "drop-item", itemId: 1000 }).ok);
  assert.equal(activeHeroSkill(tower, "A217"), "A217");
  assert.equal(tower.heroSpellReady.A217, cool);
  assert.equal(tower.hero.ranks.A217, 2);
  advance(state, at + 1_200_000);
  assert.equal(tail.tideCorrosion.armor, 20);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.ownerId]), [[primary.id, tower.id], [tail.id, tower.id]]);
});

test("A111 scepter grants and withdrawal swap the same wave slot", () => {
  const { state, tower, cast } = fixture();
  const wisp = { ...tower, id: 902, x: tower.x + 400, templateId: "H033", hero: newHero("H033") };
  wisp.hero.ranks.A111 = 1;
  state.structures.push(wisp);
  state.inventory.push({ id: 1000, itemId: "i310", charges: 0, slot: 0, towerId: wisp.id, point: wisp });
  const at = cast("A111", tower, wisp);
  advance(state, at + 1_000_000);
  assert.equal(activeHeroSkill(tower, "A217"), "A218");
  assert.ok(command(state, { type: "drop-item", itemId: 1000 }).ok);
  advance(state, at + 2_000_000);
  assert.equal(activeHeroSkill(tower, "A217"), "A217");
});

test("A221 hits magic-immune targets at the physical radius and A222 separates lift and native injury", () => {
  const { state, tower, enemy, cast } = fixture();
  const inner = enemy(21, 500);
  const immune = enemy(22, 600, 0, { abilities: ["Amim"] });
  const flying = enemy(23, 750, 0, { layer: "fly", unitId: "test-air" });
  const edge = enemy(24, 1200);
  const outside = enemy(25, 1201);
  state.enemies = [outside, edge, flying, immune, inner];
  const anchor = cast("A221");
  assert.deepEqual(state.recentHits.filter(hit => hit.atUs === anchor).map(hit => hit.targetId), [inner.id, immune.id]);
  advance(state, anchor + 100_000);
  const point = { x: inner.x, y: inner.y };
  const at = cast("A222");
  assert.deepEqual(state.recentHits.filter(hit => hit.atUs === at).map(hit => hit.targetId), [inner.id]);
  assert.equal(state.battleAnimations.filter(event => event.unitId === "T279" && event.atUs === at).length, 20);
  advance(state, at + 800_000);
  for (const target of [inner, immune, flying, edge]) {
    assert.equal(target.ravageLift.height, 800);
    assert.equal(movementRate(target), 0);
  }
  assert.equal(outside.ravageLift, undefined);
  const saved = JSON.parse(JSON.stringify(state));
  for (const run of [state, saved]) advance(run, at + 1_600_000);
  assert.deepEqual(saved, state);
  assert.equal(inner.ravageLift, undefined);
  assert.deepEqual({ x: inner.x, y: inner.y }, point);
  assert.equal(inner.stunUntilUs, at + 2_600_000);
  assert.equal(immune.stunUntilUs, undefined);
  assert.equal(flying.stunUntilUs, undefined);
  assert.equal(edge.stunUntilUs, undefined);
  assert.equal(tower.heroSpellReady.A222, at + 20_000_000);
});

test("H057 base night regeneration begins at exact dusk and retains strength regeneration in daylight", () => {
  const { state, tower, cast } = fixture();
  let at = cast("A221");
  const base = .1 * tower.hero.natural.STR;
  assert.equal(tower.life.regen, base);
  tower.life.hp = 10;
  advance(state, 120_000_000);
  assert.equal(tower.life.regen, base + .5);
  assert.ok(Math.abs(tower.life.hp - (10 + base * (120_000_000 - at) / 1_000_000)) < .00001);
  advance(state, 240_000_000);
  assert.equal(tower.life.regen, base);
  at = tower.life.lastUs;
  assert.equal(at, 240_000_000);
});
