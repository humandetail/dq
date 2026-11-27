// The branch begins from a verified ordinary input prefix and keeps the same W45 reward.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { weapons } from "../src/game/m2/combat.ts";
import { ordinaryGoods } from "../src/game/m2/content.ts";
import { containmentPoints, creditTime, drain, enqueue, newMatch, qualified } from "../src/game/m2/match.ts";
import { contains, map, mapVersion } from "../src/game/m2/map.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { waves } from "../src/game/m2/waves.ts";
import { m3ConfigVersion, m3ContentVersion } from "../src/game/m2/m3-version.ts";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const [inputPath, mode, output, terminal] = process.argv.slice(2);
assert.ok(inputPath && ["hold", "defend", "supply"].includes(mode) && output && terminal,
  "Pass an A10 result, a mode (hold, defend, supply), a new trace path and a new terminal snapshot path");
const packageEvidence = JSON.parse(await readFile(inputPath, "utf8"));
const [record] = packageEvidence.runs;
assert.equal(record.seed, 20261124);
assert.equal(record.result?.reason, "boss-killed");
assert.equal(packageEvidence.contentVersion, m3ContentVersion);
assert.equal(packageEvidence.configurationVersion, m3ConfigVersion);
assert.equal(packageEvidence.mapVersion, mapVersion);
assert.equal(packageEvidence.configSha256, sha256(await readFile(new URL("../docs/m2-configuration.json", import.meta.url))));
assert.equal(packageEvidence.targetConfigSha256, sha256(await readFile(new URL("../docs/m3-configuration.json", import.meta.url))));
assert.equal(record.inputLogSha256, sha256(JSON.stringify(record.inputs)));
const match = newMatch(`normal-${record.seed}`, record.seed, startSeasons().seasons);
assert.equal(sha256(JSON.stringify(match)), record.initialStateSha256);

const reward = record.inputs.find(entry => entry.action.type === "claim-wave" && entry.action.slot === 4 && entry.outcome?.ok);
assert.ok(reward, "The original route must really claim the W45 reward");
const itemId = reward.outcome.createdId;
const originalUse = record.inputs.findIndex(entry => entry.action.type === "use-item" && entry.action.itemId === itemId);
assert.ok(originalUse >= 0, "The original route must identify its earlier charm use");
const bankIndex = mode === "supply" ? record.inputs.findIndex(entry => entry.atUs >= waves[48].startUs &&
  entry.action.type === "draw" && entry.action.draw === "i002") : -1;
const forkAtUs = mode === "hold" ? record.inputs[originalUse].atUs :
  mode === "supply" ? record.inputs[bankIndex].atUs : waves[50].startUs;
const forkIndex = mode === "hold" ? originalUse : mode === "supply" ? bankIndex :
  record.inputs.findIndex(entry => entry.atUs >= forkAtUs);
assert.ok(forkIndex > 0 && forkIndex <= originalUse);
const clockEnd = record.bossArrivalUs + 2_000_000;

function advance(atUs) {
  if (atUs <= match.queue.nowUs || match.phase !== "running") return;
  creditTime(match, (atUs - match.queue.nowUs) / 1000);
  while (drain(match, 10_000) === "pending") {}
}

for (const [index, entry] of record.inputs.slice(0, forkIndex).entries()) {
  advance(entry.atUs);
  const id = String(index + 1);
  assert.ok(enqueue(match, { id, matchId: match.matchId, action: entry.action }), `original command ${id}`);
}
advance(forkAtUs);
for (const [index, entry] of record.inputs.slice(0, forkIndex).entries())
  assert.deepEqual(match.commandResults[String(index + 1)], entry.outcome, `original receipt ${index + 1}`);
const item = match.inventory.find(entry => entry.id === itemId);
assert.ok(item && item.itemId === "i278" && item.towerId === undefined && item.slot !== null && item.charges === 1);
if (mode === "defend") assert.equal(match.wave, 51);
if (mode === "supply") assert.equal(match.wave, 49);
const fork = { atUs: match.queue.nowUs, wave: match.wave, points: containmentPoints(match), item: structuredClone(item),
  gold: match.gold,
  verifiedInputCount: forkIndex, sourceInputSha256: record.inputLogSha256, snapshotSha256: sha256(JSON.stringify(match)) };

