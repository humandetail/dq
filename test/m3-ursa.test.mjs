import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage, weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("m3-ursa", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H006");
  hero.natural = { STR: 50, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H006", radius: 72, population: 20, pending: null,
    qualification: "P001", hero, autoModes: { A024: false } };
  state.structures = [tower];
  const sample = state.enemies[0];
  const enemy = (id, distance, extra = {}) => ({ ...sample, id, x: tower.x + distance, y: tower.y, armor: 0,
    speed: 0, hp: 100_000, maxHp: 100_000, abilities: [], ...extra });
  const target = enemy(21, 400);
  state.enemies = [target];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  return { state, tower, enemy, target, command };
}

function nextRandom(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function seedFor(roll) {
  for (let seed = 0; ; seed++) {
    if (Math.floor(nextRandom(seed) / 2 ** 32 * 100) + 1 === roll) return seed;
  }
}

function beginAttack(state, tower, roll) {
  if (roll !== undefined) state.randomState = seedFor(roll);
  delete tower.attack;
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, state.queue.nowUs + 1);
  assert.equal(tower.attack?.winding, true);
}

function directHit(state, tower, target) {
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0,
    shot: { towerId: tower.id, sourceTemplate: tower.templateId, targetId: target.id, raw: 100,
      weapon: { ...weapons[tower.templateId][0], homing: false }, point: target, destination: target,
      artilleryCritical: { multiplier: 1, sureHit: true, fixedBonus: 0 } } });
  advance(state, state.queue.nowUs + 1);
}

test("A022 rolls exact level thresholds and keeps T007's shorter lifetime independent", () => {
  for (const [index, chance] of [6, 8, 10, 12, 14, 17].entries()) {
    const { state, tower } = fixture();
    tower.hero.ranks.A022 = index + 1;
    beginAttack(state, tower, chance + 1);
    assert.equal(tower.overpower, undefined);
    beginAttack(state, tower, chance);
    const now = state.queue.nowUs;
    assert.deepEqual(tower.overpower, { rank: index + 1, untilUs: now + [2, 2, 3, 3, 4, 4][index] * 1e6,
      sourceId: tower.overpower.sourceId });
    assert.equal(tower.attack.timing.rawRate, 6);
    assert.equal(tower.attack.timing.windup.dueUs, now + 86_600);
    const carrier = state.queue.pending.find(row => row.payload.type === "ursa-carrier-expire");
    assert.equal(carrier.payload.sourceId, tower.overpower.sourceId);
    assert.equal(carrier.dueUs, now + 500_000);
    state.queue.pending = state.queue.pending.filter(row => ["ursa-carrier-expire", "weapon-rate-end"].includes(row.payload.type));
    advance(state, carrier.dueUs);
    assert.ok(tower.overpower);
    advance(state, tower.overpower.untilUs);
    assert.equal(tower.overpower, undefined);
  }
});

