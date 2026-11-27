import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("m3-magnus", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H048");
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H048", radius: 72, pending: null, population: 20,
    qualification: "P006", hero, autoModes: { A186: false, A187: false, A188: false } };
  state.structures = [tower];
  const template = state.enemies[0];
  const enemy = (id, dx, dy = 0, overrides = {}) => ({ ...template, id, x: tower.x + dx, y: tower.y + dy,
    speed: 0, radius: 5, hp: 100_000, maxHp: 100_000, armor: 0, abilities: [], layer: "fly", ...overrides });
  state.enemies = [];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const begin = (skillId, options = {}, caster = tower) => {
    assert.ok(command(skillId + "-" + state.queue.nowUs, { type: "cast-hero", towerId: caster.id, skillId, ...options }).ok);
    return state.queue.nowUs + 400_000;
  };
  const cast = (skillId, options, caster) => {
    const effect = begin(skillId, options, caster);
    advance(state, effect);
    return effect;
  };
  const scepter = () => {
    state.structures.push({ ...map.worker, x: tower.x + 4000, id: 901, templateId: "n167", pending: null });
    state.inventory.push({ id: 920, itemId: "i310", slot: 3, point: map.worker, charges: 0 });
    assert.ok(command("equip", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  };
  return { state, tower, enemy, command, begin, cast, scepter };
}

test("A186 actual wave reaches the expanded disk at the analytical instant, then moves 40 on impact and three more times", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A186 = 1;
  const target = enemy(21, 500, 0, { abilities: ["N535"] });
  state.enemies = [target];
  const effect = cast("A186", { point: { x: tower.x + 500, y: tower.y } });
  const impact = effect + 138_889;
  advance(state, impact - 1);
  assert.equal(state.recentHits, undefined);
  assert.equal(target.x, tower.x + 500);
  advance(state, impact);
  assert.equal(state.recentHits[0].atUs, impact);
  assert.equal(state.recentHits[0].sourceTemplate, "q041");
  assert.equal(state.recentHits[0].amount, 264);
  assert.equal(target.x, tower.x + 540);
  assert.equal(target.spellShieldReadyUs, undefined);
  const checkpoint = JSON.parse(JSON.stringify(state));
  advance(checkpoint, impact + 149_999);
  assert.equal(checkpoint.enemies[0].x, tower.x + 620);
  advance(checkpoint, impact + 150_000);
  assert.equal(checkpoint.enemies[0].x, tower.x + 660);
  assert.equal(checkpoint.enemies[0].magnusPush, undefined);
});

test("A186 effective i310 commits T205's staff rank and keeps doubled wave after removal", () => {
  const { state, tower, enemy, command, cast, scepter } = fixture();
  tower.hero.ranks.A186 = 1;
  scepter();
  const target = enemy(21, 600);
  state.enemies = [target];
  const effect = cast("A186", { point: target });
  const carrier = state.queue.pending.find(({ payload }) => payload.type === "magnus-carrier-expire");
  assert.deepEqual([carrier.payload.skillId, carrier.payload.rank, carrier.dueUs], ["T205", 7, effect + 1_000_000]);
  assert.ok(command("drop", { type: "drop-item", itemId: 920 }).ok);
  advance(state, effect + 208_333);
  assert.equal(state.recentHits[0].amount, 528);
});

test("A187 timed strength is only upgraded or refreshed by an equal/higher rank and cleaves from actual melee damage", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A187 = 4;
  const first = enemy(21, 180, 0, { layer: "ground" });
  const edge = enemy(22, 700, 0, { layer: "ground" });
  const outside = enemy(23, 701, 0, { layer: "ground" });
  state.enemies = [first, edge, outside];
  const effect = cast("A187", { targetId: tower.id });
  const applied = structuredClone(tower.empower);
  assert.equal(applied.rank, 4);
  const shot = { towerId: tower.id, sourceTemplate: "H048", targetId: first.id, raw: 100,
    weapon: { ...weapons.H048[0], attackType: "chaos" }, point: first, destination: first };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
  advance(state, effect + 1);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.amount]), [[edge.id, 80], [first.id, 100]]);
  assert.equal(outside.hp, 100_000);
  advance(state, effect + 100_000);
  tower.hero.ranks.A187 = 3;
  tower.heroSpellReady.A187 = 0;
  cast("A187", { targetId: tower.id });
  assert.deepEqual(tower.empower, applied);
  advance(state, effect + 7_000_000);
  assert.equal(tower.empower, undefined);
});

