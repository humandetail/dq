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

function fixture(templateId = "H009") {
  const state = newMatch("m3-slardar", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero(templateId);
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId, radius: 72, population: 20, pending: null, qualification: "P001", hero };
  state.structures = [tower];
  const sample = state.enemies[0];
  const enemy = (id, dx, overrides = {}) => ({ ...sample, id, x: tower.x + dx, y: tower.y, speed: 0, armor: 0, hp: 100_000,
    maxHp: 100_000, abilities: [], ...overrides });
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  return { state, enemy, tower, command };
}

function seedFor(roll) {
  for (let seed = 0; ; seed++) {
    const random = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    if (Math.floor(random / 2 ** 32 * 100) + 1 === roll) return seed;
  }
}

function hit(state, tower, enemy, critical = undefined) {
  const shot = { towerId: tower.id, sourceTemplate: tower.templateId, targetId: enemy.id, raw: 100,
    weapon: { ...weapons[tower.templateId][0], attackType: "chaos", homing: false }, point: enemy, destination: enemy,
    artilleryCritical: critical };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
  advance(state, state.queue.nowUs + 1);
  return state.recentHits?.at(-1);
}

test("A031 hits the closed 800 radius and separates the magic control mask from physical damage", () => {
  const { state, enemy, tower, command } = fixture();
  tower.hero.ranks.A031 = 6;
  const normal = enemy(21, 800, { abilities: ["N535"] });
  const immune = enemy(22, 400, { abilities: ["Amim"] });
  const ethereal = enemy(23, 410, { abilities: ["Aeth"] });
  const outside = enemy(24, 801);
  state.enemies = [outside, ethereal, immune, normal];
  assert.ok(command("crush", { type: "cast-hero", towerId: tower.id, skillId: "A031" }).ok);
  advance(state, 500_001);
  assert.equal(state.recentHits?.length ?? 0, 0);
  advance(state, 500_002);
  assert.equal(tower.manaMaximum - tower.mana, 180);
  assert.equal(tower.heroSpellReady.A031, 4_500_002);
  assert.deepEqual(state.recentHits.map(({ targetId, amount }) => [targetId, amount]), [[21, 1764], [22, 1764]]);
  assert.equal(normal.stunUntilUs, 2_500_002);
  assert.equal(immune.stunUntilUs, undefined);
  assert.equal(normal.spellShieldReadyUs, undefined);
  assert.equal(ethereal.stunUntilUs, 2_500_002);
});

test("A032 adds flat damage after its ordinary critical roll and applies no shield or stun to mechanical targets", () => {
  for (const [index, bonus] of [220, 460, 700, 1040, 1300, 1600].entries()) {
    const { state, enemy, tower } = fixture("G044");
    tower.hero.ranks.A032 = index + 1;
    const target = enemy(21, 0, { abilities: ["Amec", "Amim", "N535"] });
    state.enemies = [target];
    state.randomState = seedFor(10);
    assert.equal(hit(state, tower, target, { multiplier: 3, sureHit: false, fixedBonus: 0 }).amount, 300 + bonus);
    assert.equal(target.stunUntilUs, undefined);
    assert.equal(target.spellShieldReadyUs, undefined);
    target.abilities = ["Arsk", "N535"];
    state.randomState = seedFor(11);
    assert.equal(hit(state, tower, target).amount, 100);
    assert.equal(target.stunUntilUs, undefined);
    state.randomState = seedFor(10);
    assert.equal(hit(state, tower, target).amount, 100 + bonus);
    assert.equal(target.stunUntilUs, state.queue.nowUs + 400_000);
  }
});

test("A033 and item B008 use the strongest slot while I269 contributes a separate 50 armor reduction", () => {
  const { state, enemy, tower } = fixture();
  const source = { ...tower, id: 901, x: tower.x + 900, hero: { ...tower.hero, ranks: { A033: 5 } }, slardarScepterAura: true };
  state.structures.push(source);
  state.inventory = [{ id: 915, itemId: "i269", towerId: source.id, slot: 0, point: source, charges: 0 }];
  const target = enemy(21, 0, { armor: 300 });
  state.enemies = [target];
  assert.ok(Math.abs(hit(state, tower, target).amount - physicalDamage(100, "chaos", 160, false)) < 1e-8);
  source.hero.ranks.A033 = 6;
  const restored = JSON.parse(JSON.stringify(state));
  assert.ok(Math.abs(hit(restored, restored.structures[0], restored.enemies[0]).amount - physicalDamage(100, "chaos", 150, false)) < 1e-8);
  source.x++;
  assert.ok(Math.abs(hit(state, tower, target).amount - physicalDamage(100, "chaos", 300, false)) < 1e-8);
});

test("I269 grant and revocation use the actual A033 rank at Scepter transfer", () => {
  const { state, enemy, tower, command } = fixture();
  state.structures.push({ ...tower, id: 901, templateId: "n189", hero: undefined, qualification: null });
  state.enemies = [enemy(21, 500)];
  state.inventory = [{ id: 920, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command("first", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  assert.ok(command("learn", { type: "learn-skill", towerId: tower.id, skillId: "A033" }).ok);
  assert.equal(tower.slardarScepterAura, undefined);
  assert.ok(command("unwear", { type: "transfer-item", itemId: 920 }).ok);
  assert.ok(command("re-equip", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  assert.equal(tower.slardarScepterAura, true);
  delete tower.hero.ranks.A033;
  assert.ok(command("drop-without-rank", { type: "transfer-item", itemId: 920 }).ok);
  const saved = JSON.parse(JSON.stringify(state));
  assert.equal(saved.structures[0].slardarScepterAura, true);
  tower.hero.ranks.A033 = 1;
  assert.ok(command("give", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  assert.ok(command("drop-with-rank", { type: "transfer-item", itemId: 920 }).ok);
  assert.equal(tower.slardarScepterAura, undefined);
});

test("S202 changes H009 to G044 without resetting its learned armor aura or actual auxiliary grant", () => {
  const { state, tower, enemy, command } = fixture();
  tower.hero.ranks = { A031: 2, A032: 3, A033: 6 };
  tower.slardarScepterAura = true;
  const target = enemy(21, 800, { armor: 300 });
  state.enemies = [target];
  assert.ok(command("sea-appearance", { type: "choose-skin", towerId: tower.id, choice: "S202" }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  const hero = restored.structures[0];
  assert.equal(hero.templateId, "G044");
  assert.deepEqual(hero.hero.ranks, { A031: 2, A032: 3, A033: 6 });
  assert.equal(hero.slardarScepterAura, true);
  const random = seedFor(11);
  restored.randomState = random;
  const expected = physicalDamage(100, "chaos", 150, false) * (1 + .0006 * hero.hero.natural.STR);
  assert.ok(Math.abs(hit(restored, hero, restored.enemies[0]).amount - expected) < 1e-8);
});
