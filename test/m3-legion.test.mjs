import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch, removeDeadEnemy } from "../src/game/m2/match.ts";

function advance(state, untilUs) {
  state.clock.targetUs = untilUs;
  while (drain(state, 1000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("legion", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const tower = { id: 900, x: -288, y: -128, templateId: "H037", hero: newHero("H037"), pending: null,
    qualification: null, radius: 72, population: 20, autoModes: { A132: false, A133: false, A134: false } };
  tower.hero.level = 20;
  tower.hero.points = 8;
  tower.hero.natural = { STR: 100, AGI: 100, INT: 100 };
  state.structures = [tower];
  const base = state.enemies[0];
  const enemy = (id, distance, unitId = "m001", abilities = []) => ({ ...base, id, unitId, x: tower.x + distance, y: tower.y,
    hp: 100_000, maxHp: 100_000, armor: 0, abilities, speed: 0 });
  const learn = (skillId, caster = tower) => assert.ok(command(state, "learn-" + state.queue.nowUs,
    { type: "learn-skill", towerId: caster.id, skillId }).ok);
  const cast = (skillId, aim, caster = tower) => {
    const now = state.queue.nowUs;
    assert.ok(command(state, "cast-" + now, { type: "cast-hero", towerId: caster.id, skillId, ...aim }).ok);
    advance(state, now + 500_001);
    return state.queue.nowUs;
  };
  return { state, tower, enemy, learn, cast };
}

test("A132 counts living Player 11 heroes as five and applies one synchronous physical snapshot", () => {
  function hit(extra) {
    const { state, tower, enemy, learn, cast } = fixture();
    state.enemies = [enemy(4, 500, "m001", ["Amim"]), enemy(1, 501)];
    if (extra) state.enemies.push(enemy(3, 499, "m005", ["N534", "Avul"]));
    learn("A132");
    cast("A132", { point: tower });
    assert.deepEqual(state.recentHits.map(hit => hit.targetId), [4]);
    assert.ok(Math.abs(state.recentHits[0].amount - physicalDamage(169 * (extra ? 6 : 1) * .5, "hero", 0, false) * 1.06) < 1e-8);
    return state.recentHits[0].amount;
  }
  assert.ok(Math.abs(hit(true) - hit(false) * 6) < 1e-8);
});

test("A133 purges a target before rank comparison and preserves the strongest seven-second buff on save", () => {
  const { state, tower, learn, cast } = fixture();
  const ally = { ...tower, id: 901, x: tower.x - 200, hero: structuredClone(tower.hero), lastCastUs: undefined };
  state.structures.push(ally);
  learn("A133");
  learn("A133");
  learn("A133", ally);
  const startUs = cast("A133", { targetId: ally.id });
  assert.equal(tower.pressTheAttackTarget, ally.id);
  assert.deepEqual(ally.pressTheAttack, { rank: 2, untilUs: startUs + 7_000_000 });
  ally.weakAttackUntilUs = startUs + 6_000_000;
  ally.spellImmunity = { sourceId: 7, carrierUntilUs: startUs + 1000, untilUs: startUs + 6_000_000 };
  cast("A133", { targetId: ally.id }, ally);
  assert.equal(ally.weakAttackUntilUs, undefined);
  assert.ok(ally.spellImmunity);
  assert.deepEqual(ally.pressTheAttack, { rank: 2, untilUs: startUs + 7_000_000 });
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, startUs + 7_000_000);
  assert.equal(restored.structures[1].pressTheAttack, undefined);
});

test("A134 rejects ordinary units, observes a shielded Boss killed by another source, and keeps the capped gain through skin", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  const normal = enemy(1, 200);
  const boss = enemy(2, 300, "m005", ["N534", "N535"]);
  state.enemies = [normal, boss];
  learn("A134");
  assert.equal(command(state, "reject", { type: "cast-hero", towerId: tower.id, skillId: "A134", targetId: normal.id }).ok, false);
  const castUs = cast("A134", { targetId: boss.id });
  assert.ok(boss.spellShieldReadyUs);
  assert.equal(boss.duelLockUntilUs, undefined);
  advance(state, castUs + 100_000);
  assert.ok(command(state, "skin", { type: "choose-skin", towerId: tower.id, choice: "S242" }).ok);
  tower.duelWins = 148;
  const scepter = state.nextId++;
  tower.qualification = "P001";
  state.structures.push({ id: 901, templateId: "n189", x: tower.x - 80, y: tower.y - 150, radius: 72, pending: null });
  state.inventory.push({ id: scepter, itemId: "i310", point: state.worker, slot: 0, charges: 0 });
  assert.ok(command(state, "equip", { type: "transfer-item", itemId: scepter, towerId: tower.id }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  const noScepter = JSON.parse(JSON.stringify(state));
  assert.ok(command(noScepter, "withdraw", { type: "transfer-item", itemId: scepter }).ok);
  noScepter.enemies[1].hp = 0;
  assert.ok(removeDeadEnemy(noScepter, boss.id, 901));
  advance(noScepter, castUs + 500_000);
  assert.equal(noScepter.structures[0].duelWins, 149);
  restored.enemies[1].hp = 0;
  assert.ok(removeDeadEnemy(restored, boss.id, 901));
  advance(restored, castUs + 500_000);
  assert.equal(restored.structures[0].templateId, "G062");
  assert.equal(restored.structures[0].duelWins, 150);
  assert.equal(restored.structures[0].duel, undefined);
});

test("A134 locks only movement for five seconds without charging mana or reducing failed cooldown", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  const boss = enemy(2, 300, "m005", ["N534"]);
  state.enemies = [boss];
  learn("A134");
  const castUs = cast("A134", { targetId: boss.id });
  assert.equal(boss.duelLockUntilUs, castUs + 5_000_000);
  assert.equal(boss.stunUntilUs, undefined);
  assert.equal(tower.mana, tower.manaMaximum);
  advance(state, boss.duelLockUntilUs);
  assert.equal(boss.duelLockUntilUs, undefined);
  assert.equal(tower.duel, undefined);
  assert.equal(tower.duelWins, undefined);
  assert.equal(tower.heroSpellReady.A134, castUs + 110_000_000);
});
