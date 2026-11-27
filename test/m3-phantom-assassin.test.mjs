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
  const state = newMatch("m3-phantom-assassin", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H007");
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H007", radius: 72, population: 20, pending: null,
    qualification: "P001", hero };
  state.structures = [tower];
  const target = { ...state.enemies[0], id: 21, x: tower.x + 400, y: tower.y, armor: 0,
    speed: 0, hp: 20_000_000, maxHp: 20_000_000, abilities: [] };
  state.enemies = [target];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  return { state, tower, target, command };
}

const nextRandom = seed => (Math.imul(seed, 1664525) + 1013904223) >>> 0;
const percent = seed => 1 + Math.floor(seed / 2 ** 32 * 100);
const coupRoll = seed => Math.floor(seed / 2 ** 32 * 1001);

function seedFor(condition) {
  for (let seed = 0; ; seed++) {
    const first = nextRandom(seed);
    const second = nextRandom(first);
    const third = nextRandom(second);
    if (condition(first, second, third, nextRandom(third))) return seed;
  }
}

function hit(state, tower, target, options = {}) {
  const shot = { towerId: tower.id, sourceTemplate: tower.templateId, targetId: target.id, raw: 100,
    weapon: { ...weapons[tower.templateId][0], attackType: "chaos", homing: false },
    point: { x: target.x, y: target.y }, destination: { x: target.x, y: target.y }, ...options };
  scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
  advance(state, state.queue.nowUs + 1);
}

