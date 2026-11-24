import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceFrame, enqueue, enterEndless, newMatch, running } from "../src/game/battle.ts";
import { creditTime, drainFrames, newClock } from "../src/game/clock.ts";
import { contentVersion, map } from "../src/game/content.ts";
import { saveFormatVersion } from "../src/game/state.ts";

const fresh = (id = "test", seed = 1) => ({
  formatVersion: saveFormatVersion, contentVersion, revision: 0,
  state: newMatch(id, seed), clock: newClock(),
});

function queue(state, id, action, pending = 0) {
  return enqueue(state, { matchId: state.matchId, id, action }, pending);
}

function perform(state, id, action) {
  assert.equal(queue(state, id, action).status, "queued");
  advanceFrame(state);
  return state.results.find(result => result.id === id);
}

test("economy commits in sequence and each operation handles retry and restore", () => {
  const state = newMatch("original", 7);
  const cases = [
    [{ type: "build", cardId: 1, site: "west" }, { type: "build", cardId: 1, site: "east" }, "missing"],
    [{ type: "upgrade", towerId: 2 }, { type: "upgrade", towerId: 2 }, "max-level"],
    [{ type: "draw" }, { type: "draw" }, "gold"],
    [{ type: "buy", item: "lens" }, { type: "buy", item: "lens" }, "stock"],
    [{ type: "craft", recipe: "amplifier", materialIds: [4, 5] },
      { type: "craft", recipe: "amplifier", materialIds: [4, 4] }, "materials"],
  ];
  const gameplay = ({ gold, towers, cards, items, stock, nextInstanceId, randomState }) =>
    structuredClone({ gold, towers, cards, items, stock, nextInstanceId, randomState });

  for (const [index, [valid, invalid, reason]] of cases.entries()) {
    if (index === 3) state.stock.lens = 1;
    if (index === 4) assert.equal(perform(state, "filament", { type: "buy", item: "filament" }).ok, true);
    const id = `valid-${index}`;
    assert.equal(queue(state, id, valid).status, "queued");
    assert.equal(queue(state, id, valid).status, "queued");
    const restored = structuredClone(state);
    advanceFrame(state);
    advanceFrame(restored);
    assert.deepEqual(state, restored);
    const committed = state.results.at(-1);
    assert.equal(committed.ok, true);
    assert.deepEqual(queue(restored, id, valid), { status: "resolved", result: committed });

    const money = state.gold;
    if (reason === "gold") state.gold = 0;
    const before = gameplay(state);
    assert.equal(perform(state, `invalid-${index}`, invalid).reason, reason);
    assert.deepEqual(gameplay(state), before);
    state.gold = money;
  }
  assert.equal(state.items[0].type, "amplifier");
  assert.equal(perform(state, "equip", { type: "equip", itemId: state.items[0].id, towerId: 2 }).ok, true);
  assert.deepEqual(state.items[0].owner, { type: "tower", id: 2 });
});

test("last shop stock and shared recipe materials can be committed only once", () => {
  const state = newMatch("competition", 1);
  state.stock.lens = 1;
  const lens = state.nextInstanceId;
  const filament = lens + 1;
  queue(state, "lens-first", { type: "buy", item: "lens" });
  queue(state, "lens-second", { type: "buy", item: "lens" });
  queue(state, "filament", { type: "buy", item: "filament" });
  queue(state, "craft-first", { type: "craft", recipe: "amplifier", materialIds: [lens, filament] });
  queue(state, "craft-second", { type: "craft", recipe: "amplifier", materialIds: [lens, filament] });
  advanceFrame(state);
  assert.deepEqual(state.results.map(result => result.ok || result.reason), [true, "stock", true, true, "materials"]);
  assert.deepEqual(state.items.map(item => item.type), ["amplifier"]);
  assert.equal(state.gold, 72);
});

function advanceUntil(state, predicate, limit = 50_000) {
  for (let index = 0; index < limit && running(state) && !predicate(); index++) advanceFrame(state);
  assert.ok(predicate(), `frame ${state.frame}, phase ${state.phase}, wave ${state.currentWave}`);
}

