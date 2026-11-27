import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { dragonForms } from "../src/game/m2/content.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { drain, enqueue, newMatch, removeDeadEnemy } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 1000) === "pending") {}
}

function command(state, action) {
  const id = `dragon-${state.queue.nowUs}`;
  assert.ok(enqueue(state, { id, action, matchId: state.matchId }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}

function fixture() {
  const state = newMatch("dragon-knight", 47);
  state.queue.pending.length = 0;
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending.length = 0;
  const hero = newHero("H003");
  hero.level = 30;
  hero.points = 20;
  const tower = { id: 900, templateId: "H003", hero, x: -288, y: -128, radius: 72, pending: null, qualification: null,
    autoModes: { A010: false, A239: false, A008: false } };
  state.structures = [tower];
  const originallySpawned = state.enemies[0];
  state.enemies = [];
  const enemy = (id, dx, dy = 0, abilities = []) => ({ ...originallySpawned, id, x: tower.x + dx, y: tower.y + dy,
    hp: 100_000, maxHp: 100_000, armor: 0, speed: 0, abilities });
  const learn = skillId => assert.ok(command(state, { type: "learn-skill", towerId: tower.id, skillId }).ok);
  const cast = (skillId, point) => assert.ok(command(state, { type: "cast-hero", towerId: tower.id, skillId, point }).ok);
  function equip(itemId, slot = 0) {
    if (!tower.qualification) {
      tower.qualification = "P001";
      state.structures.push({ id: 901, templateId: "n189", x: -520, y: -128, radius: 72, pending: null });
    }
    const id = state.nextId++;
    state.inventory.push({ id, itemId, slot, point: state.worker, charges: 0 });
    assert.ok(command(state, { type: "transfer-item", itemId: id, towerId: tower.id }).ok);
    return id;
  }
  return { state, tower, enemy, learn, cast, equip };
}

test("both dragon abilities learn and enter every actual ranked template, then return the same hero and inventory", () => {
  for (const [skin, forms] of dragonForms.entries()) for (const [rank, templateId] of forms.entries()) {
    const { state, tower, learn, cast } = fixture();
    for (let i = 0; i <= rank; i++) learn("A010");
    const ability = skin ? "A239" : "A010";
    if (skin) assert.ok(command(state, { type: "choose-skin", towerId: tower.id, choice: "S372" }).ok);
    const normal = tower.templateId;
    const attributes = structuredClone(tower.hero.natural);
    cast(ability);
    const now = state.queue.nowUs;
    assert.equal(tower.templateId, templateId);
    assert.equal(tower.hero.ranks[ability], rank + 1);
    assert.equal(tower.heroSpellReady[ability], now + 30_000_000);
    assert.equal(tower.manaMaximum - tower.mana, 30 + rank * 10);
    assert.equal(tower.life.hp, tower.life.maximum);
    assert.equal(state.structures[0].id, 900);
    assert.equal(command(state, { type: "cast-hero", towerId: tower.id, skillId: ability }).ok, false);
    const restored = JSON.parse(JSON.stringify(state));
    advance(restored, now + 20_000_000);
    const [returned] = restored.structures;
    assert.equal(returned.templateId, normal);
    assert.equal(returned.dragonShape, undefined);
    assert.equal(tower.life.maximum - returned.life.maximum, 500);
    assert.deepEqual(returned.hero.natural, attributes);
    assert.equal(returned.heroSpellReady[ability], now + 30_000_000);
  }
});

test("lance removal and transformation restore range at exact times, with independent scepter cooldown and bloodline max life", () => {
  const { state, tower, enemy, learn, cast, equip } = fixture();
  learn("A009");
  learn("A010");
  const lance = equip("i282");
  equip("i310");
  const target = enemy(300, 850);
  const focus = () => command(state, { type: "focus-target", towerId: tower.id, targetId: target.id });
  state.enemies = [target];
  assert.ok(focus().ok);
  cast("A010");
  const now = state.queue.nowUs;
  const base = tower.life.maximum - 500;
  assert.equal(tower.heroSpellReady.A010, now + 21_000_000);
  assert.equal(tower.life.maximum, base + 500);
  target.x = tower.x + 1300;
  assert.equal(focus().ok, false);
  advance(state, now + 3_000_000);
  assert.equal(tower.dragonShape.rangeDelta, 200);
  assert.ok(focus().ok);
  assert.ok(command(state, { type: "transfer-item", itemId: lance }).ok);
  assert.equal(tower.dragonShape.rangeDelta, 0);
  assert.equal(focus().ok, false);
  const withoutLance = tower.life.maximum - 500;
  assert.equal(base - withoutLance, 300);
  target.hp = 0;
  const hp = tower.life.hp;
  assert.ok(removeDeadEnemy(state, target.id, tower.id));
  assert.equal(tower.life.maximum, withoutLance + 507);
  assert.equal(tower.life.hp, hp);
  tower.life.hp = 200;
  tower.life.lastUs = now + 20_000_000;
  advance(state, now + 20_000_000);
  assert.equal(tower.life.hp, 1);
  assert.equal(tower.life.maximum, withoutLance + 7);
});

test("scepter with Octarine Core shortens the cooldown but cannot refresh an occupied dragon shape", () => {
  const { state, tower, learn, cast, equip } = fixture();
  learn("A010");
  equip("i310");
  equip("i327");
  cast("A010");
  const now = state.queue.nowUs;
  assert.equal(tower.heroSpellReady.A010, now + 16_800_000);
  advance(state, now + 16_800_000);
  assert.equal(command(state, { type: "cast-hero", towerId: tower.id, skillId: "A010" }).ok, false);
  assert.equal(tower.templateId, "E001");
  advance(state, now + 20_000_000);
  assert.equal(tower.templateId, "H003");
  cast("A010");
  assert.equal(tower.templateId, "E001");
});

test("breath creates two fixed centers using bloodline lifetime, and neither same-time expiry nor reload adds a pulse", () => {
  const { state, tower, enemy, learn, cast } = fixture();
  learn("A008");
  learn("A009");
  state.enemies = [enemy(301, 90), enemy(302, 180), enemy(303, 270), enemy(304, 650)];
  cast("A008", { x: tower.x + 200, y: tower.y });
  const now = state.queue.nowUs;
  advance(state, now + 1_100_000);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.sourceTemplate]), [[301, "q006"], [302, "q006"], [303, "q006"]]);
  const marks = Object.values(state.dragonImprints);
  assert.deepEqual(marks.map(mark => mark.point.x), [tower.x + 90, tower.x + 180]);
  assert.equal(marks[0].untilUs, state.recentHits[0].atUs + 4_500_000);
  const first = state.recentHits[0].atUs;
  state.enemies[0].x += 500;
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, first + 1_000_000);
  assert.deepEqual(restored.recentHits.filter(hit => hit.atUs === first + 1_000_000).map(hit => hit.targetId), [302]);
  advance(restored, marks[1].untilUs);
  assert.deepEqual(restored.dragonImprints, {});
  assert.ok(!restored.queue.pending.some(({ payload }) => payload.type.startsWith("dragon-imprint")));
});

