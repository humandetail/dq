import assert from "node:assert/strict";
import { test } from "node:test";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";

function advance(state, atUs) {
  state.clock.targetUs = atUs;
  while (drain(state, 10000) === "pending") {}
}

function command(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  assert.ok(state.commandResults[id].ok, JSON.stringify(state.commandResults[id]));
}

function fixture() {
  const state = newMatch("m3-keeper-of-light", 47);
  state.queue.pending = [];
  const hero = newHero("H049");
  hero.natural.INT = 300;
  const autoModes = { A189: false, A190: false, A191: false };
  const tower = { ...map.worker, id: 900, templateId: "H049", radius: 72, pending: null, qualification: "P001", hero, autoModes };
  const provider = { ...map.worker, x: tower.x - 300, id: 901, templateId: "n189", radius: 72, pending: null };
  state.structures = [tower, provider];
  const enemy = { ...map.worker, id: 910, x: tower.x + 600, unitId: "m001", layer: "ground",
    hp: 100000, maxHp: 100000, mana: 0, armor: 0, points: 0, speed: 0, radius: 2, initialOverlaps: [], abilities: [], wave: 1 };
  state.enemies = [enemy];
  const point = { x: tower.x + 700, y: tower.y };
  return { state, tower, enemy, point };
}

function transfer(state, name, itemId, tower) {
  command(state, name, { type: "transfer-item", itemId, ...(tower ? { towerId: tower.id } : {}) });
}

function beginCast(state, tower, id, skillId, selection) {
  command(state, id, { type: "cast-hero", towerId: tower.id, skillId, ...selection });
  const event = state.queue.pending.find(event => event.payload.type === "hero-spell" && event.payload.skillId === skillId);
  assert.equal(event.dueUs - state.queue.nowUs, 300_000);
  return event.dueUs;
}

function cast(state, tower, id, skillId, selection) {
  const dueUs = beginCast(state, tower, id, skillId, selection);
  advance(state, dueUs);
  return dueUs;
}

test("A189 holds the committed point and Q76 continuous amount, including real staff transfer and exact blind lifetime", () => {
  const { state, tower, enemy, point } = fixture();
  tower.hero.ranks.A189 = 3;
  const id = state.nextId++;
  state.inventory.push({ id, itemId: "i310", slot: 0, point: map.worker, charges: 0 });
  const started = cast(state, tower, "illuminate", "A189", { point });
  assert.equal(tower.illuminateCharge.maxUs, 2_000_000);
  assert.deepEqual(tower.illuminateCharge.orb, { x: tower.x + 200, y: tower.y });
  transfer(state, "staff", id, tower);
  const restored = JSON.parse(JSON.stringify(state));
  const [caster] = restored.structures;
  advance(restored, started + 1_749_999);
  command(restored, "release", { type: "stop-tower-cast", towerId: caster.id });
  assert.equal(caster.illuminateCharge, undefined);
  assert.ok(!restored.queue.pending.some(entry => entry.payload.type === "illuminate-timeout"));
  const wave = restored.queue.pending.find(entry => entry.payload.type === "spell-sweep");
  assert.equal(wave.payload.sweep.amount, 12468.75);
  advance(restored, wave.dueUs);
  const [hit] = restored.recentHits;
  assert.equal(hit.amount, 9975 * 1.34);
  assert.equal(hit.sourceTemplate, "q064");
  assert.equal(hit.targetId, enemy.id);
  assert.equal(restored.enemies[0].illuminateBlindUntilUs, wave.dueUs + 5_000_000);
  advance(restored, wave.dueUs + 5_000_000);
  assert.equal(restored.enemies[0].illuminateBlindUntilUs, undefined);
  assert.equal(restored.recentHits.filter(hit => hit.sourceTemplate === "q064").length, 1);
});

