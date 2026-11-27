import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { containmentPoints, drain, enqueue } from "../src/game/m2/match.ts";
import { recordPeakSnapshots } from "./m3-peak-snapshots.mjs";

const inputPath = process.argv[2] ?? "docs/evidence/m2-core-10/pf01-engine.json";
const source = JSON.parse(readFileSync(inputPath, "utf8"));
const state = source.fixture;
const isM3 = Object.hasOwn(state, "openingCandidates");
const testBook = process.argv.includes("--necronomicon");
const testRune = process.argv.includes("--illusion-rune");
// Controlled setup gives the challenge shop its stage-three prerequisites.
// The appointment, births and Wards below use the live command and event path.
state.challengeShopOpen = true;
state.challengeStages = [0, 0, 2, 0, 0, 0, 0, 0];
state.challengeReadyUs = 0;
const bookId = testBook ? state.nextId++ : null;
if (bookId !== null) state.inventory.push({ id: bookId, itemId: "i196", slot: 2, charges: 0, point: { ...state.worker } });
// This is a controlled peak fixture. Place the rune at legal pickup range,
// then use the genuine pickup, effect and expiry path in normal time order.
const runeId = testRune ? state.nextId++ : null;
if (runeId !== null) {
  state.inventory.push({ id: runeId, itemId: "i722", slot: null, charges: 0, point: { ...state.worker } });
  state.activeRuneId = runeId;
}
const initial = structuredClone(state);
const commands = [];
const peaks = {};
const peakMetadata = { caseId: "PF02", seed: source.seed };
recordPeakSnapshots(peaks, state, peakMetadata);
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function advance(delta) {
  state.clock.targetUs = state.queue.nowUs + delta;
  while (drain(state, 512) === "pending") {}
  recordPeakSnapshots(peaks, state, peakMetadata);
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
if (isM3) assert.ok(state.openingCandidates.includes("i569"), "PF02 needs a legitimately offered H029");
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
let illusionPeak = 0;
let fixture;
let peak;
let challengePeak = 0;
let carrierPeak = 0;
const carriers = new Map();
const windows = [];
const buildThroughUs = isM3 ? 40 : 25;
for (let index = 0; index < buildThroughUs * 8; index++) {
  if (runeId !== null && index === (isM3 ? 24 : 16) * 8) command({ type: "pick-up-item", itemId: runeId });
  advance(125_000);
  assert.equal(state.phase, "running");
  const waveCreatures = state.enemies.filter(enemy => enemy.challengeId === challengeId);
  for (const enemy of waveCreatures) {
    assert.equal(enemy.unitId, "m523");
    assert.equal(enemy.points, 3);
    seen.add(enemy.id);
  }
  const activeCarriers = state.queue.pending.filter(event => event.payload.type === "untouchable-carrier-expire" &&
    event.payload.rank === 3 && seen.has(event.payload.ownerId));
  for (const carrier of activeCarriers) carriers.set(carrier.timerId, carrier);
  carrierPeak = Math.max(carrierPeak, activeCarriers.length);
  const allies = state.summons?.filter(summon => summon.summon.ownerId === towerId) ?? [];
  const wards = allies.filter(summon => /^b12/.test(summon.templateId));
  const archers = allies.filter(summon => summon.templateId === "b110");
  const detectors = state.detectors?.filter(detector => detector.ownerId === towerId) ?? [];
  bookPeak = Math.max(bookPeak, archers.length);
  detectorPeak = Math.max(detectorPeak, detectors.length);
  const illusions = allies.filter(summon => summon.summon.illusion && summon.summon.skillId === "i722");
  illusionPeak = Math.max(illusionPeak, illusions.length);
  const load = [waveCreatures.length, wards.length, archers.length, detectors.length, illusions.length, activeCarriers.length];
  if (load.some((count, index) => count !== windows.at(-1)?.load[index])) windows.push({ atUs: state.queue.nowUs, load });
  const concurrent = waveCreatures.length === 12 && wards.length >= 8 && archers.length >= 1 && detectors.length >= 1 &&
    (!testRune || illusions.length >= 1) && (!isM3 || activeCarriers.length > 0);
  if (concurrent) {
    simultaneous = true;
    fixture ??= structuredClone(state);
  }
  wardPeak = Math.max(wardPeak, wards.length);
  challengePeak = Math.max(challengePeak, waveCreatures.length);
  const bytes = Buffer.byteLength(JSON.stringify(state));
  if (!peak || bytes > peak.bytes) peak = {
    atUs: state.queue.nowUs, bytes, allies: state.structures.length, wards: wards.length, necromancyArchers: archers.length, detectors: detectors.length, enemies: state.enemies.length,
    points: containmentPoints(state), pendingEvents: state.queue.pending.length, challengeUnits: waveCreatures.length,
    enemyCarriers: activeCarriers.length,
  };
}
assert.equal(seen.size, 12);
assert.equal(challengePeak, 12);
assert.ok(wardPeak >= 8, wardPeak);
if (!simultaneous) console.error(JSON.stringify({ wardPeak, bookPeak, detectorPeak, illusionPeak, carrierPeak, windows }, null, 2));
if (testBook) assert.ok(simultaneous, "Missing concurrent wards, book archer, detector, challenge or requested illusion");
if (testRune) assert.ok(illusionPeak >= 1, "Missing actual i722 illusion");
if (isM3) assert.ok(carrierPeak > 0, "Missing m523 T140 carrier");
const inputsSha256 = digest(commands);
for (const point of Object.values(peaks)) point.inputLogSha256 = inputsSha256;
console.log(JSON.stringify({
  fixtureId: "PF02", status: isM3 && simultaneous ? "engine-fixture" : "partial-engine-fixture", seed: source.seed, contentVersion: source.contentVersion,
  configVersion: source.configVersion, configSha256: source.configSha256, mapVersion: source.mapVersion,
  bundle: source.bundle, bundleSha256: source.bundleSha256, initialSha256: digest(initial),
  inputsSha256, commands, initial, fixture, fixtureSha256: fixture && digest(fixture),
  illusionPeak, challengeEnemyIds: [...seen], challengePeak, wardPeak, bookPeak, detectorPeak, carrierPeak,
  enemyCarriers: [...carriers.values()], simultaneous, peak, peaks,
  missing: [...(testBook ? [] : ["i196"]), ...(testRune ? [] : ["i722"]), ...(isM3 ? [] : ["敌方辅助实体完整覆盖"]), "候选 HTTPS 桌面性能"],
}, null, 2));
