// Fork a recorded normal trajectory only after the input that really drew i571.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { qualificationChains, towerLevels } from "../src/game/m2/content.ts";
import { learningLevel } from "../src/game/m2/hero.ts";
import { creditTime, drain, enqueue, heroAllySpellTargets, inspectBuildPlacement, newMatch } from "../src/game/m2/match.ts";
import { contains, gridSize, map } from "../src/game/m2/map.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";

const hash = data => createHash("sha256").update(data).digest("hex");
const [path, legacyDrawId] = process.argv.slice(2);
const allowRecycling = process.env.M3_R04_WISP_PLACEMENT === "1";
assert.ok(path, "Pass archived normal evidence with an actual i571 draw");
const evidence = JSON.parse(await readFile(path, "utf8"));
const [record] = evidence.runs;
assert.equal(evidence.configSha256, hash(await readFile(new URL("../docs/m2-configuration.json", import.meta.url))));
assert.equal(evidence.targetConfigSha256, hash(await readFile(new URL("../docs/m3-configuration.json", import.meta.url))));
assert.equal(record.inputLogSha256, hash(JSON.stringify(record.inputs)));
const state = newMatch(`normal-${record.seed}`, record.seed, startSeasons().seasons);
assert.equal(hash(JSON.stringify(state)), record.initialStateSha256);

function advance(target) {
  creditTime(state, (target - state.queue.nowUs) / 1000);
  while (drain(state, 10_000) === "pending") {}
}

const drawIndex = record.inputs.findIndex(entry => entry.outcome?.ok && (legacyDrawId ?
  entry.action.type === "draw" && entry.outcome.createdId === Number(legacyDrawId) : entry.acquisition?.obtainedCard === "i571"));
assert.ok(drawIndex >= 0);
const prefix = record.inputs.slice(0, drawIndex + 1);
for (const [index, input] of prefix.entries()) {
  advance(input.atUs);
  assert.ok(enqueue(state, { id: String(index + 1), matchId: state.matchId, action: input.action }));
}
advance(prefix.at(-1).atUs + 1);
for (const [index, input] of prefix.entries()) assert.deepEqual(state.commandResults[index + 1], input.outcome, `recorded input ${index + 1}`);
const draw = state.cards.find(card => card.id === prefix.at(-1).outcome.createdId && card.card === "i571");
assert.ok(draw?.slot !== null && draw, "The normal recorded draw must produce the carried base card");
const forkAt = { atUs: state.queue.nowUs, wave: state.wave, draw: structuredClone(draw), nextInput: prefix.length,
  snapshotSha256: hash(JSON.stringify(state)), progress: structuredClone(state.seasons) };
const follow = [];
function send(action) {
  const id = String(prefix.length + follow.length + 1);
  const atUs = state.queue.nowUs;
  if (!enqueue(state, { id, matchId: state.matchId, action })) return;
  advance(atUs + 1);
  for (let retry = 0; retry < 44 && state.phase === "running" && !state.commandResults[id]; retry++) advance(state.queue.nowUs + 250_000);
  const result = state.commandResults[id];
  follow.push({ atUs, action, result });
  return result;
}

const sites = [{ x: -96, y: -416 }, { x: 96, y: -416 }, { x: -288, y: -640 }, { x: 192, y: -32 }];
const originalHero = state.structures.find(tower => tower.hero?.level > 0);
assert.ok(originalHero);
const buildSites = [...sites];
if (allowRecycling) {
  for (const area of map.buildAreas) {
    for (let y = area.minY; y <= area.maxY; y += gridSize) {
      for (let x = area.minX; x <= area.maxX; x += gridSize) {
        if (Math.hypot(x - originalHero.x, y - originalHero.y) <= 750) buildSites.push({ x, y });
      }
    }
  }
}
const providers = qualificationChains.get(originalHero.qualification)?.levels.map(level => level.id) ?? [];
const populationNeeded = Math.max(draw.hp, towerLevels.get("H033").fields.fused.value);
let wispId;
let maxOvercharge = 0;
while (state.phase === "running" && state.wave < 20 && !state.seasons.spring.counts[3]) {
  for (const [slot, value] of (state.waveRewardSlots ?? []).entries()) if (value === 2) send({ type: "claim-wave", slot });
  if (!wispId && !state.approach) {
    const action = { type: "build-card", cardId: draw.id };
    const point = buildSites.find(point => inspectBuildPlacement(state, { ...action, point }).ok);
    if (point) wispId = send({ ...action, point })?.createdId;
    else if (allowRecycling && state.population + populationNeeded > state.populationLimit) {
      const spare = state.structures.find(tower => !tower.hero && !tower.pending && !providers.includes(tower.templateId) &&
        !state.inventory.some(item => item.slot !== null && item.towerId === tower.id));
      if (spare) {
        if (Math.hypot(spare.x - state.worker.x, spare.y - state.worker.y) <= 1000)
          send({ type: "recycle-tower", towerId: spare.id });
        else send({ type: "move-worker", point: { x: spare.x, y: spare.y } });
      }
    }
  }
  const wisp = state.structures.find(tower => tower.id === wispId && !tower.pending);
  if (wisp?.hero) {
    for (const skillId of ["A111", "A113", "A112"]) {
      const required = learningLevel(wisp.hero, wisp.templateId, skillId);
      if (!wisp.hero.ranks[skillId] && required !== undefined && wisp.hero.level >= required && wisp.hero.points)
        send({ type: "learn-skill", towerId: wisp.id, skillId });
    }
    if (wisp.hero.level < 6 && state.gold >= 3500 && !state.approach) {
      const book = send({ type: "buy-book", bookId: "i128" });
      if (book?.ok) send({ type: "use-book", itemId: book.createdId, towerId: wisp.id });
    }
    const ready = id => state.queue.nowUs >= Math.max(wisp.heroCastUntilUs ?? 0, wisp.heroSpellReady?.[id] ?? 0);
    if (wisp.hero.ranks.A111 && !wisp.wispLink && ready("A111") &&
        heroAllySpellTargets(state, wisp, "A111").some(target => target.id === originalHero.id)) {
      send({ type: "cast-hero", towerId: wisp.id, skillId: "A111", targetId: originalHero.id });
    }
    if (wisp.wispLink) {
      if (wisp.hero.ranks.A112 && !wisp.wispOverload && state.queue.nowUs >= (wisp.wispOverloadReadyUs ?? 0))
        send({ type: "cast-hero", towerId: wisp.id, skillId: "A112" });
      maxOvercharge = Math.max(maxOvercharge, wisp.wispLink.boost?.amount ?? 0);
      if (wisp.hero.ranks.A113 && ready("A113")) {
        const point = sites.find(point => map.buildAreas.some(area => contains(area, point)) &&
          !map.obstacles.some(area => contains(area, point)) && Math.hypot(point.x - originalHero.x, point.y - originalHero.y) >= 180);
        if (point) send({ type: "cast-hero", towerId: wisp.id, skillId: "A113", point });
      }
    }
  }
  advance(state.queue.nowUs + 3_000_000);
}

console.log(JSON.stringify({ kind: "normal-recorded-draw-fork", seed: record.seed, inputLogSha256: record.inputLogSha256,
  forkAt, follow, wispId, maxOvercharge, progress: state.seasons, allowRecycling,
  end: { phase: state.phase, wave: state.wave, atUs: state.queue.nowUs, population: state.population, limit: state.populationLimit, result: state.result } }, null, 2));
