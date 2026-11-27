import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { movementRate } from "../src/game/m2/movement.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("m3-oracle", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H039");
  hero.natural = { STR: 0, AGI: 0, INT: 400 };
  const tower = { ...map.worker, id: 900, templateId: "H039", radius: 72, pending: null, population: 20,
    qualification: "P006", hero, autoModes: { A155: false, A156: false, A157: false } };
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
  const cast = (skillId, targetId, caster = tower) => {
    assert.ok(command(skillId + "-" + state.queue.nowUs, { type: "cast-hero", towerId: caster.id, skillId, targetId }).ok);
    const dueUs = state.queue.nowUs + 500_000;
    advance(state, dueUs);
    return dueUs;
  };
  const scepter = () => {
    state.structures.push({ ...map.worker, x: tower.x + 3000, id: 901, templateId: "n167", pending: null });
    state.inventory.push({ id: 920, itemId: "i310", slot: 3, point: map.worker, charges: 0 });
    assert.ok(command("equip", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  };
  return { state, tower, enemy, command, cast, scepter };
}

test("A155 uses live physical HP formula per target, shares stacks across two legitimate casters, and refreshes exactly five seconds", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A155 = 6;
  const secondTower = { ...tower, id: 902, hero: structuredClone(tower.hero) };
  state.structures.push(secondTower);
  const first = enemy(21, 300);
  const other = enemy(22, 500);
  const shielded = enemy(23, 550, 0, { abilities: ["N535"] });
  state.enemies = [first, other, shielded];
  const start = cast("A155", first.id);
  assert.equal(state.recentHits[0].amount, 8400);
  assert.equal(first.oracleFlame.stacks, 1);
  const original = first.oracleFlame.timerId;
  const hpBefore = first.hp;
  const refreshed = cast("A155", first.id, secondTower);
  assert.equal(first.oracleFlame.stacks, 2);
  assert.ok(Math.abs(state.recentHits[1].amount - 2 * (1000 + .05 * hpBefore) * 1.4) < 1e-8);
  assert.equal(other.oracleFlame, undefined);
  assert.ok(!state.queue.pending.some(row => row.timerId === original));
  advance(state, start + 3_000_000);
  cast("A155", shielded.id);
  assert.equal(shielded.oracleFlame, undefined);
  assert.equal(shielded.hp, 100_000);
  assert.ok(shielded.spellShieldReadyUs);
  advance(state, refreshed + 4_999_999);
  assert.equal(first.oracleFlame.stacks, 2);
  advance(state, refreshed + 5_000_000);
  assert.equal(first.oracleFlame, undefined);
});

test("A156 expires independently, blocks mitigable magic without changing movement or preventing native control, and boosts physical", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A156 = 1;
  const first = enemy(21, 300, 0, { speed: 320 });
  const other = enemy(22, 500, 700);
  state.enemies = [first, other];
  const effect = cast("A156", first.id);
  const firstEdict = first.oracleEdict.timerId;
  assert.equal(movementRate(first), 320);
  tower.heroSpellReady.A156 = 0;
  advance(state, effect + 100_000);
  const nearby = { x: tower.x + 500, y: tower.y };
  Object.assign(other, nearby);
  const second = cast("A156", other.id);
  assert.notEqual(other.oracleEdict.timerId, firstEdict);
  const damageEvents = () => {
    scheduleEvent(state.queue, 1, { type: "calldown-damage", source: tower, sourceTemplate: "H039", point: first, amount: 100 });
    scheduleEvent(state.queue, 1, { type: "calldown-damage", source: tower, sourceTemplate: "q045", point: first, amount: 100 });
    const weapon = { ...weapons.H039[0], homing: false };
    scheduleEvent(state.queue, 1, { type: "weapon-impact", shot: {
      towerId: tower.id, sourceTemplate: "H039", weapon, targetId: first.id, raw: 100,
      point: first, destination: first,
    }, travelUs: 0 });
  };
  damageEvents();
  advance(state, second + 1);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.amount]), [[first.id, 210]]);
  scheduleEvent(state.queue, 1, { type: "shackle-projectile", towerId: tower.id, targetId: first.id, position: first, travelUs: 0 });
  advance(state, second + 2);
  assert.equal(first.stunUntilUs, second + 100_002);
  const checkpoint = JSON.parse(JSON.stringify(state));
  advance(checkpoint, effect + 3_500_000);
  assert.equal(checkpoint.enemies.find(unit => unit.id === first.id).oracleEdict, undefined);
  assert.ok(checkpoint.enemies.find(unit => unit.id === other.id).oracleEdict);
});