const follow = [];
const pressure = {};
const skippedInputs = [];
function send(action, originalOutcome) {
  const id = String(forkIndex + follow.length + 1);
  const atUs = match.queue.nowUs;
  if (!enqueue(match, { id, matchId: match.matchId, action })) return;
  advance(atUs + 1);
  const result = match.commandResults[id];
  follow.push({ id, atUs, action, ...(originalOutcome && { originalOutcome }), ...(result && { result }) });
  return result;
}

function defense() {
  const points = containmentPoints(match);
  if (points > (pressure[match.wave]?.points ?? -1)) {
    pressure[match.wave] = { atUs: match.queue.nowUs, points, enemies: match.enemies.length };
  }
  const hero = match.structures.find(unit => unit.templateId === "H038" && !unit.pending && (unit.life?.hp ?? 1) > 0);
  if (!hero || points < 65) return;
  const now = match.queue.nowUs;
  const threats = match.enemies.filter(enemy => contains(map.containment, enemy) && enemy.hp > 0);
  const nearby = origin => threats.filter(enemy => Math.hypot(enemy.x - origin.x, enemy.y - origin.y) <= 850);
  const local = nearby(hero);
  if (mode === "defend" && hero.scepterSwap && hero.scepterSwap.readyUs <= now && (hero.heroCastUntilUs ?? 0) <= now) {
    const relays = match.structures.filter(unit => unit !== hero && !unit.pending && (unit.life?.hp ?? 1) > 0)
      .map(unit => ({ unit, count: nearby(unit).length })).sort((a, b) => b.count - a.count || a.unit.id - b.unit.id);
    if (relays[0]?.count >= local.length + 5 && send({ type: "cast-scepter-swap", towerId: hero.id, targetId: relays[0].unit.id })?.ok)
      return;
  }
  if (hero.hero.ranks.A152 && Math.max(hero.heroSpellReady?.A152 ?? 0, hero.heroCastUntilUs ?? 0) <= now) {
    const targets = threats.filter(enemy => Math.hypot(enemy.x - hero.x, enemy.y - hero.y) <= 1000);
    const scored = targets.map(target => {
      const length = Math.hypot(target.x - hero.x, target.y - hero.y);
      if (!length) return { target, count: 0 };
      const dx = (target.x - hero.x) / length, dy = (target.y - hero.y) / length;
      const count = threats.filter(other => {
        const x = other.x - hero.x, y = other.y - hero.y;
        const along = x * dx + y * dy;
        return along >= -300 && along <= 1000 && Math.abs(x * dy - y * dx) <= 300;
      }).length;
      return { target, count };
    }).sort((a, b) => b.count - a.count || a.target.id - b.target.id);
    if (scored[0]?.count >= 4) send({ type: "cast-hero", towerId: hero.id, skillId: "A152",
      point: { x: scored[0].target.x, y: scored[0].target.y } });
  }
  if (mode === "supply") return;
  const weakest = threats.toSorted((a, b) => a.hp - b.hp || a.id - b.id);
  const assigned = new Set();
  for (const tower of match.structures.filter(unit => !unit.pending && unit.id !== hero.id).slice(0, 6)) {
    const target = weakest.find(enemy => !assigned.has(enemy.id) && weapons[tower.templateId]?.some(weapon => {
      const range = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
      return range >= weapon.min && range <= weapon.max && weapon.targets.includes(enemy.layer === "fly" ? "air" : "ground");
    }));
    if (target) {
      assigned.add(target.id);
      if (tower.focusTarget !== target.id) send({ type: "focus-target", towerId: tower.id, targetId: target.id });
    }
  }
}

function buySupportGear() {
  const hero = match.structures.find(unit => unit.templateId === "H038" && !unit.pending && (unit.life?.hp ?? 1) > 0);
  if (!hero || !qualified(match, hero.id)) return;
  const equipment = unit => match.inventory.filter(entry => entry.slot !== null && entry.towerId === unit.id);
  const loadout = equipment(hero);
  const itemId = ["i327", "i282"].find(id => !loadout.some(entry => entry.itemId === id));
  if (!itemId) return;
  const carried = match.inventory.find(entry => entry.itemId === itemId && entry.slot !== null && entry.towerId === undefined);
  const slotsUsed = match.cards.filter(card => card.slot !== null).length + (match.books?.length ?? 0) +
    match.inventory.filter(entry => entry.slot !== null && entry.towerId === undefined).length;
  if (!carried && (match.gold < ordinaryGoods.get(itemId).gold || slotsUsed >= 6)) return;
  if (Math.hypot(hero.x - match.worker.x, hero.y - match.worker.y) > 1000) {
    send({ type: "move-worker", point: { x: hero.x, y: hero.y } });
    return;
  }
  if (loadout.length === 6) {
    const replaced = loadout.find(entry => entry.itemId === (itemId === "i327" ? "i198" : "i204"));
    const partner = match.structures.find(unit => unit !== hero && !unit.pending && (unit.life?.hp ?? 1) > 0 &&
      Math.hypot(unit.x - hero.x, unit.y - hero.y) <= 800 && equipment(unit).length < 6 &&
      (itemId === "i327" || qualified(match, unit.id)));
    if (!replaced || !partner || !send({ type: "transfer-item", itemId: replaced.id, towerId: partner.id })?.ok) return;
  }
  const instance = carried?.id ?? send({ type: "buy-item", itemId })?.createdId;
  if (instance !== undefined) send({ type: "transfer-item", itemId: instance, towerId: hero.id });
}

