import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { containmentPoints, drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { enemyTemplateAbilities, waves } from "../src/game/m2/waves.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("m3-dark-seer", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H053");
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H053", radius: 72, pending: null, population: 20,
    qualification: "P006", hero, autoModes: { A201: false, A202: false, A203: false } };
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
  const cast = (skillId, options = {}, caster = tower) => {
    assert.ok(command(skillId + "-" + state.queue.nowUs, { type: "cast-hero", towerId: caster.id, skillId, ...options }).ok);
    const effect = state.queue.nowUs + 500_000;
    advance(state, effect);
    return effect;
  };
  const scepter = () => {
    state.structures.push({ ...map.worker, x: tower.x + 4000, id: 901, templateId: "n167", pending: null });
    state.inventory.push({ id: 920, itemId: "i310", slot: 3, point: map.worker, charges: 0 });
    assert.ok(command("equip", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  };
  return { state, tower, enemy, command, cast, scepter };
}

test("A201 freezes the target list, consumes N535 only for T228 and hits at 0.52 after 25 exact positions", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A201 = 1;
  const center = { x: tower.x + 400, y: tower.y };
  const shielded = enemy(21, 800, 0, { abilities: ["N535"] });
  const controlled = enemy(22, 500);
  const newcomer = enemy(23, 801);
  state.enemies = [newcomer, controlled, shielded];
  const effect = cast("A201", { point: center });
  assert.deepEqual(tower.vacuum.targets, [21, 22]);
  assert.equal(shielded.spellShieldReadyUs, effect + 6_000_000);
  assert.equal(shielded.stunUntilUs, undefined);
  assert.equal(controlled.stunUntilUs, effect + 500_000);
  newcomer.x = center.x + 90;
  advance(state, effect + 19_999);
  assert.equal(shielded.x, center.x + 400);
  advance(state, effect + 20_000);
  assert.ok(Math.abs(shielded.x - (center.x + 400 * 59 / 60)) < 1e-9);
  tower.hero.ranks.A201 = 2;
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, effect + 519_999);
  const exact = Array.from({ length: 25 }, (_, index) => 1 - (index + 1) / 60).reduce((x, factor) => x * factor, 400);
  assert.ok(Math.abs(saved.enemies.find(unit => unit.id === shielded.id).x - (center.x + exact)) < 1e-8);
  assert.equal(saved.recentHits, undefined);
  advance(saved, effect + 520_000);
  assert.deepEqual(saved.recentHits.map(hit => [hit.targetId, hit.amount]), [[shielded.id, 704], [controlled.id, 704]]);
  assert.equal(saved.enemies.find(unit => unit.id === newcomer.id).hp, 100_000);
  assert.equal(saved.structures[0].vacuum, undefined);
});

test("A201 a forced second commit abandons the previous timer without its finishing damage", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A201 = 1;
  const original = enemy(21, 600);
  const replacement = enemy(22, -600);
  state.enemies = [original, replacement];
  const effect = cast("A201", { point: original });
  const old = tower.vacuum.timerId;
  scheduleEvent(state.queue, 200_001, { type: "hero-spell", towerId: tower.id, targetId: 0, skillId: "A201",
    point: { x: replacement.x, y: replacement.y } });
  advance(state, effect + 520_000);
  assert.equal(state.recentHits, undefined);
  assert.deepEqual(tower.vacuum.targets, [replacement.id]);
  assert.ok(!state.queue.pending.some(row => row.timerId === old));
  advance(state, effect + 720_001);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [replacement.id]);
});

test("A202 commits a live scepter amount, follows the receiver and executes all 50 real shield-free pulses", () => {
  const { state, tower, enemy, command, cast, scepter } = fixture();
  tower.hero.ranks.A202 = 1;
  const ally = { ...tower, templateId: "n001", id: 905, hero: undefined, x: tower.x + 200 };
  state.structures.push(ally);
  scepter();
  const edge = enemy(21, 750, 0, { abilities: ["N535"] });
  const outside = enemy(22, 751);
  state.enemies = [edge, outside];
  const effect = cast("A202", { targetId: ally.id });
  assert.equal(tower.ionShellTarget, ally.id);
  assert.equal(state.ionShells[ally.id].amount, 108);
  assert.ok(command("drop", { type: "drop-item", itemId: 920 }).ok);
  tower.hero.ranks.A202 = 6;
  ally.x -= 50;
  advance(state, effect + 199_999);
  assert.equal(state.recentHits, undefined);
  advance(state, effect + 200_000);
  assert.equal(state.ionShells[ally.id].remaining, 49);
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, effect + 10_000_000);
  assert.equal(saved.ionShells[ally.id], undefined);
  assert.equal(saved.recentHits.length, 50);
  assert.equal(saved.recentHits.at(-1).atUs, effect + 10_000_000);
  assert.ok(saved.recentHits.every(hit => hit.targetId === edge.id && Math.abs(hit.amount - 95.04) < 1e-8));
  assert.equal(saved.enemies[0].spellShieldReadyUs, undefined);
  assert.equal(saved.enemies[1].hp, 100_000);
});