test("A157 removes B100 before the next purge's independent shield, then measures net health and the living 425 radius", () => {
  const { state, tower, enemy, command, cast } = fixture();
  tower.hero.ranks.A157 = 1;
  assert.ok(command("skin", { type: "choose-skin", towerId: tower.id, choice: "S252" }).ok);
  const target = enemy(21, 350);
  const edge = enemy(22, 775);
  const outside = enemy(23, 776);
  state.enemies = [target, edge, outside];
  const effect = cast("A157", target.id);
  assert.equal(tower.templateId, "G064");
  assert.equal(tower.heroSpellReady.A157, effect + 20_000_000);
  target.decrepifyUntilUs = effect + 10_000_000;
  target.speedBuff = 1.2;
  target.abilities = ["N535"];
  target.hp -= 10_000;
  advance(state, effect + 1_000_000);
  assert.equal(target.decrepifyUntilUs, undefined);
  assert.equal(target.speedBuff, 1.2);
  assert.equal(target.purge, undefined);
  assert.equal(target.spellShieldReadyUs, effect + 7_000_000);
  target.hp += 3000;
  advance(state, effect + 2_000_000);
  assert.equal(target.speedBuff, undefined);
  assert.equal(target.purge.factor, 0);
  assert.equal(target.oraclePauseUntilUs, effect + 5_000_000);
  advance(state, effect + 2_666_667);
  assert.equal(target.purge.factor, 1 / 3);
  advance(state, effect + 3_000_000);
  assert.equal(tower.oraclePromise, undefined);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.amount]), [[target.id, 7105], [edge.id, 7105]]);
  assert.equal(outside.hp, 100_000);
  assert.equal(target.oraclePauseUntilUs, effect + 6_000_000);
  assert.ok(state.battleAnimations.some(visual => visual.unitId === "HAJT2"));
});

test("A157 preserves a genuinely dead marked receiver until expiry and uses the current tower's live scepter for the 500 radius", () => {
  const { state, tower, enemy, cast, scepter } = fixture();
  tower.hero.ranks = { A155: 1, A157: 1 };
  const target = enemy(21, 750, 0, { hp: 1000, maxHp: 1000 });
  const edge = enemy(22, 500);
  const outside = enemy(23, 501);
  state.enemies = [target, edge, outside];
  const effect = cast("A157", target.id);
  advance(state, effect + 100_000);
  cast("A155", target.id);
  assert.ok(!state.enemies.includes(target));
  assert.equal(tower.oraclePromise.dead, true);
  scepter();
  const saved = JSON.parse(JSON.stringify(state));
  advance(saved, effect + 3_000_000);
  assert.equal(saved.structures[0].oraclePromise, undefined);
  assert.equal(saved.recentHits.at(-1).targetId, edge.id);
  assert.equal(saved.recentHits.at(-1).amount, 3060);
  assert.equal(saved.enemies.find(unit => unit.id === outside.id).hp, 100_000);
});

test("A155 live scepter extends the normal cap while an actual shop boss stays at one stack", () => {
  const { state, tower, enemy, command, cast, scepter } = fixture();
  tower.hero.ranks.A155 = 6;
  const regular = enemy(21, 300, 0, { hp: 1_000_000_000, maxHp: 1_000_000_000 });
  const boss = enemy(22, 600, 0, { unitId: "m531", hp: 10_000_000, maxHp: 10_000_000, abilities: ["N534"] });
  state.enemies = [regular, boss];
  scepter();
  const recast = target => {
    const now = state.queue.nowUs;
    advance(state, now + 100_000);
    // Isolate stack limits from source cooldown and all other actor effects.
    (tower.heroSpellReady ??= {}).A155 = 0;
    cast("A155", target.id);
  };
  for (const stacks of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]) {
    recast(regular);
    assert.equal(regular.oracleFlame.stacks, stacks);
  }
  assert.ok(command("drop", { type: "drop-item", itemId: 920 }).ok);
  recast(regular);
  assert.equal(regular.oracleFlame.stacks, 5);
  recast(boss);
  recast(boss);
  assert.equal(boss.oracleFlame.stacks, 1);
  assert.equal(regular.oracleFlame.stacks, 5);
});

test("A156 uses its distinct 25% physical welfare bonus without creating HP damage", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A156 = 1;
  const target = enemy(21, 350, 0, { unitId: "m998", welfare: true });
  state.enemies = [target];
  const effect = cast("A156", target.id);
  const weapon = { ...weapons.H039[0], homing: false };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot: { towerId: tower.id, sourceTemplate: "H039", weapon,
    targetId: target.id, raw: 100, point: target, destination: target }, travelUs: 0 });
  advance(state, effect + 1);
  assert.ok(Math.abs(state.welfareDamage - 100 * 1.4 * 1.25 * .58) < 1e-8);
  assert.equal(target.hp, 100_000);
});

test("A157 a forced successful recast settles only the source's previous promise before taking the next HP baseline", () => {
  const { state, tower, enemy, cast } = fixture();
  tower.hero.ranks.A157 = 1;
  const first = enemy(21, 600);
  const next = enemy(22, -600, 0, { hp: 82_000 });
  state.enemies = [first, next];
  const effect = cast("A157", first.id);
  const old = tower.oraclePromise.timerId;
  first.hp -= 250;
  advance(state, effect + 100_000);
  tower.heroSpellReady.A157 = 0;
  const recast = cast("A157", next.id);
  assert.deepEqual(state.recentHits.map(hit => [hit.atUs, hit.targetId, hit.amount]), [[recast, first.id, 250]]);
  assert.equal(tower.oraclePromise.initialHp, 82_000);
  assert.ok(!state.queue.pending.some(row => row.timerId === old));
  next.hp += 100;
  advance(state, recast + 3_000_000);
  assert.equal(state.recentHits.length, 1);
  assert.equal(tower.oraclePromise, undefined);
});