let cursor = forkIndex;
let nextDecision = match.queue.nowUs;
let charm;
while (match.phase === "running" && match.queue.nowUs < clockEnd) {
  const boss = match.enemies.find(enemy => enemy.unitId === "mBOS");
  if (boss) {
    const before = { kills: match.kills ?? 0, gold: match.gold, score: match.killScore ?? 0, atUs: match.queue.nowUs, boss: boss.id };
    assert.ok(match.inventory.find(held => held.id === itemId && held.towerId === undefined && held.slot !== null));
    const outcome = send({ type: "use-item", itemId });
    const remainingItem = match.inventory.find(held => held.id === itemId);
    const after = { kills: match.kills ?? 0, gold: match.gold, score: match.killScore ?? 0, result: match.result,
      finalHit: match.finalHit ?? null, remaining: match.enemies.length, remainingCharges: remainingItem?.charges ?? 0 };
    assert.equal(outcome?.ok, true);
    assert.equal(after.result?.reason, "boss-killed");
    assert.equal(after.kills, before.kills);
    assert.equal(after.gold, before.gold);
    assert.equal(after.finalHit, null);
    assert.equal(after.remaining, 0);
    assert.equal(remainingItem, undefined);
    assert.equal(after.score, Math.floor(before.kills * 2.5 / 100));
    const settled = sha256(JSON.stringify(match));
    assert.equal(enqueue(match, { id: "repeat-a11", matchId: match.matchId, action: { type: "use-item", itemId } }), false);
    assert.equal(sha256(JSON.stringify(match)), settled);
    charm = { itemId, before, after, outcome, repeatRejected: true };
    break;
  }
  while (cursor < record.inputs.length && record.inputs[cursor].atUs <= match.queue.nowUs) {
    const entry = record.inputs[cursor++];
    if (cursor - 1 === originalUse || (mode === "supply" && (entry.action.type === "draw" ||
        (entry.atUs > record.inputs[originalUse].atUs && entry.action.type !== "move-worker")))) {
      skippedInputs.push({ index: cursor - 1, ...entry });
    } else send(entry.action, entry.outcome);
  }
  if (mode !== "hold" && match.queue.nowUs >= nextDecision) {
    if (mode === "supply") buySupportGear();
    defense();
    nextDecision = match.queue.nowUs + 2_000_000;
  }
  const nextInput = record.inputs[cursor]?.atUs ?? Infinity;
  advance(Math.min(match.queue.nowUs + 500_000, Math.max(match.queue.nowUs + 1, nextInput), clockEnd));
}
for (const entry of follow) entry.finalOutcome = match.commandResults[entry.id];

const trace = { kind: "normal-a11-charm-fork", mode, seed: record.seed, fork, charm, follow, pressure, skippedInputs,
  end: { phase: match.phase, wave: match.wave, atUs: match.queue.nowUs, points: containmentPoints(match), result: match.result } };
await writeFile(output, JSON.stringify(trace, null, 2) + "\n", { flag: "wx" });
if (charm) {
  const snapshot = JSON.parse(JSON.stringify(match));
  await writeFile(terminal, JSON.stringify({ kind: "replayed-normal-engine-terminal", seed: record.seed,
    contentVersion: m3ContentVersion, configVersion: m3ConfigVersion, mapVersion, initialStateSha256: record.initialStateSha256,
    inputLogSha256: sha256(JSON.stringify([record.inputs.slice(0, forkIndex), follow])),
    snapshotSha256: sha256(JSON.stringify(snapshot)), snapshot }, null, 2) + "\n", { flag: "wx" });
}
