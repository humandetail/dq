// Export checkpoints from a recorded ordinary run, with original commands and outcomes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { creditTime, drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { waves } from "../src/game/m2/waves.ts";
import { mapVersion } from "../src/game/m2/map.ts";
import { m3ConfigVersion, m3ContentVersion } from "../src/game/m2/m3-version.ts";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const [recordPath, output] = process.argv.slice(2);
assert.ok(recordPath && output, "Pass a per-seed normal result and a new output file");
const bundle = JSON.parse(await readFile(recordPath, "utf8"));
const [record] = bundle.runs;
assert.equal(bundle.runs.length, 1);
assert.equal(bundle.kind, "normal-engine-source");
assert.equal(bundle.configurationVersion, m3ConfigVersion);
assert.equal(bundle.contentVersion, m3ContentVersion);
assert.equal(bundle.mapVersion, mapVersion);
assert.equal(bundle.configSha256, sha256(await readFile(new URL("../docs/m2-configuration.json", import.meta.url))));
assert.equal(bundle.targetConfigSha256, sha256(await readFile(new URL("../docs/m3-configuration.json", import.meta.url))));
assert.equal(record.inputLogSha256, sha256(JSON.stringify(record.inputs)));
assert.ok(record.result?.atUs, "The observed input trajectory must reach a real terminal");

const initial = startSeasons();
const state = newMatch(`normal-${record.seed}`, record.seed, initial.seasons);
if (record.seasonEvidence || record.masteryEvidence) state.startingScore = initial.score;
assert.equal(sha256(JSON.stringify(state)), record.initialStateSha256);
const earlyAt = waves[11].startUs + 500_000;
const bossAt = record.bossArrivalUs === null ? Infinity : (record.bossArrivalUs ?? waves[54].startUs) + 500_000;
const starts = {};

function advanceTo(targetUs) {
  if (targetUs <= state.queue.nowUs || state.phase !== "running") return;
  creditTime(state, (targetUs - state.queue.nowUs) / 1000);
  while (drain(state, 10_000) === "pending") {}
}

function capture(nextInput) {
  const json = JSON.stringify(state);
  return { atUs: state.queue.nowUs, wave: state.wave, population: state.population, limit: state.populationLimit, nextInput,
    snapshotSha256: sha256(json), snapshot: JSON.parse(json) };
}

for (const [index, entry] of record.inputs.entries()) {
  if (!starts.sustained && entry.atUs >= earlyAt) {
    advanceTo(earlyAt);
    if (state.phase === "running" && state.wave === 12) starts.sustained = capture(index);
  }
  if (!starts.boss && entry.atUs >= bossAt) {
    advanceTo(bossAt);
    if (state.phase === "running" && state.enemies.some(enemy => enemy.unitId === "mBOS")) starts.boss = capture(index);
  }
  advanceTo(entry.atUs);
  if (!starts.population && state.phase === "running" && state.population >= 90 && state.population <= 100)
    starts.population = capture(index);
  const id = String(index + 1);
  assert.ok(enqueue(state, { id, matchId: state.matchId, action: entry.action }), `command ${id}`);
}
advanceTo(record.result.atUs);
for (const [index, entry] of record.inputs.entries())
  assert.deepEqual(state.commandResults[String(index + 1)], entry.outcome, `command outcome ${index + 1}`);
assert.deepEqual(state.result, record.result);
assert.ok(starts.sustained, "The original trajectory ended before the early W12 checkpoint");
assert.ok(record.result.atUs - starts.sustained.atUs >= 2400 * 1_000_000, "The recorded trajectory cannot supply ten continuous real minutes at 4×");

await writeFile(output, JSON.stringify({ kind: "normal-replay-performance-starts", seed: record.seed,
  version: bundle.contentVersion, configuration: bundle.configurationVersion, mapVersion,
  initialStateSha256: record.initialStateSha256, inputLogSha256: record.inputLogSha256, targetConfigSha256: bundle.targetConfigSha256,
  starts, result: record.result, inputs: record.inputs.slice(starts.sustained.nextInput) }, null, 2) + "\n", { flag: "wx" });
