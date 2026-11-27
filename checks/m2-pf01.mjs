import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { evidenceVersions } from "../src/game/m2/evidence.ts";
import { m3ConfigVersion, m3ContentVersion, m3SaveFormatVersion } from "../src/game/m2/m3-version.ts";
import { map } from "../src/game/m2/map.ts";
import { containmentPoints, drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { waves } from "../src/game/m2/waves.ts";
import { recordPeakSnapshots } from "./m3-peak-snapshots.mjs";

const digest = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const challengeBase = process.argv.includes("--pf02-base");
const seed = challengeBase ? 8 : 811;
const run = newMatch("pf01", seed);
const [opening, wave, next] = waves;
const beforeFirstBatch = wave.startUs - 1;
function advanceTo(state, time, slice = 10_000) {
  state.clock.targetUs = time;
  while (drain(state, slice) === "pending") {}
}
advanceTo(run, beforeFirstBatch);
assert.equal(run.enemies.length, opening.batches);
// Controlled setup ends before C01. Fill the gap with copies of the existing
// wave's own template on separate road positions, then use the genuine queue.
const residual = 100 - wave.unitsPerBatch;
const addedEnemyIds = [];
while (containmentPoints(run) < residual) {
  const index = addedEnemyIds.length;
  const id = run.nextId++;
  run.enemies.push({ ...structuredClone(run.enemies[0]), id,
    x: -400 + 20 * (index % 41), y: 448,
    insideRegions: [], waypoint: 3, previousWaypoint: null, path: undefined, initialOverlaps: [] });
  addedEnemyIds.push(id);
}
advanceTo(run, wave.startUs);
assert.equal(run.phase, "running");
assert.equal(run.batch, 1);
assert.equal(containmentPoints(run), 100);

function metrics(state) {
  return { atUs: state.queue.nowUs, wave: state.wave, batch: state.batch,
    phase: state.phase, points: containmentPoints(state), enemies: state.enemies.length,
    allied: state.structures.length, summons: state.summons?.length ?? 0,
    projectiles: state.queue.pending.filter(event => event.payload.type === "weapon-impact").length,
    queued: state.queue.pending.length, bytes: Buffer.byteLength(JSON.stringify(state)) };
}
const command = { id: "pf01-build", matchId: run.matchId,
  action: { type: "build-worker-tower", tower: "n001", point: map.worker } };
const fixtureSha256 = digest(run);
const originalEnemyIds = run.enemies.map(enemy => enemy.id);
const inputLogSha256 = digest([command]);
const peaks = {};
const peakState = structuredClone(run);
assert.equal(enqueue(peakState, command), true);
for (let sampleUs = peakState.queue.nowUs; !challengeBase && sampleUs < next.startUs; sampleUs += 125_000) {
  advanceTo(peakState, sampleUs);
  recordPeakSnapshots(peaks, peakState, { caseId: "PF01", seed, inputLogSha256 });
}
const attempts = [];
let expected;
for (const limit of challengeBase ? [] : [10_000, 64, 4]) {
  const state = JSON.parse(JSON.stringify(run));
  assert.equal(enqueue(state, command), true);
  advanceTo(state, wave.startUs + wave.intervalUs, limit);
  assert.equal(state.batch, 2);
  assert.equal(state.enemies.length, 101);
  assert.equal(state.phase, "running");
  assert.equal(containmentPoints(state), 101);
  const overLimit = metrics(state);
  advanceTo(state, wave.startUs + 12_000_000, limit);
  assert.equal(state.commandResults[command.id].ok, true);
  assert.ok(state.enemies.some(enemy => run.enemies.some(before => before.id === enemy.id && (enemy.x !== before.x || enemy.y !== before.y))));
  assert.ok(state.structures[0].lastAttackUs > wave.startUs);
  const inBattle = metrics(state);
  assert.ok(inBattle.points > 100);
  const snapshot = JSON.parse(JSON.stringify(state));
  advanceTo(snapshot, next.startUs, limit);
  assert.equal(snapshot.result.reason, "capacity");
  assert.equal(snapshot.result.atUs, next.startUs);
  assert.equal(snapshot.result.points, containmentPoints(snapshot));
  expected ??= snapshot;
  assert.deepEqual(snapshot, expected);
  attempts.push({ sliceEventLimit: limit, overLimit, inBattle, terminal: metrics(snapshot), result: snapshot.result });
}

const index = readFileSync("dist/m2.html", "utf8");
const bundle = index.match(/src="\.?((?:\/assets\/)m2-[^"]+\.js)"/)?.[1];
assert.ok(bundle, "Built application bundle missing from dist/m2.html");
const isM3 = Object.hasOwn(run, "openingCandidates");
const versions = isM3 ? { ...evidenceVersions, contentVersion: m3ContentVersion, configVersion: m3ConfigVersion,
  saveFormatVersion: m3SaveFormatVersion } : evidenceVersions;
const config = isM3 ? "docs/m3-configuration.json" : "docs/m2-configuration.json";
console.log(JSON.stringify({ ...versions, fixtureId: challengeBase ? "PF02-base" : "PF01", seed, fixtureSha256,
  source: { controlled: true, addedEnemyIds }, configSha256: digest(readFileSync(config, "utf8")),
  bundle, bundleSha256: createHash("sha256").update(readFileSync("dist" + bundle)).digest("hex"),
  inputLogSha256, nextCheckUs: next.startUs, start: metrics(run), originalEnemyIds,
  command, attempts, peaks, fixture: run }, null, 2));
