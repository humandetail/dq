import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { containmentPoints, drain, enqueue } from "../src/game/m2/match.ts";

const inputPath = process.argv[2] ?? "docs/evidence/m2-core-10/pf01-engine.json";
const source = JSON.parse(readFileSync(inputPath, "utf8"));
const state = source.fixture;
const testBook = process.argv.includes("--necronomicon");
// Controlled setup gives the challenge shop its stage-three prerequisites.
// The appointment, births and Wards below use the live command and event path.
state.challengeShopOpen = true;
state.challengeStages = [0, 0, 2, 0, 0, 0, 0, 0];
state.challengeReadyUs = 0;
const bookId = testBook ? state.nextId++ : null;
if (bookId !== null) state.inventory.push({ id: bookId, itemId: "i196", slot: 2, charges: 0, point: { ...state.worker } });
const initial = structuredClone(state);
const commands = [];
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function advance(delta) {
  state.clock.targetUs = state.queue.nowUs + delta;
  while (drain(state, 512) === "pending") {}
}
function command(action) {
  const input = { id: "pf02-" + (commands.length + 1), matchId: state.matchId, action };
  const atUs = state.queue.nowUs;
  assert.equal(enqueue(state, input), true);
  advance(1);
  const outcome = state.commandResults[input.id];
  assert.equal(outcome?.ok, true);
  commands.push({ atUs, ...input, outcome });
  return outcome.createdId;
}
const pack = state.inventory.find(item => item.itemId === "i004");
command({ type: "use-item", itemId: pack.id });
const cardId = command({ type: "choose-opening", card: "i569" });
const towerId = command({ type: "build-card", cardId, point: { x: state.worker.x, y: state.worker.y } });
advance(1_000_000);
command({ type: "learn-skill", towerId, skillId: "A094" });
const challengeId = command({ type: "reserve-challenge", unitId: "m523" });
if (bookId !== null) {
  command({ type: "transfer-item", itemId: bookId, towerId });
  command({ type: "cast-equipment", itemId: bookId, towerId });
}
const seen = new Set();
let wardPeak = 0;
let bookPeak = 0;
let detectorPeak = 0;
let simultaneous = false;
let peak;
let challengePeak = 0;
for (let index = 0; index < 25 * 8; index++) {
  advance(125_000);
  assert.equal(state.phase, "running");
  const waveCreatures = state.enemies.filter(enemy => enemy.challengeId === challengeId);
  for (const enemy of waveCreatures) {
    assert.equal(enemy.unitId, "m523");
    assert.equal(enemy.points, 3);
    seen.add(enemy.id);
  }
  const allies = state.summons?.filter(summon => summon.summon.ownerId === towerId) ?? [];
  const wards = allies.filter(summon => /^b12/.test(summon.templateId));
  const archers = allies.filter(summon => summon.templateId === "b110");
  const detectors = state.detectors?.filter(detector => detector.ownerId === towerId) ?? [];
  bookPeak = Math.max(bookPeak, archers.length);
  detectorPeak = Math.max(detectorPeak, detectors.length);
  simultaneous ||= waveCreatures.length === 12 && wards.length >= 8 && archers.length >= 1 && detectors.length >= 1;
  wardPeak = Math.max(wardPeak, wards.length);
  challengePeak = Math.max(challengePeak, waveCreatures.length);
  const bytes = Buffer.byteLength(JSON.stringify(state));
  if (!peak || bytes > peak.bytes) peak = {
    atUs: state.queue.nowUs, bytes, allies: state.structures.length, wards: wards.length, necromancyArchers: archers.length, detectors: detectors.length, enemies: state.enemies.length,
    points: containmentPoints(state), pendingEvents: state.queue.pending.length, challengeUnits: waveCreatures.length,
  };
}
assert.equal(seen.size, 12);
assert.equal(challengePeak, 12);
assert.ok(wardPeak >= 8, wardPeak);
if (testBook) assert.ok(simultaneous, "Missing concurrent wards, book archer, detector and challenge");
console.log(JSON.stringify({
  fixtureId: "PF02", status: "partial-engine-fixture", seed: source.seed, contentVersion: source.contentVersion,
  bundle: source.bundle, bundleSha256: source.bundleSha256, initialSha256: digest(initial),
  inputsSha256: digest(commands), commands, initial, challengeEnemyIds: [...seen], challengePeak, wardPeak, bookPeak, detectorPeak, simultaneous, peak,
  missing: [...(testBook ? [] : ["i196"]), "i722", "敌方辅助实体完整覆盖", "候选 HTTPS 桌面性能"],
}, null, 2));
