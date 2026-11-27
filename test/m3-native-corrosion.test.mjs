import assert from "node:assert/strict";
import test from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { physicalDamage, weapons } from "../src/game/m2/combat.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, newMatch } from "../src/game/m2/match.ts";

function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 1000) === "pending") {}
}

function fixture() {
  const state = newMatch("corrosion", 47);
  state.queue.pending = [];
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advance(state, 1);
  state.queue.pending = [];
  const target = state.enemies[0];
  Object.assign(target, { ...map.worker, hp: 100_000, armor: 200, speed: 0, abilities: ["Amim"] });
  state.enemies = [target];
  state.structures = ["n240", "n241", "n242", "n001"].map((templateId, index) => ({
    ...map.worker, templateId, id: 900 + index, radius: 72, pending: null, qualification: null, population: 5,
    attack: { readyUs: Number.MAX_SAFE_INTEGER },
  }));
  function sendShot(run, index, payload = {}) {
    const { id, templateId } = run.structures[index];
    const shot = { towerId: id, sourceTemplate: templateId, targetId: target.id, raw: 100,
      weapon: { ...weapons[templateId][0], attackType: "chaos" }, point: map.worker, destination: map.worker, ...payload };
    scheduleEvent(run.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
    advance(run, run.queue.nowUs + 1);
  }
  return { state, target, sendShot };
}

test("N105–107 updates armor before its own hit and the latest source can weaken BIcb", () => {
  const { state, target, sendShot } = fixture();
  for (const index of [2, 0, 1]) {
    const value = [10, 25, 40][index];
    sendShot(state, index);
    assert.deepEqual(target.nativeCorrosion, { value, untilUs: state.queue.nowUs + 5_000_000 });
    assert.ok(Math.abs(state.recentHits.at(-1).amount - physicalDamage(100, "chaos", 200 - value, false)) < 1e-9);
  }
  assert.equal(state.recentHits.length, 3);
});

test("BIcb remains distinct from equipment B032, persists after source removal and expires", () => {
  const { state, target, sendShot } = fixture();
  sendShot(state, 2, { corrosion: 70 });
  assert.ok(Math.abs(state.recentHits.at(-1).amount - physicalDamage(100, "chaos", 200 - 40 - 70, false)) < 1e-9);
  const restored = JSON.parse(JSON.stringify(state));
  restored.structures[2].templateId = "n001";
  advance(restored, target.nativeCorrosion.untilUs - 2);
  sendShot(restored, 3);
  assert.ok(Math.abs(restored.recentHits.at(-1).amount - physicalDamage(100, "chaos", 200 - 40 - 70, false)) < 1e-9);
  sendShot(restored, 3);
  assert.ok(Math.abs(restored.recentHits.at(-1).amount - physicalDamage(100, "chaos", 200, false)) < 1e-9);
  scheduleEvent(restored.queue, 1, { type: "movement" });
  advance(restored, restored.queue.nowUs + 1);
  assert.equal(restored.enemies[0].nativeCorrosion, undefined);
});

test("corrosion isn't applied by secondary shots or to ethereal targets", () => {
  const { state, target, sendShot } = fixture();
  sendShot(state, 2, { secondary: true });
  assert.equal(target.nativeCorrosion, undefined);
  target.abilities.push("Aeth");
  sendShot(state, 2);
  assert.equal(target.nativeCorrosion, undefined);
  assert.equal(weapons.n242.some(weapon => weapon.slot === 2), false);
});
