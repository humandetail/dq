import assert from "node:assert/strict";
import test from "node:test";
import { unitBalance } from "../src/game/m2/combat.ts";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture(rank = 1, templateId = "H004") {
  const state = newMatch("m3-crystal", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero(templateId);
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  hero.ranks.A016 = rank;
  hero.ranks.A017 = rank;
  const tower = { ...map.worker, id: 900, templateId, radius: 72, population: 20, pending: null, qualification: null, hero };
  state.structures = [tower];
  const sample = state.enemies[0];
  const enemy = (id, dx, overrides = {}) => ({ ...sample, id, x: tower.x + dx, y: tower.y, speed: 0, armor: 0, hp: 100_000,
    maxHp: 100_000, abilities: [], ...overrides });
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const cast = skillId => command(skillId, { type: "cast-hero", towerId: tower.id, skillId });
  return { state, enemy, tower, command, cast };
}

test("A016 keeps a fixed center, replays seven ordered waves and separate frost shards without combat random draws", () => {
  const { state, enemy, tower, cast } = fixture(6);
  state.enemies = [enemy(22, 801), enemy(21, 800, { abilities: ["N535"] }), enemy(20, 320, { abilities: ["Amim"] })];
  assert.ok(cast("A016").ok);
  advance(state, 300_002);
  assert.equal(tower.manaMaximum - tower.mana, 240);
  assert.equal(tower.heroSpellReady.A016, 14_300_002);
  const field = state.freezingFields[tower.freezingFieldId];
  assert.equal(new Set(field.carrierIds).size, 3);
  assert.deepEqual(field.point, map.worker);
  tower.x -= 200;
  const before = state.randomState;
  const resumed = JSON.parse(JSON.stringify(state));
  advance(resumed, 1_300_002);
  assert.equal(resumed.battleAnimations.filter(effect => effect.kind === "ice-shard" && effect.unitId === "q015").length, 7);
  assert.equal(resumed.battleAnimations.filter(effect => effect.kind === "ice-shard" && effect.unitId === "q001").length, 6);
  assert.equal(resumed.enemies[1].spellShieldReadyUs, undefined);
  advance(resumed, 7_300_002);
  assert.deepEqual(resumed.recentHits.map(({ atUs, targetId, sourceTemplate, casterId }) => [atUs, targetId, sourceTemplate, casterId]),
    [1, 2, 3, 4, 5, 6, 7].map(wave => [wave * 1_000_000 + 300_002, 21, "q015", field.carrierIds[0]]));
  assert.equal(resumed.randomState, before);
  assert.equal(resumed.structures[0].freezingFieldId, undefined);
  assert.deepEqual(resumed.freezingFields, {});
});

test("interrupting A016 ends later damage pulses but leaves its independent slow through the natural deadline", () => {
  const { state, enemy, tower, cast, command } = fixture();
  state.enemies = [enemy(21, 430)];
  assert.ok(cast("A016").ok);
  advance(state, 1_300_002);
  assert.equal(state.recentHits.length, 1);
  assert.ok(command("stop", { type: "stop-tower-cast", towerId: tower.id }).ok);
  assert.equal(tower.freezingFieldId, undefined);
  tower.attack = { readyUs: Number.MAX_SAFE_INTEGER };
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 1_300_004);
  assert.equal(state.enemies[0].freezingFieldSlow, true);
  advance(state, 7_300_002);
  assert.equal(state.recentHits.length, 1);
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, 7_300_003);
  assert.equal(state.enemies[0].freezingFieldSlow, undefined);
});

test("A017 commits B116 before its own closed-circle pulse and applies no spell shield check", () => {
  const { state, enemy, tower, cast } = fixture(6, "G039");
  state.enemies = [enemy(21, 600, { abilities: ["N535"] }), enemy(22, 601), enemy(23, 10, { abilities: ["Amim"] })];
  assert.ok(cast("A017").ok);
  advance(state, 300_002);
  assert.equal(tower.manaMaximum - tower.mana, 320);
  assert.equal(tower.heroSpellReady.A017, 3_300_002);
  assert.equal(state.enemies[0].iceBindingUntilUs, 1_600_002);
  assert.equal(state.enemies[0].spellShieldReadyUs, undefined);
  assert.ok(Math.abs(state.recentHits[0].amount - 985 * .8 * 1.2 * 1.1) < 1e-8);
  assert.equal(state.recentHits.length, 1);
  advance(state, 1_600_002);
  assert.equal(state.enemies[0].iceBindingUntilUs, undefined);
});

test("A016 Scepter uses the cast rank for T063 without learning A017 and consumes the target shield on the child only", () => {
  for (const [roll, shielded, expectedHits] of [[35, false, 2], [36, false, 1], [35, true, 1]]) {
    const { state, enemy, tower, cast } = fixture(3);
    delete tower.hero.ranks.A017;
    state.inventory = [{ id: 950, itemId: "i310", slot: 0, towerId: tower.id, point: { x: tower.x, y: tower.y }, charges: 0 }];
    state.enemies = [enemy(21, 430, { abilities: shielded ? ["N535"] : [] })];
    assert.ok(cast("A016").ok);
    advance(state, 1_300_001);
    for (let seed = 0; ; seed++) {
      if (Math.floor(((Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32 * 100) + 1 === roll) {
        state.randomState = seed;
        break;
      }
    }
    advance(state, 1_300_002);
    assert.equal(state.recentHits.length, expectedHits);
    if (expectedHits === 2) {
      assert.equal(state.recentHits[1].sourceTemplate, "q001");
      assert.equal(state.recentHits[1].ownerId, tower.id);
      assert.equal(state.enemies[0].stunUntilUs, 2_700_002);
    }
    if (shielded) assert.equal(state.enemies[0].spellShieldReadyUs, 7_300_002);
  }
});

test("A018 applies both native ranks and stronger nearby choices without adding them together", () => {
  for (const [index, amount] of [2, 3, 4, 5, 6, 8].entries()) {
    const { state, tower, cast } = fixture();
    tower.hero.ranks.A018 = index + 1;
    state.structures.push({ ...tower, id: 901, x: tower.x + 1200,
      hero: { ...tower.hero, ranks: { A018: 6 } } });
    assert.ok(cast("A017").ok);
    const base = unitBalance.get(tower.templateId).regenMana + 3;
    assert.equal(tower.manaRegen, base + Math.max(amount * 2, 8));
  }
});

test("S082 retains learned crystal skills, cooldown and the A018 state after G039 restore", () => {
  const { state, tower, command } = fixture(4);
  tower.hero.ranks.A018 = 3;
  tower.heroSpellReady = { A016: 10_000_000 };
  const basicINT = tower.hero.natural.INT;
  assert.ok(command("ice-appearance", { type: "choose-skin", towerId: tower.id, choice: "S082" }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  const ice = restored.structures[0];
  assert.equal(ice.templateId, "G039");
  assert.equal(ice.hero.natural.INT, basicINT + 30);
  assert.deepEqual(ice.hero.ranks, { A016: 4, A017: 4, A018: 3 });
  assert.equal(ice.heroSpellReady.A016, 10_000_000);
  assert.ok(Math.abs(ice.manaRegen - (unitBalance.get("G039").regenMana + (basicINT + 30) * .03 + 8)) < 1e-8);
});
