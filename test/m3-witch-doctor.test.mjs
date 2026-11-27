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
  const state = newMatch("m3-witch-doctor", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H055");
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H055", radius: 72, pending: null, population: 20,
    qualification: "P006", hero, autoModes: { A207: false, A208: false, A209: false } };
  state.structures = [tower];
  const template = state.enemies[0];
  const enemy = (id, dx, dy = 0, overrides = {}) => ({ ...template, id, x: tower.x + dx, y: tower.y + dy,
    speed: 0, hp: 100_000, maxHp: 100_000, armor: 0, abilities: [], ...overrides });
  state.enemies = [];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const cast = (skillId, options = {}) => {
    assert.ok(command(skillId + "-" + state.queue.nowUs, { type: "cast-hero", towerId: tower.id, skillId, ...options }).ok);
    const dueUs = state.queue.nowUs + 300_000;
    advance(state, dueUs);
    return dueUs;
  };
  return { state, tower, enemy, command, cast };
}

test("A207 reuses prior enemies, reads live rank and adds exactly two jumps with a real equipped scepter", () => {
  const { state, tower, enemy, command, cast } = fixture();
  tower.hero.ranks.A207 = 1;
  const first = enemy(21, 100);
  const second = enemy(22, 200);
  state.enemies = [second, first];
  const effectUs = cast("A207", { targetId: first.id });
  advance(state, effectUs + 100_000);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.sourceTemplate, hit.amount]), [[21, "H055", 176]]);
  tower.hero.ranks.A207 = 2;
  state.structures.push({ ...map.worker, x: tower.x + 3000, id: 901, templateId: "n167", pending: null });
  state.inventory.push({ id: 920, itemId: "i310", slot: 3, point: map.worker, charges: 0 });
  assert.ok(command("scepter", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, effectUs + 1_050_000);
  advance(state, effectUs + 1_050_000);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.recentHits)), JSON.parse(JSON.stringify(state.recentHits)));
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [21, 22, 21, 22, 21, 22, 21, 22, 21]);
  assert.ok(state.recentHits.slice(1).every(hit => Math.abs(hit.amount - 547.2) < 1e-8));
  assert.equal(first.stunUntilUs, effectUs + 2_400_000);
});

test("A207 consumes N535 at T231 contact and stops without choosing a different bounce", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A207 = 1;
  const first = enemy(21, 100);
  const shielded = enemy(22, 200, 0, { abilities: ["N535"] });
  const alternative = enemy(23, 250);
  state.enemies = [alternative, shielded, first];
  const effectUs = cast("A207", { targetId: first.id });
  advance(state, effectUs + 199_999);
  assert.equal(shielded.spellShieldReadyUs, undefined);
  advance(state, effectUs + 1_000_000);
  assert.equal(shielded.spellShieldReadyUs, effectUs + 6_200_000);
  assert.equal(shielded.stunUntilUs, undefined);
  assert.equal(shielded.hp, 100_000);
  assert.equal(alternative.hp, 100_000);
  assert.equal(state.recentHits.length, 1);
});

test("A207 a carrier whose caster lost the learned spell retains only its ordinary 100-point native packet", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A207 = 1;
  const target = enemy(21, 300);
  state.enemies = [target, enemy(22, 400)];
  const effectUs = cast("A207", { targetId: target.id });
  delete tower.hero.ranks.A207;
  advance(state, effectUs + 1_000_000);
  assert.equal(state.recentHits.length, 1);
  const hit = state.recentHits[0];
  assert.equal(hit.sourceTemplate, "q052");
  assert.ok(Math.abs(hit.amount - 88) < 1e-8);
  assert.equal(target.stunUntilUs, effectUs + 1_800_000);
});

test("A208 snapshots only the original closed circle and includes the first pulse in the second loss calculation", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A208 = 1;
  const caught = enemy(21, 600, 0, { abilities: ["N535"] });
  const healed = enemy(22, 200, 0, { hp: 90_000 });
  const late = enemy(23, 601);
  state.enemies = [late, healed, caught];
  const effectUs = cast("A208", { point: { x: tower.x + 200, y: tower.y } });
  caught.x += 500;
  healed.hp += 100;
  late.x -= 500;
  late.hp -= 1000;
  caught.hp -= 1000;
  advance(state, effectUs + 3_999_999);
  assert.equal(state.recentHits, undefined);
  advance(state, effectUs + 4_000_000);
  assert.equal(state.recentHits.length, 1);
  assert.deepEqual([state.recentHits[0].targetId, state.recentHits[0].amount], [caught.id, 88]);
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, effectUs + 8_000_000);
  assert.deepEqual(saved.recentHits.map(hit => hit.targetId), [caught.id, caught.id]);
  assert.ok(Math.abs(saved.recentHits[1].amount - 7.744) < 1e-8);
  assert.equal(saved.enemies.find(unit => unit.id === caught.id).spellShieldReadyUs, undefined);
  assert.deepEqual(saved.witchCurses, {});
});