function sameBoundary(extraEnemies) {
  const state = newMatch("boundary", 1);
  const built = perform(state, "build", { type: "build", site: "west", cardId: 1 });
  const frame = state.events[0].targetFrame;
  state.frame = frame - 1;
  state.waves[0].livingEnemies = extraEnemies;
  for (let index = 0; index < extraEnemies; index++) state.enemies.push({
    id: state.nextInstanceId++, type: "skimmer", wave: 1,
    position: { ...map.route[0] }, nextWaypoint: 1, hp: 24,
  });
  const target = state.enemies[0];
  queue(state, "attack", { type: "attack", towerId: built.createdId, targetId: target.id });
  queue(state, "upgrade", { type: "upgrade", towerId: built.createdId });
  return { state, target };
}

test("C01 accepts equality, applies upgrades before attacks, and stops before attacks on overrun", () => {
  const onLimit = sameBoundary(21);
  advanceFrame(onLimit.state);
  assert.equal(onLimit.state.phase, "mainline");
  assert.ok(onLimit.target.hp <= 0);
  assert.equal(onLimit.state.results.find(result => result.id === "attack").ok, true);
  assert.equal(onLimit.state.towers[0].attackReadyFrame, onLimit.state.frame + 7);
  assert.equal(perform(onLimit.state, "early", { type: "attack", towerId: 2, targetId: onLimit.state.enemies[0].id }).reason, "cooldown");

  const overLimit = sameBoundary(22);
  advanceFrame(overLimit.state);
  assert.equal(overLimit.state.phase, "failed");
  assert.equal(overLimit.state.containmentPoints, 25);
  assert.equal(overLimit.target.hp, 24);
  assert.equal(overLimit.state.events.length, 0);
  assert.equal(overLimit.state.results.find(result => result.id === "attack").reason, "phase");
  const terminal = structuredClone(overLimit.state);
  advanceFrame(overLimit.state);
  assert.deepEqual(overLimit.state, terminal);
});

test("later batches permit temporary overrun and later clears wait for the progress prefix", () => {
  const { state } = sameBoundary(21);
  advanceFrame(state);
  const laterBatch = state.events.find(event => event.wave === 1);
  state.frame = laterBatch.targetFrame - 1;
  advanceFrame(state);
  assert.equal(state.phase, "mainline");
  assert.ok(state.enemies.length > map.containment.limit);
  // Keep wave one's survivors while wave two completes, then clear the prefix.
  const previousEnemies = state.enemies;
  state.enemies = [];
  state.waves[1].remainingBatches = 0;
  state.waves[1].livingEnemies = 0;
  state.events = [];
  advanceFrame(state);
  assert.equal(state.lastCompletedWave, 0);
  state.waves[0].livingEnemies -= previousEnemies.length;
  advanceFrame(state);
  assert.equal(state.lastCompletedWave, 2);
});

test("a later first batch checks residual enemies and counts only in-bounds containment points", () => {
  const prepare = () => {
    const state = newMatch("overlap", 1);
    advanceUntil(state, () => state.currentWave === 1);
    const firstOfTwo = state.events.find(event => event.wave === 2 && event.batchIndex === 0);
    firstOfTwo.targetFrame = state.frame + 1;
    // Simulate extra units left in the ring from wave one. A second shell stays outside.
    const residual = state.enemies;
    for (let index = residual.length; index < 18; index++) {
      residual.push({ id: state.nextInstanceId++, type: "skimmer", wave: 1,
        position: { ...map.route[0] }, nextWaypoint: 1, hp: 24 });
    }
    for (const position of [map.route[0], { x: -9, y: 4 }]) {
      residual.push({ id: state.nextInstanceId++, type: "shell", wave: 1,
        position: { ...position }, nextWaypoint: 1, hp: 72 });
    }
    state.waves[0].livingEnemies = residual.length;
    return state;
  };

  const accepted = prepare();
  advanceFrame(accepted);
  assert.equal(accepted.currentWave, 2);
  assert.equal(accepted.phase, "mainline");

  const rejected = prepare();
  rejected.enemies.at(-1).position = { ...map.route[0] };
  advanceFrame(rejected);
  assert.equal(rejected.phase, "failed");
  assert.equal(rejected.currentWave, 2);
  assert.equal(rejected.lastCompletedWave, 0);
  assert.equal(rejected.containmentPoints, 26);
});

