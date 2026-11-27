import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch, removeDeadEnemy } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("m3-requiem", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const hero = newHero("H001");
  hero.natural = { STR: 0, AGI: 0, INT: 100 };
  const tower = { ...map.worker, id: 900, templateId: "H001", radius: 72, population: 20, pending: null, qualification: "P001", hero };
  state.structures = [tower];
  const sample = state.enemies[0];
  const target = (id, dx, dy = 0, extra = {}) => ({ ...sample, id, x: tower.x + dx, y: tower.y + dy,
    armor: 0, speed: 0, hp: 100_000, maxHp: 100_000, abilities: [], ...extra });
  state.enemies = [];
  const command = (id, action) => {
    assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
    advance(state, state.queue.nowUs + 1);
    return state.commandResults[id];
  };
  const cast = () => command("requiem", { type: "cast-hero", towerId: tower.id, skillId: "A001" });
  return { state, tower, target, command, cast };
}

test("A001 cancellation before effect costs nothing; twenty fixed rays keep traveling after follow-through stops", () => {
  const { state, tower, target, command, cast } = fixture();
  tower.hero.ranks.A001 = 1;
  tower.souls = 10;
  const enemy = target(21, 640, 0, { abilities: ["N535"] });
  state.enemies = [enemy];
  assert.ok(cast().ok);
  assert.equal(tower.mana, tower.manaMaximum);
  assert.ok(command("stop-before", { type: "stop-tower-cast", towerId: tower.id }).ok);
  assert.equal(tower.heroSpellReady?.A001, undefined);
  assert.equal(state.queue.pending.some(entry => entry.payload.type === "spell-sweep"), false);
  assert.ok(command("recast", { type: "cast-hero", towerId: tower.id, skillId: "A001" }).ok);
  const effectAt = state.queue.nowUs + 670_000;
  advance(state, effectAt);
  const carriers = state.queue.pending.filter(entry => entry.payload.type === "requiem-carrier-expire");
  assert.equal(carriers.length, 20);
  assert.ok(carriers.every(entry => entry.dueUs === effectAt + 3e6));
  assert.deepEqual(carriers.map(entry => entry.payload.sourceId), [...carriers.map(entry => entry.payload.sourceId)].sort((a, b) => a - b));
  const art = state.battleAnimations.filter(entry => entry.unitId === "T001");
  assert.equal(art.length, 20);
  assert.deepEqual(art.at(-1).target, { x: tower.x + 800, y: tower.y });
  assert.equal(tower.mana, tower.manaMaximum - 20);
  assert.equal(tower.heroCastUntilUs, effectAt + 600_000);
  assert.ok(command("stop-after", { type: "stop-tower-cast", towerId: tower.id }).ok);
  assert.equal(tower.requiemFollowTimer, undefined);
  tower.souls = 15;
  const restored = JSON.parse(JSON.stringify(state));
  const elapsed = Math.round(640 * Math.cos(Math.PI / 10) / 800 * 1e6);
  advance(restored, effectAt + elapsed - 1);
  assert.equal(restored.recentHits, undefined);
  advance(restored, effectAt + elapsed);
  assert.deepEqual(restored.recentHits.map(hit => [hit.casterId, hit.sourceTemplate, hit.targetId, hit.amount]),
    [[tower.id, "H001", enemy.id, 264], [tower.id, "H001", enemy.id, 264]]);
  advance(restored, effectAt + 800_000);
  assert.equal(restored.recentHits.at(-1).amount, 264);
  assert.equal(restored.recentHits.length, 3);
  assert.equal(restored.enemies[0].spellShieldReadyUs, undefined);
});

test("the independent q014 carrier retains native damage after ownership is removed", () => {
  const { state, tower, target, cast } = fixture();
  tower.hero.ranks.A001 = 1;
  state.enemies = [target(21, 320), target(22, 320, 0, { abilities: ["ACmi"] }), target(23, 320, 0, { abilities: ["Amec"] })];
  assert.ok(cast().ok);
  advance(state, 670_002);
  state.structures = [];
  const elapsed = Math.round(320 * Math.cos(Math.PI / 10) / 800 * 1e6);
  advance(state, 670_002 + elapsed);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.sourceTemplate, hit.amount]), [[21, "q014", 8], [21, "q014", 8]]);
  assert.notEqual(state.recentHits[0].casterId, state.recentHits[1].casterId);
});

