import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage, weapons } from "../src/game/m2/combat.ts";
import { lycanForms } from "../src/game/m2/content.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 1000) === "pending") {}
}

function issue(state, action) {
  const id = `lycan-${state.queue.nowUs}`;
  assert.ok(enqueue(state, { id, action, matchId: state.matchId }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("lycan", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const hero = newHero("H043");
  hero.level = 30;
  hero.points = 20;
  const tower = { id: 900, templateId: "H043", hero, x: -288, y: -128, radius: 72, pending: null,
    qualification: "P001", autoModes: { A167: false, A169: false } };
  state.structures = [tower, { id: 901, templateId: "n189", x: -520, y: -128, radius: 72, pending: null }];
  const base = state.enemies[0];
  state.enemies = [];
  const enemy = { ...base, id: 401, x: -80, y: -128, hp: 100_000, maxHp: 100_000, speed: 0, armor: 0 };
  const learn = (skillId, count = 1) => {
    for (let i = 0; i < count; i++) assert.ok(issue(state, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  };
  const cast = skillId => {
    assert.ok(issue(state, { type: "cast-hero", towerId: tower.id, skillId }).ok);
    return state.queue.nowUs;
  };
  return { state, tower, enemy, learn, cast };
}

test("A169 uses all six native weapons and one life rebase, then returns the original hero after exactly 18 seconds", () => {
  for (const [index, template] of lycanForms.entries()) {
    const { state, tower, learn, cast } = fixture();
    learn("A169", index + 1);
    const now = cast("A169");
    assert.equal(tower.templateId, template);
    assert.equal(tower.manaMaximum - tower.mana, 20 + 10 * index);
    assert.equal(tower.heroSpellReady.A169, now + (40 - 3 * index) * 1_000_000);
    assert.equal(weapons[template][0].base, 529 + 100 * index);
    assert.equal(weapons[template][0].buffer, 2000);
    assert.equal(weapons[template][0].cooldown, index === 5 ? 1.15 : 1.1);
    const restored = JSON.parse(JSON.stringify(state));
    advance(restored, now + 17_999_999);
    const [returned] = restored.structures;
    assert.equal(returned.templateId, template);
    advance(restored, now + 18_000_000);
    assert.equal(returned.templateId, "H043");
    assert.equal(returned.life.maximum, tower.life.maximum - 245);
    assert.equal(returned.lycanShape, undefined);
    assert.deepEqual(returned.hero, tower.hero);
  }
});

test("A167 snapshots only its true summoner's A168, then replaces that owner's old group and preserves rank on reload", () => {
  const { state, tower, learn, cast } = fixture();
  learn("A167");
  learn("A168");
  learn("A169");
  const first = cast("A167");
  advance(state, first + 399_999);
  assert.equal(state.summons?.length ?? 0, 0);
  advance(state, first + 400_000);
  const old = state.summons.map(wolf => wolf.id);
  assert.deepEqual(state.summons.map(wolf => [wolf.templateId, wolf.life.maximum, wolf.summon.wildHowlRank]),
    Array(2).fill(["b150", 200, 1]));
  advance(state, first + 600_000);
  learn("A168", 5);
  learn("A167", 5);
  assert.ok(state.summons.every(wolf => wolf.summon.wildHowlRank === 1));
  cast("A169");
  tower.heroSpellReady.A167 = state.queue.nowUs;
  const second = cast("A167");
  advance(state, second + 299_999);
  assert.deepEqual(state.summons.map(wolf => wolf.id), old);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, second + 300_000);
  assert.equal(restored.summons.length, 3);
  assert.ok(restored.summons.every(wolf => !old.includes(wolf.id) && wolf.templateId === "b155" && wolf.summon.wildHowlRank === 6));
  advance(restored, second + 25_299_999);
  assert.equal(restored.summons.length, 3);
  advance(restored, second + 25_300_000);
  assert.equal(restored.summons.length, 0);
});

test("A169 ENDCAST clamps both cooldown reductions and a released ranked weapon preserves its crit after return", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  learn("A169", 6);
  tower.hero.divineForm = { id: "P222", stars: 10 };
  const itemId = state.nextId++;
  state.inventory.push({ id: itemId, itemId: "i327", slot: 0, point: state.worker, charges: 0 });
  assert.ok(issue(state, { type: "transfer-item", itemId, towerId: tower.id }).ok);
  const now = cast("A169");
  assert.equal(tower.heroSpellReady.A169, now + 19_000_000);
  advance(state, now + 18_000_000);
  assert.equal(tower.templateId, "H043");
  state.enemies = [enemy];
  for (const sourceTemplate of ["H043", "E022", "b155"]) {
    state.randomState = 0;
    const weapon = weapons[sourceTemplate][0];
    scheduleEvent(state.queue, 1, { type: "weapon-impact", shot: { towerId: tower.id, targetId: enemy.id, sourceTemplate,
      weapon, raw: 100, point: tower, destination: enemy } });
    advance(state, state.queue.nowUs + 1);
    const amount = physicalDamage(100 * ({ H043: 1, E022: 4.5, b155: 3 })[sourceTemplate], weapon.attackType, 0, false) *
      (1 + tower.hero.natural.STR * .0006);
    assert.ok(Math.abs(state.recentHits.at(-1).amount - amount) < 1e-8, sourceTemplate);
  }
});

test("A168 increases both actual self weapon submissions and leaves an adjacent ally's weapon unchanged", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  learn("A167");
  learn("A168", 6);
  const start = cast("A167");
  advance(state, start + 500_000);
  state.enemies = [enemy];
  const control = structuredClone(state);
  delete control.structures[0].hero.ranks.A168;
  for (const wolf of control.summons) delete wolf.summon.wildHowlRank;
  const hits = match => {
    scheduleEvent(match.queue, 1, { type: "movement" });
    advance(match, start + 1_480_000);
    return match.recentHits.filter(hit => hit.targetId === enemy.id);
  };
  const plain = hits(control);
  const buffed = hits(state);
  for (const source of ["b150", "H043", "n189"]) {
    const raw = plain.find(hit => hit.sourceTemplate === source)?.amount;
    const active = buffed.find(hit => hit.sourceTemplate === source)?.amount;
    assert.ok(raw > 0 && active > 0, source);
    if (source === "n189") assert.equal(active, raw);
    else assert.ok(active > raw, source);
  }
  assert.equal(tower.hero.ranks.A168, 6);
});
