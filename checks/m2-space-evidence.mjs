import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { evidenceVersions } from "../src/game/m2/evidence.ts";
import { containmentPoints, drain, newMatch } from "../src/game/m2/match.ts";
import { waves } from "../src/game/m2/waves.ts";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const files = readdirSync("dist", { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => `${entry.parentPath}/${entry.name}`)
  .sort()
  .map(file => ({ file, sha256: sha256(readFileSync(file)) }));
const seed = 811;
const run = newMatch("a02-evidence", seed);
const initialStateSha256 = sha256(JSON.stringify(run));
const samples = [37_000_000, 62_000_000, 82_000_000, 93_000_000, waves[2].startUs].map(nowUs => {
  run.clock.targetUs = nowUs;
  while (drain(run, 512) === "pending") {}
  const first = run.enemies[0];
  return { nowUs: run.queue.nowUs, wave: run.wave, rng: run.randomState,
    phase: run.phase, totalArrivals: run.totalArrivals, activeEnemies: run.enemies.length,
    points: containmentPoints(run), first: first && {
      id: first.id, unitId: first.unitId, wave: first.wave, x: first.x, y: first.y,
      previousWaypoint: first.previousWaypoint, waypoint: first.waypoint, insideRegions: first.insideRegions,
    } };
});
const inputs = [];
console.log(JSON.stringify({
  ...evidenceVersions, seed, configSha256: sha256(readFileSync("docs/m2-configuration.json")),
  buildSha256: sha256(JSON.stringify(files)), files, initialStateSha256,
  inputLogSha256: sha256(JSON.stringify(inputs)), inputs, samples, result: run.result,
}, null, 2));
