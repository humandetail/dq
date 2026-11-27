import assert from "node:assert/strict";
import { test } from "node:test";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { creditSeason, seasonDefinitions, startSeasons } from "../src/game/m2/seasons.ts";

const previousTasks = { spring: [4, 5, 6, 7, 8], summer: [2, 3, 4, 5, 6, 7, 8, 9] };
const restoredTasks = { spring: [1, 2, 3, 9], summer: [1] };
const archivedPoints = { spring: 180, summer: 270 };
const archivedRewards = { spring: 120, summer: 590 };
const unlocks = { spring: ["k543", "k541", "k156", "k200"], summer: ["k549", "k550", "k203", "k199"] };
const rewardedNodes = [1, 4, 7, 10, 15, 20, 25, 27, 28, 29, 30];

test("R04 ledger accepts the five restored tasks at their exact goals and each chain closes at 300 once", () => {
  const initial = startSeasons();
  assert.equal(initial.score, 60);
  const { seasons } = initial;
  for (const season of ["spring", "summer"]) {
    const definition = seasonDefinitions[season];
    let awarded = season === "spring" ? 50 : 10;
    for (const id of previousTasks[season]) {
      const goal = definition.tasks[id]["4"];
      awarded += creditSeason(seasons, season, id, goal);
    }
    assert.deepEqual([seasons[season].points, awarded], [archivedPoints[season], archivedRewards[season]]);
    for (const id of restoredTasks[season]) {
      const goal = definition.tasks[id]["4"];
      const before = seasons[season].points;
      assert.equal(creditSeason(seasons, season, id, goal - 1), 0);
      assert.equal(seasons[season].points, before);
      const restored = JSON.parse(JSON.stringify(seasons));
      const finalIncrement = definition.tasks[id]["6"] === 1 ? goal : 1;
      const reward = creditSeason(seasons, season, id, finalIncrement);
      assert.equal(creditSeason(restored, season, id, finalIncrement), reward);
      assert.deepEqual(restored[season], seasons[season]);
      assert.equal(creditSeason(restored, season, id, goal), 0);
      awarded += reward;
    }
    assert.equal(seasons[season].points, 300);
    assert.deepEqual(seasons[season].nodes, rewardedNodes);
    assert.deepEqual(seasons[season].unlocks, unlocks[season]);
    assert.equal(awarded, 1170);
    for (const [id, task] of Object.entries(definition.tasks)) assert.equal(seasons[season].counts[id], task["4"]);
    const refreshed = JSON.parse(JSON.stringify(seasons));
    for (const id of Object.keys(definition.tasks)) assert.equal(creditSeason(refreshed, season, Number(id), 10_000), 0);
    assert.deepEqual(refreshed, seasons);
  }
});

test("R04 Spring 2 is awarded only on the actual A112 tick that grants 1680", () => {
  const archive = startSeasons().seasons;
  for (const id of previousTasks.spring)
    creditSeason(archive, "spring", id, seasonDefinitions.spring.tasks[id]["4"]);
  const run = newMatch("r04-overcharge-controlled", 14, archive);
  run.queue.pending = [];
  const source = { ...map.worker, id: 900, templateId: "H033", pending: null, radius: 72, hero: newHero("H033") };
  source.hero.natural.INT = 2399;
  source.hero.ranks = { A111: 1, A112: 6 };
  const target = { ...map.worker, x: map.worker.x + 200, id: 901, templateId: "H031", pending: null, radius: 72, hero: newHero("H031") };
  target.hero.natural = { STR: 1, AGI: 1, INT: 20 };
  run.structures = [source, target];

  function advance(state, atUs) {
    state.clock.targetUs = atUs;
    while (drain(state, 1000) === "pending") {}
  }
  const cast = (id, skillId, targetId) => {
    assert.ok(enqueue(run, { id, matchId: run.matchId, action: { type: "cast-hero", towerId: source.id, skillId, targetId } }));
    advance(run, run.queue.nowUs + 1);
    assert.equal(run.commandResults[id].ok, true);
  };
  cast("link", "A111", target.id);
  advance(run, 400_001);
  cast("overcharge", "A112");
  advance(run, 1_300_001);
  assert.deepEqual(source.wispLink.boost, { stat: "INT", amount: 1610 });
  assert.equal(run.seasons.spring.counts[2], undefined);
  assert.equal(run.seasons.spring.points, 180);
  const saved = JSON.parse(JSON.stringify(run));
  for (const state of [run, saved]) {
    state.structures[0].hero.natural.INT = 2400;
    advance(state, 2_300_001);
    assert.equal(state.seasons.spring.counts[2], 1680);
    assert.equal(state.seasons.spring.points, 200);
    assert.equal(state.seasonScore, 200);
    state.structures[0].hero.natural.INT = 2600;
    advance(state, 3_300_001);
    assert.equal(state.seasons.spring.counts[2], 1680);
    assert.equal(state.seasonScore, 200);
  }
  assert.deepEqual(saved, run);
});