test("A025 learns one real T008 auxiliary, keeps it after the parent rank is removed and preserves it on S152", () => {
  const { state, tower, command } = fixture();
  assert.ok(command("train", { type: "learn-skill", towerId: tower.id, skillId: "A025" }).ok);
  assert.equal(tower.attackSpeedTrainingRank, 1);
  delete tower.hero.ranks.A025;
  scheduleEvent(state.queue, 1, { type: "movement" });
  advance(state, state.queue.nowUs + 1);
  assert.ok(Math.abs(tower.attack.timing.rawRate - 1.2) < 1e-12);
  assert.ok(command("additional-form", { type: "choose-skin", towerId: tower.id, choice: "S152" }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(restored.structures[0].templateId, "G052");
  assert.equal(restored.structures[0].attackSpeedTrainingRank, 1);
  assert.equal(restored.structures[0].hero.ranks.A025, undefined);
});

test("A026 restores the matching positive armor fraction on the amount and leaves the target's armor intact", () => {
  const { state, tower, target } = fixture();
  target.armor = 100;
  for (let rank = 1; rank <= 6; rank++) {
    tower.hero.ranks.A026 = rank;
    hit(state, tower, target);
    const expected = physicalDamage(100, "chaos", 100 * (1 - rank * .05), false);
    assert.ok(Math.abs(state.recentHits.at(-1).amount - expected) < 1e-8);
    assert.equal(target.armor, 100);
  }
  target.armor = -10;
  hit(state, tower, target);
  assert.ok(Math.abs(state.recentHits.at(-1).amount - physicalDamage(100, "chaos", -10, false)) < 1e-8);
});

test("A027 six native multipliers use 10% exactly and remain independent from the later q025 roll", () => {
  const { state, tower, target } = fixture();
  for (const [index, multiple] of [10, 14, 18, 22, 25, 30].entries()) {
    tower.hero.ranks.A027 = index + 1;
    for (const [chance, expected] of [[10, multiple], [11, 1]]) {
      state.randomState = seedFor((first, _fists, _soul, fourth) => percent(first) === chance && coupRoll(fourth) > 1);
      hit(state, tower, target, { coupCritRank: tower.hero.ranks.A027 });
      assert.equal(state.recentHits.at(-1).amount, expected * 100);
    }
    assert.equal(state.queue.pending.some(row => row.payload.type === "coup-carrier-expire"), false);
  }
});

test("A027 crit cannot bypass evasion while I215 can, and adds I185's fixed +1 after the highest multiplier", () => {
  const { state, tower, target } = fixture();
  tower.hero.ranks.A027 = 6;
  target.evasionUntilUs = 1_000_000;
  const chance = seedFor((first, second, third) => percent(first) <= 10 && percent(second) <= 25 && percent(third) <= 70);
  state.randomState = chance;
  hit(state, tower, target, { coupCritRank: 6 });
  assert.equal(state.recentHits, undefined);
  assert.equal(state.randomState, nextRandom(chance));
  state.randomState = chance;
  hit(state, tower, target, { coupCritRank: 6, attackEquipment: ["i215", "i141"] });
  assert.equal(state.recentHits.at(-1).amount, 3001);
});

test("A027 q025 succeeds without a crit, retains its timed source and renders the active form's effects", () => {
  const { state, tower, target, command } = fixture();
  assert.ok(command("additional-form", { type: "choose-skin", towerId: tower.id, choice: "S152" }).ok);
  tower.hero.natural = { STR: -30, AGI: -30, INT: 100 };
  tower.hero.ranks.A027 = 6;
  const chance = seedFor((first, _fists, _soul, fourth) => percent(first) > 10 && coupRoll(fourth) === 1);
  state.randomState = chance;
  hit(state, tower, target, { coupCritRank: 6 });
  const [child, weapon] = state.recentHits;
  const carrier = state.queue.pending.find(row => row.payload.type === "coup-carrier-expire");
  assert.equal(carrier.dueUs, state.queue.nowUs + 500_000);
  assert.deepEqual([child.sourceTemplate, child.casterId, child.ownerId], ["q025", carrier.payload.sourceId, tower.id]);
  assert.ok(child.amount > 9_000_000);
  assert.ok(weapon.amount < 110);
  assert.deepEqual(state.battleAnimations.map(effect => effect.unitId),
    ["PhantomAssassin_C1", "PhantomAssassin_C2", "PhantomAssassin_C3A", "AZ_PA_C"]);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, carrier.dueUs);
  assert.equal(restored.queue.pending.some(row => row.payload.type === "coup-carrier-expire"), false);
});

test("q025 consumes first N521, then bypasses only the already present grave fallback", () => {
  const { state, tower, target } = fixture();
  tower.hero.ranks.A027 = 6;
  target.hp = 1000;
  target.abilities = ["N521"];
  const chance = seedFor((first, _fists, _soul, fourth) => percent(first) > 10 && coupRoll(fourth) <= 1);
  state.randomState = chance;
  hit(state, tower, target, { coupCritRank: 6 });
  assert.equal(target.hp, 900);
  assert.ok(target.graveUntilUs > state.queue.nowUs);
  assert.equal(target.abilities.includes("N521"), false);
  state.randomState = chance;
  hit(state, tower, target, { coupCritRank: 6 });
  assert.equal(target.hp, 0);
  assert.equal(state.recentHits.at(-1).sourceTemplate, "q025");
});

test("A027 still consumes the 0–1000 roll on the protected gold target", () => {
  const { state, tower, target } = fixture();
  tower.hero.ranks.A027 = 6;
  target.unitId = "m998";
  target.welfare = true;
  const seed = seedFor((first, _fists, _soul, fourth) => percent(first) <= 10 && coupRoll(fourth) === 0);
  tower.hero.ranks.A027 = 5;
  state.randomState = seed;
  hit(state, tower, target, { coupCritRank: 5 });
  const baseline = state.randomState;
  tower.hero.ranks.A027 = 6;
  state.randomState = seed;
  hit(state, tower, target, { coupCritRank: 6 });
  assert.equal(state.randomState, nextRandom(baseline));
  assert.equal(state.queue.pending.some(row => row.payload.type === "coup-carrier-expire"), false);
});

test("a real i274 illusion keeps its A027 snapshot and independent kill threshold after the source learns", () => {
  const { state, tower, target, command } = fixture();
  tower.hero.ranks.A027 = 5;
  state.inventory = [{ id: 910, itemId: "i274", towerId: tower.id, slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command("image", { type: "cast-equipment", towerId: tower.id, itemId: 910 }).ok);
  const image = state.summons.at(-1);
  tower.hero.ranks.A027 = 6;
  const shot = { raw: 30, summon: { id: image.id, banner: false, illusion: true, output: .3, criticalRank: image.summon.criticalRank } };
  state.randomState = seedFor(first => percent(first) <= 10);
  hit(state, tower, target, shot);
  assert.ok(Math.abs(state.recentHits.at(-1).amount - 750 * (1 + 12 * .0006)) < 1e-8);
  assert.equal(image.summon.criticalRank, 5);
  assert.equal(state.queue.pending.some(row => row.payload.type === "coup-carrier-expire"), false);
  advance(state, tower.mirrorReadyUs);
  assert.ok(command("new-image", { type: "cast-equipment", towerId: tower.id, itemId: 910 }).ok);
  const newer = state.summons.at(-1);
  shot.summon = { ...shot.summon, id: newer.id, criticalRank: newer.summon.criticalRank };
  assert.equal(newer.summon.criticalRank, 6);
  state.randomState = seedFor((first, _fists, _soul, fourth) => percent(first) > 10 && coupRoll(fourth) === 1);
  hit(state, tower, target, shot);
  assert.equal(state.queue.pending.some(row => row.payload.type === "coup-carrier-expire"), false);
  state.randomState = seedFor((first, _fists, _soul, fourth) => percent(first) > 10 && coupRoll(fourth) === 0);
  hit(state, tower, target, shot);
  assert.equal(state.recentHits.find(entry => entry.sourceTemplate === "q025").amount, 10_000_000 * (1 + 28 * .0005));
});
