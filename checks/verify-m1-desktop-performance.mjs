import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { enqueue, advanceFrame } from "../src/game/battle.ts";
import { makeDesktopFixture } from "./m1-desktop-fixture.mjs";

const [onFile, offFile] = process.argv.slice(2);
const on = JSON.parse(readFileSync(onFile, "utf8"));
const off = JSON.parse(readFileSync(offFile, "utf8"));

function verify(run) {
  assert.ok(run.elapsedMs >= 600000, "measurement window shorter than 10 minutes");
  assert.equal(run.rows.length, 479);
  assert.ok(run.renderedFrames > 6000, "3D loop did not render consistently");
  assert.deepEqual(run.viewport, [1440, 900]);
  assert.deepEqual(run.errors, []);
  assert.ok(run.rows.every(row => row.success && row.frame >= row.targetFrame && row.resultMs >= row.confirmationMs));
  assert.equal(new Set(run.rows.map(row => row.id)).size, run.rows.length);

  // Compare each browser run to a standalone replay at its own input frames.
  const { state } = makeDesktopFixture();
  for (const input of run.rows) {
    const tower = state.towers.find(unit => unit.site === input.site);
    while (state.frame < input.targetFrame - 1) advanceFrame(state);
    assert.equal(state.frame, input.targetFrame - 1);
    const queued = enqueue(state, { matchId: state.matchId, id: input.id, action: { type: "overcharge", towerId: tower.id } });
    assert.equal(queued.targetFrame, input.targetFrame);
    advanceFrame(state);
  }
  while (state.frame < run.finalFrame) advanceFrame(state);
  assert.deepEqual(run.finalState, state);
  return {
    elapsedMs: run.elapsedMs, inputs: run.rows.length, firstFrame: run.firstFrame, finalFrame: run.finalFrame,
    renderedFrames: run.renderedFrames, highLoadSamples: run.highLoadFrames, maxPendingFramesIncludingStartup: run.maxPending,
    captureCount: run.captureCount, completedCommits: run.completedCommits, snapshotBytes: run.snapshotBytes,
    milliseconds: run.milliseconds, replayMatches: true,
    replaySha256: createHash("sha256").update(JSON.stringify(state)).digest("hex")
  };
}

assert.equal(on.mode, "on");
assert.equal(off.mode, "off");
assert.ok(on.completedCommits > 0);
assert.equal(off.completedCommits, 0);
assert.equal(off.captureCount, 0);
const [p95, p99] = on.milliseconds.confirmation;
const delta = p95 - off.milliseconds.confirmation[0];
assert.ok(p95 <= 100 && p99 <= 200 && delta <= 20, "desktop input confirmation exceeded V1 threshold");
console.log(JSON.stringify({ viewport: on.viewport, chrome: on.chrome, saveOn: verify(on), saveOff: verify(off),
  saveConfirmationP95DeltaMs: delta, performanceGatesPassed: true }, null, 2));