test("A209 captures its scepter aura at birth, uses live INT for each guard arrow and keeps damage centered on the victim", () => {
  const { state, tower, enemy, command, cast } = fixture();
  tower.hero.ranks.A209 = 6;
  state.structures.push({ ...map.worker, x: tower.x + 3000, id: 901, templateId: "n167", pending: null });
  state.inventory.push({ id: 920, itemId: "i310", slot: 3, point: map.worker, charges: 0 });
  assert.ok(command("scepter", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  const primary = enemy(21, 400);
  const near = enemy(22, 550);
  const far = enemy(23, 701);
  const fourth = enemy(24, 852);
  const air = enemy(25, 400, 50, { layer: "fly" });
  state.enemies = [primary, near, far, fourth, air];
  const effectUs = cast("A209");
  const ward = state.summons[0];
  assert.deepEqual([ward.templateId, ward.life.maximum, ward.summon.attack], ["b161", 3000, 88]);
  assert.deepEqual([ward.x, ward.y], [tower.x + 100, tower.y]);
  assert.deepEqual(ward.summon.projectileGroup, { extra: 2, range: 1000, speed: 1800, budget: 9_999_999 });
  assert.ok(command("remove-scepter", { type: "drop-item", itemId: 920 }).ok);
  advance(state, effectUs + 330_000);
  const queued = state.queue.pending.filter(row => row.payload.type === "weapon-impact").map(row => row.payload.shot);
  assert.deepEqual(queued.map(shot => [shot.targetId, shot.weapon.speed, shot.weapon.homing]).sort((a, b) => a[0] - b[0]),
    [[21, 1000, false], [22, 1800, true], [23, 1800, true]]);
  advance(state, effectUs + 700_000);
  const primaryImpactUs = effectUs + 630_000;
  const packets = state.recentHits.filter(hit => hit.atUs === primaryImpactUs);
  assert.deepEqual(packets.map(hit => [hit.targetId, hit.sourceTemplate]), [[21, "b161"], [21, "H055"], [22, "H055"], [25, "H055"]]);
  assert.ok(packets.slice(1).every(hit => Math.abs(hit.amount - 44) < 1e-8));
  assert.equal(fourth.hp, 100_000);
});

test("A207 a forced second throw maintains an independent chain alongside the first", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A207 = 1;
  const north = enemy(21, 50, 500);
  const northOther = enemy(22, 150, 500);
  const south = enemy(23, 50, -500);
  const southOther = enemy(24, 150, -500);
  state.enemies = [north, northOther, south, southOther];
  const firstCast = cast("A207", { targetId: north.id });
  const firstId = state.queue.pending.find(row => row.payload.type === "cask-projectile").payload.source.cask.castId;
  advance(state, firstCast + 100_000);
  // Exercise forced overlap without altering the ordinary cooldown contract.
  tower.heroSpellReady.A207 = 0;
  const secondCast = cast("A207", { targetId: south.id });
  const secondId = state.queue.pending.find(row =>
    row.payload.type === "cask-projectile" && row.payload.targetId === south.id).payload.source.cask.castId;
  assert.notEqual(firstId, secondId);
  advance(state, secondCast + 1_000_000);
  assert.deepEqual(state.recentHits.filter(hit => hit.targetId <= 22).map(hit => hit.targetId), [21, 22, 21, 22, 21]);
  assert.deepEqual(state.recentHits.filter(hit => hit.targetId >= 23).map(hit => hit.targetId), [23, 24, 23, 24, 23]);
});

test("A209 forced replacement removes an existing guard and its arrows, and recycling later leaves the replacement alive", () => {
  const { state, tower, enemy, command, cast } = fixture();
  tower.hero.ranks.A209 = 1;
  state.enemies = [enemy(21, 800)];
  const firstEffect = cast("A209");
  const old = state.summons[0];
  advance(state, firstEffect + 1_070_000);
  assert.ok(state.queue.pending.some(row => row.payload.type === "weapon-impact" && row.payload.shot.summon?.id === old.id));
  // Recast before the last pre-replacement dart can reach the stationary training target.
  tower.heroSpellReady.A209 = 0;
  tower.hero.ranks.A209 = 2;
  const replacementEffect = cast("A209");
  const replacement = state.summons[0];
  assert.notEqual(replacement.id, old.id);
  assert.equal(replacement.templateId, "b157");
  assert.equal(state.summons.length, 1);
  assert.ok(!state.queue.pending.some(({ payload }) => payload.type === "weapon-impact" && payload.shot.summon?.id === old.id));
  assert.ok(!state.queue.pending.some(({ payload }) => payload.type === "summon-expire" && payload.unitId === old.id));
  advance(state, replacementEffect + 330_000);
  assert.ok(state.queue.pending.some(({ payload }) => payload.type === "weapon-impact" && payload.shot.summon?.id === replacement.id));
  assert.ok(command("recycle", { type: "recycle-tower", towerId: tower.id }).ok);
  assert.ok(state.summons.includes(replacement));
  assert.ok(!state.queue.pending.some(({ payload }) => payload.type === "weapon-impact" && payload.shot.summon?.id === replacement.id));
  const previousWardPackets = state.recentHits?.filter(hit => hit.sourceTemplate === "H055").length ?? 0;
  advance(state, replacementEffect + 3_000_000);
  assert.equal(state.recentHits.filter(hit => hit.sourceTemplate === "H055").length, previousWardPackets);
  assert.ok(state.recentHits.some(hit => hit.sourceTemplate === "b157" && hit.ownerId === undefined));
  advance(state, replacementEffect + 15_000_000);
  assert.ok(!state.summons.includes(replacement));
});