test("A202 replaces by actual receiver and retains an independently timed corpse point after native summon death", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A202 = 1;
  const ally = { ...tower, id: 905, hero: undefined, x: tower.x + 200, templateId: "b156",
    summon: { ownerId: tower.id, attack: 0, speed: 0, red: 0, green: 0, blue: 0, skillId: "A209" } };
  state.summons = [ally];
  const second = { ...tower, id: 906, hero: structuredClone(tower.hero) };
  second.hero.ranks.A202 = 2;
  state.structures.push(second);
  const first = cast("A202", { targetId: ally.id });
  const old = state.ionShells[ally.id].timerId;
  const separate = cast("A202", { targetId: second.id }, second);
  assert.equal(state.ionShells[ally.id].timerId, old);
  assert.ok(state.ionShells[second.id]);
  advance(state, separate + 100_000);
  second.heroSpellReady.A202 = 0;
  const replaced = cast("A202", { targetId: ally.id }, second);
  assert.notEqual(state.ionShells[ally.id].timerId, old);
  assert.equal(state.ionShells[ally.id].towerId, second.id);
  assert.equal(state.ionShells[ally.id].amount, 120);
  scheduleEvent(state.queue, 10, { type: "summon-expire", unitId: ally.id });
  advance(state, replaced + 10);
  assert.ok(!state.summons.includes(ally));
  assert.deepEqual(state.ionShells[ally.id].corpsePoint, { x: ally.x, y: ally.y });
  state.enemies = [enemy(21, 750)];
  advance(state, replaced + 200_000);
  assert.ok(state.recentHits.some(hit => hit.ownerId === second.id && hit.targetId === 21));
  assert.ok(!state.queue.pending.some(row => row.timerId === old));
  assert.ok(first < replaced);
});

test("A203 creates clean individual receivers from the source template and ignores replicas for capacity and unowned expiry rewards", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A203 = 1;
  const center = { x: tower.x + 400, y: tower.y };
  const original = enemy(21, 400, 0, { hp: 95_000, maxHp: 100_000, mana: 50, overdraftLife: 20_000, overdraftArmor: 3,
    abilities: ["T202", "N535"], armorBuff: { value: 40, untilUs: 8_000_000 }, points: 2, waypoint: 2, previousWaypoint: 1 });
  const additional = [22, 23, 24, 25, 26].map((id, index) => enemy(id, 430 + index * 30));
  const boss = enemy(20, 480, 0, { unitId: "m531", abilities: ["N534"] });
  const edge = enemy(27, 820);
  state.enemies = [boss, edge, ...additional.toReversed(), original];
  const capacity = containmentPoints(state);
  assert.ok(capacity > 0);
  const gold = state.gold;
  const kills = state.kills;
  const effect = cast("A203", { point: center });
  const replicas = state.enemies.filter(unit => unit.replica);
  assert.equal(replicas.length, 5);
  assert.deepEqual(replicas.map(unit => unit.x), [original, ...additional.slice(0, 4)].map(unit => unit.x));
  const clone = replicas[0];
  assert.notEqual(clone.id, original.id);
  assert.equal(clone.maxHp, 40_000);
  assert.equal(clone.hp, 40_000);
  assert.equal(clone.armorBuff, undefined);
  assert.equal(clone.overdraftArmor, undefined);
  assert.equal(clone.mana, waves[0].mana);
  assert.deepEqual(clone.abilities, enemyTemplateAbilities(original.unitId));
  assert.deepEqual([clone.previousWaypoint, clone.waypoint], [1, 2]);
  assert.deepEqual([original.maxHp, original.hp, original.overdraftLife, original.overdraftArmor], [80_000, 80_000, 0, 3]);
  assert.equal(containmentPoints(state), capacity);
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, effect + 9_999_999);
  assert.equal(saved.enemies.filter(unit => unit.replica).length, 5);
  advance(saved, effect + 10_000_000);
  assert.equal(saved.enemies.filter(unit => unit.replica).length, 0);
  assert.equal(saved.gold, gold);
  assert.equal(saved.kills, kills);
});

test("A203's replica is independently killed by an actual A201 and awards a normal player kill before natural expiry", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks = { A201: 2, A203: 1 };
  const original = enemy(21, 500, 0, { hp: 1000, maxHp: 1000 });
  state.enemies = [original];
  const point = { x: original.x, y: original.y };
  const replication = cast("A203", { point });
  const clone = state.enemies.find(unit => unit.replica);
  assert.equal(clone.hp, 500);
  const gold = state.gold;
  const kills = state.kills ?? 0;
  advance(state, replication + 100_000);
  const vacuum = cast("A201", { point });
  advance(state, vacuum + 520_000);
  assert.ok(state.enemies.includes(original));
  assert.ok(!state.enemies.includes(clone));
  const kill = state.recentHits.find(hit => hit.targetId === clone.id && hit.deadUnitId === clone.unitId);
  assert.equal(kill.ownerId, tower.id);
  assert.equal(state.kills, kills + 1);
  assert.ok(state.gold > gold);
});
