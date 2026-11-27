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
  const state = newMatch("m3-antimage", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H040");
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H040", radius: 72, population: 20, pending: null,
    qualification: "P001", hero };
  state.structures = [tower];
  const sample = state.enemies[0];
  const enemy = (id, dx, dy = 0, overrides = {}) => ({ ...sample, id, x: tower.x + dx, y: tower.y + dy, speed: 0, armor: 0,
    hp: 100_000, maxHp: 100_000, mana: 1000, manaMax: 1000, abilities: [], ...overrides });
  state.enemies = [enemy(21, 400)];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const giveScepter = () => {
    state.structures.push({ ...map.worker, x: tower.x + 3000, id: 909, templateId: "n189", pending: null });
    state.inventory.push({ id: 920, itemId: "i310", slot: 0, point: map.worker, charges: 0 });
    assert.ok(command("scepter", { type: "transfer-item", itemId: 920, towerId: tower.id }).ok);
  };
  return { state, tower, enemy, command, giveScepter };
}

function hit(state, tower, target, options = {}) {
  scheduleEvent(state.queue, 1, { type: "weapon-impact", travelUs: 0,
    shot: { towerId: tower.id, sourceTemplate: tower.templateId, targetId: target.id, raw: 100,
      weapon: { ...weapons[tower.templateId][0], attackType: "chaos", homing: false },
      point: { x: target.x, y: target.y }, destination: { x: target.x, y: target.y },
      artilleryCritical: { multiplier: 1, sureHit: true, fixedBonus: 0 }, ...options } });
  advance(state, state.queue.nowUs + 1);
}

test("A158 independently caps mana drain and excludes the real Scepter bonus from A159", () => {
  const { state, tower, giveScepter } = fixture();
  const target = state.enemies[0];
  tower.hero.ranks = { A158: 6, A159: 6 };
  giveScepter();
  hit(state, tower, target);
  assert.equal(target.mana, 810);
  assert.equal(tower.hero.natural.AGI, 72);
  assert.ok(Math.abs(state.recentHits.at(-1).amount - 100 * (1 + 40 * .0006)) < 1e-8);
  target.mana = 33.5;
  hit(state, tower, target);
  assert.equal(target.mana, 0);
  assert.equal(tower.hero.natural.AGI, 85);
  assert.equal(state.battleAnimations.at(-1).unitId, "SpellBreakerAttack");
});

test("A159 scalar grants expire independently after changing skin, losing ranks and reading a save", () => {
  const { state, tower, command } = fixture();
  const target = state.enemies[0];
  tower.hero.ranks = { A158: 1, A159: 1 };
  hit(state, tower, target);
  const first = state.queue.nowUs + 4e6;
  advance(state, state.queue.nowUs + 1e6);
  tower.hero.ranks.A159 = 6;
  hit(state, tower, target);
  const second = state.queue.nowUs + 4e6;
  assert.equal(tower.hero.natural.AGI, 15);
  assert.ok(command("skin", { type: "choose-skin", towerId: tower.id, choice: "S282" }).ok);
  assert.equal(tower.templateId, "G068");
  delete tower.hero.ranks.A159;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, first);
  assert.equal(restored.structures[0].hero.natural.AGI, tower.hero.natural.AGI - 3);
  advance(restored, second);
  assert.equal(restored.structures[0].hero.natural.AGI, tower.hero.natural.AGI - 15);
});

test("A159 halves the real illusion grant and leaves the source's full mana drain", () => {
  const { state, tower, command } = fixture();
  const target = state.enemies[0];
  tower.hero.ranks = { A158: 6, A159: 6 };
  state.inventory.push({ id: 920, itemId: "i274", towerId: tower.id, slot: 0, point: map.worker, charges: 0 });
  assert.ok(command("image", { type: "cast-equipment", towerId: tower.id, itemId: 920 }).ok);
  const image = state.summons.at(-1);
  assert.equal(image.summon.manaBreak, true);
  assert.equal(image.summon.manaCounter, true);
  hit(state, tower, target, { raw: 30, summon: { id: image.id, banner: false, illusion: true, output: .3 } });
  assert.equal(target.mana, 820);
  assert.equal(tower.hero.natural.AGI, 36);
});

test("A160 refills first and resolves the closed range independently of its later N535-blocked projectile", () => {
  const { state, tower, enemy, command } = fixture();
  tower.hero.ranks.A160 = 1;
  const primary = enemy(21, 800, 0, { mana: 400, abilities: ["N535"] });
  const boundary = enemy(22, 800, 300, { abilities: ["N535"] });
  const outside = enemy(23, 800, 301);
  state.enemies = [outside, boundary, primary];
  assert.ok(command("void", { type: "cast-hero", towerId: tower.id, skillId: "A160", targetId: primary.id }).ok);
  advance(state, 300_002);
  assert.equal(primary.mana, 1000);
  assert.equal(primary.spellShieldReadyUs, undefined);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, Math.round(hit.amount)]), [[21, 528], [22, 528]]);
  assert.equal(outside.hp, 100_000);
  assert.equal(tower.mana, tower.manaMaximum - 50);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, 340_002);
  const checked = restored.enemies.find(unit => unit.id === primary.id);
  assert.equal(checked.spellShieldReadyUs, 6_340_002);
  assert.equal(checked.stunUntilUs, undefined);
});

test("A160 manually controls zero-deficit targets, and real Scepter doubles only the scripted damage", () => {
  const { state, tower, command, giveScepter } = fixture();
  const target = state.enemies[0];
  tower.hero.ranks.A160 = 6;
  giveScepter();
  assert.ok(command("full", { type: "cast-hero", towerId: tower.id, skillId: "A160", targetId: target.id }).ok);
  advance(state, 320_003);
  assert.equal(state.recentHits, undefined);
  assert.equal(target.stunUntilUs, 1_320_003);
  advance(state, tower.heroSpellReady.A160);
  target.mana = 800;
  assert.ok(command("deficit", { type: "cast-hero", towerId: tower.id, skillId: "A160", targetId: target.id }).ok);
  advance(state, state.queue.nowUs + 300_000);
  assert.equal(target.mana, 1000);
  assert.ok(Math.abs(state.recentHits.at(-1).amount - 400 * .8 * (1 + 140 * .001)) < 1e-8);
});

test("A160 automatic selection is only the current attack target strictly below half mana", () => {
  for (const [mana, casts] of [[500, false], [501, false], [499, true], [0, false]]) {
    const { state, tower, enemy } = fixture();
    tower.hero.ranks.A160 = 1;
    const primary = enemy(21, 400, 0, { mana, manaMax: mana ? 1000 : 0 });
    const other = enemy(22, 450, 0, { mana: 200 });
    state.enemies = [primary, other];
    scheduleEvent(state.queue, 1, { type: "movement" });
    advance(state, 2);
    const cast = state.queue.pending.find(row => row.payload.type === "hero-spell" && row.payload.skillId === "A160");
    assert.equal(!!cast, casts);
    if (cast) assert.equal(cast.payload.targetId, primary.id);
  }
});