test("A022 consumes the closed-gate roll, refreshes with actual Scepter and keeps a rejected carrier", () => {
  const { state, tower, command } = fixture();
  tower.hero.ranks.A022 = 6;
  beginAttack(state, tower, 1);
  const first = tower.overpower;
  beginAttack(state, tower, 1);
  assert.equal(tower.overpower, first);
  assert.equal(state.randomState, nextRandom(seedFor(1)));
  state.structures.push({ ...map.worker, x: tower.x + 3000, id: 909, templateId: "n189", pending: null });
  state.inventory = [{ id: 910, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command("scepter", { type: "transfer-item", itemId: 910, towerId: tower.id }).ok);
  tower.hero.ranks.A022 = 1;
  beginAttack(state, tower, 6);
  assert.equal(tower.overpower.untilUs, state.queue.nowUs + 2e6);
  assert.ok(tower.overpower.untilUs < first.untilUs);
  const second = tower.overpower;
  tower.spellImmunity = { sourceId: 912, carrierUntilUs: 1e6, untilUs: 5e6 };
  beginAttack(state, tower, 6);
  assert.equal(tower.overpower, second);
  assert.equal(state.queue.pending.filter(row => row.payload.type === "ursa-carrier-expire").length, 3);
});

test("A023 accumulates the gain from each recorded release rank and reuses one timer at the cap", () => {
  const { state, tower, command, target } = fixture();
  tower.hero.ranks.A023 = 1;
  beginAttack(state, tower);
  const first = tower.furySwipes;
  assert.deepEqual([first.count, first.amount], [1, 3]);
  assert.ok(command("skin", { type: "choose-skin", towerId: tower.id, choice: "S062" }).ok);
  assert.equal(tower.templateId, "G037");
  tower.hero.ranks.A023 = 6;
  beginAttack(state, tower);
  assert.deepEqual([tower.furySwipes.count, tower.furySwipes.amount], [2, 11]);
  assert.equal(state.queue.pending.some(row => row.timerId === first.timerId), false);
  tower.furySwipes.count = 300;
  beginAttack(state, tower);
  assert.deepEqual([tower.furySwipes.count, tower.furySwipes.amount], [300, 11]);
  tower.wispLinked = true;
  state.structures.push({ ...tower, templateId: "H033", pending: { upgradeTo: "H033" }, id: 910,
    wispLink: { targetId: tower.id, shared: true } });
  beginAttack(state, tower);
  assert.deepEqual([tower.furySwipes.count, tower.furySwipes.amount], [301, 19]);
  target.x += 2000;
  const restored = JSON.parse(JSON.stringify(state));
  restored.queue.pending = restored.queue.pending.filter(row => row.payload.type === "fury-swipes-end");
  advance(restored, tower.furySwipes.untilUs);
  assert.equal(restored.structures[0].furySwipes, undefined);
});

test("a real Mirror Image copies A022's rank but leaves A023 growth and B005 behind", () => {
  const { state, tower, command } = fixture();
  tower.hero.ranks = { A022: 6, A023: 6, A024: 1 };
  beginAttack(state, tower, 17);
  const fury = tower.furySwipes;
  assert.ok(command("enrage", { type: "cast-hero", towerId: tower.id, skillId: "A024" }).ok);
  state.inventory = [{ id: 910, itemId: "i274", towerId: tower.id, slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command("mirror", { type: "cast-equipment", towerId: tower.id, itemId: 910 }).ok);
  const image = state.summons.at(-1);
  assert.equal(image.summon.overpowerRank, 6);
  assert.equal(image.overpower, undefined);
  assert.equal(image.enrageUntilUs, undefined);
  assert.equal(image.furySwipes, undefined);
  assert.equal(tower.furySwipes, fury);
  beginAttack(state, image, 17);
  assert.equal(image.overpower.rank, 6);
  assert.equal(image.furySwipes, undefined);
});

test("A024 is instant and reads this attack's current rank, life and armor in a separate packet", () => {
  const { state, tower, command, target } = fixture();
  tower.hero.ranks.A024 = 1;
  target.armor = 30;
  assert.ok(command("enrage", { type: "cast-hero", towerId: tower.id, skillId: "A024" }).ok);
  const now = state.queue.nowUs;
  assert.equal(tower.lastCastUs, now);
  assert.equal(tower.enrageUntilUs, now + 8e6);
  assert.equal(tower.heroSpellReady.A024, now + 15e6);
  assert.equal(tower.mana, tower.manaMaximum - 10);
  tower.hero.ranks.A024 = 6;
  tower.lifeOffset = 750;
  directHit(state, tower, target);
  const [enrage, weapon] = state.recentHits;
  const expected = physicalDamage(tower.life.maximum * .2, "hero", target.armor, false) * 1.03;
  assert.ok(Math.abs(enrage.amount - expected) < 1e-8);
  assert.ok(weapon.amount < enrage.amount);
  assert.equal(state.battleAnimations.at(-1).unitId, "Disenchant");
  advance(state, tower.enrageUntilUs);
  directHit(state, tower, target);
  assert.equal(state.recentHits.length, 3);
});

test("A024 true Scepter casts N015 from the paid q001 and preserves N535", () => {
  const { state, tower, command, enemy } = fixture();
  tower.hero.ranks.A024 = 1;
  state.structures.push({ ...map.worker, x: tower.x + 3000, id: 909, templateId: "n189", pending: null });
  state.inventory = [{ id: 910, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command("scepter", { type: "transfer-item", itemId: 910, towerId: tower.id }).ok);
  const normal = enemy(21, 500, { abilities: ["N535"] });
  const hero = enemy(22, 400, { abilities: ["Arsk"] });
  const immune = enemy(23, 450, { abilities: ["ACmi"] });
  const distant = enemy(24, 501);
  state.enemies = [distant, immune, hero, normal];
  assert.ok(command("enrage", { type: "cast-hero", towerId: tower.id, skillId: "A024" }).ok);
  const carrier = state.queue.pending.find(row => row.payload.type === "ursa-carrier-expire");
  assert.equal(carrier.dueUs, state.queue.nowUs + 2e6);
  assert.equal(carrier.payload.skillId, "N015");
  assert.equal(carrier.payload.mana, 950);
  assert.equal(carrier.payload.rank, 1);
  assert.equal(tower.mana, tower.manaMaximum - 10);
  assert.deepEqual(state.recentHits.map(({ targetId, casterId, sourceTemplate }) => [targetId, casterId, sourceTemplate]),
    [[21, carrier.payload.sourceId, "q001"], [22, carrier.payload.sourceId, "q001"]]);
  assert.deepEqual(normal.clapSlow, { untilUs: state.queue.nowUs + 1_200_000, factor: .7, attackPenalty: .25 });
  assert.equal(hero.clapSlow.untilUs, state.queue.nowUs + 400_000);
  assert.equal(normal.spellShieldReadyUs, undefined);
});