test("a real green-dragon projectile keeps poison through return and a blue dragon chills splash without consuming spell shields", () => {
  for (const rank of [1, 6]) {
    const { state, tower, enemy, learn, cast } = fixture();
    for (let i = 0; i < rank; i++) learn("A010");
    cast("A010");
    const now = state.queue.nowUs;
    advance(state, now + 19_100_000);
    state.enemies = [enemy(301, 940, 0, ["Amim", "N535"]), enemy(302, 940, 180, ["Amim"])];
    scheduleEvent(state.queue, 1, { type: "movement" });
    advance(state, now + 19_500_000);
    assert.equal(state.queue.pending.find(event => event.payload.type === "weapon-impact").payload.shot.sourceTemplate,
      rank === 1 ? "E001" : "E006");
    const restored = JSON.parse(JSON.stringify(state));
    advance(restored, now + 21_000_000);
    assert.equal(restored.structures[0].templateId, "H003");
    if (rank === 1) {
      const poison = restored.enemies[0].poison[tower.id];
      assert.equal(poison.skillId, "A011");
      assert.equal(poison.expiresUs - poison.nextUs, 4_000_000);
      assert.equal(restored.enemies[1].poison, undefined);
    } else {
      assert.ok(restored.enemies.every(enemy => enemy.dragonFrost?.factor === .6 && enemy.dragonFrost.attackPenalty === .6));
      assert.equal(restored.enemies[0].spellShieldReadyUs, undefined);
      assert.ok(restored.recentHits.some(hit => hit.targetId === 302 && hit.sourceTemplate === "E006"));
    }
  }
});