test("real content clears mainline, continues past endless wave five and restores deterministically", () => {
  for (const seed of [1, 0x7fffffff]) {
    const state = newMatch("fixed", seed);
    perform(state, "build", { type: "build", site: "west", cardId: 1 });
    perform(state, "upgrade", { type: "upgrade", towerId: 2 });
    advanceUntil(state, () => state.lastCompletedWave === 1);
    const drawn = perform(state, "draw", { type: "draw" });
    perform(state, "east", { type: "build", site: "east", cardId: drawn.createdId });
    const lens = perform(state, "lens", { type: "buy", item: "lens" });
    const filament = perform(state, "filament", { type: "buy", item: "filament" });
    const ring = perform(state, "craft", { type: "craft", recipe: "amplifier", materialIds: [lens.createdId, filament.createdId] });
    perform(state, "equip", { type: "equip", itemId: ring.createdId, towerId: 2 });
    advanceUntil(state, () => state.phase === "mainline-won");
    assert.ok(state.frame >= 5900 && state.frame < 6250);
    const preTransition = structuredClone(state);
    assert.equal(enterEndless(state), true);
    assert.equal(enterEndless(state), false);
    for (const key of ["towers", "items", "cards", "gold", "matchId", "randomState"]) {
      assert.deepEqual(state[key], preTransition[key]);
    }

    advanceUntil(state, () => state.currentWave === 2 && state.enemies.length > 0);
    const effectId = state.nextInstanceId++;
    state.effects.push({ id: effectId, type: "damage-bonus", targetId: 2, expiresFrame: state.frame + 4, magnitude: 2 });
    state.events.push({ type: "expire-effect", targetFrame: state.frame + 4, sequence: state.nextEventSequence++, effectId });
    queue(state, "pending-draw", { type: "draw" }, 2);
    const restored = structuredClone(state);
    while (running(state) && state.currentWave < 100) {
      assert.deepEqual(advanceFrame(state), advanceFrame(restored));
      assert.deepEqual(state, restored);
    }
    assert.equal(state.phase, "failed");
    assert.ok(state.lastCompletedWave >= 5);
    assert.ok(state.currentWave >= 6);
    assert.equal(state.effects.length, 0);
    assert.equal(state.events.length, 0);
    assert.equal(queue(newMatch("new", 1), "wrong", { type: "draw" }).status, "queued");
    assert.equal(enqueue(newMatch("new", 1), {
      matchId: state.matchId, id: "wrong", action: { type: "draw" },
    }).status, "stale");
  }
});

test("clock replay matches at 1×, 4× and after paused or chunked recovery", () => {
  const run = (segments, chunk = Infinity) => {
    let snapshot = fresh();
    queue(snapshot.state, "build", { type: "build", site: "west", cardId: 1 });
    queue(snapshot.state, "upgrade", { type: "upgrade", towerId: 2 }, 50);
    for (const [elapsed, speed, paused] of segments) {
      Object.assign(snapshot.clock, { speed, paused });
      creditTime(snapshot, elapsed);
      while (snapshot.clock.pendingFrames) {
        drainFrames(snapshot, chunk);
        if (chunk !== Infinity) snapshot = structuredClone(snapshot);
      }
    }
    return snapshot;
  };
  const baseline = run([[40_000, 1, false]]);
  const fast = run([[10_000, 4, false]]);
  const mixed = run([[375, 1, false], [5000, 4, true], [9625, 4, false], [1125, 1, false]], 17);
  assert.deepEqual(fast.state, baseline.state);
  assert.deepEqual(mixed, baseline);

  const backlogged = fresh();
  backlogged.clock.speed = 4;
  creditTime(backlogged, 10_000);
  const result = queue(backlogged.state, "fresh-input", { type: "draw" }, backlogged.clock.pendingFrames);
  assert.equal(result.targetFrame, 401);
  drainFrames(backlogged, 400);
  assert.equal(backlogged.state.results.length, 0);
  creditTime(backlogged, 25);
  drainFrames(backlogged, 1);
  assert.equal(backlogged.state.results[0].id, "fresh-input");

  const stopped = fresh();
  stopped.clock.speed = 4;
  creditTime(stopped, 300_000);
  drainFrames(stopped, Infinity);
  assert.equal(stopped.state.phase, "failed");
  assert.deepEqual([stopped.clock.pendingFrames, stopped.clock.remainderMs], [0, 0]);
});
