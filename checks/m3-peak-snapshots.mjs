import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { containmentPoints } from "../src/game/m2/match.ts";

const criteria = ["snapshotBytes", "queuedEvents", "entities"];

function snapshotLoad(state, bytes) {
  const enemyCarriers = state.queue.pending.filter(event => event.payload.type === "untouchable-carrier-expire").length;
  return {
    snapshotBytes: bytes,
    queuedEvents: state.queue.pending.length,
    entities: state.structures.length + state.enemies.length + (state.summons?.length ?? 0) + (state.detectors?.length ?? 0) + enemyCarriers,
    enemies: state.enemies.length,
    allies: state.structures.length,
    summons: state.summons?.length ?? 0,
    detectors: state.detectors?.length ?? 0,
    ...(enemyCarriers ? { enemyCarriers } : {}),
    containment: containmentPoints(state),
    projectiles: state.queue.pending.filter(event => event.payload.type === "weapon-impact").length,
  };
}

export function recordPeakSnapshots(peaks, state, metadata) {
  if (state.phase !== "running") return;
  const serialized = JSON.stringify(state);
  const load = snapshotLoad(state, Buffer.byteLength(serialized));
  const improved = criteria.filter(criterion => load[criterion] > (peaks[criterion]?.load[criterion] ?? -1));
  if (!improved.length) return;
  const sample = { ...metadata, atUs: state.queue.nowUs, load,
    snapshotSha256: createHash("sha256").update(serialized).digest("hex"), snapshot: JSON.parse(serialized) };
  for (const criterion of improved) peaks[criterion] = sample;
}

if (import.meta.main) {
  const paths = process.argv.slice(2).filter(arg => arg !== "--trial");
  assert.ok(paths.length, "Pass PF01, PF02 and normal-run JSON files");
  const trial = process.argv.includes("--trial");
  const selected = {};
  const sources = [];
  const normalSeeds = new Set();
  const fixtures = new Set();
  let version;
  let targetConfigSha256;
  for (const path of paths) {
    const evidence = JSON.parse(await readFile(path, "utf8"));
    version ??= evidence.contentVersion;
    assert.ok(version?.startsWith("m3-"), "Expected M3 evidence");
    assert.equal(evidence.contentVersion, version, path + " content version");
    const configHash = evidence.targetConfigSha256 ?? evidence.configSha256;
    targetConfigSha256 ??= configHash;
    if (!trial) {
      assert.match(configHash ?? "", /^[a-f0-9]{64}$/, path + " missing M3 target configuration SHA-256");
      assert.equal(configHash, targetConfigSha256, path + " target configuration");
    }
    const rows = evidence.runs ?? [evidence];
    for (const row of rows) {
      if (!row.peaks) continue;
      if (row.fixtureId) fixtures.add(row.fixtureId);
      else if (row.result && !row.eventEvidence && !row.qualificationEvidence && !row.ssrEvidence) normalSeeds.add(row.seed);
      sources.push({ path, seed: row.seed, caseId: row.fixtureId ?? "normal", configHash });
      for (const criterion of criteria) {
        const point = row.peaks[criterion];
        assert.ok(point?.snapshot && point.load[criterion] > 0, path + " missing " + criterion);
        const serialized = JSON.stringify(point.snapshot);
        assert.equal(createHash("sha256").update(serialized).digest("hex"), point.snapshotSha256);
        assert.equal(point.snapshot.phase, "running");
        assert.equal(point.atUs, point.snapshot.queue.nowUs);
        assert.deepEqual(point.load, snapshotLoad(point.snapshot, Buffer.byteLength(serialized)));
        if (point.load[criterion] > (selected[criterion]?.load[criterion] ?? -1)) selected[criterion] = point;
      }
    }
  }
  assert.deepEqual(Object.keys(selected).sort(), [...criteria].sort(), "All three peak criteria are required");
  if (!trial) {
    assert.ok(fixtures.has("PF01") && fixtures.has("PF02") && normalSeeds.size >= 4,
      "PF03 needs both fixed scenarios and at least four distinct normal terminal trajectories");
  }
  console.log(JSON.stringify({ fixtureId: "PF03", status: trial ? "early-selection" : "selected",
    contentVersion: version, ...(!trial && { targetConfigSha256 }), normalSeeds: [...normalSeeds], sources, selected }, null, 2));
}