test("A187 gives the same attack channel to a real ranged tower without adding melee cleave", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A187 = 6;
  const ranger = { ...map.worker, id: 905, templateId: "H041", radius: 72, pending: null, population: 20,
    hero: newHero("H041"), autoModes: {} };
  ranger.hero.natural = { STR: 0, AGI: 0, INT: 100 };
  state.structures.push(ranger);
  const first = enemy(21, 140, 0, { layer: "ground" });
  const companion = enemy(22, 170, 0, { layer: "ground" });
  state.enemies = [first, companion];
  const effect = cast("A187", { targetId: ranger.id });
  assert.equal(tower.empowerTarget, ranger.id);
  assert.equal(ranger.empower.rank, 6);
  const baseline = JSON.parse(JSON.stringify(state));
  delete baseline.structures[1].empower;
  for (const match of [state, baseline]) {
    scheduleEvent(match.queue, 1, { type: "movement" });
    advance(match, effect + 1);
  }
  const deployed = state.structures[1];
  const ordinary = baseline.structures[1];
  const dueUs = deployed.attack.timing.windup.dueUs;
  assert.equal(ordinary.attack.timing.windup.dueUs, dueUs);
  for (const match of [state, baseline]) advance(match, dueUs);
  const raw = match => match.queue.pending.find(({ payload }) =>
    payload.type === "weapon-impact" && payload.shot.towerId === ranger.id).payload.shot.raw;
  assert.equal(raw(state), raw(baseline) * 1.5);
  for (const match of [state, baseline]) advance(match, dueUs + 155_556);
  assert.equal(companion.hp, 100_000);
});

test("A188 preserves dynamic nearest-anchor shifts and cancels prior A186 displacement before the no-owner stomp", () => {
  const { state, tower, enemy, begin, cast } = fixture();
  tower.hero.ranks.A186 = 1;
  const caster = { ...tower, x: tower.x + 490, id: 905, hero: newHero("H048") };
  caster.hero.natural = { STR: 0, AGI: 0, INT: 200 };
  caster.hero.ranks.A188 = 1;
  state.structures.push(caster);
  const pushed = enemy(21, 900);
  const originalAnchor = enemy(22, 915, 30, { abilities: ["Arsk"] });
  state.enemies = [originalAnchor, pushed];
  const waveEffect = cast("A186", { point: { x: tower.x + 750, y: tower.y } });
  advance(state, waveEffect + 60_000);
  const pullEffect = begin("A188", {}, caster);
  advance(state, pullEffect - 1);
  assert.ok(pushed.magnusPush);
  assert.ok(originalAnchor.magnusPush);
  const seed = state.randomState;
  const advanceSeed = value => (Math.imul(value, 1664525) + 1013904223) >>> 0;
  const four = [advanceSeed(seed)];
  while (four.length < 4) four.push(advanceSeed(four.at(-1)));
  const offsets = four.map(value => 10 + Math.floor(value / 2 ** 32 * 41));
  const at = { x: pushed.x, y: pushed.y };
  advance(state, pullEffect);
  assert.deepEqual([pushed.x, pushed.y, originalAnchor.x, originalAnchor.y], [
    at.x + offsets[0], at.y + offsets[1], at.x + offsets[0] + offsets[2], at.y + offsets[1] + offsets[3],
  ]);
  assert.equal(pushed.magnusPush, undefined);
  assert.equal(originalAnchor.magnusPush, undefined);
  assert.equal(pushed.stunUntilUs, pullEffect + 2_000_000);
  assert.equal(originalAnchor.stunUntilUs, pullEffect + 1_600_000);
  assert.deepEqual(state.recentHits.slice(-2).map(({ sourceTemplate, ownerId, amount }) => [sourceTemplate, ownerId, amount]),
    [["q001", undefined, 240], ["q001", undefined, 240]]);
  const stoppedX = pushed.x;
  advance(state, pullEffect + 150_000);
  assert.equal(pushed.x, stoppedX);
});

test("A188 staff's closed 1400 growth cap affects relocation independently of the actual stomp circle", () => {
  const { state, tower, enemy, cast, scepter } = fixture();
  tower.hero.ranks.A188 = 1;
  tower.hero.natural.STR = 2000;
  scepter();
  const edge = enemy(21, 1400);
  const outside = enemy(22, 1401);
  state.enemies = [edge, outside];
  const effect = cast("A188");
  assert.ok(edge.x >= tower.x + 1410);
  assert.equal(outside.x, tower.x + 1401);
  assert.equal(outside.stunUntilUs, effect + 2_000_000);
  assert.equal(state.recentHits.length, 2);
});

test("A187 automatic issue reuses its last living ally and falls back to self when the ally is recycled", () => {
  const { state, tower, enemy, cast, command } = fixture();
  tower.hero.ranks.A187 = 1;
  const ally = { ...tower, y: tower.y + 100, id: 905, hero: undefined };
  state.structures.push(ally);
  state.enemies = [enemy(21, 250, 0, { layer: "ground" })];
  const first = cast("A187", { targetId: ally.id });
  assert.ok(command("enable", { type: "set-auto-mode", towerId: tower.id, key: "A187", enabled: true }).ok);
  advance(state, first + 9_000_000);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, first + 9_400_001);
  assert.equal(tower.empower, undefined);
  assert.equal(ally.empower.rank, 1);
  assert.ok(command("recycle-ally", { type: "recycle-tower", towerId: ally.id }).ok);
  advance(state, first + 18_400_001);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, first + 18_800_002);
  assert.equal(tower.empower.rank, 1);
  assert.equal(tower.empowerTarget, tower.id);
});