test("A189 zero release writes only a legal blind, safe with shield and immunity, and windup cancellation produces no wave", () => {
  const { state, tower, enemy, point } = fixture();
  tower.hero.ranks.A189 = 1;
  beginCast(state, tower, "windup", "A189", { point });
  command(state, "stop-before", { type: "stop-tower-cast", towerId: tower.id });
  assert.ok(!state.queue.pending.some(entry => entry.payload.type === "illuminate-timeout"));
  const started = cast(state, tower, "charge", "A189", { point });
  const shielded = { ...enemy, id: 911, y: enemy.y + 2, abilities: ["N535"] };
  const immune = { ...enemy, id: 912, y: enemy.y + 4, abilities: ["Amim"] };
  state.enemies.push(shielded, immune);
  advance(state, started);
  // Commands run at the next absolute microsecond. Enqueue Stop one microsecond
  // before the commit to exercise the exact same-timestamp boundary.
  const pending = state.queue.pending.find(entry => entry.payload.type === "illuminate-timeout");
  assert.equal(pending.dueUs, started + 1_000_000);
  const copy = fixture();
  copy.tower.hero.ranks.A189 = 1;
  const commitAt = beginCast(copy.state, copy.tower, "begin-copy", "A189", { point: copy.point });
  copy.state.enemies.push({ ...shielded }, { ...immune });
  advance(copy.state, commitAt - 1);
  command(copy.state, "zero", { type: "stop-tower-cast", towerId: copy.tower.id });
  const sweep = copy.state.queue.pending.find(entry => entry.payload.type === "spell-sweep");
  assert.equal(sweep.payload.sweep.amount, 0);
  advance(copy.state, sweep.dueUs + 10_000);
  assert.ok(copy.state.enemies[0].illuminateBlindUntilUs);
  assert.ok(copy.state.enemies[1].spellShieldReadyUs);
  assert.equal(copy.state.enemies[1].illuminateBlindUntilUs, undefined);
  assert.equal(copy.state.enemies[2].illuminateBlindUntilUs, undefined);
  assert.equal(copy.state.recentHits?.length ?? 0, 0);
});

test("A191 late launch reads live rank, aim, and staff, while staff contact reads live natural INT and independently ordered blind", () => {
  const { state, tower, enemy, point } = fixture();
  tower.hero.ranks.A191 = 1;
  tower.hero.ranks.A189 = 1;
  const id = state.nextId++;
  state.inventory.push({ id, itemId: "i310", slot: 0, point: map.worker, charges: 0 });
  const started = cast(state, tower, "first-wave", "A191", { point });
  const aim = { x: tower.x + 200, y: tower.y };
  assert.deepEqual(state.queue.pending.find(entry => entry.payload.type === "spirit-wave").payload.aim, aim);
  assert.equal(state.battleAnimations.find(effect => effect.unitId === "q063").durationUs, 2_000_000);
  transfer(state, "give-staff", id, tower);
  tower.hero.ranks.A191 = 2;
  tower.y -= 70;
  enemy.y = aim.y;
  advance(state, started + 1_200_000);
  const first = state.queue.pending.find(entry => entry.payload.type === "spell-sweep");
  assert.equal(first.payload.sweep.lightCarrier, "q062");
  assert.equal(first.payload.sweep.amount, 5000);
  assert.equal(first.payload.sweep.dy, 70 / Math.hypot(200, 70));
  transfer(state, "take-staff", id);
  tower.hero.natural.INT = 321;
  tower.hero.ranks.A191 = 3;
  enemy.illuminateBlindUntilUs = first.dueUs + 1_000_000;
  advance(state, first.dueUs);
  const [child, mother] = state.recentHits;
  assert.deepEqual([child.sourceTemplate, mother.sourceTemplate], ["H049", "q062"]);
  assert.ok(Math.abs(child.amount - 321 * 6 * .8 * 1.321) < 1e-8);
  assert.ok(Math.abs(mother.amount - 5000 * .8 * 1.6 * 1.321) < 1e-8);
  assert.equal(enemy.illuminateBlindUntilUs, first.dueUs + 5_000_000);
});