test("A001's eastbound ray meets a continuously approaching enemy between anchors", () => {
  const { state, tower, target, cast } = fixture();
  tower.hero.ranks.A001 = 1;
  tower.souls = 10;
  const enemy = target(21, 20, 0, { layer: "fly", speed: 320, path: [{ x: tower.x - 100, y: tower.y }] });
  state.enemies = [enemy];
  assert.ok(cast().ok);
  const commit = state.queue.nowUs + 670_000;
  scheduleEvent(state.queue, 701_250, { type: "movement" });
  const contact = commit + Math.round(20 * 1e6 / (800 + 320));
  const ray = () => state.queue.pending.find(entry => entry.payload.type === "spell-sweep" &&
    entry.payload.sweep.dx === 1 && entry.payload.sweep.dy === 0).payload.sweep;
  advance(state, contact - 1);
  assert.deepEqual(ray().hit, []);
  advance(state, contact);
  assert.deepEqual(ray().hit, [enemy.id]);
});

test("A002 resolves ordinary versus map boss awards, caps each grant, respects actual Scepter and retains gains on S162", () => {
  const { state, tower, target, command } = fixture();
  tower.hero.ranks.A002 = 1;
  const dead = (id, boss = false) => target(id, 300, 0, { hp: 0, unitId: boss ? "b100" : "m001", abilities: boss ? ["N534"] : [] });
  const kill = enemy => {
    state.enemies.push(enemy);
    assert.ok(removeDeadEnemy(state, enemy.id, tower.id));
  };
  kill(dead(30));
  assert.equal(tower.souls, 1);
  tower.souls = 198;
  kill(dead(31, true));
  assert.equal(tower.souls, 200);
  assert.ok(command("skin", { type: "choose-skin", towerId: tower.id, choice: "S162" }).ok);
  assert.equal(tower.templateId, "G053");
  assert.equal(tower.souls, 200);
  kill(dead(32, true));
  assert.equal(state.battleAnimations.some(entry => entry.unitId === "T136"), false);
  state.structures.push({ ...map.worker, x: tower.x + 3000, id: 909, templateId: "n189", pending: null });
  state.inventory = [{ id: 910, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  assert.ok(command("scepter", { type: "transfer-item", itemId: 910, towerId: tower.id }).ok);
  kill(dead(33, true));
  assert.equal(tower.souls, 210);
  assert.deepEqual(state.battleAnimations.at(-1).target, { x: tower.x, y: tower.y });
  assert.equal(state.battleAnimations.at(-1).unitId, "T136");
  assert.ok(command("drop-scepter", { type: "transfer-item", itemId: 910 }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  tower.souls = restored.structures[0].souls;
  kill(dead(34));
  assert.equal(tower.souls, 210);
});

test("A003 picks the strongest aura at the closed radius and leaves magic-immune targets untouched", () => {
  const { state, tower, target } = fixture();
  tower.hero.ranks.A003 = 3;
  const strong = { ...tower, id: 901, x: tower.x + 1200, hero: { ...tower.hero, ranks: { A003: 6 } } };
  state.structures.push(strong);
  const enemy = target(21, 400);
  const hit = () => {
    const shot = { towerId: tower.id, sourceTemplate: tower.templateId, targetId: enemy.id, raw: 100,
      weapon: { ...weapons[tower.templateId][0], attackType: "chaos", homing: false },
      point: enemy, destination: enemy, artilleryCritical: { multiplier: 1, sureHit: true, fixedBonus: 0 } };
    scheduleEvent(state.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
    advance(state, state.queue.nowUs + 1);
    return state.recentHits.at(-1).amount;
  };
  state.enemies = [enemy];
  assert.equal(hit(), 140);
  strong.x++;
  assert.equal(hit(), 122);
  enemy.abilities = ["Amim"];
  assert.equal(hit(), 100);
});