test("A190 ordinary Chakra uses only a pre-commit token, consumes it on ENDCAST, and preserves its new self grant", () => {
  const { state, tower, point } = fixture();
  tower.hero.ranks.A189 = 1;
  tower.hero.ranks.A190 = 6;
  const self = { targetId: tower.id };
  const started = cast(state, tower, "first-chakra", "A190", self);
  const old = tower.chakraToken.id;
  advance(state, started + 100_000);
  assert.equal(tower.heroSpellReady.A190, started + 9_000_000);
  assert.equal(tower.chakraToken.id, old);
  const next = started + 9_000_000;
  advance(state, next);
  const repeated = cast(state, tower, "repeat-chakra", "A190", self);
  const fresh = tower.chakraToken.id;
  assert.notEqual(fresh, old);
  assert.equal(tower.chakraUses.A190, old);
  advance(state, repeated + 100_000);
  assert.equal(tower.heroSpellReady.A190, repeated + 7_220_000);
  assert.equal(tower.chakraToken.id, fresh);
  beginCast(state, tower, "cancelled-illuminate", "A189", { point });
  command(state, "stop-windup", { type: "stop-tower-cast", towerId: tower.id });
  assert.equal(tower.chakraToken.id, fresh);
  const charge = cast(state, tower, "real-illuminate", "A189", { point });
  advance(state, charge + 1_000_000);
  assert.equal(tower.heroSpellReady.A189, charge + 9_800_000);
  assert.equal(tower.chakraToken, undefined);
});

test("A190 staff restores target max-mana fraction and seven-second haste does not stack with i327", () => {
  const { state, tower, point } = fixture();
  tower.hero.ranks.A190 = 2;
  const receiver = { ...tower, id: 902, x: tower.x - 200, hero: newHero("H049"), mana: 0, manaLastUs: 0,
    manaMaximum: 1200, manaStaticMaximum: 1200, manaOffset: 600 };
  receiver.hero.ranks.A189 = 1;
  receiver.hero.ranks.A191 = 1;
  state.structures.push(receiver);
  const staff = state.nextId++, heart = state.nextId++;
  state.inventory.push({ id: staff, itemId: "i310", slot: 0, point: map.worker, charges: 0 },
    { id: heart, itemId: "i327", slot: 1, point: map.worker, charges: 0 });
  transfer(state, "give-staff", staff, tower);
  transfer(state, "give-heart", heart, receiver);
  receiver.mana = 200;
  receiver.manaRegen = 0;
  const started = cast(state, tower, "give-chakra", "A190", { targetId: receiver.id });
  assert.equal(receiver.chakraTargetId, undefined);
  assert.equal(tower.chakraTargetId, receiver.id);
  assert.equal(receiver.mana, 400 + .13 * receiver.manaMaximum);
  assert.equal(receiver.chakraHasteUntilUs, started + 7_000_000);
  const charge = cast(state, receiver, "recipient-charge", "A189", { point: { x: receiver.x + 700, y: receiver.y } });
  advance(state, charge + 1_000_000);
  assert.equal(receiver.heroSpellReady.A189, charge + 9_800_000);
  const spirit = cast(state, receiver, "recipient-spirit", "A191", { point });
  advance(state, spirit + 100_000);
  assert.equal(receiver.heroSpellReady.A191, spirit + 12_020_000);
  assert.equal(receiver.chakraHasteUntilUs, started + 7_000_000);
});

test("ordinary Spirit Form reads but does not refresh the real blind left by Illuminate", () => {
  const { state, tower, enemy, point } = fixture();
  tower.hero.ranks.A189 = 1;
  tower.hero.ranks.A191 = 1;
  const charge = cast(state, tower, "fill-illuminate", "A189", { point });
  advance(state, charge + 1_150_000);
  const expires = enemy.illuminateBlindUntilUs;
  assert.ok(expires);
  const spirit = cast(state, tower, "ordinary-spirit", "A191", { point });
  advance(state, spirit + 1_400_000);
  const [illuminate, wave] = state.recentHits;
  assert.equal(illuminate.sourceTemplate, "q064");
  assert.equal(wave.sourceTemplate, "q001");
  assert.ok(Math.abs(wave.amount - 3000 * .8 * 1.6 * 1.3) < 1e-8);
  assert.equal(enemy.illuminateBlindUntilUs, expires);
});
